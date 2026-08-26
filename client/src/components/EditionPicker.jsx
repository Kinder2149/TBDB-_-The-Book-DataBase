/*
 * EditionPicker.jsx — la liste des éditions d'une œuvre et le choix de
 * l'édition ACTIVE : celle qu'on lit, celle qui donne le nombre de pages
 * servant à la progression (§3.1).
 * Applique §3.2 : « Détacher cette édition » est proposé ici, au plus près de
 * l'édition concernée, parce que c'est ici qu'on s'aperçoit qu'un ISBN a été
 * réutilisé pour un ouvrage sans rapport.
 * Piège évité : ni détacher ni supprimer n'est proposé quand il n'y a qu'une
 * seule édition — une œuvre n'existe jamais sans édition (§9), et un bouton
 * qui échoue toujours est pire qu'un bouton absent.
 */

import { useState } from 'react';
import Icon from './Icon.jsx';
import CouvertureDessinee from './CouvertureDessinee.jsx';

const FORMATS = { papier: 'Papier', numerique: 'Numérique', audio: 'Audio' };

export default function EditionPicker({
  editions, editionActive, onChoisir, onDetacher, onSupprimer, onAjouter,
}) {
  const seule = editions.length <= 1;
  /* Une adresse d'image peut ne plus repondre : on retombe alors sur la
     couverture dessinee plutot que d'afficher une image brisee. */
  const [cassees, setCassees] = useState(new Set());

  return (
    <div className="editions">
      <div className="editions__tete">
        <h3 className="soustitre soustitre--serre">
          {editions.length > 1 ? `${editions.length} éditions` : 'Édition'}
        </h3>
        <button type="button" className="btn btn--fantome" onClick={onAjouter}>
          <Icon name="plus" size={16} />
          <span>Ajouter</span>
        </button>
      </div>

      {editions.map((e) => {
        const active = e.editionId === editionActive;
        const details = [
          FORMATS[e.format] || e.format,
          e.editeur,
          e.datePublication ? String(e.datePublication).slice(0, 4) : null,
          e.nbPages ? `${e.nbPages} p.` : null,
          e.dureeMinutes ? `${Math.round(e.dureeMinutes / 60)} h` : null,
        ].filter(Boolean).join(' · ');

        return (
          <div key={e.editionId} className={`edition${active ? ' edition--active' : ''}`}>
            <button
              type="button"
              className="edition__choix"
              onClick={() => onChoisir(e.editionId)}
              aria-pressed={active}
            >
              <span className="edition__marque">
                {active ? <Icon name="valider" size={16} /> : null}
              </span>

              {/*
                LA VIGNETTE DE CHAQUE EDITION (retour d'usage 117). Choisir
                entre « A. Michel 1991 » et « le Livre de poche 2024 » sur la
                foi de deux lignes de texte demande de connaitre ses editions
                par coeur ; leurs couvertures, elles, se reconnaissent d'un
                coup d'oeil.
                Les editions venues de la BnF n'ont pas d'image : elles
                recoivent la couverture dessinee, comme partout ailleurs.
              */}
              <span className="edition__vignette">
                {e.couvertureUrl && !cassees.has(e.editionId) ? (
                  <img
                    src={e.couvertureUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setCassees((avant) => new Set(avant).add(e.editionId))}
                  />
                ) : (
                  <CouvertureDessinee titre={e.titre} auteur={e.editeur} />
                )}
              </span>
              <span className="edition__texte">
                <b>{e.titre}</b>
                <span className="edition__meta">{details}</span>
                {e.isbn13 || e.isbn10
                  ? <span className="edition__isbn">{e.isbn13 || e.isbn10}</span>
                  : null}
              </span>
            </button>

            {!seule && (
              <div className="edition__actions">
                <button type="button" className="btn btn--fantome btn--mini" onClick={() => onDetacher(e)}>
                  Détacher
                </button>
                <button type="button" className="btn btn--fantome btn--mini" onClick={() => onSupprimer(e)}>
                  Supprimer
                </button>
              </div>
            )}
          </div>
        );
      })}

      {seule ? (
        <p className="carte__detail">
          Un seul exemplaire pour l’instant. Ajoute-en un si tu possèdes aussi ce
          livre en poche, en numérique ou en audio : le suivi restera commun.
        </p>
      ) : (
        <p className="carte__detail">
          L’édition cochée est celle que tu lis : c’est sa pagination qui sert à
          la progression.
        </p>
      )}
    </div>
  );
}
