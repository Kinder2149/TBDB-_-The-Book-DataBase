/*
 * Detail.jsx — la fiche d'un livre suivi, en overlay. Applique §6.
 * Ordre imposé par le contexte : couverture et titre → statut → éditions et
 * édition active → cycle et tome → résumé → zone « Identification » en bas.
 * Ordre reel : statut -> editions -> PROGRESSION -> cycle -> resume ->
 * identification. Les listes arrivent en tranche 6.
 * Applique §3.2 : les deux rattrapages d'identité vivent ici, parce que
 * l'identité est faillible dans les deux sens — l'empreinte peut créer deux
 * œuvres pour un même livre, et un ISBN réutilisé peut en fusionner deux.
 * Piège évité : « Rattacher » et « Retirer » sont irréversibles hors
 * sauvegarde ; chacun passe par un Modal qui dit ce qui est perdu (§6).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getEditions, listCycles, setStatut, setCycle, setEditionActive, ajouterEdition,
  supprimerEdition, detacherEdition, regrouperOeuvres, retirerOeuvre, rechercher,
  ajouterEditionManuelle, getListes, getListesDeLOeuvre, addToListe,
  removeFromListe, createListe,
} from '../api.js';
import { LIBELLES, STATUTS, classeStatut, progressionDe } from '../status.js';
import { notify } from '../notify.js';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import EditionPicker from './EditionPicker.jsx';
import ProgressBar from './ProgressBar.jsx';

export default function Detail({ oeuvre, bibliotheque, onFerme, onChange, onProgression }) {
  const [editions, setEditions] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [nomCycle, setNomCycle] = useState(oeuvre.cycleNom || '');
  const [tomeCycle, setTomeCycle] = useState(oeuvre.cycleTome || '');
  const [sousModale, setSousModale] = useState(null); // {type, cible}
  const [recherche, setRecherche] = useState({ texte: '', resultats: [], etat: 'vide' });
  const [filtreCible, setFiltreCible] = useState('');
  const [listes, setListes] = useState([]);
  const [mesListes, setMesListes] = useState([]);
  const [nouvelleListe, setNouvelleListe] = useState('');
  const [saisieManuelle, setSaisieManuelle] = useState({ titre: '', format: 'audio', nbPages: '', dureeMinutes: '' });

  const locale = String(oeuvre.oeuvreId).startsWith('fp:');

  const charger = useCallback(async () => {
    try {
      const [e, c, l, m] = await Promise.all([
        getEditions(oeuvre.oeuvreId), listCycles(), getListes(), getListesDeLOeuvre(oeuvre.oeuvreId),
      ]);
      setEditions(e);
      setCycles(c);
      setListes(l);
      setMesListes(m);
    } catch (err) {
      notify(err.message);
    }
  }, [oeuvre.oeuvreId]);

  useEffect(() => { charger(); }, [charger]);

  // Toute écriture recharge la bibliothèque entière (§9) : brutal, mais aucune
  // désynchronisation possible entre la fiche et la grille derrière.
  const agir = useCallback(async (action, message) => {
    try {
      await action();
      await charger();
      await onChange();
      if (message) notify(message, 'info');
    } catch (err) {
      notify(err.message);
    }
  }, [charger, onChange]);

  const enregistrerCycle = () => agir(
    () => setCycle(oeuvre.oeuvreId, nomCycle, tomeCycle ? Number(tomeCycle) : null),
    nomCycle.trim() ? 'Cycle enregistré.' : 'Cycle effacé : la lecture automatique reprend.',
  );

  const chercherEdition = async (texte) => {
    setRecherche((r) => ({ ...r, texte, etat: 'charge' }));
    try {
      const chiffres = texte.replace(/[^0-9Xx]/g, '');
      const mode = chiffres.length >= 10 ? 'isbn' : 'titre';
      const resultats = await rechercher(mode === 'isbn' ? chiffres : texte, mode);
      setRecherche({ texte, resultats, etat: 'fait' });
    } catch (err) {
      setRecherche((r) => ({ ...r, etat: 'vide' }));
      notify(err.message);
    }
  };

  const ciblesPossibles = useMemo(
    () => bibliotheque
      .filter((o) => o.oeuvreId !== oeuvre.oeuvreId)
      .filter((o) => o.titre.toLowerCase().includes(filtreCible.toLowerCase())),
    [bibliotheque, oeuvre.oeuvreId, filtreCible],
  );

  const fermerSous = () => { setSousModale(null); setRecherche({ texte: '', resultats: [], etat: 'vide' }); };

  // --- sous-modales -------------------------------------------------------
  if (sousModale) {
    const { type, cible } = sousModale;

    if (type === 'ajout') {
      return (
        <Modal titre="Ajouter une édition" onFermer={fermerSous}>
          <p className="hint">
            Cherche l’exemplaire que tu possèdes — par son ISBN au dos, ou par
            son titre. Il rejoindra ce livre sans créer de doublon.
          </p>
          <div className="champ">
            <Icon name="recherche" size={20} className="champ__icone" />
            <input
              className="champ__saisie"
              value={recherche.texte}
              onChange={(e) => chercherEdition(e.target.value)}
              placeholder="ISBN ou titre"
              aria-label="Chercher une édition"
              autoFocus
            />
          </div>
          {recherche.etat === 'charge' && <p className="hint">Recherche…</p>}
          {/* §5.5 : ni Google ni Open Library ne cataloguent l'audio.
              Une edition audio est TOUJOURS saisie a la main. */}
          <button
            type="button"
            className="ligne-resultat"
            onClick={() => setSousModale({ type: 'manuelle' })}
          >
            <b>Saisir un exemplaire à la main</b>
            <span>Livre audio, VO, exemplaire non catalogué — aucune recherche</span>
          </button>
          {recherche.resultats.map((r) => (
            <button
              key={r.cleSource}
              type="button"
              className="ligne-resultat"
              onClick={() => { fermerSous(); agir(() => ajouterEdition(oeuvre.oeuvreId, r), 'Édition ajoutée.'); }}
            >
              <b>{r.titre}</b>
              <span>{[r.editeur, r.annee, r.nbPages ? `${r.nbPages} p.` : null].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </Modal>
      );
    }

    if (type === 'manuelle') {
      const audio = saisieManuelle.format === 'audio';
      return (
        <Modal
          titre="Saisir un exemplaire"
          onFermer={fermerSous}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={fermerSous}>Annuler</button>
              <button
                type="button"
                className="btn btn--primaire"
                onClick={() => {
                  if (!saisieManuelle.titre.trim()) { notify('Donne au moins un titre.'); return; }
                  fermerSous();
                  agir(() => ajouterEditionManuelle(oeuvre.oeuvreId, {
                    titre: saisieManuelle.titre.trim(),
                    auteurs: oeuvre.auteurs,
                    format: saisieManuelle.format,
                    nbPages: saisieManuelle.nbPages ? Number(saisieManuelle.nbPages) : null,
                    dureeMinutes: saisieManuelle.dureeMinutes ? Number(saisieManuelle.dureeMinutes) : null,
                  }), 'Exemplaire ajouté.');
                }}
              >
                Ajouter
              </button>
            </>
          )}
        >
          <p className="hint">
            Les livres audio ne sont catalogués correctement nulle part : ils se
            saisissent ici. La progression s’exprimera alors en minutes.
          </p>
          <input
            className="champ__saisie champ__saisie--encadre"
            value={saisieManuelle.titre}
            onChange={(e) => setSaisieManuelle((v) => ({ ...v, titre: e.target.value }))}
            placeholder="Titre de cet exemplaire"
            aria-label="Titre"
            autoFocus
          />
          <div className="seg" role="group" aria-label="Format">
            {['papier', 'numerique', 'audio'].map((f) => (
              <button
                key={f}
                type="button"
                className={`seg__item${saisieManuelle.format === f ? ' on' : ''}`}
                onClick={() => setSaisieManuelle((v) => ({ ...v, format: f }))}
              >
                {f === 'papier' ? 'Papier' : (f === 'numerique' ? 'Numérique' : 'Audio')}
              </button>
            ))}
          </div>
          <input
            className="champ__saisie champ__saisie--encadre"
            type="number"
            min="1"
            inputMode="numeric"
            value={audio ? saisieManuelle.dureeMinutes : saisieManuelle.nbPages}
            onChange={(e) => setSaisieManuelle((v) => (
              audio ? { ...v, dureeMinutes: e.target.value } : { ...v, nbPages: e.target.value }
            ))}
            placeholder={audio ? 'Durée en minutes (facultatif)' : 'Nombre de pages (facultatif)'}
            aria-label={audio ? 'Durée en minutes' : 'Nombre de pages'}
          />
        </Modal>
      );
    }

    if (type === 'rattacher') {
      return (
        <Modal titre="Rattacher à une œuvre existante" onFermer={fermerSous}>
          <p className="hint">
            Choisis le livre auquel celui-ci doit être rattaché. <b>C’est
            l’autre qui gagne</b> : son statut, sa note et sa progression sont
            conservés, et ce livre lui apporte ses éditions avant de disparaître.
          </p>
          <div className="champ">
            <Icon name="recherche" size={20} className="champ__icone" />
            <input
              className="champ__saisie"
              value={filtreCible}
              onChange={(e) => setFiltreCible(e.target.value)}
              placeholder="Filtrer ma bibliothèque"
              aria-label="Filtrer"
            />
          </div>
          {ciblesPossibles.length === 0 ? (
            <p className="hint">Aucun autre livre ne correspond.</p>
          ) : ciblesPossibles.slice(0, 30).map((o) => (
            <button
              key={o.oeuvreId}
              type="button"
              className="ligne-resultat"
              onClick={() => { fermerSous(); onFerme(); agir(() => regrouperOeuvres(oeuvre.oeuvreId, o.oeuvreId), 'Les deux livres n’en font plus qu’un.'); }}
            >
              <b>{o.titre}</b>
              <span>{[(o.auteurs || '').split(',')[0], o.annee].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </Modal>
      );
    }

    if (type === 'detacher' || type === 'supprimerEdition') {
      const detache = type === 'detacher';
      return (
        <Modal
          titre={detache ? 'Détacher cette édition' : 'Supprimer cette édition'}
          danger
          onFermer={fermerSous}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={fermerSous}>Annuler</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  fermerSous();
                  agir(
                    () => (detache ? detacherEdition(cible.editionId) : supprimerEdition(cible.editionId)),
                    detache ? 'Édition détachée : elle forme un livre à part.' : 'Édition supprimée.',
                  );
                }}
              >
                {detache ? 'Détacher' : 'Supprimer'}
              </button>
            </>
          )}
        >
          <p className="hint">
            {detache
              ? `« ${cible.titre} » deviendra un livre séparé, avec son propre suivi. À faire quand cette édition n’a en réalité rien à voir avec ce texte — un même ISBN est parfois réutilisé pour deux ouvrages sans rapport.`
              : `« ${cible.titre} » sera retirée de ce livre. Le livre lui-même et ses autres éditions restent.`}
          </p>
        </Modal>
      );
    }

    if (type === 'retrait') {
      return (
        <Modal
          titre="Retirer ce livre"
          danger
          onFermer={fermerSous}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={fermerSous}>Annuler</button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => { fermerSous(); onFerme(); agir(() => retirerOeuvre(oeuvre.oeuvreId), 'Livre retiré.'); }}
              >
                Retirer
              </button>
            </>
          )}
        >
          <p className="hint">
            « {oeuvre.titre} » sortira de ta bibliothèque avec{' '}
            {editions.length === 1 ? 'son édition' : `ses ${editions.length} éditions`},
            son statut et sa progression. C’est irréversible tant qu’il n’y a pas
            de sauvegarde.
          </p>
        </Modal>
      );
    }
  }

  // --- fiche --------------------------------------------------------------
  return (
    <Modal
      titre={oeuvre.titre}
      onFermer={onFerme}
      actions={(
        <>
          <button type="button" className="btn btn--fantome" onClick={() => setSousModale({ type: 'retrait' })}>
            Retirer
          </button>
          <button type="button" className="btn btn--primaire" onClick={onFerme}>Fermer</button>
        </>
      )}
    >
      <div className="fiche__entete">
        <div className="fiche__couverture">
          {oeuvre.couvertureUrl
            ? <img src={oeuvre.couvertureUrl} alt="" loading="lazy" />
            : <span className="carte-livre__sans-image">Pas de couverture</span>}
        </div>
        <div className="fiche__resume-tete">
          <p className="fiche__auteurs">{oeuvre.auteurs || 'Auteur inconnu'}</p>
          {oeuvre.annee ? <p className="fiche__annee">{oeuvre.annee}</p> : null}
          {oeuvre.cycleNom ? (
            <p className="fiche__cycle">
              {oeuvre.cycleNom}{oeuvre.cycleTome ? `, tome ${oeuvre.cycleTome}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="statuts statuts--ligne">
        {STATUTS.map((s) => (
          <button
            key={s}
            type="button"
            className={`statbtn ${classeStatut(s)}${oeuvre.statut === s ? ' is-active' : ''}`}
            onClick={() => agir(() => setStatut(oeuvre.oeuvreId, s))}
          >
            <span className="statbtn__led" />
            <span>{LIBELLES[s]}</span>
          </button>
        ))}
      </div>

      <EditionPicker
        editions={editions}
        editionActive={oeuvre.editionActive}
        onChoisir={(id) => agir(() => setEditionActive(oeuvre.oeuvreId, id))}
        onAjouter={() => setSousModale({ type: 'ajout' })}
        onDetacher={(e) => setSousModale({ type: 'detacher', cible: e })}
        onSupprimer={(e) => setSousModale({ type: 'supprimerEdition', cible: e })}
      />

      {/* §6 : la progression vient APRES l'edition active, parce que c'est
          elle qui donne la metrique. */}
      <div className="progression-bloc">
        <ProgressBar progression={progressionDe(oeuvre)} />
        <button type="button" className="btn btn--large" onClick={onProgression}>
          <Icon name="livre" size={16} />
          <span>J’en suis à…</span>
        </button>
      </div>

      <div className="cycle">
        <h3 className="soustitre soustitre--serre">Cycle</h3>
        <div className="cycle__saisie">
          {/* L'autocomplétion sur les cycles déjà en base est ce qui garantit
              qu'un cycle ne se dédouble pas sur une faute de frappe (§4.4). */}
          <input
            className="champ__saisie champ__saisie--encadre"
            list="cycles-connus"
            value={nomCycle}
            onChange={(e) => setNomCycle(e.target.value)}
            placeholder="Nom du cycle"
            aria-label="Nom du cycle"
          />
          <datalist id="cycles-connus">
            {cycles.map((c) => <option key={c} value={c} />)}
          </datalist>
          <input
            className="champ__saisie champ__saisie--encadre champ__saisie--court"
            type="number"
            min="1"
            value={tomeCycle}
            onChange={(e) => setTomeCycle(e.target.value)}
            placeholder="Tome"
            aria-label="Numéro de tome"
          />
          <button type="button" className="btn btn--fantome" onClick={enregistrerCycle}>
            <Icon name="valider" size={16} />
          </button>
        </div>
        <p className="carte__detail">
          Vider le nom remet ce livre à la lecture automatique. Tant qu’il est
          renseigné à la main, aucune source ne l’écrasera.
        </p>
      </div>

      {/* Listes personnalisees (tranche 6) : cocher / decocher, creation a la
          volee. Une liste ne change jamais le statut du livre. */}
      <div className="listes">
        <h3 className="soustitre soustitre--serre">Mes listes</h3>
        <div className="listes__puces">
          {listes.map((l) => {
            const dedans = mesListes.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={`chip${dedans ? ' on' : ''}`}
                onClick={() => agir(() => (dedans
                  ? removeFromListe(l.id, oeuvre.oeuvreId)
                  : addToListe(l.id, oeuvre.oeuvreId)))}
                aria-pressed={dedans}
              >
                {dedans ? <Icon name="valider" size={14} /> : null}
                <span>{l.name}</span>
              </button>
            );
          })}
        </div>
        <div className="cycle__saisie">
          <input
            className="champ__saisie champ__saisie--encadre"
            value={nouvelleListe}
            onChange={(e) => setNouvelleListe(e.target.value)}
            placeholder="Nouvelle liste"
            aria-label="Nom de la nouvelle liste"
          />
          <button
            type="button"
            className="btn btn--fantome"
            onClick={() => {
              if (!nouvelleListe.trim()) return;
              const nom = nouvelleListe.trim();
              setNouvelleListe('');
              agir(async () => { await createListe(nom); }, `Liste « ${nom} » créée.`);
            }}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      {oeuvre.resume ? (
        <>
          <h3 className="soustitre soustitre--serre">Résumé</h3>
          <p className="fiche__resume">{oeuvre.resume}</p>
        </>
      ) : null}

      <div className={`identite${locale ? '' : ' identite--ok'}`}>
        <div className="identite__tete">
          <Icon name={locale ? 'alerte' : 'valider'} size={18} />
          <b>{locale ? 'Identification incomplète' : 'Œuvre identifiée'}</b>
        </div>
        <p className="identite__cle">{oeuvre.oeuvreId}</p>
        <p className="identite__detail">
          {locale
            ? 'Ce livre n’a pas été reconnu par Open Library. Si tu le vois en double dans ta bibliothèque, rattache-le à l’autre.'
            : 'Open Library a reconnu ce texte : ses autres éditions peuvent le rejoindre.'}
        </p>
        <button type="button" className="btn btn--large" onClick={() => setSousModale({ type: 'rattacher' })}>
          Rattacher à une œuvre existante
        </button>
      </div>
    </Modal>
  );
}
