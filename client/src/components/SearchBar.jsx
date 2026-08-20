/*
 * SearchBar.jsx — champ de recherche et sélecteur de mode.
 * Applique §4.1 : minimum 3 caractères, debounce 350 ms — le quota Google est
 * de 1 000 requêtes par jour partagées par tous les porteurs de la clé.
 * Exception §4.1 : en mode ISBN, PAS de debounce et pas de minimum — on lance
 * dès que 10 ou 13 chiffres sont saisis, parce qu'un ISBN n'a qu'une seule
 * forme valide et qu'attendre n'apporte rien.
 * Piège évité : le projet séries affiche un émoji loupe en dur alors que
 * Icon.jsx existe précisément parce que les émojis se rendent en carré vide.
 */

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const MODES = [
  { cle: 'titre', libelle: 'Titre' },
  { cle: 'auteur', libelle: 'Auteur' },
  { cle: 'isbn', libelle: 'ISBN' },
];

const MINIMUM_CARACTERES = 3;
const DEBOUNCE_MS = 350;

const PLACEHOLDERS = {
  titre: 'Un titre de livre',
  auteur: 'Un nom d’auteur',
  isbn: 'Les 13 chiffres au dos du livre',
};

export default function SearchBar({ mode, onChangerMode, onRechercher, onVider, onScanner, scanPossible }) {
  const [valeur, setValeur] = useState('');
  const rappel = useRef(onRechercher);
  rappel.current = onRechercher;
  const rappelVide = useRef(onVider);
  rappelVide.current = onVider;

  useEffect(() => {
    const texte = valeur.trim();

    /*
     * Champ vidé = retour à l'écran d'accueil, donc aux suggestions. Sans
     * cela, l'écran restait bloqué sur « Aucun livre trouvé » ou sur les
     * derniers résultats, et la section « Pour toi » ne revenait JAMAIS une
     * fois la première recherche lancée — c'est ce qui la rendait invisible.
     */
    if (texte.length === 0) { rappelVide.current(); return undefined; }

    if (mode === 'isbn') {
      const chiffres = texte.replace(/[^0-9Xx]/g, '');
      if (chiffres.length === 10 || chiffres.length === 13) rappel.current(chiffres, 'isbn');
      return undefined;
    }

    if (texte.length < MINIMUM_CARACTERES) return undefined;

    const minuteur = setTimeout(() => rappel.current(texte, mode), DEBOUNCE_MS);
    return () => clearTimeout(minuteur);
  }, [valeur, mode]);

  return (
    <div className="recherche__barre">
      <div className="champ">
        <Icon name="recherche" size={20} className="champ__icone" />
        <input
          className="champ__saisie"
          type={mode === 'isbn' ? 'tel' : 'search'}
          inputMode={mode === 'isbn' ? 'numeric' : 'search'}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          placeholder={PLACEHOLDERS[mode]}
          aria-label="Recherche"
          autoComplete="off"
        />
        {valeur ? (
          <button
            type="button"
            className="champ__vider"
            onClick={() => { setValeur(''); rappelVide.current(); }}
            aria-label="Vider la recherche"
          >
            <Icon name="fermer" size={18} />
          </button>
        ) : null}
        {/* §6 : le scan est A DROITE du champ. Il n'apparait que la ou il
            existe — au navigateur il n'y a pas de camera a interroger. */}
        {scanPossible ? (
          <button
            type="button"
            className="champ__scan"
            onClick={onScanner}
            aria-label="Scanner le code-barres d'un livre"
          >
            <Icon name="scan" size={20} />
          </button>
        ) : null}
      </div>

      {/* Changer de mode relance la recherche sans retaper : le useEffect
          ci-dessus dépend aussi de `mode`. */}
      <div className="seg" role="group" aria-label="Mode de recherche">
        {MODES.map((m) => (
          <button
            key={m.cle}
            type="button"
            className={`seg__item${mode === m.cle ? ' on' : ''}`}
            onClick={() => onChangerMode(m.cle)}
            aria-pressed={mode === m.cle}
          >
            {m.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}
