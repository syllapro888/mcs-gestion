// Outils de l'interface : création d'éléments, appels API, fenêtres, notifications, formats.

export const state = { user: null, company: null, warehouses: [], categories: [] };

// ---------- Création d'éléments ----------
// h('div.carte#id', { onclick, ... }, enfants...)
export function h(sel, attrs, ...children) {
  if (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs); attrs = {};
  }
  const [tag, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const r of rest) {
    if (r[0] === '.') el.classList.add(r.slice(1)); else el.id = r.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && !['list', 'form', 'type'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el, ...children) => { el.replaceChildren(); append(el, children); return el; };

// Icônes (SVG simples)
const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  cart: 'M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  warehouse: 'M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10',
  receipt: 'M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  clipboard: 'M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12l2 2 4-4',
  swap: 'M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
  plus: 'M12 5v14M5 12h14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  menu: 'M3 6h18M3 12h18M3 18h18', x: 'M18 6L6 18M6 6l12 12', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  minus: 'M5 12h14', back: 'M19 12H5M12 19l-7-7 7-7', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  barcode: 'M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14', alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.classList.add('ico');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.box);
  s.append(p); return s;
}

// ---------- API ----------
export function getToken() { try { return localStorage.getItem('mcs_token'); } catch { return null; } }
export function setToken(t) { try { t ? localStorage.setItem('mcs_token', t) : localStorage.removeItem('mcs_token'); } catch {} }

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Pas de connexion au serveur. Vérifiez internet ou le réseau.');
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && !url.startsWith('/auth/login')) {
    setToken(null); location.hash = '#/connexion';
  }
  if (!res.ok) throw new Error((data && data.error) || 'Erreur ' + res.status);
  return data;
}
export const GET = (u) => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b || {}), DEL = (u) => api('DELETE', u);

// Téléchargement d'un fichier protégé (CSV, sauvegarde)
export async function download(url, filename) {
  const res = await fetch('/api' + url, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) return toast('Téléchargement impossible', 'error');
  const blob = await res.blob();
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
}

// ---------- Formats ----------
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const fmtNum = (n) => nf.format(Number(n) || 0);
export const money = (n) => `${fmtNum(Math.round((Number(n) || 0) * 100) / 100)} ${state.company?.currency || 'FCFA'}`;
export const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleDateString('fr-FR') : '');
export const fmtDateTime = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const monthStart = () => todayStr().slice(0, 8) + '01';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const PAY_METHODS = { especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte bancaire', cheque: 'Chèque', virement: 'Virement' };
export const SALE_STATUS = { payee: ['Payée', 'green'], partielle: ['Partielle', 'orange'], credit: ['Crédit', 'red'], annulee: ['Annulée', 'grey'] };
export const MOVE_TYPES = {
  initial: 'Stock initial', entree: 'Entrée', sortie: 'Sortie', vente: 'Vente', achat: 'Achat', annulation: 'Annulation vente',
  transfert_entree: 'Transfert (entrée)', transfert_sortie: 'Transfert (sortie)', inventaire: 'Inventaire',
};
export const ROLES = { admin: 'Administrateur', gerant: 'Gérant', caissier: 'Caissier' };
export const can = (role) => ({ caissier: 1, gerant: 2, admin: 3 }[state.user?.role] || 0) >= ({ caissier: 1, gerant: 2, admin: 3 }[role]);

export const badge = (text, color = 'grey') => h('span.badge', { class: 'b-' + color }, text);
export const statusBadge = (s) => badge(...(SALE_STATUS[s] || [s, 'grey']));

// ---------- Notifications ----------
export function toast(msg, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div#toasts'); document.body.append(box); }
  const t = h('div.toast', { class: 't-' + type }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------- Fenêtres (modales) ----------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div.overlay', { onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div.modal', { class: wide ? 'wide' : '' },
      h('div.modal-head', h('h3', title), h('button.icon-btn', { onclick: close, title: 'Fermer' }, icon('x'))),
      h('div.modal-body', body),
      actions.length ? h('div.modal-foot', actions.map((a) => h('button.btn', {
        class: a.primary ? 'primary' : a.danger ? 'danger' : '', type: 'button',
        onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { const r = await a.onClick(close); if (r !== false && a.close !== false) close(); }
          catch (err) { toast(err.message, 'error'); }
          finally { b.disabled = false; }
        },
      }, a.label))) : null));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  setTimeout(() => overlay.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return { close, overlay };
}

export function confirmBox(message, { okLabel = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title: 'Confirmation', body: h('p', message),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Annuler', onClick: () => {} },
        { label: okLabel, primary: !danger, danger, onClick: () => { done = true; resolve(true); } },
      ],
    });
  });
}

// ---------- Formulaires ----------
// fields : [{ name, label, type: text|number|select|textarea|checkbox|date|password|email, options:[[val,label]], required, full, help }]
export function buildForm(fields, values = {}) {
  const form = h('form.form-grid', { onsubmit: (e) => e.preventDefault() });
  for (const f of fields) {
    if (f.type === 'section') { form.append(h('div.form-section.full', f.label)); continue; }
    const v = values[f.name] ?? f.default ?? '';
    let input;
    if (f.type === 'select') {
      input = h('select', { name: f.name }, (f.options || []).map(([val, lab]) => h('option', { value: val, selected: String(val) === String(v) }, lab)));
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.name, rows: 3, placeholder: f.placeholder || '' }, v);
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', name: f.name, checked: !!Number(v) || v === true });
      form.append(h('label.check', { class: f.full ? 'full' : '' }, input, ' ', f.label));
      continue;
    } else {
      input = h('input', { type: f.type || 'text', name: f.name, value: v, placeholder: f.placeholder || '',
        step: f.type === 'number' ? (f.step || 'any') : null, min: f.min, required: f.required, autocomplete: 'off' });
    }
    form.append(h('label.field', { class: f.full ? 'full' : '' }, h('span', f.label, f.required ? h('b.req', ' *') : null), input, f.help ? h('small', f.help) : null));
  }
  form.values = () => {
    const out = {};
    for (const f of fields) {
      if (f.type === 'section') continue;
      const el = form.elements[f.name];
      out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    }
    return out;
  };
  return form;
}

export function formModal({ title, fields, values, onSubmit, submitLabel = 'Enregistrer', wide }) {
  const form = buildForm(fields, values);
  const m = modal({
    title, body: form, wide,
    actions: [{ label: 'Annuler', onClick: () => {} }, { label: submitLabel, primary: true, onClick: () => onSubmit(form.values()) }],
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); m.overlay.querySelector('.btn.primary').click(); }
  });
  return m;
}

// ---------- Listes (tableau sur PC, cartes sur téléphone) ----------
export function table(columns, rows, { onRow, empty = 'Aucun élément', foot } = {}) {
  if (!rows.length) return h('div.empty', icon('box', 40), h('p', empty));
  return h('div.table-wrap', h('table.list',
    h('thead', h('tr', columns.map((c) => h('th', { class: c.align === 'right' ? 'r' : '' }, c.label)))),
    h('tbody', rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null },
      columns.map((c) => h('td', { class: (c.align === 'right' ? 'r ' : '') + (c.main ? 'main' : ''), 'data-label': c.label },
        c.render ? c.render(r) : r[c.key] ?? ''))))),
    foot ? h('tfoot', h('tr', columns.map((c, i) => h('td', { class: c.align === 'right' ? 'r' : '' }, foot[i] ?? '')))) : null));
}

export function loading() { return h('div.loading', h('div.spinner')); }

export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function options(list, { empty } = {}) {
  return [...(empty !== undefined ? [['', empty]] : []), ...list.map((x) => [x.id, x.name])];
}

// En-tête de page standard : titre + fil d'Ariane + boutons
export function pageHead(title, { back, actions = [], sub } = {}) {
  return h('div.page-head',
    h('div.ph-left',
      back ? h('a.icon-btn', { href: back, title: 'Retour' }, icon('back')) : null,
      h('div', h('h1', title), sub ? h('div.sub', sub) : null)),
    h('div.ph-actions', actions));
}

export function btn(label, onClick, { primary, danger, ico, title, small } = {}) {
  return h('button.btn', { class: [primary && 'primary', danger && 'danger', small && 'small'].filter(Boolean).join(' '), onclick: onClick, title, type: 'button' },
    ico ? icon(ico, 18) : null, label ? h('span', label) : null);
}
