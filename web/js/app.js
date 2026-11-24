// Point d'entrée : connexion, barre de menu, navigation entre les modules.
import { h, clear, icon, state, GET, POST, setToken, getToken, toast, can, ROLES, loading, modal, buildForm } from './core.js';
import { dashboardPage } from './pages/dashboard.js';
import { posPage } from './pages/pos.js';
import { salesPage, saleDetailPage } from './pages/sales.js';
import { productsPage, productDetailPage } from './pages/products.js';
import { stockPage, transfersPage, inventoriesPage, inventoryDetailPage, movesPage } from './pages/stock.js';
import { purchasesPage, purchaseDetailPage } from './pages/purchases.js';
import { partnersPage, partnerDetailPage } from './pages/partners.js';
import { expensesPage } from './pages/expenses.js';
import { reportsPage } from './pages/reports.js';
import { settingsPage } from './pages/settings.js';

// Modules (comme les applications Odoo)
export const APPS = [
  { path: 'caisse', label: 'Caisse', icon: 'cart', color: '#e8913a', role: 'caissier' },
  { path: 'tableau-de-bord', label: 'Tableau de bord', icon: 'chart', color: '#0e6e5c', role: 'caissier' },
  { path: 'ventes', label: 'Ventes', icon: 'receipt', color: '#2563eb', role: 'caissier' },
  { path: 'produits', label: 'Produits', icon: 'box', color: '#7c3aed', role: 'caissier' },
  { path: 'stock', label: 'Stock & dépôts', icon: 'warehouse', color: '#0891b2', role: 'gerant' },
  { path: 'achats', label: 'Achats', icon: 'truck', color: '#4f46e5', role: 'gerant' },
  { path: 'clients', label: 'Clients', icon: 'users', color: '#db2777', role: 'caissier' },
  { path: 'fournisseurs', label: 'Fournisseurs', icon: 'users', color: '#9333ea', role: 'gerant' },
  { path: 'depenses', label: 'Dépenses', icon: 'wallet', color: '#dc2626', role: 'gerant' },
  { path: 'rapports', label: 'Rapports', icon: 'chart', color: '#059669', role: 'gerant' },
  { path: 'parametres', label: 'Paramètres', icon: 'settings', color: '#475569', role: 'admin' },
];

const ROUTES = [
  [/^$/, homePage],
  [/^tableau-de-bord$/, dashboardPage],
  [/^caisse$/, posPage],
  [/^ventes$/, salesPage], [/^ventes\/(\d+)$/, saleDetailPage],
  [/^produits$/, productsPage], [/^produits\/(\d+)$/, productDetailPage],
  [/^stock$/, stockPage], [/^stock\/mouvements$/, movesPage], [/^stock\/transferts$/, transfersPage],
  [/^stock\/inventaires$/, inventoriesPage], [/^stock\/inventaires\/(\d+)$/, inventoryDetailPage],
  [/^achats$/, purchasesPage], [/^achats\/(\d+)$/, purchaseDetailPage],
  [/^(clients|fournisseurs)$/, partnersPage], [/^(clients|fournisseurs)\/(\d+)$/, partnerDetailPage],
  [/^depenses$/, expensesPage],
  [/^rapports$/, reportsPage],
  [/^parametres(?:\/(\w+))?$/, settingsPage],
];

const root = document.getElementById('app');
let shell = null;

// ---------- Connexion / inscription ----------
function authPage(mode) {
  const isLogin = mode === 'login';
  const fields = isLogin
    ? [{ name: 'email', label: 'E-mail', type: 'email', full: true }, { name: 'password', label: 'Mot de passe', type: 'password', full: true }]
    : [{ name: 'company', label: "Nom de l'entreprise / boutique", full: true }, { name: 'name', label: 'Votre nom', full: true },
       { name: 'phone', label: 'Téléphone', full: true }, { name: 'email', label: 'E-mail', type: 'email', full: true },
       { name: 'password', label: 'Mot de passe (6 caractères minimum)', type: 'password', full: true }];
  const form = buildForm(fields);
  const submit = h('button.btn.primary', { type: 'submit' }, isLogin ? 'Se connecter' : 'Créer mon entreprise');
  form.append(submit);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      const res = await POST(isLogin ? '/auth/login' : '/auth/register', form.values());
      setToken(res.token);
      state.user = res.user; state.company = res.company;
      await loadRefs();
      location.hash = can('gerant') ? '#/tableau-de-bord' : '#/caisse';
      if (!isLogin) toast('Bienvenue ! Votre entreprise est créée.');
    } catch (err) { toast(err.message, 'error'); }
    submit.disabled = false;
  };
  shell = null;
  clear(root, h('div.auth-page', h('div.auth-box',
    h('div.brand-logo', 'MCS'), h('h1', 'MCS Gestion'),
    h('div.sub', isLogin ? 'Connectez-vous à votre espace' : 'Créez votre compte en 1 minute'),
    form,
    h('div.switch', isLogin
      ? ['Pas encore de compte ? ', h('a', { href: '#/inscription' }, 'Créer une entreprise')]
      : ['Déjà inscrit ? ', h('a', { href: '#/connexion' }, 'Se connecter')]),
    isLogin && location.hostname.match(/localhost|127\.0\.0\.1/) ? h('div.demo-hint', 'Démo : demo@mcs.cg / demo123 (si les données de démonstration sont installées)') : null,
  )));
}

export async function loadRefs() {
  const [w, c] = await Promise.all([GET('/warehouses'), GET('/categories')]);
  state.warehouses = w; state.categories = c;
}

// ---------- Barre de menu ----------
function buildShell() {
  const nav = h('nav.topnav');
  const page = h('main#page');
  const initials = (state.user.name || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  let dd = null;
  const userBtn = h('button.user-chip', {
    onclick: (e) => {
      e.stopPropagation();
      if (dd) { dd.remove(); dd = null; return; }
      dd = h('div.dropdown',
        h('div.dd-head', h('b', state.user.name), h('div.muted', state.user.email), h('div.muted', ROLES[state.user.role] + ' — ' + state.company.name)),
        h('a', { href: '#/' }, icon('home', 18), 'Accueil'),
        h('button', { onclick: changePassword }, icon('settings', 18), 'Changer mon mot de passe'),
        h('button', { onclick: logout }, icon('logout', 18), 'Se déconnecter'));
      document.body.append(dd);
      setTimeout(() => document.addEventListener('click', () => { dd?.remove(); dd = null; }, { once: true }));
    },
  }, h('span.u-name', state.user.name), h('div.avatar', initials));

  for (const a of APPS.filter((x) => can(x.role))) {
    nav.append(h('a', { href: '#/' + a.path, 'data-path': a.path, onclick: () => nav.classList.remove('open') }, a.label));
  }
  // Les modules qui ne tiennent pas dans la barre passent dans « Plus »
  const more = h('div.nav-more', h('button.nav-more-btn', { type: 'button', onclick: (e) => { e.stopPropagation(); more.classList.toggle('open'); } }, 'Plus ▾'), h('div.nav-more-list'));
  document.addEventListener('click', () => more.classList.remove('open'));
  nav.append(more);
  const fit = () => {
    const list = more.querySelector('.nav-more-list');
    for (const a of [...list.children]) nav.insertBefore(a, more);
    more.style.display = 'none';
    if (window.innerWidth <= 1230) return;
    const links = [...nav.querySelectorAll(':scope > a')];
    if (nav.scrollWidth <= nav.clientWidth) return;
    more.style.display = '';
    while (nav.scrollWidth > nav.clientWidth && links.length) list.prepend(links.pop());
  };
  window.addEventListener('resize', fit);
  setTimeout(fit);
  const bar = h('header.topbar',
    h('button.icon-btn.menu-btn', { onclick: () => nav.classList.toggle('open'), title: 'Menu' }, icon('menu')),
    h('a.brand', { href: '#/' }, h('div.brand-logo', 'MCS'), h('span', state.company.name)),
    nav, h('div.spacer'), userBtn);
  clear(root, bar, page);
  shell = { nav, page };
}

function changePassword() {
  const form = buildForm([
    { name: 'current', label: 'Mot de passe actuel', type: 'password', full: true },
    { name: 'password', label: 'Nouveau mot de passe', type: 'password', full: true },
  ]);
  modal({ title: 'Changer mon mot de passe', body: form, actions: [
    { label: 'Annuler', onClick: () => {} },
    { label: 'Enregistrer', primary: true, onClick: async () => { await POST('/auth/password', form.values()); toast('Mot de passe modifié'); } },
  ] });
}

function logout() {
  setToken(null); state.user = null; shell = null;
  location.hash = '#/connexion';
}

// ---------- Accueil : grille des modules ----------
function homePage(page) {
  const hour = new Date().getHours();
  clear(page,
    h('div.welcome', h('h1', `${hour < 18 ? 'Bonjour' : 'Bonsoir'}, ${state.user.name.split(' ')[0]} 👋`), h('p.muted', state.company.name + ' — que voulez-vous faire ?')),
    h('div.apps', APPS.filter((a) => can(a.role)).map((a) => h('a.app-tile', { href: '#/' + a.path },
      h('div.app-icon', { style: { background: a.color } }, icon(a.icon, 34)), h('span', a.label)))));
}

// ---------- Navigation ----------
let navToken = 0;
async function route() {
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (path === 'connexion') return authPage('login');
  if (path === 'inscription') return authPage('register');
  if (!getToken()) { location.hash = '#/connexion'; return; }
  if (!state.user) {
    clear(root, loading());
    try {
      const me = await GET('/auth/me');
      state.user = me.user; state.company = me.company;
      await loadRefs();
    } catch (e) {
      if (getToken()) { // serveur injoignable
        clear(root, h('div.auth-page', h('div.auth-box', h('h1', 'Serveur injoignable'), h('p.sub', e.message),
          h('button.btn.primary', { onclick: () => location.reload() }, 'Réessayer'))));
      }
      return;
    }
  }
  if (!shell) buildShell();
  const my = ++navToken;
  for (const a of shell.nav.querySelectorAll('a[data-path]')) a.classList.toggle('active', path.startsWith(a.dataset.path));
  const found = ROUTES.find(([re]) => re.test(path));
  const page = shell.page;
  document.body.classList.toggle('on-pos', path === 'caisse');
  clear(page, loading());
  window.scrollTo(0, 0);
  if (!found) return clear(page, h('div.empty', h('p', 'Page introuvable'), h('a', { href: '#/' }, "Retour à l'accueil")));
  const app = APPS.find((a) => path.startsWith(a.path));
  if (app && !can(app.role) && !(path.startsWith('parametres') && can('admin'))) {
    return clear(page, h('div.empty', h('p', "Vous n'avez pas accès à ce module.")));
  }
  try {
    const m = path.match(found[0]);
    await found[1](page, ...m.slice(1), () => my === navToken);
  } catch (e) {
    if (my === navToken) clear(page, h('div.empty', icon('alert', 40), h('p', e.message)));
  }
}

export const refresh = route;
window.addEventListener('hashchange', route);
route();
