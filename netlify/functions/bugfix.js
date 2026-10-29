// Netlify adapter: runs the same code as api/bugfix.js (admin Bug Finder, needs ANTHROPIC_API_KEY)
const impl = require('../../api/bugfix.js');
exports.handler = async (event) => {
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const headers = {}; for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
  const req = { method: event.httpMethod, headers, body };
  const out = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status: (c) => { out.statusCode = c; return res; },
    json: (o) => { out.headers['Content-Type'] = 'application/json'; out.body = JSON.stringify(o); return res; }
  };
  await impl(req, res);
  return out;
};
