const http = require('http');

function req(method, host, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (cookie) headers.Cookie = cookie;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = http.request(
      { hostname: '127.0.0.1', port: process.env.PORT || 3000, path, method, headers },
      (res) => {
        let data = '';
        const cookies = [].concat(res.headers['set-cookie'] || []);
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data, cookies, location: res.headers.location }));
      },
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  // Next listens on container IP not loopback — use HOSTNAME or 0.0.0.0 bind address
  const os = require('os');
  const nets = os.networkInterfaces();
  let ip = '127.0.0.1';
  for (const addrs of Object.values(nets)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) ip = a.address;
    }
  }
  console.log('using ip', ip, 'client', process.env.KEYCLOAK_CLIENT_ID);

  function req2(method, path, body, cookie) {
    return new Promise((resolve, reject) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      if (body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      const r = http.request(
        { hostname: ip, port: 3000, path, method, headers },
        (res) => {
          let data = '';
          const cookies = [].concat(res.headers['set-cookie'] || []);
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode, data, cookies, location: res.headers.location }));
        },
      );
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }

  const csrf = await req2('GET', '/api/auth/csrf');
  const token = JSON.parse(csrf.data).csrfToken;
  const cookie = csrf.cookies.map((c) => c.split(';')[0]).join('; ');
  console.log('csrf ok', token.slice(0, 8), 'cookie', cookie.slice(0, 40));
  const signin = await req2(
    'POST',
    '/api/auth/signin/keycloak',
    `csrfToken=${encodeURIComponent(token)}&callbackUrl=%2F&json=true`,
    cookie,
  );
  console.log('signin', signin.status, signin.data);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
