'use strict';
const { fail, str, num, round } = require('../lib');
const { toCsv } = require('./catalog');

const today = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

module.exports = (r, { auth, db }) => {
  // Filtre commun : ventes valides d'une période (et du caissier si besoin)
  const salesFilter = (cid, from, to, user) => {
    const where = ["s.company_id=?", "s.status<>'annulee'", 'date(s.created_at)>=?', 'date(s.created_at)<=?'];
    const args = [cid, from, to];
    if (user && user.role === 'caissier') { where.push('s.user_id=?'); args.push(user.id); }
    return { where: where.join(' AND '), args };
  };

  function totals(cid, from, to, user) {
    const f = salesFilter(cid, from, to, user);
    const s = db.one(`SELECT COUNT(*) count, COALESCE(SUM(total),0) revenue, COALESCE(SUM(paid),0) cashed,
      COALESCE(SUM(discount),0) discount, COALESCE(SUM(tax),0) tax FROM sales s WHERE ${f.where}`, ...f.args);
    const c = db.one(`SELECT COALESCE(SUM(i.qty*i.cost),0) cost, COALESCE(SUM(i.qty),0) qty FROM sale_items i
      JOIN sales s ON s.id=i.sale_id WHERE ${f.where}`, ...f.args);
    const revenueHt = s.revenue - s.tax;
    return { ...s, cost: round(c.cost), qty: c.qty, profit: round(revenueHt - c.cost), average: s.count ? round(s.revenue / s.count) : 0 };
  }

  r.get('/dashboard', auth(), ({ cid, user }) => {
    const t = today();
    const monthStart = t.slice(0, 8) + '01';
    const d30 = new Date(Date.now() - 29 * 864e5); d30.setMinutes(d30.getMinutes() - d30.getTimezoneOffset());
    const from30 = d30.toISOString().slice(0, 10);
    const f30 = salesFilter(cid, from30, t, user);
    const fm = salesFilter(cid, monthStart, t, user);

    const series = db.all(`SELECT date(s.created_at) day, SUM(total) revenue, COUNT(*) count FROM sales s
      WHERE ${f30.where} GROUP BY day ORDER BY day`, ...f30.args);
    const byDay = new Map(series.map((x) => [x.day, x]));
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      const key = d.toISOString().slice(0, 10);
      days.push({ day: key, revenue: byDay.get(key)?.revenue || 0, count: byDay.get(key)?.count || 0 });
    }

    const out = {
      today: totals(cid, t, t, user),
      month: totals(cid, monthStart, t, user),
      series: days,
      top: db.all(`SELECT i.product_id, i.name, SUM(i.qty) qty, SUM(i.total) amount FROM sale_items i JOIN sales s ON s.id=i.sale_id
        WHERE ${fm.where} GROUP BY i.product_id ORDER BY amount DESC LIMIT 8`, ...fm.args),
      methods: db.all(`SELECT p.method, SUM(p.amount) amount FROM payments p JOIN sales s ON s.id=p.sale_id
        WHERE ${fm.where} AND date(p.created_at)>=? GROUP BY p.method ORDER BY amount DESC`, ...fm.args, monthStart),
      recent: db.all(`SELECT s.id, s.number, s.total, s.status, s.created_at, c.name customer FROM sales s
        LEFT JOIN customers c ON c.id=s.customer_id WHERE s.company_id=? ${user.role === 'caissier' ? 'AND s.user_id=' + Number(user.id) : ''}
        ORDER BY s.id DESC LIMIT 8`, cid),
    };
    if (user.role !== 'caissier') {
      out.month.expenses = db.one('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE company_id=? AND date>=? AND date<=?', cid, monthStart, t).v;
      out.month.net = round(out.month.profit - out.month.expenses);
      out.receivables = db.one(`SELECT COALESCE(SUM(total-paid),0) v, COUNT(DISTINCT customer_id) n FROM sales
        WHERE company_id=? AND status IN ('credit','partielle')`, cid);
      out.stock = db.one(`SELECT COALESCE(SUM(s.qty*p.cost),0) value, COALESCE(SUM(s.qty*p.price),0) retail FROM stock s
        JOIN products p ON p.id=s.product_id WHERE s.company_id=? AND s.qty>0 AND p.active=1`, cid);
      out.stock.products = db.one('SELECT COUNT(*) n FROM products WHERE company_id=? AND active=1', cid).n;
      out.low = db.all(`SELECT * FROM (SELECT p.id, p.name, p.unit, p.min_stock,
          COALESCE((SELECT SUM(qty) FROM stock s WHERE s.product_id=p.id),0) stock
        FROM products p WHERE p.company_id=? AND p.active=1 AND p.track_stock=1) WHERE stock <= min_stock ORDER BY stock - min_stock LIMIT 10`, cid);
      out.lowCount = db.one(`SELECT COUNT(*) n FROM (SELECT p.min_stock, COALESCE((SELECT SUM(qty) FROM stock s WHERE s.product_id=p.id),0) stock
        FROM products p WHERE p.company_id=? AND p.active=1 AND p.track_stock=1) WHERE stock <= min_stock`, cid).n;
    }
    return out;
  });

  function salesReport(cid, query) {
    const from = query.from || today().slice(0, 8) + '01';
    const to = query.to || today();
    const f = salesFilter(cid, from, to);
    let where = f.where; const args = [...f.args];
    if (num(query.warehouse_id)) { where += ' AND s.warehouse_id=?'; args.push(num(query.warehouse_id)); }
    const t = totals(cid, from, to);
    t.expenses = db.one('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE company_id=? AND date>=? AND date<=?', cid, from, to).v;
    t.net = round(t.profit - t.expenses);
    const margins = new Map(db.all(`SELECT date(s.created_at) day, SUM(i.qty*(i.price-i.cost)) m FROM sale_items i
      JOIN sales s ON s.id=i.sale_id WHERE ${where} GROUP BY day`, ...args).map((x) => [x.day, x.m]));
    const byDay = db.all(`SELECT date(s.created_at) day, COUNT(*) count, SUM(s.total) revenue, SUM(s.paid) cashed,
        SUM(s.discount) discount FROM sales s WHERE ${where} GROUP BY day ORDER BY day`, ...args)
      .map((d) => ({ ...d, profit: round((margins.get(d.day) || 0) - d.discount) }));
    return {
      from, to, totals: t, byDay,
      byProduct: db.all(`SELECT i.product_id, i.name, SUM(i.qty) qty, SUM(i.total) amount, SUM(i.qty*(i.price-i.cost)) profit
        FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE ${where} GROUP BY i.product_id ORDER BY amount DESC`, ...args),
      byCategory: db.all(`SELECT COALESCE(c.name,'Sans catégorie') name, SUM(i.qty) qty, SUM(i.total) amount
        FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id
        WHERE ${where} GROUP BY c.id ORDER BY amount DESC`, ...args),
      byUser: db.all(`SELECT COALESCE(u.name,'?') name, COUNT(*) count, SUM(s.total) amount FROM sales s LEFT JOIN users u ON u.id=s.user_id
        WHERE ${where} GROUP BY s.user_id ORDER BY amount DESC`, ...args),
      byWarehouse: db.all(`SELECT w.name, COUNT(*) count, SUM(s.total) amount FROM sales s JOIN warehouses w ON w.id=s.warehouse_id
        WHERE ${where} GROUP BY s.warehouse_id ORDER BY amount DESC`, ...args),
      byMethod: db.all(`SELECT p.method, SUM(p.amount) amount FROM payments p JOIN sales s ON s.id=p.sale_id
        WHERE ${where} GROUP BY p.method ORDER BY amount DESC`, ...args),
    };
  }

  r.get('/reports/sales', auth('gerant'), ({ cid, query }) => salesReport(cid, query));

  r.get('/reports/sales/export', auth('gerant'), (ctx) => {
    const rep = salesReport(ctx.cid, ctx.query);
    ctx.csv = toCsv(rep.byProduct, [['name', 'Produit'], ['qty', 'Quantité'], ['amount', 'Montant'], ['profit', 'Marge']]);
    ctx.filename = `ventes-${rep.from}-au-${rep.to}.csv`;
  });

  // ---------- Dépenses ----------
  r.get('/expenses', auth('gerant'), ({ cid, query }) => {
    const where = ['e.company_id=?']; const args = [cid];
    if (query.from) { where.push('e.date>=?'); args.push(query.from); }
    if (query.to) { where.push('e.date<=?'); args.push(query.to); }
    return db.all(`SELECT e.*, u.name AS user FROM expenses e LEFT JOIN users u ON u.id=e.user_id
      WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.id DESC LIMIT 1000`, ...args);
  });
  r.post('/expenses', auth('gerant'), ({ cid, user, body }) => {
    const label = str(body.label, 160), amount = round(num(body.amount));
    if (!label || amount <= 0) fail(400, 'Libellé et montant obligatoires');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : today();
    return { id: Number(db.run('INSERT INTO expenses(company_id,label,category,amount,date,user_id) VALUES(?,?,?,?,?,?)',
      cid, label, str(body.category, 60), amount, date, user.id).lastInsertRowid) };
  });
  r.put('/expenses/:id', auth('gerant'), ({ cid, params, body }) => {
    const label = str(body.label, 160), amount = round(num(body.amount));
    if (!label || amount <= 0) fail(400, 'Libellé et montant obligatoires');
    db.run('UPDATE expenses SET label=?, category=?, amount=?, date=? WHERE id=? AND company_id=?',
      label, str(body.category, 60), amount, body.date || today(), params.id, cid);
  });
  r.del('/expenses/:id', auth('gerant'), ({ cid, params }) => {
    db.run('DELETE FROM expenses WHERE id=? AND company_id=?', params.id, cid);
  });
};
