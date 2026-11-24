import { h, clear, icon, GET, POST, money, fmtNum, fmtDateTime, table, statusBadge, pageHead, btn, can, toast, modal, buildForm,
  confirmBox, debounce, PAY_METHODS, SALE_STATUS, todayStr } from '../core.js';
import { printTicket, printInvoice } from '../print.js';

const filters = { q: '', from: '', to: '', status: '' };

export async function salesPage(page, alive) {
  const results = h('div');
  const load = async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const rows = await GET('/sales?' + qs);
    const valid = rows.filter((r) => r.status !== 'annulee');
    clear(results, table([
      { label: 'N°', key: 'number', main: true },
      { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
      { label: 'Client', render: (r) => r.customer || '—' },
      { label: 'Vendeur', key: 'user' },
      { label: 'Paiement', render: (r) => PAY_METHODS[r.payment_method] || '' },
      { label: 'Total', align: 'right', render: (r) => money(r.total) },
      { label: 'Reste', align: 'right', render: (r) => (r.total - r.paid > 0.001 && r.status !== 'annulee' ? h('span.red', money(r.total - r.paid)) : '') },
      { label: 'État', render: (r) => statusBadge(r.status) },
    ], rows, {
      onRow: (r) => (location.hash = '#/ventes/' + r.id), empty: 'Aucune vente pour ces critères',
      foot: ['Total', `${valid.length} ventes`, '', '', '', money(valid.reduce((a, r) => a + r.total, 0)),
        money(valid.reduce((a, r) => a + r.total - r.paid, 0)), ''],
    }));
  };
  const reload = debounce(load);
  const setDates = (from, to) => { filters.from = from; filters.to = to; fromI.value = from; toI.value = to; load(); };
  const fromI = h('input', { type: 'date', value: filters.from, onchange: (e) => { filters.from = e.target.value; load(); } });
  const toI = h('input', { type: 'date', value: filters.to, onchange: (e) => { filters.to = e.target.value; load(); } });
  clear(page,
    pageHead('Ventes', { actions: [btn('Nouvelle vente', () => (location.hash = '#/caisse'), { primary: true, ico: 'cart' })] }),
    h('div.toolbar',
      h('div.search', icon('search', 18), h('input', { placeholder: 'N° de vente, client, téléphone…', value: filters.q, oninput: (e) => { filters.q = e.target.value; reload(); } })),
      h('select', { onchange: (e) => { filters.status = e.target.value; load(); } },
        h('option', { value: '' }, 'Tous les états'), Object.entries(SALE_STATUS).map(([k, [l]]) => h('option', { value: k, selected: filters.status === k }, l))),
      fromI, toI,
      btn("Aujourd'hui", () => setDates(todayStr(), todayStr()), { small: true }),
      btn('Ce mois', () => setDates(todayStr().slice(0, 8) + '01', todayStr()), { small: true }),
      btn('Tout', () => setDates('', ''), { small: true })),
    results);
  await load();
}

export function paymentModal(title, max, onPay) {
  const form = buildForm([
    { name: 'amount', label: `Montant (reste : ${money(max)})`, type: 'number', full: true },
    { name: 'method', label: 'Mode de paiement', type: 'select', options: Object.entries(PAY_METHODS), full: true },
  ], { amount: max });
  modal({ title, body: form, actions: [
    { label: 'Annuler', onClick: () => {} },
    { label: 'Encaisser', primary: true, onClick: async () => { await onPay(form.values()); toast('Paiement enregistré'); } }] });
}

export async function saleDetailPage(page, id) {
  const s = await GET('/sales/' + id);
  const due = s.total - s.paid;
  const actions = [
    btn('Ticket', () => printTicket(s), { ico: 'print' }),
    btn('Facture A4', () => printInvoice(s), { ico: 'print' }),
  ];
  if (due > 0.001 && s.status !== 'annulee') {
    actions.push(btn('Encaisser un paiement', () => paymentModal('Paiement — ' + s.number, due, async (v) => {
      await POST(`/sales/${s.id}/payments`, v); saleDetailPage(page, id);
    }), { primary: true, ico: 'money' }));
  }
  if (can('gerant') && s.status !== 'annulee') {
    actions.push(btn('Annuler la vente', async () => {
      if (!(await confirmBox('Annuler cette vente ? Les produits seront remis en stock.', { okLabel: 'Oui, annuler', danger: true }))) return;
      try { await POST(`/sales/${s.id}/cancel`, { reason: '' }); toast('Vente annulée'); saleDetailPage(page, id); }
      catch (e) { toast(e.message, 'error'); }
    }, { danger: true }));
  }
  clear(page,
    pageHead('Vente ' + s.number, { back: '#/ventes', sub: fmtDateTime(s.created_at), actions }),
    h('div.grid.g-main',
      h('div.card', h('h2', 'Articles'),
        table([
          { label: 'Produit', key: 'name', main: true },
          { label: 'Quantité', align: 'right', render: (r) => fmtNum(r.qty) },
          { label: 'Prix', align: 'right', render: (r) => money(r.price) },
          { label: 'Total', align: 'right', render: (r) => money(r.total) },
        ], s.items)),
      h('div',
        h('div.card', h('dl.info',
          h('dt', 'État'), h('dd', statusBadge(s.status)),
          h('dt', 'Client'), h('dd', s.customer_id ? h('a', { href: '#/clients/' + s.customer_id }, s.customer) : 'Client comptoir'),
          h('dt', 'Dépôt'), h('dd', s.warehouse),
          h('dt', 'Vendeur'), h('dd', s.user || ''),
          h('dt', 'Sous-total'), h('dd', money(s.subtotal)),
          s.discount ? [h('dt', 'Remise'), h('dd', '−' + money(s.discount))] : null,
          s.tax ? [h('dt', 'TVA'), h('dd', money(s.tax))] : null,
          h('dt', 'Total'), h('dd', h('b', money(s.total))),
          h('dt', 'Payé'), h('dd', money(s.paid)),
          due > 0.001 && s.status !== 'annulee' ? [h('dt', 'Reste à payer'), h('dd.red', h('b', money(due)))] : null,
          s.note ? [h('dt', 'Note'), h('dd', s.note)] : null)),
        h('div.card', h('h2', 'Paiements'), s.payments.length ? s.payments.map((p) => h('div.row.between', { style: { padding: '6px 0' } },
          h('span', fmtDateTime(p.created_at), ' · ', PAY_METHODS[p.method] || p.method), h('b', money(p.amount)))) : h('p.muted', 'Aucun paiement')))));
}

