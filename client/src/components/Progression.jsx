/*
 * Progression.jsx — « J'en suis à… ». Applique §5.4 et §5.2.
 * UN SEUL Modal, en trois temps au plus (arbitrage 18) : la métrique si elle
 * manque, la position, puis la suggestion de statut. Deux modales empilées
 * seraient le comportement naturel du code et le pire pour l'utilisateur.
 * Applique §5.4 : ajouter un livre ne pose jamais de question ; la demande de
 * pagination n'arrive qu'ICI, à la première saisie de progression. Refuser est
 * une réponse valable — la progression bascule alors en pourcentage et l'œuvre
 * reste parfaitement utilisable.
 * Applique §5.2 : le statut est MANUEL. La progression le SUGGÈRE, elle ne
 * l'écrit jamais d'office.
 */

import { useState } from 'react';
import { setMetrique, setPosition, setStatut } from '../api.js';
import { progressionDe, enHeures } from '../status.js';
import { notify } from '../notify.js';
import Modal from './Modal.jsx';

export default function Progression({ oeuvre, onFerme, onChange }) {
  const depart = progressionDe(oeuvre);
  const audio = oeuvre.format === 'audio';

  const [etape, setEtape] = useState(depart.metriqueConnue ? 'position' : 'metrique');
  /*
   * Pre-rempli avec la valeur connue : on vient ici pour CORRIGER une
   * pagination fausse, pas pour la retaper de zero (retour d'usage 82).
   */
  const [total, setTotal] = useState(String(depart.total || ''));
  const [pourcentage, setPourcentage] = useState(false);
  const [position, setPositionSaisie] = useState(String(depart.position || ''));
  const [suggestion, setSuggestion] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const unite = pourcentage ? 'pourcent' : depart.unite;

  const libelleUnite = () => {
    if (unite === 'pourcent') return 'pourcentage';
    return audio ? 'minute' : 'page';
  };

  const valider = async () => {
    setOccupe(true);
    try {
      let totalRetenu = depart.total;

      if (etape === 'metrique' && !pourcentage) {
        const n = Number(total);
        if (!n || n <= 0) { notify('Indique un nombre, ou choisis « Je ne sais pas ».'); return; }
        await setMetrique(oeuvre.editionActive, audio ? { dureeMinutes: n } : { nbPages: n });
        totalRetenu = n;
        setEtape('position');
        return;
      }

      const pos = Number(position);
      if (Number.isNaN(pos) || pos < 0) { notify('Indique un nombre positif.'); return; }
      if (unite === 'pourcent' && pos > 100) { notify('Un pourcentage ne dépasse pas 100.'); return; }

      await setPosition(oeuvre.oeuvreId, pos);
      await onChange();

      // §5.2 : la progression suggère, elle n'impose pas.
      const atteint = unite === 'pourcent' ? pos >= 100 : (totalRetenu && pos >= totalRetenu);
      if (atteint && oeuvre.statut !== 'lu') setSuggestion('lu');
      else if (pos > 0 && oeuvre.statut === 'a_lire') setSuggestion('en_cours');
      else onFerme();
    } catch (e) {
      notify(e.message);
    } finally {
      setOccupe(false);
    }
  };

  const accepter = async () => {
    try {
      await setStatut(oeuvre.oeuvreId, suggestion);
      await onChange();
    } catch (e) {
      notify(e.message);
    } finally {
      onFerme();
    }
  };

  // --- 3. suggestion de statut -------------------------------------------
  if (suggestion) {
    return (
      <Modal
        titre={suggestion === 'lu' ? 'Tu l’as terminé ?' : 'Tu l’as commencé ?'}
        onFermer={onFerme}
        actions={(
          <>
            <button type="button" className="btn btn--fantome" onClick={onFerme}>Non, laisse</button>
            <button type="button" className="btn btn--primaire" onClick={accepter}>
              {suggestion === 'lu' ? 'Marquer comme lu' : 'Marquer en cours'}
            </button>
          </>
        )}
      >
        <p className="hint">
          {suggestion === 'lu'
            ? 'Tu es arrivé au bout. Je peux passer ce livre en « Lu » et noter la date d’aujourd’hui — ou le laisser tel quel, c’est toi qui décides.'
            : 'Tu as avancé dans ce livre, mais il est encore marqué « À lire ». Je peux le passer en « En cours ».'}
        </p>
      </Modal>
    );
  }

  // --- 1. métrique manquante ----------------------------------------------
  if (etape === 'metrique') {
    return (
      <Modal
        titre={audio ? 'Combien de temps dure ce livre ?' : 'Combien de pages fait ce livre ?'}
        onFermer={onFerme}
        actions={(
          <>
            <button
              type="button"
              className="btn btn--fantome"
              onClick={() => { setPourcentage(true); setEtape('position'); }}
            >
              Je ne sais pas
            </button>
            <button type="button" className="btn btn--primaire" onClick={valider} disabled={occupe}>
              Continuer
            </button>
          </>
        )}
      >
        <p className="hint">
          {depart.metriqueConnue
            ? `Corrige ${audio ? 'la durée' : 'le nombre de pages'} si ton exemplaire ne correspond pas : les éditions varient, et c'est TON édition qui fait foi.`
            : `Ni Google ni Open Library ne connaissent ${audio ? 'la durée' : 'la pagination'} de cette édition. Tu la trouveras ${audio ? 'sur ton lecteur' : 'sur la dernière page du livre'}. Si tu préfères ne pas chercher, choisis « Je ne sais pas » : la progression se fera en pourcentage, et ça marche très bien.`}
        </p>
        <input
          className="champ__saisie champ__saisie--encadre"
          type="number"
          min="1"
          inputMode="numeric"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder={audio ? 'Durée totale en minutes' : 'Nombre de pages'}
          aria-label={audio ? 'Durée totale en minutes' : 'Nombre de pages'}
          autoFocus
        />
      </Modal>
    );
  }

  // --- 2. position ---------------------------------------------------------
  const total2 = pourcentage ? 100 : depart.total || Number(total) || 0;

  return (
    <Modal
      titre="J’en suis à…"
      onFermer={onFerme}
      actions={(
        <>
          <button type="button" className="btn btn--fantome" onClick={onFerme}>Annuler</button>
          <button type="button" className="btn btn--primaire" onClick={valider} disabled={occupe}>
            Enregistrer
          </button>
        </>
      )}
    >
      <p className="hint">
        {unite === 'pourcent'
          ? 'Où en es-tu, à peu près, en pourcentage ?'
          : `Sur ${audio ? enHeures(total2) : `${total2} pages`}.`}
      </p>
      <div className="cycle__saisie">
        {/*
          Le champ est pré-rempli avec la position actuelle — c'est utile, on
          voit d'où l'on part. Mais sans `select()` au focus, le curseur se
          place à la fin et la saisie S'AJOUTE : taper « 260 » sur « 210 »
          enregistrait 210260. Constaté sur appareil.
        */}
        <input
          className="champ__saisie champ__saisie--encadre"
          type="number"
          min="0"
          inputMode="numeric"
          value={position}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setPositionSaisie(e.target.value)}
          placeholder={unite === 'pourcent' ? '0 à 100' : `Numéro de ${libelleUnite()}`}
          aria-label="Position de lecture"
          autoFocus
        />
        <span className="cycle__unite">
          {unite === 'pourcent' ? '%' : (audio ? 'min' : `/ ${total2}`)}
        </span>
      </div>
      {audio && unite !== 'pourcent' ? (
        <p className="carte__detail">Soit {enHeures(Number(position) || 0)} d’écoute.</p>
      ) : null}

      {/*
        Retour d'usage 82 : « si le nombre de pages ne correspond pas a ma
        version je ne peux pas modifier ». C'etait exact — l'etape metrique
        etait SAUTEE des que la source avait donne une valeur, donc une
        pagination fausse etait definitive. Or elle est fausse souvent : les
        editions poche, club et grand format d'un meme texte n'ont pas la meme
        pagination, et §5.4 dit deja que c'est l'edition qui porte la mesure.
        Le lien est ICI, a l'endroit exact ou l'ecart se constate.
      */}
      {unite !== 'pourcent' ? (
        <button
          type="button"
          className="btn btn--fantome btn--lien"
          onClick={() => setEtape('metrique')}
        >
          {audio
            ? 'Ce n’est pas la bonne durée ?'
            : `Ce n’est pas ${total2} pages dans mon exemplaire`}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--fantome btn--lien"
          onClick={() => { setPourcentage(false); setEtape('metrique'); }}
        >
          {audio ? 'Indiquer la durée exacte' : 'Indiquer le nombre de pages'}
        </button>
      )}
    </Modal>
  );
}
