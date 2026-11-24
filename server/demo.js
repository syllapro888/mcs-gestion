'use strict';
// Données de démonstration (entreprise fictive) pour essayer l'application.
const { hashPassword, nextNumber, round } = require('./lib');
const { moveStock } = require('./stock');

const PRODUCTS = [
  ['Boissons', 'Eau minérale 1,5 L', 400, 250, 'bouteille'], ['Boissons', 'Coca-Cola 33 cl', 500, 320, 'canette'],
  ['Boissons', 'Jus d\'orange 1 L', 1500, 1000, 'bouteille'], ['Boissons', 'Bière Primus 65 cl', 800, 550, 'bouteille'],
  ['Alimentation', 'Riz parfumé 25 kg', 18500, 15000, 'sac'], ['Alimentation', 'Huile végétale 5 L', 7500, 6000, 'bidon'],
  ['Alimentation', 'Sucre en poudre 1 kg', 900, 650, 'paquet'], ['Alimentation', 'Lait en poudre 400 g', 3200, 2500, 'boîte'],
  ['Alimentation', 'Spaghetti 500 g', 600, 420, 'paquet'], ['Alimentation', 'Tomate concentrée 400 g', 750, 500, 'boîte'],
  ['Alimentation', 'Sardines à l\'huile', 650, 450, 'boîte'], ['Alimentation', 'Farine de blé 1 kg', 850, 600, 'paquet'],
  ['Hygiène', 'Savon de toilette', 350, 220, 'pièce'], ['Hygiène', 'Lessive en poudre 1 kg', 1800, 1300, 'paquet'],
  ['Hygiène', 'Dentifrice 100 ml', 1200, 800, 'tube'], ['Hygiène', 'Papier toilette x4', 1500, 1050, 'paquet'],
  ['Électronique', 'Chargeur USB-C', 3500, 2000, 'pièce'], ['Électronique', 'Écouteurs filaires', 2500, 1400, 'pièce'],
  ['Électronique', 'Ampoule LED 12 W', 1500, 900, 'pièce'], ['Électronique', 'Piles AA x4', 1200, 700, 'paquet'],
];

function seed(db) {
  if (db.one("SELECT id FROM users WHERE email='demo@mcs.cg'")) return;
  db.tx(() => {
    const cid = Number(db.run(`INSERT INTO companies(name, phone, address, email, receipt_footer)
      VALUES('Boutique Démo', '+242 06 000 00 00', 'Avenue de la Paix, Poto-Poto, Brazzaville', 'contact@demo.cg',
      'Merci pour votre achat ! Les marchandises vendues ne sont ni reprises ni échangées.')`).lastInsertRowid);
    const w1 = Number(db.run("INSERT INTO warehouses(company_id,name,address) VALUES(?,?,?)", cid, 'Magasin Poto-Poto', 'Brazzaville').lastInsertRowid);
    const w2 = Number(db.run("INSERT INTO warehouses(company_id,name,address) VALUES(?,?,?)", cid, 'Dépôt Pointe-Noire', 'Pointe-Noire').lastInsertRowid);
    const admin = Number(db.run(`INSERT INTO users(company_id,name,email,password_hash,role,warehouse_id) VALUES(?,?,?,?,?,?)`,
      cid, 'Administrateur Démo', 'demo@mcs.cg', hashPassword('demo123'), 'admin', w1).lastInsertRowid);
    db.run(`INSERT INTO users(company_id,name,email,password_hash,role,warehouse_id) VALUES(?,?,?,?,?,?)`,
      cid, 'Grâce (gérante)', 'gerant@mcs.cg', hashPassword('demo123'), 'gerant', w1);
    const cashier = Number(db.run(`INSERT INTO users(company_id,name,email,password_hash,role,warehouse_id) VALUES(?,?,?,?,?,?)`,
      cid, 'Junior (caissier)', 'caisse@mcs.cg', hashPassword('demo123'), 'caissier', w1).lastInsertRowid);

    const cats = {};
    for (const c of ['Boissons', 'Alimentation', 'Hygiène', 'Électronique']) {
      cats[c] = Number(db.run('INSERT INTO categories(company_id,name) VALUES(?,?)', cid, c).lastInsertRowid);
    }
    const products = PRODUCTS.map(([cat, name, price, cost, unit], i) => {
      const id = Number(db.run(`INSERT INTO products(company_id,name,sku,barcode,category_id,unit,price,cost,min_stock)
        VALUES(?,?,?,?,?,?,?,?,?)`, cid, name, 'P' + String(i + 1).padStart(3, '0'), '600' + String(1000000 + i * 137),
        cats[cat], unit, price, cost, i % 4 === 0 ? 20 : 10).lastInsertRowid);
      const qty = i % 7 === 3 ? 6 : 40 + (i * 13) % 80;
      moveStock(db, { companyId: cid, productId: id, warehouseId: w1, qty, type: 'initial', note: 'Stock initial', userId: admin });
      moveStock(db, { companyId: cid, productId: id, warehouseId: w2, qty: 100 + (i * 7) % 50, type: 'initial', note: 'Stock initial', userId: admin });
      return { id, name, price, cost };
    });

    const customers = [['Marie Nkounkou', '+242 06 512 34 56'], ['Jean-Paul Mabiala', '+242 05 523 11 22'],
      ['Restaurant Le Palmier', '+242 06 644 78 90'], ['Mme Okemba', '+242 06 987 65 43'], ['Hôtel Olympic', '+242 05 555 12 12']]
      .map(([n, p]) => Number(db.run('INSERT INTO customers(company_id,name,phone) VALUES(?,?,?)', cid, n, p).lastInsertRowid));
    for (const [n, p] of [['Grossiste Congo Distribution', '+242 06 600 00 01'], ['Import Pointe-Noire SARL', '+242 05 700 00 02']]) {
      db.run('INSERT INTO suppliers(company_id,name,phone) VALUES(?,?,?)', cid, n, p);
    }

    // Ventes des 30 derniers jours
    let seedN = 7;
    const rnd = (n) => { seedN = (seedN * 9301 + 49297) % 233280; return Math.floor(seedN / 233280 * n); };
    const methods = ['especes', 'especes', 'especes', 'mobile_money', 'mobile_money', 'carte'];
    for (let day = 29; day >= 0; day--) {
      const count = 3 + rnd(6);
      for (let k = 0; k < count; k++) {
        const nb = 1 + rnd(4);
        const lines = [];
        for (let j = 0; j < nb; j++) {
          const p = products[rnd(products.length)];
          if (!lines.find((l) => l.p.id === p.id)) lines.push({ p, qty: 1 + rnd(3) });
        }
        const total = lines.reduce((a, l) => a + l.qty * l.p.price, 0);
        const credit = rnd(10) === 0;
        const customer = credit || rnd(3) === 0 ? customers[rnd(customers.length)] : null;
        const paid = credit ? round(total / 2) : total;
        const number = nextNumber(db, cid, 'sale', 'V');
        const d = new Date(Date.now() - day * 864e5);
        d.setHours(8 + rnd(11), rnd(60));
        const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
        const method = methods[rnd(methods.length)];
        const sid = Number(db.run(`INSERT INTO sales(company_id,number,customer_id,warehouse_id,user_id,subtotal,total,paid,payment_method,status,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`, cid, number, customer, w1, rnd(2) ? cashier : admin, total, total, paid, method,
          paid < total ? 'partielle' : 'payee', ts).lastInsertRowid);
        for (const l of lines) {
          db.run('INSERT INTO sale_items(sale_id,product_id,name,qty,price,cost,total) VALUES(?,?,?,?,?,?,?)', sid, l.p.id, l.p.name, l.qty, l.p.price, l.p.cost, l.qty * l.p.price);
          moveStock(db, { companyId: cid, productId: l.p.id, warehouseId: w1, qty: -l.qty, type: 'vente', ref: number, userId: admin, allowNegative: true });
        }
        db.run('INSERT INTO payments(company_id,sale_id,customer_id,amount,method,user_id,created_at) VALUES(?,?,?,?,?,?,?)', cid, sid, customer, paid, method, admin, ts);
      }
    }
    db.run("UPDATE stock_moves SET created_at = (SELECT created_at FROM sales s WHERE s.number = stock_moves.ref) WHERE type='vente' AND company_id=?", cid);
    for (const [label, cat, amount] of [['Loyer du magasin', 'Loyer', 150000], ['Électricité (SNE)', 'Énergie', 35000], ['Transport marchandises', 'Transport', 25000]]) {
      db.run("INSERT INTO expenses(company_id,label,category,amount,user_id) VALUES(?,?,?,?,?)", cid, label, cat, amount, admin);
    }
  });
}

module.exports = { seed };
