'use strict';
// Serveur HTTP : API JSON (/api/...) + fichiers de l'interface web.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { init } = require('./db');
const { createRouter, readToken, HttpError } = require('./lib');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const ROLE_LEVEL = { caissier: 1, gerant: 2, admin: 3 };

function createApp({ dbFile, webDir }) {
  const db = init(dbFile);

  // Clé secrète pour signer les jetons, créée une seule fois et gardée en base.
  let secretRow = db.one("SELECT value FROM meta WHERE key='secret'");
  if (!secretRow) {
    db.run("INSERT INTO meta(key,value) VALUES('secret',?)", crypto.randomBytes(32).toString('hex'));
    secretRow = db.one("SELECT value FROM meta WHERE key='secret'");
  }
  const secret = process.env.APP_SECRET || secretRow.value;

  const router = createRouter();
  const ctxBase = { db, secret };

  // Contrôles d'accès utilisables dans les routes
  const auth = (minRole = 'caissier') => (ctx) => {
    const h = ctx.req.headers.authorization || '';
    const data = readToken(secret, h.startsWith('Bearer ') ? h.slice(7) : null);
    if (!data) throw new HttpError(401, 'Veuillez vous connecter');
    const user = db.one('SELECT id, company_id, name, email, role, warehouse_id, active FROM users WHERE id=?', data.uid);
    if (!user || !user.active) throw new HttpError(401, 'Compte désactivé ou introuvable');
    if ((ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL[minRole]) throw new HttpError(403, "Vous n'avez pas le droit de faire cette action");
    ctx.user = user;
    ctx.cid = user.company_id;
  };

  for (const mod of ['auth', 'admin', 'catalog', 'stock', 'sales', 'purchases', 'reports']) {
    require(`./routes/${mod}`)(router, { auth, db, secret });
  }

  async function readBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return {};
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 10 * 1024 * 1024) throw new HttpError(413, 'Données trop volumineuses');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'Données JSON invalides'); }
  }

  function send(res, status, data, headers = {}) {
    const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(body);
  }

  function serveStatic(req, res, pathname) {
    const root = path.resolve(webDir);
    let file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root)) return send(res, 403, { error: 'Interdit' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const ext = path.extname(file);
    const noCache = ext === '.html' || file.endsWith('sw.js');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    // Autoriser l'application mobile / bureau à appeler un serveur distant
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const found = router.match(req.method, pathname.slice(4));
    if (!found) return send(res, 404, { error: 'Route inconnue' });
    try {
      const ctx = {
        ...ctxBase, req, res, params: found.params,
        query: Object.fromEntries(url.searchParams), body: await readBody(req),
      };
      let result;
      for (const h of found.handlers) result = await h(ctx);
      if (ctx.sent) return;
      if (ctx.csv) return send(res, 200, '﻿' + ctx.csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ctx.filename || 'export.csv'}"`,
      });
      send(res, 200, result === undefined ? { ok: true } : result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      const msg = String(e && e.message || e);
      if (/UNIQUE constraint failed: users.email/.test(msg)) return send(res, 400, { error: 'Cet e-mail est déjà utilisé' });
      console.error(e);
      send(res, 500, { error: 'Erreur interne : ' + msg });
    }
  });

  return { server, db };
}

module.exports = { createApp };
