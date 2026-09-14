function obterSlugAtual() {
  const urlParams = new URLSearchParams(window.location.search);
  const slugParam = urlParams.get('loja');
  if (slugParam) {
    localStorage.setItem('saas_comercio_slug', slugParam.toLowerCase());
    return slugParam.toLowerCase();
  }
  return localStorage.getItem('saas_comercio_slug') || 'demo';
}

const COMERCIO_SLUG = obterSlugAtual();

function obterDeviceId() {
  let devId = localStorage.getItem('saas_device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 12);
    localStorage.setItem('saas_device_id', devId);
  }
  return devId;
}

const MEU_DEVICE_ID = obterDeviceId();

function calcularCorTextoContraste(hex) {
  if (!hex) return '#ffffff';
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 150 ? '#0f172a' : '#ffffff';
}

async function inicializarTema() {
  try {
    const dados = await Api.getTenant(COMERCIO_SLUG);

    const corPrimaria = dados.cor_primaria || '#ffffff';
    const corTextoHeader = calcularCorTextoContraste(corPrimaria);
    const corSubtextoHeader = corTextoHeader === '#ffffff' ? 'rgba(255,255,255,0.8)' : '#475569';
    const bordaHeader = corTextoHeader === '#0f172a' ? '1px solid rgba(0,0,0,0.08)' : 'none';

    document.documentElement.style.setProperty('--cor-primaria', corPrimaria);
    document.documentElement.style.setProperty('--cor-secundaria', dados.cor_secundaria || '#ffffff');
    document.documentElement.style.setProperty('--cor-destaque', dados.cor_destaque || '#ea580c');
    document.documentElement.style.setProperty('--cor-texto-header', corTextoHeader);
    document.documentElement.style.setProperty('--cor-subtexto-header', corSubtextoHeader);
    document.documentElement.style.setProperty('--borda-header', bordaHeader);

    document.querySelectorAll('.dinamico-nome').forEach(el => el.innerText = dados.nome_fantasia);
    document.querySelectorAll('.dinamico-logo').forEach(el => {
      if (dados.logo_url) {
        el.src = dados.logo_url;
        el.alt = dados.nome_fantasia;
        el.style.display = 'block';
      }
    });

    document.title = dados.nome_fantasia;

    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.includes('loja=')) {
        const joiner = href.includes('?') ? '&' : '?';
        link.setAttribute('href', `${href}${joiner}loja=${COMERCIO_SLUG}`);
      }
    });

    gerarManifestDinamico(dados);
    return dados;
  } catch (err) {
    console.warn("Aviso ao carregar tema:", err.message);
  }
}

function gerarManifestDinamico(dados) {
  const manifestData = {
    name: dados.nome_fantasia,
    short_name: dados.nome_fantasia,
    start_url: `./app.html?loja=${dados.slug}`,
    display: "standalone",
    background_color: dados.cor_primaria || "#ffffff",
    theme_color: dados.cor_primaria || "#ffffff",
    icons: [
      {
        src: dados.icone_pwa_url || dados.logo_url || "https://cdn-icons-png.flaticon.com/512/924/924514.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      }
    ]
  };

  const stringBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/json' });
  const manifestUrl = URL.createObjectURL(stringBlob);

  let manifestLink = document.querySelector('link[rel="manifest"]');
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  manifestLink.href = manifestUrl;
}

// Suporte nativo a transparência alfa
function comprimirImagemParaBase64(file, maxDimensao = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxDimensao) {
            height = Math.round((height * maxDimensao) / width);
            width = maxDimensao;
          }
        } else {
          if (height > maxDimensao) {
            width = Math.round((width * maxDimensao) / height);
            height = maxDimensao;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Limpa o canvas para garantir transparência absoluta
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Formato PNG para reter transparência total
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}