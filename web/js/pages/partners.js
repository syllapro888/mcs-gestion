import { h, clear, icon, GET, POST, PUT, DEL, money, fmtDateTime, table, pageHead, btn, can, toast, formModal, confirmBox, debounce,
  statusBadge, PAY_METHODS } from '../core.js';
import { paymentModal } from './sales.js';

const KIND = {
  clients: { api: 'customers', one: 'client', title: 'Clients', newLabel: 'Nouveau client' },
  fournisseurs: { api: 'suppliers', one: 'fournisseur', title: 'Fournisseurs', newLabel: 'Nouveau fournisseur' },
};
const FIELDS = [
  { name: 'name', label: 'Nom', required: true, full: true },
  { name: 'phone', label: 'Téléphone' }, { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'address', label: 'Adresse', full: true }, { name: 'note', label: 'Note', type: 'textarea', full: true },
];

function edit(kind, item, after) {
  const k = KIND[kind];
  formModal({
    title: item ? 'Modifier' : k.newLabel, fields: FIELDS, values: item || {},
    onSubmit: async (v) => {
      if (item) await PUT(`/${k.api}/${item.id}`, v); else await POST(`/${k.api}`, v);
      toast('Enregistré'); after();
    },
  });
}

export async function partnersPage(page, kind) {
  const k = KIND[kind];
  let q = '', debtOnly = false;
  const results = h('div');
  const load = async () => {
    const rows = await GET(`/${k.api}?q=${encodeURIComponent(q)}&debt=${debtOnly ? 1 : ''}`);
    const isC = kind === 'clients';
    clear(results, table([
      { label: 'Nom', key: 'name', main: true },
      { label: 'Téléphone', render: (r) => (r.phone ? h('a', { href: 'tel:' + r.phone, onclick: (e) => e.stopPropagation() }, r.phone) : '') },
      { label: isC ? "Chiffre d'affaires" : 'Total acheté', align: 'right', render: (r) => money(isC ? r.revenue : r.purchased) },
      { label: isC ? 'Doit (crédit)' : 'Vous lui devez', align: 'right', render: (r) => (r.debt > 0.001 ? h('b.red', money(r.debt)) : '—') },
    ], rows, {
      onRow: (r) => (location.hash = `#/${kind}/${r.id}`), empty: `Aucun ${k.one}`,
      foot: ['Total', `${rows.length}`, money(rows.reduce((a, r) => a + (isC ? r.revenue : r.purchased), 0)), money(rows.reduce((a, r) => a + r.debt, 0))],
    }));
  };
  const reload = debounce(load);
  const debtBtn = btn(kind === 'clients' ? 'Avec crédit' : 'À payer', () => { debtOnly = !debtOnly; debtBtn.classList.toggle('primary', debtOnly); load(); }, { small: true });
  clear(page,
    pageHead(k.title, { actions: [btn(k.newLabel, () => edit(kind, null, load), { primary: true, ico: 'plus' })] }),
    h('div.toolbar', h('div.search', icon('search', 18), h('input', { placeholder: 'Nom ou téléphone…', oninput: (e) => { q = e.target.value; reload(); } })), debtBtn),
    results);
  await load();
}

export async function partnerDetailPage(page, kind, id) {
  const k = KIND[kind];
  const c = await GET(`/${k.api}/${id}`);
  const reload = () => partnerDetailPage(page, kind, id);
  const isC = kind === 'clients';
  const actions = [];
  if (isC && c.debt > 0.001) {
    actions.push(btn('Encaisser un remboursement', () => paymentModal('Remboursement — ' + c.name, c.debt, async (v) => {
      await POST(`/customers/${c.id}/payments`, v); reload();
    }), { primary: true, ico: 'money' }));
  }
  actions.push(btn('Modifier', () => edit(kind, c, reload), { ico: 'edit' }));
  if (can('gerant')) {
    actions.push(btn('Supprimer', async () => {
      if (!(await confirmBox(`Supprimer « ${c.name} » ?`, { danger: true, okLabel: 'Supprimer' }))) return;
      try { await DEL(`/${k.api}/${c.id}`); toast('Supprimé'); location.hash = '#/' + kind; } catch (e) { toast(e.message, 'error'); }
    }, { danger: true }));
  }
  clear(page,
    pageHead(c.name, { back: '#/' + kind, sub: [c.phone, c.email].filter(Boolean).join(' · '), actions }),
    h('div.grid.g3.kpi-row', { style: { marginBottom: '14px' } },
      h('div.kpi', h('div', h('div.k-label', isC ? "Chiffre d'affaires" : 'Total acheté'), h('div.k-value', money(isC ? c.revenue : c.purchased)))),
      h('div.kpi', h('div', h('div.k-label', isC ? 'Crédit (doit)' : 'Vous lui devez'), h('div.k-value', { class: c.debt > 0.001 ? 'red' : '' }, money(c.debt)))),
      h('div.kpi', h('div', h('div.k-label', 'Adresse'), h('div', c.address || '—'), c.note ? h('div.k-sub', c.note) : null))),
    isC ? h('div.grid.g-main',
      h('div.card', h('h2', 'Ventes'), table([
        { label: 'N°', key: 'number', main: true }, { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
        { label: 'Total', align: 'right', render: (r) => money(r.total) },
        { label: 'Reste', align: 'right', render: (r) => (r.total - r.paid > 0.001 && r.status !== 'annulee' ? h('span.red', money(r.total - r.paid)) : '') },
        { label: 'État', render: (r) => statusBadge(r.status) },
      ], c.sales, { onRow: (r) => (location.hash = '#/ventes/' + r.id), empty: 'Aucune vente' })),
      h('div.card', h('h2', 'Paiements reçus'), c.payments.length ? c.payments.map((p) => h('div.row.between', { style: { padding: '6px 0', borderBottom: '1px solid #f3f3f3' } },
        h('span', fmtDateTime(p.created_at), h('small.muted', ` · ${PAY_METHODS[p.method] || p.method} · ${p.number || ''}`)), h('b', money(p.amount)))) : h('p.muted', 'Aucun paiement')))
    : h('div.card', h('h2', 'Achats'), table([
        { label: 'N°', key: 'number', main: true }, { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
        { label: 'Total', align: 'right', render: (r) => money(r.total) },
        { label: 'Reste dû', align: 'right', render: (r) => (r.total - r.paid > 0.001 ? h('span.red', money(r.total - r.paid)) : '') },
      ], c.purchases, { onRow: (r) => (location.hash = '#/achats/' + r.id), empty: 'Aucun achat' })));
}
