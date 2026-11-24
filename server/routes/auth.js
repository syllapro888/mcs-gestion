'use strict';
const { fail, hashPassword, checkPassword, makeToken, str } = require('../lib');

function createCompany(db, { company, name, email, password, phone }) {
  return db.tx(() => {
    const c = db.run('INSERT INTO companies(name, phone) VALUES(?,?)', company, phone || null);
    const cid = Number(c.lastInsertRowid);
    const w = db.run("INSERT INTO warehouses(company_id, name) VALUES(?, 'Dépôt principal')", cid);
    db.run("INSERT INTO categories(company_id, name) VALUES(?, 'Général')", cid);
    const u = db.run(`INSERT INTO users(company_id, name, email, password_hash, role, warehouse_id)
                      VALUES(?,?,?,?, 'admin', ?)`, cid, name, email, hashPassword(password), Number(w.lastInsertRowid));
    return { cid, uid: Number(u.lastInsertRowid) };
  });
}

function profile(db, uid) {
  const user = db.one('SELECT id, company_id, name, email, role, warehouse_id FROM users WHERE id=?', uid);
  const company = db.one('SELECT * FROM companies WHERE id=?', user.company_id);
  return { user, company };
}

module.exports = (r, { auth, db, secret }) => {
  r.get('/health', () => ({ ok: true, app: 'MCS Gestion', time: new Date().toISOString() }));

  r.get('/auth/status', () => ({
    signup: process.env.ALLOW_SIGNUP !== 'false',
    hasCompanies: !!db.one('SELECT id FROM companies LIMIT 1'),
  }));

  // Inscription : crée l'entreprise, son administrateur et un premier dépôt.
  r.post('/auth/register', ({ body }) => {
    const hasAny = !!db.one('SELECT id FROM companies LIMIT 1');
    if (hasAny && process.env.ALLOW_SIGNUP === 'false') fail(403, 'Les inscriptions sont fermées');
    const company = str(body.company, 120), name = str(body.name, 120), email = str(body.email, 160);
    const password = String(body.password || '');
    if (!company || !name || !email) fail(400, "Nom de l'entreprise, votre nom et e-mail sont obligatoires");
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'E-mail invalide');
    if (password.length < 6) fail(400, 'Le mot de passe doit contenir au moins 6 caractères');
    if (db.one('SELECT id FROM users WHERE email=?', email)) fail(400, 'Cet e-mail est déjà utilisé');
    const { uid } = createCompany(db, { company, name, email, password, phone: str(body.phone, 40) });
    return { token: makeToken(secret, { uid }), ...profile(db, uid) };
  });

  r.post('/auth/login', ({ body }) => {
    const email = str(body.email, 160);
    const user = email && db.one('SELECT * FROM users WHERE email=?', email);
    if (!user || !checkPassword(body.password || '', user.password_hash)) fail(401, 'E-mail ou mot de passe incorrect');
    if (!user.active) fail(403, 'Ce compte est désactivé');
    return { token: makeToken(secret, { uid: user.id }), ...profile(db, user.id) };
  });

  r.get('/auth/me', auth(), ({ user }) => profile(db, user.id));

  r.post('/auth/password', auth(), ({ user, body }) => {
    const row = db.one('SELECT password_hash FROM users WHERE id=?', user.id);
    if (!checkPassword(body.current || '', row.password_hash)) fail(400, 'Mot de passe actuel incorrect');
    if (String(body.password || '').length < 6) fail(400, 'Le nouveau mot de passe doit contenir au moins 6 caractères');
    db.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(body.password), user.id);
  });
};

module.exports.createCompany = createCompany;
