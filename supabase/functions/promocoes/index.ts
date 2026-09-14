import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
    const ONESIGNAL_REST_KEY = Deno.env.get('ONESIGNAL_REST_KEY') ?? '';

    const url = new URL(req.url);

    // 1. LISTAR PROMOÇÕES
    if (req.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (!slug) throw new Error("Identificador da loja ausente.");

      const { data: comercio } = await supabase
        .from('comercios')
        .select('id')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Estabelecimento não encontrado.");

      const { data, error } = await supabase
        .from('promocoes')
        .select('*')
        .eq('comercio_id', comercio.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. CRIAR PROMOÇÃO E DISPARAR PUSH SEGMENTADO
    if (req.method === 'POST') {
      const { slug, senha, titulo, descricao, validade, imagem_base64, app_url } = await req.json();
      if (!slug || !senha || !titulo || !descricao || !validade) {
        throw new Error("Campos incompletos.");
      }

      const { data: comercio } = await supabase
        .from('comercios')
        .select('*')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio) throw new Error("Comércio não encontrado.");
      if (comercio.senha_admin !== senha) {
        return new Response(JSON.stringify({ error: 'Senha de administrador incorreta.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let imagem_url: string | null = null;
      if (imagem_base64 && imagem_base64.startsWith('data:image')) {
        const base64Data = imagem_base64.replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `promos/${slug}_${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('public-uploads')
          .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from('public-uploads')
          .getPublicUrl(fileName);
        imagem_url = publicData.publicUrl;
      }

      const { data, error } = await supabase
        .from('promocoes')
        .insert([{ comercio_id: comercio.id, titulo, descricao, validade, imagem_url }])
        .select()
        .single();

      if (error) throw error;

      // Web Push Segmentado: entrega apenas para aparelhos com tag do comércio
      if (ONESIGNAL_APP_ID && ONESIGNAL_REST_KEY) {
        const urlDestino = app_url || `https://caio-vb.github.io/?loja=${slug}`;
        const pushPayload: Record<string, unknown> = {
          app_id: ONESIGNAL_APP_ID,
          filters: [
            { field: "tag", key: "comercio_slug", relation: "=", value: slug.toLowerCase() }
          ],
          headings: { en: `🔥 ${titulo}`, pt: `🔥 ${titulo}` },
          contents: { en: `${descricao} (${validade})`, pt: `${descricao} (${validade})` },
          url: urlDestino
        };

        if (imagem_url) {
          pushPayload.big_picture = imagem_url;
          pushPayload.chrome_web_image = imagem_url;
        }

        await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": `Key ${ONESIGNAL_REST_KEY}`
          },
          body: JSON.stringify(pushPayload)
        });
      }

      return new Response(JSON.stringify({ success: true, promocao: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. EXCLUIR PROMOÇÃO
    if (req.method === 'DELETE') {
      const { id, senha, slug } = await req.json();

      const { data: comercio } = await supabase
        .from('comercios')
        .select('id, senha_admin')
        .eq('slug', slug.toLowerCase())
        .single();

      if (!comercio || comercio.senha_admin !== senha) {
        return new Response(JSON.stringify({ error: 'Senha incorreta.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabase
        .from('promocoes')
        .delete()
        .eq('id', id)
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