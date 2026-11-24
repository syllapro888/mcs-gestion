'use strict';
const { fail } = require('./lib');

// Ajoute (qty > 0) ou retire (qty < 0) du stock et enregistre le mouvement.
function moveStock(db, { companyId, productId, warehouseId, qty, type, ref, note, userId, allowNegative }) {
  if (!qty) return;
  const product = db.one('SELECT id, name, track_stock FROM products WHERE id=? AND company_id=?', productId, companyId);
  if (!product) fail(404, 'Produit introuvable');
  const wh = db.one('SELECT id FROM warehouses WHERE id=? AND company_id=?', warehouseId, companyId);
  if (!wh) fail(404, 'Dépôt introuvable');
  if (!product.track_stock) return;

  const row = db.one('SELECT qty FROM stock WHERE product_id=? AND warehouse_id=?', productId, warehouseId);
  const current = row ? row.qty : 0;
  const next = current + qty;
  if (next < 0 && !allowNegative) {
    fail(400, `Stock insuffisant pour « ${product.name} » (disponible : ${current})`);
  }
  db.run(`INSERT INTO stock(company_id, product_id, warehouse_id, qty) VALUES(?,?,?,?)
          ON CONFLICT(product_id, warehouse_id) DO UPDATE SET qty = excluded.qty`,
    companyId, productId, warehouseId, next);
  db.run(`INSERT INTO stock_moves(company_id, product_id, warehouse_id, qty, type, ref, note, user_id)
          VALUES(?,?,?,?,?,?,?,?)`, companyId, productId, warehouseId, qty, type, ref || null, note || null, userId || null);
}

function stockOf(db, productId, warehouseId) {
  const r = db.one('SELECT qty FROM stock WHERE product_id=? AND warehouse_id=?', productId, warehouseId);
  return r ? r.qty : 0;
}

module.exports = { moveStock, stockOf };
