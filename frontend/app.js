import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";

const $ = (id) => document.getElementById(id);
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const SEPOLIA = 11155111n;
const TYPES = ["Consultation", "Analyse"];
const ROLE_TEXT = {
  visitor: ["Bienvenue", "Connectez MetaMask. L'écran s'adapte au compte choisi : administrateur, médecin, laboratoire ou patient."],
  admin:   ["Administrateur", "Vous décidez qui peut être médecin ou laboratoire. Vous ne pouvez pas lire les dossiers."],
  doctor:  ["Médecin", "Ajoutez consultations et analyses aux dossiers des patients qui vous ont autorisé."],
  lab:     ["Laboratoire", "Déposez des analyses dans les dossiers des patients qui vous ont autorisé."],
  patient: ["Patient", "Votre dossier vous appartient. Vous décidez qui peut y écrire, et pendant combien de temps."],
};

let provider, signer, me, contract, cfg, role = "visitor";

// ---------- petits outils d'affichage ----------
const log = (m) => { $("log").textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`; $("log").scrollTop = 1e9; };
let toastTimer;
function toast(msg, kind = "") {
  const t = $("toast"); t.textContent = msg; t.className = `show ${kind}`;
  clearTimeout(toastTimer); if (kind) toastTimer = setTimeout(() => (t.className = ""), 4500);
}
const isAddr = (a) => ethers.isAddress(a);
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k)); return n;
}
function fmtExpiry(ts) {
  if (ts >= 2n ** 200n) return "sans limite de durée";
  const left = Number(ts) - Date.now() / 1000;
  const d = new Date(Number(ts) * 1000).toLocaleString();
  if (left <= 0) return `expiré le ${d}`;
  const h = left / 3600;
  return `expire dans ${h >= 48 ? Math.round(h / 24) + " j" : h >= 1 ? Math.round(h) + " h" : Math.max(1, Math.round(left / 60)) + " min"} (${d})`;
}

// ---------- connexion et rôle ----------
async function init() {
  cfg = await (await fetch("contract.json")).json();
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  me = await signer.getAddress();
  contract = new ethers.Contract(cfg.address, cfg.abi, signer);

  const net = await provider.getNetwork();
  const good = net.chainId === SEPOLIA;
  $("net").textContent = good ? "Sepolia" : `Réseau ${net.chainId}`;
  $("net").className = `pill ${good ? "good" : "bad"}`;
  $("wrongNet").classList.toggle("hidden", good);
  if (!good) return setRole("visitor");

  const admin = await contract.admin();
  const r = Number(await contract.roles(me));
  setRole(admin.toLowerCase() === me.toLowerCase() ? "admin" : r === 1 ? "doctor" : r === 2 ? "lab" : "patient");
  log(`Connecté : ${me} (${role})`);
  refreshRole();
}

function setRole(r) {
  role = r;
  document.body.dataset.role = r;
  $("roleTitle").textContent = ROLE_TEXT[r][0];
  $("roleDesc").textContent = ROLE_TEXT[r][1];
  $("connect").classList.toggle("hidden", r !== "visitor" || !!me);
  $("me").classList.toggle("hidden", !me);
  $("who").classList.toggle("hidden", !me);
  if (me) { $("me").textContent = short(me); $("addrFull").textContent = me; }
  document.title = `${ROLE_TEXT[r][0]} · Dossier médical décentralisé`;
}

function refreshRole() {
  if (role === "admin") loadProviders();
  if (role === "patient") { loadProviders(); loadGrants(); }
  if (role === "doctor" || role === "lab") checkAccess();
}

async function connect() {
  if (!window.ethereum) return toast("Installez MetaMask pour continuer.", "err");
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await init();
  } catch (e) { toast(e.shortMessage || e.message, "err"); }
}

// ---------- lecture des événements (historique) ----------
// 1) on essaie via MetaMask ; 2) si le réseau refuse (trop de blocs demandés), on passe par Blockscout.
const EXPLORER = "https://eth-sepolia.blockscout.com/api/v2/addresses";
async function fetchEvents(name, keep = () => true) {
  try {
    return await contract.queryFilter(contract.filters[name](), cfg.deployBlock || 0);
  } catch (e) { log(`Historique via MetaMask refusé (${e.shortMessage || e.message}) : j'utilise Blockscout`); }
  const iface = contract.interface, topic0 = iface.getEvent(name).topicHash.toLowerCase();
  const base = `${EXPLORER}/${cfg.address}/logs`, out = [];
  let url = base;
  for (let page = 0; url && page < 30; page++) {
    const j = await (await fetch(url)).json();
    for (const l of j.items || []) {
      const topics = (l.topics || []).filter(Boolean);
      if (!topics.length || topics[0].toLowerCase() !== topic0) continue;
      try { const p = iface.parseLog({ topics, data: l.data || "0x" }); if (keep(p.args)) out.push({ args: p.args }); } catch {}
    }
    url = j.next_page_params ? `${base}?${new URLSearchParams(j.next_page_params)}` : null;
  }
  return out.reverse();   // Blockscout renvoie le plus récent d'abord : on remet l'ordre chronologique
}

// ---------- liste des prestataires (lue dans les événements) ----------
async function providerLogs() {
  try {
    return await fetchEvents("ProviderRegistered");
  } catch (e) { log(`Liste des prestataires indisponible : ${e.shortMessage || e.message}`); return []; }
}
async function loadProviders() {
  const logs = await providerLogs();
  const seen = new Map();
  for (const l of logs) seen.set(l.args.provider.toLowerCase(), { addr: l.args.provider, role: Number(l.args.role) });
  const items = [...seen.values()];
  const ul = $("provList"); ul.replaceChildren();
  if (!items.length) ul.append(el("li", { className: "empty", textContent: "Aucun prestataire enregistré." }));
  items.forEach((p) => ul.append(el("li", {},
    el("span", { className: "main" }, el("span", { className: "mono", textContent: short(p.addr), title: p.addr })),
    el("span", { className: "tag", textContent: p.role === 1 ? "Médecin" : "Laboratoire" }))));
  const dl = $("providers"); dl.replaceChildren();
  items.forEach((p) => dl.append(el("option", { value: p.addr, label: `${p.role === 1 ? "Médecin" : "Labo"} ${short(p.addr)}` })));
}

// ---------- transactions ----------
async function tx(label, p) {
  try {
    toast(`${label} : confirmez dans MetaMask…`); log(`${label}…`);
    const t = await p; toast(`${label} : en cours sur la blockchain…`);
    await t.wait();
    toast(`${label} : confirmé`, "ok"); log(`✔ ${label} confirmé : ${t.hash}`);
    return true;
  } catch (e) {
    const msg = e.reason || e.shortMessage || e.message;
    toast(`${label} : ${msg}`, "err"); log(`✘ ${label} : ${msg}`);
    return false;
  }
}

// ---------- administrateur ----------
$("regProv").onclick = async () => {
  const a = $("provAddr").value.trim();
  if (!isAddr(a)) return toast("Adresse invalide : elle commence par 0x et fait 42 caractères.", "err");
  const r = document.querySelector("input[name=provRole]:checked").value;
  if (await tx("Enregistrement du prestataire", contract.registerProvider(a, r))) { $("provAddr").value = ""; loadProviders(); }
};

// ---------- patient : autorisations ----------
$("grant").onclick = async () => {
  const a = $("grantAddr").value.trim();
  if (!isAddr(a)) return toast("Choisissez un prestataire ou collez son adresse (0x…).", "err");
  if (await tx("Autorisation d'accès", contract.grantAccess(a, $("grantDur").value))) loadGrants();
};

async function loadGrants() {
  const ul = $("grantList"); ul.replaceChildren(el("li", { className: "empty", textContent: "Lecture de la blockchain…" }));
  let logs = [];
  try { logs = (await fetchEvents("AccessGranted", (a) => a.patient.toLowerCase() === me.toLowerCase()))
          .filter((l) => !l.args.patient || l.args.patient.toLowerCase() === me.toLowerCase()); }
  catch (e) { log(`Historique indisponible : ${e.shortMessage || e.message}`); }
  const last = new Map();
  logs.forEach((l) => last.set(l.args.provider.toLowerCase(), l.args));
  ul.replaceChildren();
  if (!last.size) return ul.append(el("li", { className: "empty", textContent: "Personne n'a accès à votre dossier." }));
  for (const [, g] of [...last].reverse()) {
    const active = await contract.hasAccess(me, g.provider);
    const row = el("li", {},
      el("span", { className: "main" },
        el("span", { className: "mono", textContent: short(g.provider), title: g.provider }),
        el("small", { textContent: active ? fmtExpiry(g.expiresAt) : "Aucun accès" })),
      el("span", { className: `tag ${active ? "ok" : "off"}`, textContent: active ? "Accès actif" : "Sans accès" }));
    if (active) {
      const b = el("button", { className: "btn small danger", textContent: "Révoquer" });
      b.onclick = async () => { if (await tx("Révocation d'accès", contract.revokeAccess(g.provider))) loadGrants(); };
      row.append(b);
    }
    ul.append(row);
  }
}

// ---------- médecin / laboratoire : accès au patient ----------
let checkTimer;
$("recPatient").oninput = () => { clearTimeout(checkTimer); checkTimer = setTimeout(checkAccess, 350); };
async function checkAccess() {
  const s = $("accessStatus"), a = $("recPatient").value.trim();
  if (!a) { s.className = "status wait"; s.textContent = "Entrez une adresse pour vérifier votre accès."; return; }
  if (!isAddr(a)) { s.className = "status bad"; s.textContent = "Adresse invalide."; return; }
  try {
    const ok = await contract.hasAccess(a, me);
    s.className = `status ${ok ? "ok" : "bad"}`;
    s.textContent = ok ? "✔ Ce patient vous a autorisé." : "✘ Ce patient ne vous a pas autorisé (ou l'accès a expiré).";
  } catch (e) { s.className = "status bad"; s.textContent = "Vérification impossible."; }
}

// ---------- dépôt de fichier ----------
const drop = $("drop");
$("recFile").onchange = () => { const f = $("recFile").files[0]; $("dropText").replaceChildren(f ? el("b", { textContent: f.name }) : "Choisir un fichier"); };
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { $("recFile").files = e.dataTransfer.files; $("recFile").onchange(); } });

// ---------- chiffrement AES-GCM (Web Crypto) ----------
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptBytes(bytes, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(28 + ct.length);   // [salt 16][iv 12][ciphertext]
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return out;
}
async function decryptBytes(data, pass) {
  const key = await deriveKey(pass, data.slice(0, 16));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(16, 28) }, key, data.slice(28)));
}

// ---------- ajout d'un enregistrement (3 étapes visibles) ----------
function step(i, state) {
  [...$("steps").children].forEach((li, j) => { if (j === i) li.className = state; else if (j > i && state === "run") li.className = ""; });
}
$("addRec").onclick = async () => {
  const patient = $("recPatient").value.trim(), title = $("recTitle").value.trim();
  const file = $("recFile").files[0], pass = $("recPass").value;
  if (!isAddr(patient)) return toast("Indiquez l'adresse du patient en haut de la page.", "err");
  if (!title || !file || !pass) return toast("Titre, fichier et mot de passe sont obligatoires.", "err");
  const type = document.querySelector("input[name=recType]:checked").value;
  [...$("steps").children].forEach((li) => (li.className = ""));
  $("addRec").disabled = true;
  let i = 0;
  try {
    step(0, "run");
    const enc = await encryptBytes(new Uint8Array(await file.arrayBuffer()), pass);
    const hash = ethers.keccak256(enc);                         // empreinte du fichier CHIFFRÉ
    log(`Fichier chiffré (${enc.length} octets), hash = ${hash}`);
    step(0, "done"); i = 1; step(1, "run");
    const r = await fetch(`${location.origin}/upload/${hash}`, { method: "POST", body: enc });
    if (!r.ok) throw new Error("Le serveur de stockage ne répond pas (node server.js lancé ?)");
    const { uri } = await r.json();
    log(`Stocké hors-chaîne : ${uri}`);
    step(1, "done"); i = 2; step(2, "run");
    const ok = await tx("Enregistrement sur la blockchain", contract.addRecord(patient, type, title, hash, uri));
    step(2, ok ? "done" : "fail");
    if (ok) { $("recTitle").value = ""; $("recFile").value = ""; $("recFile").onchange(); }
  } catch (e) { step(i, "fail"); toast(e.message, "err"); log(`✘ ${e.message}`); }
  $("addRec").disabled = false;
};

// ---------- lecture des dossiers ----------
function fillTable(tbl, empty, recs, withAuthor, passId) {
  const tb = tbl.querySelector("tbody"); tb.replaceChildren();
  empty.classList.toggle("hidden", recs.length > 0);
  tbl.classList.toggle("hidden", recs.length === 0);
  recs.forEach((r) => {
    const tr = el("tr", {},
      el("td", {}, el("span", { className: "tag", textContent: TYPES[Number(r.recordType)] })),
      el("td", { textContent: r.title }));
    if (withAuthor) tr.append(el("td", { className: "mono", textContent: short(r.author), title: r.author }));
    tr.append(el("td", { textContent: new Date(Number(r.timestamp) * 1000).toLocaleString() }));
    if (withAuthor) tr.append(el("td", { className: "mono", textContent: r.fileHash.slice(0, 10) + "…", title: r.fileHash }));
    const b = el("button", { className: "btn small", textContent: "Vérifier et ouvrir" });
    b.onclick = () => openRecord(r, $(passId).value);
    tr.append(el("td", {}, b));
    tb.append(tr);
  });
}
async function load(patient, tbl, empty, withAuthor, passId) {
  try {
    const recs = await contract.getRecords(patient);
    fillTable(tbl, empty, [...recs], withAuthor, passId);
    log(`${recs.length} enregistrement(s) chargé(s)`);
  } catch (e) {
    const m = e.reason || e.shortMessage || e.message;
    toast(m.includes("Lecture non autorisee") ? "Lecture refusée : le patient ne vous a pas autorisé." : m, "err");
    log(`✘ Lecture refusée : ${m}`);
    tbl.classList.add("hidden");
  }
}
$("loadMine").onclick = () => load(me, $("tblMine"), $("emptyMine"), true, "viewPass");
$("loadOther").onclick = () => {
  const a = $("recPatient").value.trim();
  if (!isAddr(a)) return toast("Indiquez l'adresse du patient en haut de la page.", "err");
  load(a, $("tblPro"), $("emptyPro"), false, "viewPassPro");
};

async function openRecord(r, pass) {
  try {
    const enc = new Uint8Array(await (await fetch(r.fileUri)).arrayBuffer());
    if (ethers.keccak256(enc) !== r.fileHash) { toast(`Intégrité KO : le fichier #${r.id} a été modifié.`, "err"); return log(`⚠ INTÉGRITÉ KO (#${r.id})`); }
    log(`✔ Intégrité OK (#${r.id}) : le hash correspond à celui de la blockchain`);
    if (!pass) return toast("Intégrité OK. Entrez le mot de passe pour déchiffrer.", "ok");
    const clear = await decryptBytes(enc, pass);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([clear])), download: `dossier-${r.id}` });
    a.click(); toast(`Fichier #${r.id} vérifié et déchiffré`, "ok"); log(`✔ Déchiffré et téléchargé (#${r.id})`);
  } catch (e) { toast("Déchiffrement impossible : mot de passe incorrect ?", "err"); log(`✘ ${e.message}`); }
}

// ---------- autres boutons ----------
$("connect").onclick = connect;
$("copy").onclick = () => { navigator.clipboard?.writeText(me); toast("Adresse copiée", "ok"); };
$("switchNet").onclick = async () => {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
    await init();
  } catch (e) { toast("Changez le réseau dans MetaMask (icône du réseau)", "err"); }
};

// ---------- démarrage : suit le compte MetaMask sans recharger ----------
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (a) => { $("log").textContent += "— changement de compte —\n"; a.length ? init() : (me = null, setRole("visitor")); });
  window.ethereum.on("chainChanged", () => location.reload());
  window.ethereum.request({ method: "eth_accounts" }).then((a) => a.length && init()).catch(() => {});
}