import { h, clear, GET, money, fmtNum, fmtDate, table, pageHead, btn, download, todayStr, PAY_METHODS } from '../core.js';
import { kpi, hbars } from './dashboard.js';

const f = { from: todayStr().slice(0, 8) + '01', to: todayStr() };

export async function reportsPage(page) {
  const results = h('div');
  const fromI = h('input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; load(); } });
  const toI = h('input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; load(); } });
  const preset = (from, to) => { f.from = from; f.to = to; fromI.value = from; toI.value = to; load(); };
  const shift = (days) => { const d = new Date(Date.now() - days * 864e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const lastMonth = () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; return [iso(s), iso(e)]; };

  async function load() {
    const r = await GET('/reports/sales?' + new URLSearchParams(f));
    const t = r.totals;
    clear(results,
      h('div.grid.g4.kpi-row',
        kpi("Chiffre d'affaires", money(t.revenue), `${t.count} ventes · ${fmtNum(t.qty)} articles`, 'receipt', '#2563eb'),
        kpi('Marge brute', money(t.profit), `Coût des produits : ${money(t.cost)}`, 'chart', '#0e6e5c'),
        kpi('Dépenses', money(t.expenses), null, 'wallet', '#dc2626'),
        kpi('Bénéfice net', money(t.net), `Encaissé : ${money(t.cashed)}`, 'money', t.net >= 0 ? '#16a34a' : '#dc2626')),
      h('div.grid.g3', { style: { marginTop: '14px' } },
        h('div.card', h('h2', 'Par catégorie'), r.byCategory.length ? hbars(r.byCategory, (x) => x.name, (x) => x.amount) : h('p.muted', '—')),
        h('div.card', h('h2', 'Par vendeur'), r.byUser.length ? hbars(r.byUser, (x) => `${x.name} (${x.count})`, (x) => x.amount) : h('p.muted', '—')),
        h('div.card', h('h2', 'Par mode de paiement'), r.byMethod.length ? hbars(r.byMethod, (x) => PAY_METHODS[x.method] || x.method, (x) => x.amount) : h('p.muted', '—'))),
      r.byWarehouse.length > 1 ? h('div.card', { style: { marginTop: '14px' } }, h('h2', 'Par dépôt / magasin'), hbars(r.byWarehouse, (x) => `${x.name} (${x.count})`, (x) => x.amount)) : null,
      h('div.grid.g2', { style: { marginTop: '14px' } },
        h('div.card', h('h2', 'Ventes par produit'), table([
          { label: 'Produit', key: 'name', main: true },
          { label: 'Qté', align: 'right', render: (x) => fmtNum(x.qty) },
          { label: 'Montant', align: 'right', render: (x) => money(x.amount) },
          { label: 'Marge', align: 'right', render: (x) => money(x.profit) },
        ], r.byProduct, { empty: 'Aucune vente' })),
        h('div.card', h('h2', 'Ventes par jour'), table([
          { label: 'Jour', render: (x) => fmtDate(x.day), main: true },
          { label: 'Ventes', align: 'right', key: 'count' },
          { label: 'Montant', align: 'right', render: (x) => money(x.revenue) },
          { label: 'Marge', align: 'right', render: (x) => money(x.profit) },
        ], r.byDay, { empty: 'Aucune vente', foot: ['Total', fmtNum(t.count), money(t.revenue), money(r.byDay.reduce((a, x) => a + x.profit, 0))] }))));
  }

  clear(page,
    pageHead('Rapports', { actions: [
      btn('Exporter (Excel)', () => download('/reports/sales/export?' + new URLSearchParams(f), `ventes-${f.from}-${f.to}.csv`), { ico: 'download' }),
      btn('Imprimer', () => printReport(), { ico: 'print' })] }),
    h('div.toolbar', fromI, toI,
      btn("Aujourd'hui", () => preset(todayStr(), todayStr()), { small: true }),
      btn('7 jours', () => preset(shift(6), todayStr()), { small: true }),
      btn('Ce mois', () => preset(todayStr().slice(0, 8) + '01', todayStr()), { small: true }),
      btn('Mois dernier', () => preset(...lastMonth()), { small: true }),
      btn('Cette année', () => preset(todayStr().slice(0, 4) + '-01-01', todayStr()), { small: true })),
    results);

  function printReport() {
    const area = document.getElementById('print-area');
    clear(area, h('div.invoice', h('h2', `Rapport des ventes du ${fmtDate(f.from)} au ${fmtDate(f.to)}`), results.cloneNode(true)));
    setTimeout(() => window.print(), 50);
  }
  await load();
}
