/*
 * FAMILLE 7 — REMETTRE UNE SAGA DANS L'ORDRE
 *
 * Retour d'usage 101 : « j'ai une saga de 5 tomes a la maison, il n'en voit
 * qu'un ». Les tomes etaient bien la, mais melanges et noyes. Les cas
 * ci-dessous viennent tous de titres REELS rendus par Google.
 */

import { describe, it, expect } from 'vitest';
import { numeroDeTome, separerLesTomes } from '../src/tomes.js';

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
