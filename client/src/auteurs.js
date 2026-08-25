/*
 * auteurs.js — tout ce qui concerne le NOM d'un auteur : le normaliser, le
 * reconnaitre sous ses variantes, et regrouper des livres par ecrivain.
 *
 * Extrait de `Recherche.jsx` le 2026-08-25 : l'ecran atteignait 653 lignes,
 * soit exactement ce que §2.2 reproche au projet series. Ces fonctions sont
 * PURES — aucun etat, aucun rendu, aucun reseau — et n'avaient donc rien a
 * faire dans un composant.
 */

/*
 * REGROUPEMENT PAR AUTEUR (retour d'usage 81). « La recherche par auteur me
 * donne des livres plutot qu'une liste d'auteurs et leurs oeuvres. »
 *
 * Une vraie liste d'auteurs a ete mesuree puis ECARTEE : Open Library est la
 * seule source qui en propose une (`/search/authors.json`) et elle met de
 * 3,8 a 51 SECONDES, en rendant des doublons (« BernarD Werber » et
 * « Bernard Werber » sont deux fiches distinctes). Google Books, lui, n'a
 * aucun point d'entree « auteurs ».
 *
 * Mais Google rend deja le nom de l'auteur avec chaque livre : le regroupement
 * se fait donc ICI, sur ce qu'on a deja, sans un seul appel de plus et sans
 * une seconde d'attente. L'auteur cherche vient en tete, les homonymes en
 * dessous — ce sont eux, et non le manque de liste, qui brouillaient l'ecran.
 */
export function sansAccent(texte) {
  return String(texte || '').toLowerCase().normalize('NFD')
    // Meme precaution qu'en §books.js : les signes combinants s'ecrivent en
    // echappement, jamais en caracteres bruts — ils sont invisibles, et une
    // copie de fichier peut les avaler sans que rien ne le signale.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Cle de regroupement d'un auteur. Google Books n'a AUCUN identifiant
 * d'auteur : il n'a que des chaines, et il ecrit le meme ecrivain de
 * plusieurs facons. Constate sur appels reels :
 *   « Alexandre Dumas » / « Alexandre Dumas (père) » / « Alexandre Dumas (1802-1870) »
 *   « John Ronald Reuel Tolkien » / « J.R.R. Tolkien » / « Tolkien J.R.R. »
 *   « Herbert George Wells » / « H.G Wells » / « H. G. Wells, H. G. »
 * Deux formes sur quatre recherches testees : ce n'est pas un cas limite.
 *
 * La cle est « nom de famille + initiales des autres mots, dedoublonnees et
 * triees ». Deux choix, tous deux corriges apres mesure :
 *
 *  - Le nom de famille est le DERNIER mot de plus d'une lettre. Une premiere
 *    version prenait « le mot le plus long » : elle echouait sur « Herbert
 *    George Wells », ou le prenom est plus long que le nom, et laissait Wells
 *    en quatre groupes. Le dernier mot long marche aussi sur les inversions
 *    (« Tolkien J.R.R. »), ou les initiales suivent le nom.
 *  - Les initiales sont DEDOUBLONNEES : « Herbert George Wells H G » repete
 *    les memes initiales sous deux formes dans une seule chaine.
 *
 * LIMITE ASSUMEE : deux auteurs partageant nom de famille ET initiales se
 * retrouvent fusionnes (« Alexandre Dumas » et « André Dumas »). C'est un
 * ecran de recherche, pas un catalogue de bibliotheque ; les titres affiches
 * montrent immediatement si quelque chose detonne.
 */
export function cleAuteur(nom) {
  const propre = sansAccent(String(nom || '').replace(/\([^)]*\)/g, ' ').replace(/[.,]/g, ' '));
  const mots = propre.split(' ').filter(Boolean);
  if (mots.length === 0) return '';

  const longs = mots.filter((m) => m.length > 1);
  const famille = longs.length ? longs[longs.length - 1] : mots[mots.length - 1];

  const initiales = [...new Set(
    mots.filter((m) => m !== famille).map((m) => m[0]),
  )].sort().join('');

  return `${famille}|${initiales}`;
}

/* Le nom LISIBLE, pour juger de la proximite avec ce que l'utilisateur a tape.
 * La cle ci-dessus ne convient pas : « werber » ne se retrouve pas dans
 * « bernard|w ». */
export function nomComparable(nom) {
  return sansAccent(String(nom || '').replace(/\([^)]*\)/g, ' '));
}

export function grouperParAuteur(resultats, requete) {
  const cherche = sansAccent(requete);
  const groupes = new Map();

  resultats.forEach((r) => {
    const nom = (r.auteurs && r.auteurs[0]) || 'Auteur inconnu';
    const cle = cleAuteur(nom);
    if (!groupes.has(cle)) groupes.set(cle, { nom, livres: [] });
    const g = groupes.get(cle);
    // Entre deux ecritures du meme auteur, on affiche la plus courte : c'est
    // la forme canonique, celle sans les dates ni la mention entre
    // parentheses. « Alexandre Dumas » plutot que « Alexandre Dumas (père) ».
    if (nom.length < g.nom.length) g.nom = nom;
    g.livres.push(r);
  });

  /* 3 = le nom demande exactement ; 2 = il le contient ; 1 = tous les mots y
     sont (« werber » trouve « Bernard Werber ») ; 0 = un homonyme. */
  const proximite = (nom) => {
    const c = nomComparable(nom);
    if (!cherche) return 0;
    if (c === cherche) return 3;
    if (c.includes(cherche)) return 2;
    return cherche.split(' ').every((mot) => c.includes(mot)) ? 1 : 0;
  };

  return [...groupes.values()]
    .map((g) => ({ ...g, proximite: proximite(g.nom) }))
    .sort((a, b) => (b.proximite - a.proximite) || (b.livres.length - a.livres.length));
}
