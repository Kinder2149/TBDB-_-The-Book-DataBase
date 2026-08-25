/*
 * CreationManuelle.jsx — creer un livre a la main, quand aucun catalogue ne le
 * connait. Mesure du 2026-08-20 : sur huit ISBN francais testes, TROIS sont
 * absents de Google ET d'Open Library (§3.2 — « les vieux fonds,
 * l'autoedition et les livres non catalogues »).
 *
 * Extrait de `Recherche.jsx` le 2026-08-25.
 * Seul le titre est obligatoire : exiger davantage ferait renoncer, alors que
 * le reste se complete depuis la fiche, plus tard, quand on veut.
 */

import Modal from './Modal.jsx';

const CHAMPS = [
  ['titre', 'Titre du livre'],
  ['auteurs', 'Auteur'],
  ['annee', 'Année'],
  ['isbn13', 'ISBN (facultatif)'],
  ['nbPages', 'Nombre de pages'],
];

const NUMERIQUES = new Set(['annee', 'nbPages', 'isbn13']);

export default function CreationManuelle({ saisie, onChange, onValider, onFermer }) {
  return (
    <Modal
      titre="Ajouter un livre à la main"
      onFermer={onFermer}
      actions={(
        <>
          <button type="button" className="btn btn--fantome" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn btn--primaire" onClick={onValider}>
            Ajouter
          </button>
        </>
      )}
    >
      <p className="hint">
        Seul le titre est obligatoire. Le reste se complète depuis la fiche,
        quand tu veux.
      </p>
      {CHAMPS.map(([champ, libelle]) => (
        <input
          key={champ}
          className="champ__saisie champ__saisie--encadre"
          value={saisie[champ]}
          onChange={(e) => onChange(champ, e.target.value)}
          placeholder={libelle}
          aria-label={libelle}
          inputMode={NUMERIQUES.has(champ) ? 'numeric' : 'text'}
          autoFocus={champ === 'titre'}
        />
      ))}
    </Modal>
  );
}
