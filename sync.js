'use strict';
/* =====================================================================
   Ma Cave — synchronisation et sauvegarde en ligne (Supabase)
   L'application reste « locale d'abord » : tout fonctionne sans réseau,
   la copie en ligne est mise à jour en arrière-plan dès que possible.
   Tables attendues : voir supabase.sql (cave_etat, cave_photos, cave_versions).
   ===================================================================== */
const Sync = (() => {
  const DEFAUT = () => ({ url: '', cle: '', email: '', uid: '', access: '', refresh: '', exp: 0, rev: 0, sale: false, dernier: null, erreur: '', appareil: '', photos: [] });
  let cfg = DEFAUT(), enCours = false, timer = null, conflit = null, versions = null, dernierEssai = 0;

  class ErrSync extends Error { constructor(type, msg, statut) { super(msg); this.type = type; this.statut = statut; } }
  const actif = () => !!(cfg.url && cfg.cle && cfg.refresh);
  const garder = () => kvSet('sync', cfg).catch(() => { });
  const localVide = () => !S.vins.length && !S.watchlist.length;
  const maj = () => { if (route().name === 'sync' && $('#sheet').hidden) render(); };

  async function brut(methode, chemin, corps, entetes, avecJeton) {
    const h = Object.assign({ apikey: cfg.cle, 'Content-Type': 'application/json' }, entetes || {});
    if (avecJeton) h.Authorization = 'Bearer ' + cfg.access;
    let r;
    try { r = await fetch(cfg.url + chemin, { method: methode, headers: h, body: corps === undefined ? undefined : JSON.stringify(corps) }); }
    catch (e) { throw new ErrSync('reseau', 'Service en ligne injoignable. Vérifiez la connexion ; si le projet Supabase est en pause, réactivez-le depuis son tableau de bord.'); }
    const txt = await r.text(); let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* réponse non JSON */ }
    if (!r.ok) {
      const msg = (j && (j.msg || j.message || j.error_description || j.error)) || ('Erreur ' + r.status);
      throw new ErrSync(r.status === 401 ? 'auth' : r.status === 409 ? 'conflit' : 'serveur', String(msg), r.status);
    }
    return j;
  }
  async function rafraichir() {
    let j;
    try { j = await brut('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: cfg.refresh }); }
    catch (e) {
      if (e.type === 'reseau') throw e;
      if (e.statut === 400 || e.statut === 401 || e.statut === 403) { cfg.refresh = ''; cfg.access = ''; await garder(); throw new ErrSync('session', 'Session expirée : reconnectez-vous.'); }
      throw e;
    }
    session(j); await garder();
  }
  function session(j) {
    cfg.access = j.access_token; cfg.refresh = j.refresh_token;
    cfg.exp = Date.now() + (j.expires_in || 3600) * 1000;
    if (j.user && j.user.id) cfg.uid = j.user.id;
  }
  async function appel(methode, chemin, corps, entetes) {
    if (Date.now() > cfg.exp - 60000) await rafraichir();
    try { return await brut(methode, chemin, corps, entetes, true); }
    catch (e) { if (e.type !== 'auth') throw e; await rafraichir(); return brut(methode, chemin, corps, entetes, true); }
  }

  /* ----- photos ----- */
  const photosRef = () => [...new Set(S.vins.flatMap(v => v.photos || []))];
  async function envoyerPhotos() {
    const aFaire = photosRef().filter(id => !cfg.photos.includes(id));
    if (!aFaire.length) return;
    const dist = new Set(((await appel('GET', '/rest/v1/cave_photos?select=id')) || []).map(x => x.id));
    for (const id of aFaire) {
      if (!dist.has(id)) {
        const data = await photoGet(id);
        if (!data) continue;
        await appel('POST', '/rest/v1/cave_photos?on_conflict=user_id,id', { id, data }, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      }
      cfg.photos.push(id);
    }
    await garder();
  }
  async function recevoirPhotos() {
    const manq = [];
    for (const id of photosRef()) if (!(await photoGet(id))) manq.push(id);
    for (let i = 0; i < manq.length; i += 4) {
      const lot = manq.slice(i, i + 4);
      const rows = await appel('GET', `/rest/v1/cave_photos?select=id,data&id=in.(${lot.map(encodeURIComponent).join(',')})`);
      for (const r of rows || []) { await photoSet(r.id, r.data); cachePhotos.set(r.id, r.data); if (!cfg.photos.includes(r.id)) cfg.photos.push(r.id); }
    }
    if (manq.length) { await garder(); chargerPhotos(); }
  }

  /* ----- état ----- */
  async function pousser(revConnue, forcer) {
    const etat = JSON.parse(JSON.stringify(S));
    cfg.sale = false; // toute modification faite pendant l'envoi remettra le drapeau
    try {
      if (revConnue == null) {
        await appel('POST', '/rest/v1/cave_etat', { etat, rev: 1, appareil: cfg.appareil }, { Prefer: 'return=minimal' });
        cfg.rev = 1;
      } else {
        const nouv = revConnue + 1;
        const filtre = `user_id=eq.${cfg.uid}` + (forcer ? '' : `&rev=eq.${revConnue}`);
        const rows = await appel('PATCH', '/rest/v1/cave_etat?' + filtre, { etat, rev: nouv, maj: new Date().toISOString(), appareil: cfg.appareil }, { Prefer: 'return=representation' });
        if (!rows || !rows.length) throw new ErrSync('conflit', 'La version en ligne a changé entre-temps.');
        cfg.rev = nouv;
      }
    } catch (e) { cfg.sale = true; throw e; }
    cfg.dernier = new Date().toISOString(); cfg.erreur = '';
    await garder();
    await envoyerPhotos();
  }
  async function tirer(label) {
    const rows = await appel('GET', '/rest/v1/cave_etat?select=etat,rev,maj');
    const row = rows && rows[0]; if (!row) throw new ErrSync('serveur', 'Aucune donnée en ligne.');
    annulations.push({ label: label || 'Synchronisation : version en ligne reçue', date: new Date().toISOString(), etat: JSON.stringify(S) });
    if (annulations.length > 20) annulations.shift();
    S = hydrate(row.etat); invalider();
    cfg.rev = row.rev; cfg.sale = false; cfg.dernier = new Date().toISOString(); cfg.erreur = '';
    await sauver(); await garder();
    appliquerTheme(); render();
    await recevoirPhotos();
  }
  async function synchroniser(manuel) {
    if (!actif()) return;
    if (enCours) return;
    if (!navigator.onLine) { if (manuel) toast('Hors ligne : la synchronisation reprendra au retour du réseau.'); return; }
    enCours = true; dernierEssai = Date.now(); maj();
    try {
      for (let tour = 0; tour < 2; tour++) {
        const meta = await appel('GET', '/rest/v1/cave_etat?select=rev,maj,appareil');
        const srv = meta && meta[0];
        conflit = null;
        try {
          if (!srv) { if (!localVide()) await pousser(null); else { cfg.rev = 0; cfg.sale = false; } }
          else if (localVide() && cfg.sale && cfg.rev > 0) conflit = { srv, type: 'vide' };
          else if (localVide()) await tirer();
          else if (srv.rev === cfg.rev) { if (cfg.sale) await pousser(srv.rev); else await envoyerPhotos(); }
          else if (!cfg.sale && cfg.rev > 0) await tirer();
          else conflit = { srv, type: cfg.rev === 0 ? 'premier' : 'double' };
          break;
        } catch (e) { if (e.type === 'conflit' && tour === 0) continue; throw e; }
      }
      if (!conflit) { cfg.dernier = new Date().toISOString(); cfg.erreur = ''; if (manuel) toast('Synchronisation terminée.'); }
      else { cfg.erreur = ''; toast('Synchronisation : un choix est nécessaire (voir Plus › Synchronisation).'); }
    } catch (e) {
      console.warn('Synchronisation', e);
      cfg.erreur = e.message || String(e);
      if (manuel || e.type === 'session') toast('Synchronisation : ' + cfg.erreur);
    } finally { enCours = false; await garder(); maj(); if (cfg.sale && !conflit && !cfg.erreur) planifier(); }
  }
  function planifier(delai = 4000) { clearTimeout(timer); timer = setTimeout(() => synchroniser(false), delai); }
  function marquer() { if (!actif()) return; cfg.sale = true; garder(); planifier(); }

  async function connecter(x) {
    let url = x.url.trim().replace(/\/+$/, ''); if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    const cle = x.cle.trim(), email = x.email.trim();
    if (!url || !cle || !email || !x.mdp) return 'Remplissez les quatre champs.';
    const avant = cfg;
    cfg = Object.assign(DEFAUT(), { url, cle, email, appareil: avant.appareil || nomAppareil() });
    try {
      const j = await brut('POST', '/auth/v1/token?grant_type=password', { email, password: x.mdp });
      session(j);
    } catch (e) {
      cfg = avant;
      return e.type === 'reseau' ? "Adresse du projet injoignable. Vérifiez l'URL et la connexion." : 'Connexion refusée : ' + e.message;
    }
    if (avant.uid === cfg.uid && avant.url === url) { cfg.rev = avant.rev; cfg.photos = avant.photos; cfg.sale = avant.sale; }
    else cfg.sale = !localVide();
    await garder();
    synchroniser(true);
  }
  const nomAppareil = () => (/Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS' : 'Ordinateur') + '-' + Math.random().toString(36).slice(2, 6);
  async function deconnecter() {
    try { if (cfg.access) await brut('POST', '/auth/v1/logout', undefined, null, true); } catch (e) { /* sans importance */ }
    cfg = Object.assign(DEFAUT(), { url: cfg.url, cle: cfg.cle, email: cfg.email, appareil: cfg.appareil });
    conflit = null; versions = null; await garder(); render();
  }
  async function resoudre(choix) {
    if (!conflit) return;
    const srv = conflit.srv; enCours = true; maj();
    try {
      if (choix === 'local') await pousser(srv.rev, true); else await tirer('Synchronisation : version en ligne reprise');
      conflit = null; toast(choix === 'local' ? 'Cet appareil fait maintenant référence.' : 'Version en ligne reprise.', choix !== 'local');
    } catch (e) { cfg.erreur = e.message; toast('Synchronisation : ' + e.message); }
    finally { enCours = false; await garder(); maj(); }
  }
  async function chargerVersions() {
    try { versions = await appel('GET', '/rest/v1/cave_versions?select=jour,rev&order=jour.desc') || []; }
    catch (e) { versions = null; toast('Versions indisponibles : ' + e.message); }
    maj();
  }
  async function restaurerVersion(jour) {
    try {
      const rows = await appel('GET', `/rest/v1/cave_versions?select=etat,jour&jour=eq.${encodeURIComponent(jour)}`);
      if (!rows || !rows[0]) return toast('Version introuvable.');
      commit(`Version en ligne du ${fdate(jour)} restaurée`, () => { const j = S.journal; S = hydrate(rows[0].etat); S.journal = j; });
      await recevoirPhotos();
    } catch (e) { toast('Restauration impossible : ' + e.message); }
  }

  /* ----- interface ----- */
  const quand = d => d ? new Date(d).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';
  function etat() {
    if (!actif()) return { actif: false, texte: cfg.url && cfg.erreur ? cfg.erreur : 'Non configurée', probleme: !!(cfg.url && cfg.email && !cfg.refresh) };
    if (enCours) return { actif: true, texte: 'Synchronisation en cours…' };
    if (conflit) return { actif: true, texte: 'Choix nécessaire', probleme: true };
    if (cfg.erreur) return { actif: true, texte: 'Erreur : ' + cfg.erreur, probleme: true };
    return { actif: true, texte: cfg.sale ? 'Modifications en attente d\'envoi' : 'À jour', dernier: cfg.dernier };
  }
  function vue() {
    const e = etat();
    if (!actif()) return `<div class="card"><h3 style="margin-bottom:6px">Sauvegarde automatique en ligne</h3><p class="small">Vos données sont copiées dans votre propre espace Supabase, dès qu'une connexion est disponible. L'application continue de fonctionner sans réseau.</p><p class="small muted">La mise en place se fait une seule fois sur un ordinateur (une dizaine de minutes) : voir la section « Synchronisation » de LISEZMOI.md.</p>${cfg.erreur ? `<div class="notice">${esc(cfg.erreur)}</div>` : ''}<button class="btn primary block" data-act="sync-connexion">Se connecter</button></div>`;
    let h = `<div class="card"><dl class="facts"><dt>État</dt><dd>${esc(e.texte)}</dd><dt>Dernière synchronisation</dt><dd>${quand(cfg.dernier)}</dd><dt>Compte</dt><dd>${esc(cfg.email)}</dd><dt>Dernière version synchronisée</dt><dd>n° ${cfg.rev || '—'}</dd><dt>Cet appareil</dt><dd>${esc(cfg.appareil)}</dd></dl><button class="btn primary block" style="margin-top:12px" data-act="sync-maintenant"${enCours ? ' disabled' : ''}>Synchroniser maintenant</button></div>`;
    if (conflit) {
      const s = conflit.srv;
      const msg = conflit.type === 'vide' ? "Cet appareil n'a plus aucune donnée, alors qu'une version existe en ligne. Rien n'a été envoyé." : conflit.type === 'premier' ? 'Cet appareil contient déjà des données, et une version existe aussi en ligne.' : 'Des modifications ont été faites sur cet appareil et sur un autre depuis la dernière synchronisation.';
      h += `<div class="verdict surveiller"><h3>Quelle version garder ?</h3><p class="small">${msg}</p><p class="small muted">En ligne : version n° ${s.rev} du ${quand(s.maj)}${s.appareil ? ' (' + esc(s.appareil) + ')' : ''}. Ici : ${S.vins.length} vins, ${S.watchlist.length} cibles.</p><div class="row"><button class="btn" data-act="sync-resoudre" data-k="distant">Prendre la version en ligne</button><button class="btn" data-act="sync-resoudre" data-k="local">Garder cet appareil</button></div><p class="hint">« Prendre la version en ligne » reste annulable. Les versions en ligne des 30 derniers jours sont conservées.</p></div>`;
    }
    h += `<div class="sec"><h2>Versions enregistrées en ligne</h2>${versions ? '' : '<button class="link" data-act="sync-versions">Afficher</button>'}</div>`;
    if (versions) h += `<div class="card">${versions.length ? versions.map(v => `<div class="item"><div class="t">${fdate(v.jour)}<div class="d">version n° ${v.rev}</div></div><div class="r"><button class="mini" data-act="sync-restaurer" data-j="${esc(v.jour)}">Restaurer</button></div></div>`).join('') : '<p class="muted small">Aucune version pour le moment.</p>'}<p class="hint">Une version par jour, conservée 30 jours. Une restauration est annulable.</p></div>`;
    h += `<div class="notice">Offre gratuite Supabase : le projet se met en pause après 7 jours sans activité. Ouvrir l'application au moins une fois par semaine suffit à l'éviter ; sinon, réactivez le projet depuis son tableau de bord. Vos données locales ne sont jamais touchées par une pause.</div><button class="btn block" data-act="sync-deconnexion">Se déconnecter</button>`;
    return h;
  }
  function formulaire() {
    openForm({
      title: 'Connexion à la sauvegarde en ligne', submitLabel: 'Se connecter',
      fields: [
        { name: 'url', label: 'URL du projet', value: cfg.url, placeholder: 'https://xxxx.supabase.co', required: true },
        { name: 'cle', label: 'Clé publique (publishable)', value: cfg.cle, placeholder: 'sb_publishable_…', required: true, hint: 'Jamais la clé secrète.' },
        { name: 'email', label: 'Adresse e-mail du compte', type: 'email', value: cfg.email, required: true },
        { name: 'mdp', label: 'Mot de passe', type: 'password', required: true, hint: "Il n'est pas conservé sur l'appareil." }],
      onSubmit: x => connecter(x)
    });
  }

  async function init() {
    if (!db) return;
    cfg = Object.assign(DEFAUT(), (await kvGet('sync')) || {});
    VUES.sync = vue; TITRES.sync = 'Synchronisation';
    Object.assign(A, {
      'sync-connexion': formulaire,
      'sync-maintenant': () => synchroniser(true),
      'sync-deconnexion': () => confirmer('Se déconnecter ?', 'La synchronisation sera arrêtée. Les données restent sur cet appareil et en ligne.', 'Se déconnecter', deconnecter, false),
      'sync-resoudre': d => { if (d.k === 'local') confirmer('Garder cet appareil ?', 'La version en ligne sera remplacée par les données de cet appareil.', 'Remplacer la version en ligne', () => resoudre('local')); else resoudre('distant'); },
      'sync-versions': chargerVersions,
      'sync-restaurer': d => confirmer('Restaurer cette version ?', `Les données actuelles seront remplacées par la version du ${fdate(d.j)} (opération annulable).`, 'Restaurer', () => restaurerVersion(d.j), false)
    });
    if (route().name === 'sync' || location.hash.startsWith('#/sync')) render();
    window.addEventListener('online', () => synchroniser(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { if (Date.now() - dernierEssai > 120000) synchroniser(false); }
      else if (cfg.sale && actif()) { clearTimeout(timer); synchroniser(false); }
    });
    if (actif()) synchroniser(false);
  }
  return { init, marquer, etat, synchroniser, get cfg() { return cfg; } };
})();
pret.then(() => Sync.init()).catch(e => console.warn('Synchronisation non initialisée', e));
