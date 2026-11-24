'use strict';
const { fail, str, num } = require('../lib');
const { moveStock } = require('../stock');

const toCsv = (rows, cols) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => c[1]).join(';'), ...rows.map((r) => cols.map((c) => esc(r[c[0]])).join(';'))].join('\n');
};

module.exports = (r, { auth, db }) => {
  // ---------- Catégories ----------
  r.get('/categories', auth(), ({ cid }) => db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS products
     FROM categories c WHERE company_id=? ORDER BY name`, cid));
  r.post('/categories', auth('gerant'), ({ cid, body }) => {
    const name = str(body.name, 80); if (!name) fail(400, 'Nom obligatoire');
    return { id: Number(db.run('INSERT INTO categories(company_id,name) VALUES(?,?)', cid, name).lastInsertRowid) };
  });
  r.put('/categories/:id', auth('gerant'), ({ cid, params, body }) => {
    const name = str(body.name, 80); if (!name) fail(400, 'Nom obligatoire');
    db.run('UPDATE categories SET name=? WHERE id=? AND company_id=?', name, params.id, cid);
  });
  r.del('/categories/:id', auth('gerant'), ({ cid, params }) => {
    db.run('UPDATE products SET category_id=NULL WHERE category_id=? AND company_id=?', params.id, cid);
    db.run('DELETE FROM categories WHERE id=? AND company_id=?', params.id, cid);
  });

  // ---------- Dépôts ----------
  r.get('/warehouses', auth(), ({ cid, query }) => db.all(
    `SELECT w.*,
       (SELECT COUNT(*) FROM stock s WHERE s.warehouse_id=w.id AND s.qty>0) AS products,
       (SELECT COALESCE(SUM(s.qty * p.cost),0) FROM stock s JOIN products p ON p.id=s.product_id WHERE s.warehouse_id=w.id AND s.qty>0) AS value
     FROM warehouses w WHERE company_id=? ${query.all ? '' : 'AND active=1'} ORDER BY w.id`, cid));
  r.post('/warehouses', auth('gerant'), ({ cid, body }) => {
    const name = str(body.name, 80); if (!name) fail(400, 'Nom obligatoire');
    return { id: Number(db.run('INSERT INTO warehouses(company_id,name,address) VALUES(?,?,?)', cid, name, str(body.address)).lastInsertRowid) };
  });
  r.put('/warehouses/:id', auth('gerant'), ({ cid, params, body }) => {
    const name = str(body.name, 80); if (!name) fail(400, 'Nom obligatoire');
    if (body.active === false) {
      const left = db.one('SELECT COUNT(*) n FROM warehouses WHERE company_id=? AND active=1 AND id<>?', cid, params.id).n;
      if (!left) fail(400, 'Il faut garder au moins un dépôt actif');
    }
    db.run('UPDATE warehouses SET name=?, address=?, active=? WHERE id=? AND company_id=?',
      name, str(body.address), body.active === false ? 0 : 1, params.id, cid);
  });

  // ---------- Produits ----------
  const productSelect = (whFilter) => `
    SELECT p.*, c.name AS category,
      COALESCE((SELECT SUM(qty) FROM stock s WHERE s.product_id=p.id ${whFilter ? 'AND s.warehouse_id=?' : ''}),0) AS stock
    FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

  function listProducts(cid, query) {
    const where = ['p.company_id=?'];
    const args = [];
    const wh = num(query.warehouse_id) || null;
    if (wh) args.push(wh);
    args.push(cid);
    if (query.inactive !== '1') where.push('p.active=1');
    if (query.q) {
      where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
      const q = `%${query.q}%`; args.push(q, q, q);
    }
    if (num(query.category_id)) { where.push('p.category_id=?'); args.push(num(query.category_id)); }
    let sql = `${productSelect(wh)} WHERE ${where.join(' AND ')}`;
    if (query.low === '1') sql = `SELECT * FROM (${sql}) WHERE track_stock=1 AND stock <= min_stock`;
    sql += ' ORDER BY name LIMIT ' + Math.min(num(query.limit, 1000) || 1000, 5000);
    return db.all(sql, ...args);
  }

  r.get('/products', auth(), ({ cid, query }) => listProducts(cid, query));

  r.get('/products/export', auth('gerant'), (ctx) => {
    const rows = listProducts(ctx.cid, { ...ctx.query, limit: 5000 });
    ctx.csv = toCsv(rows, [['name', 'Nom'], ['sku', 'Référence'], ['barcode', 'Code-barres'], ['category', 'Catégorie'],
      ['unit', 'Unité'], ['price', 'Prix de vente'], ['cost', "Prix d'achat"], ['min_stock', 'Stock minimum'], ['stock', 'Stock']]);
    ctx.filename = 'produits.csv';
  });

  r.get('/products/barcode/:code', auth(), ({ cid, params }) => {
    const p = db.one(`${productSelect(false)} WHERE p.company_id=? AND p.active=1 AND (p.barcode=? OR p.sku=?)`, cid, params.code, params.code);
    if (!p) fail(404, 'Aucun produit avec ce code');
    return p;
  });

  r.get('/products/:id', auth(), ({ cid, params }) => {
    const p = db.one(`${productSelect(false)} WHERE p.id=? AND p.company_id=?`, params.id, cid);
    if (!p) fail(404, 'Produit introuvable');
    p.warehouses = db.all(`SELECT w.id, w.name, COALESCE(s.qty,0) AS qty FROM warehouses w
      LEFT JOIN stock s ON s.warehouse_id=w.id AND s.product_id=? WHERE w.company_id=? AND w.active=1 ORDER BY w.id`, p.id, cid);
    p.moves = db.all(`SELECT m.*, w.name AS warehouse, u.name AS user FROM stock_moves m
      JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN users u ON u.id=m.user_id
      WHERE m.product_id=? ORDER BY m.id DESC LIMIT 50`, p.id);
    p.sold = db.one(`SELECT COALESCE(SUM(i.qty),0) qty, COALESCE(SUM(i.total),0) amount FROM sale_items i
      JOIN sales s ON s.id=i.sale_id WHERE i.product_id=? AND s.status<>'annulee'`, p.id);
    return p;
  });

  function productFields(cid, body) {
    const name = str(body.name, 160);
    if (!name) fail(400, 'Le nom du produit est obligatoire');
    const barcode = str(body.barcode, 60);
    return [name, str(body.sku, 60), barcode, num(body.category_id) || null, str(body.unit, 20) || 'pièce',
      Math.max(0, num(body.price)), Math.max(0, num(body.cost)), Math.max(0, num(body.min_stock)),
      body.track_stock === false || body.track_stock === 0 ? 0 : 1];
  }

  function checkBarcode(cid, barcode, exceptId) {
    if (!barcode) return;
    const dup = db.one('SELECT id, name FROM products WHERE company_id=? AND barcode=? AND active=1 AND id<>?', cid, barcode, exceptId || 0);
    if (dup) fail(400, `Ce code-barres est déjà utilisé par « ${dup.name} »`);
  }

  r.post('/products', auth('gerant'), ({ cid, body, user }) => db.tx(() => {
    const f = productFields(cid, body);
    checkBarcode(cid, f[2]);
    const res = db.run(`INSERT INTO products(company_id,name,sku,barcode,category_id,unit,price,cost,min_stock,track_stock)
                        VALUES(?,?,?,?,?,?,?,?,?,?)`, cid, ...f);
    const id = Number(res.lastInsertRowid);
    const qty = num(body.initial_stock);
    if (qty > 0) {
      const wh = num(body.warehouse_id) || user.warehouse_id ||
        db.one('SELECT id FROM warehouses WHERE company_id=? AND active=1 ORDER BY id', cid).id;
      moveStock(db, { companyId: cid, productId: id, warehouseId: wh, qty, type: 'initial', note: 'Stock initial', userId: user.id });
    }
    return { id };
  }));

  r.put('/products/:id', auth('gerant'), ({ cid, params, body }) => {
    const f = productFields(cid, body);
    checkBarcode(cid, f[2], Number(params.id));
    const res = db.run(`UPDATE products SET name=?,sku=?,barcode=?,category_id=?,unit=?,price=?,cost=?,min_stock=?,track_stock=?,
                        active=? WHERE id=? AND company_id=?`, ...f, body.active === false ? 0 : 1, params.id, cid);
    if (!res.changes) fail(404, 'Produit introuvable');
  });

  r.del('/products/:id', auth('gerant'), ({ cid, params }) => {
    db.run('UPDATE products SET active=0 WHERE id=? AND company_id=?', params.id, cid);
  });

  // Import CSV (lignes déjà lues par l'interface)
  r.post('/products/import', auth('gerant'), ({ cid, body, user }) => db.tx(() => {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
    const wh = num(body.warehouse_id) || db.one('SELECT id FROM warehouses WHERE company_id=? AND active=1 ORDER BY id', cid).id;
    const cats = new Map(db.all('SELECT id, name FROM categories WHERE company_id=?', cid).map((c) => [c.name.toLowerCase(), c.id]));
    let created = 0, updated = 0;
    for (const row of rows) {
      const name = str(row.name, 160); if (!name) continue;
      let catId = null;
      const catName = str(row.category, 80);
      if (catName) {
        catId = cats.get(catName.toLowerCase());
        if (!catId) {
          catId = Number(db.run('INSERT INTO categories(company_id,name) VALUES(?,?)', cid, catName).lastInsertRowid);
          cats.set(catName.toLowerCase(), catId);
        }
      }
      const barcode = str(row.barcode, 60), sku = str(row.sku, 60);
      let existing = null;
      if (barcode) existing = db.one('SELECT id FROM products WHERE company_id=? AND barcode=? AND active=1', cid, barcode);
      if (!existing && sku) existing = db.one('SELECT id FROM products WHERE company_id=? AND sku=? AND active=1', cid, sku);
      if (!existing) existing = db.one('SELECT id FROM products WHERE company_id=? AND name=? AND active=1', cid, name);
      let id;
      if (existing) {
        id = existing.id;
        db.run(`UPDATE products SET name=?, sku=COALESCE(?,sku), barcode=COALESCE(?,barcode), category_id=COALESCE(?,category_id),
                price=?, cost=?, min_stock=? WHERE id=?`, name, sku, barcode, catId, num(row.price), num(row.cost), num(row.min_stock), id);
        updated++;
      } else {
        id = Number(db.run(`INSERT INTO products(company_id,name,sku,barcode,category_id,unit,price,cost,min_stock) VALUES(?,?,?,?,?,?,?,?,?)`,
          cid, name, sku, barcode, catId, str(row.unit, 20) || 'pièce', num(row.price), num(row.cost), num(row.min_stock)).lastInsertRowid);
        created++;
      }
      const qty = num(row.qty);
      if (qty > 0) moveStock(db, { companyId: cid, productId: id, warehouseId: wh, qty, type: 'entree', note: 'Import', userId: user.id });
    }
    return { created, updated };
  }));

  // ---------- Clients & fournisseurs ----------
  for (const [table, label] of [['customers', 'Client'], ['suppliers', 'Fournisseur']]) {
    const listSql = table === 'customers'
      ? `SELECT c.*,
           COALESCE((SELECT SUM(total - paid) FROM sales s WHERE s.customer_id=c.id AND s.status<>'annulee'),0) AS debt,
           COALESCE((SELECT SUM(total) FROM sales s WHERE s.customer_id=c.id AND s.status<>'annulee'),0) AS revenue
         FROM customers c WHERE c.company_id=?`
      : `SELECT c.*,
           COALESCE((SELECT SUM(total) FROM purchases p WHERE p.supplier_id=c.id),0) AS purchased,
           COALESCE((SELECT SUM(total - paid) FROM purchases p WHERE p.supplier_id=c.id),0) AS debt
         FROM suppliers c WHERE c.company_id=?`;

    r.get(`/${table}`, auth(), ({ cid, query }) => {
      const args = [cid];
      let sql = listSql;
      if (query.q) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)'; args.push(`%${query.q}%`, `%${query.q}%`); }
      if (query.debt === '1') sql = `SELECT * FROM (${sql}) WHERE debt > 0.001`;
      return db.all(sql + ' ORDER BY name', ...args);
    });

    r.get(`/${table}/:id`, auth(), ({ cid, params }) => {
      const c = db.one(`${listSql} AND c.id=?`, cid, params.id);
      if (!c) fail(404, `${label} introuvable`);
      if (table === 'customers') {
        c.sales = db.all(`SELECT id, number, total, paid, status, created_at FROM sales WHERE customer_id=? ORDER BY id DESC LIMIT 100`, c.id);
        c.payments = db.all(`SELECT p.*, s.number FROM payments p LEFT JOIN sales s ON s.id=p.sale_id WHERE p.customer_id=? ORDER BY p.id DESC LIMIT 100`, c.id);
      } else {
        c.purchases = db.all(`SELECT id, number, total, paid, created_at FROM purchases WHERE supplier_id=? ORDER BY id DESC LIMIT 100`, c.id);
      }
      return c;
    });

    const minRole = table === 'customers' ? 'caissier' : 'gerant';
    r.post(`/${table}`, auth(minRole), ({ cid, body }) => {
      const name = str(body.name, 120); if (!name) fail(400, 'Nom obligatoire');
      const res = db.run(`INSERT INTO ${table}(company_id,name,phone,email,address,note) VALUES(?,?,?,?,?,?)`,
        cid, name, str(body.phone, 40), str(body.email, 160), str(body.address, 300), str(body.note, 500));
      return { id: Number(res.lastInsertRowid) };
    });
    r.put(`/${table}/:id`, auth(minRole), ({ cid, params, body }) => {
      const name = str(body.name, 120); if (!name) fail(400, 'Nom obligatoire');
      db.run(`UPDATE ${table} SET name=?,phone=?,email=?,address=?,note=? WHERE id=? AND company_id=?`,
        name, str(body.phone, 40), str(body.email, 160), str(body.address, 300), str(body.note, 500), params.id, cid);
    });
    r.del(`/${table}/:id`, auth('gerant'), ({ cid, params }) => {
      const used = table === 'customers'
        ? db.one('SELECT id FROM sales WHERE customer_id=? LIMIT 1', params.id)
        : db.one('SELECT id FROM purchases WHERE supplier_id=? LIMIT 1', params.id);
      if (used) fail(400, `Impossible de supprimer : ce ${label.toLowerCase()} a un historique`);
      db.run(`DELETE FROM ${table} WHERE id=? AND company_id=?`, params.id, cid);
    });
  }
};

module.exports.toCsv = toCsv;
