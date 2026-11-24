import { h, clear, state, GET, POST, PUT, DEL, money, table, pageHead, btn, toast, formModal, buildForm, confirmBox, options,
  badge, download, ROLES, fmtDate } from '../core.js';
import { loadRefs } from '../app.js';

const TABS = [['entreprise', 'Entreprise'], ['utilisateurs', 'Utilisateurs'], ['depots', 'Dépôts / magasins'], ['categories', 'Catégories'],
  ['connexion', 'Téléphones & PC'], ['sauvegarde', 'Sauvegarde']];

export async function settingsPage(page, tab = 'entreprise') {
  const body = h('div');
  clear(page, pageHead('Paramètres'),
    h('div.tabs', TABS.map(([k, l]) => h('a', { href: '#/parametres/' + k, class: k === tab ? 'active' : '' }, l))), body);
  const fn = { entreprise: companyTab, utilisateurs: usersTab, depots: warehousesTab, categories: categoriesTab, connexion: connectTab, sauvegarde: backupTab }[tab] || companyTab;
  await fn(body, () => settingsPage(page, tab));
}

async function companyTab(body) {
  const c = await GET('/company');
  const form = buildForm([
    { name: 'name', label: "Nom de l'entreprise", required: true },
    { name: 'currency', label: 'Monnaie', type: 'select', options: [['FCFA', 'FCFA (XAF / XOF)'], ['CDF', 'Franc congolais (CDF)'], ['GNF', 'Franc guinéen (GNF)'], ['MAD', 'Dirham (MAD)'], ['EUR', 'Euro (€)'], ['USD', 'Dollar ($)']] },
    { name: 'phone', label: 'Téléphone' }, { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'address', label: 'Adresse', full: true },
    { name: 'tax_id', label: 'NIU / RCCM', help: 'Affiché sur les tickets et factures' },
    { name: 'tax_rate', label: 'TVA (%)', type: 'number', min: 0, help: '0 si vos prix sont déjà TTC ou sans TVA' },
    { name: 'receipt_footer', label: 'Message en bas du ticket', full: true },
    { name: 'allow_negative_stock', label: 'Autoriser la vente même si le stock est à zéro', type: 'checkbox', full: true },
  ], c);
  clear(body, h('div.card', { style: { maxWidth: '800px' } }, form,
    h('div', { style: { marginTop: '16px', textAlign: 'right' } }, btn('Enregistrer', async () => {
      try { state.company = await PUT('/company', form.values()); toast('Paramètres enregistrés'); } catch (e) { toast(e.message, 'error'); }
    }, { primary: true }))));
}

async function usersTab(body, reload) {
  const users = await GET('/users');
  const fields = (isNew) => [
    { name: 'name', label: 'Nom', required: true }, { name: 'email', label: 'E-mail (identifiant)', type: 'email', required: true },
    { name: 'role', label: 'Rôle', type: 'select', options: Object.entries(ROLES) },
    { name: 'warehouse_id', label: 'Dépôt / magasin', type: 'select', options: options(state.warehouses, { empty: '— Tous —' }) },
    { name: 'password', label: isNew ? 'Mot de passe' : 'Nouveau mot de passe (laisser vide pour ne pas changer)', type: 'password', full: true },
    ...(isNew ? [] : [{ name: 'active', label: 'Compte actif', type: 'checkbox' }]),
  ];
  const edit = (u) => formModal({ title: u ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur', fields: fields(!u), values: u || { role: 'caissier' },
    onSubmit: async (v) => { if (u) await PUT('/users/' + u.id, v); else await POST('/users', v); toast('Utilisateur enregistré'); reload(); } });
  clear(body,
    h('div.card', { style: { marginBottom: '14px' } }, h('b', 'Les rôles : '),
      h('p.muted', { style: { margin: '6px 0 0' } }, 'Caissier : caisse, ses ventes, clients. — Gérant : tout sauf les paramètres. — Administrateur : tout.')),
    h('div.toolbar', btn('Nouvel utilisateur', () => edit(null), { primary: true, ico: 'plus' })),
    table([
      { label: 'Nom', key: 'name', main: true }, { label: 'E-mail', key: 'email' },
      { label: 'Rôle', render: (u) => badge(ROLES[u.role], u.role === 'admin' ? 'blue' : u.role === 'gerant' ? 'green' : 'grey') },
      { label: 'Dépôt', render: (u) => u.warehouse || 'Tous' },
      { label: 'État', render: (u) => (u.active ? badge('Actif', 'green') : badge('Désactivé', 'red')) },
    ], users, { onRow: edit }));
}

async function warehousesTab(body, reload) {
  const list = await GET('/warehouses?all=1');
  const edit = (w) => formModal({ title: w ? 'Modifier le dépôt' : 'Nouveau dépôt / magasin',
    fields: [{ name: 'name', label: 'Nom', required: true, full: true }, { name: 'address', label: 'Adresse / ville', full: true },
      ...(w ? [{ name: 'active', label: 'Actif', type: 'checkbox' }] : [])],
    values: w || {},
    onSubmit: async (v) => { if (w) await PUT('/warehouses/' + w.id, v); else await POST('/warehouses', v); await loadRefs(); toast('Dépôt enregistré'); reload(); } });
  clear(body,
    h('div.toolbar', btn('Nouveau dépôt', () => edit(null), { primary: true, ico: 'plus' })),
    table([
      { label: 'Nom', key: 'name', main: true }, { label: 'Adresse', render: (w) => w.address || '' },
      { label: 'Produits en stock', align: 'right', key: 'products' },
      { label: 'Valeur du stock', align: 'right', render: (w) => money(w.value) },
      { label: 'État', render: (w) => (w.active ? badge('Actif', 'green') : badge('Fermé', 'grey')) },
    ], list, { onRow: edit }));
}

async function categoriesTab(body, reload) {
  const list = await GET('/categories');
  const edit = (c) => formModal({ title: c ? 'Modifier la catégorie' : 'Nouvelle catégorie', fields: [{ name: 'name', label: 'Nom', required: true, full: true }], values: c || {},
    onSubmit: async (v) => { if (c) await PUT('/categories/' + c.id, v); else await POST('/categories', v); await loadRefs(); reload(); } });
  clear(body,
    h('div.toolbar', btn('Nouvelle catégorie', () => edit(null), { primary: true, ico: 'plus' })),
    table([
      { label: 'Nom', key: 'name', main: true }, { label: 'Produits', align: 'right', key: 'products' },
      { label: '', render: (c) => btn('', async (e) => {
        e.stopPropagation();
        if (await confirmBox(`Supprimer « ${c.name} » ? Les produits resteront, sans catégorie.`, { danger: true })) { await DEL('/categories/' + c.id); await loadRefs(); reload(); }
      }, { small: true, ico: 'trash' }) },
    ], list, { onRow: edit }));
}

async function connectTab(body) {
  const info = await GET('/server-info');
  const here = location.origin;
  clear(body, h('div.grid.g2',
    h('div.card', h('h2', '📱 Sur téléphone (Android / iPhone)'),
      h('ol', { style: { paddingLeft: '18px', lineHeight: 1.8 } },
        h('li', 'Ouvrez Chrome (ou Safari) sur le téléphone.'),
        h('li', 'Tapez cette adresse : ', h('b', info.desktop && info.urls[0] ? info.urls[0] : here)),
        h('li', 'Menu ⋮ → « Ajouter à l\'écran d\'accueil » / « Installer l\'application ».'),
        h('li', 'Connectez-vous avec votre e-mail et mot de passe.')),
      info.desktop ? h('div', h('p.muted', 'Ce PC sert de serveur. Les téléphones doivent être sur le même Wi-Fi. Adresses de ce PC :'),
        info.urls.map((u) => h('div', h('code', u)))) : null),
    h('div.card', h('h2', '💻 Sur Windows'),
      h('p', "Installez l'application « MCS Gestion » (fichier .exe). Au premier lancement, choisissez :"),
      h('ul', { style: { lineHeight: 1.8 } },
        h('li', h('b', 'Serveur en ligne'), ' : tapez l\'adresse ', h('code', here), ' — tous vos appareils partagent les mêmes données.'),
        h('li', h('b', 'Ce PC (hors ligne)'), ' : les données restent sur ce PC, même sans internet.')))));
}

async function backupTab(body) {
  clear(body, h('div.card', { style: { maxWidth: '700px' } },
    h('h2', 'Sauvegarde de vos données'),
    h('p', 'Téléchargez régulièrement une copie complète de vos données (produits, stock, ventes, clients…). Gardez-la sur une clé USB ou dans Google Drive.'),
    btn('Télécharger la sauvegarde', () => download('/backup', `sauvegarde-mcs-${new Date().toISOString().slice(0, 10)}.json`), { primary: true, ico: 'download' }),
    h('p.muted', { style: { marginTop: '14px' } }, `Entreprise créée le ${fmtDate(state.company.created_at)}.`)));
}

