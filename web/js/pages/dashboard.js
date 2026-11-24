import { h, clear, icon, GET, money, fmtNum, table, statusBadge, pageHead, btn, can, PAY_METHODS, state } from '../core.js';

const kpi = (label, value, sub, ico, color) => h('div.kpi',
  h('div.k-ico', { style: { background: color + '1a', color } }, icon(ico, 22)),
  h('div', { style: { minWidth: 0 } }, h('div.k-label', label), h('div.k-value', value), sub ? h('div.k-sub', sub) : null));

function barChart(series) {
  const max = Math.max(1, ...series.map((d) => d.revenue));
  return h('div',
    h('div.chart-bars', series.map((d) => h('div.bar', {
      style: { height: (d.revenue / max * 100) + '%' },
      title: `${new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} : ${money(d.revenue)} (${d.count} ventes)`,
    }))),
    h('div.chart-axis', h('span', new Date(series[0].day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
      h('span', "Aujourd'hui")));
}

function hbars(rows, label, value, fmt = money) {
  const max = Math.max(1, ...rows.map(value));
  return rows.map((r) => h('div.hbar', h('span', label(r)), h('b.nowrap', fmt(value(r))),
    h('div.track', h('div.fill', { style: { width: (value(r) / max * 100) + '%' } }))));
}

export async function dashboardPage(page) {
  const d = await GET('/dashboard');
  const manager = can('gerant');
  clear(page,
    pageHead('Tableau de bord', {
      sub: manager ? state.company.name : 'Vos ventes',
      actions: [btn('Nouvelle vente', () => (location.hash = '#/caisse'), { primary: true, ico: 'cart' })],
    }),
    h('div.grid.g4.kpi-row',
      kpi("Ventes aujourd'hui", money(d.today.revenue), `${d.today.count} ventes · panier moyen ${money(d.today.average)}`, 'cart', '#e8913a'),
      kpi('Ventes du mois', money(d.month.revenue), `${d.month.count} ventes`, 'receipt', '#2563eb'),
      manager ? kpi('Bénéfice du mois', money(d.month.net), `Marge ${money(d.month.profit)} − dépenses ${money(d.month.expenses)}`, 'money', '#16a34a')
        : kpi("Articles vendus aujourd'hui", fmtNum(d.today.qty), null, 'box', '#16a34a'),
      manager ? kpi('Crédits clients', money(d.receivables.v), `${d.receivables.n} client(s) doivent de l'argent`, 'users', '#dc2626') : null),
    h('div.grid', { class: manager ? 'g-main' : '', style: { marginTop: '14px' } },
      h('div.card', h('h2', 'Chiffre d\'affaires — 30 derniers jours'), barChart(d.series)),
      manager ? h('div.card', h('h2', 'Stock'),
        h('dl.info',
          h('dt', 'Produits actifs'), h('dd', fmtNum(d.stock.products)),
          h('dt', 'Valeur du stock (achat)'), h('dd', money(d.stock.value)),
          h('dt', 'Valeur à la vente'), h('dd', money(d.stock.retail)),
          h('dt', 'Alertes stock bas'), h('dd', h('a', { href: '#/produits?bas=1', class: d.lowCount ? 'red' : '' }, `${d.lowCount} produit(s)`))),
        d.low.length ? h('div', { style: { marginTop: '14px' } }, h('b', { class: 'red' }, icon('alert', 16), ' À réapprovisionner'),
          d.low.map((p) => h('div.row.between', { style: { padding: '6px 0', borderBottom: '1px solid #f1f1f1' } },
            h('a', { href: '#/produits/' + p.id }, p.name), h('span.red.nowrap', `${fmtNum(p.stock)} / min ${fmtNum(p.min_stock)}`)))) : null) : null),
    h('div.grid.g3', { style: { marginTop: '14px' } },
      h('div.card', h('h2', 'Meilleurs produits du mois'), d.top.length ? hbars(d.top, (r) => `${r.name} (${fmtNum(r.qty)})`, (r) => r.amount) : h('p.muted', 'Pas encore de ventes')),
      h('div.card', h('h2', 'Encaissements du mois'), d.methods.length ? hbars(d.methods, (r) => PAY_METHODS[r.method] || r.method, (r) => r.amount) : h('p.muted', 'Rien pour le moment')),
      h('div.card', h('div.row.between', h('h2', 'Dernières ventes'), h('a', { href: '#/ventes' }, 'Tout voir')),
        table([
          { label: 'N°', key: 'number', main: true },
          { label: 'Client', render: (r) => r.customer || '—' },
          { label: 'Montant', align: 'right', render: (r) => money(r.total) },
          { label: 'État', render: (r) => statusBadge(r.status) },
        ], d.recent, { onRow: (r) => (location.hash = '#/ventes/' + r.id), empty: 'Aucune vente' }))));
}

export { kpi, hbars, barChart };
