'use strict';
const { fail, str, num, nextNumber } = require('../lib');
const { moveStock, stockOf } = require('../stock');

const allowNeg = (db, cid) => !!db.one('SELECT allow_negative_stock a FROM companies WHERE id=?', cid).a;

module.exports = (r, { auth, db }) => {
  // Historique des mouvements
  r.get('/stock/moves', auth('gerant'), ({ cid, query }) => {
    const where = ['m.company_id=?']; const args = [cid];
    if (num(query.warehouse_id)) { where.push('m.warehouse_id=?'); args.push(num(query.warehouse_id)); }
    if (num(query.product_id)) { where.push('m.product_id=?'); args.push(num(query.product_id)); }
    if (query.type) { where.push('m.type=?'); args.push(query.type); }
    if (query.from) { where.push('date(m.created_at)>=?'); args.push(query.from); }
    if (query.to) { where.push('date(m.created_at)<=?'); args.push(query.to); }
    if (query.q) { where.push('(p.name LIKE ? OR m.ref LIKE ?)'); args.push(`%${query.q}%`, `%${query.q}%`); }
    return db.all(`SELECT m.*, p.name AS product, p.unit, w.name AS warehouse, u.name AS user
      FROM stock_moves m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id
      LEFT JOIN users u ON u.id=m.user_id WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 500`, ...args);
  });

  // Entrée ou sortie manuelle (réception sans fournisseur, casse, perte, usage interne…)
  r.post('/stock/adjust', auth('gerant'), ({ cid, body, user }) => db.tx(() => {
    const wh = num(body.warehouse_id); if (!wh) fail(400, 'Choisissez un dépôt');
    const type = body.type === 'sortie' ? 'sortie' : 'entree';
    const items = (body.items || []).filter((i) => num(i.qty) > 0);
    if (!items.length) fail(400, 'Ajoutez au moins un produit avec une quantité');
    const ref = nextNumber(db, cid, 'adjust', type === 'entree' ? 'ENT' : 'SOR');
    for (const it of items) {
      moveStock(db, { companyId: cid, productId: num(it.product_id), warehouseId: wh, qty: type === 'entree' ? num(it.qty) : -num(it.qty),
        type, ref, note: str(body.note), userId: user.id, allowNegative: allowNeg(db, cid) });
    }
    return { ref };
  }));

  // ---------- Transferts entre dépôts ----------
  r.get('/transfers', auth('gerant'), ({ cid }) => db.all(`
    SELECT t.*, a.name AS from_name, b.name AS to_name, u.name AS user,
      (SELECT COUNT(*) FROM transfer_items i WHERE i.transfer_id=t.id) AS lines,
      (SELECT COALESCE(SUM(qty),0) FROM transfer_items i WHERE i.transfer_id=t.id) AS qty
    FROM transfers t JOIN warehouses a ON a.id=t.from_warehouse_id JOIN warehouses b ON b.id=t.to_warehouse_id
    LEFT JOIN users u ON u.id=t.user_id WHERE t.company_id=? ORDER BY t.id DESC LIMIT 300`, cid));

  r.get('/transfers/:id', auth('gerant'), ({ cid, params }) => {
    const t = db.one(`SELECT t.*, a.name AS from_name, b.name AS to_name, u.name AS user FROM transfers t
      JOIN warehouses a ON a.id=t.from_warehouse_id JOIN warehouses b ON b.id=t.to_warehouse_id
      LEFT JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.company_id=?`, params.id, cid);
    if (!t) fail(404, 'Transfert introuvable');
    t.items = db.all('SELECT * FROM transfer_items WHERE transfer_id=?', t.id);
    return t;
  });

  r.post('/transfers', auth('gerant'), ({ cid, body, user }) => db.tx(() => {
    const from = num(body.from_warehouse_id), to = num(body.to_warehouse_id);
    if (!from || !to) fail(400, 'Choisissez le dépôt de départ et le dépôt d\'arrivée');
    if (from === to) fail(400, 'Les deux dépôts doivent être différents');
    const items = (body.items || []).filter((i) => num(i.qty) > 0);
    if (!items.length) fail(400, 'Ajoutez au moins un produit');
    const number = nextNumber(db, cid, 'transfer', 'TRF');
    const id = Number(db.run('INSERT INTO transfers(company_id,number,from_warehouse_id,to_warehouse_id,user_id,note) VALUES(?,?,?,?,?,?)',
      cid, number, from, to, user.id, str(body.note)).lastInsertRowid);
    for (const it of items) {
      const p = db.one('SELECT id, name FROM products WHERE id=? AND company_id=?', num(it.product_id), cid);
      if (!p) fail(404, 'Produit introuvable');
      const qty = num(it.qty);
      moveStock(db, { companyId: cid, productId: p.id, warehouseId: from, qty: -qty, type: 'transfert_sortie', ref: number, userId: user.id, allowNegative: allowNeg(db, cid) });
      moveStock(db, { companyId: cid, productId: p.id, warehouseId: to, qty, type: 'transfert_entree', ref: number, userId: user.id });
      db.run('INSERT INTO transfer_items(transfer_id,product_id,name,qty) VALUES(?,?,?,?)', id, p.id, p.name, qty);
    }
    return { id, number };
  }));

  // ---------- Inventaires physiques ----------
  r.get('/inventories', auth('gerant'), ({ cid }) => db.all(`
    SELECT i.*, w.name AS warehouse, u.name AS user,
      (SELECT COUNT(*) FROM inventory_lines l WHERE l.inventory_id=i.id) AS lines,
      (SELECT COUNT(*) FROM inventory_lines l WHERE l.inventory_id=i.id AND l.counted IS NOT NULL) AS counted
    FROM inventories i JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN users u ON u.id=i.user_id
    WHERE i.company_id=? ORDER BY i.id DESC`, cid));

  r.post('/inventories', auth('gerant'), ({ cid, body, user }) => db.tx(() => {
    const wh = num(body.warehouse_id);
    if (!db.one('SELECT id FROM warehouses WHERE id=? AND company_id=?', wh, cid)) fail(400, 'Choisissez un dépôt');
    const number = nextNumber(db, cid, 'inventory', 'INV');
    const id = Number(db.run('INSERT INTO inventories(company_id,number,warehouse_id,user_id,note) VALUES(?,?,?,?,?)',
      cid, number, wh, user.id, str(body.note)).lastInsertRowid);
    const args = [wh, cid];
    let filter = '';
    if (num(body.category_id)) { filter = 'AND p.category_id=?'; args.push(num(body.category_id)); }
    const products = db.all(`SELECT p.id, COALESCE(s.qty,0) qty FROM products p
      LEFT JOIN stock s ON s.product_id=p.id AND s.warehouse_id=?
      WHERE p.company_id=? AND p.active=1 AND p.track_stock=1 ${filter} ORDER BY p.name`, ...args);
    for (const p of products) db.run('INSERT INTO inventory_lines(inventory_id,product_id,expected) VALUES(?,?,?)', id, p.id, p.qty);
    return { id, number };
  }));

  const getInventory = (cid, id) => {
    const inv = db.one(`SELECT i.*, w.name AS warehouse, u.name AS user FROM inventories i
      JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN users u ON u.id=i.user_id WHERE i.id=? AND i.company_id=?`, id, cid);
    if (!inv) fail(404, 'Inventaire introuvable');
    return inv;
  };

  r.get('/inventories/:id', auth('gerant'), ({ cid, params }) => {
    const inv = getInventory(cid, params.id);
    inv.lines = db.all(`SELECT l.*, p.name, p.sku, p.barcode, p.unit, p.cost, c.name AS category FROM inventory_lines l
      JOIN products p ON p.id=l.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE l.inventory_id=? ORDER BY p.name`, inv.id);
    return inv;
  });

  r.put('/inventories/:id/lines', auth('gerant'), ({ cid, params, body }) => db.tx(() => {
    const inv = getInventory(cid, params.id);
    if (inv.status !== 'brouillon') fail(400, 'Cet inventaire est déjà validé');
    for (const l of body.lines || []) {
      const counted = l.counted === '' || l.counted === null || l.counted === undefined ? null : num(l.counted);
      db.run('UPDATE inventory_lines SET counted=? WHERE id=? AND inventory_id=?', counted, num(l.id), inv.id);
    }
  }));

  r.post('/inventories/:id/validate', auth('gerant'), ({ cid, params, user }) => db.tx(() => {
    const inv = getInventory(cid, params.id);
    if (inv.status !== 'brouillon') fail(400, 'Cet inventaire est déjà validé');
    const lines = db.all('SELECT * FROM inventory_lines WHERE inventory_id=? AND counted IS NOT NULL', inv.id);
    if (!lines.length) fail(400, 'Saisissez au moins une quantité comptée');
    let changed = 0;
    for (const l of lines) {
      const diff = l.counted - stockOf(db, l.product_id, inv.warehouse_id);
      if (Math.abs(diff) > 1e-9) {
        moveStock(db, { companyId: cid, productId: l.product_id, warehouseId: inv.warehouse_id, qty: diff,
          type: 'inventaire', ref: inv.number, userId: user.id, allowNegative: true });
        changed++;
      }
    }
    db.run("UPDATE inventories SET status='valide', validated_at=datetime('now','localtime') WHERE id=?", inv.id);
    return { changed };
  }));

  r.del('/inventories/:id', auth('gerant'), ({ cid, params }) => {
    const inv = getInventory(cid, params.id);
    if (inv.status !== 'brouillon') fail(400, 'Un inventaire validé ne peut pas être supprimé');
    db.run('DELETE FROM inventory_lines WHERE inventory_id=?', inv.id);
    db.run('DELETE FROM inventories WHERE id=?', inv.id);
  });
};
