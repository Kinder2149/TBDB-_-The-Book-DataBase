/*
 * books.js — SEUL endroit qui sait qu'il existe deux sources (§2, règle 4).
 * Orchestre : Google découvre, Open Library identifie. store.js et l'UI
 * ignorent d'où vient une donnée ; store.js n'importe jamais ce fichier.
 * Domicile unique du calcul d'empreinte (§3.2) : le projet séries a laissé son
 * équivalent se redéfinir dans quatre fichiers, et deux normalisations
 * différentes de la même clé font tomber la déduplication sans bruit.
 */

import * as google from './sources/google.js';
import * as ol from './sources/openlibrary.js';

/** @typedef {import('./types.js').ResultatRecherche} ResultatRecherche */
/** @typedef {import('./types.js').Identite} Identite */

const CACHE_TTL_MS = 30 * 60 * 1000;
const cacheRecherche = new Map();

/*
 * Cache d'identité, même durée. Sans lui, ouvrir une fiche puis toucher
 * « Suivre » lance DEUX fois la même résolution Open Library — c'est-à-dire
 * l'appel le plus lent du projet (jusqu'à 9 s sur téléphone en 5G), payé deux
 * fois pour rien. Le cache est ici plutôt qu'un paramètre ajouté à la façade :
 * les signatures de §2.1 ne se modifient pas.
 *
 * Il mémorise aussi les ÉCHECS, avec le budget sous lequel ils sont survenus.
 * Corrigé en tranche 9 : la version précédente ne gardait que les réussites,
 * donc un livre qu'Open Library ne connaît pas — c'est-à-dire 65 % des ISBN
 * français (§3.2) — était réinterrogé INTÉGRALEMENT à chaque ouverture de
 * fiche et à chaque ajout. Les livres les plus lents étaient exactement ceux
 * qu'on repayait le plus souvent.
 * Le budget mémorisé est ce qui permet de garder la reprise en tâche de fond :
 * un échec à 4 s ne dit rien d'un essai à 15 s, donc un budget PLUS GRAND
 * retente ; un budget égal ou plus petit se contente du cache.
 */
const cacheIdentite = new Map();

/*
 * Cache des fiches d'oeuvre — le resume de complement (§4.3). Mesure de la
 * tranche 9 : sans lui, l'identification etait bien mise en cache mais le
 * resume, lui, etait redemande a CHAQUE ouverture de fiche. Rouvrir cinq
 * livres deja vus coutait encore 1,3 s d'appels reseau pour un texte qu'on
 * avait deja. Les `null` sont memorises aussi : une oeuvre sans description
 * n'en aura pas davantage a la lecture suivante.
 */
const cacheOeuvre = new Map();

/*
 * Budget de l'identification INTERACTIVE — celle qui fait attendre devant la
 * fiche. Mesure du 2026-08-20 : Open Library repond entre 1,3 s et 7,7 s selon
 * l'heure, et /isbn/ coute DEUX allers-retours a cause d'une redirection ; le
 * delai general de 12 s se traduisait par 12 secondes d'attente reelle.
 * 4 s suffisent quand la source va bien, et l'echec n'est pas une perte : le
 * livre entre en empreinte locale et l'identite est reprise en tache de fond.
 */
const BUDGET_INTERACTIF_MS = 4000;

/*
 * Budget du RESUME de complement. Il n'en avait aucun : `completer()` appelait
 * Open Library sans rien passer, donc retombait sur le plafond de 12 s — et
 * 12 s de plus si l'oeuvre avait ete fusionnee, soit 24 s pour un champ de
 * confort. C'est le plus long appel du parcours, et le moins essentiel :
 * §4.3 dit qu'un resume anglais vaut mieux qu'un vide, pas qu'il vaut une
 * demi-minute d'attente. 4 s, comme l'identification, et la fiche reste
 * lisible sans lui.
 */
const BUDGET_RESUME_MS = 4000;

/*
 * Empreinte locale — le FILET de §3.2, pas le mécanisme principal.
 * Elle n'utilise que le PREMIER auteur, décision corrigée après appels réels :
 * la variante « tous les auteurs triés » se brise sur Open Library, qui rend
 * les translittérations dans la même liste (author_name pour Dune contient
 * « Frank Herbert » ET « Френк Герберт »). Le premier élément, lui, concorde
 * entre les deux sources sur tous les cas observés.
 */
export function empreinteOeuvre(titre, auteurs) {
  const premier = Array.isArray(auteurs) ? auteurs[0] : auteurs;
  return `fp:${normaliser(titre, true)}|${normaliser(premier, false)}`;
}

function normaliser(texte, couperSousTitre) {
  if (!texte) return '';
  let t = String(texte);
  if (couperSousTitre) t = t.split(':')[0];
  return t
    .toLowerCase()
    .normalize('NFD')
    // ̀-ͯ = les accents isolés par NFD. Écrits en échappement et non
    // en caractères bruts : ce sont des signes combinants invisibles, qu'un
    // éditeur ou une copie peut avaler sans que rien ne le signale.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')       // ponctuation et espaces
    .replace(/^-+|-+$/g, '');
}

/**
 * Recherche. Cache mémoire 30 min sur les résultats uniquement : les fiches
 * n'en ont pas besoin, elles seront en base (§3.5).
 * @param {string} texte
 * @param {'titre'|'auteur'|'isbn'} mode
 * @returns {Promise<ResultatRecherche[]>}
 */
export async function rechercher(texte, mode) {
  const requete = texte.trim();
  if (!requete) return { resultats: [], ancien: false, pose: null };

  const cle = `${mode}:${requete.toLowerCase()}`;
  const enCache = cacheRecherche.get(cle);
  if (enCache && Date.now() - enCache.pose < CACHE_TTL_MS) {
    return { resultats: enCache.resultats, ancien: false, pose: enCache.pose };
  }

  let resultats;
  try {
    resultats = await interroger(requete, mode);
  } catch (panne) {
    /*
     * ARCHIVE — le dernier recours, et le seul qui reste (tranche 10).
     * Six essais laissent encore environ 4 % des recherches en echec, parce
     * que les 503 de Google arrivent en rafales (§4.7). Deux replis ont ete
     * envisages puis ecartes par la mesure : Open Library en source de
     * decouverte (6 a 21 s, pertinence francaise mauvaise — correction 72),
     * et une seconde cle (le quota est par PROJET, pas par cle).
     * Restait ce qu'on avait deja : la meme recherche, faite plus tot. Mieux
     * vaut des resultats d'hier annonces comme tels qu'un ecran vide.
     */
    const archive = await lireArchive(cle);
    if (archive) return { resultats: archive.resultats, ancien: true, pose: archive.pose };
    throw panne;
  }

  const illustres = resultats.map(avecCouvertureDeRepli);
  const pose = Date.now();
  cacheRecherche.set(cle, { pose, resultats: illustres });
  // Volontairement non attendu : archiver ne doit pas retarder l'affichage.
  if (illustres.length) void ecrireArchive(cle, pose, illustres);
  return { resultats: illustres, ancien: false, pose };
}

/* Le chemin reseau, inchange — extrait pour que `rechercher` ne fasse plus que
 * decider entre le vif, le cache et l'archive. */
async function interroger(requete, mode) {
  let resultats;
  if (mode === 'auteur') {
    resultats = await google.rechercherParAuteur(requete);
  } else if (mode === 'isbn') {
    const chiffres = requete.replace(/[^0-9Xx]/g, '');
    /*
     * Repli Open Library sur DEUX cas, pas un seul :
     *  - Google ne connait pas l'ISBN (zero resultat) ;
     *  - Google ne repond pas du tout (503 une fois sur deux, §4.7).
     * Le second cas manquait, et c'est celui qui frappe le plus souvent : une
     * panne passagere de Google rendait la recherche par ISBN inutilisable
     * alors qu'Open Library, lui, repondait.
     * Mesure honnete : sur huit ISBN francais testes, trois n'existent NI chez
     * Google NI chez Open Library. L'autre moitie de la reponse est la saisie
     * manuelle (§3.2 prevoit l'empreinte locale pour « les vieux fonds,
     * l'autoedition et les livres non catalogues » ; encore faut-il pouvoir en
     * creer un).
     */
    let panneGoogle = null;
    try {
      resultats = await google.rechercherParIsbn(chiffres);
    } catch (e) {
      panneGoogle = e;
      resultats = [];
    }

    if (resultats.length === 0) {
      try {
        const secours = await ol.livreParIsbn(chiffres);
        if (secours) resultats = [secours];
      } catch { /* Open Library injoignable aussi */ }
    }

    // Les deux sources muettes ET Google en panne : c'est une panne, pas une
    // absence. Le message doit le dire, sinon l'utilisateur croit que son
    // livre n'existe pas.
    if (resultats.length === 0 && panneGoogle) throw panneGoogle;
  } else {
    resultats = await google.rechercherParTitre(requete);
  }

  return resultats;
}

// ---------------------------------------------------------------------------
// Archive persistante des recherches (tranche 10)
// ---------------------------------------------------------------------------

/*
 * `idb-keyval`, deja installe et deja utilise par db.js pour le cliche de la
 * base : aucune dependance nouvelle. Duree de vie 7 jours et non 30 minutes —
 * ce n'est pas un cache de performance (celui-la est en memoire, au-dessus),
 * c'est un filet contre une panne de source. Un resultat d'il y a trois jours
 * reste un bon resultat pour un catalogue de livres.
 */
const ARCHIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIXE_ARCHIVE = 'recherche:';

async function lireArchive(cle) {
  try {
    const { get } = await import('idb-keyval');
    const entree = await get(PREFIXE_ARCHIVE + cle);
    if (!entree || Date.now() - entree.pose > ARCHIVE_TTL_MS) return null;
    return entree;
  } catch {
    return null;   // IndexedDB indisponible : on n'a simplement pas de filet
  }
}

async function ecrireArchive(cle, pose, resultats) {
  try {
    const { set } = await import('idb-keyval');
    await set(PREFIXE_ARCHIVE + cle, { pose, resultats });
  } catch { /* ecrire l'archive n'est jamais une raison d'echouer */ }
}

/**
 * Résout l'identité d'œuvre d'un résultat (§3.2). Ne bloque JAMAIS : une
 * résolution impossible rend une empreinte locale, pas une erreur.
 * @param {ResultatRecherche} resultat
 * @returns {Promise<Identite>}
 */
export async function identifier(resultat, budgetMs = BUDGET_INTERACTIF_MS) {
  const enCache = cacheIdentite.get(resultat.cleSource);
  const frais = enCache && Date.now() - enCache.pose < CACHE_TTL_MS;

  if (frais) {
    // Une identite RESOLUE est definitive.
    if (enCache.identite.resolue) return enCache.identite;
    // Un echec ne vaut que pour le temps qu'on lui a laisse : retenter n'a de
    // sens qu'avec PLUS de temps (c'est le cas de la reprise en tache de fond).
    if (budgetMs <= enCache.budget) return enCache.identite;
  }

  const identite = await resoudre(resultat, budgetMs);
  cacheIdentite.set(resultat.cleSource, { pose: Date.now(), identite, budget: budgetMs });
  return identite;
}

/** Identite deja connue, sans aucun appel. Rend null si on ne sait pas encore. */
export function identiteConnue(cleSource) {
  const enCache = cacheIdentite.get(cleSource);
  return enCache && enCache.identite.resolue ? enCache.identite : null;
}

/** Empreinte locale immediate, pour entrer en base sans attendre le reseau. */
export function identiteImmediate(resultat) {
  return {
    oeuvreId: empreinteOeuvre(resultat.titre, resultat.auteurs),
    resolue: false,
    cycleNom: null,
    cycleTome: null,
    nbPages: resultat.nbPages,
    couvertureUrl: resultat.couvertureUrl,
  };
}

async function resoudre(resultat, budgetMs) {
  const repli = {
    oeuvreId: empreinteOeuvre(resultat.titre, resultat.auteurs),
    resolue: false,
    cycleNom: null,
    cycleTome: null,
    nbPages: resultat.nbPages,
    couvertureUrl: resultat.couvertureUrl,
  };

  try {
    /*
     * CASCADE, et non alternative. Corrigé après mesure sur appels réels :
     * §3.2 présentait l'ISBN comme « le chemin normal » et la recherche comme
     * le cas des livres sans ISBN. C'est faux pour l'édition française —
     * beaucoup d'ISBN français répondent 404 chez Open Library
     * (9782221127520 et 9782744131929 par exemple, tous deux chez Google).
     * Prendre l'ISBN comme chemin exclusif faisait donc tomber en empreinte
     * locale des livres qu'une simple recherche identifie très bien.
     * Ordre : ISBN, puis recherche titre+auteur, puis seulement l'empreinte.
     */
    const isbn = resultat.isbn13 || resultat.isbn10;

    let identite = isbn ? await ol.identiteParIsbn(isbn, budgetMs) : null;
    if (!identite || !identite.oeuvreId) {
      identite = await ol.identiteParRecherche(resultat.titre, resultat.auteurs[0], budgetMs);
    }

    if (!identite || !identite.oeuvreId) return repli;

    return {
      ...identite,
      // Cascade de pagination §5.4 : exact d'Open Library d'abord, Google ensuite.
      nbPages: identite.nbPages || resultat.nbPages,
      couvertureUrl: resultat.couvertureUrl || identite.couvertureUrl,
    };
  } catch {
    // Open Library injoignable : l'application continue en empreinte locale et
    // signalera « identification incomplète » dans la fiche (§4.3).
    return repli;
  }
}

// ---------------------------------------------------------------------------
// Suggestions (§4.6)
// ---------------------------------------------------------------------------

const MAX_GRAINES = 6;
const MAX_CYCLES = 3;
const COUPE = 20;

/*
 * Budget d'appels, calculé et non subi : 6 graines × 2 requêtes + 3 cycles au
 * plus = 15 appels par actualisation. Le contexte prévoyait 12 graines (24
 * appels), chiffre hérité de TMDB qui n'a AUCUN quota journalier ; Google en a
 * un de 1 000, partagé par tous les porteurs de la clé (arbitrage 17).
 * Chaque appel est enveloppé : une graine qui échoue ne casse pas l'écran.
 */
export async function suggestions(graines, cycles, exclusions, cleCache) {
  /*
   * CACHE JOURNALIER (§4.6 point 6, tranche 12). Une actualisation coute
   * jusqu'a 15 des 1 000 requetes quotidiennes : une poignee de clics suffit
   * a entamer serieusement la journee, et l'utilisateur n'a aucun moyen de
   * le savoir. Or le resultat ne change PAS tant que la bibliotheque ne
   * change pas — les memes graines produisent les memes suggestions.
   * La cle porte donc l'empreinte des graines : marquer un livre « lu »
   * invalide le cache tout seul, sans bouton ni reglage.
   */
  if (cleCache) {
    const garde = await lireSuggestions(cleCache);
    if (garde) return garde;
  }

  const lots = [];

  for (const g of graines.slice(0, MAX_GRAINES)) {
    const auteur = (g.auteurs || '').split(',')[0].trim();
    const sujet = (g.categories || '').split(',')[0].trim();
    if (auteur) {
      lots.push(google.rechercherParAuteur(auteur)
        .then((r) => ({ raison: `Parce que vous avez lu ${g.titre}`, resultats: r }))
        .catch(() => ({ raison: '', resultats: [] })));
    }
    if (sujet) {
      lots.push(google.rechercherParSujet(sujet)
        .then((r) => ({ raison: `Dans le même genre que ${g.titre}`, resultats: r }))
        .catch(() => ({ raison: '', resultats: [] })));
    }
  }

  /*
   * Tome suivant — §4.6 point 5. On propose une RECHERCHE du tome n+1, on
   * n'affirme jamais qu'il existe : si la recherche ne rend rien, aucune carte
   * n'apparaît. C'est la différence entre suggérer et inventer.
   */
  for (const c of cycles.slice(0, MAX_CYCLES)) {
    lots.push(google.rechercherParTitre(`${c.nom} tome ${c.tomeSuivant}`)
      .then((r) => ({ raison: `Suite de ${c.nom}, tome ${c.tomeSuivant}`, resultats: r }))
      .catch(() => ({ raison: '', resultats: [] })));
  }

  const reponses = await Promise.all(lots);

  /*
   * Exclusion de ce qu'on possède déjà. §4.6 dit « par oeuvre_id ET par
   * ISBN » — mais l'identifiant d'œuvre d'un résultat n'est PAS connu sans un
   * appel Open Library par résultat, ce que §4.3 interdit. L'empreinte locale
   * en tient lieu : elle se calcule hors ligne sur le titre et l'auteur.
   */
  const parCle = new Map();
  let rang = 0;

  reponses.forEach(({ raison, resultats }) => {
    const vus = new Set();
    resultats.forEach((r) => {
      const empreinte = empreinteOeuvre(r.titre, r.auteurs);
      if (exclusions.empreintes.has(empreinte)) return;
      if (r.isbn13 && exclusions.isbn.has(r.isbn13)) return;
      if (vus.has(empreinte)) return;      // doublon dans la même réponse
      vus.add(empreinte);

      const existant = parCle.get(empreinte);
      if (existant) { existant.score += 1; return; }
      rang += 1;
      parCle.set(empreinte, { ...r, raison, score: 1, rang });
    });
  });

  // Tri par score, puis par ordre d'arrivée Google — qui est déjà un ordre de
  // pertinence. Aucune popularité n'est disponible (arbitrage 16, confirmé).
  const retenues = [...parCle.values()]
    .sort((a, b) => (b.score - a.score) || (a.rang - b.rang))
    .slice(0, COUPE);

  // Un lot vide ne se garde pas : il vient presque toujours d'une panne de
  // source, et le mettre en cache figerait un ecran vide pour la journee.
  if (cleCache && retenues.length) void ecrireSuggestions(cleCache, retenues);
  return retenues;
}

/*
 * Les suggestions vivent jusqu'a la fin de la JOURNEE, pas 7 jours comme
 * l'archive de recherche : elles sont une proposition de lecture, et en
 * revoir exactement les memes une semaine durant serait pire que de payer
 * quinze requetes.
 */
async function lireSuggestions(cle) {
  try {
    const { get } = await import('idb-keyval');
    const entree = await get('suggestions:' + cle);
    if (!entree || entree.jour !== jourCourant()) return null;
    return entree.resultats;
  } catch {
    return null;
  }
}

async function ecrireSuggestions(cle, resultats) {
  try {
    const { set } = await import('idb-keyval');
    await set('suggestions:' + cle, { jour: jourCourant(), resultats });
  } catch { /* sans cache, on paiera les requetes : degradation acceptable */ }
}

function jourCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/*
 * Couverture de repli. Mesure du 2026-08-20 sur 100 resultats reels : Google
 * n'en illustre que 65 %. Des 35 manquantes, 24 portent un ISBN, et Open
 * Library en fournit environ deux sur cinq — de quoi passer d'environ 65 a
 * 75 % d'illustrations, sans un seul appel d'API supplementaire (c'est une
 * URL d'image, pas une requete de donnees).
 * `default=false` est indispensable : sans lui, Open Library rend une image
 * d'UN PIXEL avec un statut 200 quand la couverture n'existe pas.
 */
export function avecCouvertureDeRepli(resultat) {
  if (resultat.couvertureUrl) return resultat;
  const isbn = resultat.isbn13 || resultat.isbn10;
  if (!isbn) return resultat;
  return { ...resultat, couvertureUrl: ol.couvertureParIsbn(isbn) };
}

/**
 * Complète un résultat dont Google n'a pas donné le résumé, depuis la fiche
 * d'œuvre Open Library — même en anglais : un résumé anglais vaut mieux qu'un
 * vide, et on ne traduit pas (§9).
 * @returns {Promise<ResultatRecherche>}
 */
export async function completer(resultat, identite, budgetMs = BUDGET_RESUME_MS) {
  if (resultat.resume || !identite.resolue) return resultat;
  try {
    const enCache = cacheOeuvre.get(identite.oeuvreId);
    const frais = enCache && Date.now() - enCache.pose < CACHE_TTL_MS;

    const oeuvre = frais
      ? enCache.oeuvre
      : await ol.oeuvreParCle(identite.oeuvreId, budgetMs);
    if (!frais) cacheOeuvre.set(identite.oeuvreId, { pose: Date.now(), oeuvre });

    if (!oeuvre) return resultat;
    return {
      ...resultat,
      resume: oeuvre.resume || resultat.resume,
      categories: resultat.categories.length ? resultat.categories : oeuvre.categories,
      couvertureUrl: resultat.couvertureUrl || oeuvre.couvertureUrl,
    };
  } catch {
    return resultat;
  }
}
