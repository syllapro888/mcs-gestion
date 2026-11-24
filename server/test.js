'use strict';
// Tests automatiques de l'API : node server/test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('./index');

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcs-test-'));
  const { server, port } = await start({ port: 0, host: '127.0.0.1', dataDir, demo: true });
  const base = `http://127.0.0.1:${port}/api`;
  let token = null;
  const api = async (method, url, body, expect = 200) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text && res.headers.get('content-type').includes('json') ? JSON.parse(text) : text;
    assert.strictEqual(res.status, expect, `${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
    return data;
  };
  let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

  // Inscription
  const reg = await api('POST', '/auth/register', { company: 'Ma Boutique', name: 'Moussa', email: 'moussa@test.cg', password: 'secret1' });
  token = reg.token; assert.strictEqual(reg.user.role, 'admin'); ok('Inscription entreprise + admin');
  await api('POST', '/auth/register', { company: 'X', name: 'Y', email: 'moussa@test.cg', password: 'secret1' }, 400); ok('E-mail en double refusé');

  const [wh] = await api('GET', '/warehouses');
  const wh2 = (await api('POST', '/warehouses', { name: 'Dépôt 2' })).id; ok('Création dépôt');
  const cat = (await api('POST', '/categories', { name: 'Boissons' })).id;
  const p1 = (await api('POST', '/products', { name: 'Eau 1,5 L', price: 400, cost: 250, barcode: '123', category_id: cat, min_stock: 5, initial_stock: 50, warehouse_id: wh.id })).id;
  const p2 = (await api('POST', '/products', { name: 'Riz 25 kg', price: 18500, cost: 15000 })).id;
  await api('POST', '/products', { name: 'Doublon', barcode: '123' }, 400); ok('Produits + code-barres unique');
  assert.strictEqual((await api('GET', '/products/barcode/123')).stock, 50); ok('Recherche par code-barres');

  // Achat
  const sup = (await api('POST', '/suppliers', { name: 'Grossiste' })).id;
  const pur = await api('POST', '/purchases', { supplier_id: sup, warehouse_id: wh.id, items: [{ product_id: p2, qty: 10, cost: 16000 }], paid: 100000 });
  assert.strictEqual(pur.total, 160000); ok('Achat fournisseur reçu (stock +10)');
  assert.strictEqual((await api('GET', `/products/${p2}`)).cost, 16000);

  // Vente
  await api('POST', '/sales', { warehouse_id: wh.id, items: [{ product_id: p1, qty: 999 }] }, 400); ok('Stock insuffisant refusé');
  const sale = await api('POST', '/sales', { warehouse_id: wh.id, items: [{ product_id: p1, qty: 5 }, { product_id: p2, qty: 1 }], discount: 500, payment_method: 'mobile_money' });
  assert.strictEqual(sale.total, 2000 + 18500 - 500); assert.strictEqual(sale.status, 'payee'); ok('Vente payée (Mobile Money)');
  assert.strictEqual((await api('GET', `/products/${p1}`)).stock, 45);

  // Crédit client
  await api('POST', '/sales', { warehouse_id: wh.id, items: [{ product_id: p1, qty: 1 }], paid: 0 }, 400); ok('Crédit sans client refusé');
  const cust = (await api('POST', '/customers', { name: 'Marie', phone: '060000000' })).id;
  const cs = await api('POST', '/sales', { warehouse_id: wh.id, customer_id: cust, items: [{ product_id: p1, qty: 10 }], paid: 1000 });
  assert.strictEqual(cs.status, 'partielle');
  assert.strictEqual((await api('GET', `/customers/${cust}`)).debt, 3000); ok('Vente à crédit, dette = 3000');
  await api('POST', `/customers/${cust}/payments`, { amount: 3000, method: 'especes' });
  assert.strictEqual((await api('GET', `/customers/${cust}`)).debt, 0); ok('Remboursement de la dette');

  // Transfert, ajustement, inventaire
  await api('POST', '/transfers', { from_warehouse_id: wh.id, to_warehouse_id: wh2, items: [{ product_id: p1, qty: 15 }] });
  const pd = await api('GET', `/products/${p1}`);
  assert.deepStrictEqual(pd.warehouses.map((w) => w.qty), [20, 15]); ok('Transfert entre dépôts');
  await api('POST', '/stock/adjust', { warehouse_id: wh2, type: 'sortie', items: [{ product_id: p1, qty: 2 }], note: 'Casse' }); ok('Sortie de stock (casse)');
  const inv = await api('POST', '/inventories', { warehouse_id: wh.id });
  const invd = await api('GET', `/inventories/${inv.id}`);
  const line = invd.lines.find((l) => l.product_id === p1);
  await api('PUT', `/inventories/${inv.id}/lines`, { lines: [{ id: line.id, counted: 18 }] });
  const v = await api('POST', `/inventories/${inv.id}/validate`);
  assert.strictEqual(v.changed, 1);
  assert.strictEqual((await api('GET', `/products/${p1}`)).warehouses[0].qty, 18); ok('Inventaire physique validé');

  // Annulation
  await api('POST', `/sales/${sale.id}/cancel`, { reason: 'Erreur' });
  assert.strictEqual((await api('GET', `/products/${p1}`)).warehouses[0].qty, 23); ok('Annulation vente = retour en stock');

  // Rapports, dépenses, utilisateurs
  await api('POST', '/expenses', { label: 'Loyer', amount: 50000 });
  const dash = await api('GET', '/dashboard');
  assert.ok(dash.today.count >= 1 && dash.month.expenses === 50000); ok('Tableau de bord');
  const rep = await api('GET', '/reports/sales');
  assert.ok(rep.byProduct.length >= 1); ok('Rapport des ventes');
  await api('POST', '/users', { name: 'Caissier', email: 'c@test.cg', password: 'secret1', role: 'caissier', warehouse_id: wh.id });
  const login = await api('POST', '/auth/login', { email: 'c@test.cg', password: 'secret1' });
  token = login.token;
  await api('POST', '/products', { name: 'Interdit' }, 403);
  await api('GET', '/reports/sales', null, 403);
  await api('POST', '/sales', { items: [{ product_id: p1, qty: 1 }] }); ok('Droits du caissier respectés');

  // Isolation entre entreprises
  token = (await api('POST', '/auth/login', { email: 'demo@mcs.cg', password: 'demo123' })).token;
  await api('GET', `/products/${p1}`, null, 404);
  assert.ok((await api('GET', '/products')).length === 20); ok('Les entreprises ne voient pas les données des autres');
  await api('POST', '/auth/login', { email: 'demo@mcs.cg', password: 'faux' }, 401); ok('Mauvais mot de passe refusé');

  server.close();
  console.log(`\nTous les tests sont passés (${n}).`);
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
