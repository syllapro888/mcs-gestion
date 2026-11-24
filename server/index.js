'use strict';
// Démarrage du serveur MCS Gestion.
//   node server/index.js            -> démarre sur le port 4800
//   node server/index.js --demo     -> crée aussi une entreprise de démonstration
// Variables : PORT, HOST, DATA_DIR, ALLOW_SIGNUP=false, APP_SECRET
const path = require('path');
const os = require('os');
const { createApp } = require('./app');

function lanAddresses(port) {
  const list = [];
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) list.push(`http://${i.address}:${port}`);
  }
  return list;
}

function start({ port = 4800, host = '0.0.0.0', dataDir, webDir, demo = false } = {}) {
  const dir = dataDir || path.join(__dirname, '..', 'data');
  const { server, db } = createApp({
    dbFile: path.join(dir, 'mcs-gestion.db'),
    webDir: webDir || path.join(__dirname, '..', 'web'),
  });
  if (demo) require('./demo').seed(db);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const real = server.address().port;
      resolve({ server, db, port: real, urls: [`http://localhost:${real}`, ...lanAddresses(real)] });
    });
  });
}

module.exports = { start, lanAddresses };

if (require.main === module) {
  start({
    port: Number(process.env.PORT) || 4800,
    host: process.env.HOST || '0.0.0.0',
    dataDir: process.env.DATA_DIR,
    demo: process.argv.includes('--demo'),
  }).then(({ urls }) => {
    console.log('MCS Gestion est démarré :');
    urls.forEach((u) => console.log('  ' + u));
  }).catch((e) => { console.error('Impossible de démarrer :', e.message); process.exit(1); });
}
