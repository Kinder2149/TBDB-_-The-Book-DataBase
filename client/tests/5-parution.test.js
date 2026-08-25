/*
 * FAMILLE 5 — « CE LIVRE EST-IL SORTI ? »
 *
 * Ecrite le 2026-08-25 apres le retour d'usage le plus grave du projet :
 * « je scan un livre, il le reconnait, je l'ajoute, je reviens dans ma
 * bibliotheque il n'est plus la ».
 *
 * Il n'avait pas disparu : il etait range sous « Pas encore paru », parce que
 * Google Books ne donne souvent QUE l'annee, et que l'application etendait
 * « 2026 » au 31 decembre 2026. Tout livre publie dans l'annee en cours
 * sortait donc de la bibliotheque.
 *
 * Aucune des 75 verifications precedentes ne regardait cette regle : elles
 * verifiaient les pieces, jamais l'assemblage. C'est la lecon de cette famille.
 */

import { describe, it, expect } from 'vitest';
import { estAParaitre, estEnAttenteDeParution } from '../src/status.js';

// Toutes les verifications se placent au 25 aout 2026, pour ne pas dependre
// du jour ou elles sont lancees.
const JOUR = '2026-08-25';

describe('Une date incomplete ne doit pas faire disparaitre un livre', () => {
  it('l-annee EN COURS, seule, designe un livre DEJA PARU', () => {
    // Le cas exact du bug. Google rend « 2026 » pour la plupart des livres
    // recents : les ranger tous en « pas encore paru » vide la bibliotheque
    // de ses ajouts les plus frequents.
    expect(estAParaitre('2026', JOUR)).toBe(false);
  });

  it('le MOIS en cours, seul, designe un livre deja paru', () => {
    expect(estAParaitre('2026-08', JOUR)).toBe(false);
  });

  it('les annees passees sont evidemment parues', () => {
    expect(estAParaitre('1991', JOUR)).toBe(false);
    expect(estAParaitre('2025', JOUR)).toBe(false);
    expect(estAParaitre('2026-03-14', JOUR)).toBe(false);
  });

  it('une date sans information ne suppose jamais « a paraitre »', () => {
    expect(estAParaitre(null, JOUR)).toBe(false);
    expect(estAParaitre('', JOUR)).toBe(false);
    expect(estAParaitre('sans date', JOUR)).toBe(false);
  });
});

describe('Un livre reellement a venir reste annonce comme tel', () => {
  it('une annee future', () => {
    expect(estAParaitre('2027', JOUR)).toBe(true);
  });

  it('un mois futur de l-annee en cours', () => {
    expect(estAParaitre('2026-12', JOUR)).toBe(true);
    expect(estAParaitre('2026-09', JOUR)).toBe(true);
  });

  it('une date complete future', () => {
    expect(estAParaitre('2026-08-26', JOUR)).toBe(true);
    expect(estAParaitre('2027-01-01', JOUR)).toBe(true);
  });

  it('la date du jour compte comme parue', () => {
    expect(estAParaitre('2026-08-25', JOUR)).toBe(false);
  });
});

describe('Un livre qu-on a commence ne peut plus etre « a paraitre »', () => {
  // Regle heritee du projet films/series : un titre deja vu n'est JAMAIS
  // annonce comme a venir. Elle manquait ici, et un livre marque « Lu » se
  // retrouvait range sous « A paraitre », sans compter dans aucun statut.
  const livre = (statut, date) => ({ statut, datePublication: date });

  it('un livre marque LU reste dans la bibliotheque, meme date future', () => {
    expect(estEnAttenteDeParution(livre('lu', '2027'), JOUR)).toBe(false);
  });

  it('un livre EN COURS reste dans la bibliotheque', () => {
    expect(estEnAttenteDeParution(livre('en_cours', '2027'), JOUR)).toBe(false);
  });

  it('un livre ABANDONNE reste dans la bibliotheque', () => {
    expect(estEnAttenteDeParution(livre('abandonne', '2027'), JOUR)).toBe(false);
  });

  it('seul un livre A LIRE et pas encore sorti est mis en attente', () => {
    expect(estEnAttenteDeParution(livre('a_lire', '2027'), JOUR)).toBe(true);
  });

  it('un livre a lire et deja sorti reste dans la bibliotheque', () => {
    expect(estEnAttenteDeParution(livre('a_lire', '2026'), JOUR)).toBe(false);
  });
});
