/*
 * BookCard.jsx — une carte de la grille : couverture, titre, auteur, année.
 * Applique §6 : format 2:3, grille 3 colonnes sur téléphone, chargement
 * paresseux, liseré de couleur du statut, et APPUI LONG pour changer de statut.
 * Deux actions rapides, sans ouvrir la fiche :
 *  - un bouton « + » en coin d'affiche sur les cartes de recherche ;
 *  - l'appui long sur les cartes de bibliothèque.
 * Piège évité : Google n'illustre que 65 % des résultats (mesuré sur 100) — le
 * repli textuel est le cas courant, et une couverture Open Library peut rendre
 * un 404, d'où le traitement de l'erreur d'image.
 */

import { useRef, useState } from 'react';
import { classeStatut } from '../status.js';
import Icon from './Icon.jsx';

const APPUI_LONG_MS = 450;
const TOLERANCE_PX = 12;

/*
 * DEUX formes entrent dans cette carte, et c'est voulu : un ResultatRecherche
 * porte `auteurs` en TABLEAU, une Oeuvre le porte en CHAÎNE « A, B » (§7,
 * types.js). Un seul test suffit, mais il doit être explicite.
 */
function premierAuteur(auteurs) {
  if (Array.isArray(auteurs)) return auteurs[0] || null;
  if (typeof auteurs === 'string') return auteurs.split(',')[0].trim() || null;
  return null;
}

export default function BookCard({
  resultat, suivi, marque, raison, onOuvrir, onAppuiLong, onAjoutRapide, ajoutEnCours,
}) {
  const minuteur = useRef(null);
  const longDetecte = useRef(false);
  const depart = useRef(null);
  const [imageCassee, setImageCassee] = useState(false);

  /*
   * L'appui long s'annulait au moindre mouvement du doigt : `onPointerLeave`
   * se déclenche dès que le contact glisse d'un pixel hors du bouton, et un
   * doigt posé sur un téléphone bouge toujours un peu. D'où une tolérance de
   * 12 pixels, et une annulation sur le MOUVEMENT plutôt que sur la sortie —
   * au-delà, c'est un défilement, pas un appui.
   */
  const demarrer = (e) => {
    /*
     * `!suivi` bloquait le geste sur l'ecran de RECHERCHE, ou un livre n'a pas
     * encore de statut. Retour d'usage 83 : c'est justement la qu'il sert le
     * plus — appuyer longuement sur un resultat l'ajoute directement dans la
     * bonne categorie, sans passer par sa fiche. La condition ne porte donc
     * plus que sur la presence d'un gestionnaire : c'est l'ecran qui decide
     * s'il y a quelque chose a faire, pas la carte.
     */
    if (!onAppuiLong) return;
    longDetecte.current = false;
    depart.current = { x: e.clientX, y: e.clientY };
    minuteur.current = setTimeout(() => {
      longDetecte.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      onAppuiLong(suivi || resultat);
    }, APPUI_LONG_MS);
  };

  const bouger = (e) => {
    if (!minuteur.current || !depart.current) return;
    const dx = Math.abs(e.clientX - depart.current.x);
    const dy = Math.abs(e.clientY - depart.current.y);
    if (dx > TOLERANCE_PX || dy > TOLERANCE_PX) arreter();
  };

  const arreter = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  const cliquer = () => {
    // Un appui long ne doit pas AUSSI ouvrir la fiche.
    if (longDetecte.current) { longDetecte.current = false; return; }
    onOuvrir(resultat);
  };

  const auteur = premierAuteur(resultat.auteurs);
  const meta = [auteur, resultat.annee].filter(Boolean).join(' · ');
  const couverture = resultat.couvertureUrl && !imageCassee ? resultat.couvertureUrl : null;

  return (
    <div className={`carte-livre${suivi ? ` ${classeStatut(suivi.statut)}` : ''}`}>
      <button
        type="button"
        className="carte-livre__zone"
        onClick={cliquer}
        onPointerDown={demarrer}
        onPointerMove={bouger}
        onPointerUp={arreter}
        onPointerCancel={arreter}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="carte-livre__couverture">
          {couverture ? (
            <img
              src={couverture}
              alt={`Couverture de ${resultat.titre}`}
              loading="lazy"
              /* Une couverture Open Library absente rend un 404 (default=false) :
                 sans ce repli, la carte afficherait une image brisée. */
              onError={() => setImageCassee(true)}
            />
          ) : (
            <span className="carte-livre__sans-image">Pas de couverture</span>
          )}
          {suivi ? <span className="carte-livre__lisere" /> : null}
        </span>
        <h3 className="carte-livre__titre">{resultat.titre}</h3>
        {meta ? <p className="carte-livre__meta">{meta}</p> : null}
        {/* §4.6 point 4 : chaque carte porte SA raison. */}
        {raison ? <p className="carte-livre__raison">{raison}</p> : null}
      </button>

      {/*
        Ajout rapide, hérité du projet séries : un bouton en coin d'affiche
        évite d'ouvrir la fiche pour un geste d'un seul mot. Il ne remplace pas
        la fiche, il évite d'y passer quand on sait déjà.
      */}
      {onAjoutRapide && !marque ? (
        <button
          type="button"
          className="carte-livre__ajout"
          onClick={(e) => { e.stopPropagation(); onAjoutRapide(resultat); }}
          disabled={ajoutEnCours}
          aria-label={`Suivre ${resultat.titre}`}
        >
          <Icon name={ajoutEnCours ? 'actualiser' : 'plus'} size={16} />
        </button>
      ) : null}

      {marque ? (
        <span className="carte-livre__marque" aria-label="Déjà dans ta bibliothèque">
          <Icon name="valider" size={14} />
        </span>
      ) : null}
    </div>
  );
}
