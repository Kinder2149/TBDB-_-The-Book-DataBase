/*
 * FAMILLE 7 — REMETTRE UNE SAGA DANS L'ORDRE
 *
 * Retour d'usage 101 : « j'ai une saga de 5 tomes a la maison, il n'en voit
 * qu'un ». Les tomes etaient bien la, mais melanges et noyes. Les cas
 * ci-dessous viennent tous de titres REELS rendus par Google.
 */

import { describe, it, expect } from 'vitest';
import {
  numeroDeTome, separerLesTomes, nombreDeTomes, serieAConfirmer, trierResultats,
} from '../src/tomes.js';

describe('Lire un numero de tome dans un titre', () => {
  it('reconnait les formes francaises', () => {
    expect(numeroDeTome('Le Trône de Fer (Tome 5) - L’invincible forteresse')).toBe(5);
    expect(numeroDeTome('La Quête d’Ewilan, tome 2')).toBe(2);
    expect(numeroDeTome('Autre-Monde - Livre 3')).toBe(3);
    expect(numeroDeTome('Dune - T5 Les Hérétiques')).toBe(5);
    expect(numeroDeTome('La Passe-miroir T. 4')).toBe(4);
  });

  it('reconnait les parentheses en fin de titre et le dièse', () => {
    expect(numeroDeTome('Le Trône de Fer (3)')).toBe(3);
    expect(numeroDeTome('Discworld #5')).toBe(5);
  });

  it('lit un numero ecrit avec un zero devant', () => {
    expect(numeroDeTome('Les Fourmis T01')).toBe(1);
    expect(numeroDeTome('Saga tome 007')).toBe(7);
  });

  it('n-INVENTE PAS de tome — c-est la regle la plus importante', () => {
    // Sans mot annonceur, un nombre dans un titre n'est pas un tome.
    expect(numeroDeTome('1984')).toBeNull();
    expect(numeroDeTome('Harry Potter et la Coupe de Feu')).toBeNull();
    expect(numeroDeTome('Les 3 mousquetaires')).toBeNull();
    expect(numeroDeTome('Vingt mille lieues sous les mers')).toBeNull();
    expect(numeroDeTome('')).toBeNull();
    expect(numeroDeTome(null)).toBeNull();
  });

  it('refuse un numero absurde', () => {
    expect(numeroDeTome('Tome 0')).toBeNull();
    expect(numeroDeTome('Volume 9999')).toBeNull();
  });
});

describe('Separer une serie du reste', () => {
  const r = (titre) => ({ cleSource: titre, titre });

  it('remet les tomes dans l-ordre (cas reel de La Quete d-Ewilan)', () => {
    // Ordre d'arrivee reellement mesure chez Google.
    const bruts = ['Sans numéro', 'Ewilan tome 1', 'Autre chose', 'Ewilan tome 2',
      'Ewilan tome 7', 'Ewilan tome 5', 'Ewilan tome 3'].map(r);

    const { tomes, autres } = separerLesTomes(bruts);
    expect(tomes.map((x) => x.tome)).toEqual([1, 2, 3, 5, 7]);
    expect(autres).toHaveLength(2);
  });

  it('garde ensemble deux editions du meme tome', () => {
    const bruts = ['S tome 1', 'S tome 1 poche', 'S tome 2', 'S tome 3'].map(r);
    const { tomes } = separerLesTomes(bruts);
    expect(tomes.map((x) => x.tome)).toEqual([1, 1, 2, 3]);
  });

  it('ne reorganise RIEN en dessous de trois tomes distincts', () => {
    // Deux livres numerotes peuvent n'avoir aucun rapport entre eux.
    const bruts = ['Un livre tome 1', 'Autre livre tome 2', 'Sans numéro'].map(r);
    const { tomes, autres } = separerLesTomes(bruts);
    expect(tomes).toHaveLength(0);
    expect(autres).toHaveLength(3);
  });

  it('ne touche a rien quand aucun titre n-est numerote', () => {
    const bruts = ['Germinal', 'La Bête humaine', 'Nana'].map(r);
    const { tomes, autres } = separerLesTomes(bruts);
    expect(tomes).toHaveLength(0);
    expect(autres).toHaveLength(3);
  });

  it('supporte une liste vide', () => {
    expect(separerLesTomes([])).toEqual({ tomes: [], autres: [] });
    expect(separerLesTomes(null)).toEqual({ tomes: [], autres: [] });
  });
});

describe('Reperer une serie PRESSENTIE, pour la confirmer tout de suite', () => {
  /*
   * Retour d'usage 116 : le bloc « La serie, dans l'ordre » surgissait apres
   * deux defilements sur « game of thrones ». Mesure : sa premiere page ne
   * contient que DEUX tomes, noyes sous les essais qui PARLENT de la serie.
   */
  const r = (titre) => ({ cleSource: titre, titre });

  it('compte les tomes distincts, pas les livres', () => {
    expect(nombreDeTomes([r('S tome 1'), r('S tome 1 poche'), r('S tome 2')])).toBe(2);
    expect(nombreDeTomes([r('Germinal'), r('Nana')])).toBe(0);
    expect(nombreDeTomes([])).toBe(0);
  });

  it('DEUX tomes : on va confirmer — c-est le cas de Game of Thrones', () => {
    const page1 = [
      r('Game of Thrones : une métaphysique des meurtres'),
      r('Le livre des festins'),
      r('A Game of Thrones - La Bataille des rois - Tome 1'),
      r('Game of Thrones Tome 2'),
    ];
    expect(serieAConfirmer(page1)).toBe(true);
    // et le bloc ne s-affiche PAS encore : deux tomes ne font pas une serie.
    expect(separerLesTomes(page1).tomes).toHaveLength(0);
  });

  it('TROIS tomes : inutile de confirmer, le bloc s-affiche deja', () => {
    const page1 = [r('S tome 1'), r('S tome 2'), r('S tome 3')];
    expect(serieAConfirmer(page1)).toBe(false);
    expect(separerLesTomes(page1).tomes).toHaveLength(3);
  });

  it('ZERO ou UN tome : rien a confirmer, ce n-est pas une serie', () => {
    expect(serieAConfirmer([r('Germinal'), r('Nana')])).toBe(false);
    expect(serieAConfirmer([r('S tome 1'), r('Germinal')])).toBe(false);
  });
});

describe('Trier les resultats', () => {
  /*
   * Retour d'usage 120. Le tri se fait dans l'application : mesure du
   * 2026-08-26, `orderBy=newest` chez Google rend EXACTEMENT le meme ordre
   * que par defaut — memes titres, memes annees. Il ignore la consigne.
   */
  const l = (titre, date) => ({ cleSource: titre, titre, datePublication: date, annee: date });

  it('« pertinence » ne touche a rien : c-est l-ordre de la source', () => {
    const liste = [l('A', '1990'), l('B', '2020'), l('C', '2005')];
    expect(trierResultats(liste, 'pertinence').map((x) => x.titre)).toEqual(['A', 'B', 'C']);
  });

  it('« plus recent » met les editions actuelles en tete', () => {
    const liste = [l('A', '1990'), l('B', '2020'), l('C', '2005')];
    expect(trierResultats(liste, 'recent').map((x) => x.titre)).toEqual(['B', 'C', 'A']);
  });

  it('les livres SANS DATE vont a la fin, jamais en tete', () => {
    // Un livre non date n'est pas un livre recent : le mettre en premier
    // d'un tri « plus recent » serait trompeur.
    const liste = [l('sans date', null), l('recent', '2024'), l('vieux', '1950')];
    expect(trierResultats(liste, 'recent').map((x) => x.titre))
      .toEqual(['recent', 'vieux', 'sans date']);
  });

  it('lit l-annee dans une date complete', () => {
    const liste = [l('A', '1990-03-14'), l('B', '2020-01-02')];
    expect(trierResultats(liste, 'recent')[0].titre).toBe('B');
  });

  it('NE MODIFIE PAS la liste d-origine', () => {
    const liste = [l('A', '1990'), l('B', '2020')];
    trierResultats(liste, 'recent');
    expect(liste.map((x) => x.titre)).toEqual(['A', 'B']);
  });

  it('supporte une liste vide', () => {
    expect(trierResultats([], 'recent')).toEqual([]);
    expect(trierResultats(null, 'recent')).toEqual([]);
  });
});
