/*
 * FAMILLE 4 — LES PARCOURS COMPLETS
 *
 * Les familles 1 a 3 verifient des pieces. Celle-ci verifie des PARCOURS :
 * ce que fait vraiment un utilisateur, du premier geste au resultat affiche.
 *
 * Ecrite le 2026-08-25 apres un retour d'usage : « je scan un livre, il le
 * reconnait, je l'ajoute, je reviens dans ma bibliotheque il n'est plus la ».
 * Aucune verification des trois premieres familles n'aurait pu attraper cela :
 * elles regardaient `store.js` en direct, jamais l'enchainement complet de la
 * facade avec sa tache de fond.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const faux = new Map();
vi.mock('idb-keyval', () => ({
  get: async (k) => faux.get(k),
  set: async (k, v) => { faux.set(k, v); },
  del: async (k) => { faux.delete(k); },
}));
vi.mock('sql.js', async () => {
  const vrai = await vi.importActual('sql.js');
  const { fileURLToPath } = await import('node:url');
  const chemin = fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url));
  return { default: (config = {}) => vrai.default({ ...config, locateFile: () => chemin }) };
});
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));

const api = await import('../src/api.js');
const store = await import('../src/store.js');

/** Le resultat que rend Google pour un livre scanne. */
const livreScanne = (o = {}) => ({
  cleSource: 'gb:scan1',
  source: 'google',
  titre: 'Les Fourmis',
  sousTitre: null,
  auteurs: ['Bernard Werber'],
  annee: '1991',
  datePublication: '1991',
  couvertureUrl: null,
  resume: null,
  categories: [],
  langue: 'fr',
  isbn13: '9782226052575',
  isbn10: null,
  nbPages: 300,
  editeur: 'Albin Michel',
  ...o,
});

/** Laisse la tache de fond se terminer. */
const respirer = () => new Promise((r) => setTimeout(r, 150));

let profil;

beforeEach(async () => {
  faux.clear();
  await api.demarrer();
  profil = await api.getActiveProfileId();
  for (const o of await store.getBibliotheque(profil)) {
    await store.retirerOeuvre(profil, o.oeuvreId);
  }
});

describe('Scanner un livre, l-ajouter, revenir dans sa bibliotheque', () => {
  it('LE LIVRE EST TOUJOURS LA quand l-identification reussit en tache de fond', async () => {
    // Open Library repond, et donne une cle d'oeuvre differente de l'empreinte
    // locale sous laquelle le livre est entre. C'est le cas NORMAL.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      works: [{ key: '/works/OL1234W' }],
      key: '/books/OL9M',
      number_of_pages: 300,
    }), { status: 200 }));

    const id = await api.ajouterOeuvre(livreScanne());
    expect(await api.getBibliotheque()).toHaveLength(1);

    await respirer();   // la promotion d'identite s'execute ici

    const apres = await api.getBibliotheque();
    expect(apres).toHaveLength(1);
    expect(apres[0].titre).toBe('Les Fourmis');
    vi.unstubAllGlobals();
  });

  it('le livre garde son edition, donc son format et sa pagination', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      works: [{ key: '/works/OL1234W' }], key: '/books/OL9M', number_of_pages: 300,
    }), { status: 200 }));

    await api.ajouterOeuvre(livreScanne());
    await respirer();

    const [livre] = await api.getBibliotheque();
    expect(livre.editionActive).toBeTruthy();
    expect(livre.nbPages).toBe(300);
    vi.unstubAllGlobals();
  });

  it('LE LIVRE EST TOUJOURS LA quand Open Library ne repond pas', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('reseau coupe'); });

    await api.ajouterOeuvre(livreScanne());
    await respirer();

    expect(await api.getBibliotheque()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('ajouter le meme livre deux fois de suite n-en laisse qu-un', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      works: [{ key: '/works/OL1234W' }], key: '/books/OL9M',
    }), { status: 200 }));

    await api.ajouterOeuvre(livreScanne());
    await respirer();
    await api.ajouterOeuvre(livreScanne());
    await respirer();

    expect(await api.getBibliotheque()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('le statut pose juste apres l-ajout survit a la promotion d-identite', async () => {
    // C'est le parcours de l'appui long : ajouter PUIS ranger dans une
    // categorie, pendant que la tache de fond travaille encore.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      works: [{ key: '/works/OL1234W' }], key: '/books/OL9M',
    }), { status: 200 }));

    const id = await api.ajouterOeuvre(livreScanne());
    await api.setStatut(id, 'en_cours');
    await respirer();

    const [livre] = await api.getBibliotheque();
    expect(livre.statut).toBe('en_cours');
    vi.unstubAllGlobals();
  });

  it('la progression saisie juste apres l-ajout n-est pas perdue', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      works: [{ key: '/works/OL1234W' }], key: '/books/OL9M',
    }), { status: 200 }));

    const id = await api.ajouterOeuvre(livreScanne());
    await api.setPosition(id, 42);
    await respirer();

    const [livre] = await api.getBibliotheque();
    expect(livre.position).toBe(42);
    vi.unstubAllGlobals();
  });
});

describe('Deux livres differents ne se confondent pas', () => {
  it('deux tomes d-une meme serie restent deux livres', async () => {
    vi.stubGlobal('fetch', async () => new Response('null', { status: 404 }));

    await api.ajouterOeuvre(livreScanne({ cleSource: 'gb:t1', titre: 'Les Fourmis' }));
    await api.ajouterOeuvre(livreScanne({ cleSource: 'gb:t2', titre: 'Le Jour des fourmis' }));
    await respirer();

    expect(await api.getBibliotheque()).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
