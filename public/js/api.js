const PROJECT_REF = "uskfiencjaqqlhglpuqt";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = "sb_publishable_31CDkXjDETBd12KK8yhW3w_hmyQZBqO"; // Cole sua chave anon real aqui
const BASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

let supabaseClient = null;
if (typeof supabase !== 'undefined') {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const Api = {
  // Auth
  async cadastrarUsuario(email, password) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async loginUsuario(email, password) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async recuperarSenha(email) {
    if (!supabaseClient) throw new Error("SDK de autenticação indisponível.");
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname.replace('login.html', 'login.html')}`
    });
    if (error) throw error;
    return data;
  },

  async obterSessao() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  async logout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  // Validação de slug disponível
  async verificarDisponibilidadeSlug(slug) {
    if (!slug) return false;
    const slugNormalizado = slug.toLowerCase().trim();
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comercios')
        .select('id')
        .eq('slug', slugNormalizado)
        .maybeSingle();

      if (error) {
        console.warn("Erro ao consultar slug:", error.message);
        return true;
      }
      return !data; // Retorna true se não existe ninguém usando
    }
    return true;
  },

  // Tenant
  async getTenant(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager?slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Estabelecimento não encontrado.");
    return data;
  },

  async getTenantPorUsuario(userId) {
    if (!userId) return null;
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('comercios')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn("Aviso ao buscar loja do usuário:", error.message);
        return null;
      }
      return data;
    }
    return null;
  },

  async cadastrarTenant(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao cadastrar estabelecimento.");
    return data;
  },

  async atualizarTenant(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/tenant-manager`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao atualizar dados.");
    return data;
  },

  // Promoções
  async listarPromocoes(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes?slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar promoções.");
    return data;
  },

  async criarPromocao(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao criar promoção.");
    return data;
  },

  async deletarPromocao(slug, senha, id) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/promocoes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, senha, id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao excluir promoção.");
    return data;
  },

  // Fidelidade
  async obterPontos(slug, deviceId) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade?acao=pontos&slug=${slug}&device_id=${deviceId}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar pontos.");
    return data;
  },

  async listarPremios(slug) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade?acao=premios&slug=${slug}&t=${Date.now()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao carregar catálogo de prêmios.");
    return data;
  },

  async criarPremio(payload) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "criar_premio", ...payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao criar prêmio.");
    return data;
  },

  async deletarPremio(slug, senha, id) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, senha, id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao deletar prêmio.");
    return data;
  },

  async processarNotaFiscal(slug, deviceId, urlNota) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "processar_nota", slug, device_id: deviceId, url_nota: urlNota })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao validar cupom fiscal.");
    return data;
  },

  async resgatarPremio(slug, deviceId, premioId) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "resgatar", slug, device_id: deviceId, premio_id: premioId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao resgatar item.");
    return data;
  },

  async vincularCpf(slug, deviceId, cpf) {
    const res = await fetch(`${BASE_FUNCTIONS_URL}/fidelidade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "vincular_cpf", slug, device_id: deviceId, cpf })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao vincular CPF.");
    return data;
  }
};