/*
 * status.js — les 4 statuts (§5.1) et les règles dérivées qui en dépendent.
 * Importable par les composants, au même titre que api.js (§2, règle 1).
 * Applique §5.2 : « non encore paru » N'EST PAS un cinquième statut, c'est un
 * dérivé calculé ici. Applique aussi §3.3 : « aujourd'hui » se calcule en heure
 * LOCALE — le projet séries utilise toISOString() (UTC) et se décale d'un jour
 * en soirée. Ce défaut ne se reproduit pas ici.
 */

export const STATUTS = ['a_lire', 'en_cours', 'lu', 'abandonne'];

export const LIBELLES = {
  a_lire: 'À lire',
  en_cours: 'En cours',
  lu: 'Lu',
  abandonne: 'Abandonné',
};

/** Classe CSS porteuse de la couleur du statut (voir --sc dans styles.css). */
export function classeStatut(statut) {
  return `status--${statut}`;
}

/** Date du jour en 'YYYY-MM-DD', heure locale. Un seul domicile (§3.3). */
export function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/*
 * Complète une date partielle à la FIN de sa période.
 * Google Books rend très souvent l'année seule : comparée telle quelle,
 * '2026' passe pour antérieure à '2026-01-01' et le livre est classé « paru ».
 * TMDB rendait toujours une date complète — c'est le seul endroit où la
 * transposition depuis le projet séries est fausse (§5.2).
 */
export function finDePeriode(datePublication) {
  if (!datePublication) return null;
  const d = String(datePublication).trim();
  if (/^\d{4}$/.test(d)) return `${d}-12-31`;
  if (/^\d{4}-\d{2}$/.test(d)) {
    const [an, mois] = d.split('-').map(Number);
    const dernier = new Date(an, mois, 0).getDate();
    return `${d}-${String(dernier).padStart(2, '0')}`;
  }
  return d.slice(0, 10);
}

/*
 * Progression — §5.3. C'est une SOUSTRACTION, jamais un appel réseau : c'est
 * l'écart le plus rentable avec le projet séries, où le calcul de progression
 * était le point le plus coûteux de l'application.
 * L'unité est DÉDUITE du format de l'édition active (§9), elle n'est pas
 * stockée : page pour du papier ou du numérique, minute pour de l'audio.
 * Sans métrique connue, `position` porte directement un POURCENTAGE — c'est le
 * repli de §5.4 quand l'utilisateur refuse de saisir une pagination.
 */
export function progressionDe(oeuvre) {
  const position = Number(oeuvre.position) || 0;
  const audio = oeuvre.format === 'audio';
  const total = audio ? Number(oeuvre.dureeMinutes) || 0 : Number(oeuvre.nbPages) || 0;

  if (!total) {
    return {
      unite: 'pourcent', total: 100, position,
      pourcent: Math.min(100, Math.max(0, position)),
      metriqueConnue: false,
    };
  }

  return {
    unite: audio ? 'minute' : 'page',
    total,
    position,
    /*
     * Borne PAR LE BAS autant que par le haut. Trouve par le premier jeu de
     * verifications (2026-08-25) : le repli en pourcentage ci-dessus bornait
     * bien a 0, celui-ci non — une position negative rendait « -2 % » et une
     * barre de progression a l'envers. `setPosition` interdit deja les
     * valeurs negatives, mais une sauvegarde restauree, elle, n'est pas
     * filtree : la donnee peut entrer par la.
     */
    pourcent: Math.min(100, Math.max(0, Math.round((position / total) * 100))),
    metriqueConnue: true,
  };
}

/** « 210 / 587 pages », « 3 h 25 sur 9 h 10 », « 40 % ». */
export function libelleProgression(p) {
  if (p.unite === 'pourcent') return `${p.pourcent} %`;
  if (p.unite === 'minute') return `${enHeures(p.position)} sur ${enHeures(p.total)}`;
  return `page ${p.position} sur ${p.total}`;
}

export function enHeures(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

/** Vrai si le livre n'est pas encore paru. Exclu du compteur « À lire » (§6). */
export function estAParaitre(datePublication, jour = aujourdhui()) {
  const fin = finDePeriode(datePublication);
  return fin !== null && fin > jour;
}
