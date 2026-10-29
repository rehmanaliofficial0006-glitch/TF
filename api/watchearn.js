// Vercel adapter: runs the same code as netlify/functions/watchearn.js
const { handler } = require('../netlify/functions/watchearn.js');
module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, headers: req.headers, body });
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(r.statusCode).send(r.body);
};
