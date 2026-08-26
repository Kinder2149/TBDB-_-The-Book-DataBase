/*
 * sources/bnf.js — le catalogue de la Bibliotheque nationale de France.
 * TROISIEME source, ajoutee le 2026-08-25 apres mise en cause du choix des
 * sources : « j'ai l'impression qu'il est limite, pas complet ».
 *
 * POURQUOI ELLE. Mesures comparatives du 2026-08-25, memes recherches :
 *
 *   Google Books   4/6 reussies (et 1/6 deux heures plus tot)   851 ms
 *   BnF            10/10 puis 6/6                              300-1300 ms
 *
 * Google n'est pas incomplet, il est INSTABLE. La BnF, elle, est le depot
 * legal francais : tout livre publie en France y figure par obligation legale.
 * Sans cle, sans quota, en HTTPS, avec `Access-Control-Allow-Origin: *`.
 *
 * SON ROLE EST UN FILET, PAS UN REMPLACEMENT. Elle ne fournit ni couverture
 * ni resume — c'est Google qui les apporte. Elle prend le relais quand Google
 * tombe, et rattrape des ISBN francais qu'il ignore.
 *
 * DEUX PIEGES, verifies sur appels reels :
 *  1. Elle contient TOUT le depot legal — une recherche « asterix » rend des
 *     cassettes video. D'ou le filtre `bib.doctype any "a"` (texte imprime).
 *  2. Elle indexe les livres anciens en ISBN-10, pas en ISBN-13 : chercher
 *     « 9782226052575 » ne rend RIEN, « 2226052577 » rend Les Fourmis. D'ou la
 *     conversion ci-dessous.
 */

/** @typedef {import('../types.js').ResultatRecherche} ResultatRecherche */

const BASE = 'https://catalogue.bnf.fr/api/SRU';
const DELAI_MAX_MS = 8000;
const MAX_RESULTATS = 20;

/* Texte imprime uniquement : sans lui, on rend des cassettes et des disques. */
const LIVRES_SEULEMENT = 'bib.doctype any "a"';

async function bnfGet(requete, budgetMs = DELAI_MAX_MS) {
  const url = new URL(BASE);
  url.searchParams.set('version', '1.2');
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('recordSchema', 'dublincore');
  url.searchParams.set('maximumRecords', String(MAX_RESULTATS));
  url.searchParams.set('query', requete);

  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), budgetMs);
  try {
    const reponse = await fetch(url.toString(), { signal: arret.signal });
    if (!reponse.ok) throw new Error(`Le catalogue de la BnF a répondu ${reponse.status}.`);
    return await reponse.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Le catalogue de la BnF ne répond pas.');
    throw e;
  } finally {
    clearTimeout(minuteur);
  }
}

/*
 * Lecture du XML SANS DOMParser. Ce dernier existe dans un navigateur et dans
 * un WebView, mais pas sous Node — et les verifications automatiques tournent
 * sous Node. Le format SRU/dublincore est simple et regulier : quelques
 * expressions suffisent, et le code reste le meme des deux cotes.
 */
function decoder(texte) {
  return String(texte || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();
}

function champs(bloc, nom) {
  const motif = new RegExp(`<dc:${nom}[^>]*>([\\s\\S]*?)</dc:${nom}>`, 'g');
  return [...bloc.matchAll(motif)].map((m) => decoder(m[1])).filter(Boolean);
}

function notices(xml) {
  return [...String(xml).matchAll(/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/g)].map((m) => m[0]);
}

/*
 * Le titre BnF porte les mentions de responsabilite apres une barre oblique :
 * « Les fourmis : roman / Bernard Werber ». On garde ce qui precede — c'est le
 * titre, et c'est ce qu'attend le reste de l'application.
 */
function titrePropre(brut) {
  const avantBarre = String(brut || '').split(' / ')[0];
  return avantBarre.trim() || 'Sans titre';
}

/*
 * Les auteurs arrivent avec leur role et leurs dates :
 * « Goscinny, René (1926-1977). Scénariste ». On retire les deux pour obtenir
 * un nom comparable a ceux de Google, sans quoi le regroupement par auteur et
 * l'empreinte d'oeuvre ne se rejoindraient jamais.
 */
function nomPropre(brut) {
  return String(brut || '')
    /*
     * TOUTES les parentheses, et pas seulement une forme de dates. Un premier
     * motif visait « (1926-1977) » : il laissait passer les dates ouvertes
     * « (1949-.... ) » et rendait « Gilbert (1949- Millet ». La BnF ecrit ses
     * dates de trop de facons pour qu'on les enumere.
     */
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\([^)]*$/, ' ')      // parenthese jamais refermee
    .split('.')[0]
    .replace(/\s+/g, ' ')
    .trim();
}

/* « Dupont, Jean » -> « Jean Dupont », pour coller a la forme de Google. */
function nomDansLOrdre(nom) {
  const m = nom.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : nom;
}

function premiereDescription(bloc, prefixe) {
  const trouve = champs(bloc, 'description').find((d) => d.startsWith(prefixe));
  return trouve ? trouve.slice(prefixe.length).trim() : null;
}

/** Annee sur quatre chiffres, extraite d'une date BnF (« 199. », « 1995 »). */
function anneeDe(brut) {
  const m = String(brut || '').match(/(\d{4})/);
  return m ? m[1] : null;
}

/*
 * ISBN-13 (prefixe 978) vers ISBN-10 : on retire le prefixe et on recalcule la
 * cle de controle. Indispensable — la BnF ne trouve pas « 9782226052575 »,
 * mais trouve « 2226052577 ». Verifie sur quatre ISBN reels.
 */
export function isbn13Vers10(isbn13) {
  const s = String(isbn13 || '').replace(/[^0-9]/g, '');
  if (s.length !== 13 || !s.startsWith('978')) return null;
  const corps = s.slice(3, 12);
  let somme = 0;
  for (let i = 0; i < 9; i += 1) somme += (10 - i) * Number(corps[i]);
  const reste = (11 - (somme % 11)) % 11;
  return corps + (reste === 10 ? 'X' : String(reste));
}

/**
 * LE normaliseur de cette source (§7 : un seul par source).
 * @returns {ResultatRecherche}
 */
function normaliserNotice(bloc) {
  const ark = champs(bloc, 'identifier').find((i) => i.includes('ark:')) || '';
  const auteurs = [
    ...champs(bloc, 'creator'),
    ...champs(bloc, 'contributor'),
  ].map((a) => nomDansLOrdre(nomPropre(a))).filter(Boolean);

  // Doublons frequents : le meme auteur revient sous plusieurs roles.
  const auteursUniques = [...new Set(auteurs)].slice(0, 3);

  const isbnBrut = champs(bloc, 'identifier').find((i) => /^ISBN/i.test(i)) || '';
  const isbn = isbnBrut.replace(/[^0-9Xx]/g, '');
  const annee = anneeDe(champs(bloc, 'date')[0]);

  return {
    cleSource: `bnf:${ark.split('/').pop() || Math.random().toString(36).slice(2)}`,
    source: 'bnf',
    titre: titrePropre(champs(bloc, 'title')[0]),
    sousTitre: null,
    auteurs: auteursUniques,
    annee,
    datePublication: annee,
    // La BnF ne fournit PAS d'image : la couverture dessinee prendra le relais.
    couvertureUrl: null,
    resume: null,
    categories: champs(bloc, 'subject').slice(0, 5),
    langue: (champs(bloc, 'language')[0] || '').startsWith('fre') ? 'fr' : null,
    isbn13: isbn.length === 13 ? isbn : null,
    isbn10: isbn.length === 10 ? isbn : null,
    nbPages: null,
    /*
     * L'editeur BnF porte sa fonction et sa ville :
     * « Régie cassette vidéo [éd., distrib.] (Paris) ». On garde le nom seul —
     * c'est lui qui distingue une edition d'une autre dans la fiche.
     */
    editeur: (champs(bloc, 'publisher')[0] || '')
      .split('[')[0]
      .replace(/\([^)]*\)/g, ' ')
      // Parentheses ORPHELINES : couper sur « [ » peut laisser un « ) » seul,
      // et l'on affichait « R. Rils ) ». Constate sur les editions de Germinal.
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[,;:\s]+$/, '')
      .trim() || null,
    // Bonus propre a la BnF : la collection, qui nomme souvent la serie.
    collection: premiereDescription(bloc, 'Collection :'),
  };
}

function guillemets(texte) {
  // Les guillemets doubles fermeraient le terme de recherche SRU.
  return String(texte || '').replace(/"/g, ' ').trim();
}

/** @returns {Promise<ResultatRecherche[]>} */
export async function rechercherParTitre(texte, budgetMs) {
  const xml = await bnfGet(`bib.title all "${guillemets(texte)}" and ${LIVRES_SEULEMENT}`, budgetMs);
  return notices(xml).map(normaliserNotice);
}

/** @returns {Promise<ResultatRecherche[]>} */
export async function rechercherParAuteur(texte, budgetMs) {
  const xml = await bnfGet(`bib.author all "${guillemets(texte)}" and ${LIVRES_SEULEMENT}`, budgetMs);
  return notices(xml).map(normaliserNotice);
}

/**
 * Recherche par ISBN. Tente le code tel quel, PUIS sa forme ISBN-10 : les
 * livres anterieurs a 2007 ne repondent qu'a la seconde.
 * @returns {Promise<ResultatRecherche|null>}
 */
export async function livreParIsbn(isbn, budgetMs) {
  const chiffres = String(isbn || '').replace(/[^0-9Xx]/g, '');
  if (!chiffres) return null;

  const formes = [chiffres];
  const dix = isbn13Vers10(chiffres);
  if (dix) formes.push(dix);

  for (const forme of formes) {
    const xml = await bnfGet(`bib.isbn all "${forme}"`, budgetMs);
    const [premiere] = notices(xml);
    if (premiere) {
      const livre = normaliserNotice(premiere);
      // On rend l'ISBN demande : c'est celui du code-barres scanne.
      return {
        ...livre,
        isbn13: chiffres.length === 13 ? chiffres : livre.isbn13,
        isbn10: chiffres.length === 10 ? chiffres : livre.isbn10,
      };
    }
  }
  return null;
}

/**
 * Les editions d'un texte donne : meme titre, meme auteur.
 *
 * C'est LA question pour laquelle ce catalogue est le meilleur outil
 * disponible — le depot legal recense chaque edition francaise parue, avec son
 * editeur, son annee et son ISBN. Mesure du 2026-08-26 : « les fourmis » +
 * « werber » rend douze editions en 1,3 s.
 *
 * @returns {Promise<ResultatRecherche[]>}
 */
export async function rechercherEditions(titre, auteur, budgetMs) {
  const morceaux = [`bib.title all "${guillemets(titre)}"`];
  if (auteur) morceaux.push(`bib.author all "${guillemets(auteur)}"`);
  morceaux.push(LIVRES_SEULEMENT);

  const xml = await bnfGet(morceaux.join(' and '), budgetMs);
  return notices(xml).map(normaliserNotice);
}
