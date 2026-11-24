import { h, clear, GET, POST, PUT, DEL, money, fmtDate, table, pageHead, btn, toast, formModal, confirmBox, todayStr } from '../core.js';

const CATS = ['Loyer', 'Salaires', 'Énergie', 'Transport', 'Communication', 'Fournitures', 'Taxes', 'Entretien', 'Autre'];

export async function expensesPage(page) {
  const f = { from: todayStr().slice(0, 8) + '01', to: todayStr() };
  const results = h('div');
  const edit = (e) => formModal({
    title: e ? 'Modifier la dépense' : 'Nouvelle dépense',
    fields: [
      { name: 'label', label: 'Libellé', required: true, full: true },
      { name: 'amount', label: 'Montant', type: 'number', min: 0, required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'category', label: 'Catégorie', type: 'select', options: CATS.map((c) => [c, c]), full: true },
    ],
    values: e || { date: todayStr(), category: 'Autre' },
    onSubmit: async (v) => { if (e) await PUT('/expenses/' + e.id, v); else await POST('/expenses', v); toast('Dépense enregistrée'); load(); },
  });
  const load = async () => {
    const rows = await GET('/expenses?' + new URLSearchParams(f));
    const byCat = {};
    rows.forEach((r) => { byCat[r.category || 'Autre'] = (byCat[r.category || 'Autre'] || 0) + r.amount; });
    clear(results,
      h('div.row', { style: { marginBottom: '12px', gap: '8px' } }, Object.entries(byCat).map(([k, v]) => h('span.badge.b-grey', `${k} : ${money(v)}`))),
      table([
        { label: 'Date', render: (r) => fmtDate(r.date) },
        { label: 'Libellé', key: 'label', main: true },
        { label: 'Catégorie', render: (r) => r.category || '' },
        { label: 'Par', render: (r) => r.user || '' },
        { label: 'Montant', align: 'right', render: (r) => money(r.amount) },
        { label: '', render: (r) => btn('', async (ev) => {
          ev.stopPropagation();
          if (await confirmBox('Supprimer cette dépense ?', { danger: true })) { await DEL('/expenses/' + r.id); load(); }
        }, { small: true, ico: 'trash', title: 'Supprimer' }) },
      ], rows, { onRow: edit, empty: 'Aucune dépense sur cette période', foot: ['Total', '', '', '', money(rows.reduce((a, r) => a + r.amount, 0)), ''] }));
  };
  clear(page,
    pageHead('Dépenses', { sub: 'Loyer, salaires, électricité… pour calculer votre vrai bénéfice', actions: [btn('Nouvelle dépense', () => edit(null), { primary: true, ico: 'plus' })] }),
    h('div.toolbar',
      h('input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; load(); } }),
      h('input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; load(); } })),
    results);
  await load();
}
