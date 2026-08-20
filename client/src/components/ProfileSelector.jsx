/*
 * ProfileSelector.jsx — la carte « Profil » des Réglages : choisir, créer,
 * renommer, supprimer. §6 le demandait, et rien ne l'implémentait : la façade
 * avait les quatre fonctions depuis la tranche 2, aucun écran ne les appelait.
 * Le nom affiché dans l'en-tête venait du profil créé d'office au premier
 * démarrage, sans moyen d'en changer.
 * Applique §7 : aucun `window.prompt`, tout passe par Modal. Et la SUPPRESSION
 * avec confirmation — que le projet séries a « reporté depuis la V1 » et jamais
 * livré ; on ne reproduit pas l'oubli.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listProfiles, getActiveProfileId, setActiveProfileId,
  createProfile, renameProfile, deleteProfile,
} from '../api.js';
import { notify } from '../notify.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

export default function ProfileSelector({ onChangement }) {
  const [profils, setProfils] = useState([]);
  const [actif, setActif] = useState(null);
  const [modale, setModale] = useState(null);   // 'creation' | 'renommage' | 'suppression'
  const [saisie, setSaisie] = useState('');

  const charger = useCallback(async () => {
    try {
      const [liste, id] = await Promise.all([listProfiles(), getActiveProfileId()]);
      setProfils(liste);
      setActif(id);
    } catch (e) {
      notify(e.message);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const profilCourant = profils.find((p) => p.id === actif) || null;

  const agir = async (action, message) => {
    try {
      await action();
      await charger();
      await onChangement();
      setModale(null);
      setSaisie('');
      if (message) notify(message, 'info');
    } catch (e) {
      notify(e.message);
    }
  };

  const choisir = (id) => agir(async () => { await setActiveProfileId(id); });

  const creer = () => agir(async () => {
    const nom = saisie.trim();
    if (!nom) throw new Error('Donne un nom à ce profil.');
    const { id } = await createProfile(nom);
    await setActiveProfileId(id);
  }, `Profil « ${saisie.trim()} » créé et activé.`);

  const renommer = () => agir(async () => {
    const nom = saisie.trim();
    if (!nom) throw new Error('Le nom ne peut pas être vide.');
    await renameProfile(actif, nom);
  }, 'Profil renommé.');

  const supprimer = () => agir(async () => {
    const restants = profils.filter((p) => p.id !== actif);
    if (restants.length === 0) throw new Error('C’est ton seul profil : il ne peut pas être supprimé.');
    await deleteProfile(actif);
    await setActiveProfileId(restants[0].id);
  }, 'Profil supprimé.');

  return (
    <div className="carte">
      <h2 className="carte__titre">Profil</h2>

      <p className="carte__detail">
        Chaque profil a sa propre bibliothèque, ses statuts et ses listes. Rien
        n’est partagé entre eux.
      </p>

      <div className="listes__puces">
        {profils.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${p.id === actif ? ' on' : ''}`}
            onClick={() => choisir(p.id)}
            aria-pressed={p.id === actif}
          >
            {p.id === actif ? <Icon name="valider" size={14} /> : null}
            <span>{p.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="chip chip--nouveau"
          onClick={() => { setSaisie(''); setModale('creation'); }}
        >
          <Icon name="plus" size={14} />
          <span>Nouveau</span>
        </button>
      </div>

      <div className="carte__ligne">
        <span>{profilCourant ? profilCourant.name : '…'}</span>
        <span className="profil__actions">
          <button
            type="button"
            className="btn btn--fantome btn--mini"
            onClick={() => { setSaisie(profilCourant ? profilCourant.name : ''); setModale('renommage'); }}
          >
            Renommer
          </button>
          <button
            type="button"
            className="btn btn--fantome btn--mini"
            onClick={() => setModale('suppression')}
            disabled={profils.length <= 1}
          >
            Supprimer
          </button>
        </span>
      </div>

      {(modale === 'creation' || modale === 'renommage') && (
        <Modal
          titre={modale === 'creation' ? 'Nouveau profil' : 'Renommer le profil'}
          onFermer={() => setModale(null)}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={() => setModale(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn--primaire"
                onClick={modale === 'creation' ? creer : renommer}
              >
                {modale === 'creation' ? 'Créer' : 'Renommer'}
              </button>
            </>
          )}
        >
          <p className="hint">
            {modale === 'creation'
              ? 'Un nouveau profil part d’une bibliothèque vide. Il devient actif tout de suite.'
              : 'Le nom sert seulement à t’y retrouver ; ta bibliothèque n’est pas touchée.'}
          </p>
          <input
            className="champ__saisie champ__saisie--encadre"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Nom du profil"
            aria-label="Nom du profil"
            autoFocus
          />
        </Modal>
      )}

      {modale === 'suppression' && (
        <Modal
          titre="Supprimer ce profil"
          danger
          onFermer={() => setModale(null)}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={() => setModale(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn--danger" onClick={supprimer}>
                Supprimer
              </button>
            </>
          )}
        >
          <p className="hint">
            Le profil « {profilCourant ? profilCourant.name : ''} » disparaîtra
            avec <b>toute sa bibliothèque</b> — livres, éditions, statuts,
            progression et listes. C’est irréversible tant qu’il n’y a pas de
            sauvegarde de ce profil.
          </p>
        </Modal>
      )}
    </div>
  );
}
