// Serveur minimal : (1) sert l'interface web, (2) stocke les fichiers CHIFFRÉS hors-chaîne.
// Aucune dépendance : uniquement des modules Node intégrés.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const STORAGE = path.join(__dirname, "storage");
const FRONT = path.join(__dirname, "frontend");
fs.mkdirSync(STORAGE, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();

  // Upload : POST /upload/<hash>  (le corps = fichier chiffré)
  if (req.method === "POST" && req.url.startsWith("/upload/")) {
    const name = path.basename(req.url.slice(8));
    if (!/^0x[0-9a-f]{64}$/i.test(name)) { res.statusCode = 400; return res.end("hash invalide"); }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      fs.writeFileSync(path.join(STORAGE, name), Buffer.concat(chunks));
      res.end(JSON.stringify({ uri: `http://localhost:${PORT}/file/${name}` }));
    });
    return;
  }

  // Téléchargement : GET /file/<hash>
  if (req.method === "GET" && req.url.startsWith("/file/")) {
    const f = path.join(STORAGE, path.basename(req.url.slice(6)));
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end("introuvable"); }
    res.setHeader("Content-Type", "application/octet-stream");
    return res.end(fs.readFileSync(f));
  }

  // Fichiers statiques de l'interface
  const rel = req.url === "/" ? "index.html" : path.basename(req.url.split("?")[0]);
  const f = path.join(FRONT, rel);
  if (fs.existsSync(f)) {
    res.setHeader("Content-Type", TYPES[path.extname(f)] || "text/plain");
    return res.end(fs.readFileSync(f));
  }
  res.statusCode = 404; res.end("404");
}).listen(PORT, () => console.log(`Interface : http://localhost:${PORT}`));
