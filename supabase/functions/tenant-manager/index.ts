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

    // GET: Busca loja por slug ou user_id
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      const userId = url.searchParams.get('user_id');

      if (!slug && !userId) throw new Error("Identificador do estabelecimento ausente.");

      let query = supabase.from('comercios').select('*');
      if (slug) query = query.eq('slug', slug.toLowerCase());
      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;

      return new Response(JSON.stringify(data || { comercio: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // POST: Cria o app único para o usuário autenticado
    if (req.method === 'POST') {
      const { nome_fantasia, slug, cnpj, cor_primaria, cor_secundaria, cor_destaque, logo_base64, user_id } = await req.json();

      if (!nome_fantasia || !slug || !cnpj) throw new Error("Preencha todos os campos obrigatorios.");

      const slugNormalizado = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
      const cnpjLimpo = cnpj.replace(/\D/g, '');

      // Trava de segurança: impede que o mesmo usuário gere mais de 1 registro
      if (user_id) {
        const { data: existente } = await supabase.from('comercios').select('id').eq('user_id', user_id).maybeSingle();
        if (existente) throw new Error("Este usuario ja possui um comercio cadastrado.");
      }

      let logo_url = '';
      if (logo_base64 && logo_base64.startsWith('data:image')) {
        const base64Data = logo_base64.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `logos/${slugNormalizado}_${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage.from('public-uploads').upload(fileName, bytes, { contentType: 'image/png', upsert: true });
        if (!uploadError) {
          const { data: publicData } = supabase.storage.from('public-uploads').getPublicUrl(fileName);
          logo_url = publicData.publicUrl;
        }
      }

      const { data, error } = await supabase.from('comercios').insert([{
        nome_fantasia,
        slug: slugNormalizado,
        cnpj: cnpjLimpo,
        senha_admin: 'auth_managed',
        cor_primaria: cor_primaria || '#800000',
        cor_secundaria: cor_secundaria || '#ffffff',
        cor_destaque: cor_destaque || '#b91c1c',
        logo_url,
        icone_pwa_url: logo_url,
        user_id: user_id || null
      }]).select().single();

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ success: true, comercio: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PUT: Atualiza a loja existente do usuário sem duplicar e sem quebrar os clientes
    if (req.method === 'PUT') {
      const { id, user_id, nome_fantasia, cnpj, cor_primaria, cor_secundaria, cor_destaque, logo_base64 } = await req.json();

      let query = supabase.from('comercios').select('*');
      if (id) query = query.eq('id', id);
      else if (user_id) query = query.eq('user_id', user_id);
      else throw new Error("Identificacao do comercio ausente para atualizacao.");

      const { data: comercio, error: errBusca } = await query.single();
      if (errBusca || !comercio) throw new Error("Comercio nao encontrado.");

      let logo_url = comercio.logo_url;
      if (logo_base64 && logo_base64.startsWith('data:image')) {
        const base64Data = logo_base64.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `logos/${comercio.slug}_${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage.from('public-uploads').upload(fileName, bytes, { contentType: 'image/png', upsert: true });
        if (!uploadError) {
          const { data: publicData } = supabase.storage.from('public-uploads').getPublicUrl(fileName);
          logo_url = publicData.publicUrl;
        }
      }

      const { data: atualizado, error: errUpdate } = await supabase
        .from('comercios')
        .update({
          nome_fantasia: nome_fantasia || comercio.nome_fantasia,
          cnpj: cnpj ? cnpj.replace(/\D/g, '') : comercio.cnpj,
          cor_primaria: cor_primaria || comercio.cor_primaria,
          cor_secundaria: cor_secundaria || comercio.cor_secundaria,
          cor_destaque: cor_destaque || comercio.cor_destaque,
          logo_url,
          icone_pwa_url: logo_url
        })
        .eq('id', comercio.id)
        .select()
        .single();

      if (errUpdate) throw errUpdate;

      return new Response(JSON.stringify({ success: true, comercio: atualizado }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Metodo nao permitido', { status: 405, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});