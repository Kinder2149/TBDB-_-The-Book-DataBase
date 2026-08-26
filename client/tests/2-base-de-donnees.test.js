/*
 * FAMILLE 2 — LA BASE DE DONNEES
 *
 * Ce que ces verifications protegent : ta bibliotheque. Ajouter un livre, le
 * retrouver apres relance, ne pas creer de doublon, ne pas laisser de ligne
 * orpheline quand on retire une oeuvre, et retrouver exactement la meme
 * bibliotheque apres une restauration de sauvegarde.
 *
 * La base tourne EN MEMOIRE (sql.js, le meme moteur que le navigateur) : rien
 * n'est ecrit sur le disque, chaque test repart d'une base vierge, et aucune
 * donnee reelle n'est touchee.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Le stockage navigateur n'existe pas sous Node : on le remplace par une
// simple Map. Cela suffit — ce qui nous interesse est le SQL, pas le stockage.
const faux = new Map();
vi.mock('idb-keyval', () => ({
  get: async (k) => faux.get(k),
  set: async (k, v) => { faux.set(k, v); },
  del: async (k) => { faux.delete(k); },
}));

/*
 * Le moteur SQL est le VRAI sql.js — on ne simule pas la base, sinon ces
 * verifications ne prouveraient rien. Seul le chemin du fichier .wasm change :
 * l'application le sert depuis une URL web (/assets/), qui n'existe pas sous
 * Node. On le pointe donc sur le fichier reel du paquet.
 */
vi.mock('sql.js', async () => {
  const vrai = await vi.importActual('sql.js');
  const { fileURLToPath } = await import('node:url');
  const chemin = fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url));
  return { default: (config = {}) => vrai.default({ ...config, locateFile: () => chemin }) };
});

// Capacitor n'existe pas non plus : on force la plateforme « web », qui est
// justement le moteur sql.js qu'on veut exercer.
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));

const api = await import('../src/api.js');
const store = await import('../src/store.js');

/** Un resultat de recherche, comme en rendrait une source. */
const resultat = (o = {}) => ({
  cleSource: 'gb:test1',
  source: 'google',
  titre: 'Dune',
  sousTitre: null,
  auteurs: ['Frank Herbert'],
  annee: '1965',
  datePublication: '1965',
  couvertureUrl: null,
  resume: null,
  categories: [],
  langue: 'fr',
  isbn13: '9782221252055',
  isbn10: null,
  nbPages: 800,
  editeur: 'Robert Laffont',
  ...o,
});

const identite = (o = {}) => ({
  oeuvreId: 'ol:OL893414W',
  resolue: true,
  cycleNom: null,
  cycleTome: null,
  nbPages: 800,
  couvertureUrl: null,
  ...o,
});

let profil;

beforeEach(async () => {
  faux.clear();
  await api.demarrer();
  profil = await api.getActiveProfileId();
  // Table rase entre deux verifications : on retire tout ce que le profil suit.
  const tout = await store.getBibliotheque(profil);
  for (const o of tout) await store.retirerOeuvre(profil, o.oeuvreId);
});

describe('Ouvrir la base', () => {
  it('cree un profil par defaut au premier demarrage', async () => {
    expect(profil).toBeTruthy();
    const profils = await api.listProfiles();
    expect(profils.length).toBeGreaterThanOrEqual(1);
  });

  it('applique les migrations et active les cles etrangeres', async () => {
    const etat = await api.etatBase();
    expect(etat.versionSchema).toBeGreaterThanOrEqual(2);
    // Sans elles, retirer une oeuvre laisserait ses editions orphelines.
    expect(etat.clesEtrangeres).toBe(true);
  });

  it('a bien toutes ses tables', async () => {
    const etat = await api.etatBase();
    ['profiles', 'oeuvres', 'editions', 'listes', 'liste_items', 'sessions_lecture']
      .forEach((t) => expect(etat.tables).toContain(t));
  });
});

describe('Ajouter un livre a la bibliotheque', () => {
  it('cree l-oeuvre ET son edition dans la meme operation (§3.1)', async () => {
    const id = await store.ajouterOeuvre(profil, resultat(), identite());
    const oeuvre = await store.getOeuvre(profil, id);
    expect(oeuvre.titre).toBe('Dune');

    // Une oeuvre n-existe JAMAIS sans au moins une edition — decision figee §9.
    const editions = await store.getEditions(profil, id);
    expect(editions).toHaveLength(1);
    expect(oeuvre.editionActive).toBeTruthy();
  });

  it('ajouter deux fois le meme livre ne cree pas de doublon', async () => {
    await store.ajouterOeuvre(profil, resultat(), identite());
    await store.ajouterOeuvre(profil, resultat(), identite());
    expect(await store.getBibliotheque(profil)).toHaveLength(1);
  });

  it('deux editions du meme texte tiennent dans UNE oeuvre', async () => {
    const id = await store.ajouterOeuvre(profil, resultat(), identite());
    await store.ajouterEdition(profil, id, resultat({ cleSource: 'gb:poche', nbPages: 912 }));

    expect(await store.getBibliotheque(profil)).toHaveLength(1);
    expect(await store.getEditions(profil, id)).toHaveLength(2);
  });

  it('retirer une oeuvre emporte ses editions (aucun orphelin)', async () => {
    const id = await store.ajouterOeuvre(profil, resultat(), identite());
    await store.ajouterEdition(profil, id, resultat({ cleSource: 'gb:poche' }));
    await store.retirerOeuvre(profil, id);

    expect(await store.getBibliotheque(profil)).toHaveLength(0);
    expect(await store.getEditions(profil, id)).toHaveLength(0);
  });
});

describe('Promouvoir une identite trouvee apres coup', () => {
  // C'est ce qui permet d'ajouter un livre INSTANTANEMENT : il entre sous une
  // identite locale, et la vraie cle arrive plus tard, en tache de fond.
  it('remplace la cle locale par la cle Open Library sans rien perdre', async () => {
    const locale = identite({ oeuvreId: 'fp:dune|frank-herbert', resolue: false });
    const id = await store.ajouterOeuvre(profil, resultat(), locale);
    await store.setStatut(profil, id, 'en_cours', '2026-08-25');

    const change = await store.promouvoirIdentite(profil, id, 'ol:OL893414W', {
      cycleNom: 'Dune', cycleTome: 1,
    });

    expect(change).toBe(true);
    expect(await store.getOeuvre(profil, id)).toBeFalsy();       // l-ancienne cle a disparu
    const promue = await store.getOeuvre(profil, 'ol:OL893414W');
    expect(promue.statut).toBe('en_cours');                       // le statut a suivi
    expect(promue.cycleNom).toBe('Dune');
    expect(await store.getEditions(profil, 'ol:OL893414W')).toHaveLength(1); // l-edition aussi
  });

  it('fusionne au lieu de creer un doublon si la cible existe deja', async () => {
    await store.ajouterOeuvre(profil, resultat({ cleSource: 'gb:vo' }), identite());
    const locale = identite({ oeuvreId: 'fp:dune|frank-herbert', resolue: false });
    const id = await store.ajouterOeuvre(profil, resultat({ cleSource: 'gb:fr' }), locale);

    await store.promouvoirIdentite(profil, id, 'ol:OL893414W', {});

    expect(await store.getBibliotheque(profil)).toHaveLength(1);
    expect(await store.getEditions(profil, 'ol:OL893414W')).toHaveLength(2);
  });

  it('ne fait rien si le livre a ete retire entre-temps', async () => {
    const r = await store.promouvoirIdentite(profil, 'fp:inexistant', 'ol:X', {});
    expect(r).toBe(false);
  });
});

describe('Statuts, notes et progression', () => {
  let id;
  beforeEach(async () => { id = await store.ajouterOeuvre(profil, resultat(), identite()); });

  it('enregistre le statut et sa date', async () => {
    await store.setStatut(profil, id, 'lu', '2026-08-25');
    expect((await store.getOeuvre(profil, id)).statut).toBe('lu');
  });

  it('enregistre la position de lecture', async () => {
    await store.setPosition(profil, id, 210);
    expect((await store.getOeuvre(profil, id)).position).toBe(210);
  });

  it('refuse une position negative', async () => {
    await store.setPosition(profil, id, -50);
    expect((await store.getOeuvre(profil, id)).position).toBe(0);
  });

  it('enregistre une note', async () => {
    await store.setNote(profil, id, 4);
    expect((await store.getOeuvre(profil, id)).note).toBe(4);
  });

  it('corriger la pagination de l-edition prend effet', async () => {
    const [edition] = await store.getEditions(profil, id);
    await store.setMetrique(profil, edition.editionId, { nbPages: 912 });
    expect((await store.getEditions(profil, id))[0].nbPages).toBe(912);
  });

  it('enregistre une couverture choisie a la main', async () => {
    const image = 'data:image/jpeg;base64,AAAA';
    await store.setCouverture(profil, id, image);
    expect((await store.getOeuvre(profil, id)).couvertureUrl).toBe(image);
  });
});

describe('Listes personnalisees', () => {
  /*
   * A noter : `createListe` rend le NOM de la liste, pas son identifiant,
   * alors que `addToListe` et `deleteListe` attendent un identifiant. On passe
   * donc par `getListes()`. Incoherence relevee lors de l'ecriture de ces
   * verifications, sans consequence a l'usage mais notee au PROJET_CONTEXTE.
   */
  const creerListe = async (nom) => {
    await store.createListe(profil, nom);
    const listes = await store.getListes(profil);
    return listes.find((l) => l.name === nom).id;
  };

  it('cree une liste, y range un livre, l-en retire', async () => {
    const id = await store.ajouterOeuvre(profil, resultat(), identite());
    const liste = await creerListe('À lire cet été');

    await store.addToListe(profil, liste, id);
    expect(await store.getListeItems(profil, liste)).toHaveLength(1);

    await store.removeFromListe(profil, liste, id);
    expect(await store.getListeItems(profil, liste)).toHaveLength(0);
  });

  it('supprimer un livre le retire aussi des listes', async () => {
    const id = await store.ajouterOeuvre(profil, resultat(), identite());
    const liste = await creerListe('Test');
    await store.addToListe(profil, liste, id);

    await store.retirerOeuvre(profil, id);
    expect(await store.getListeItems(profil, liste)).toHaveLength(0);
  });
});

describe('Cloisonnement entre profils', () => {
  it('un profil ne voit pas les livres d-un autre', async () => {
    const autre = (await store.createProfile('Quelqu-un d-autre')).id;
    await store.ajouterOeuvre(profil, resultat(), identite());

    expect(await store.getBibliotheque(profil)).toHaveLength(1);
    expect(await store.getBibliotheque(autre)).toHaveLength(0);
  });
});

describe('La couverture suit l-edition active', () => {
  /*
   * Retour d'usage 111 : « le fait de changer l'edition ne prenait pas en
   * compte le changement de l'image de couverture ». La pagination suivait,
   * l'image non — elle venait toujours de l'oeuvre.
   */
  const avecImage = (cle, url) => resultat({ cleSource: cle, couvertureUrl: url });

  it('changer d-edition change l-image affichee', async () => {
    const id = await store.ajouterOeuvre(profil, avecImage('gb:a', 'https://img/a.jpg'), identite());
    await store.ajouterEdition(profil, id, avecImage('gb:b', 'https://img/b.jpg'));

    let [livre] = await store.getBibliotheque(profil);
    expect(livre.couvertureUrl).toBe('https://img/a.jpg');

    const editions = await store.getEditions(profil, id);
    const autre = editions.find((e) => e.editionId === 'gb:b');
    await store.setEditionActive(profil, id, autre.editionId);

    [livre] = await store.getBibliotheque(profil);
    expect(livre.couvertureUrl).toBe('https://img/b.jpg');
  });

  it('une edition SANS image retombe sur celle de l-oeuvre', async () => {
    // C'est le cas des editions venues de la BnF : elle n'en fournit aucune.
    const id = await store.ajouterOeuvre(profil, avecImage('gb:a', 'https://img/a.jpg'), identite());
    await store.ajouterEdition(profil, id, avecImage('bnf:x', null));

    const editions = await store.getEditions(profil, id);
    await store.setEditionActive(profil, id, editions.find((e) => e.editionId === 'bnf:x').editionId);

    const [livre] = await store.getBibliotheque(profil);
    expect(livre.couvertureUrl).toBe('https://img/a.jpg');
  });

  it('une PHOTO PRISE A LA MAIN l-emporte toujours (§9)', async () => {
    // « Une donnee corrigee a la main n'est jamais ecrasee par une lecture
    // automatique » : la photo de l'utilisateur passe avant toute edition.
    const id = await store.ajouterOeuvre(profil, avecImage('gb:a', 'https://img/a.jpg'), identite());
    await store.ajouterEdition(profil, id, avecImage('gb:b', 'https://img/b.jpg'));
    await store.setCouverture(profil, id, 'data:image/jpeg;base64,MAPHOTO');

    const editions = await store.getEditions(profil, id);
    await store.setEditionActive(profil, id, editions.find((e) => e.editionId === 'gb:b').editionId);

    const [livre] = await store.getBibliotheque(profil);
    expect(livre.couvertureUrl).toBe('data:image/jpeg;base64,MAPHOTO');
  });

  it('la fiche d-une oeuvre suit la meme regle que la grille', async () => {
    const id = await store.ajouterOeuvre(profil, avecImage('gb:a', 'https://img/a.jpg'), identite());
    await store.ajouterEdition(profil, id, avecImage('gb:b', 'https://img/b.jpg'));
    const editions = await store.getEditions(profil, id);
    await store.setEditionActive(profil, id, editions.find((e) => e.editionId === 'gb:b').editionId);

    const oeuvre = await store.getOeuvre(profil, id);
    expect(oeuvre.couvertureUrl).toBe('https://img/b.jpg');
  });
});
