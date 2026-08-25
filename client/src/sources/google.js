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
/*
 * 8 s et non 12. §4.7 pose 12 s comme MAXIMUM, pas comme valeur a atteindre.
 * Mesure : un appel Google qui aboutit repond en moins de 1,1 s ; au-dela de
 * 8 s il n'aboutira pas. Ce plafond compte double ici, car il borne CHAQUE
 * essai : a 12 s, six essais laissaient l'utilisateur devant « Recherche en
 * cours… » pendant plus d'une minute avant le moindre message.
 */
const DELAI_MAX_MS = 8000;
const MAX_RESULTATS = 20;

/*
 * CINQ reessais sur 503, les deux premiers IMMEDIATS puis des pauses courtes.
 * Chiffre etabli par comparaison A/B sur 45 recherches reelles par strategie,
 * alternees pour neutraliser l'humeur de la source (2026-08-21) :
 *
 *   [800, 2000]  (precedent)     41/45   moyenne 1685 ms   pire 4416 ms
 *   [0, 0, 0]                    42/45   moyenne  811 ms   pire 2040 ms
 *   [0, 0, 250, 750, 1500]       43/45   moyenne  811 ms   pire 3418 ms
 *
 * Deux faits, mesures, qui expliquent cette forme :
 *  1. UN 503 REVIENT EN 170-650 ms, un 200 en 430-1000 ms. L'echec coute moins
 *     cher que le succes : les deux premiers reessais sont donc quasi gratuits,
 *     et c'est eux qui font tomber la moyenne de 1685 a 811 ms.
 *  2. Mais les 503 arrivent EN RAFALES, pas isolement. Une hypothese de travail
 *     — « attendre n'achete rien » — a ete testee et INVALIDEE : la strategie
 *     purement immediate laisse passer les rafales. D'ou les pauses tardives,
 *     qui ne se paient que dans ces cas rares et rattrapent l'essentiel.
 *
 * Le 429 (quota, §4.1) n'est JAMAIS reessaye : insister l'aggrave.
 */
const PAUSES_REESSAI_MS = [0, 0, 250, 750, 1500];

/*
 * COMPTEUR DE REQUETES DU JOUR (§4.1). Le quota Google Books est de 1 000
 * requetes par jour et par PROJET — pas par cle, pas par appareil : tous les
 * porteurs de la meme cle le partagent. Il etait jusqu'ici invisible, donc
 * impossible a menager : on ne decouvrait l'avoir epuise qu'en recevant un
 * 429, c'est-a-dire quand il etait trop tard pour toute la journee.
 *
 * On compte CHAQUE appel HTTP, reessais de 503 compris : c'est ainsi que
 * Google compte. Sur localStorage plutot qu'en base : cette valeur n'a aucune
 * valeur historique, elle est jetable et ne doit pas entrer dans la
 * sauvegarde du profil.
 */
const CLE_COMPTEUR = 'googleAppelsDuJour';

function jourCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function compter() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_COMPTEUR) || '{}');
    const jour = jourCourant();
    const n = (brut.jour === jour ? brut.n : 0) + 1;
    localStorage.setItem(CLE_COMPTEUR, JSON.stringify({ jour, n }));
  } catch { /* stockage indisponible : le compteur n'est pas une fonction vitale */ }
}

/** Requetes Google consommees aujourd'hui, sur un quota de 1 000 (§4.1). */
export function appelsDuJour() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_COMPTEUR) || '{}');
    return brut.jour === jourCourant() ? brut.n || 0 : 0;
  } catch {
    return 0;
  }
}

export const QUOTA_QUOTIDIEN = 1000;

async function googleGet(chemin, params = {}, essai = 0) {
  const cle = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  const url = new URL(`${BASE}${chemin}`);
  url.searchParams.set('printType', 'books');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (cle) url.searchParams.set('key', cle);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
  try {
    compter();
    const reponse = await fetch(url.toString(), { signal: arret.signal });
    if (reponse.status === 503 && essai < PAUSES_REESSAI_MS.length) {
      clearTimeout(minuteur);
      const pause = PAUSES_REESSAI_MS[essai];
      if (pause) await new Promise((r) => setTimeout(r, pause));
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

/*
 * `page` compte a partir de 0. Google pagine par `startIndex`, en nombre de
 * resultats et non de pages — d'ou la multiplication. Ajoute apres le retour
 * d'usage 101 : Google annonce jusqu'a 300 resultats et l'application n'en
 * montrait que 20, sans aucun moyen d'aller plus loin. Sur une saga, les tomes
 * manquants etaient simplement hors de portee.
 */
async function chercher(requete, options = {}, page = 0) {
  const donnees = await googleGet('/volumes', {
    q: requete,
    maxResults: MAX_RESULTATS,
    ...(page > 0 ? { startIndex: page * MAX_RESULTATS } : {}),
    ...options,
  });
  if (!Array.isArray(donnees.items)) return [];
  return donnees.items.map(normaliserVolume);
}

/** @returns {Promise<ResultatRecherche[]>} */
export function rechercherParTitre(texte, page = 0) {
  return chercher(`intitle:${texte}`, { langRestrict: 'fr' }, page);
}

/** @returns {Promise<ResultatRecherche[]>} */
export function rechercherParAuteur(texte, page = 0) {
  return chercher(`inauthor:"${texte}"`, { langRestrict: 'fr' }, page);
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
