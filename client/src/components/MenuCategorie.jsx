/*
 * MenuCategorie.jsx — le choix de categorie qui apparait sur un appui long.
 *
 * Retour d'usage 83 : « je n'ai pas d'appui long sur un livre pour choisir la
 * categorie, je suis oblige d'aller sur sa page ». Depuis l'ecran de
 * recherche, choisir ici AJOUTE le livre et lui pose son statut d'un seul
 * geste — le detour par la fiche n'etait pas une etape utile, c'etait un
 * passage oblige.
 *
 * Extrait de `Recherche.jsx` le 2026-08-25.
 */

import Modal from './Modal.jsx';
import { LIBELLES, STATUTS, classeStatut } from '../status.js';

export default function MenuCategorie({ titre, statutActuel, onChoisir, onFermer }) {
  return (
    <Modal titre={titre} onFermer={onFermer}>
      <p className="hint">Dans quelle catégorie veux-tu le ranger ?</p>
      <div className="statuts">
        {STATUTS.map((st) => (
          <button
            key={st}
            type="button"
            className={`statbtn ${classeStatut(st)}${statutActuel === st ? ' is-active' : ''}`}
            onClick={() => onChoisir(st)}
          >
            <span className="statbtn__led" />
            <span>{LIBELLES[st]}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
