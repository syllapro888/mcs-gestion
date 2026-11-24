'use strict';
const { fail, str, num, round, nextNumber } = require('../lib');
const { moveStock, stockOf } = require('../stock');

module.exports = (r, { auth, db }) => {
  const getPurchase = (cid, id) => {
    const p = db.one(`SELECT p.*, s.name AS supplier, w.name AS warehouse, u.name AS user FROM purchases p
      LEFT JOIN suppliers s ON s.id=p.supplier_id JOIN warehouses w ON w.id=p.warehouse_id
      LEFT JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.company_id=?`, id, cid);
    if (!p) fail(404, 'Achat introuvable');
    p.items = db.all('SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY id', p.id);
    return p;
  };

  r.get('/purchases', auth('gerant'), ({ cid, query }) => {
    const where = ['p.company_id=?']; const args = [cid];
    if (query.from) { where.push('date(p.created_at)>=?'); args.push(query.from); }
    if (query.to) { where.push('date(p.created_at)<=?'); args.push(query.to); }
    if (num(query.supplier_id)) { where.push('p.supplier_id=?'); args.push(num(query.supplier_id)); }
    if (query.q) { where.push('(p.number LIKE ? OR s.name LIKE ?)'); args.push(`%${query.q}%`, `%${query.q}%`); }
    return db.all(`SELECT p.id, p.number, p.total, p.paid, p.created_at, s.name AS supplier, w.name AS warehouse, u.name AS user,
        (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id=p.id) AS lines
      FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id JOIN warehouses w ON w.id=p.warehouse_id
      LEFT JOIN users u ON u.id=p.user_id WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 500`, ...args);
  });

  r.get('/purchases/:id', auth('gerant'), ({ cid, params }) => getPurchase(cid, params.id));

  // Réception d'un achat fournisseur : le stock entre dans le dépôt et le prix d'achat est mis à jour.
  r.post('/purchases', auth('gerant'), ({ cid, user, body }) => db.tx(() => {
    const wh = num(body.warehouse_id);
    if (!db.one('SELECT id FROM warehouses WHERE id=? AND company_id=?', wh, cid)) fail(400, 'Choisissez un dépôt');
    const supplierId = num(body.supplier_id) || null;
    if (supplierId && !db.one('SELECT id FROM suppliers WHERE id=? AND company_id=?', supplierId, cid)) fail(400, 'Fournisseur introuvable');
    const items = (body.items || []).filter((i) => num(i.qty) > 0);
    if (!items.length) fail(400, 'Ajoutez au moins un produit');
    const number = nextNumber(db, cid, 'purchase', 'A');
    const id = Number(db.run('INSERT INTO purchases(company_id,number,supplier_id,warehouse_id,user_id,note) VALUES(?,?,?,?,?,?)',
      cid, number, supplierId, wh, user.id, str(body.note)).lastInsertRowid);
    let total = 0;
    for (const it of items) {
      const p = db.one('SELECT * FROM products WHERE id=? AND company_id=?', num(it.product_id), cid);
      if (!p) fail(400, 'Produit introuvable');
      const qty = num(it.qty);
      const cost = it.cost === undefined || it.cost === '' ? p.cost : Math.max(0, num(it.cost));
      const lineTotal = round(qty * cost);
      total += lineTotal;
      // Coût moyen pondéré
      const before = Math.max(0, db.one('SELECT COALESCE(SUM(qty),0) q FROM stock WHERE product_id=?', p.id).q);
      const newCost = before + qty > 0 ? round((before * p.cost + qty * cost) / (before + qty)) : cost;
      if (body.update_cost !== false) db.run('UPDATE products SET cost=? WHERE id=?', newCost, p.id);
      db.run('INSERT INTO purchase_items(purchase_id,product_id,name,qty,cost,total) VALUES(?,?,?,?,?,?)', id, p.id, p.name, qty, cost, lineTotal);
      moveStock(db, { companyId: cid, productId: p.id, warehouseId: wh, qty, type: 'achat', ref: number, userId: user.id });
    }
    total = round(total);
    const paid = Math.min(total, Math.max(0, round(body.paid === undefined ? total : num(body.paid))));
    db.run('UPDATE purchases SET total=?, paid=? WHERE id=?', total, paid, id);
    return getPurchase(cid, id);
  }));

  r.post('/purchases/:id/payments', auth('gerant'), ({ cid, params, body }) => {
    const p = getPurchase(cid, params.id);
    const amount = Math.min(round(p.total - p.paid), round(num(body.amount)));
    if (amount <= 0) fail(400, 'Montant invalide ou achat déjà payé');
    db.run('UPDATE purchases SET paid=paid+? WHERE id=?', amount, p.id);
    return getPurchase(cid, p.id);
  });
};

module.exports.stockOf = stockOf;
