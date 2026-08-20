/*
 * sources/google.js — Google Books. « Google découvre » (§4).
 * Un seul `fetch`, dans googleGet, et UN SEUL normaliseur, normaliserVolume :
 * aucun autre endroit du projet ne construit un ResultatRecherche (§7).
 * Pièges vérifiés sur appels réels le 2026-08-20, pas supposés : imageLinks
 * arrive en http:// et manque 3 fois sur 5 ; pageCount vaut 0 pour « inconnu » ;
 * publishedDate est tantôt 'YYYY' tantôt 'YYYY-MM-DD' ; industryIdentifiers
 * peut ne contenir qu'un OCLC, donc aucun ISBN.
 */

/** @typedef {import('../types.js').ResultatRecherche} ResultatRecherche */

const BASE = 'https://www.googleapis.com/books/v1';
const DELAI_MAX_MS = 12000;
const MAX_RESULTATS = 20;

/*
 * DEUX reessais, et UNIQUEMENT sur 503. §4.7 disait « aucun retry, aucun
 * backoff », herite de TMDB — mais TMDB ne rendait pas de 503.
 * Mesure : `200 503 200 503 200 503` sur six appels identiques, soit une
 * requete sur deux. Avec un seul reessai il restait 25 % d'echecs visibles,
 * et ils se sont produits en usage reel. Avec deux, environ 12 %.
 * Les delais croissent (800 ms puis 2 s) : insister vite sur une source qui
 * ploie ne sert a rien.
 * Le 429 (quota, §4.1) n'est JAMAIS reessaye : insister l'aggrave.
 */
const DELAIS_REESSAI_MS = [800, 2000];

async function googleGet(chemin, params = {}, essai = 0) {
  const cle = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  const url = new URL(`${BASE}${chemin}`);
  url.searchParams.set('printType', 'books');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (cle) url.searchParams.set('key', cle);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
  try {
    const reponse = await fetch(url.toString(), { signal: arret.signal });
    if (reponse.status === 503 && essai < DELAIS_REESSAI_MS.length) {
      clearTimeout(minuteur);
      await new Promise((r) => setTimeout(r, DELAIS_REESSAI_MS[essai]));
      return googleGet(chemin, params, essai + 1);
    }
    if (!reponse.ok) throw new Error(messageFrancais(reponse.status));
    return await reponse.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Google Books ne répond pas.');
    throw e;
  } finally {
    clearTimeout(minuteur);
  }
}

/*
 * Écart assumé avec le projet séries, qui affichait « Erreur TMDB (429) » brut
 * à l'utilisateur. Ici le message est traduit avant de quitter la source.
 */
function messageFrancais(code) {
  if (code === 429) return 'Trop de recherches pour aujourd\'hui. Réessaie plus tard.';
  if (code === 403) return 'La clé Google Books est refusée. Vérifie ses restrictions.';
  if (code === 503) return 'Google Books est momentanément indisponible.';
  return `Google Books a répondu ${code}.`;
}

/** Google rend les couvertures en http:// — un WebView en https les bloque. */
function forcerHttps(url) {
  return url ? url.replace(/^http:\/\//, 'https://') : null;
}

function extraireIsbn(identifiants, type) {
  if (!Array.isArray(identifiants)) return null;
  const trouve = identifiants.find((i) => i.type === type);
  return trouve ? trouve.identifier : null;
}

/**
 * LE normaliseur de cette source.
 * @returns {ResultatRecherche}
 */
function normaliserVolume(item) {
  const vi = item.volumeInfo || {};
  const date = vi.publishedDate || null;
  const images = vi.imageLinks || {};

  return {
    cleSource: `gb:${item.id}`,
    source: 'google',
    titre: vi.title || 'Sans titre',
    sousTitre: vi.subtitle || null,
    auteurs: Array.isArray(vi.authors) ? vi.authors : [],
    annee: date ? date.slice(0, 4) : null,
    datePublication: date,
    // zoom=1 est la vignette ; on garde celle-là, la grille est en 2:3.
    couvertureUrl: forcerHttps(images.thumbnail || images.smallThumbnail || null),
    resume: vi.description || null,
    categories: Array.isArray(vi.categories) ? vi.categories : [],
    langue: vi.language || null,
    isbn13: extraireIsbn(vi.industryIdentifiers, 'ISBN_13'),
    isbn10: extraireIsbn(vi.industryIdentifiers, 'ISBN_10'),
    // pageCount === 0 signifie « inconnu » chez Google, pas « zéro page ».
    nbPages: vi.pageCount ? vi.pageCount : null,
    editeur: vi.publisher || null,
  };
}

async function chercher(requete, options = {}) {
  const donnees = await googleGet('/volumes', {
    q: requete,
    maxResults: MAX_RESULTATS,
    ...options,
  });
  if (!Array.isArray(donnees.items)) return [];
  return donnees.items.map(normaliserVolume);
}

/** @returns {Promise<ResultatRecherche[]>} */
export function rechercherParTitre(texte) {
  return chercher(`intitle:${texte}`, { langRestrict: 'fr' });
}

/** @returns {Promise<ResultatRecherche[]>} */
export function rechercherParAuteur(texte) {
  return chercher(`inauthor:"${texte}"`, { langRestrict: 'fr' });
}

/** Découverte par sujet — sert aux suggestions (§4.6). */
export function rechercherParSujet(sujet) {
  return chercher(`subject:"${sujet}"`, { langRestrict: 'fr' });
}

/*
 * Recherche par ISBN : PAS de langRestrict. Un ISBN désigne une édition
 * précise, souvent en VO — filtrer sur le français la ferait disparaître (§4.3).
 * Ce chemin n'est qu'un repli : le chemin normal passe par Open Library.
 * @returns {Promise<ResultatRecherche[]>}
 */
export function rechercherParIsbn(isbn) {
  return chercher(`isbn:${isbn}`);
}
