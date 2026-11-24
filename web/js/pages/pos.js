// Caisse : vente rapide au comptoir (souris, écran tactile ou lecteur de code-barres).
import { h, clear, icon, state, GET, POST, money, fmtNum, toast, modal, buildForm, can, PAY_METHODS } from '../core.js';
import { printTicket, printInvoice } from '../print.js';

// Le panier reste en mémoire si on change de page
const cart = { lines: [], customerId: '', discount: 0, warehouseId: null };

export async function posPage(page) {
  if (!cart.warehouseId || !state.warehouses.find((w) => w.id === cart.warehouseId)) {
    cart.warehouseId = state.user.warehouse_id && state.warehouses.find((w) => w.id === state.user.warehouse_id)
      ? state.user.warehouse_id : state.warehouses[0]?.id;
  }
  let products = [], customers = [], category = '', query = '';

  const search = h('input', { placeholder: 'Rechercher ou scanner un code-barres…  (F2)', autocomplete: 'off' });
  const catsBox = h('div.pos-cats');
  const grid = h('div.pos-grid');
  const linesBox = h('div.cart-lines');
  const totalBox = h('div');
  const countBadge = h('span');
  const mobileBtn = h('button.btn.primary.mobile-cart-btn', { onclick: () => cartPanel.classList.add('open') });
  const custSelect = h('select', { onchange: (e) => { cart.customerId = e.target.value; } });
  const whSelect = h('select', {
    disabled: !can('gerant') && !!state.user.warehouse_id,
    onchange: async (e) => { cart.warehouseId = Number(e.target.value); await loadProducts(); },
  }, state.warehouses.map((w) => h('option', { value: w.id, selected: w.id === cart.warehouseId }, w.name)));
  const discountInput = h('input', { type: 'number', min: 0, placeholder: 'Remise', value: cart.discount || '', style: { width: '110px' },
    oninput: (e) => { cart.discount = Number(e.target.value) || 0; renderCart(); } });

  async function loadProducts() {
    products = await GET('/products?warehouse_id=' + cart.warehouseId);
    renderGrid();
  }
  async function loadCustomers(selectId) {
    customers = await GET('/customers');
    clear(custSelect, h('option', { value: '' }, 'Client comptoir (sans nom)'),
      customers.map((c) => h('option', { value: c.id }, c.name + (c.phone ? ' — ' + c.phone : '') + (c.debt > 0 ? ` (doit ${money(c.debt)})` : ''))));
    if (selectId) cart.customerId = String(selectId);
    custSelect.value = cart.customerId;
  }

  function renderCats() {
    const cats = [{ id: '', name: 'Tous' }, ...state.categories.filter((c) => c.products > 0)];
    clear(catsBox, cats.map((c) => h('button', { class: String(c.id) === String(category) ? 'active' : '',
      onclick: () => { category = c.id; renderCats(); renderGrid(); } }, c.name)));
  }

  function filtered() {
    const q = query.toLowerCase();
    return products.filter((p) => (!category || p.category_id === Number(category)) &&
      (!q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)));
  }

  function renderGrid() {
    const list = filtered();
    clear(grid, list.length ? list.slice(0, 300).map((p) => h('div.pos-item', {
      class: p.track_stock && p.stock <= 0 ? 'out' : '', onclick: () => addProduct(p),
    }, h('div.pi-name', p.name), h('div.pi-price', money(p.price)),
      h('div.pi-stock', p.track_stock ? `Stock : ${fmtNum(p.stock)} ${p.unit}` : 'Service'))) : h('div.muted', { style: { padding: '20px' } }, 'Aucun produit trouvé'));
  }

  function addProduct(p, qty = 1) {
    const line = cart.lines.find((l) => l.product.id === p.id);
    if (line) line.qty += qty; else cart.lines.push({ product: p, qty, price: p.price });
    const l = line || cart.lines[cart.lines.length - 1];
    if (p.track_stock && l.qty > p.stock && !state.company.allow_negative_stock) toast(`Attention : stock disponible ${fmtNum(p.stock)}`, 'error');
    renderCart();
  }

  const totals = () => {
    const subtotal = cart.lines.reduce((a, l) => a + l.qty * l.price, 0);
    const discount = Math.min(subtotal, cart.discount || 0);
    const tax = Math.round((subtotal - discount) * (state.company.tax_rate || 0)) / 100;
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  };

  function renderCart() {
    clear(linesBox, cart.lines.length ? cart.lines.map((l, i) => h('div.cart-line',
      h('div', h('div.cl-name', l.product.name),
        h('span.cl-price', { title: 'Changer le prix', onclick: () => editPrice(l) }, `${money(l.price)} / ${l.product.unit}`)),
      h('div.cl-total', money(l.qty * l.price)),
      h('div.cl-ctrl',
        h('button.qty-btn', { onclick: () => { l.qty = Math.max(0, l.qty - 1); if (!l.qty) cart.lines.splice(i, 1); renderCart(); } }, icon('minus', 16)),
        h('input', { type: 'number', value: l.qty, min: 0, step: 'any', onchange: (e) => { l.qty = Math.max(0, Number(e.target.value) || 0); if (!l.qty) cart.lines.splice(i, 1); renderCart(); } }),
        h('button.qty-btn', { onclick: () => { l.qty += 1; renderCart(); } }, icon('plus', 16))),
      h('div', { style: { textAlign: 'right' } }, h('button.icon-btn', { title: 'Retirer', onclick: () => { cart.lines.splice(i, 1); renderCart(); } }, icon('trash', 17)))))
      : h('div.empty', { style: { boxShadow: 'none' } }, icon('cart', 40), h('p', 'Panier vide'), h('small', 'Touchez un produit pour l\'ajouter')));
    const t = totals();
    const n = cart.lines.reduce((a, l) => a + l.qty, 0);
    clear(totalBox,
      t.discount || t.tax ? h('div.row.between.muted', h('span', 'Sous-total'), h('span', money(t.subtotal))) : null,
      t.discount ? h('div.row.between.muted', h('span', 'Remise'), h('span', '−' + money(t.discount))) : null,
      t.tax ? h('div.row.between.muted', h('span', `TVA ${state.company.tax_rate} %`), h('span', money(t.tax))) : null,
      h('div.cart-total', h('span', `Total (${fmtNum(n)} article${n > 1 ? 's' : ''})`), h('span.big', money(t.total))));
    clear(mobileBtn, h('span', `🛒 ${fmtNum(n)} article(s)`), h('b', money(t.total)));
    clear(countBadge, `${cart.lines.length} ligne(s)`);
  }

  function editPrice(line) {
    const form = buildForm([{ name: 'price', label: `Prix de vente pour « ${line.product.name} »`, type: 'number', full: true }], { price: line.price });
    modal({ title: 'Modifier le prix', body: form, actions: [
      { label: 'Annuler', onClick: () => {} },
      { label: 'Appliquer', primary: true, onClick: () => { line.price = Math.max(0, Number(form.values().price) || 0); renderCart(); } }] });
  }

  async function scan() {
    const code = search.value.trim();
    if (!code) return;
    const exact = products.find((p) => p.barcode === code || (p.sku && p.sku.toLowerCase() === code.toLowerCase()));
    if (exact) { addProduct(exact); search.value = ''; query = ''; renderGrid(); return; }
    const list = filtered();
    if (list.length === 1) { addProduct(list[0]); search.value = ''; query = ''; renderGrid(); return; }
    if (!list.length) toast('Aucun produit pour « ' + code + ' »', 'error');
  }

  function newCustomer() {
    const form = buildForm([{ name: 'name', label: 'Nom', required: true, full: true }, { name: 'phone', label: 'Téléphone', full: true }]);
    modal({ title: 'Nouveau client', body: form, actions: [
      { label: 'Annuler', onClick: () => {} },
      { label: 'Créer', primary: true, onClick: async () => { const r = await POST('/customers', form.values()); await loadCustomers(r.id); toast('Client créé'); } }] });
  }

  // ---------- Paiement ----------
  function checkout() {
    if (!cart.lines.length) return toast('Le panier est vide', 'error');
    const t = totals();
    let method = 'especes';
    const received = h('input', { type: 'number', min: 0, value: t.total, style: { fontSize: '22px', fontWeight: '700' } });
    const changeBox = h('div.change-box');
    const methodsBox = h('div.pay-methods');
    const renderMethods = () => clear(methodsBox, Object.entries(PAY_METHODS).filter(([k]) => k !== 'virement').map(([k, v]) =>
      h('button', { type: 'button', class: k === method ? 'active' : '', onclick: () => { method = k; renderMethods(); } }, v)));
    const updateChange = () => {
      const r = Number(received.value) || 0;
      if (r >= t.total) clear(changeBox, h('span', 'Monnaie à rendre'), h('span', money(r - t.total))).style.background = '';
      else {
        clear(changeBox, h('span', cart.customerId ? 'Reste à crédit' : '⚠ Montant insuffisant'), h('span', money(t.total - r)));
        changeBox.style.background = '#fef3c7';
      }
    };
    received.oninput = updateChange;
    const quick = [t.total, ...[500, 1000, 2000, 5000, 10000].map((s) => Math.ceil(t.total / s) * s)]
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
    renderMethods(); updateChange();
    modal({
      title: 'Encaissement',
      body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('div.cart-total', h('span', 'À payer'), h('span.big', money(t.total))),
        h('div', h('div.muted', { style: { marginBottom: '6px' } }, 'Mode de paiement'), methodsBox),
        h('label.field', h('span', 'Montant reçu du client'), received),
        h('div.quick-cash', quick.map((v) => h('button.btn.small', { type: 'button', onclick: () => { received.value = v; updateChange(); } }, fmtNum(v))),
          h('button.btn.small', { type: 'button', onclick: () => { received.value = 0; updateChange(); } }, 'Tout à crédit')),
        changeBox,
        !cart.customerId ? h('small.muted', 'Pour une vente à crédit (paiement partiel), choisissez d\'abord un client.') : null),
      actions: [
        { label: 'Annuler', onClick: () => {} },
        { label: '✔ Valider la vente', primary: true, onClick: async () => {
          const r = Number(received.value) || 0;
          const sale = await POST('/sales', {
            warehouse_id: cart.warehouseId, customer_id: cart.customerId || null, discount: cart.discount,
            payment_method: method, paid: Math.min(r, t.total),
            items: cart.lines.map((l) => ({ product_id: l.product.id, qty: l.qty, price: l.price })),
          });
          sale.received = r;
          sale.company = state.company;
          cart.lines = []; cart.discount = 0; cart.customerId = ''; discountInput.value = ''; custSelect.value = '';
          renderCart(); loadProducts();
          done(sale);
        } },
      ],
    });
    setTimeout(() => received.select(), 50);
  }

  function done(sale) {
    modal({
      title: 'Vente enregistrée ✔',
      body: h('div', { style: { textAlign: 'center' } },
        h('p', `Vente ${sale.number}`), h('div.big', { style: { color: 'var(--primary)' } }, money(sale.total)),
        sale.received > sale.total ? h('p', 'Monnaie à rendre : ', h('b', money(sale.received - sale.total))) : null,
        sale.total - sale.paid > 0.001 ? h('p.orange', 'Reste à crédit : ', h('b', money(sale.total - sale.paid))) : null),
      actions: [
        { label: '🖨 Ticket', onClick: () => printTicket(sale), close: false },
        { label: 'Facture A4', onClick: () => printInvoice(sale), close: false },
        { label: 'Nouvelle vente', primary: true, onClick: () => { cartPanel.classList.remove('open'); search.focus(); } },
      ],
    });
  }

  search.addEventListener('input', () => { query = search.value.trim(); renderGrid(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); scan(); } });
  const onKey = (e) => {
    if (!document.body.contains(search)) return document.removeEventListener('keydown', onKey);
    if (e.key === 'F2') { e.preventDefault(); search.focus(); }
    if (e.key === 'F9' && !document.querySelector('.overlay')) { e.preventDefault(); checkout(); }
  };
  document.addEventListener('keydown', onKey);

  const cartPanel = h('div.pos-cart',
    h('div.cart-head',
      h('div.row.between', h('h3', 'Panier'), h('div.row', countBadge,
        h('button.icon-btn', { title: 'Vider le panier', onclick: () => { cart.lines = []; renderCart(); } }, icon('trash', 18)),
        h('button.icon-btn.menu-btn', { title: 'Fermer', onclick: () => cartPanel.classList.remove('open') }, icon('x')))),
      h('div.row', { style: { flexWrap: 'nowrap' } }, custSelect, h('button.btn', { title: 'Nouveau client', onclick: newCustomer }, icon('plus', 18)))),
    linesBox,
    h('div.cart-foot',
      h('div.row', { style: { flexWrap: 'nowrap' } }, h('span.muted', 'Remise'), discountInput, h('span.muted', state.company.currency)),
      totalBox,
      h('button.btn.primary.pay-btn', { onclick: checkout }, icon('money', 22), 'Encaisser  (F9)')));

  clear(page, h('div.pos',
    h('div.pos-left',
      h('div.toolbar', h('div.search', icon('barcode', 18), search), state.warehouses.length > 1 ? whSelect : null),
      catsBox, grid),
    cartPanel), mobileBtn);

  renderCats(); renderCart();
  await Promise.all([loadProducts(), loadCustomers()]);
  if (window.innerWidth > 800) search.focus();
}


