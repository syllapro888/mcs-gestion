# MCS Gestion

Logiciel de **gestion commerciale** simple, comme Odoo : caisse, ventes, stock, dépôts, inventaires, achats, clients, crédits, dépenses et rapports.

Il marche sur **Windows** (application à installer, fichier .exe), sur **téléphone** (Android et iPhone) et dans n'importe quel **navigateur**.

---

## Fonctions

| Module | Ce qu'il fait |
|---|---|
| **Caisse** | Vente rapide au doigt ou à la souris, lecteur de code-barres, remise, Espèces / Mobile Money / Carte / Chèque, monnaie à rendre, vente à crédit, ticket 80 mm et facture A4 |
| **Tableau de bord** | Ventes du jour et du mois, bénéfice, crédits clients, valeur du stock, alertes de stock bas, meilleurs produits |
| **Ventes** | Historique, recherche, paiements partiels, annulation avec retour en stock, réimpression |
| **Produits** | Prix de vente et d'achat, marge, code-barres, catégories, unités, stock minimum, import et export Excel (CSV) |
| **Stock et dépôts** | Plusieurs dépôts ou magasins, stock par dépôt, entrées et sorties, transferts entre dépôts, historique des mouvements |
| **Inventaires** | Comptage physique, calcul des écarts et correction automatique du stock |
| **Achats** | Réception fournisseur, mise à jour du coût moyen, dettes fournisseurs |
| **Clients** | Fiche client, historique, **crédits (dettes)** et remboursements |
| **Dépenses** | Loyer, salaires, électricité… pour calculer le vrai bénéfice net |
| **Rapports** | Par jour, produit, catégorie, vendeur, dépôt et mode de paiement, export Excel, impression |
| **Paramètres** | Entreprise, monnaie (FCFA par défaut), TVA, utilisateurs et rôles, dépôts, catégories, sauvegarde |

**Rôles :** *Caissier* (caisse et ses ventes) · *Gérant* (tout sauf les paramètres) · *Administrateur* (tout).

**SaaS :** plusieurs entreprises peuvent s'inscrire sur le même serveur. Chacune ne voit que ses propres données.

---

## 1. Installer sur Windows (.exe)

L'installateur est fabriqué **automatiquement par GitHub** à chaque modification du code :

1. Sur la page GitHub du projet, cliquez sur **Releases** (colonne de droite).
2. Dans la dernière version, téléchargez **`MCS-Gestion-Setup-1.0.0.exe`**.
3. Double-cliquez sur le fichier et suivez l'installation.

Au premier lancement, choisissez :

- **Sur ce PC (hors ligne)** : tout fonctionne sans internet, les données restent sur le PC et une sauvegarde est faite chaque jour. Les téléphones branchés sur le **même Wi-Fi** peuvent s'y connecter (menu *Aide → Adresse pour les téléphones*).
- **Serveur en ligne** : vous tapez l'adresse de votre serveur. Toutes vos boutiques et tous vos téléphones partagent alors les mêmes données.

> Windows peut afficher « Windows a protégé votre ordinateur » parce que l'application n'est pas signée. Cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## 2. Mettre le serveur en ligne (vrai SaaS)

Le serveur n'a **aucune dépendance** : il faut seulement Node.js 22.13 ou plus récent.

**Sur un VPS (Ubuntu) :**
```bash
git clone https://github.com/syllapro888/mcs-gestion.git
cd mcs-gestion
PORT=4800 DATA_DIR=/var/lib/mcs node server/index.js
```
Placez-le ensuite derrière Nginx ou Caddy avec HTTPS (nom de domaine), et lancez-le comme service avec `pm2` ou `systemd`.

**Avec Docker :**
```bash
docker build -t mcs-gestion .
docker run -d -p 4800:4800 -v mcs-data:/data --restart always mcs-gestion
```

**Variables utiles :**
| Variable | Rôle |
|---|---|
| `PORT` | Port (4800 par défaut) |
| `DATA_DIR` | Dossier de la base de données |
| `ALLOW_SIGNUP=false` | Ferme les inscriptions publiques (après la création de votre entreprise) |
| `APP_SECRET` | Clé secrète des connexions (sinon générée automatiquement) |

## 3. Sur téléphone

Ouvrez l'adresse du serveur dans Chrome (Android) ou Safari (iPhone), puis choisissez **« Ajouter à l'écran d'accueil »**. L'application s'installe comme une vraie application, avec une interface adaptée au téléphone.

---

## Pour les développeurs

```bash
npm run demo     # démarre avec une boutique de démonstration → http://localhost:4800
                 # comptes : demo@mcs.cg / gerant@mcs.cg / caisse@mcs.cg — mot de passe demo123
npm test         # 20 tests automatiques de l'API
cd desktop && npm install && npm start   # lancer l'application Windows en développement
```

**Organisation :**
```
server/    API Node.js + base SQLite (node:sqlite intégré, aucun paquet à installer)
web/       Interface (HTML/CSS/JS sans compilation), installable sur téléphone (PWA)
desktop/   Application Windows (Electron) + fabrication de l'installateur .exe
.github/   Tests et fabrication automatique de l'installateur Windows
```
