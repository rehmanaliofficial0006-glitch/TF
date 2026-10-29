// Modern Netlify runtime supplies AI Gateway credentials to the shared implementation.
import impl from '../../api/bugfix.js';

export default async function handler(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const headers = Object.fromEntries(request.headers);
  headers.host ||= new URL(request.url).host;
  let status = 200;
  const responseHeaders = new Headers();
  let responseBody = '';
  const res = {
    setHeader(key, value) { responseHeaders.set(key, value); },
    status(code) { status = code; return res; },
    json(value) {
      responseHeaders.set('Content-Type', 'application/json');
      responseBody = JSON.stringify(value);
      return res;
    }
  };
  await impl({ method: request.method, headers, body }, res);
  return new Response(responseBody, { status, headers: responseHeaders });
}
