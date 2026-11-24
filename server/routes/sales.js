'use strict';
const { fail, str, num, round, nextNumber } = require('../lib');
const { moveStock } = require('../stock');

const METHODS = ['especes', 'mobile_money', 'carte', 'cheque', 'virement'];
const statusOf = (total, paid) => (paid >= total - 0.001 ? 'payee' : paid > 0 ? 'partielle' : 'credit');

module.exports = (r, { auth, db }) => {
  function getSale(cid, id) {
    const s = db.one(`SELECT s.*, c.name AS customer, c.phone AS customer_phone, w.name AS warehouse, u.name AS user
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN warehouses w ON w.id=s.warehouse_id
      LEFT JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.company_id=?`, id, cid);
    if (!s) fail(404, 'Vente introuvable');
    s.items = db.all('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id', s.id);
    s.payments = db.all('SELECT p.*, u.name AS user FROM payments p LEFT JOIN users u ON u.id=p.user_id WHERE sale_id=? ORDER BY p.id', s.id);
    return s;
  }

  r.get('/sales', auth(), ({ cid, user, query }) => {
    const where = ['s.company_id=?']; const args = [cid];
    if (user.role === 'caissier') { where.push('s.user_id=?'); args.push(user.id); }
    if (query.from) { where.push('date(s.created_at)>=?'); args.push(query.from); }
    if (query.to) { where.push('date(s.created_at)<=?'); args.push(query.to); }
    if (query.status) { where.push('s.status=?'); args.push(query.status); }
    if (num(query.warehouse_id)) { where.push('s.warehouse_id=?'); args.push(num(query.warehouse_id)); }
    if (num(query.customer_id)) { where.push('s.customer_id=?'); args.push(num(query.customer_id)); }
    if (query.q) { where.push('(s.number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); const q = `%${query.q}%`; args.push(q, q, q); }
    return db.all(`SELECT s.id, s.number, s.total, s.paid, s.status, s.payment_method, s.created_at,
        c.name AS customer, w.name AS warehouse, u.name AS user,
        (SELECT COALESCE(SUM(qty),0) FROM sale_items i WHERE i.sale_id=s.id) AS qty
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN warehouses w ON w.id=s.warehouse_id
      LEFT JOIN users u ON u.id=s.user_id WHERE ${where.join(' AND ')} ORDER BY s.id DESC LIMIT ${Math.min(num(query.limit, 500) || 500, 5000)}`, ...args);
  });

  r.get('/sales/:id', auth(), ({ cid, params }) => {
    const s = getSale(cid, params.id);
    s.company = db.one('SELECT name, phone, email, address, tax_id, currency, receipt_footer FROM companies WHERE id=?', cid);
    return s;
  });

  // Nouvelle vente (caisse)
  r.post('/sales', auth(), ({ cid, user, body }) => db.tx(() => {
    const company = db.one('SELECT * FROM companies WHERE id=?', cid);
    const wh = num(body.warehouse_id) || user.warehouse_id;
    if (!wh || !db.one('SELECT id FROM warehouses WHERE id=? AND company_id=? AND active=1', wh, cid)) fail(400, 'Choisissez un dépôt valide');
    const customerId = num(body.customer_id) || null;
    if (customerId && !db.one('SELECT id FROM customers WHERE id=? AND company_id=?', customerId, cid)) fail(400, 'Client introuvable');
    const items = (body.items || []).filter((i) => num(i.qty) > 0);
    if (!items.length) fail(400, 'Le panier est vide');

    const lines = items.map((it) => {
      const p = db.one('SELECT * FROM products WHERE id=? AND company_id=? AND active=1', num(it.product_id), cid);
      if (!p) fail(400, 'Un produit du panier est introuvable');
      const price = it.price === undefined || it.price === null || it.price === '' ? p.price : Math.max(0, num(it.price));
      const qty = num(it.qty);
      return { p, qty, price, total: round(qty * price) };
    });
    const subtotal = round(lines.reduce((a, l) => a + l.total, 0));
    const discount = Math.min(subtotal, Math.max(0, round(num(body.discount))));
    const tax = round((subtotal - discount) * (company.tax_rate || 0) / 100);
    const total = round(subtotal - discount + tax);
    const paid = Math.min(total, Math.max(0, round(body.paid === undefined ? total : num(body.paid))));
    if (paid < total - 0.001 && !customerId) fail(400, 'Pour une vente à crédit, choisissez un client');
    const method = METHODS.includes(body.payment_method) ? body.payment_method : 'especes';

    const number = nextNumber(db, cid, 'sale', 'V');
    const saleId = Number(db.run(`INSERT INTO sales(company_id,number,customer_id,warehouse_id,user_id,subtotal,discount,tax,total,paid,payment_method,status,note)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, cid, number, customerId, wh, user.id, subtotal, discount, tax, total, paid, method,
      statusOf(total, paid), str(body.note)).lastInsertRowid);

    for (const l of lines) {
      db.run('INSERT INTO sale_items(sale_id,product_id,name,qty,price,cost,total) VALUES(?,?,?,?,?,?,?)',
        saleId, l.p.id, l.p.name, l.qty, l.price, l.p.cost, l.total);
      moveStock(db, { companyId: cid, productId: l.p.id, warehouseId: wh, qty: -l.qty, type: 'vente', ref: number,
        userId: user.id, allowNegative: !!company.allow_negative_stock });
    }
    if (paid > 0) {
      db.run('INSERT INTO payments(company_id,sale_id,customer_id,amount,method,user_id) VALUES(?,?,?,?,?,?)',
        cid, saleId, customerId, paid, method, user.id);
    }
    return getSale(cid, saleId);
  }));

  // Encaisser un paiement sur une vente (crédit / acompte)
  r.post('/sales/:id/payments', auth(), ({ cid, user, params, body }) => db.tx(() => {
    const s = getSale(cid, params.id);
    if (s.status === 'annulee') fail(400, 'Cette vente est annulée');
    const due = round(s.total - s.paid);
    const amount = Math.min(due, round(num(body.amount)));
    if (amount <= 0) fail(400, due <= 0 ? 'Cette vente est déjà payée' : 'Montant invalide');
    const method = METHODS.includes(body.method) ? body.method : 'especes';
    db.run('INSERT INTO payments(company_id,sale_id,customer_id,amount,method,user_id) VALUES(?,?,?,?,?,?)',
      cid, s.id, s.customer_id, amount, method, user.id);
    const paid = round(s.paid + amount);
    db.run('UPDATE sales SET paid=?, status=? WHERE id=?', paid, statusOf(s.total, paid), s.id);
    return getSale(cid, s.id);
  }));

  // Paiement global d'un client : réparti sur ses ventes les plus anciennes
  r.post('/customers/:id/payments', auth(), ({ cid, user, params, body }) => db.tx(() => {
    const c = db.one('SELECT id FROM customers WHERE id=? AND company_id=?', params.id, cid);
    if (!c) fail(404, 'Client introuvable');
    let left = round(num(body.amount));
    if (left <= 0) fail(400, 'Montant invalide');
    const method = METHODS.includes(body.method) ? body.method : 'especes';
    const open = db.all("SELECT * FROM sales WHERE customer_id=? AND status IN ('credit','partielle') ORDER BY id", c.id);
    const totalDue = round(open.reduce((a, s) => a + s.total - s.paid, 0));
    if (totalDue <= 0) fail(400, "Ce client n'a pas de dette");
    if (left > totalDue + 0.001) fail(400, `Le montant dépasse la dette du client (${totalDue})`);
    for (const s of open) {
      if (left <= 0) break;
      const pay = Math.min(left, round(s.total - s.paid));
      db.run('INSERT INTO payments(company_id,sale_id,customer_id,amount,method,user_id) VALUES(?,?,?,?,?,?)', cid, s.id, c.id, pay, method, user.id);
      const paid = round(s.paid + pay);
      db.run('UPDATE sales SET paid=?, status=? WHERE id=?', paid, statusOf(s.total, paid), s.id);
      left = round(left - pay);
    }
  }));

  // Annuler une vente : le stock revient dans le dépôt
  r.post('/sales/:id/cancel', auth('gerant'), ({ cid, user, params, body }) => db.tx(() => {
    const s = getSale(cid, params.id);
    if (s.status === 'annulee') fail(400, 'Vente déjà annulée');
    for (const it of s.items) {
      moveStock(db, { companyId: cid, productId: it.product_id, warehouseId: s.warehouse_id, qty: it.qty,
        type: 'annulation', ref: s.number, note: str(body.reason), userId: user.id, allowNegative: true });
    }
    db.run("UPDATE sales SET status='annulee', note=COALESCE(note || ' — ','') || ? WHERE id=?",
      'Annulée' + (body.reason ? ' : ' + str(body.reason) : ''), s.id);
    return getSale(cid, s.id);
  }));
};
