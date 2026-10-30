# Dossier médical décentralisé (Ethereum / Sepolia)

Projet du cours Blockchain (ENET'Com) : un dossier médical où **le patient contrôle l'accès**, les fichiers sont **chiffrés hors-chaîne** et leur **hash est ancré sur la blockchain**.

## Fonctionnalités
- Smart contract Solidity : rôles (admin, médecin, laboratoire, patient), enregistrement de consultations et d'analyses.
- Contrôle d'accès : le patient autorise (durée limitée ou illimitée) ou révoque un prestataire.
- Chiffrement AES-256-GCM (PBKDF2) dans le navigateur ; stockage hors-chaîne ; hash keccak256 vérifié à la lecture.
- Interface web (ethers.js v6 + MetaMask) avec un écran par rôle.
- 8 tests unitaires Hardhat ; déploiement sur Sepolia.

## Architecture
| Fichier | Rôle |
|---|---|
| `contracts/MedicalRecords.sol` | Règles : rôles, autorisations, enregistrements |
| `frontend/` (`index.html`, `style.css`, `app.js`) | Interface web, chiffrement, appels au contrat |
| `server.js` | Sert l'interface et stocke les fichiers chiffrés (`storage/`) |
| `test/MedicalRecords.test.js` | Tests Hardhat |
| `scripts/deploy.js` | Déploie le contrat et écrit `frontend/contract.json` |

## Installation
```bash
npm install --legacy-peer-deps
cp .env.example .env     # puis renseigner SEPOLIA_RPC_URL et PRIVATE_KEY (compte de TEST uniquement)
npx hardhat test         # tests locaux
npx hardhat run scripts/deploy.js --network sepolia
node server.js           # http://localhost:3000
```

## Sécurité
- Ne jamais publier `.env` (clé privée). Utiliser un compte de test sans argent réel.
- Projet pédagogique : le mot de passe de chiffrement est partagé hors ligne, le stockage est un serveur local (pas d'IPFS).
