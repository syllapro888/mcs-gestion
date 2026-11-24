'use strict';
// Application Windows MCS Gestion (Electron).
// Deux modes :
//   - « local »  : le serveur tourne sur ce PC, les données restent sur ce PC (marche sans internet).
//                  Les téléphones du même Wi-Fi peuvent s'y connecter.
//   - « distant » : l'application ouvre votre serveur en ligne (données partagées entre boutiques).
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_DIR = path.join(__dirname, 'app');
const USER_DIR = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DIR, 'config.json');
const DATA_DIR = path.join(USER_DIR, 'donnees');
const BACKUP_DIR = path.join(USER_DIR, 'sauvegardes');

let win = null;
let local = null; // { server, db, port }

const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return null; } };
const writeConfig = (c) => { fs.mkdirSync(USER_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); };

async function startLocalServer(preferredPort = 4800) {
  if (local) return local;
  process.env.MCS_DESKTOP = '1';
  const { start } = require(path.join(APP_DIR, 'server', 'index.js'));
  const opts = { host: '0.0.0.0', dataDir: DATA_DIR, webDir: path.join(APP_DIR, 'web') };
  try {
    local = await start({ ...opts, port: preferredPort });
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    local = await start({ ...opts, port: 0 }); // port occupé : on en prend un autre
  }
  autoBackup();
  return local;
}

// Copie automatique de la base chaque jour (30 dernières gardées)
function autoBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `mcs-gestion-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(file)) local.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse().slice(30);
    old.forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (e) { console.error('Sauvegarde automatique impossible :', e.message); }
}

function errorPage(title, message) {
  const html = `<!DOCTYPE html><meta charset="utf-8"><body style="font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f3f4f6">
  <div style="background:#fff;padding:30px;border-radius:14px;max-width:480px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.1)">
  <h2 style="color:#0e6e5c">${title}</h2><p>${message}</p>
  <button onclick="mcs.retry()" style="padding:10px 18px;border-radius:8px;border:0;background:#0e6e5c;color:#fff;font-size:15px;cursor:pointer">Réessayer</button>
  <button onclick="mcs.reset()" style="padding:10px 18px;border-radius:8px;border:1px solid #ddd;background:#fff;font-size:15px;cursor:pointer;margin-left:8px">Changer de mode</button>
  </div></body>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

async function openApp() {
  const cfg = readConfig();
  if (!cfg) return win.loadFile(path.join(__dirname, 'setup.html'));
  if (cfg.mode === 'distant') {
    const url = cfg.url.replace(/\/+$/, '');
    try {
      const r = await fetch(url + '/api/health', { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return win.loadURL(url + '/');
    } catch (e) {
      return errorPage('Serveur injoignable', `Impossible de joindre <b>${url}</b>.<br>Vérifiez votre connexion internet.`);
    }
  }
  try {
    const s = await startLocalServer(cfg.port || 4800);
    win.loadURL(`http://localhost:${s.port}/`);
  } catch (e) {
    errorPage('Démarrage impossible', String(e.message || e));
  }
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Fichier', submenu: [
      { label: 'Accueil', accelerator: 'CmdOrCtrl+H', click: () => openApp() },
      { label: 'Changer de mode (ce PC / serveur en ligne)…', click: resetMode },
      { type: 'separator' },
      { label: 'Ouvrir le dossier des sauvegardes', click: () => { fs.mkdirSync(BACKUP_DIR, { recursive: true }); shell.openPath(BACKUP_DIR); } },
      { label: 'Ouvrir le dossier des données', click: () => { fs.mkdirSync(DATA_DIR, { recursive: true }); shell.openPath(DATA_DIR); } },
      { type: 'separator' },
      { role: 'quit', label: 'Quitter' },
    ] },
    { label: 'Affichage', submenu: [
      { role: 'reload', label: 'Recharger' }, { role: 'togglefullscreen', label: 'Plein écran' },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' }, { role: 'resetZoom', label: 'Taille normale' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' },
    ] },
    { label: 'Aide', submenu: [
      { label: 'Adresse pour les téléphones', click: showPhoneAddress },
      { label: 'À propos', click: () => dialog.showMessageBox(win, { type: 'info', title: 'MCS Gestion', message: `MCS Gestion ${app.getVersion()}`, detail: 'Ventes, caisse, stock, dépôts et inventaires.' }) },
    ] },
  ]));
}

function lanUrls(port) {
  const out = [];
  for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
  return out;
}

function showPhoneAddress() {
  const cfg = readConfig() || {};
  const detail = cfg.mode === 'distant'
    ? `Sur le téléphone, ouvrez simplement : ${cfg.url}`
    : local ? `Téléphone connecté au même Wi-Fi que ce PC, ouvrez dans Chrome :\n\n${lanUrls(local.port).join('\n') || '(aucun réseau détecté)'}\n\nSi ça ne marche pas, autorisez « MCS Gestion » dans le pare-feu Windows.` : 'Le serveur local n\'est pas démarré.';
  dialog.showMessageBox(win, { type: 'info', title: 'Connexion des téléphones', message: 'Utiliser MCS Gestion sur téléphone', detail });
}

async function resetMode() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Annuler', 'Changer'], defaultId: 1, cancelId: 0,
    title: 'Changer de mode', message: 'Revenir à l\'écran de choix du mode ?', detail: 'Vos données locales ne sont pas supprimées.',
  });
  if (response === 1) { try { fs.unlinkSync(CONFIG_FILE); } catch {} openApp(); }
}

ipcMain.handle('save-config', async (_e, cfg) => {
  if (cfg.mode === 'distant') {
    let url = String(cfg.url || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/api/health', { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (!j.ok) throw new Error();
    } catch { return { ok: false, error: "Ce serveur ne répond pas. Vérifiez l'adresse et internet." }; }
    writeConfig({ mode: 'distant', url });
  } else {
    writeConfig({ mode: 'local', port: 4800 });
  }
  setTimeout(openApp, 50);
  return { ok: true };
});
ipcMain.handle('retry', () => openApp());
ipcMain.handle('reset', () => { try { fs.unlinkSync(CONFIG_FILE); } catch {} openApp(); });

// ---------- Test automatique (utilisé par GitHub Actions) ----------
async function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcs-selftest-'));
  const { start } = require(path.join(APP_DIR, 'server', 'index.js'));
  const s = await start({ port: 0, host: '127.0.0.1', dataDir: dir, webDir: path.join(APP_DIR, 'web') });
  const base = `http://127.0.0.1:${s.port}`;
  const health = await (await fetch(base + '/api/health')).json();
  const reg = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: 'Test', name: 'Test', email: 'test@test.cg', password: 'secret1' }) })).json();
  const page = await (await fetch(base + '/')).text();
  if (!health.ok || !reg.token || !page.includes('MCS Gestion')) throw new Error('Auto-test échoué');
  s.server.close();
  console.log('AUTO-TEST OK — sqlite + serveur + interface fonctionnent dans Electron', process.versions.electron, 'node', process.versions.node);
}

if (process.argv.includes('--self-test')) {
  app.whenReady().then(selfTest).then(() => app.exit(0)).catch((e) => { console.error(e); app.exit(1); });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    buildMenu();
    win = new BrowserWindow({
      width: 1366, height: 820, minWidth: 900, minHeight: 600, title: 'MCS Gestion', show: false,
      icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#f3f4f6',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    // Les liens externes s'ouvrent dans le navigateur
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    // Téléchargements (sauvegardes, exports) : demander où enregistrer
    win.webContents.session.on('will-download', (_e, item) => {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    });
    openApp();
  });
  app.on('window-all-closed', () => { if (local) local.server.close(); app.quit(); });
}
