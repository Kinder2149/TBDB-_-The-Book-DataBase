/*
 * CONTROLE DES SOURCES REELLES — a lancer a la main, quand on veut savoir si
 * Google Books et Open Library repondent encore aujourd'hui.
 *
 * Ce n'est PAS une verification automatique : les sources tombent d'elles-memes
 * (Google rend 503 sur 25 a 40 % des appels), donc un echec ici ne veut pas
 * dire que l'application est cassee. Il dit ou en sont les sources, maintenant.
 *
 *   npm run controle-sources
 *
 * Attention : chaque lancement consomme une douzaine de requetes sur le quota
 * quotidien de 1 000.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLE = (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
    const m = env.match(/VITE_GOOGLE_BOOKS_API_KEY=(.*)/);
    return m ? m[1].trim().replace(/["']/g, '') : '';
  } catch { return ''; }
})();

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const jaune = (t) => `\x1b[33m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

const lignes = [];
let alertes = 0;

function dire(etat, titre, detail) {
  const puce = etat === 'ok' ? vert('  OK   ') : etat === 'alerte' ? jaune('  !    ') : rouge(' ECHEC ');
  if (etat !== 'ok') alertes += 1;
  lignes.push(`${puce}${titre}${detail ? gris('  — ' + detail) : ''}`);
}

async function mesurer(url, options) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, options);
    return { statut: r.status, ms: Date.now() - t0, corps: await r.text() };
  } catch (e) {
    return { statut: 0, ms: Date.now() - t0, erreur: e.message };
  }
}

console.log('\nControle des sources reelles — ' + new Date().toLocaleString('fr-FR'));
console.log(gris('Chaque ligne dit si la source repond, pas si l application fonctionne.\n'));

// --- 1. La cle est-elle presente ? ------------------------------------------
if (!CLE) {
  dire('echec', 'Cle Google Books', 'absente de client/.env — les recherches seront rejetees');
} else {
  dire('ok', 'Cle Google Books', `presente (${CLE.length} caracteres)`);
}

// --- 2. Google Books repond-il, et a quel taux ? -----------------------------
const BASE_G = 'https://www.googleapis.com/books/v1/volumes';
const urlG = (q) => `${BASE_G}?printType=books&langRestrict=fr&maxResults=20&key=${CLE}&q=intitle:${encodeURIComponent(q)}`;

let reussites = 0; let total = 0; let cumul = 0; let quota = false;
for (const mot of ['dune', 'germinal', 'harry potter', 'les fourmis', '1984', 'le hobbit']) {
  const r = await mesurer(urlG(mot));
  total += 1; cumul += r.ms;
  if (r.statut === 200) reussites += 1;
  if (r.statut === 429) quota = true;
}
const taux = Math.round((reussites / total) * 100);
const moyenne = Math.round(cumul / total);

if (quota) {
  dire('echec', 'Quota Google', 'DEPASSE pour aujourd hui — plus aucune recherche ne fonctionnera');
} else if (taux >= 50) {
  dire('ok', 'Google Books repond', `${reussites}/${total} au premier essai, ${moyenne} ms de moyenne`);
} else {
  dire('alerte', 'Google Books est difficile', `${reussites}/${total} seulement — les reessais compensent, mais la source va mal`);
}

// --- 3. La cle est-elle bien restreinte ? -----------------------------------
const you = await mesurer(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=t&key=${CLE}`);
if (you.statut === 200) {
  dire('alerte', 'Restriction de la cle', 'la cle ouvre AUSSI YouTube — a restreindre a la seule Books API');
} else {
  dire('ok', 'Restriction de la cle', 'refusee hors Books API, comme il faut');
}

// --- 4. Open Library ---------------------------------------------------------
const ol = await mesurer('https://openlibrary.org/search.json?q=dune&limit=1&fields=key,title');
if (ol.statut === 200 && ol.ms < 8000) {
  dire('ok', 'Open Library repond', `${ol.ms} ms`);
} else if (ol.statut === 200) {
  dire('alerte', 'Open Library est lent', `${ol.ms} ms — l identification basculera en identite locale`);
} else {
  dire('alerte', 'Open Library ne repond pas', 'les livres entreront sous identite locale, sans blocage');
}

// --- 5. Les couvertures ------------------------------------------------------
const couv = await mesurer('https://covers.openlibrary.org/b/isbn/9782221252055-M.jpg?default=false');
if (couv.statut === 200 || couv.statut === 302) {
  dire('ok', 'Couvertures Open Library', `${couv.ms} ms`);
} else if (couv.statut === 404) {
  dire('ok', 'Couvertures Open Library', 'repond 404 sur une couverture absente, comme attendu');
} else {
  dire('alerte', 'Couvertures Open Library', `statut inattendu ${couv.statut}`);
}

// --- 6. Le filet BnF ---------------------------------------------------------
// Il ne consomme aucun quota et ne demande aucune cle : on peut l'interroger
// sans compter, contrairement a Google.
let bnfOk = 0;
for (const mot of ['dune', 'germinal', 'asterix']) {
  const requete = `bib.title all "${mot}" and bib.doctype any "a"`;
  const r = await mesurer(
    'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve'
    + `&recordSchema=dublincore&maximumRecords=5&query=${encodeURIComponent(requete)}`,
  );
  if (r.statut === 200) bnfOk += 1;
}
if (bnfOk === 3) {
  dire('ok', 'Filet BnF', 'repond — il prendra le relais si Google tombe');
} else if (bnfOk > 0) {
  dire('alerte', 'Filet BnF', `${bnfOk}/3 seulement`);
} else {
  dire('echec', 'Filet BnF', 'injoignable — plus aucun secours si Google tombe');
}

console.log(lignes.join('\n'));
console.log('');
if (alertes === 0) {
  console.log(vert('Les sources vont bien.') + gris('  (' + (total + 3) + ' requetes consommees sur le quota du jour)'));
} else {
  console.log(jaune(`${alertes} point(s) a regarder.`) + gris('  Un souci de source n est pas un defaut de l application.'));
}
console.log('');
process.exit(0);
