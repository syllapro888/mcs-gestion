// Éditeur de lignes de produits (achats, transferts, entrées/sorties de stock).
import { h, clear, icon, GET, money, fmtNum } from './core.js';

export function linesEditor({ withCost = false, warehouseId = () => '' } = {}) {
  let products = [];
  const lines = [];
  const input = h('input', { placeholder: 'Ajouter un produit : nom, référence ou code-barres…', autocomplete: 'off' });
  const box = h('div.suggest', { style: { display: 'none' } });
  const body = h('div');
  const totalBox = h('div.row.between', { style: { marginTop: '10px', fontWeight: 700 } });
  let sel = 0, matches = [];

  const load = async () => { products = await GET('/products?warehouse_id=' + (warehouseId() || '')); };
  const add = (p) => {
    const l = lines.find((x) => x.product.id === p.id);
    if (l) l.qty += 1; else lines.push({ product: p, qty: 1, cost: p.cost });
    input.value = ''; box.style.display = 'none'; render(); input.focus();
  };
  const showSuggest = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.style.display = 'none'; return; }
    matches = products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '') === q).slice(0, 12);
    sel = 0;
    clear(box, matches.length ? matches.map((p, i) => h('div', { class: i === sel ? 'sel' : '', onmousedown: (e) => { e.preventDefault(); add(p); } },
      h('span', p.name), h('small.muted', `Stock : ${fmtNum(p.stock)}`))) : h('div.muted', 'Aucun produit'));
    box.style.display = 'block';
  };
  input.addEventListener('input', showSuggest);
  input.addEventListener('blur', () => setTimeout(() => (box.style.display = 'none'), 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); sel = Math.max(0, Math.min(matches.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      [...box.children].forEach((c, i) => c.classList.toggle('sel', i === sel));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = input.value.trim();
      const exact = products.find((p) => p.barcode === code || p.sku === code);
      if (exact) add(exact); else if (matches[sel]) add(matches[sel]);
    }
  });

  function render() {
    clear(body, lines.length ? h('div.table-wrap', h('table.list',
      h('thead', h('tr', h('th', 'Produit'), h('th.r', 'Disponible'), h('th.r', 'Quantité'), withCost ? [h('th.r', "Prix d'achat"), h('th.r', 'Total')] : null, h('th'))),
      h('tbody', lines.map((l, i) => h('tr',
        h('td.main', { 'data-label': 'Produit' }, l.product.name),
        h('td.r', { 'data-label': 'Disponible' }, `${fmtNum(l.product.stock)} ${l.product.unit}`),
        h('td.r', { 'data-label': 'Quantité' }, h('input', { type: 'number', min: 0, step: 'any', value: l.qty, oninput: (e) => { l.qty = Number(e.target.value) || 0; renderTotal(); } })),
        withCost ? [
          h('td.r', { 'data-label': "Prix d'achat" }, h('input', { type: 'number', min: 0, step: 'any', value: l.cost, oninput: (e) => { l.cost = Number(e.target.value) || 0; renderTotal(); } })),
          h('td.r', { 'data-label': 'Total', class: 'line-total' }, money(l.qty * l.cost))] : null,
        h('td.r', h('button.icon-btn', { type: 'button', title: 'Retirer', onclick: () => { lines.splice(i, 1); render(); } }, icon('trash', 17))))))))
      : h('p.muted', { style: { textAlign: 'center', padding: '16px' } }, 'Aucun produit ajouté'));
    renderTotal();
  }
  function renderTotal() {
    if (withCost) {
      body.querySelectorAll('td.line-total').forEach((td, i) => { td.textContent = money(lines[i].qty * lines[i].cost); });
      clear(totalBox, h('span', 'Total'), h('span', money(lines.reduce((a, l) => a + l.qty * l.cost, 0))));
    } else clear(totalBox, h('span', 'Quantité totale'), h('span', fmtNum(lines.reduce((a, l) => a + l.qty, 0))));
  }

  render();
  return {
    el: h('div.lines-editor', h('div.le-add', h('div.search', { style: { position: 'relative' } }, input), box), body, totalBox),
    load,
    reload: async () => { await load(); const byId = new Map(products.map((p) => [p.id, p])); lines.forEach((l) => { if (byId.has(l.product.id)) l.product = byId.get(l.product.id); }); render(); },
    items: () => lines.filter((l) => l.qty > 0).map((l) => ({ product_id: l.product.id, qty: l.qty, cost: l.cost })),
    total: () => lines.reduce((a, l) => a + l.qty * l.cost, 0),
  };
}
