import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const method = req.method;

    // GET: LISTAR DADOS ISOLADOS
    if (method === 'GET') {
      const acao = url.searchParams.get('acao');
      const slug = url.searchParams.get('slug');
      if (!slug) throw new Error("Slug é obrigatório.");

      const { data: comercio } = await supabase
        .from('comercios')
        .select('id')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Comércio não encontrado.");

      if (acao === 'premios') {
        const { data, error } = await supabase
          .from('premios')
          .select('*')
          .eq('comercio_id', comercio.id)
          .order('pontos', { ascending: true });

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (acao === 'pontos') {
        const device_id = url.searchParams.get('device_id');
        if (!device_id) throw new Error("Device ID ausente.");

        let { data, error } = await supabase
          .from('usuarios_fidelidade')
          .select('pontos, cpf')
          .eq('device_id', device_id)
          .eq('comercio_id', comercio.id)
          .single();

        if (error || !data) {
          await supabase.from('usuarios_fidelidade').insert({
            device_id,
            comercio_id: comercio.id,
            pontos: 0
          });
          data = { pontos: 0, cpf: null };
        } else if (data.cpf) {
          const { data: userCpf } = await supabase
            .from('usuarios_fidelidade')
            .select('pontos')
            .eq('cpf', data.cpf)
            .eq('comercio_id', comercio.id)
            .limit(1)
            .single();
          if (userCpf) data.pontos = userCpf.pontos;
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // POST: TRANSAÇÕES E GESTÃO
    if (method === 'POST') {
      const body = await req.json();
      const slug = body.slug;
      if (!slug) throw new Error("Slug é obrigatório.");

      const { data: comercio } = await supabase
        .from('comercios')
        .select('*')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Comércio não encontrado.");

      // CRIAR PRÊMIO
      if (body.acao === 'criar_premio') {
        if (body.senha !== comercio.senha_admin) throw new Error("Senha incorreta.");

        let imagem_url = 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=150&q=80';
        if (body.imagem_base64 && body.imagem_base64.startsWith('data:image')) {
          const base64Data = body.imagem_base64.replace(/^data:image\/\w+;base64,/, '');
          const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          const fileName = `premios/${slug}_${Date.now()}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from('public-uploads')
            .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });

          if (!uploadError) {
            const { data: publicData } = supabase.storage.from('public-uploads').getPublicUrl(fileName);
            imagem_url = publicData.publicUrl;
          }
        }

        const { data, error } = await supabase.from('premios').insert([{
          comercio_id: comercio.id,
          titulo: body.titulo,
          pontos: body.pontos,
          imagem_url
        }]).select();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, premioGerado: data[0] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // PROCESSAR LEITURA DE NOTA FISCAL (QR CODE)
      if (body.acao === 'processar_nota') {
        const url_nota = body.url_nota;
        const matchKey = url_nota.match(/\d{44}/);
        if (!matchKey) throw new Error("QR Code inválido: Não é uma nota fiscal reconhecida.");
        const chave_nota = matchKey[0];

        // Valida se o CNPJ embutido na chave pertence ao comércio correto
        const cnpj_nota = chave_nota.substring(6, 20);
        if (cnpj_nota !== comercio.cnpj) {
          throw new Error("Ops! Esta nota fiscal não pertence a este estabelecimento.");
        }

        // Validação anti-fraude: já foi lida neste estabelecimento?
        const { data: notaExistente } = await supabase
          .from('notas_lidas')
          .select('chave_nota')
          .eq('chave_nota', chave_nota)
          .eq('comercio_id', comercio.id)
          .single();

        if (notaExistente) throw new Error("Você já resgatou os pontos dessa nota fiscal!");

        const pontosGanhos = 100;
        await supabase.from('notas_lidas').insert({
          chave_nota,
          comercio_id: comercio.id,
          device_id: body.device_id
        });

        const { data: user } = await supabase
          .from('usuarios_fidelidade')
          .select('pontos, cpf')
          .eq('device_id', body.device_id)
          .eq('comercio_id', comercio.id)
          .single();

        const novosPontos = (user?.pontos || 0) + pontosGanhos;

        if (user?.cpf) {
          await supabase
            .from('usuarios_fidelidade')
            .update({ pontos: novosPontos })
            .eq('cpf', user.cpf)
            .eq('comercio_id', comercio.id);
        } else {
          await supabase
            .from('usuarios_fidelidade')
            .update({ pontos: novosPontos })
            .eq('device_id', body.device_id)
            .eq('comercio_id', comercio.id);
        }

        return new Response(JSON.stringify({ success: true, novosPontos, pontosGanhos }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // RESGATE DE PRÊMIOS
      if (body.acao === 'resgatar') {
        const { data: premio } = await supabase
          .from('premios')
          .select('pontos')
          .eq('id', body.premio_id)
          .eq('comercio_id', comercio.id)
          .single();

        const { data: user } = await supabase
          .from('usuarios_fidelidade')
          .select('pontos, cpf')
          .eq('device_id', body.device_id)
          .eq('comercio_id', comercio.id)
          .single();

        if (!user || user.pontos < premio.pontos) {
          throw new Error("Você não possui saldo de pontos suficiente.");
        }

        const saldoFinal = user.pontos - premio.pontos;

        if (user.cpf) {
          await supabase
            .from('usuarios_fidelidade')
            .update({ pontos: saldoFinal })
            .eq('cpf', user.cpf)
            .eq('comercio_id', comercio.id);
        } else {
          await supabase
            .from('usuarios_fidelidade')
            .update({ pontos: saldoFinal })
            .eq('device_id', body.device_id)
            .eq('comercio_id', comercio.id);
        }

        return new Response(JSON.stringify({ success: true, saldoFinal }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // VINCULAR CPF E CONSOLIDAR SALDO
      if (body.acao === 'vincular_cpf') {
        const cpfLimpo = body.cpf.replace(/\D/g, '');
        if (cpfLimpo.length !== 11) throw new Error("CPF inválido. Deve conter 11 dígitos.");

        const { data: userAtual } = await supabase
          .from('usuarios_fidelidade')
          .select('pontos')
          .eq('device_id', body.device_id)
          .eq('comercio_id', comercio.id)
          .single();

        const pontosAparelhoAtual = userAtual?.pontos || 0;

        const { data: cpfsExistentes } = await supabase
          .from('usuarios_fidelidade')
          .select('pontos')
          .eq('cpf', cpfLimpo)
          .eq('comercio_id', comercio.id);

        let saldoConsolidado = pontosAparelhoAtual;
        let recuperado = false;

        if (cpfsExistentes && cpfsExistentes.length > 0) {
          saldoConsolidado = (cpfsExistentes[0].pontos || 0) + pontosAparelhoAtual;
          recuperado = true;
        }

        await supabase
          .from('usuarios_fidelidade')
          .update({ cpf: cpfLimpo, pontos: saldoConsolidado })
          .eq('device_id', body.device_id)
          .eq('comercio_id', comercio.id);

        await supabase
          .from('usuarios_fidelidade')
          .update({ pontos: saldoConsolidado })
          .eq('cpf', cpfLimpo)
          .eq('comercio_id', comercio.id);

        return new Response(JSON.stringify({ success: true, pontos: saldoConsolidado, recuperado }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // EXCLUIR PRÊMIO
    if (method === 'DELETE') {
      const body = await req.json();
      const { data: comercio } = await supabase
        .from('comercios')
        .select('id, senha_admin')
        .eq('slug', body.slug.toLowerCase())
        .single();

      if (!comercio || comercio.senha_admin !== body.senha) throw new Error("Senha incorreta.");

      const { error } = await supabase
        .from('premios')
        .delete()
        .eq('id', body.id)
        .eq('comercio_id', comercio.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Método não permitido', { status: 405, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});