// Copie le serveur et l'interface web dans desktop/app avant de lancer ou d'emballer l'application.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const dest = path.resolve(__dirname, '..', 'app');
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['server', 'web']) {
  fs.cpSync(path.join(root, dir), path.join(dest, dir), {
    recursive: true,
    filter: (src) => !/(test\.js|node_modules|\.db)$/.test(src),
  });
}
console.log('Application préparée dans', dest);
