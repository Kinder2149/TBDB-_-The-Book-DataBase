/*
 * FicheResultat.jsx — la fiche d'un livre trouve par la recherche, avant qu'il
 * entre dans la bibliotheque. Ce qu'on sait de lui, et ce qu'Open Library en
 * dit une fois qu'il a repondu.
 *
 * Extrait de `Recherche.jsx` le 2026-08-25 (l'ecran atteignait 653 lignes).
 * Composant de PRESENTATION : il ne decide de rien, il recoit ce qu'il affiche
 * et rend la main a l'ecran pour les actions.
 *
 * `identite === null` veut dire « on cherche encore », et non « on n'a rien
 * trouve » — ce sont deux etats differents, et l'ecran ne doit jamais les
 * confondre.
 */

import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

export default function FicheResultat({
  resultat, identite, dejaSuivi, ajoutEnCours, onSuivre, onFermer,
}) {
  return (
    <Modal
      titre={resultat.titre}
      onFermer={onFermer}
      actions={(
        <>
          <button type="button" className="btn btn--fantome" onClick={onFermer}>Fermer</button>
          <button
            type="button"
            className="btn btn--primaire"
            onClick={onSuivre}
            disabled={dejaSuivi || ajoutEnCours}
          >
            <Icon name={dejaSuivi ? 'valider' : 'plus'} size={18} />
            <span>{dejaSuivi ? 'Déjà suivi' : (ajoutEnCours ? 'Ajout…' : 'Suivre')}</span>
          </button>
        </>
      )}
    >
      {resultat.sousTitre ? <p className="fiche__sous-titre">{resultat.sousTitre}</p> : null}

      <div className="fiche__lignes">
        <div className="fiche__ligne">
          <span>Auteurs</span>
          <b>{resultat.auteurs.join(', ') || 'inconnus'}</b>
        </div>
        <div className="fiche__ligne">
          <span>Parution</span>
          <b>{resultat.datePublication || 'inconnue'}</b>
        </div>
        <div className="fiche__ligne">
          <span>Éditeur</span>
          <b>{resultat.editeur || 'inconnu'}</b>
        </div>
        <div className="fiche__ligne">
          <span>ISBN</span>
          <b>{resultat.isbn13 || resultat.isbn10 || 'aucun'}</b>
        </div>
      </div>

      <div className={`identite${identite && identite.resolue ? ' identite--ok' : ''}`}>
        {identite === null ? (
          <p className="hint">Identification chez Open Library…</p>
        ) : (
          <>
            <div className="identite__tete">
              <Icon name={identite.resolue ? 'valider' : 'alerte'} size={18} />
              <b>{identite.resolue ? 'Œuvre identifiée' : 'Identification incomplète'}</b>
            </div>
            <p className="identite__cle">{identite.oeuvreId}</p>
            <p className="identite__detail">
              {identite.resolue
                ? 'Open Library a reconnu ce texte : ses autres éditions pourront le rejoindre.'
                : 'Ce livre entrera quand même, sous une identité locale. Tu pourras le rattacher à une œuvre existante depuis sa fiche.'}
            </p>
            {identite.nbPages ? (
              <p className="identite__detail">Pagination retenue : {identite.nbPages} pages.</p>
            ) : null}
            {identite.cycleNom ? (
              <p className="identite__detail">
                Cycle : {identite.cycleNom}
                {identite.cycleTome ? `, tome ${identite.cycleTome}` : ''}
              </p>
            ) : null}
          </>
        )}
      </div>

      {resultat.resume ? <p className="fiche__resume">{resultat.resume}</p> : null}
    </Modal>
  );
}
