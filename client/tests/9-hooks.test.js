/*
 * FAMILLE 9 — LES HOOKS SONT DECLARES AVANT TOUT RETOUR
 *
 * Regle universelle de React, et piege reel du 2026-08-26 : un `useState`
 * avait ete place APRES le `if (sousModale) { return ... }` de `Detail.jsx`.
 * Le hook n'etait donc jamais initialise quand une sous-modale s'ouvrait, et
 * l'ecran mourait sur « Cannot access 'propositions' before initialization ».
 *
 * Ni le build, ni les 141 verifications, ni le rendu d'un ecran ne pouvaient
 * le voir : il faut OUVRIR la sous-modale pour l'atteindre. Ce controle lit
 * donc le code lui-meme. C'est grossier, mais cela couvre exactement le trou
 * — et c'est la deuxieme fois qu'une insertion mal placee coute une version.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HOOK = /\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/;

/** Tous les composants et ecrans du projet. */
function fichiersJsx() {
  const racine = fileURLToPath(new URL('../src/', import.meta.url));
  const dans = (dossier) => readdirSync(join(racine, dossier))
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => [join(dossier, f), join(racine, dossier, f)]);
  return [
    ...dans('components'),
    ...dans('screens'),
    ['App.jsx', join(racine, 'App.jsx')],
  ];
}

describe('Aucun hook apres un retour anticipe', () => {
  it('dans tous les composants et ecrans', () => {
    const fautifs = [];
    const fichiers = fichiersJsx();

    /*
     * Garde-fou : un controle qui n'analyse RIEN passe toujours. La premiere
     * version de cette verification etait dans ce cas et laissait filer le bug
     * qu'elle etait censee attraper.
     */
    expect(fichiers.length).toBeGreaterThan(10);

    for (const [nom, chemin] of fichiers) {
      const lignes = readFileSync(chemin, 'utf8').split('\n');

      /*
       * Un retour anticipe de PREMIER NIVEAU : deux espaces d'indentation, un
       * `if (` dont le corps contient un `return`. On ignore `return (` seul,
       * qui est le rendu final du composant.
       */
      let premierRetour = -1;
      for (let i = 0; i < lignes.length; i += 1) {
        if (!/^ {2}if \(/.test(lignes[i])) continue;
        const corps = lignes.slice(i, i + 60).join('\n');
        // `return` a n'importe quelle profondeur : dans Detail.jsx il est
        // imbrique dans un second `if`, donc a six espaces et non quatre.
        if (/\n {4,}return[ (]/.test(corps)) { premierRetour = i; break; }
      }
      if (premierRetour === -1) continue;

      for (let j = premierRetour + 1; j < lignes.length; j += 1) {
        const l = lignes[j];
        if (/^ {2}const .*=/.test(l) && HOOK.test(l)) {
          fautifs.push(`${nom}:${j + 1} — ${l.trim().slice(0, 64)}`);
        }
      }
    }

    // Le message d'echec nomme le fichier et la ligne : on sait quoi remonter.
    expect(fautifs).toEqual([]);
  });

  it('le controle sait reperer un hook mal place', () => {
    // On verifie que la regle mord vraiment, sur un extrait fabrique.
    const extrait = [
      'export default function Faux() {',
      '  const [a, setA] = useState(1);',
      '  if (a) {',
      '    return <div />;',
      '  }',
      '  const [b, setB] = useState(2);',
      '  return <span />;',
      '}',
    ];
    let premierRetour = -1;
    for (let i = 0; i < extrait.length; i += 1) {
      if (!/^ {2}if \(/.test(extrait[i])) continue;
      if (/\n {4}return /.test(extrait.slice(i, i + 60).join('\n'))) { premierRetour = i; break; }
    }
    const apres = extrait.slice(premierRetour + 1)
      .filter((l) => /^ {2}const .*=/.test(l) && HOOK.test(l));

    expect(premierRetour).toBeGreaterThan(-1);
    expect(apres).toHaveLength(1);
  });
});
