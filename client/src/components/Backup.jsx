/*
 * Backup.jsx — sauvegarder, restaurer, exporter en CSV Goodreads.
 * SEULE exception tolérée à §2 règle 1 : ce composant importe backup.js et
 * files.js en plus de api.js. C'est écrit dans le contexte, pas une entorse.
 * Applique §3.6, dans l'ordre : décrire le contenu en clair → confirmation
 * explicite → puis seulement écraser. Une restauration remplace un profil
 * entier ; elle ne doit jamais partir d'un seul geste.
 * Piège évité : le bouton porte un état `occupe` — sans lui, un double appui
 * lance deux restaurations concurrentes sur la même base.
 */

import { useState } from 'react';
import { getProfilActif } from '../api.js';
import {
  construireSauvegarde, validerSauvegarde, decrireSauvegarde, restaurer, versCsvGoodreads,
} from '../backup.js';
import { nomFichierSauvegarde, sortirTexte, lireFichierTexte } from '../files.js';
import { notify } from '../notify.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

export default function Backup({ onFerme, onRestaure }) {
  const [occupe, setOccupe] = useState(null); // 'export'|'csv'|'lecture'|'restauration'
  const [aConfirmer, setAConfirmer] = useState(null);

  const sauvegarder = async () => {
    setOccupe('export');
    try {
      const profil = await getProfilActif();
      const sauvegarde = await construireSauvegarde(profil);
      const sortie = await sortirTexte(
        nomFichierSauvegarde('json'),
        JSON.stringify(sauvegarde, null, 2),
      );
      notify(
        sortie === 'partage'
          ? 'Choisis où enregistrer ta sauvegarde.'
          : `Sauvegarde enregistrée : ${sauvegarde.oeuvres.length} livres.`,
        'info',
      );
    } catch (e) {
      notify(`La sauvegarde a échoué : ${e.message}`);
    } finally {
      setOccupe(null);
    }
  };

  const exporterCsv = async () => {
    setOccupe('csv');
    try {
      const profil = await getProfilActif();
      const sauvegarde = await construireSauvegarde(profil);
      const { csv, ecartes } = versCsvGoodreads(sauvegarde);
      await sortirTexte(nomFichierSauvegarde('csv'), csv, 'text/csv');
      notify(`Export Goodreads fait. Ne sont pas repris : ${ecartes.join(', ')}.`, 'info');
    } catch (e) {
      notify(`L’export CSV a échoué : ${e.message}`);
    } finally {
      setOccupe(null);
    }
  };

  const choisirFichier = async () => {
    setOccupe('lecture');
    try {
      const fichier = await lireFichierTexte();
      if (!fichier) return;
      const donnees = validerSauvegarde(fichier.contenu);
      setAConfirmer({ donnees, resume: decrireSauvegarde(donnees), nom: fichier.nom });
    } catch (e) {
      notify(e.message);
    } finally {
      setOccupe(null);
    }
  };

  const confirmerRestauration = async () => {
    setOccupe('restauration');
    try {
      const { profileId, itemsIgnores } = await restaurer(aConfirmer.donnees);
      setAConfirmer(null);
      await onRestaure(profileId);
      notify(
        itemsIgnores > 0
          ? `Restauration faite. ${itemsIgnores} entrée(s) de liste sans livre ont été ignorées.`
          : 'Restauration faite.',
        'info',
      );
      onFerme();
    } catch (e) {
      notify(`La restauration a échoué : ${e.message}`);
    } finally {
      setOccupe(null);
    }
  };

  if (aConfirmer) {
    const r = aConfirmer.resume;
    return (
      <Modal
        titre="Remplacer par cette sauvegarde ?"
        danger
        onFermer={() => setAConfirmer(null)}
        actions={(
          <>
            <button type="button" className="btn btn--fantome" onClick={() => setAConfirmer(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={confirmerRestauration}
              disabled={occupe === 'restauration'}
            >
              {occupe === 'restauration' ? 'Restauration…' : 'Remplacer'}
            </button>
          </>
        )}
      >
        <div className="fiche__lignes">
          <div className="fiche__ligne"><span>Profil</span><b>{r.profil}</b></div>
          <div className="fiche__ligne"><span>Faite le</span><b>{r.date}</b></div>
          <div className="fiche__ligne"><span>Livres</span><b>{r.oeuvres}</b></div>
          <div className="fiche__ligne"><span>Éditions</span><b>{r.editions}</b></div>
          <div className="fiche__ligne"><span>Listes</span><b>{r.listes}</b></div>
        </div>
        {r.repartition ? <p className="carte__detail">{r.repartition}</p> : null}
        <p className="hint">
          Le profil « {r.profil} » sera <b>entièrement remplacé</b> par le contenu
          de ce fichier. Ce qu’il contient aujourd’hui et qui n’est pas dans la
          sauvegarde sera perdu. Les autres profils ne sont pas touchés.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      titre="Mes données"
      onFermer={onFerme}
      actions={<button type="button" className="btn btn--fantome" onClick={onFerme}>Fermer</button>}
    >
      <p className="hint">
        Tout est enregistré sur cet appareil, et nulle part ailleurs. Une
        sauvegarde est le seul moyen de retrouver ta bibliothèque si tu changes
        de téléphone ou désinstalles l’application.
      </p>

      <button type="button" className="btn btn--primaire btn--large" onClick={sauvegarder} disabled={occupe !== null}>
        <Icon name="sauver" size={18} />
        <span>{occupe === 'export' ? 'Sauvegarde…' : 'Sauvegarder ma bibliothèque'}</span>
      </button>

      <button type="button" className="btn btn--large" onClick={choisirFichier} disabled={occupe !== null}>
        <Icon name="actualiser" size={18} />
        <span>{occupe === 'lecture' ? 'Lecture…' : 'Restaurer une sauvegarde'}</span>
      </button>

      <button type="button" className="btn btn--large" onClick={exporterCsv} disabled={occupe !== null}>
        <Icon name="livre" size={18} />
        <span>{occupe === 'csv' ? 'Export…' : 'Exporter pour Goodreads (CSV)'}</span>
      </button>

      <p className="carte__detail">
        Le CSV sert à emporter ta liste ailleurs. Il ne reprend que titre,
        auteur, ISBN, note, date de fin et statut — pas les résumés, ni les
        éditions multiples, ni la progression. Pour une vraie sauvegarde, prends
        le fichier de sauvegarde.
      </p>
    </Modal>
  );
}
