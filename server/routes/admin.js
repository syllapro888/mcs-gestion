'use strict';
const { fail, hashPassword, str, num } = require('../lib');

const ROLES = ['admin', 'gerant', 'caissier'];

module.exports = (r, { auth, db }) => {
  // ----- Entreprise -----
  r.get('/company', auth(), ({ cid }) => db.one('SELECT * FROM companies WHERE id=?', cid));

  r.put('/company', auth('admin'), ({ cid, body }) => {
    const name = str(body.name, 120);
    if (!name) fail(400, "Le nom de l'entreprise est obligatoire");
    db.run(`UPDATE companies SET name=?, currency=?, phone=?, email=?, address=?, tax_id=?, tax_rate=?,
            receipt_footer=?, allow_negative_stock=? WHERE id=?`,
      name, str(body.currency, 10) || 'FCFA', str(body.phone, 40), str(body.email, 160), str(body.address, 300),
      str(body.tax_id, 60), Math.max(0, num(body.tax_rate)), str(body.receipt_footer, 300),
      body.allow_negative_stock ? 1 : 0, cid);
    return db.one('SELECT * FROM companies WHERE id=?', cid);
  });

  // ----- Utilisateurs -----
  r.get('/users', auth('admin'), ({ cid }) => db.all(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.warehouse_id, w.name AS warehouse, u.created_at
     FROM users u LEFT JOIN warehouses w ON w.id = u.warehouse_id WHERE u.company_id=? ORDER BY u.name`, cid));

  r.post('/users', auth('admin'), ({ cid, body }) => {
    const name = str(body.name, 120), email = str(body.email, 160);
    if (!name || !email) fail(400, 'Nom et e-mail obligatoires');
    if (String(body.password || '').length < 6) fail(400, 'Mot de passe : 6 caractères minimum');
    const role = ROLES.includes(body.role) ? body.role : 'caissier';
    const res = db.run(`INSERT INTO users(company_id, name, email, password_hash, role, warehouse_id)
                        VALUES(?,?,?,?,?,?)`, cid, name, email, hashPassword(body.password), role, num(body.warehouse_id) || null);
    return { id: Number(res.lastInsertRowid) };
  });

  r.put('/users/:id', auth('admin'), ({ cid, params, body, user }) => {
    const u = db.one('SELECT * FROM users WHERE id=? AND company_id=?', params.id, cid);
    if (!u) fail(404, 'Utilisateur introuvable');
    const role = ROLES.includes(body.role) ? body.role : u.role;
    const active = body.active === undefined ? u.active : (body.active ? 1 : 0);
    if (u.id === user.id && (role !== 'admin' || !active)) fail(400, 'Vous ne pouvez pas retirer vos propres droits administrateur');
    db.run('UPDATE users SET name=?, email=?, role=?, active=?, warehouse_id=? WHERE id=?',
      str(body.name, 120) || u.name, str(body.email, 160) || u.email, role, active, num(body.warehouse_id) || null, u.id);
    if (body.password) {
      if (String(body.password).length < 6) fail(400, 'Mot de passe : 6 caractères minimum');
      db.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(body.password), u.id);
    }
  });

  // ----- Sauvegarde complète des données de l'entreprise (JSON) -----
  r.get('/backup', auth('admin'), (ctx) => {
    const cid = ctx.cid;
    const tables = ['companies', 'warehouses', 'categories', 'products', 'stock', 'stock_moves', 'customers', 'suppliers',
      'sales', 'payments', 'purchases', 'transfers', 'inventories', 'expenses'];
    const data = {};
    for (const t of tables) {
      data[t] = db.all(`SELECT * FROM ${t} WHERE ${t === 'companies' ? 'id' : 'company_id'}=?`, cid);
    }
    data.sale_items = db.all('SELECT i.* FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.company_id=?', cid);
    data.purchase_items = db.all('SELECT i.* FROM purchase_items i JOIN purchases p ON p.id=i.purchase_id WHERE p.company_id=?', cid);
    data.users = db.all('SELECT id, name, email, role, active FROM users WHERE company_id=?', cid);
    ctx.res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    ctx.res.end(JSON.stringify({ app: 'MCS Gestion', date: new Date().toISOString(), data }, null, 1));
    ctx.sent = true;
  });
};
