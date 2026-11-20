'use strict';
/* =====================================================================
   Ma Cave — application personnelle de gestion de cave (PWA hors ligne)
   Données : IndexedDB sur l'appareil. Aucune donnée n'est envoyée ailleurs.
   ===================================================================== */
const VERSION = '1.1.2';

/* ---------- Constantes ---------- */
const COULEURS = ['Rouge', 'Blanc', 'Rosé', 'Effervescent', 'Liquoreux', 'Muté', 'Orange', 'Autre'];
const FORMATS = [[37.5, 'Demi-bouteille 37,5 cl'], [50, '50 cl'], [62, 'Clavelin 62 cl'], [75, 'Bouteille 75 cl'], [150, 'Magnum 150 cl'], [300, 'Double magnum 300 cl'], [600, 'Impériale 600 cl']];
const MOTIFS = { consomme: 'Consommée', offert: 'Offerte', vendu: 'Vendue', perte: 'Cassée ou perdue' };
const TYPES_COTE = { marchand: 'Prix affiché par un marchand', transaction: 'Transaction constatée', nette: 'Valeur nette de revente estimée' };
const FIAB = { faible: 'Faible', moyenne: 'Moyenne', elevee: 'Élevée' };
const PRIO = { haute: 'Haute', moyenne: 'Moyenne', decouverte: 'Découverte' };
const NIVEAUX = { '': 'Non renseigné', faible: 'Faible', moyenne: 'Moyen', forte: 'Fort' };
const NIV_F = { '': 'Non renseignée', faible: 'Faible', moyenne: 'Moyenne', forte: 'Forte' };
const GROUPES_DEF = ['Noyau dur', 'Liste secondaire', 'Futures pépites'];
const STATUTS = { cave: 'En cave', reserve: 'Réservé', commande: 'Commandé', consomme: 'Consommé', vendu: 'Vendu', vide: 'Sans stock' };
const GARDE = { jeune: 'Trop jeune', approche: "Approche de l'apogée", maturite: 'À maturité', boire: 'À boire prochainement', declin: 'Potentiellement déclinant' };

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
const AN = () => new Date().getFullYear();
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fdate = d => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d); };
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  let s = String(v).replace(/[\s €$£]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const int = v => { const n = num(v); return n == null ? null : Math.round(n); };
function eur(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
}
const pct = n => (n > 0 ? '+' : '') + new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 }).format(n) + ' %';
const fmtFormat = cl => cl == 75 ? '75 cl' : cl == 150 ? 'Magnum' : cl == 300 ? 'Double magnum' : String(cl).replace('.', ',') + ' cl';
const nomVin = v => `${v.producteur}${v.cuvee ? ' · ' + v.cuvee : ''} ${v.millesime || 'NM'}`;
const cleVin = v => [norm(v.producteur), norm(v.cuvee), v.millesime || '', Number(v.format) || 75].join('|');
const coulClass = c => ({ Rouge: 'rouge', Blanc: 'blanc', 'Rosé': 'rose', Effervescent: 'effervescent', Liquoreux: 'liquoreux', 'Muté': 'mute', Orange: 'orange' }[c] || '');
const uniq = a => [...new Set(a.filter(x => x != null && x !== ''))].sort((x, y) => String(x).localeCompare(String(y), 'fr'));

/* ---------- Stockage (IndexedDB) ---------- */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('ma-cave', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq ? rq.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const photoGet = id => tx('photos', 'readonly', s => s.get(id));
const photoSet = (id, v) => tx('photos', 'readwrite', s => s.put(v, id));
const photoDel = id => tx('photos', 'readwrite', s => s.delete(id));
function photoAll() {
  return new Promise((res, rej) => {
    const out = {};
    const t = db.transaction('photos', 'readonly');
    const c = t.objectStore('photos').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  });
}

/* ---------- État ---------- */
const VIDE = () => ({
  version: 1, vins: [], mouvements: [], cotations: [], watchlist: [], degustations: [], instantanes: [], journal: [],
  reglages: { theme: 'auto', capacite: 0, groupes: [...GROUPES_DEF], notifications: false, dernierExport: null }
});
let S = VIDE();
let annulations = [];
function hydrate(o) {
  const base = VIDE();
  const s = Object.assign(base, o || {});
  s.reglages = Object.assign(VIDE().reglages, (o && o.reglages) || {});
  for (const k of ['vins', 'mouvements', 'cotations', 'watchlist', 'degustations', 'instantanes', 'journal']) if (!Array.isArray(s[k])) s[k] = [];
  return s;
}
async function sauver() { await kvSet('etat', S); await kvSet('annulations', annulations); }
function erreurSauvegarde(e) { console.error(e); toast("Échec de l'enregistrement : " + (e && e.message || e)); }

/** Applique une modification : enregistrée durablement, journalisée et annulable. */
function commit(label, fn) {
  annulations.push({ label, date: new Date().toISOString(), etat: JSON.stringify(S) });
  if (annulations.length > 20) annulations.shift();
  fn();
  S.journal.unshift({ date: new Date().toISOString(), texte: label });
  if (S.journal.length > 600) S.journal.length = 600;
  invalider();
  instantane();
  sauver().catch(erreurSauvegarde);
  modifie();
  render();
  toast(label, true);
}
/** Signale une modification à la synchronisation en ligne, si elle est active. */
function modifie() { if (typeof Sync !== 'undefined') Sync.marquer(); }
async function annuler() {
  const u = annulations.pop();
  if (!u) return toast('Rien à annuler.');
  S = hydrate(JSON.parse(u.etat));
  invalider();
  await sauver().catch(erreurSauvegarde);
  modifie();
  closeSheet();
  render();
  toast('Annulé : ' + u.label);
}

/* ---------- Calculs ---------- */
let _ix = null;
function invalider() { _ix = null; }
function ix() {
  if (_ix) return _ix;
  const mv = new Map(), co = new Map(), dg = new Map();
  const push = (m, k, x) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(x); };
  for (const m of S.mouvements) push(mv, m.vinId, m);
  for (const c of S.cotations) push(co, c.vinId, c);
  for (const d of S.degustations) push(dg, d.vinId, d);
  for (const a of co.values()) a.sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return _ix = { mv, co, dg, calc: new Map() };
}
const mouvements = id => ix().mv.get(id) || [];
const achats = id => mouvements(id).filter(m => m.type === 'achat');
const sorties = id => mouvements(id).filter(m => m.type === 'sortie');
const cotes = id => ix().co.get(id) || [];
const derniere = (id, type) => cotes(id).find(c => c.type === type) || null;
/** Valeur de marché retenue : la plus récente entre transaction constatée et prix marchand. */
function valeurMarche(id) {
  const t = derniere(id, 'transaction'), m = derniere(id, 'marchand');
  if (t && m) return String(m.date) > String(t.date) ? m : t;
  return t || m || null;
}
function calc(v) {
  const c0 = ix().calc.get(v.id); if (c0) return c0;
  const a = achats(v.id), so = sorties(v.id);
  const qRecu = sum(a.filter(m => m.statut !== 'commande'), m => m.qte);
  const qCmd = sum(a.filter(m => m.statut === 'commande'), m => m.qte);
  const qSortie = sum(so, m => m.qte);
  const stock = Math.max(0, qRecu - qSortie);
  const avecPrix = a.filter(m => m.prix != null);
  const qPrix = sum(avecPrix, m => m.qte);
  const cu = qPrix > 0 ? sum(avecPrix, m => m.qte * m.prix + (m.frais || 0)) / qPrix : null;
  const dernierAchat = a.map(m => m.date).filter(Boolean).sort().pop() || '';
  const r = { stock, qCmd, qRecu, qSortie, detenu: stock + qCmd, cu, dernierAchat };
  ix().calc.set(v.id, r);
  return r;
}
function statut(v, c = calc(v)) {
  if (c.stock > 0) return v.reserve ? 'reserve' : 'cave';
  if (c.qCmd > 0) return 'commande';
  const so = sorties(v.id).slice().sort((x, y) => String(x.date).localeCompare(String(y.date)));
  if (!so.length) return 'vide';
  return so[so.length - 1].motif === 'vendu' ? 'vendu' : 'consomme';
}
function etatGarde(v, y = AN()) {
  const d = v.debut, a = v.apogee, f = v.fin;
  if (!d && !a && !f) return null;
  if (f && y > f) return 'declin';
  if (d && y < d) return 'jeune';
  if (a) {
    if (y < a) return (!d && a - y > 3) ? 'jeune' : 'approche';
    const mi = f ? a + Math.floor((f - a) / 2) : a + 2;
    return y <= mi ? 'maturite' : 'boire';
  }
  if (f) return f - y <= 2 ? 'boire' : 'maturite';
  return 'maturite';
}
function stats() {
  const o = { refs: 0, nb: 0, cmd: 0, eq: 0, investi: 0, sansPrix: 0, valeur: 0, nEval: 0, nNonEval: 0, gain: 0, baseGain: 0, nette: 0, nNette: 0, lignes: [] };
  for (const v of S.vins) {
    const c = calc(v); if (c.detenu <= 0) continue;
    o.refs++; o.nb += c.stock; o.cmd += c.qCmd; o.eq += c.detenu * (v.format || 75) / 75;
    if (c.cu != null) o.investi += c.detenu * c.cu; else o.sansPrix++;
    const vm = valeurMarche(v.id);
    if (vm) { o.nEval++; o.valeur += vm.valeur * c.detenu; if (c.cu != null) { o.gain += (vm.valeur - c.cu) * c.detenu; o.baseGain += c.cu * c.detenu; } } else o.nNonEval++;
    const vn = derniere(v.id, 'nette');
    if (vn) { o.nNette++; o.nette += vn.valeur * c.detenu; }
    o.lignes.push({ v, c, vm });
  }
  return o;
}
function instantane() {
  const st = stats(), d = today();
  const e = { date: d, investi: Math.round(st.investi * 100) / 100, valeur: st.nEval ? Math.round(st.valeur * 100) / 100 : null, bouteilles: st.nb + st.cmd };
  const i = S.instantanes.findIndex(x => x.date === d);
  if (i >= 0) S.instantanes[i] = e; else S.instantanes.push(e);
  if (S.instantanes.length > 1500) S.instantanes.shift();
}
function alertes() {
  const y = AN(), L = [];
  for (const v of S.vins) {
    const c = calc(v); if (c.stock <= 0) continue;
    const g = etatGarde(v);
    const lien = '#/vin/' + v.id, n = nomVin(v);
    if (g === 'declin') L.push({ niv: 3, texte: `${n} : fin de garde estimée dépassée (${v.fin}).`, lien });
    else if (g === 'boire') L.push({ niv: 2, texte: `${n} : à boire prochainement${v.fin ? ' (fin estimée ' + v.fin + ')' : ''}.`, lien });
    else if (v.apogee === y) L.push({ niv: 1, texte: `${n} : apogée estimée cette année.`, lien });
    else if (v.debut === y) L.push({ niv: 1, texte: `${n} : entre dans sa fenêtre de dégustation cette année.`, lien });
  }
  const lim = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const m of S.mouvements) if (m.type === 'achat' && m.statut === 'commande' && m.date && m.date < lim) {
    const v = S.vins.find(x => x.id === m.vinId); if (v) L.push({ niv: 1, texte: `${nomVin(v)} : commande du ${fdate(m.date)} toujours en attente.`, lien: '#/vin/' + v.id });
  }
  for (const w of S.watchlist) if (w.priorite === 'haute' && w.rappel !== false) L.push({ niv: 0, texte: `À surveiller : ${nomCible(w)}.`, lien: '#/cible/' + w.id });
  const sy = typeof Sync !== 'undefined' ? Sync.etat() : null;
  if (sy && sy.probleme) L.push({ niv: 2, texte: 'Synchronisation en ligne : ' + sy.texte + '.', lien: '#/sync' });
  const syncRecente = sy && sy.actif && sy.dernier && (Date.now() - new Date(sy.dernier).getTime()) < 30 * 864e5;
  if (S.vins.length && !syncRecente) {
    const de = S.reglages.dernierExport;
    if (!de || (Date.now() - new Date(de).getTime()) > 30 * 864e5) L.push({ niv: 1, texte: de ? `Dernière sauvegarde exportée le ${fdate(de)}. Pensez à en refaire une.` : "Aucune sauvegarde exportée pour l'instant.", lien: '#/donnees' });
  }
  return L.sort((a, b) => b.niv - a.niv);
}
const nomCible = w => `${w.producteur}${w.cuvee ? ' · ' + w.cuvee : ''}${w.millesime ? ' ' + w.millesime : ' (tous millésimes)'}`;

/* ---------- Interface : toast, feuille, formulaires ---------- */
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="annuler">Annuler</button>' : ''}`;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), undo ? 6000 : 3500);
}
function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet-panel" role="dialog" aria-modal="true">${html}</div>`;
  s.hidden = false; $('#fab').hidden = true; document.body.style.overflow = 'hidden';
}
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; $('#fab').hidden = false; document.body.style.overflow = ''; formCtx = null; }
const tete = t => `<div class="sheet-head"><h3>${esc(t)}</h3><button type="button" class="icon-btn" data-act="close-sheet" aria-label="Fermer">✕</button></div>`;
function confirmer(titre, message, labelOk, onOk, danger = true) {
  openSheet(`${tete(titre)}<div class="sheet-body"><p>${esc(message)}</p></div><div class="sheet-foot"><button class="btn" data-act="close-sheet">Annuler</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ok-confirm">${esc(labelOk)}</button></div>`);
  $('#ok-confirm').addEventListener('click', () => { closeSheet(); onOk(); });
}
function champ(f) {
  const id = 'f_' + f.name, v = f.value ?? '';
  if (f.type === 'titre') return `<h4 class="form-sec">${esc(f.label)}</h4>`;
  if (f.type === 'info') return `<p class="hint" style="grid-column:1/-1">${esc(f.label)}</p>`;
  if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.name}"${v ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
  if (f.type === 'photos') return `<div class="fld"><span class="lab">${esc(f.label)}</span><div class="photo-btns"><label class="btn ghost">Appareil photo<input type="file" accept="image/*" capture="environment" data-photo-in hidden></label><label class="btn ghost">Galerie<input type="file" accept="image/*" multiple data-photo-in hidden></label></div><div class="photo-prev" id="photo-prev"></div></div>`;
  let ctl;
  if (f.type === 'select') ctl = `<select id="${id}" name="${f.name}">${f.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
  else {
    const extra = f.type === 'number' ? ` inputmode="decimal" step="${f.step || 'any'}"${f.min != null ? ` min="${f.min}"` : ''}` : '';
    ctl = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.list ? ` list="${id}_l"` : ''}${extra} autocomplete="off">` +
      (f.list ? `<datalist id="${id}_l">${uniq(f.list).map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<label class="fld${f.half ? ' half' : ''}"><span class="lab">${esc(f.label)}${f.required ? ' *' : ''}</span>${ctl}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label>`;
}
let formCtx = null;
function openForm(cfg) {
  openSheet(`<form id="form" novalidate>${tete(cfg.title)}<div class="sheet-body"><div class="grid">${cfg.fields.map(champ).join('')}</div></div><div class="sheet-foot"><button type="button" class="btn" data-act="close-sheet">Annuler</button><button type="submit" class="btn primary">${esc(cfg.submitLabel || 'Enregistrer')}</button></div></form>`);
  formCtx = { cfg, photos: [] };
}
function lireImage(file, max = 1280) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
    img.src = url;
  });
}
const cachePhotos = new Map();
async function chargerPhotos() {
  for (const img of $$('img[data-photo]')) {
    const id = img.dataset.photo;
    try {
      let d = cachePhotos.get(id);
      if (!d) { d = await photoGet(id); if (d) cachePhotos.set(id, d); }
      if (d) img.src = d;
    } catch (e) { /* photo manquante : on ignore */ }
  }
}

/* ---------- Routeur ---------- */
const UI = {
  q: '', showF: false, tri: 'prod', f: { statut: 'actifs', pays: '', region: '', prod: '', couleur: '', garde: '', mill: '', annee: '' },
  gardeTab: 'chrono', wlGroupe: '', repart: 'pays', offre: null, verdict: null, cmp: { a: '', b: '' }, imp: null
};
const TABS = ['tableau', 'cave', 'garde', 'watchlist', 'plus'];
const TITRES = { tableau: 'Ma Cave', cave: 'Cave', vin: 'Fiche vin', garde: 'Garde et apogée', watchlist: 'Watchlist', cible: 'Cible', plus: 'Plus', offre: 'Analyser une offre', degustations: 'Journal de dégustation', historique: 'Historique', donnees: 'Données et sauvegardes', reglages: 'Réglages', comparer: 'Comparer', alertes: 'Alertes' };
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'tableau';
  const [name, arg] = h.split('/');
  return { name: VUES[name] ? name : 'tableau', arg: arg ? decodeURIComponent(arg) : null };
}
function render() {
  const r = route();
  $('#view').innerHTML = VUES[r.name](r.arg);
  $('#titre').textContent = TITRES[r.name];
  $('#back').hidden = TABS.includes(r.name);
  const tab = TABS.includes(r.name) ? r.name : r.name === 'vin' ? 'cave' : r.name === 'cible' ? 'watchlist' : r.name === 'alertes' ? 'tableau' : 'plus';
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const n = alertes().filter(a => a.niv >= 1).length, b = $('#cloche-n');
  b.hidden = !n; b.textContent = n;
  chargerPhotos();
}
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

/* ---------- Vue : tableau de bord ---------- */
function vTableau() {
  const st = stats();
  if (!S.vins.length && !S.watchlist.length) return `<div class="empty card"><h3>Votre cave est vide</h3><p>Ajoutez une première bouteille, ou importez votre inventaire existant (CSV ou Excel) sans tout ressaisir.</p><button class="btn primary" data-act="ajouter">+ Ajouter une bouteille</button> <a class="btn" href="#/donnees">Importer un fichier</a></div>`;
  const gainPct = st.baseGain > 0 ? st.gain / st.baseGain * 100 : null;
  const al = alertes().filter(a => a.niv >= 1);
  let h = `<div class="kpis">
    <div class="kpi"><div class="k">En cave</div><div class="v">${st.nb}</div><div class="s">${st.refs} référence${st.refs > 1 ? 's' : ''}${st.cmd ? ` · ${st.cmd} commandée${st.cmd > 1 ? 's' : ''}` : ''}</div></div>
    <div class="kpi"><div class="k">Équivalent 75 cl</div><div class="v">${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 }).format(st.eq)}</div><div class="s">magnums et demies comptés au volume</div></div>
    <div class="kpi"><div class="k">Total investi</div><div class="v">${eur(st.investi)}</div><div class="s">frais compris${st.sansPrix ? ` · ${st.sansPrix} vin${st.sansPrix > 1 ? 's' : ''} sans prix` : ''}</div></div>
    <div class="kpi"><div class="k">Valeur de marché</div><div class="v">${st.nEval ? eur(st.valeur) : 'Non évalué'}</div><div class="s">${st.nEval} vin${st.nEval > 1 ? 's' : ''} coté${st.nEval > 1 ? 's' : ''}${st.nNonEval ? ` · ${st.nNonEval} non évalué${st.nNonEval > 1 ? 's' : ''}` : ''}</div></div>
    <div class="kpi wide"><div class="k">Gain ou perte potentiel</div><div class="v ${st.gain > 0 ? 'pos' : st.gain < 0 ? 'neg' : ''}">${st.baseGain > 0 ? (st.gain > 0 ? '+' : '') + eur(st.gain) + ' · ' + pct(gainPct) : 'Non évalué'}</div><div class="s">calculé uniquement sur les vins ayant un prix d'achat et une cotation${st.nNette ? ` · valeur nette de revente estimée : ${eur(st.nette)} (${st.nNette} vin${st.nNette > 1 ? 's' : ''})` : ''}</div></div>
  </div>`;
  if (al.length) h += `<div class="sec"><h2>Alertes</h2><a href="#/alertes">Tout voir (${al.length})</a></div><div class="card">${al.slice(0, 3).map(a => `<a class="item" href="${a.lien}"><span class="t">${esc(a.texte)}</span><span class="r">›</span></a>`).join('')}</div>`;
  h += `<div class="sec"><h2>Évolution de la valeur</h2></div><div class="card">${graphique()}</div>`;
  h += `<div class="sec"><h2>Répartition</h2></div><div class="seg">${[['pays', 'Pays'], ['region', 'Région'], ['prod', 'Domaine'], ['cuvee', 'Cuvée'], ['mill', 'Millésime']].map(([k, l]) => `<button class="${UI.repart === k ? 'on' : ''}" data-act="repart" data-k="${k}">${l}</button>`).join('')}</div><div class="card bars">${repartition(st)}</div>`;
  const prog = st.lignes.filter(x => x.vm && x.c.cu != null && x.c.cu > 0).map(x => ({ ...x, p: (x.vm.valeur - x.c.cu) / x.c.cu * 100 })).sort((a, b) => b.p - a.p).slice(0, 5);
  h += `<div class="sec"><h2>Plus fortes progressions</h2></div><div class="card">${prog.length ? prog.map(x => `<a class="item" href="#/vin/${x.v.id}"><span class="t">${esc(nomVin(x.v))}<div class="d">Achat ${eur(x.c.cu)} · cote ${eur(x.vm.valeur)} (${esc(x.vm.source || 'source non précisée')}, ${fdate(x.vm.date)})</div></span><span class="r ${x.p >= 0 ? 'pos' : 'neg'}">${pct(x.p)}</span></a>`).join('') : '<p class="muted small">Aucun vin ne dispose à la fois d\'un prix d\'achat et d\'une cotation. Ajoutez des cotations depuis les fiches des vins.</p>'}</div>`;
  return h;
}
function repartition(st) {
  const cle = { pays: x => x.v.pays, region: x => x.v.region, prod: x => x.v.producteur, cuvee: x => x.v.producteur + (x.v.cuvee ? ' · ' + x.v.cuvee : ''), mill: x => x.v.millesime || 'NM' }[UI.repart];
  const m = new Map();
  for (const x of st.lignes) {
    const k = cle(x) || 'Non renseigné';
    const e = m.get(k) || { k, n: 0, inv: 0, val: 0, nv: 0 };
    e.n += x.c.detenu; if (x.c.cu != null) e.inv += x.c.cu * x.c.detenu; if (x.vm) { e.val += x.vm.valeur * x.c.detenu; e.nv++; }
    m.set(k, e);
  }
  const L = [...m.values()].sort((a, b) => b.n - a.n);
  if (!L.length) return '<p class="muted small">Aucune bouteille en cave.</p>';
  const mx = L[0].n;
  return L.slice(0, 40).map(e => `<div class="bar-row"><div class="bar-top"><span>${esc(e.k)}</span><span>${e.n} bt · ${eur(e.inv)}${e.nv ? ' → ' + eur(e.val) : ''}</span></div><div class="track"><div class="fill" style="width:${Math.max(3, e.n / mx * 100)}%"></div></div></div>`).join('') + '<p class="hint">Bouteilles · investi → valeur de marché (vins cotés uniquement)</p>';
}
function graphique() {
  const P = S.instantanes.slice(-180);
  if (P.length < 2) return '<p class="muted small">L\'historique se construit automatiquement, un point par jour d\'utilisation. Revenez dans quelques jours.</p>';
  const W = 600, H = 200, pad = 8;
  const vals = P.flatMap(p => [p.investi, p.valeur]).filter(x => x != null);
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx - mn) || 1;
  const X = i => pad + i * (W - 2 * pad) / (P.length - 1), Y = v => H - pad - (v - mn) / sp * (H - 2 * pad);
  const ligne = k => { let d = '', on = false; P.forEach((p, i) => { if (p[k] == null) { on = false; return; } d += (on ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1) + ' '; on = true; }); return d; };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la valeur de la cave"><path d="${ligne('investi')}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/><path d="${ligne('valeur')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/></svg><div class="legend"><span><i style="background:var(--accent)"></i>Valeur de marché</span><span><i style="background:var(--muted)"></i>Investi</span></div><p class="hint">Du ${fdate(P[0].date)} au ${fdate(P[P.length - 1].date)} · de ${eur(mn)} à ${eur(mx)}</p>`;
}

/* ---------- Vue : cave ---------- */
function listeCave() {
  const t = norm(UI.q).split(' ').filter(Boolean), f = UI.f;
  let L = S.vins.map(v => ({ v, c: calc(v) })).filter(({ v, c }) => {
    const st = statut(v, c);
    if (f.statut === 'actifs' ? !['cave', 'reserve', 'commande'].includes(st) : f.statut && st !== f.statut) return false;
    if (f.pays && v.pays !== f.pays) return false;
    if (f.region && v.region !== f.region) return false;
    if (f.prod && v.producteur !== f.prod) return false;
    if (f.couleur && v.couleur !== f.couleur) return false;
    if (f.mill && String(v.millesime || 'NM') !== f.mill) return false;
    if (f.garde && (f.garde === 'aucune' ? etatGarde(v) : etatGarde(v) !== f.garde)) return false;
    if (f.annee && !achats(v.id).some(m => String(m.date || '').startsWith(f.annee))) return false;
    if (t.length) { const h = norm([v.producteur, v.cuvee, v.millesime, v.appellation, v.region, v.pays, v.cepages, v.emplacement].join(' ')); if (!t.every(x => h.includes(x))) return false; }
    return true;
  });
  const val = x => { const vm = valeurMarche(x.v.id); return vm ? vm.valeur : (x.c.cu ?? -1); };
  const tris = {
    prod: (a, b) => nomVin(a.v).localeCompare(nomVin(b.v), 'fr'),
    mill: (a, b) => (a.v.millesime || 9999) - (b.v.millesime || 9999),
    valeur: (a, b) => val(b) - val(a),
    achat: (a, b) => String(b.c.dernierAchat).localeCompare(String(a.c.dernierAchat)),
    apogee: (a, b) => (a.v.apogee || 9999) - (b.v.apogee || 9999),
    qte: (a, b) => b.c.detenu - a.c.detenu
  };
  return L.sort(tris[UI.tri] || tris.prod);
}
function carteVin({ v, c }) {
  const st = statut(v, c), vm = valeurMarche(v.id), g = c.stock > 0 ? etatGarde(v) : null;
  return `<a class="card vin" href="#/vin/${v.id}"><div class="thumb">${v.photos && v.photos[0] ? `<img data-photo="${v.photos[0]}" alt="">` : `<span class="thumb-ph c-${coulClass(v.couleur)}"></span>`}</div><div class="vin-body"><div class="vin-top"><strong>${esc(v.producteur)}</strong><span class="mill">${v.millesime || 'NM'}</span></div><div class="vin-cuvee">${esc(v.cuvee || v.appellation || '')}</div><div class="vin-meta">${[v.cuvee ? v.appellation : '', v.region || v.pays, v.emplacement].filter(Boolean).map(esc).join(' · ')}</div><div class="vin-foot"><span class="badge b-${st}">${STATUTS[st]}</span><span>${c.stock} × ${fmtFormat(v.format)}${c.qCmd ? ` (+${c.qCmd} cmd)` : ''}</span>${g && g !== 'maturite' ? `<span class="badge g-${g}">${GARDE[g]}</span>` : ''}<span class="val">${vm ? eur(vm.valeur) : c.cu != null ? '<span class="muted">' + eur(c.cu) + '</span>' : ''}</span></div></div></a>`;
}
function corpsCave() {
  const L = listeCave();
  const bt = sum(L, x => x.c.stock);
  return `<div class="count">${L.length} référence${L.length > 1 ? 's' : ''} · ${bt} bouteille${bt > 1 ? 's' : ''} en cave</div>` +
    (L.length ? L.map(carteVin).join('') : `<div class="empty"><h3>Aucun vin</h3><p>${S.vins.length ? 'Aucun vin ne correspond à ces critères.' : 'Votre inventaire est vide.'}</p></div>`);
}
function vCave() {
  const f = UI.f, nF = Object.entries(f).filter(([k, v]) => v && !(k === 'statut' && v === 'actifs')).length;
  const sel = (k, lab, opts) => `<label>${lab}<select data-chg="filtre" data-k="${k}"><option value="">Tous</option>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(f[k]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
  const annees = uniq(S.mouvements.filter(m => m.type === 'achat' && m.date).map(m => String(m.date).slice(0, 4))).reverse();
  return `<div class="search"><input type="search" id="q" placeholder="Rechercher un domaine, une cuvée, un millésime…" value="${esc(UI.q)}" autocomplete="off"><button class="btn" data-act="toggle-filtres">Filtres${nF ? ' (' + nF + ')' : ''}</button></div>
  ${UI.showF ? `<div class="filters">
    ${sel('statut', 'Statut', [['actifs', 'En cave et commandés'], ['cave', 'En cave'], ['reserve', 'Réservé'], ['commande', 'Commandé'], ['consomme', 'Consommé'], ['vendu', 'Vendu']])}
    <label>Trier par<select data-chg="tri">${[['prod', 'Producteur'], ['mill', 'Millésime'], ['valeur', 'Valeur'], ['achat', "Date d'achat"], ['apogee', 'Apogée'], ['qte', 'Quantité']].map(([v, l]) => `<option value="${v}"${UI.tri === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${sel('pays', 'Pays', uniq(S.vins.map(v => v.pays)))}${sel('region', 'Région', uniq(S.vins.map(v => v.region)))}
    ${sel('prod', 'Producteur', uniq(S.vins.map(v => v.producteur)))}${sel('mill', 'Millésime', uniq(S.vins.map(v => String(v.millesime || 'NM'))).reverse())}
    ${sel('couleur', 'Couleur', uniq(S.vins.map(v => v.couleur)))}${sel('garde', 'Garde', [...Object.entries(GARDE), ['aucune', 'Non renseignée']])}
    ${sel('annee', "Année d'achat", annees)}<label>&nbsp;<button class="btn block" data-act="reset-filtres">Réinitialiser</button></label>
  </div>` : ''}
  <div id="cave-liste">${corpsCave()}</div>`;
}

/* ---------- Vue : fiche vin ---------- */
function vVin(id) {
  const v = S.vins.find(x => x.id === id);
  if (!v) return '<div class="empty"><h3>Vin introuvable</h3><a class="btn" href="#/cave">Retour à la cave</a></div>';
  const c = calc(v), st = statut(v, c), g = etatGarde(v), vm = valeurMarche(v.id), vn = derniere(v.id, 'nette'), dm = derniere(v.id, 'marchand'), dt = derniere(v.id, 'transaction');
  const a = achats(v.id).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const so = sorties(v.id).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const dg = (ix().dg.get(v.id) || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const gain = vm && c.cu != null ? (vm.valeur - c.cu) * c.detenu : null;
  let h = `<div class="hero"><div class="prod">${esc(v.producteur)}</div><h2>${esc(v.cuvee || v.appellation || 'Cuvée non précisée')} <span class="mill">${v.millesime || 'NM'}</span></h2><div class="sub">${[v.appellation && v.cuvee ? v.appellation : '', v.region, v.pays].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="vin-foot"><span class="badge b-${st}">${STATUTS[st]}</span>${g ? `<span class="badge g-${g}">${GARDE[g]}</span>` : ''}</div></div>
  <div class="photos">${(v.photos || []).map(p => `<img data-photo="${p}" data-act="voir-photo" data-id="${v.id}" data-p="${p}" alt="Photo de la bouteille">`).join('')}<label class="photo-add">Appareil photo<input type="file" accept="image/*" capture="environment" data-chg="photo-vin" data-id="${v.id}" hidden></label><label class="photo-add">Galerie<input type="file" accept="image/*" multiple data-chg="photo-vin" data-id="${v.id}" hidden></label></div>
  <div class="actions"><button class="btn primary" data-act="achat" data-id="${v.id}">+ Nouvel achat</button><button class="btn" data-act="sortie" data-id="${v.id}"${c.stock ? '' : ' disabled'}>Retirer une bouteille</button><button class="btn" data-act="cote" data-id="${v.id}">+ Cotation</button><button class="btn" data-act="degu" data-id="${v.id}">+ Dégustation</button><button class="btn" data-act="edit-vin" data-id="${v.id}">Modifier</button><button class="btn" data-act="reserve" data-id="${v.id}">${v.reserve ? 'Lever la réservation' : 'Réserver'}</button></div>
  <div class="card"><dl class="facts">
    <dt>En cave</dt><dd>${c.stock} × ${fmtFormat(v.format)}${c.qCmd ? ` · ${c.qCmd} commandée${c.qCmd > 1 ? 's' : ''}` : ''}</dd>
    ${v.emplacement ? `<dt>Emplacement</dt><dd>${esc(v.emplacement)}</dd>` : ''}
    ${v.couleur ? `<dt>Couleur</dt><dd>${esc(v.couleur)}</dd>` : ''}${v.cepages ? `<dt>Cépages</dt><dd>${esc(v.cepages)}</dd>` : ''}
    <dt>Coût de revient unitaire</dt><dd>${c.cu != null ? eur(c.cu) : 'Non renseigné'}</dd>
    <dt>Investi (détenu)</dt><dd>${c.cu != null ? eur(c.cu * c.detenu) : '—'}</dd>
    <dt>Valeur de marché</dt><dd>${vm ? eur(vm.valeur) + ' / bt' : 'Non évalué'}</dd>
    ${vm ? `<dt>Valeur totale</dt><dd>${eur(vm.valeur * c.detenu)}</dd>` : ''}
    ${gain != null ? `<dt>Gain ou perte potentiel</dt><dd class="${gain >= 0 ? 'pos' : 'neg'}">${gain > 0 ? '+' : ''}${eur(gain)} · ${pct((vm.valeur - c.cu) / c.cu * 100)}</dd>` : ''}
  </dl></div>
  <div class="sec"><h2>Garde et apogée</h2><button class="link" data-act="edit-garde" data-id="${v.id}">Modifier</button></div>
  <div class="card">${g ? `<dl class="facts"><dt>Début de fenêtre</dt><dd>${v.debut || '—'}</dd><dt>Apogée estimée</dt><dd>${v.apogee || '—'}</dd><dt>Fin de garde</dt><dd>${v.fin || '—'}</dd></dl><p class="hint">Estimations révisables, jamais des certitudes.</p>` : '<p class="muted small">Fenêtre de garde non renseignée.</p>'}</div>
  <div class="sec"><h2>Achats</h2></div><div class="card">${a.length ? a.map(m => `<div class="item"><div class="t">${m.qte} × ${m.prix != null ? eur(m.prix) : 'prix non renseigné'}${m.frais ? ' + ' + eur(m.frais) + ' de frais' : ''}<div class="d">${fdate(m.date)}${m.vendeur ? ' · ' + esc(m.vendeur) : ''}${m.statut === 'commande' ? ' · <strong>commandé</strong>' : ''}</div></div><div class="r">${m.statut === 'commande' ? `<button class="mini" data-act="recu" data-m="${m.id}">Reçu</button>` : ''}<button class="mini" data-act="edit-achat" data-m="${m.id}">Modifier</button></div></div>`).join('') : '<p class="muted small">Aucun achat enregistré.</p>'}</div>`;
  if (so.length) h += `<div class="sec"><h2>Sorties</h2></div><div class="card">${so.map(m => `<div class="item"><div class="t">${m.qte} × ${MOTIFS[m.motif] || m.motif}${m.prixVente != null ? ' à ' + eur(m.prixVente) : ''}<div class="d">${fdate(m.date)}${m.note ? ' · ' + esc(m.note) : ''}</div></div><div class="r"><button class="mini" data-act="suppr-mvt" data-m="${m.id}">Supprimer</button></div></div>`).join('')}</div>`;
  h += `<div class="sec"><h2>Cotations</h2></div><div class="card"><dl class="facts"><dt>Prix marchand</dt><dd>${dm ? eur(dm.valeur) : 'Non évalué'}</dd><dt>Transaction constatée</dt><dd>${dt ? eur(dt.valeur) : 'Non évalué'}</dd><dt>Valeur nette de revente</dt><dd>${vn ? eur(vn.valeur) : 'Non évalué'}</dd></dl>${cotes(v.id).map(x => `<div class="item"><div class="t">${eur(x.valeur)} · ${TYPES_COTE[x.type]}<div class="d">${fdate(x.date)} · ${esc(x.source || 'source non précisée')} · fiabilité ${FIAB[x.fiabilite] || '—'}</div></div><div class="r"><button class="mini" data-act="suppr-cote" data-c="${x.id}">Supprimer</button></div></div>`).join('')}</div>`;
  if (dg.length) h += `<div class="sec"><h2>Dégustations</h2></div><div class="card">${dg.map(d => `<div class="item"><div class="t">${d.note != null ? '<strong>' + d.note + '/100</strong> · ' : ''}${esc(d.commentaire || '')}<div class="d">${fdate(d.date)}</div></div><div class="r"><button class="mini" data-act="suppr-degu" data-d="${d.id}">Supprimer</button></div></div>`).join('')}</div>`;
  if (v.notes) h += `<div class="sec"><h2>Notes</h2></div><div class="card"><p style="margin:0;white-space:pre-wrap">${esc(v.notes)}</p></div>`;
  h += `<div class="row" style="margin-top:20px"><a class="btn" href="#/comparer" data-act="cmp-avec" data-id="${v.id}">Comparer</a><button class="btn danger" data-act="suppr-vin" data-id="${v.id}">Supprimer ce vin</button></div>`;
  return h;
}

/* ---------- Vue : garde ---------- */
function vGarde() {
  const L = S.vins.map(v => ({ v, c: calc(v) })).filter(x => x.c.stock > 0);
  const seg = `<div class="seg"><button class="${UI.gardeTab === 'chrono' ? 'on' : ''}" data-act="garde-tab" data-k="chrono">Chronologie</button><button class="${UI.gardeTab === 'cal' ? 'on' : ''}" data-act="garde-tab" data-k="cal">Calendrier</button><button class="${UI.gardeTab === 'statuts' ? 'on' : ''}" data-act="garde-tab" data-k="statuts">Par statut</button></div>`;
  if (!L.length) return seg + '<div class="empty"><h3>Aucune bouteille en cave</h3><p>Les fenêtres de garde apparaîtront ici.</p></div>';
  const avec = L.filter(x => etatGarde(x.v)), sans = L.filter(x => !etatGarde(x.v));
  const y = AN();
  let h = seg;
  if (UI.gardeTab === 'chrono') {
    const y0 = y - 1, y1 = Math.min(y + 40, Math.max(y + 15, ...avec.map(x => x.v.fin || x.v.apogee || x.v.debut || y)) + 1), sp = y1 - y0;
    const X = a => Math.max(0, Math.min(100, (a - y0) / sp * 100));
    avec.sort((a, b) => (a.v.apogee || a.v.fin || a.v.debut) - (b.v.apogee || b.v.fin || b.v.debut));
    h += `<div class="card tl"><div class="tl-axis">${[0, .25, .5, .75, 1].map(k => `<span>${Math.round(y0 + sp * k)}</span>`).join('')}</div>${avec.map(({ v, c }) => { const d = v.debut || v.apogee || y0, f = v.fin || v.apogee || d; return `<a class="tl-row" href="#/vin/${v.id}"><div class="tl-name"><span>${esc(nomVin(v))}</span><span class="muted">${c.stock} bt</span></div><div class="tl-track"><div class="tl-bar" style="left:${X(d)}%;width:${Math.max(1.5, X(f + 1) - X(d))}%"></div>${v.apogee ? `<div class="tl-peak" style="left:${X(v.apogee + .5)}%"></div>` : ''}<div class="tl-now" style="left:${X(y + .5)}%"></div></div></a>`; }).join('') || '<p class="muted small">Aucune fenêtre renseignée.</p>'}<div class="legend"><span><i style="background:var(--accent)"></i>Fenêtre de dégustation</span><span><i style="background:var(--gold)"></i>Apogée</span><span><i style="background:var(--ink)"></i>Aujourd'hui</span></div></div>`;
  } else if (UI.gardeTab === 'cal') {
    let any = false;
    for (let a = y; a <= y + 20; a++) {
      const ev = [];
      for (const { v, c } of avec) {
        if (v.debut === a) ev.push([v, c, 'entre dans sa fenêtre']);
        if (v.apogee === a) ev.push([v, c, 'apogée estimée']);
        if (v.fin === a) ev.push([v, c, 'fin de garde estimée']);
      }
      if (!ev.length) continue; any = true;
      h += `<h3 class="year-h">${a}</h3><div class="card">${ev.map(([v, c, t]) => `<a class="item" href="#/vin/${v.id}"><span class="t">${esc(nomVin(v))}<div class="d">${t} · ${c.stock} bt</div></span><span class="r">›</span></a>`).join('')}</div>`;
    }
    if (!any) h += '<p class="muted">Aucune échéance renseignée pour les vingt prochaines années.</p>';
  } else {
    for (const k of ['declin', 'boire', 'maturite', 'approche', 'jeune']) {
      const G = avec.filter(x => etatGarde(x.v) === k); if (!G.length) continue;
      h += `<div class="sec"><h2>${GARDE[k]}</h2><span class="muted small">${sum(G, x => x.c.stock)} bt</span></div><div class="card">${G.map(({ v, c }) => `<a class="item" href="#/vin/${v.id}"><span class="t">${esc(nomVin(v))}<div class="d">${[v.debut, v.apogee, v.fin].map(x => x || '?').join(' – ')} · ${c.stock} bt</div></span><span class="r">›</span></a>`).join('')}</div>`;
    }
  }
  if (sans.length) h += `<div class="sec"><h2>Fenêtre non renseignée</h2><span class="muted small">${sans.length}</span></div><div class="card">${sans.map(({ v }) => `<div class="item"><a class="t" href="#/vin/${v.id}">${esc(nomVin(v))}</a><div class="r"><button class="mini" data-act="edit-garde" data-id="${v.id}">Renseigner</button></div></div>`).join('')}</div>`;
  return h + '<p class="hint">Les fenêtres de garde sont des estimations que vous saisissez et révisez vous-même.</p>';
}

/* ---------- Vue : watchlist ---------- */
function groupes() { return uniq([...(S.reglages.groupes || GROUPES_DEF), ...S.watchlist.map(w => w.groupe)]); }
function vWatch() {
  const G = groupes();
  const L = S.watchlist.filter(w => !UI.wlGroupe || w.groupe === UI.wlGroupe).sort((a, b) => ({ haute: 0, moyenne: 1, decouverte: 2 }[a.priorite] - { haute: 0, moyenne: 1, decouverte: 2 }[b.priorite]) || nomCible(a).localeCompare(nomCible(b), 'fr'));
  return `<div class="seg"><button class="${!UI.wlGroupe ? 'on' : ''}" data-act="wl-groupe" data-k="">Toutes (${S.watchlist.length})</button>${G.map(g => `<button class="${UI.wlGroupe === g ? 'on' : ''}" data-act="wl-groupe" data-k="${esc(g)}">${esc(g)} (${S.watchlist.filter(w => w.groupe === g).length})</button>`).join('')}</div>
  <div class="row" style="margin-bottom:12px"><button class="btn primary" data-act="cible-new">+ Ajouter une cible</button><a class="btn" href="#/offre">Analyser une offre</a></div>
  ${L.length ? L.map(w => { const der = (w.prixObs || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return `<a class="card" href="#/cible/${w.id}"><div class="vin-top"><strong>${esc(w.producteur)}</strong><span class="badge p-${w.priorite}">${PRIO[w.priorite]}</span></div><div class="vin-cuvee">${esc(w.cuvee || 'Toutes cuvées')} · ${w.millesime || 'tous millésimes'}</div><div class="vin-meta">${[w.groupe, w.prixCible != null ? 'cible ' + eur(w.prixCible) : '', w.prixMax != null ? 'max ' + eur(w.prixMax) : '', der ? 'vu à ' + eur(der.prix) : ''].filter(Boolean).map(esc).join(' · ')}</div></a>`; }).join('') : '<div class="empty"><h3>Aucune cible</h3><p>Suivez ici les producteurs et cuvées que vous recherchez, même sans cuvée précise.</p></div>'}`;
}
function vCible(id) {
  const w = S.watchlist.find(x => x.id === id);
  if (!w) return '<div class="empty"><h3>Cible introuvable</h3><a class="btn" href="#/watchlist">Retour</a></div>';
  const obs = (w.prixObs || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const liens = String(w.liens || '').split(/\s+/).filter(x => /^https?:\/\//.test(x));
  const possedes = S.vins.filter(v => norm(v.producteur) === norm(w.producteur) && (!w.cuvee || norm(v.cuvee) === norm(w.cuvee)) && calc(v).detenu > 0);
  return `<div class="hero"><div class="prod">${esc(w.producteur)}</div><h2>${esc(w.cuvee || 'Toutes cuvées')} <span class="mill">${w.millesime || ''}</span></h2><div class="sub">${w.millesime ? '' : 'Tous millésimes · '}${esc(w.groupe || 'Sans groupe')}</div><div class="vin-foot"><span class="badge p-${w.priorite}">Priorité ${PRIO[w.priorite].toLowerCase()}</span></div></div>
  <div class="actions"><button class="btn primary" data-act="cible-achat" data-id="${w.id}">Acheté : mettre en cave</button><button class="btn" data-act="cible-offre" data-id="${w.id}">Analyser une offre</button><button class="btn" data-act="prix-obs" data-id="${w.id}">+ Prix observé</button><button class="btn" data-act="cible-edit" data-id="${w.id}">Modifier</button></div>
  <div class="card"><dl class="facts"><dt>Prix cible</dt><dd>${w.prixCible != null ? eur(w.prixCible) : '—'}</dd><dt>Prix maximum</dt><dd>${w.prixMax != null ? eur(w.prixMax) : '—'}</dd><dt>Rareté</dt><dd>${NIV_F[w.rarete || '']}</dd><dt>Potentiel de revente</dt><dd>${NIVEAUX[w.revente || '']}</dd><dt>Disponibilité connue</dt><dd>${esc(w.dispo || '—')}</dd><dt>Rappel</dt><dd>${w.rappel === false ? 'Désactivé' : 'Actif'}</dd></dl>${liens.length ? '<div style="margin-top:10px">' + liens.map(l => `<a class="link" href="${esc(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 44))} ↗</a><br>`).join('') + '</div>' : ''}</div>
  ${possedes.length ? `<div class="notice">Déjà en cave : ${possedes.map(v => `<a class="link" href="#/vin/${v.id}">${esc(nomVin(v))} (${calc(v).detenu})</a>`).join(', ')}</div>` : ''}
  <div class="sec"><h2>Prix observés</h2></div><div class="card">${obs.length ? obs.map(o => `<div class="item"><div class="t">${eur(o.prix)}<div class="d">${fdate(o.date)} · ${esc(o.source || 'source non précisée')}</div></div><div class="r"><button class="mini" data-act="suppr-obs" data-id="${w.id}" data-o="${o.id}">Supprimer</button></div></div>`).join('') : '<p class="muted small">Aucun prix observé. Saisissez ceux que vous relevez chez les marchands ou aux enchères.</p>'}</div>
  ${w.notes ? `<div class="sec"><h2>Notes de recherche</h2></div><div class="card"><p style="margin:0;white-space:pre-wrap">${esc(w.notes)}</p></div>` : ''}
  <div class="notice">Les alertes automatiques de nouvelles offres ou de nouveaux millésimes restent désactivées : aucune source de données externe n'est connectée.</div>
  <button class="btn danger block" data-act="cible-suppr" data-id="${w.id}">Supprimer cette cible</button>`;
}

/* ---------- Vue : analyser une offre ---------- */
function trouverCible(o) {
  const p = norm(o.producteur), cu = norm(o.cuvee);
  const C = S.watchlist.filter(w => norm(w.producteur) === p && (!w.cuvee || norm(w.cuvee) === cu) && (!w.millesime || String(w.millesime) === String(o.millesime || '')));
  return C.sort((a, b) => ((b.cuvee ? 1 : 0) + (b.millesime ? 1 : 0)) - ((a.cuvee ? 1 : 0) + (a.millesime ? 1 : 0)))[0] || null;
}
function analyser(o) {
  const args = []; let score = 0, ref = false, tropCher = false;
  const qte = Math.max(1, o.qte || 1), cu = o.prix + (o.frais || 0) / qte;
  args.push(`Coût de revient : ${eur(cu)} par bouteille, frais compris.`);
  const w = trouverCible(o);
  if (w) {
    score += { haute: 2, moyenne: 1, decouverte: .5 }[w.priorite];
    args.push(`Figure sur votre watchlist (priorité ${PRIO[w.priorite].toLowerCase()}${w.groupe ? ', ' + w.groupe : ''}).`);
    if (w.prixMax != null) { ref = true; if (cu > w.prixMax) { score -= 3; tropCher = true; args.push(`Au-dessus de votre prix maximum (${eur(w.prixMax)}) : limite que vous avez fixée vous-même.`); } }
    if (w.prixCible != null) { ref = true; if (cu <= w.prixCible) { score += 2; args.push(`Au niveau ou sous votre prix cible (${eur(w.prixCible)}).`); } else if (w.prixMax == null || cu <= w.prixMax) { score += .5; args.push(`Au-dessus de votre prix cible (${eur(w.prixCible)})${w.prixMax != null ? ', mais sous votre maximum' : ''}.`); } }
    const obs = (w.prixObs || []).map(x => x.prix).filter(x => x != null).sort((a, b) => a - b);
    if (obs.length) { ref = true; const med = obs[Math.floor(obs.length / 2)]; if (cu <= obs[0]) { score += 1.5; args.push(`Plus bas que tous vos prix observés (minimum ${eur(obs[0])}, ${obs.length} relevé${obs.length > 1 ? 's' : ''}).`); } else if (cu <= med) { score += .5; args.push(`Sous la médiane de vos prix observés (${eur(med)}).`); } else { score -= 1; args.push(`Au-dessus de la médiane de vos prix observés (${eur(med)}).`); } }
  } else args.push("Ne figure pas sur votre watchlist.");
  const memes = S.vins.filter(v => norm(v.producteur) === norm(o.producteur) && norm(v.cuvee) === norm(o.cuvee));
  const exact = memes.find(v => String(v.millesime || '') === String(o.millesime || ''));
  if (exact) {
    const c = calc(exact), vm = valeurMarche(exact.id), vn = derniere(exact.id, 'nette');
    if (c.cu != null) { ref = true; const d = (cu - c.cu) / c.cu * 100; args.push(`Votre coût de revient moyen sur ce vin : ${eur(c.cu)} (cette offre : ${pct(d)}).`); if (d <= -10) score += 1; else if (d >= 15) score -= 1; }
    if (vm) { ref = true; const d = (cu - vm.valeur) / vm.valeur * 100; args.push(`Dernière cotation : ${eur(vm.valeur)} (${TYPES_COTE[vm.type].toLowerCase()}, ${vm.source || 'source non précisée'}, ${fdate(vm.date)}) ; cette offre : ${pct(d)}.`); if (d <= -10) score += 2; else if (d >= 10) score -= 2; }
    if (vn && cu > vn.valeur) { score -= .5; args.push(`Au-dessus de la valeur nette de revente estimée (${eur(vn.valeur)}).`); }
    if (c.detenu > 0) { args.push(`Doublon : vous détenez déjà ${c.detenu} bouteille${c.detenu > 1 ? 's' : ''} de ce millésime.`); score -= c.detenu >= 6 ? 1.5 : c.detenu >= 3 ? .5 : 0; }
  }
  const autres = memes.filter(v => v !== exact && calc(v).detenu > 0);
  if (autres.length) args.push(`Autres millésimes détenus : ${autres.map(v => (v.millesime || 'NM') + ' (' + calc(v).detenu + ')').join(', ')}.`);
  const rar = o.rarete || (w && w.rarete) || '', rev = o.revente || (w && w.revente) || '';
  if (rar) { score += { forte: 1.5, moyenne: .5, faible: -.5 }[rar]; args.push(`Rareté : ${NIV_F[rar].toLowerCase()}.`); } else args.push('Rareté non renseignée.');
  if (rev) { score += { forte: 1.5, moyenne: .5, faible: -1 }[rev]; args.push(`Potentiel de revente : ${NIVEAUX[rev].toLowerCase()}.`); } else args.push('Potentiel de revente non renseigné.');
  const cap = S.reglages.capacite || 0;
  if (cap > 0) { const st = stats(), occ = st.nb + st.cmd, libre = cap - occ; if (libre < qte) { score -= 2; args.push(`Place insuffisante : ${Math.max(0, libre)} emplacement${libre > 1 ? 's' : ''} libre${libre > 1 ? 's' : ''} sur ${cap}.`); } else if (libre - qte < cap * .05) { score -= .5; args.push(`Cave presque pleine : ${libre} emplacements libres sur ${cap}.`); } else args.push(`Place disponible : ${libre} emplacements libres sur ${cap}.`); }
  else args.push('Capacité de la cave non renseignée (Réglages) : la place disponible n\'est pas prise en compte.');
  if (!ref) args.push("Aucune référence de prix enregistrée pour ce vin : la comparaison de prix est impossible. Saisissez un prix cible, un prix observé ou une cotation.");
  let v = score >= 3 ? 'acheter' : score <= -1 ? 'laisser' : 'surveiller';
  if (!ref && v === 'acheter') v = 'surveiller';
  if (tropCher) v = 'laisser';
  return { verdict: v, args, score };
}
function vOffre() {
  const o = UI.offre || {};
  const inp = (n, l, t = 'text', extra = '') => `<label class="fld${extra.includes('half') ? ' half' : ''}"><span class="lab">${l}</span><input name="${n}" type="${t}" value="${esc(o[n] ?? '')}" ${t === 'number' ? 'inputmode="decimal" step="any"' : ''} autocomplete="off" ${extra.replace('half', '')}></label>`;
  const selN = (n, l, M = NIVEAUX) => `<label class="fld half"><span class="lab">${l}</span><select name="${n}">${Object.entries(M).map(([k, t]) => `<option value="${k}"${(o[n] || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const V = UI.verdict;
  return `<p class="muted small">La recommandation s'appuie uniquement sur vos propres données : watchlist, prix observés, cotations saisies, doublons et place disponible. Elle ne consulte aucun prix en ligne.</p>
  <form id="offre-form" class="grid">${inp('producteur', 'Domaine / producteur *', 'text', 'list="dl-prod"')}<datalist id="dl-prod">${uniq([...S.vins.map(v => v.producteur), ...S.watchlist.map(w => w.producteur)]).map(p => `<option value="${esc(p)}">`).join('')}</datalist>${inp('cuvee', 'Cuvée')}${inp('millesime', 'Millésime', 'number', 'half')}${inp('qte', 'Quantité', 'number', 'half')}${inp('prix', 'Prix unitaire (€) *', 'number', 'half')}${inp('frais', 'Frais totaux (€)', 'number', 'half')}${inp('vendeur', 'Vendeur')}${selN('rarete', 'Rareté', NIV_F)}${selN('revente', 'Potentiel de revente')}<div class="fld"><button type="submit" class="btn primary block">Analyser</button></div></form>
  ${V ? `<div class="verdict ${V.verdict}"><h3>${{ acheter: 'Acheter', surveiller: 'Surveiller', laisser: 'Laisser passer' }[V.verdict]}</h3><ul>${V.args.map(a => `<li>${esc(a)}</li>`).join('')}</ul><div class="row" style="margin-top:12px"><button class="btn" data-act="offre-cave">Mettre en cave</button><button class="btn" data-act="offre-obs">Enregistrer ce prix observé</button></div></div>` : ''}`;
}

/* ---------- Vues : plus, dégustations, historique, comparer, alertes ---------- */
function vPlus() {
  const L = [['#/offre', 'Analyser une offre'], ['#/comparer', 'Comparer deux vins'], ['#/degustations', 'Journal de dégustation'], ['#/alertes', 'Alertes'], ['#/historique', 'Historique et annulation'], ['#/sync', 'Synchronisation en ligne'], ['#/donnees', 'Import, export et sauvegardes'], ['#/reglages', 'Réglages']];
  return `<div class="card" style="padding:4px 14px">${L.map(([h, t]) => `<a class="list-link" href="${h}"><span>${t}</span><span>›</span></a>`).join('')}</div><p class="hint" style="text-align:center">Ma Cave ${VERSION} · données enregistrées sur cet appareil</p>`;
}
function vDegus() {
  const L = S.degustations.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!L.length) return '<div class="empty"><h3>Aucune dégustation</h3><p>Ajoutez une note depuis la fiche d\'un vin, ou en retirant une bouteille consommée.</p></div>';
  return `<div class="card">${L.map(d => { const v = S.vins.find(x => x.id === d.vinId); return `<a class="item" href="${v ? '#/vin/' + v.id : '#/degustations'}"><span class="t">${esc(v ? nomVin(v) : 'Vin supprimé')}<div class="d">${fdate(d.date)}${d.commentaire ? ' · ' + esc(d.commentaire) : ''}</div></span><span class="r">${d.note != null ? d.note + '/100' : ''}</span></a>`; }).join('')}</div>`;
}
function vHisto() {
  const der = annulations[annulations.length - 1];
  return `<div class="card"><p style="margin-top:0">${der ? `Dernière opération : <strong>${esc(der.label)}</strong>` : 'Aucune opération à annuler.'}</p><button class="btn block" data-act="annuler"${der ? '' : ' disabled'}>Annuler la dernière opération</button><p class="hint">Les 20 dernières opérations peuvent être annulées, une par une.</p></div>
  <div class="sec"><h2>Journal</h2></div><div class="card">${S.journal.length ? S.journal.slice(0, 200).map(j => `<div class="item"><span class="t">${esc(j.texte)}<div class="d">${new Date(j.date).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}</div></span></div>`).join('') : '<p class="muted small">Aucune opération enregistrée.</p>'}</div>`;
}
function vComparer() {
  const opt = sel => `<option value="">Choisir…</option>` + S.vins.slice().sort((a, b) => nomVin(a).localeCompare(nomVin(b), 'fr')).map(v => `<option value="${v.id}"${sel === v.id ? ' selected' : ''}>${esc(nomVin(v))}</option>`).join('');
  const A = S.vins.find(v => v.id === UI.cmp.a), B = S.vins.find(v => v.id === UI.cmp.b);
  let h = `<div class="grid"><label class="fld"><span class="lab">Premier vin</span><select data-chg="cmp" data-k="a">${opt(UI.cmp.a)}</select></label><label class="fld"><span class="lab">Second vin</span><select data-chg="cmp" data-k="b">${opt(UI.cmp.b)}</select></label></div>`;
  if (A && B) {
    const L = v => { const c = calc(v), vm = valeurMarche(v.id), g = etatGarde(v); return [['Producteur', v.producteur], ['Cuvée', v.cuvee], ['Millésime', v.millesime || 'NM'], ['Appellation', v.appellation], ['Région', [v.region, v.pays].filter(Boolean).join(', ')], ['Format', fmtFormat(v.format)], ['En cave', c.stock + (c.qCmd ? ' (+' + c.qCmd + ' cmd)' : '')], ['Coût de revient', c.cu != null ? eur(c.cu) : 'Non renseigné'], ['Valeur de marché', vm ? eur(vm.valeur) : 'Non évalué'], ['Évolution', vm && c.cu ? pct((vm.valeur - c.cu) / c.cu * 100) : '—'], ['Fenêtre', [v.debut, v.apogee, v.fin].map(x => x || '?').join(' – ')], ['Statut de garde', g ? GARDE[g] : 'Non renseigné'], ['Dernière note', (() => { const d = (ix().dg.get(v.id) || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)))[0]; return d && d.note != null ? d.note + '/100' : '—'; })()]]; };
    const la = L(A), lb = L(B);
    h += `<div class="card" style="margin-top:12px;overflow-x:auto"><table class="cmp">${la.map((r, i) => `<tr><th>${r[0]}</th><td>${esc(r[1] ?? '')}</td><td>${esc(lb[i][1] ?? '')}</td></tr>`).join('')}</table></div>`;
  } else h += '<p class="muted" style="margin-top:14px">Choisissez deux vins, par exemple deux millésimes de la même cuvée.</p>';
  return h;
}
function vAlertes() {
  const L = alertes();
  return (L.length ? `<div class="card">${L.map(a => `<a class="item" href="${a.lien}"><span class="t">${esc(a.texte)}</span><span class="r">›</span></a>`).join('')}</div>` : '<div class="empty"><h3>Aucune alerte</h3><p>Rien à signaler pour le moment.</p></div>') +
    '<div class="notice">Les alertes de garde reposent sur les fenêtres que vous avez saisies. Les alertes de prix restent désactivées tant qu\'aucune source de données réelle n\'est connectée.</div>';
}

/* ---------- Vue : données ---------- */
const CHAMPS_IMPORT = [
  ['producteur', 'Domaine / producteur', ['producteur', 'domaine', 'producer', 'winery', 'chateau', 'estate', 'nom du domaine', 'nom', 'vin', 'wine', 'name']],
  ['cuvee', 'Cuvée', ['cuvee', 'nom de la cuvee', 'wine name', 'designation', 'etiquette']],
  ['millesime', 'Millésime', ['millesime', 'vintage', 'annee', 'year']],
  ['pays', 'Pays', ['pays', 'country']], ['region', 'Région', ['region']],
  ['appellation', 'Appellation', ['appellation', 'aoc', 'denomination']],
  ['couleur', 'Couleur', ['couleur', 'color', 'colour', 'type']],
  ['cepages', 'Cépages', ['cepages', 'cepage', 'grapes', 'grape', 'varietal']],
  ['format', 'Format', ['format', 'taille', 'size', 'volume', 'contenance', 'bottle size']],
  ['quantite', 'Quantité', ['quantite', 'qte', 'qty', 'quantity', 'nombre', 'nb', 'bouteilles', 'stock']],
  ['emplacement', 'Emplacement', ['emplacement', 'location', 'casier', 'bin', 'rangement']],
  ['dateAchat', "Date d'achat", ['date d achat', 'date achat', 'purchase date', 'date']],
  ['vendeur', 'Vendeur', ['vendeur', 'seller', 'marchand', 'merchant', 'fournisseur']],
  ['prix', 'Prix unitaire', ['prix unitaire', 'prix d achat', 'prix', 'price', 'cout', 'pu']],
  ['frais', 'Frais de livraison', ['frais de livraison', 'frais', 'livraison', 'shipping']],
  ['statut', 'Statut', ['statut', 'status', 'etat']],
  ['debut', 'Début de fenêtre (année)', ['debut', 'boire a partir de', 'drink from']],
  ['apogee', 'Apogée (année)', ['apogee', 'peak']],
  ['fin', 'Fin de garde (année)', ['fin de garde', 'fin', 'boire avant', 'drink until']],
  ['controle', 'À vérifier (contrôle)', ['controle', 'a verifier', 'verification', 'check']],
  ['notes', 'Notes', ['notes', 'note', 'commentaire', 'commentaires', 'remarques']]
];
const GENERIQUES = new Set(['nom', 'vin', 'wine', 'name', 'type', 'date', 'fin', 'debut', 'nb', 'pu', 'note', 'etat', 'bin', 'size', 'stock']);
function vDonnees() {
  const I = UI.imp;
  let h = '';
  if (I) {
    const p = apercuImport();
    h += `<div class="sec"><h2>Import : ${esc(I.nom)}</h2><button class="link" data-act="imp-annuler">Abandonner</button></div>
    <div class="card"><p class="small" style="margin-top:0">${I.lignes.length} ligne${I.lignes.length > 1 ? 's' : ''} lue${I.lignes.length > 1 ? 's' : ''}. Vérifiez la correspondance des colonnes :</p><div class="grid">${CHAMPS_IMPORT.map(([k, l]) => `<label class="fld half"><span class="lab">${l}</span><select data-chg="imp-map" data-k="${k}"><option value="">— ignorer —</option>${I.entetes.map(e => `<option value="${esc(e)}"${I.map[k] === e ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select></label>`).join('')}</div></div>
    <div class="card"><dl class="facts"><dt>Lignes valides</dt><dd>${p.valides}</dd><dt>Lignes ignorées</dt><dd>${p.ignorees}</dd><dt>Contenants</dt><dd>${p.contenants}</dd><dt>dont magnums</dt><dd>${p.magnums}</dd><dt>Équivalent 75 cl</dt><dd>${new Intl.NumberFormat('fr-BE', { maximumFractionDigits: 1 }).format(p.eq)}</dd><dt>Nouvelles références</dt><dd>${p.nouveaux}</dd><dt>Lignes regroupées (même vin dans le fichier)</dt><dd>${p.groupes}</dd><dt>Doublons avec la cave actuelle</dt><dd>${p.doublons}</dd></dl>
    ${p.doublons ? `<label class="fld" style="margin-top:10px"><span class="lab">Vins déjà présents dans la cave</span><select data-chg="imp-mode"><option value="ajouter"${I.mode === 'ajouter' ? ' selected' : ''}>Ajouter comme nouvel achat</option><option value="ignorer"${I.mode === 'ignorer' ? ' selected' : ''}>Ignorer ces lignes</option></select><span class="hint">${esc(p.exDoublons.slice(0, 4).join(' ; '))}${p.exDoublons.length > 4 ? '…' : ''}</span></label>` : ''}
    ${p.exemples.length ? `<p class="hint">Aperçu : ${esc(p.exemples.join(' ; '))}</p>` : ''}
    <button class="btn primary block" style="margin-top:12px" data-act="imp-go"${p.valides ? '' : ' disabled'}>Importer ${p.valides} ligne${p.valides > 1 ? 's' : ''}</button></div>`;
  }
  const de = S.reglages.dernierExport;
  h += `<div class="sec"><h2>Importer ma collection</h2></div><div class="card"><p class="small" style="margin-top:0">Fichier CSV ou Excel (.xlsx), une ligne par vin ou par achat. Les colonnes sont reconnues automatiquement puis validées par vous.</p><label class="btn primary block">Choisir un fichier CSV ou Excel<input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" data-chg="imp-fichier" hidden></label><button class="btn block" style="margin-top:8px" data-act="modele-csv">Télécharger un modèle CSV</button></div>
  <div class="sec"><h2>Sauvegarde complète</h2></div><div class="card"><p class="small" style="margin-top:0">${de ? 'Dernière sauvegarde exportée le ' + fdate(de) + '.' : 'Aucune sauvegarde exportée pour le moment.'} Le fichier contient toutes vos données et vos photos.</p><button class="btn primary block" data-act="export-json">Exporter une sauvegarde (JSON)</button><label class="btn block" style="margin-top:8px">Restaurer une sauvegarde<input type="file" accept=".json,application/json" data-chg="restaurer" hidden></label></div>
  <div class="sec"><h2>Exports CSV</h2></div><div class="card"><div class="row"><button class="btn" data-act="export-csv" data-k="inventaire">Inventaire</button><button class="btn" data-act="export-csv" data-k="mouvements">Achats et sorties</button><button class="btn" data-act="export-csv" data-k="cotations">Cotations</button><button class="btn" data-act="export-csv" data-k="watchlist">Watchlist</button></div><p class="hint">Séparateur point-virgule, lisible directement dans Excel.</p></div>`;
  return h;
}
function vReglages() {
  const r = S.reglages;
  return `<div class="card"><div class="grid">
    <label class="fld"><span class="lab">Thème</span><select data-chg="reglage" data-k="theme">${[['auto', 'Automatique (selon le téléphone)'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([v, l]) => `<option value="${v}"${r.theme === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Capacité de la cave (nombre de bouteilles)</span><input type="number" inputmode="numeric" min="0" value="${r.capacite || ''}" placeholder="Non renseignée" data-chg="reglage" data-k="capacite"><span class="hint">Sert à l'analyse des offres (place disponible).</span></label>
    <label class="fld"><span class="lab">Groupes de la watchlist</span><input type="text" value="${esc((r.groupes || []).join(', '))}" data-chg="reglage" data-k="groupes"><span class="hint">Séparés par des virgules.</span></label>
    <label class="check"><input type="checkbox" ${r.notifications ? 'checked' : ''} data-chg="reglage" data-k="notifications"><span>Notification des alertes de garde à l'ouverture de l'application</span></label>
  </div></div>
  <div class="card"><dl class="facts"><dt>Stockage</dt><dd id="st-persist">…</dd><dt>Espace utilisé</dt><dd id="st-usage">…</dd><dt>Version</dt><dd>${VERSION}</dd></dl><p class="hint">Les données restent sur ce téléphone. Sans synchronisation en ligne, exportez régulièrement une sauvegarde : elles seraient perdues si vous effaciez les données du navigateur ou désinstalliez l'application.</p></div>
  <div class="notice">Reconnaissance d'étiquette par IA : prévue dans une évolution ultérieure. La sauvegarde automatique en ligne se règle dans Plus › Synchronisation en ligne.</div>
  <button class="btn danger block" data-act="tout-effacer">Effacer toutes les données</button>`;
}
const VUES = { tableau: vTableau, cave: vCave, vin: vVin, garde: vGarde, watchlist: vWatch, cible: vCible, plus: vPlus, offre: vOffre, degustations: vDegus, historique: vHisto, donnees: vDonnees, reglages: vReglages, comparer: vComparer, alertes: vAlertes };

/* ---------- Formulaires métier ---------- */
const listes = () => ({ prod: S.vins.map(v => v.producteur).concat(S.watchlist.map(w => w.producteur)), pays: S.vins.map(v => v.pays), region: S.vins.map(v => v.region), app: S.vins.map(v => v.appellation), vend: S.mouvements.map(m => m.vendeur), empl: S.vins.map(v => v.emplacement) });
function champsIdentite(v, L) {
  const fm = Number(v.format) || 75, connu = FORMATS.some(f => f[0] === fm);
  return [
    { name: 'producteur', label: 'Domaine / producteur', required: true, value: v.producteur, list: L.prod },
    { name: 'cuvee', label: 'Cuvée', value: v.cuvee },
    { name: 'millesime', label: 'Millésime', type: 'number', half: true, value: v.millesime, placeholder: 'Optionnel' },
    { name: 'couleur', label: 'Couleur', type: 'select', half: true, value: v.couleur || '', options: [['', '—'], ...COULEURS] },
    { name: 'format', label: 'Format', type: 'select', half: true, value: connu ? fm : 0, options: [...FORMATS, [0, 'Autre format…']] },
    { name: 'formatAutre', label: 'Autre format (cl)', type: 'number', half: true, value: connu ? '' : fm },
    { name: 'pays', label: 'Pays', half: true, value: v.pays, list: L.pays },
    { name: 'region', label: 'Région', half: true, value: v.region, list: L.region },
    { name: 'appellation', label: 'Appellation', value: v.appellation, list: L.app },
    { name: 'cepages', label: 'Cépages', value: v.cepages }
  ];
}
const champsGarde = v => [
  { type: 'titre', label: 'Garde (estimations révisables)' },
  { name: 'debut', label: 'Début de fenêtre', type: 'number', half: true, value: v.debut, placeholder: 'Année' },
  { name: 'apogee', label: 'Apogée', type: 'number', half: true, value: v.apogee, placeholder: 'Année' },
  { name: 'fin', label: 'Fin de garde', type: 'number', half: true, value: v.fin, placeholder: 'Année' }
];
function lireIdentite(x) {
  const fa = num(x.formatAutre), f = Number(x.format);
  return { producteur: x.producteur.trim(), cuvee: x.cuvee.trim(), millesime: int(x.millesime), couleur: x.couleur, format: f > 0 ? f : (fa > 0 ? fa : 75), pays: x.pays.trim(), region: x.region.trim(), appellation: x.appellation.trim(), cepages: x.cepages.trim() };
}
function lireGarde(x) {
  const g = { debut: int(x.debut), apogee: int(x.apogee), fin: int(x.fin) };
  const s = [g.debut, g.apogee, g.fin].filter(n => n != null);
  for (const n of s) if (n < 1900 || n > 2200) return { err: 'Les années de garde doivent être des années complètes (par exemple 2032).' };
  for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1]) return { err: "Les années de garde doivent se suivre : début, apogée, puis fin." };
  return g;
}
async function stockerPhotos(datas) { const ids = []; for (const d of datas) { const id = 'p_' + uid(); await photoSet(id, d); cachePhotos.set(id, d); ids.push(id); } return ids; }

function ouvrirAjout() {
  openSheet(`${tete('Ajouter une bouteille')}<div class="sheet-body"><label class="fld"><span class="lab">Vin déjà répertorié ou sur la watchlist</span><input id="aj-q" type="search" placeholder="Producteur, cuvée, millésime…" autocomplete="off"></label><div id="aj-res" style="margin-top:10px"></div></div><div class="sheet-foot"><button class="btn primary" data-act="nouveau-vin">Créer un nouveau vin</button></div>`);
  const q = $('#aj-q'); q.addEventListener('input', () => resAjout(q.value)); resAjout('');
}
function resAjout(q) {
  const t = norm(q).split(' ').filter(Boolean);
  let V = S.vins.filter(v => { const h = norm(nomVin(v) + ' ' + (v.appellation || '')); return t.every(x => h.includes(x)); });
  V = t.length ? V.slice(0, 12) : V.slice().sort((a, b) => String(b.cree || '').localeCompare(String(a.cree || ''))).slice(0, 4);
  const W = t.length ? S.watchlist.filter(w => { const h = norm(nomCible(w)); return t.every(x => h.includes(x)); }).slice(0, 6) : [];
  $('#aj-res').innerHTML = (V.length ? `<p class="lab">${t.length ? 'Dans la cave' : 'Derniers vins ajoutés'}</p>` + V.map(v => `<button class="res" data-act="achat" data-id="${v.id}"><strong>${esc(nomVin(v))}</strong><small>${calc(v).stock} en cave · ${fmtFormat(v.format)} · ajouter un achat</small></button>`).join('') : '') +
    (W.length ? '<p class="lab">Sur la watchlist</p>' + W.map(w => `<button class="res" data-act="cible-achat" data-id="${w.id}"><strong>${esc(nomCible(w))}</strong><small>déplacer vers la cave</small></button>`).join('') : '') +
    (!V.length && !W.length ? `<p class="muted small">${S.vins.length ? 'Aucun vin correspondant.' : 'Votre inventaire est vide.'} Créez un nouveau vin ci-dessous.</p>` : '');
}
function ouvrirNouveauVin(pre = {}, opt = {}) {
  const L = listes();
  openForm({
    title: 'Nouveau vin', submitLabel: 'Ajouter à la cave',
    fields: [...champsIdentite(pre, L),
    { type: 'titre', label: 'Achat' },
    { name: 'qte', label: 'Quantité', type: 'number', half: true, value: pre.qte || 1, min: 1, step: 1 },
    { name: 'statut', label: 'Statut', type: 'select', half: true, value: 'en_cave', options: [['en_cave', 'En cave'], ['commande', 'Commandé']] },
    { name: 'date', label: "Date d'achat", type: 'date', half: true, value: today() },
    { name: 'vendeur', label: 'Vendeur', half: true, value: pre.vendeur, list: L.vend },
    { name: 'prix', label: 'Prix unitaire (€)', type: 'number', half: true, value: pre.prix },
    { name: 'frais', label: 'Frais de livraison (€)', type: 'number', half: true, value: pre.frais, hint: 'Total pour cet achat' },
    { name: 'emplacement', label: 'Emplacement dans la cave', value: pre.emplacement, list: L.empl },
    ...champsGarde(pre),
    { type: 'titre', label: 'Photos et notes' },
    { name: 'photos', type: 'photos', label: 'Bouteille, étiquette' },
    { name: 'notes', label: 'Notes personnelles', type: 'textarea', value: pre.notes },
    ...(opt.cibleId ? [{ name: 'retirerCible', type: 'checkbox', label: 'Retirer cette cible de la watchlist', value: !!opt.retirerDefaut }] : [])],
    onSubmit: async (x, photos) => {
      if (!x.producteur.trim()) return "Le domaine / producteur est obligatoire.";
      const q = int(x.qte); if (!q || q < 1) return 'La quantité doit être au moins 1.';
      const g = lireGarde(x); if (g.err) return g.err;
      const idn = lireIdentite(x);
      const existant = S.vins.find(v => cleVin(v) === cleVin(idn));
      const ids = await stockerPhotos(photos);
      const achat = { id: uid(), type: 'achat', date: x.date || today(), qte: q, prix: num(x.prix), frais: num(x.frais) || 0, vendeur: x.vendeur.trim(), statut: x.statut };
      let vid;
      commit(existant ? `Achat ajouté à ${nomVin(existant)} (déjà répertorié)` : `Vin ajouté : ${nomVin(idn)}`, () => {
        if (existant) { vid = existant.id; existant.photos = (existant.photos || []).concat(ids); if (x.emplacement.trim() && !existant.emplacement) existant.emplacement = x.emplacement.trim(); }
        else { vid = uid(); S.vins.push({ id: vid, ...idn, emplacement: x.emplacement.trim(), notes: x.notes.trim(), debut: g.debut, apogee: g.apogee, fin: g.fin, reserve: false, photos: ids, cree: new Date().toISOString() }); }
        S.mouvements.push({ ...achat, vinId: vid });
        if (opt.cibleId && x.retirerCible) S.watchlist = S.watchlist.filter(w => w.id !== opt.cibleId);
      });
      location.hash = '#/vin/' + vid;
    }
  });
}
function ouvrirAchat(vinId, mId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return;
  const m = mId ? S.mouvements.find(x => x.id === mId) : null, L = listes();
  const der = achats(vinId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  openForm({
    title: (m ? "Modifier l'achat · " : 'Nouvel achat · ') + nomVin(v),
    fields: [
      { name: 'qte', label: 'Quantité', type: 'number', half: true, value: m ? m.qte : 1, min: 1, step: 1 },
      { name: 'statut', label: 'Statut', type: 'select', half: true, value: m ? m.statut : 'en_cave', options: [['en_cave', 'En cave'], ['commande', 'Commandé']] },
      { name: 'date', label: "Date d'achat", type: 'date', half: true, value: m ? m.date : today() },
      { name: 'vendeur', label: 'Vendeur', half: true, value: m ? m.vendeur : (der ? der.vendeur : ''), list: L.vend },
      { name: 'prix', label: 'Prix unitaire (€)', type: 'number', half: true, value: m ? m.prix : '' },
      { name: 'frais', label: 'Frais de livraison (€)', type: 'number', half: true, value: m ? m.frais || '' : '', hint: 'Total pour cet achat' },
      ...(m ? [{ name: 'supprimer', type: 'checkbox', label: 'Supprimer cet achat (saisi par erreur)' }] : [])],
    onSubmit: x => {
      const c = calc(v);
      if (m && x.supprimer) {
        if (m.statut !== 'commande' && c.qRecu - m.qte < c.qSortie) return "Impossible : des bouteilles de cet achat ont déjà été sorties. Supprimez d'abord la sortie.";
        commit(`Achat supprimé : ${nomVin(v)}`, () => { S.mouvements = S.mouvements.filter(y => y.id !== m.id); }); return;
      }
      const q = int(x.qte); if (!q || q < 1) return 'La quantité doit être au moins 1.';
      if (m) {
        const recuApres = c.qRecu - (m.statut !== 'commande' ? m.qte : 0) + (x.statut !== 'commande' ? q : 0);
        if (recuApres < c.qSortie) return `Impossible : ${c.qSortie} bouteille${c.qSortie > 1 ? 's ont' : ' a'} déjà été sortie${c.qSortie > 1 ? 's' : ''}.`;
      }
      const d = { date: x.date || today(), qte: q, prix: num(x.prix), frais: num(x.frais) || 0, vendeur: x.vendeur.trim(), statut: x.statut };
      commit(m ? `Achat modifié : ${nomVin(v)}` : `${q} bouteille${q > 1 ? 's' : ''} ajoutée${q > 1 ? 's' : ''} : ${nomVin(v)}`, () => {
        if (m) Object.assign(S.mouvements.find(y => y.id === m.id), d); else S.mouvements.push({ id: uid(), vinId, type: 'achat', ...d });
      });
      if (route().name !== 'vin') location.hash = '#/vin/' + vinId;
    }
  });
}
function ouvrirSortie(vinId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return; const c = calc(v);
  openForm({
    title: 'Retirer · ' + nomVin(v), submitLabel: 'Retirer du stock',
    fields: [
      { name: 'motif', label: 'Motif', type: 'select', half: true, value: 'consomme', options: Object.entries(MOTIFS) },
      { name: 'qte', label: `Quantité (${c.stock} en cave)`, type: 'number', half: true, value: 1, min: 1, step: 1 },
      { name: 'date', label: 'Date', type: 'date', half: true, value: today() },
      { name: 'prixVente', label: 'Prix de vente unitaire (€)', type: 'number', half: true, hint: 'Si vendue' },
      { name: 'note', label: 'Note de dégustation (sur 100)', type: 'number', half: true, hint: 'Si consommée' },
      { name: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 2 },
      { type: 'info', label: "L'historique du vin est conservé, même lorsque le stock tombe à zéro." }],
    onSubmit: x => {
      const q = int(x.qte); if (!q || q < 1) return 'La quantité doit être au moins 1.';
      if (q > c.stock) return `Il n'y a que ${c.stock} bouteille${c.stock > 1 ? 's' : ''} en cave.`;
      const note = num(x.note); if (note != null && (note < 0 || note > 100)) return 'La note doit être comprise entre 0 et 100.';
      commit(`${q} bouteille${q > 1 ? 's' : ''} ${MOTIFS[x.motif].toLowerCase()}${q > 1 ? 's' : ''} : ${nomVin(v)}`, () => {
        S.mouvements.push({ id: uid(), vinId, type: 'sortie', date: x.date || today(), qte: q, motif: x.motif, prixVente: x.motif === 'vendu' ? num(x.prixVente) : null, note: x.commentaire.trim() });
        if (x.motif === 'consomme' && (note != null || x.commentaire.trim())) S.degustations.push({ id: uid(), vinId, date: x.date || today(), note, commentaire: x.commentaire.trim() });
      });
    }
  });
}
function ouvrirEditVin(vinId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return;
  openForm({
    title: 'Modifier le vin',
    fields: [...champsIdentite(v, listes()), { name: 'emplacement', label: 'Emplacement dans la cave', value: v.emplacement, list: listes().empl }, ...champsGarde(v), { name: 'notes', label: 'Notes personnelles', type: 'textarea', value: v.notes }],
    onSubmit: x => {
      if (!x.producteur.trim()) return 'Le domaine / producteur est obligatoire.';
      const g = lireGarde(x); if (g.err) return g.err;
      const idn = lireIdentite(x);
      const autre = S.vins.find(y => y.id !== v.id && cleVin(y) === cleVin(idn));
      if (autre) return `Un vin identique existe déjà : ${nomVin(autre)} (${fmtFormat(autre.format)}).`;
      commit(`Vin modifié : ${nomVin(idn)}`, () => Object.assign(S.vins.find(y => y.id === v.id), idn, { emplacement: x.emplacement.trim(), notes: x.notes.trim(), debut: g.debut, apogee: g.apogee, fin: g.fin }));
    }
  });
}
function ouvrirGarde(vinId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return;
  openForm({ title: 'Garde · ' + nomVin(v), fields: champsGarde(v).slice(1).concat([{ type: 'info', label: 'Ces dates sont vos estimations ; vous pouvez les réviser à tout moment.' }]), onSubmit: x => { const g = lireGarde(x); if (g.err) return g.err; commit(`Fenêtre de garde mise à jour : ${nomVin(v)}`, () => Object.assign(S.vins.find(y => y.id === v.id), g)); } });
}
function ouvrirCote(vinId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return;
  openForm({
    title: 'Cotation · ' + nomVin(v),
    fields: [
      { name: 'type', label: 'Nature du prix', type: 'select', value: 'marchand', options: Object.entries(TYPES_COTE) },
      { name: 'valeur', label: 'Prix par bouteille (€)', type: 'number', half: true, required: true },
      { name: 'date', label: 'Date du relevé', type: 'date', half: true, value: today() },
      { name: 'source', label: 'Source', placeholder: 'Marchand, site d\'enchères, lot…', list: S.cotations.map(c => c.source) },
      { name: 'fiabilite', label: 'Fiabilité', type: 'select', value: 'moyenne', options: Object.entries(FIAB) },
      { type: 'info', label: "Saisissez uniquement des prix que vous avez réellement relevés. Sans cotation, le vin reste « Non évalué »." }],
    onSubmit: x => { const val = num(x.valeur); if (val == null || val < 0) return 'Indiquez un prix valide.'; commit(`Cotation ajoutée : ${nomVin(v)} à ${eur(val)}`, () => S.cotations.push({ id: uid(), vinId, type: x.type, valeur: val, date: x.date || today(), source: x.source.trim(), fiabilite: x.fiabilite })); }
  });
}
function ouvrirDegu(vinId) {
  const v = S.vins.find(x => x.id === vinId); if (!v) return; const c = calc(v);
  openForm({
    title: 'Dégustation · ' + nomVin(v),
    fields: [{ name: 'date', label: 'Date', type: 'date', half: true, value: today() }, { name: 'note', label: 'Note (sur 100)', type: 'number', half: true }, { name: 'commentaire', label: 'Commentaire', type: 'textarea' },
    ...(c.stock > 0 ? [{ name: 'retirer', type: 'checkbox', label: 'Retirer une bouteille du stock (consommée)', value: true }] : [])],
    onSubmit: x => {
      const note = num(x.note); if (note != null && (note < 0 || note > 100)) return 'La note doit être comprise entre 0 et 100.';
      if (note == null && !x.commentaire.trim()) return 'Indiquez une note ou un commentaire.';
      commit(`Dégustation notée : ${nomVin(v)}`, () => { S.degustations.push({ id: uid(), vinId, date: x.date || today(), note, commentaire: x.commentaire.trim() }); if (x.retirer) S.mouvements.push({ id: uid(), vinId, type: 'sortie', date: x.date || today(), qte: 1, motif: 'consomme', prixVente: null, note: '' }); });
    }
  });
}
function ouvrirCible(id, pre = {}) {
  const w = id ? S.watchlist.find(x => x.id === id) : pre;
  openForm({
    title: id ? 'Modifier la cible' : 'Nouvelle cible',
    fields: [
      { name: 'producteur', label: 'Domaine / producteur', required: true, value: w.producteur, list: listes().prod },
      { name: 'cuvee', label: 'Cuvée', value: w.cuvee, placeholder: 'Vide pour suivre tout le producteur' },
      { name: 'millesime', label: 'Millésime', type: 'number', half: true, value: w.millesime, placeholder: 'Vide = tous' },
      { name: 'priorite', label: 'Priorité', type: 'select', half: true, value: w.priorite || 'moyenne', options: Object.entries(PRIO) },
      { name: 'groupe', label: 'Groupe', value: w.groupe || UI.wlGroupe || '', list: groupes() },
      { name: 'prixCible', label: 'Prix cible (€)', type: 'number', half: true, value: w.prixCible },
      { name: 'prixMax', label: 'Prix maximum (€)', type: 'number', half: true, value: w.prixMax },
      { name: 'rarete', label: 'Rareté', type: 'select', half: true, value: w.rarete || '', options: Object.entries(NIV_F) },
      { name: 'revente', label: 'Potentiel de revente', type: 'select', half: true, value: w.revente || '', options: Object.entries(NIVEAUX) },
      { name: 'dispo', label: 'Disponibilité connue', value: w.dispo },
      { name: 'liens', label: 'Liens marchands', type: 'textarea', rows: 2, value: w.liens, placeholder: 'Un lien par ligne' },
      { name: 'notes', label: 'Notes de recherche', type: 'textarea', value: w.notes, placeholder: 'Rareté, réputation, production…' },
      { name: 'rappel', type: 'checkbox', label: 'Me rappeler de surveiller cette cible (priorité haute)', value: w.rappel !== false }],
    onSubmit: x => {
      if (!x.producteur.trim()) return 'Le domaine / producteur est obligatoire.';
      const pc = num(x.prixCible), pm = num(x.prixMax); if (pc != null && pm != null && pm < pc) return 'Le prix maximum doit être supérieur ou égal au prix cible.';
      const d = { producteur: x.producteur.trim(), cuvee: x.cuvee.trim(), millesime: int(x.millesime), priorite: x.priorite, groupe: x.groupe.trim(), prixCible: pc, prixMax: pm, rarete: x.rarete, revente: x.revente, dispo: x.dispo.trim(), liens: x.liens.trim(), notes: x.notes.trim(), rappel: !!x.rappel };
      let nid = id;
      commit(id ? `Cible modifiée : ${nomCible(d)}` : `Cible ajoutée : ${nomCible(d)}`, () => { if (id) Object.assign(S.watchlist.find(y => y.id === id), d); else { nid = uid(); S.watchlist.push({ id: nid, ...d, prixObs: pre.prixObs || [], cree: new Date().toISOString() }); } });
      if (!id) location.hash = '#/cible/' + nid;
    }
  });
}
function ouvrirPrixObs(id) {
  const w = S.watchlist.find(x => x.id === id); if (!w) return;
  openForm({
    title: 'Prix observé · ' + nomCible(w),
    fields: [{ name: 'prix', label: 'Prix par bouteille (€)', type: 'number', half: true, required: true }, { name: 'date', label: 'Date', type: 'date', half: true, value: today() }, { name: 'source', label: 'Source', placeholder: 'Marchand, enchère…' }],
    onSubmit: x => { const p = num(x.prix); if (p == null || p < 0) return 'Indiquez un prix valide.'; commit(`Prix observé : ${nomCible(w)} à ${eur(p)}`, () => { const y = S.watchlist.find(z => z.id === id); (y.prixObs = y.prixObs || []).push({ id: uid(), prix: p, date: x.date || today(), source: x.source.trim() }); }); }
  });
}

/* ---------- Import / export ---------- */
function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = v => { let s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (ent, lignes) => '﻿' + [ent, ...lignes].map(l => l.map(csvCell).join(';')).join('\r\n');
function exporterCSV(k) {
  let ent, L;
  if (k === 'inventaire') {
    ent = ['Producteur', 'Cuvée', 'Millésime', 'Couleur', 'Pays', 'Région', 'Appellation', 'Cépages', 'Format (cl)', 'Quantité en cave', 'Quantité commandée', 'Équivalent 75 cl', 'Statut', 'Emplacement', 'Coût de revient unitaire', 'Investi', 'Valeur de marché unitaire', 'Source cotation', 'Date cotation', 'Début', 'Apogée', 'Fin', 'Statut de garde', 'Notes'];
    L = S.vins.map(v => { const c = calc(v), vm = valeurMarche(v.id), g = etatGarde(v); return [v.producteur, v.cuvee, v.millesime || '', v.couleur, v.pays, v.region, v.appellation, v.cepages, v.format, c.stock, c.qCmd, Math.round(c.detenu * v.format / 75 * 100) / 100, STATUTS[statut(v, c)], v.emplacement, c.cu != null ? Math.round(c.cu * 100) / 100 : '', c.cu != null ? Math.round(c.cu * c.detenu * 100) / 100 : '', vm ? vm.valeur : '', vm ? vm.source : '', vm ? vm.date : '', v.debut || '', v.apogee || '', v.fin || '', g ? GARDE[g] : '', v.notes]; });
  } else if (k === 'mouvements') {
    ent = ['Date', 'Type', 'Producteur', 'Cuvée', 'Millésime', 'Format (cl)', 'Quantité', 'Prix unitaire', 'Frais', 'Vendeur', 'Statut ou motif', 'Prix de vente', 'Note'];
    L = S.mouvements.map(m => { const v = S.vins.find(x => x.id === m.vinId) || {}; return [m.date, m.type === 'achat' ? 'Achat' : 'Sortie', v.producteur, v.cuvee, v.millesime || '', v.format, m.qte, m.prix ?? '', m.frais || '', m.vendeur || '', m.type === 'achat' ? (m.statut === 'commande' ? 'Commandé' : 'En cave') : MOTIFS[m.motif], m.prixVente ?? '', m.note || '']; });
  } else if (k === 'cotations') {
    ent = ['Date', 'Producteur', 'Cuvée', 'Millésime', 'Nature', 'Prix', 'Source', 'Fiabilité'];
    L = S.cotations.map(c => { const v = S.vins.find(x => x.id === c.vinId) || {}; return [c.date, v.producteur, v.cuvee, v.millesime || '', TYPES_COTE[c.type], c.valeur, c.source, FIAB[c.fiabilite]]; });
  } else {
    ent = ['Producteur', 'Cuvée', 'Millésime', 'Priorité', 'Groupe', 'Prix cible', 'Prix maximum', 'Rareté', 'Potentiel de revente', 'Disponibilité', 'Liens', 'Notes', 'Dernier prix observé'];
    L = S.watchlist.map(w => { const o = (w.prixObs || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; return [w.producteur, w.cuvee, w.millesime || '', PRIO[w.priorite], w.groupe, w.prixCible ?? '', w.prixMax ?? '', NIV_F[w.rarete || ''], NIVEAUX[w.revente || ''], w.dispo, w.liens, w.notes, o ? o.prix : '']; });
  }
  telecharger(`ma-cave-${k}-${today()}.csv`, csv(ent, L), 'text/csv;charset=utf-8');
  toast('Export CSV créé.');
}
async function exporterJSON() {
  const photos = await photoAll();
  const util = new Set(S.vins.flatMap(v => v.photos || []));
  for (const k of Object.keys(photos)) if (!util.has(k)) delete photos[k];
  S.reglages.dernierExport = new Date().toISOString();
  await sauver();
  telecharger(`ma-cave-sauvegarde-${today()}.json`, JSON.stringify({ app: 'ma-cave', version: VERSION, exporteLe: new Date().toISOString(), etat: S, photos }), 'application/json');
  render(); toast('Sauvegarde exportée.');
}
async function restaurer(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch (e) { return toast("Ce fichier n'est pas une sauvegarde lisible."); }
  if (!d || d.app !== 'ma-cave' || !d.etat || !Array.isArray(d.etat.vins)) return toast("Ce fichier n'est pas une sauvegarde de Ma Cave.");
  confirmer('Restaurer cette sauvegarde ?', `Sauvegarde du ${fdate(d.exporteLe)} : ${d.etat.vins.length} vins, ${(d.etat.watchlist || []).length} cibles. Elle remplacera les données actuelles (opération annulable).`, 'Restaurer', async () => {
    for (const [k, v] of Object.entries(d.photos || {})) { await photoSet(k, v); cachePhotos.set(k, v); }
    commit('Sauvegarde restaurée', () => { const j = S.journal; S = hydrate(d.etat); S.journal = j; });
    location.hash = '#/tableau';
  }, false);
}
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const l1 = txt.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map(s => [s, l1.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function chargerScript(src) { return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Lecteur Excel indisponible')); document.head.appendChild(s); }); }
async function lireFichierImport(file) {
  let rows;
  try {
    if (/\.xlsx?$/i.test(file.name)) {
      await chargerScript('vendor/xlsx.full.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      rows = rows.filter(r => r.some(c => String(c).trim() !== ''));
    } else rows = parseCSV(await file.text());
  } catch (e) { return toast('Lecture impossible : ' + e.message); }
  if (!rows || rows.length < 2) return toast('Le fichier ne contient aucune ligne de données.');
  const entetes = rows[0].map((e, i) => String(e).trim() || 'Colonne ' + (i + 1));
  const lignes = rows.slice(1).map(r => Object.fromEntries(entetes.map((e, i) => [e, r[i] ?? ''])));
  const map = {}, pris = new Set();
  for (const exact of [true, false]) for (const [k, , syn] of CHAMPS_IMPORT) {
    if (map[k]) continue;
    for (const s of syn) {
      if (!exact && GENERIQUES.has(s)) continue; // un mot trop vague ne compte que s'il est l'intitulé exact
      const e = entetes.find(h => !pris.has(h) && (exact ? norm(h) === s : norm(h).split(' ').includes(s) || norm(h).includes(s + ' ') || norm(h).includes(' ' + s)));
      if (e) { map[k] = e; pris.add(e); break; }
    }
  }
  UI.imp = { nom: file.name, entetes, lignes, map, mode: 'ajouter' };
  render(); window.scrollTo(0, 0);
}
function parseFormat(v, contexte) {
  const s = norm(v);
  if (!s) return /magnum/.test(norm(contexte)) ? (/double/.test(norm(contexte)) ? 300 : 150) : 75;
  if (/double magnum|jeroboam/.test(s)) return 300;
  if (/magnum/.test(s)) return 150;
  if (/demi|half/.test(s)) return 37.5;
  if (/bouteille|standard|bottle/.test(s) && !/\d/.test(s)) return 75;
  const m = String(v).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)?/i);
  if (!m) return 75;
  const n = parseFloat(m[1]), u = (m[2] || '').toLowerCase();
  if (u === 'l') return n * 100; if (u === 'ml') return n / 10; if (u === 'cl') return n;
  return n <= 20 ? n * 100 : n >= 300 && n % 75 !== 0 ? n / 10 : n >= 375 ? n / 10 : n;
}
function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const s = String(v ?? '').trim(); if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})$/); if (m) return m[1] + '-01-01';
  return '';
}
function parseCouleur(v) { const s = norm(v); if (!s) return ''; if (/rouge|red|rosso|tinto/.test(s)) return 'Rouge'; if (/blanc|white|bianco|branco/.test(s)) return 'Blanc'; if (/rose/.test(s)) return 'Rosé'; if (/efferv|champagne|sparkling|mousseux|bulles|cremant/.test(s)) return 'Effervescent'; if (/liquoreux|moelleux|sweet|doux/.test(s)) return 'Liquoreux'; if (/mute|porto|port|madere|fortif/.test(s)) return 'Muté'; if (/orange/.test(s)) return 'Orange'; return 'Autre'; }
function lignesImport() {
  const I = UI.imp, g = (l, k) => I.map[k] ? l[I.map[k]] : '';
  const out = []; let ignorees = 0;
  for (const l of I.lignes) {
    const prod = String(g(l, 'producteur')).trim(); let cuvee = String(g(l, 'cuvee')).trim();
    if (!prod && !cuvee) { ignorees++; continue; }
    const q = I.map.quantite ? int(g(l, 'quantite')) : 1;
    if (!q || q < 1) { ignorees++; continue; }
    const mi = int(g(l, 'millesime'));
    if (mi && cuvee === String(mi)) cuvee = ''; // cuvée = simple répétition du millésime
    const ctl = String(g(l, 'controle')).trim(), nt = String(g(l, 'notes')).trim();
    out.push({
      idn: { producteur: prod || cuvee, cuvee: prod ? cuvee : '', millesime: mi && mi > 1700 && mi < 2200 ? mi : null, couleur: parseCouleur(g(l, 'couleur')), format: parseFormat(g(l, 'format'), cuvee + ' ' + prod), pays: String(g(l, 'pays')).trim(), region: String(g(l, 'region')).trim(), appellation: String(g(l, 'appellation')).trim(), cepages: String(g(l, 'cepages')).trim() },
      q, emplacement: String(g(l, 'emplacement')).trim(), date: parseDate(g(l, 'dateAchat')), vendeur: String(g(l, 'vendeur')).trim(), prix: num(g(l, 'prix')), frais: num(g(l, 'frais')) || 0,
      statut: /command|order/.test(norm(g(l, 'statut'))) ? 'commande' : 'en_cave', debut: int(g(l, 'debut')), apogee: int(g(l, 'apogee')), fin: int(g(l, 'fin')), notes: ctl ? 'À vérifier' + (nt ? ' — ' + nt : '') : nt
    });
  }
  return { out, ignorees };
}
function apercuImport() {
  const { out, ignorees } = lignesImport();
  const exist = new Map(S.vins.map(v => [cleVin(v), v])), vus = new Set();
  const p = { valides: 0, ignorees, contenants: 0, magnums: 0, eq: 0, nouveaux: 0, groupes: 0, doublons: 0, exDoublons: [], exemples: [] };
  for (const r of out) {
    const k = cleVin(r.idn), d = exist.has(k);
    if (d) { p.doublons++; if (p.exDoublons.length < 5) p.exDoublons.push(nomVin(r.idn)); if (UI.imp.mode === 'ignorer') { p.ignorees++; continue; } }
    else if (vus.has(k)) p.groupes++; else { vus.add(k); p.nouveaux++; }
    p.valides++; p.contenants += r.q; if (r.idn.format === 150) p.magnums += r.q; p.eq += r.q * r.idn.format / 75;
    if (p.exemples.length < 3) p.exemples.push(`${nomVin(r.idn)} · ${r.q} × ${fmtFormat(r.idn.format)}${r.prix != null ? ' · ' + eur(r.prix) : ''}`);
  }
  return p;
}
function executerImport() {
  const { out } = lignesImport(), mode = UI.imp.mode, nom = UI.imp.nom;
  let n = 0, bt = 0;
  commit(`Import de ${nom}`, () => {
    const exist = new Map(S.vins.map(v => [cleVin(v), v])), dejaEnCave = new Set(exist.keys());
    for (const r of out) {
      const k = cleVin(r.idn);
      if (dejaEnCave.has(k) && mode === 'ignorer') continue;
      let v = exist.get(k);
      if (!v) { v = { id: uid(), ...r.idn, emplacement: r.emplacement, notes: r.notes, debut: r.debut, apogee: r.apogee, fin: r.fin, reserve: false, photos: [], cree: new Date().toISOString() }; S.vins.push(v); exist.set(k, v); }
      S.mouvements.push({ id: uid(), vinId: v.id, type: 'achat', date: r.date || today(), qte: r.q, prix: r.prix, frais: r.frais, vendeur: r.vendeur, statut: r.statut });
      n++; bt += r.q;
    }
  });
  UI.imp = null; toast(`Import terminé : ${n} ligne${n > 1 ? 's' : ''}, ${bt} bouteille${bt > 1 ? 's' : ''}.`, true);
  location.hash = '#/cave';
}

/* ---------- Actions ---------- */
const A = {
  'close-sheet': closeSheet,
  retour: () => { if (history.length > 1) history.back(); else location.hash = '#/tableau'; },
  annuler: () => annuler(),
  ajouter: ouvrirAjout,
  'nouveau-vin': () => { const q = $('#aj-q'); ouvrirNouveauVin(q && q.value.trim() ? { producteur: q.value.trim() } : {}); },
  achat: d => ouvrirAchat(d.id),
  'edit-achat': d => { const m = S.mouvements.find(x => x.id === d.m); if (m) ouvrirAchat(m.vinId, m.id); },
  recu: d => { const m = S.mouvements.find(x => x.id === d.m); if (!m) return; const v = S.vins.find(x => x.id === m.vinId); commit(`Commande reçue : ${nomVin(v)}`, () => { S.mouvements.find(x => x.id === d.m).statut = 'en_cave'; }); },
  sortie: d => ouvrirSortie(d.id),
  cote: d => ouvrirCote(d.id),
  degu: d => ouvrirDegu(d.id),
  'edit-vin': d => ouvrirEditVin(d.id),
  'edit-garde': d => ouvrirGarde(d.id),
  reserve: d => { const v = S.vins.find(x => x.id === d.id); commit(v.reserve ? `Réservation levée : ${nomVin(v)}` : `Vin réservé : ${nomVin(v)}`, () => { const y = S.vins.find(x => x.id === d.id); y.reserve = !y.reserve; }); },
  'suppr-mvt': d => { const m = S.mouvements.find(x => x.id === d.m); const v = S.vins.find(x => x.id === m.vinId); commit(`Sortie supprimée : ${nomVin(v)} (stock rétabli)`, () => { S.mouvements = S.mouvements.filter(x => x.id !== d.m); }); },
  'suppr-cote': d => commit('Cotation supprimée', () => { S.cotations = S.cotations.filter(x => x.id !== d.c); }),
  'suppr-degu': d => commit('Dégustation supprimée', () => { S.degustations = S.degustations.filter(x => x.id !== d.d); }),
  'suppr-vin': d => { const v = S.vins.find(x => x.id === d.id); confirmer('Supprimer ce vin ?', `${nomVin(v)} sera retiré avec ses achats, sorties, cotations et dégustations. Pour une bouteille bue, offerte ou vendue, utilisez plutôt « Retirer une bouteille », qui conserve l'historique.`, 'Supprimer', () => { commit(`Vin supprimé : ${nomVin(v)}`, () => { S.vins = S.vins.filter(x => x.id !== d.id); S.mouvements = S.mouvements.filter(x => x.vinId !== d.id); S.cotations = S.cotations.filter(x => x.vinId !== d.id); S.degustations = S.degustations.filter(x => x.vinId !== d.id); }); location.hash = '#/cave'; }); },
  'voir-photo': d => { openSheet(`${tete('Photo')}<div class="sheet-body"><img class="bigimg" data-photo="${d.p}" alt="Photo de la bouteille"></div><div class="sheet-foot"><button class="btn danger" id="del-photo">Supprimer la photo</button><button class="btn" data-act="close-sheet">Fermer</button></div>`); chargerPhotos(); $('#del-photo').addEventListener('click', () => { closeSheet(); commit('Photo supprimée', () => { const v = S.vins.find(x => x.id === d.id); v.photos = (v.photos || []).filter(p => p !== d.p); }); }); },
  'cmp-avec': d => { UI.cmp.a = d.id; location.hash = '#/comparer'; },
  'toggle-filtres': () => { UI.showF = !UI.showF; render(); },
  'reset-filtres': () => { UI.f = { statut: 'actifs', pays: '', region: '', prod: '', couleur: '', garde: '', mill: '', annee: '' }; UI.q = ''; UI.tri = 'prod'; render(); },
  repart: d => { UI.repart = d.k; render(); },
  'garde-tab': d => { UI.gardeTab = d.k; render(); },
  'wl-groupe': d => { UI.wlGroupe = d.k; render(); },
  'cible-new': () => ouvrirCible(null),
  'cible-edit': d => ouvrirCible(d.id),
  'cible-suppr': d => { const w = S.watchlist.find(x => x.id === d.id); confirmer('Supprimer cette cible ?', nomCible(w) + ' sera retirée de la watchlist.', 'Supprimer', () => { commit(`Cible supprimée : ${nomCible(w)}`, () => { S.watchlist = S.watchlist.filter(x => x.id !== d.id); }); location.hash = '#/watchlist'; }); },
  'cible-achat': d => { const w = S.watchlist.find(x => x.id === d.id); if (!w) return; const der = (w.prixObs || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]; ouvrirNouveauVin({ producteur: w.producteur, cuvee: w.cuvee, millesime: w.millesime, prix: der ? der.prix : '', vendeur: der ? der.source : '' }, { cibleId: w.id, retirerDefaut: !!(w.cuvee && w.millesime) }); },
  'cible-offre': d => { const w = S.watchlist.find(x => x.id === d.id); UI.offre = { producteur: w.producteur, cuvee: w.cuvee, millesime: w.millesime || '', qte: 1, rarete: w.rarete || '', revente: w.revente || '' }; UI.verdict = null; location.hash = '#/offre'; },
  'prix-obs': d => ouvrirPrixObs(d.id),
  'suppr-obs': d => commit('Prix observé supprimé', () => { const w = S.watchlist.find(x => x.id === d.id); w.prixObs = (w.prixObs || []).filter(o => o.id !== d.o); }),
  'offre-cave': () => { const o = UI.offre; if (!o) return; const w = trouverCible(o); ouvrirNouveauVin({ producteur: o.producteur, cuvee: o.cuvee, millesime: o.millesime, qte: o.qte, prix: o.prix, frais: o.frais, vendeur: o.vendeur }, w ? { cibleId: w.id } : {}); },
  'offre-obs': () => { const o = UI.offre; if (!o) return; const w = trouverCible(o); const obs = { id: uid(), prix: o.prix, date: today(), source: o.vendeur || '' }; if (w) commit(`Prix observé : ${nomCible(w)} à ${eur(o.prix)}`, () => { const y = S.watchlist.find(z => z.id === w.id); (y.prixObs = y.prixObs || []).push(obs); }); else ouvrirCible(null, { producteur: o.producteur, cuvee: o.cuvee, millesime: o.millesime, rarete: o.rarete, revente: o.revente, prixObs: [obs] }); },
  'export-json': () => exporterJSON().catch(e => toast('Export impossible : ' + e.message)),
  'export-csv': d => exporterCSV(d.k),
  'modele-csv': () => telecharger('ma-cave-modele.csv', csv(['Producteur', 'Cuvée', 'Millésime', 'Pays', 'Région', 'Appellation', 'Couleur', 'Cépages', 'Format', 'Quantité', 'Emplacement', "Date d'achat", 'Vendeur', 'Prix unitaire', 'Frais de livraison', 'Statut', 'Début', 'Apogée', 'Fin de garde', 'Notes'], []), 'text/csv;charset=utf-8'),
  'imp-annuler': () => { UI.imp = null; render(); },
  'imp-go': executerImport,
  'tout-effacer': () => confirmer('Tout effacer ?', "Toutes les données de l'application seront effacées. Exportez d'abord une sauvegarde si vous voulez les conserver. L'opération reste annulable depuis l'historique tant que l'application n'est pas réinstallée.", 'Tout effacer', () => { commit('Toutes les données effacées', () => { const r = S.reglages; S = VIDE(); S.reglages = r; }); location.hash = '#/tableau'; })
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const f = A[el.dataset.act]; if (!f) return;
  if (el.tagName !== 'A' || el.dataset.act === 'cmp-avec') e.preventDefault();
  f(el.dataset, el);
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'offre-form') {
    const fd = new FormData(e.target), o = Object.fromEntries(fd.entries());
    const d = { producteur: o.producteur.trim(), cuvee: o.cuvee.trim(), millesime: int(o.millesime) || '', qte: int(o.qte) || 1, prix: num(o.prix), frais: num(o.frais) || 0, vendeur: o.vendeur.trim(), rarete: o.rarete, revente: o.revente };
    UI.offre = d;
    if (!d.producteur || d.prix == null) { UI.verdict = null; render(); return toast('Indiquez au moins le producteur et le prix.'); }
    UI.verdict = analyser(d); render();
    const v = $('.verdict'); if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (e.target.id !== 'form' || !formCtx) return;
  const ctx = formCtx, x = {};
  for (const f of ctx.cfg.fields) {
    if (!f.name || f.type === 'photos') continue;
    const el = e.target.elements[f.name]; if (!el) continue;
    x[f.name] = f.type === 'checkbox' ? el.checked : el.value;
  }
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const err = await ctx.cfg.onSubmit(x, ctx.photos);
    if (typeof err === 'string') { toast(err); btn.disabled = false; return; }
    if (formCtx === ctx) closeSheet();
  } catch (er) { console.error(er); toast('Erreur : ' + er.message); btn.disabled = false; }
});
document.addEventListener('input', e => { if (e.target.id === 'q') { UI.q = e.target.value; $('#cave-liste').innerHTML = corpsCave(); chargerPhotos(); } });
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.matches('[data-photo-in]') && formCtx) {
    for (const f of el.files) { try { formCtx.photos.push(await lireImage(f)); } catch (er) { toast(er.message); } }
    el.value = ''; const p = $('#photo-prev'); if (p) p.innerHTML = formCtx.photos.map(d => `<img src="${d}" alt="">`).join('');
    return;
  }
  const k = el.dataset.chg; if (!k) return;
  if (k === 'filtre') { UI.f[el.dataset.k] = el.value; render(); }
  else if (k === 'tri') { UI.tri = el.value; render(); }
  else if (k === 'cmp') { UI.cmp[el.dataset.k] = el.value; render(); }
  else if (k === 'imp-map') { UI.imp.map[el.dataset.k] = el.value; render(); }
  else if (k === 'imp-mode') { UI.imp.mode = el.value; render(); }
  else if (k === 'imp-fichier') { const f = el.files[0]; el.value = ''; if (f) lireFichierImport(f); }
  else if (k === 'restaurer') { const f = el.files[0]; el.value = ''; if (f) restaurer(f); }
  else if (k === 'photo-vin') {
    const datas = []; for (const f of el.files) { try { datas.push(await lireImage(f)); } catch (er) { toast(er.message); } }
    el.value = ''; if (!datas.length) return;
    const ids = await stockerPhotos(datas);
    commit(`Photo ajoutée`, () => { const v = S.vins.find(x => x.id === el.dataset.id); v.photos = (v.photos || []).concat(ids); });
  }
  else if (k === 'reglage') {
    const r = S.reglages, c = el.dataset.k;
    if (c === 'theme') r.theme = el.value;
    else if (c === 'capacite') r.capacite = Math.max(0, int(el.value) || 0);
    else if (c === 'groupes') r.groupes = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else if (c === 'notifications') { r.notifications = el.checked; if (el.checked && 'Notification' in window) { const p = await Notification.requestPermission(); if (p !== 'granted') { r.notifications = false; toast('Notifications refusées par le téléphone.'); } } }
    await sauver().catch(erreurSauvegarde); modifie(); appliquerTheme(); render(); infoStockage();
  }
});

/* ---------- Thème, stockage, démarrage ---------- */
function appliquerTheme() {
  const t = S.reglages.theme, sombre = t === 'sombre' || (t !== 'clair' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair';
  const m = $('meta[name=theme-color]'); if (m) m.content = sombre ? '#141012' : '#f6f1ea';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', appliquerTheme);
async function infoStockage() {
  const a = $('#st-persist'), b = $('#st-usage'); if (!a) return;
  try {
    const p = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    a.textContent = p ? 'Persistant (protégé)' : 'Standard';
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); b.textContent = (e.usage / 1048576).toFixed(1) + ' Mo'; } else b.textContent = '—';
  } catch (e) { a.textContent = '—'; b.textContent = '—'; }
}
async function nettoyerPhotos() {
  try {
    const ref = new Set(S.vins.flatMap(v => v.photos || []));
    const txt = annulations.map(u => u.etat).join(' ');
    const tout = await photoAll();
    for (const id of Object.keys(tout)) if (!ref.has(id) && !txt.includes(id)) await photoDel(id);
  } catch (e) { /* nettoyage facultatif */ }
}
async function notifier() {
  if (!S.reglages.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  const L = alertes().filter(a => a.niv >= 2); if (!L.length) return;
  const jour = today(); if (await kvGet('notifJour') === jour) return; await kvSet('notifJour', jour);
  try { const reg = await navigator.serviceWorker.ready; reg.showNotification('Ma Cave', { body: L.length === 1 ? L[0].texte : `${L.length} vins à surveiller, dont ${L[0].texte}`, icon: 'icons/icon-192.png', tag: 'garde' }); } catch (e) { /* notification facultative */ }
}
async function demarrer() {
  try {
    db = await openDB();
    S = hydrate(await kvGet('etat'));
    annulations = (await kvGet('annulations')) || [];
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty card"><h3>Stockage indisponible</h3><p>Le navigateur refuse l'enregistrement local (navigation privée ?). L'application ne peut pas conserver vos données dans ce mode.</p></div>`;
    return;
  }
  appliquerTheme();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if (S.vins.length) { instantane(); sauver().catch(erreurSauvegarde); }
  render();
  new MutationObserver(() => { if (route().name === 'reglages') infoStockage(); }).observe($('#view'), { childList: true });
  if (route().name === 'reglages') infoStockage();
  nettoyerPhotos(); notifier();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker non installé', e));
}
const pret = demarrer();
