import { h, clear, icon, state, GET, POST, money, fmtNum, fmtDateTime, table, pageHead, btn, toast, modal, debounce, badge } from '../core.js';
import { linesEditor } from '../lines.js';
import { paymentModal } from './sales.js';

const payBadge = (r) => (r.paid >= r.total - 0.001 ? badge('Payé', 'green') : r.paid > 0 ? badge('Partiel', 'orange') : badge('À payer', 'red'));

async function newPurchase(after) {
  const suppliers = await GET('/suppliers');
  const sup = h('select', h('option', { value: '' }, '— Sans fournisseur —'), suppliers.map((s) => h('option', { value: s.id }, s.name)));
  const wh = h('select', state.warehouses.map((w) => h('option', { value: w.id }, w.name)));
  if (state.user.warehouse_id) wh.value = state.user.warehouse_id;
  const note = h('input', { placeholder: 'N° de facture fournisseur, remarque…' });
  const paid = h('input', { type: 'number', min: 0, placeholder: 'Laisser vide = tout payé' });
  const upd = h('input', { type: 'checkbox', checked: true });
  const ed = linesEditor({ withCost: true, warehouseId: () => wh.value });
  wh.onchange = () => ed.reload();
  await ed.load();
  modal({
    title: 'Nouvel achat (réception de marchandises)', wide: true,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div.form-grid',
        h('label.field', h('span', 'Fournisseur'), sup), h('label.field', h('span', 'Recevoir dans le dépôt'), wh),
        h('label.field', h('span', 'Montant payé au fournisseur'), paid), h('label.field', h('span', 'Note'), note),
        h('label.check.full', upd, " Mettre à jour le prix d'achat des produits (coût moyen)")),
      ed.el),
    actions: [{ label: 'Annuler', onClick: () => {} }, { label: "Valider l'achat", primary: true, onClick: async () => {
      const p = await POST('/purchases', {
        supplier_id: sup.value || null, warehouse_id: Number(wh.value), note: note.value, update_cost: upd.checked,
        paid: paid.value === '' ? undefined : Number(paid.value), items: ed.items(),
      });
      toast(`Achat ${p.number} enregistré, stock mis à jour`); after && after(p);
    } }],
  });
}

export async function purchasesPage(page) {
  let q = '';
  const results = h('div');
  const load = async () => {
    const rows = await GET('/purchases?q=' + encodeURIComponent(q));
    clear(results, table([
      { label: 'N°', key: 'number', main: true },
      { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
      { label: 'Fournisseur', render: (r) => r.supplier || '—' },
      { label: 'Dépôt', key: 'warehouse' },
      { label: 'Lignes', align: 'right', key: 'lines' },
      { label: 'Total', align: 'right', render: (r) => money(r.total) },
      { label: 'Reste dû', align: 'right', render: (r) => (r.total - r.paid > 0.001 ? h('span.red', money(r.total - r.paid)) : '') },
      { label: 'Paiement', render: payBadge },
    ], rows, { onRow: (r) => (location.hash = '#/achats/' + r.id), empty: 'Aucun achat. Enregistrez vos réceptions de marchandises ici.' }));
  };
  const reload = debounce(load);
  clear(page,
    pageHead('Achats', { actions: [btn('Nouvel achat', () => newPurchase(() => load()), { primary: true, ico: 'plus' })] }),
    h('div.toolbar', h('div.search', icon('search', 18), h('input', { placeholder: 'N° ou fournisseur…', oninput: (e) => { q = e.target.value; reload(); } }))),
    results);
  await load();
}

export async function purchaseDetailPage(page, id) {
  const p = await GET('/purchases/' + id);
  const due = p.total - p.paid;
  clear(page,
    pageHead('Achat ' + p.number, { back: '#/achats', sub: fmtDateTime(p.created_at), actions: due > 0.001 ? [
      btn('Payer le fournisseur', () => paymentModal('Paiement — ' + p.number, due, async (v) => {
        await POST(`/purchases/${p.id}/payments`, v); purchaseDetailPage(page, id);
      }), { primary: true, ico: 'money' })] : [] }),
    h('div.grid.g-main',
      h('div.card', h('h2', 'Produits reçus'), table([
        { label: 'Produit', key: 'name', main: true },
        { label: 'Quantité', align: 'right', render: (r) => fmtNum(r.qty) },
        { label: "Prix d'achat", align: 'right', render: (r) => money(r.cost) },
        { label: 'Total', align: 'right', render: (r) => money(r.total) },
      ], p.items)),
      h('div.card', h('dl.info',
        h('dt', 'Fournisseur'), h('dd', p.supplier_id ? h('a', { href: '#/fournisseurs/' + p.supplier_id }, p.supplier) : '—'),
        h('dt', 'Dépôt'), h('dd', p.warehouse), h('dt', 'Par'), h('dd', p.user || ''),
        h('dt', 'Total'), h('dd', h('b', money(p.total))), h('dt', 'Payé'), h('dd', money(p.paid)),
        h('dt', 'Paiement'), h('dd', payBadge(p)),
        p.note ? [h('dt', 'Note'), h('dd', p.note)] : null))));
}
