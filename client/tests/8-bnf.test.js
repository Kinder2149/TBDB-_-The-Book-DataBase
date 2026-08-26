/*
 * FAMILLE 8 — LE FILET BnF
 *
 * Ajoutee le 2026-08-25 apres mise en cause du choix des sources : « j'ai
 * l'impression qu'il est limite, pas complet ».
 *
 * Google n'est pas incomplet, il est INSTABLE : 4 recherches sur 6 abouties
 * ce soir-la, 1 sur 6 deux heures plus tot. Le catalogue de la Bibliotheque
 * nationale de France a repondu 10 fois sur 10 puis 6 fois sur 6, sans cle ni
 * quota. Il prend donc le relais quand Google tombe.
 *
 * Les extraits XML ci-dessous sont des notices REELLES, raccourcies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const faux = new Map();
vi.mock('idb-keyval', () => ({
  get: async (k) => faux.get(k),
  set: async (k, v) => { faux.set(k, v); },
  del: async (k) => { faux.delete(k); },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));

/** Une reponse SRU credible, calquee sur les notices reelles de la BnF. */
const notice = ({ titre, auteur, date, editeur, isbn, langue = 'fre', collection }) => `
<srw:record><srw:recordData><oai_dc:dc xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${titre}</dc:title>
  ${auteur ? `<dc:creator>${auteur}</dc:creator>` : ''}
  <dc:date>${date}</dc:date>
  ${editeur ? `<dc:publisher>${editeur}</dc:publisher>` : ''}
  <dc:identifier>http://catalogue.bnf.fr/ark:/12148/cb${Math.random().toString().slice(2, 11)}</dc:identifier>
  ${isbn ? `<dc:identifier>ISBN ${isbn}</dc:identifier>` : ''}
  <dc:language>${langue}</dc:language>
  ${collection ? `<dc:description>Collection : ${collection}</dc:description>` : ''}
  <dc:type>text</dc:type>
</oai_dc:dc></srw:recordData></srw:record>`;

const reponseSru = (notices) => `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
<srw:numberOfRecords>${notices.length}</srw:numberOfRecords>
<srw:records>${notices.join('')}</srw:records></srw:searchRetrieveResponse>`;

const LES_FOURMIS = notice({
  titre: 'Les fourmis : roman / Bernard Werber',
  auteur: 'Werber, Bernard (1961-....). Auteur du texte',
  date: '1991',
  editeur: 'Albin Michel (Paris)',
  isbn: '2-226-05257-7',
});

beforeEach(() => { faux.clear(); vi.resetModules(); });

describe('Convertir un ISBN-13 en ISBN-10', () => {
  it('la conversion est exacte — la BnF ne repond qu-a cette forme', async () => {
    // Verifie sur appels reels : « 9782226052575 » ne rend RIEN a la BnF,
    // « 2226052577 » rend Les Fourmis.
    const { isbn13Vers10 } = await import('../src/sources/bnf.js');
    expect(isbn13Vers10('9782226052575')).toBe('2226052577');
    expect(isbn13Vers10('9782070612888')).toBe('2070612880');
    expect(isbn13Vers10('9782221252055')).toBe('2221252055');
  });

  it('sait produire une cle de controle X', async () => {
    const { isbn13Vers10 } = await import('../src/sources/bnf.js');
    expect(isbn13Vers10('9782744131929')).toBe('274413192X');
  });

  it('refuse ce qui n-est pas un ISBN-13 en 978', async () => {
    const { isbn13Vers10 } = await import('../src/sources/bnf.js');
    expect(isbn13Vers10('9792226052575')).toBeNull();   // prefixe 979
    expect(isbn13Vers10('2226052577')).toBeNull();      // deja en 10
    expect(isbn13Vers10('')).toBeNull();
    expect(isbn13Vers10(null)).toBeNull();
  });
});

describe('Lire une notice de la BnF', () => {
  it('nettoie le titre de ses mentions de responsabilite', async () => {
    vi.stubGlobal('fetch', async () => new Response(reponseSru([LES_FOURMIS]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('fourmis');
    // « Les fourmis : roman / Bernard Werber » -> le titre seul.
    expect(livre.titre).toBe('Les fourmis : roman');
    vi.unstubAllGlobals();
  });

  it('remet l-auteur dans l-ordre et retire ses dates', async () => {
    vi.stubGlobal('fetch', async () => new Response(reponseSru([LES_FOURMIS]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('fourmis');
    // « Werber, Bernard (1961-....). Auteur du texte » -> « Bernard Werber »
    expect(livre.auteurs[0]).toBe('Bernard Werber');
    vi.unstubAllGlobals();
  });

  it('gere une date ouverte, qui avait casse la premiere version', async () => {
    // « (1949-.... » sans parenthese fermante rendait « Gilbert (1949- Millet ».
    const abime = notice({ titre: 'Étude / X', auteur: 'Millet, Gilbert (1949-....', date: '2007' });
    vi.stubGlobal('fetch', async () => new Response(reponseSru([abime]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('etude');
    expect(livre.auteurs[0]).toBe('Gilbert Millet');
    vi.unstubAllGlobals();
  });

  it('lit l-annee, l-editeur, l-ISBN et la langue', async () => {
    vi.stubGlobal('fetch', async () => new Response(reponseSru([LES_FOURMIS]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('fourmis');
    expect(livre.annee).toBe('1991');
    expect(livre.editeur).toBe('Albin Michel');
    expect(livre.isbn10).toBe('2226052577');
    expect(livre.langue).toBe('fr');
    expect(livre.source).toBe('bnf');
    vi.unstubAllGlobals();
  });

  it('n-annonce JAMAIS de couverture — elle n-en fournit pas', async () => {
    vi.stubGlobal('fetch', async () => new Response(reponseSru([LES_FOURMIS]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('fourmis');
    expect(livre.couvertureUrl).toBeNull();
    vi.unstubAllGlobals();
  });

  it('survit a une notice sans auteur ni editeur', async () => {
    const nue = notice({ titre: '600 autocollants Astérix', date: '2012' });
    vi.stubGlobal('fetch', async () => new Response(reponseSru([nue]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    const [livre] = await bnf.rechercherParTitre('asterix');
    expect(livre.titre).toBe('600 autocollants Astérix');
    expect(livre.auteurs).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('rend une liste vide, sans erreur, quand la BnF ne connait rien', async () => {
    vi.stubGlobal('fetch', async () => new Response(reponseSru([]), { status: 200 }));
    const bnf = await import('../src/sources/bnf.js');
    expect(await bnf.rechercherParTitre('zzz')).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('La BnF prend le relais quand Google tombe', () => {
  it('une recherche par titre aboutit malgre une panne totale de Google', async () => {
    vi.stubGlobal('fetch', async (url) => (String(url).includes('googleapis')
      ? new Response('{"error":{"code":503}}', { status: 503 })
      : new Response(reponseSru([LES_FOURMIS]), { status: 200 })));

    const books = await import('../src/books.js');
    const r = await books.rechercher('les fourmis', 'titre');

    expect(r.resultats).toHaveLength(1);
    expect(r.resultats[0].source).toBe('bnf');
    expect(r.ancien).toBe(false);        // ce sont de VRAIS resultats, pas l-archive
    vi.unstubAllGlobals();
  });

  it('un ISBN inconnu de Google est rattrape par la BnF', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const u = String(url);
      if (u.includes('googleapis')) return new Response(JSON.stringify({ totalItems: 0 }), { status: 200 });
      if (u.includes('openlibrary')) return new Response('null', { status: 404 });
      return new Response(reponseSru([LES_FOURMIS]), { status: 200 });
    });

    const books = await import('../src/books.js');
    const r = await books.rechercher('9782226052575', 'isbn');

    expect(r.resultats).toHaveLength(1);
    expect(r.resultats[0].source).toBe('bnf');
    // L'ISBN rendu est celui du code-barres scanne, pas celui de la notice.
    expect(r.resultats[0].isbn13).toBe('9782226052575');
    vi.unstubAllGlobals();
  });

  it('si les DEUX sources tombent, l-erreur remonte comme avant', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    const books = await import('../src/books.js');
    await expect(books.rechercher('rien du tout', 'titre')).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it('quand Google repond, la BnF n-est PAS appelee', async () => {
    // Sa pertinence est moins bonne : elle ne doit jamais passer devant.
    const appels = [];
    vi.stubGlobal('fetch', async (url) => {
      appels.push(String(url));
      return new Response(JSON.stringify({
        items: [{ id: 'v1', volumeInfo: { title: 'Germinal', authors: ['Émile Zola'] } }],
      }), { status: 200 });
    });

    const books = await import('../src/books.js');
    const r = await books.rechercher('germinal', 'titre');

    expect(r.resultats[0].source).toBe('google');
    expect(appels.some((u) => u.includes('bnf.fr'))).toBe(false);
    vi.unstubAllGlobals();
  });
});
