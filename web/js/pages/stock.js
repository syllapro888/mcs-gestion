import { h, clear, icon, state, GET, POST, PUT, DEL, money, fmtNum, fmtDateTime, table, pageHead, btn, toast, modal, buildForm,
  confirmBox, debounce, options, badge, MOVE_TYPES, todayStr } from '../core.js';
import { linesEditor } from '../lines.js';

const tabs = (active) => h('div.tabs', [
  ['stock', 'État du stock'], ['stock/mouvements', 'Mouvements'], ['stock/transferts', 'Transferts'], ['stock/inventaires', 'Inventaires'],
].map(([p, l]) => h('a', { href: '#/' + p, class: p === active ? 'active' : '' }, l)));

const whOptions = () => state.warehouses.map((w) => h('option', { value: w.id }, w.name));

// Entrée / sortie de plusieurs produits
function adjustDialog(type, after) {
  const wh = h('select', whOptions());
  if (state.user.warehouse_id) wh.value = state.user.warehouse_id;
  const note = h('input', { placeholder: type === 'entree' ? 'Ex : réception, retour client…' : 'Ex : casse, perte, usage interne…' });
  const ed = linesEditor({ warehouseId: () => wh.value });
  wh.onchange = () => ed.reload();
  ed.load();
  modal({
    title: type === 'entree' ? 'Entrée de stock' : 'Sortie de stock', wide: true,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div.form-grid', h('label.field', h('span', 'Dépôt'), wh), h('label.field', h('span', 'Motif'), note)), ed.el),
    actions: [{ label: 'Annuler', onClick: () => {} }, { label: 'Valider', primary: true, onClick: async () => {
      const r = await POST('/stock/adjust', { type, warehouse_id: Number(wh.value), note: note.value, items: ed.items() });
      toast(`${type === 'entree' ? 'Entrée' : 'Sortie'} ${r.ref} enregistrée`); after && after();
    } }],
  });
}

function transferDialog(after) {
  const from = h('select', whOptions()), to = h('select', whOptions());
  if (state.warehouses[1]) to.value = state.warehouses[1].id;
  const note = h('input', { placeholder: 'Facultatif' });
  const ed = linesEditor({ warehouseId: () => from.value });
  from.onchange = () => ed.reload();
  ed.load();
  modal({
    title: 'Transfert entre dépôts', wide: true,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div.form-grid', h('label.field', h('span', 'Du dépôt'), from), h('label.field', h('span', 'Vers le dépôt'), to),
        h('label.field.full', h('span', 'Note'), note)), ed.el),
    actions: [{ label: 'Annuler', onClick: () => {} }, { label: 'Transférer', primary: true, onClick: async () => {
      const r = await POST('/transfers', { from_warehouse_id: Number(from.value), to_warehouse_id: Number(to.value), note: note.value, items: ed.items() });
      toast(`Transfert ${r.number} effectué`); after && after();
    } }],
  });
}

const stockActions = (after) => [
  btn('Entrée', () => adjustDialog('entree', after), { ico: 'download' }),
  btn('Sortie', () => adjustDialog('sortie', after), { ico: 'upload' }),
  state.warehouses.length > 1 ? btn('Transfert', () => transferDialog(after), { ico: 'swap' }) : null,
  btn('Inventaire', () => (location.hash = '#/stock/inventaires'), { primary: true, ico: 'clipboard' }),
].filter(Boolean);

let currentWh = '';
export async function stockPage(page) {
  const warehouses = await GET('/warehouses');
  const results = h('div');
  let q = '';
  const load = async () => {
    const rows = await GET(`/products?warehouse_id=${currentWh}&q=${encodeURIComponent(q)}`);
    const tracked = rows.filter((r) => r.track_stock);
    clear(results, table([
      { label: 'Produit', key: 'name', main: true },
      { label: 'Catégorie', render: (r) => r.category || '—' },
      { label: 'Quantité', align: 'right', render: (r) => h('b', { class: r.stock <= 0 ? 'red' : r.stock <= r.min_stock ? 'orange' : '' }, `${fmtNum(r.stock)} ${r.unit}`) },
      { label: 'Minimum', align: 'right', render: (r) => fmtNum(r.min_stock) },
      { label: 'Valeur (achat)', align: 'right', render: (r) => money(Math.max(0, r.stock) * r.cost) },
      { label: 'État', render: (r) => (r.stock <= 0 ? badge('Rupture', 'red') : r.stock <= r.min_stock ? badge('Stock bas', 'orange') : badge('OK', 'green')) },
    ], tracked, {
      onRow: (r) => (location.hash = '#/produits/' + r.id),
      foot: ['Total', '', fmtNum(tracked.reduce((a, r) => a + r.stock, 0)), '', money(tracked.reduce((a, r) => a + Math.max(0, r.stock) * r.cost, 0)), ''],
    }));
  };
  const reload = debounce(load);
  const refresh = () => stockPage(page);
  clear(page,
    pageHead('Stock & dépôts', { actions: stockActions(refresh) }),
    tabs('stock'),
    h('div.grid.g4', { style: { marginBottom: '14px' } }, warehouses.map((w) => h('div.kpi', {
      style: { cursor: 'pointer', outline: String(w.id) === String(currentWh) ? '2px solid var(--primary)' : '' },
      onclick: () => { currentWh = String(w.id) === String(currentWh) ? '' : w.id; refresh(); },
    }, h('div.k-ico', { style: { background: '#0891b21a', color: '#0891b2' } }, icon('warehouse', 22)),
      h('div', h('div.k-label', w.name), h('div.k-value', money(w.value)), h('div.k-sub', `${w.products} produit(s) en stock`))))),
    h('div.toolbar',
      h('div.search', icon('search', 18), h('input', { placeholder: 'Rechercher un produit…', oninput: (e) => { q = e.target.value; reload(); } })),
      h('select', { onchange: (e) => { currentWh = e.target.value; refresh(); } },
        h('option', { value: '' }, 'Tous les dépôts'), warehouses.map((w) => h('option', { value: w.id, selected: String(w.id) === String(currentWh) }, w.name)))),
    results);
  await load();
}

export async function movesPage(page) {
  const f = { type: '', warehouse_id: '', from: todayStr().slice(0, 8) + '01', to: todayStr(), q: '' };
  const results = h('div');
  const load = async () => {
    const rows = await GET('/stock/moves?' + new URLSearchParams(f));
    clear(results, table([
      { label: 'Date', render: (r) => fmtDateTime(r.created_at), main: true },
      { label: 'Produit', render: (r) => h('a', { href: '#/produits/' + r.product_id }, r.product) },
      { label: 'Type', render: (r) => MOVE_TYPES[r.type] || r.type },
      { label: 'Dépôt', key: 'warehouse' },
      { label: 'Réf.', render: (r) => r.ref || '' },
      { label: 'Par', render: (r) => r.user || '' },
      { label: 'Note', render: (r) => r.note || '' },
      { label: 'Quantité', align: 'right', render: (r) => h('b', { class: r.qty > 0 ? 'green' : 'red' }, (r.qty > 0 ? '+' : '') + fmtNum(r.qty)) },
    ], rows, { empty: 'Aucun mouvement sur cette période' }));
  };
  const reload = debounce(load);
  clear(page,
    pageHead('Stock & dépôts', { actions: stockActions(load) }), tabs('stock/mouvements'),
    h('div.toolbar',
      h('div.search', icon('search', 18), h('input', { placeholder: 'Produit ou référence…', oninput: (e) => { f.q = e.target.value; reload(); } })),
      h('select', { onchange: (e) => { f.type = e.target.value; load(); } }, h('option', { value: '' }, 'Tous les types'), Object.entries(MOVE_TYPES).map(([k, v]) => h('option', { value: k }, v))),
      h('select', { onchange: (e) => { f.warehouse_id = e.target.value; load(); } }, h('option', { value: '' }, 'Tous les dépôts'), whOptions()),
      h('input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; load(); } }),
      h('input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; load(); } })),
    results);
  await load();
}

export async function transfersPage(page) {
  const rows = await GET('/transfers');
  clear(page,
    pageHead('Stock & dépôts', { actions: stockActions(() => transfersPage(page)) }), tabs('stock/transferts'),
    state.warehouses.length < 2 ? h('div.card', { style: { marginBottom: '14px' } }, 'Vous avez un seul dépôt. Ajoutez-en un autre dans ',
      h('a', { href: '#/parametres/depots' }, 'Paramètres → Dépôts'), ' pour faire des transferts.') : null,
    table([
      { label: 'N°', key: 'number', main: true },
      { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
      { label: 'De', key: 'from_name' }, { label: 'Vers', key: 'to_name' },
      { label: 'Produits', align: 'right', key: 'lines' }, { label: 'Quantité', align: 'right', render: (r) => fmtNum(r.qty) },
      { label: 'Par', render: (r) => r.user || '' },
    ], rows, { empty: 'Aucun transfert', onRow: async (r) => {
      const t = await GET('/transfers/' + r.id);
      modal({ title: `Transfert ${t.number}`, body: h('div',
        h('p', `${t.from_name} → ${t.to_name} · ${fmtDateTime(t.created_at)}`), t.note ? h('p.muted', t.note) : null,
        table([{ label: 'Produit', key: 'name', main: true }, { label: 'Quantité', align: 'right', render: (x) => fmtNum(x.qty) }], t.items)) });
    } }));
}

export async function inventoriesPage(page) {
  const rows = await GET('/inventories');
  const create = () => {
    const form = buildForm([
      { name: 'warehouse_id', label: 'Dépôt à compter', type: 'select', options: options(state.warehouses), full: true },
      { name: 'category_id', label: 'Catégorie (facultatif)', type: 'select', options: options(state.categories, { empty: 'Tous les produits' }), full: true },
      { name: 'note', label: 'Note', full: true },
    ]);
    modal({ title: 'Nouvel inventaire', body: h('div', h('p.muted', 'Les quantités actuelles sont enregistrées. Vous saisirez ensuite ce que vous comptez réellement.'), form),
      actions: [{ label: 'Annuler', onClick: () => {} }, { label: 'Commencer', primary: true, onClick: async () => {
        const r = await POST('/inventories', form.values()); location.hash = '#/stock/inventaires/' + r.id;
      } }] });
  };
  clear(page,
    pageHead('Stock & dépôts', { actions: [btn('Nouvel inventaire', create, { primary: true, ico: 'plus' })] }), tabs('stock/inventaires'),
    table([
      { label: 'N°', key: 'number', main: true },
      { label: 'Date', render: (r) => fmtDateTime(r.created_at) },
      { label: 'Dépôt', key: 'warehouse' },
      { label: 'Comptés', align: 'right', render: (r) => `${r.counted} / ${r.lines}` },
      { label: 'Par', render: (r) => r.user || '' },
      { label: 'État', render: (r) => (r.status === 'valide' ? badge('Validé', 'green') : badge('En cours', 'orange')) },
    ], rows, { onRow: (r) => (location.hash = '#/stock/inventaires/' + r.id), empty: 'Aucun inventaire. Faites-en un régulièrement pour éviter les écarts.' }));
}

export async function inventoryDetailPage(page, id) {
  const inv = await GET('/inventories/' + id);
  const draft = inv.status === 'brouillon';
  const changed = new Map();
  let q = '';
  const body = h('div');
  const summary = h('div');

  const diffOf = (l) => {
    const c = changed.has(l.id) ? changed.get(l.id) : l.counted;
    return c === null || c === '' || c === undefined ? null : Number(c) - l.expected;
  };
  const renderSummary = () => {
    let counted = 0, value = 0, gaps = 0;
    for (const l of inv.lines) { const d = diffOf(l); if (d !== null) { counted++; value += d * l.cost; if (d) gaps++; } }
    clear(summary, h('div.grid.g3.kpi-row', { style: { marginBottom: '14px' } },
      h('div.kpi', h('div', h('div.k-label', 'Produits comptés'), h('div.k-value', `${counted} / ${inv.lines.length}`))),
      h('div.kpi', h('div', h('div.k-label', 'Produits avec écart'), h('div.k-value', { class: gaps ? 'orange' : '' }, gaps))),
      h('div.kpi', h('div', h('div.k-label', "Valeur de l'écart"), h('div.k-value', { class: value < 0 ? 'red' : 'green' }, money(value))))));
  };
  const render = () => {
    const lines = inv.lines.filter((l) => !q || l.name.toLowerCase().includes(q) || l.barcode === q || (l.sku || '').toLowerCase() === q);
    clear(body, table([
      { label: 'Produit', main: true, render: (l) => h('div', l.name, l.category ? h('small.muted', ' · ' + l.category) : null) },
      { label: 'Théorique', align: 'right', render: (l) => `${fmtNum(l.expected)} ${l.unit}` },
      { label: 'Compté', align: 'right', render: (l) => draft
        ? h('input', { type: 'number', min: 0, step: 'any', style: { width: '100px', textAlign: 'right' }, value: changed.has(l.id) ? changed.get(l.id) : (l.counted ?? ''),
          oninput: (e) => { changed.set(l.id, e.target.value); const td = e.target.closest('tr').querySelector('.diff'); const d = diffOf(l); td.textContent = d === null ? '' : (d > 0 ? '+' : '') + fmtNum(d); td.className = 'diff r ' + (d < 0 ? 'red' : d > 0 ? 'green' : ''); renderSummary(); } })
        : (l.counted === null ? '—' : fmtNum(l.counted)) },
      { label: 'Écart', align: 'right', render: (l) => { const d = diffOf(l); return d === null ? '' : h('b', (d > 0 ? '+' : '') + fmtNum(d)); } },
    ], lines, { empty: 'Aucun produit' }));
    body.querySelectorAll('tbody tr').forEach((tr, i) => { const td = tr.children[3]; td.classList.add('diff'); const d = diffOf(lines[i]); if (d) td.classList.add(d < 0 ? 'red' : 'green'); });
  };
  const save = async () => {
    if (!changed.size) return;
    await PUT(`/inventories/${inv.id}/lines`, { lines: [...changed].map(([lid, counted]) => ({ id: lid, counted })) });
    for (const l of inv.lines) if (changed.has(l.id)) l.counted = changed.get(l.id) === '' ? null : Number(changed.get(l.id));
    changed.clear();
  };
  const actions = draft ? [
    btn('Supprimer', async () => { if (await confirmBox('Supprimer cet inventaire en cours ?', { danger: true })) { await DEL('/inventories/' + inv.id); location.hash = '#/stock/inventaires'; } }, { danger: true }),
    btn('Enregistrer', async () => { try { await save(); toast('Comptage enregistré'); } catch (e) { toast(e.message, 'error'); } }),
    btn("Valider l'inventaire", async () => {
      try {
        await save();
        if (!(await confirmBox('Valider ? Le stock du dépôt sera corrigé avec les quantités comptées. Les produits non comptés ne changent pas.', { okLabel: 'Valider' }))) return;
        const r = await POST(`/inventories/${inv.id}/validate`);
        toast(`Inventaire validé : ${r.changed} produit(s) corrigé(s)`); inventoryDetailPage(page, id);
      } catch (e) { toast(e.message, 'error'); }
    }, { primary: true }),
  ] : [];
  clear(page,
    pageHead(`Inventaire ${inv.number}`, { back: '#/stock/inventaires', sub: `${inv.warehouse} · ${fmtDateTime(inv.created_at)}${inv.validated_at ? ' · validé le ' + fmtDateTime(inv.validated_at) : ''}`, actions }),
    summary,
    h('div.toolbar', h('div.search', icon('search', 18), h('input', { placeholder: 'Chercher / scanner un produit…', oninput: (e) => { q = e.target.value.trim().toLowerCase(); render(); } }))),
    body);
  render(); renderSummary();
}
