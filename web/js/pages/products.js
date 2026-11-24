import { h, clear, icon, state, GET, POST, PUT, DEL, money, fmtNum, fmtDateTime, table, pageHead, btn, can, toast, modal, formModal,
  confirmBox, debounce, options, badge, download, MOVE_TYPES, buildForm } from '../core.js';
import { loadRefs } from '../app.js';

const filters = { q: '', category_id: '', warehouse_id: '', low: false };

export function productFields(isNew) {
  return [
    { name: 'name', label: 'Nom du produit', required: true, full: true },
    { name: 'category_id', label: 'Catégorie', type: 'select', options: options(state.categories, { empty: '— Aucune —' }) },
    { name: 'unit', label: 'Unité', placeholder: 'pièce, kg, carton…' },
    { name: 'price', label: 'Prix de vente', type: 'number', min: 0, required: true },
    { name: 'cost', label: "Prix d'achat", type: 'number', min: 0, help: 'Sert à calculer votre bénéfice' },
    { name: 'barcode', label: 'Code-barres', placeholder: 'Scannez ou tapez' },
    { name: 'sku', label: 'Référence interne' },
    { name: 'min_stock', label: 'Stock minimum (alerte)', type: 'number', min: 0 },
    { name: 'track_stock', label: 'Suivre le stock de ce produit', type: 'checkbox', default: true },
    ...(isNew ? [
      { type: 'section', label: 'Stock de départ (facultatif)' },
      { name: 'initial_stock', label: 'Quantité en stock', type: 'number', min: 0 },
      { name: 'warehouse_id', label: 'Dans le dépôt', type: 'select', options: options(state.warehouses) },
    ] : []),
  ];
}

export function editProduct(p, after) {
  formModal({
    title: p ? 'Modifier le produit' : 'Nouveau produit', wide: true,
    fields: productFields(!p),
    values: p || { unit: 'pièce', track_stock: true, warehouse_id: state.user.warehouse_id },
    onSubmit: async (v) => {
      if (p) await PUT('/products/' + p.id, v); else await POST('/products', v);
      toast(p ? 'Produit modifié' : 'Produit créé');
      await loadRefs();
      after && after();
    },
  });
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/)[0];
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function importCsv(after) {
  const MAP = { nom: 'name', 'désignation': 'name', produit: 'name', 'référence': 'sku', reference: 'sku', 'code-barres': 'barcode', 'code barre': 'barcode',
    'catégorie': 'category', categorie: 'category', 'unité': 'unit', 'prix de vente': 'price', prix: 'price', "prix d'achat": 'cost', 'coût': 'cost',
    'stock minimum': 'min_stock', stock: 'qty', 'quantité': 'qty', quantite: 'qty' };
  const file = h('input', { type: 'file', accept: '.csv,text/csv' });
  const wh = h('select', state.warehouses.map((w) => h('option', { value: w.id }, w.name)));
  modal({
    title: 'Importer des produits (fichier CSV / Excel)',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('p', 'Dans Excel : « Enregistrer sous » → « CSV (séparateur : point-virgule) ». Colonnes reconnues :'),
      h('p.muted', 'Nom, Référence, Code-barres, Catégorie, Unité, Prix de vente, Prix d\'achat, Stock minimum, Stock'),
      h('p.muted', 'Astuce : exportez d\'abord vos produits pour avoir un modèle.'),
      h('label.field', h('span', 'Fichier'), file),
      h('label.field', h('span', 'Mettre le stock dans le dépôt'), wh)),
    actions: [{ label: 'Annuler', onClick: () => {} }, { label: 'Importer', primary: true, onClick: async () => {
      const f = file.files[0]; if (!f) throw new Error('Choisissez un fichier');
      const rows = parseCsv((await f.text()).replace(/^﻿/, ''));
      const head = rows.shift().map((x) => MAP[x.trim().toLowerCase()] || null);
      if (!head.includes('name')) throw new Error('La colonne « Nom » est introuvable');
      const data = rows.map((r) => {
        const o = {};
        head.forEach((k, i) => {
          if (!k) return;
          let v = (r[i] || '').trim();
          if (['price', 'cost', 'qty', 'min_stock'].includes(k)) v = v.replace(/[\s  ]/g, '').replace(',', '.');
          o[k] = v;
        });
        return o;
      });
      const res = await POST('/products/import', { rows: data, warehouse_id: Number(wh.value) });
      toast(`${res.created} produit(s) créé(s), ${res.updated} mis à jour`);
      await loadRefs(); after();
    } }],
  });
}

export async function productsPage(page) {
  if (location.hash.includes('bas=1')) filters.low = true;
  const results = h('div');
  const load = async () => {
    const qs = new URLSearchParams({ q: filters.q, category_id: filters.category_id, warehouse_id: filters.warehouse_id, low: filters.low ? '1' : '' });
    const rows = await GET('/products?' + qs);
    clear(results, table([
      { label: 'Produit', main: true, render: (r) => h('div', h('div', r.name), r.sku || r.barcode ? h('small.muted', [r.sku, r.barcode].filter(Boolean).join(' · ')) : null) },
      { label: 'Catégorie', render: (r) => r.category || '—' },
      { label: 'Prix de vente', align: 'right', render: (r) => money(r.price) },
      can('gerant') ? { label: "Prix d'achat", align: 'right', render: (r) => money(r.cost) } : null,
      { label: 'Stock', align: 'right', render: (r) => !r.track_stock ? badge('Service', 'blue')
        : h('b', { class: r.stock <= 0 ? 'red' : r.stock <= r.min_stock ? 'orange' : '' }, `${fmtNum(r.stock)} ${r.unit}`) },
    ].filter(Boolean), rows, { onRow: (r) => (location.hash = '#/produits/' + r.id), empty: 'Aucun produit. Créez votre premier produit !' }),
    h('p.muted', { style: { marginTop: '8px' } }, `${rows.length} produit(s)`));
  };
  const reload = debounce(load);
  const lowBtn = btn('Stock bas', () => { filters.low = !filters.low; lowBtn.classList.toggle('primary', filters.low); load(); }, { small: true, ico: 'alert' });
  if (filters.low) lowBtn.classList.add('primary');
  clear(page,
    pageHead('Produits', { actions: can('gerant') ? [
      btn('Importer', () => importCsv(load), { ico: 'upload' }),
      btn('Exporter', () => download('/products/export', 'produits.csv'), { ico: 'download' }),
      btn('Nouveau produit', () => editProduct(null, load), { primary: true, ico: 'plus' })] : [] }),
    h('div.toolbar',
      h('div.search', icon('search', 18), h('input', { placeholder: 'Nom, référence ou code-barres…', value: filters.q, oninput: (e) => { filters.q = e.target.value; reload(); } })),
      h('select', { onchange: (e) => { filters.category_id = e.target.value; load(); } },
        options(state.categories, { empty: 'Toutes catégories' }).map(([v, l]) => h('option', { value: v, selected: String(v) === String(filters.category_id) }, l))),
      state.warehouses.length > 1 ? h('select', { onchange: (e) => { filters.warehouse_id = e.target.value; load(); } },
        options(state.warehouses, { empty: 'Tous les dépôts' }).map(([v, l]) => h('option', { value: v, selected: String(v) === String(filters.warehouse_id) }, l))) : null,
      lowBtn),
    results);
  await load();
}

export function adjustModal(product, after) {
  const form = buildForm([
    { name: 'type', label: 'Opération', type: 'select', options: [['entree', 'Entrée (+) : réception, retour…'], ['sortie', 'Sortie (−) : casse, perte, usage…']], full: true },
    { name: 'warehouse_id', label: 'Dépôt', type: 'select', options: options(state.warehouses) },
    { name: 'qty', label: 'Quantité', type: 'number', min: 0 },
    { name: 'note', label: 'Motif', full: true, placeholder: 'Ex : produit cassé, don, réception sans facture…' },
  ], { warehouse_id: state.user.warehouse_id });
  modal({ title: 'Entrée / sortie de stock — ' + product.name, body: form, actions: [
    { label: 'Annuler', onClick: () => {} },
    { label: 'Valider', primary: true, onClick: async () => {
      const v = form.values();
      await POST('/stock/adjust', { ...v, items: [{ product_id: product.id, qty: v.qty }] });
      toast('Stock mis à jour'); after();
    } }] });
}

export async function productDetailPage(page, id) {
  const p = await GET('/products/' + id);
  const reload = () => productDetailPage(page, id);
  clear(page,
    pageHead(p.name, {
      back: '#/produits', sub: [p.category, p.sku, p.barcode].filter(Boolean).join(' · '),
      actions: can('gerant') ? [
        p.track_stock ? btn('Entrée / sortie', () => adjustModal(p, reload), { ico: 'swap' }) : null,
        btn('Modifier', () => editProduct(p, reload), { ico: 'edit' }),
        btn('Archiver', async () => {
          if (!(await confirmBox(`Archiver « ${p.name} » ? Il n'apparaîtra plus dans la caisse (l'historique est conservé).`, { danger: true, okLabel: 'Archiver' }))) return;
          await DEL('/products/' + p.id); toast('Produit archivé'); location.hash = '#/produits';
        }, { danger: true }),
      ].filter(Boolean) : [],
    }),
    !p.active ? h('div.card', { style: { background: '#fef3c7' } }, 'Ce produit est archivé.') : null,
    h('div.grid.g4.kpi-row',
      h('div.kpi', h('div', h('div.k-label', 'Prix de vente'), h('div.k-value', money(p.price)))),
      can('gerant') ? h('div.kpi', h('div', h('div.k-label', "Prix d'achat"), h('div.k-value', money(p.cost)),
        h('div.k-sub', p.price ? `Marge : ${money(p.price - p.cost)} (${Math.round((p.price - p.cost) / p.price * 100)} %)` : ''))) : null,
      h('div.kpi', h('div', h('div.k-label', 'Stock total'), h('div.k-value', { class: p.stock <= p.min_stock ? 'red' : '' }, p.track_stock ? `${fmtNum(p.stock)} ${p.unit}` : '—'),
        h('div.k-sub', `Minimum : ${fmtNum(p.min_stock)}`))),
      h('div.kpi', h('div', h('div.k-label', 'Total vendu'), h('div.k-value', `${fmtNum(p.sold.qty)} ${p.unit}`), h('div.k-sub', money(p.sold.amount))))),
    h('div.grid.g-main', { style: { marginTop: '14px' } },
      h('div.card', h('h2', 'Historique des mouvements'),
        table([
          { label: 'Date', render: (r) => fmtDateTime(r.created_at), main: true },
          { label: 'Type', render: (r) => MOVE_TYPES[r.type] || r.type },
          { label: 'Dépôt', key: 'warehouse' },
          { label: 'Réf.', render: (r) => r.ref || '' },
          { label: 'Quantité', align: 'right', render: (r) => h('b', { class: r.qty > 0 ? 'green' : 'red' }, (r.qty > 0 ? '+' : '') + fmtNum(r.qty)) },
        ], p.moves, { empty: 'Aucun mouvement' })),
      h('div.card', h('h2', 'Stock par dépôt'),
        p.warehouses.map((w) => h('div.row.between', { style: { padding: '8px 0', borderBottom: '1px solid #f1f1f1' } },
          h('span', icon('warehouse', 16), ' ', w.name), h('b', { class: w.qty <= 0 ? 'red' : '' }, `${fmtNum(w.qty)} ${p.unit}`))))));
}
