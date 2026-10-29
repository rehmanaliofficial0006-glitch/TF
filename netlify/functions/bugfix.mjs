// Modern Netlify runtime supplies AI Gateway credentials to the shared implementation.
import impl from '../../api/bugfix.js';
export default async (request) => {
  let body = {}; try { body = await request.json(); } catch (e) {}
  const headers = Object.fromEntries(request.headers);
  headers.host ||= new URL(request.url).host;
  const req = { method: request.method, headers, body };
  const out = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status: (c) => { out.statusCode = c; return res; },
    json: (o) => { out.headers['Content-Type'] = 'application/json'; out.body = JSON.stringify(o); return res; }
  };
  await impl(req, res);
  return new Response(out.body, { status: out.statusCode, headers: out.headers });
};
