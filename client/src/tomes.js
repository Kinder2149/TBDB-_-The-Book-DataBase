/*
 * tomes.js — reconnaitre le numero de tome dans un titre, et remettre une
 * saga dans l'ordre.
 *
 * Retour d'usage 101 : « j'ai une saga de 5 tomes a la maison, il n'en voit
 * qu'un ». Mesure du 2026-08-25 : les tomes sont bien rendus par Google, mais
 * DANS UN DESORDRE COMPLET et noyes parmi des resultats sans numero. Pour
 * « La Quete d'Ewilan », l'ordre d'arrivee etait :
 *
 *     - 1 - - - 2 3 1 - 5 2 7 - 6 - 2 - - 7 4
 *
 * Personne ne peut y lire une serie. Les tomes n'etaient pas absents : ils
 * etaient illisibles. C'est un probleme de PRESENTATION, pas de catalogue.
 *
 * Fonctions pures : aucun etat, aucun rendu, aucun reseau.
 */

/*
 * Un numero de tome doit etre ANNONCE par un mot : tome, t., livre, volume,
 * vol., cycle — ou entre parentheses en fin de titre. Sans cette exigence,
 * « 1984 » deviendrait le tome 1984, et « Harry Potter » suivi d'un chiffre
 * quelconque serait mal range. On prefere manquer un tome que d'en inventer.
 */
const MOTIFS = [
  /\b(?:tome|livre|volume)\s*0*(\d{1,3})\b/i,
  // « T5 », « T. 5 », « T01 ». La MAJUSCULE est exigee : un « t » minuscule
  // apparait dans trop de mots courants pour qu'on puisse s'y fier.
  /\bT\.?\s*0*(\d{1,3})\b/,
  /\bvol\.?\s*0*(\d{1,3})\b/i,
  /\((\d{1,3})\)\s*$/,               // « Le Trone de Fer (3) »
  /#(\d{1,3})\b/,
];

/**
 * Numero de tome lu dans un titre, ou null.
 * @param {string} titre
 * @returns {number|null}
 */
export function numeroDeTome(titre) {
  const t = String(titre || '');
  for (const motif of MOTIFS) {
    const m = t.match(motif);
    if (m) {
      const n = Number(m[1]);
      // Un tome 0 n'existe pas, et au-dela de 200 c'est une annee ou un prix.
      if (n >= 1 && n <= 200) return n;
    }
  }
  return null;
}

/**
 * Separe les resultats en « une serie, dans l'ordre » et « le reste ».
 *
 * Le seuil de TROIS tomes est deliberé : avec deux, on peut tomber sur deux
 * livres sans rapport qui portent un numero. A partir de trois, c'est une
 * serie, et l'utilisateur a besoin de la voir ordonnee.
 *
 * @returns {{tomes: Array, autres: Array}} `tomes` vide si ce n'est pas une serie
 */
export function separerLesTomes(resultats) {
  const numerotes = [];
  const autres = [];

  (resultats || []).forEach((r) => {
    const n = numeroDeTome(r.titre);
    if (n === null) autres.push(r);
    else numerotes.push({ ...r, tome: n });
  });

  // Moins de trois numeros : ce n'est pas une serie, on ne reorganise rien.
  const distincts = new Set(numerotes.map((r) => r.tome));
  if (distincts.size < 3) return { tomes: [], autres: resultats || [] };

  /*
   * Tri par numero, puis par ordre d'arrivee de Google — qui est deja un ordre
   * de pertinence. Deux editions du meme tome restent donc voisines, la plus
   * pertinente en premier.
   */
  numerotes.sort((a, b) => a.tome - b.tome);
  return { tomes: numerotes, autres };
}
