/*
 * Recherche.jsx — l'écran de recherche. Écran à part dès le premier jour :
 * le projet séries l'avait écrit dans App.jsx, qui a fini à 656 lignes (§2.2).
 * N'importe que api.js et ses composants (§2, règle 1).
 * Applique §4.7 : compteur de séquence anti-course sur la frappe — trois
 * lignes qui remplacent une librairie de requêtes, hérité tel quel.
 * Ouvrir un résultat déclenche l'identification Open Library ; jamais pendant
 * la frappe (§4.3, quota). Suivre un livre ne pose AUCUNE question (§9).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  rechercher, identifierResultat, getSuggestions, scanDisponible, scannerIsbn,
  creerOeuvreManuelle,
} from '../api.js';
import { notify } from '../notify.js';
import SearchBar from '../components/SearchBar.jsx';
import BookCard from '../components/BookCard.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

export default function Recherche({ editionsSuivies, onSuivre, onChangement }) {
  const [mode, setMode] = useState('titre');
  const [resultats, setResultats] = useState([]);
  const [etat, setEtat] = useState('vide'); // vide|charge|fait|erreur
  const [ouvert, setOuvert] = useState(null);
  const [identite, setIdentite] = useState(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [messageErreur, setMessageErreur] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsEnCours, setSuggestionsEnCours] = useState(false);
  const [scanPossible, setScanPossible] = useState(false);
  const [ajoutRapide, setAjoutRapide] = useState(null);   // cleSource en cours d'ajout
  const [saisie, setSaisie] = useState(null);             // formulaire de creation manuelle

  // Une seule interrogation de l'appareil, au montage : la camera ne change
  // pas d'avis en cours de route.
  useEffect(() => { scanDisponible().then(setScanPossible).catch(() => setScanPossible(false)); }, []);

  const sequence = useRef(0);
  const ouvrirRef = useRef(null);

  /*
   * Changer de mode vide les résultats. Sans cela, passer de Auteur à ISBN
   * laisse à l'écran vingt livres qui ne répondent plus à ce qui est affiché
   * dans le champ — constaté au navigateur, et trompeur.
   */
  const changerMode = useCallback((suivant) => {
    sequence.current += 1;
    setMode(suivant);
    setResultats([]);
    setEtat('vide');
  }, []);

  const revenirAuVide = useCallback(() => {
    sequence.current += 1;
    setResultats([]);
    setEtat('vide');
    setMessageErreur(null);
  }, []);

  const lancer = useCallback(async (texte, modeCourant) => {
    const seq = ++sequence.current;
    setEtat('charge');
    try {
      const trouves = await rechercher(texte, modeCourant);
      if (seq !== sequence.current) return;   // une frappe plus récente a gagné
      setResultats(trouves);
      setEtat('fait');
    } catch (e) {
      if (seq !== sequence.current) return;
      setEtat('erreur');
      // Le message vient DEJA traduit de la source (§4.7). L'ecraser par une
      // phrase generique perdait l'information utile : « Google Books est
      // momentanement indisponible » n'appelle pas la meme reaction que
      // « Trop de recherches pour aujourd'hui ».
      setMessageErreur(e.message);
      notify(e.message);
    }
  }, []);

  /*
   * §4.6 point 6 : les suggestions sont calculees A LA DEMANDE, jamais au
   * demarrage. Quinze appels Google par actualisation sur un quota de 1 000
   * par jour partage : les declencher a chaque ouverture de l'application
   * viderait la journee en quelques lancements.
   */
  const actualiserSuggestions = useCallback(async () => {
    setSuggestionsEnCours(true);
    try {
      setSuggestions(await getSuggestions());
    } catch (e) {
      notify(e.message);
    } finally {
      setSuggestionsEnCours(false);
    }
  }, []);

  /*
   * Scan : l'objectif du §8 est « scanner un livre de l'etagere l'ajoute en
   * 3 secondes ». On enchaine donc sans etape inutile — lecture du code,
   * recherche, et si UN seul livre correspond, sa fiche s'ouvre directement.
   * Plusieurs resultats : on montre la grille plutot que de choisir a sa place.
   */
  const scanner = useCallback(async () => {
    const { isbn, raison } = await scannerIsbn();
    if (!isbn) { if (raison) notify(raison); return; }

    setMode('isbn');
    const seq = ++sequence.current;
    setEtat('charge');
    try {
      const trouves = await rechercher(isbn, 'isbn');
      if (seq !== sequence.current) return;
      setResultats(trouves);
      setEtat('fait');
      if (trouves.length === 0) {
        notify(`Aucun livre trouve pour l'ISBN ${isbn}. Il n'est peut-etre pas catalogue.`);
      } else if (trouves.length === 1) {
        ouvrirRef.current(trouves[0]);
      }
    } catch (e) {
      if (seq !== sequence.current) return;
      setEtat('erreur');
      setMessageErreur(e.message);
      notify(e.message);
    }
  }, []);

  const ouvrir = useCallback(async (resultat) => {
    setOuvert(resultat);
    setIdentite(null);
    try {
      const { identite: trouvee, resultat: complete } = await identifierResultat(resultat);
      setOuvert(complete);
      setIdentite(trouvee);
    } catch (e) {
      notify(e.message);
    }
  }, []);

  ouvrirRef.current = ouvrir;

  const fermer = useCallback(() => { setOuvert(null); setIdentite(null); }, []);

  const suivre = useCallback(async () => {
    setAjoutEnCours(true);
    try {
      await onSuivre(ouvert);
      fermer();
    } finally {
      setAjoutEnCours(false);
    }
  }, [ouvert, onSuivre, fermer]);

  /*
   * Ajout rapide depuis la grille : plus besoin d'ouvrir la fiche pour suivre
   * un livre. L'ajout est instantane (voir api.js) — l'identification se fait
   * apres coup, en tache de fond.
   */
  const ajouterVite = useCallback(async (resultat) => {
    setAjoutRapide(resultat.cleSource);
    try {
      await onSuivre(resultat);
    } finally {
      setAjoutRapide(null);
    }
  }, [onSuivre]);

  const dejaSuivi = ouvert ? editionsSuivies.has(ouvert.cleSource) : false;

  return (
    <section className="recherche">
      <SearchBar
        mode={mode}
        onChangerMode={changerMode}
        onRechercher={lancer}
        onVider={revenirAuVide}
        onScanner={scanner}
        scanPossible={scanPossible}
      />

      {etat === 'charge' && <p className="hint">Recherche en cours…</p>}

      {etat === 'erreur' && (
        <p className="error">{messageErreur || 'La recherche a échoué.'}</p>
      )}

      {etat === 'fait' && resultats.length === 0 && (
        <div className="suggestions">
          <p className="hint">
            Aucun livre trouvé. Essaie avec moins de mots, ou change de mode :
            un nom d’auteur donne souvent plus qu’un titre approximatif.
          </p>
          {/*
            Certains livres n'existent dans AUCUN catalogue public : mesuré sur
            huit ISBN français, trois sont absents de Google ET d'Open Library.
            §3.2 prévoit l'empreinte locale pour « les vieux fonds,
            l'autoédition et les livres non catalogués » — voici de quoi en
            créer un.
          */}
          <button
            type="button"
            className="btn btn--large"
            onClick={() => setSaisie({ titre: '', auteurs: '', annee: '', isbn13: '', format: 'papier', nbPages: '' })}
          >
            <Icon name="plus" size={16} />
            <span>Ajouter ce livre à la main</span>
          </button>
          <p className="carte__detail">
            Certains livres ne figurent dans aucun catalogue public. Tu peux
            l’enregistrer toi-même : il se comportera comme les autres.
          </p>
        </div>
      )}

      {etat === 'vide' && (
        <div className="suggestions">
          <p className="hint">
            Tape un titre, un nom d’auteur, ou les chiffres de l’ISBN au dos du
            livre.
          </p>

          <div className="suggestions__tete">
            <h2 className="soustitre soustitre--serre">Pour toi</h2>
            <button
              type="button"
              className="btn btn--fantome"
              onClick={actualiserSuggestions}
              disabled={suggestionsEnCours}
            >
              <Icon name="actualiser" size={16} />
              <span>{suggestionsEnCours ? 'Recherche…' : 'Actualiser'}</span>
            </button>
          </div>

          {suggestions === null && !suggestionsEnCours && (
            <p className="hint">
              Touche « Actualiser » pour voir des livres proposés à partir de ce
              que tu as lu. Ce n’est pas automatique : chaque actualisation
              consomme des recherches, autant que tu décides quand.
            </p>
          )}

          {suggestions !== null && suggestions.length === 0 && !suggestionsEnCours && (
            <p className="hint">
              Rien à proposer pour l’instant. Marque des livres comme lus ou en
              cours : c’est à partir d’eux que les suggestions se construisent.
            </p>
          )}

          {suggestions !== null && suggestions.length > 0 && (
            <div className="grille">
              {suggestions.map((r) => (
                <BookCard
                  key={r.cleSource}
                  resultat={r}
                  marque={editionsSuivies.has(r.cleSource)}
                  raison={r.raison}
                  onOuvrir={ouvrir}
                  onAjoutRapide={ajouterVite}
                  ajoutEnCours={ajoutRapide === r.cleSource}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {resultats.length > 0 && (
        <div className="grille">
          {resultats.map((r) => (
            <BookCard
              key={r.cleSource}
              resultat={r}
              marque={editionsSuivies.has(r.cleSource)}
              onOuvrir={ouvrir}
              onAjoutRapide={ajouterVite}
              ajoutEnCours={ajoutRapide === r.cleSource}
            />
          ))}
        </div>
      )}

      {saisie && (
        <Modal
          titre="Ajouter un livre à la main"
          onFermer={() => setSaisie(null)}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={() => setSaisie(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn--primaire"
                onClick={async () => {
                  try {
                    await creerOeuvreManuelle({
                      ...saisie,
                      nbPages: saisie.nbPages ? Number(saisie.nbPages) : null,
                    });
                    setSaisie(null);
                    await onChangement();
                    notify(`« ${saisie.titre.trim()} » est dans ta bibliothèque.`, 'info');
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                Ajouter
              </button>
            </>
          )}
        >
          <p className="hint">
            Seul le titre est obligatoire. Le reste se complète depuis la fiche,
            quand tu veux.
          </p>
          {[
            ['titre', 'Titre du livre'],
            ['auteurs', 'Auteur'],
            ['annee', 'Année'],
            ['isbn13', 'ISBN (facultatif)'],
            ['nbPages', 'Nombre de pages'],
          ].map(([champ, libelle]) => (
            <input
              key={champ}
              className="champ__saisie champ__saisie--encadre"
              value={saisie[champ]}
              onChange={(e) => setSaisie((v) => ({ ...v, [champ]: e.target.value }))}
              placeholder={libelle}
              aria-label={libelle}
              inputMode={champ === 'annee' || champ === 'nbPages' || champ === 'isbn13' ? 'numeric' : 'text'}
              autoFocus={champ === 'titre'}
            />
          ))}
        </Modal>
      )}

      {ouvert && (
        <Modal
          titre={ouvert.titre}
          onFermer={fermer}
          actions={(
            <>
              <button type="button" className="btn btn--fantome" onClick={fermer}>Fermer</button>
              <button
                type="button"
                className="btn btn--primaire"
                onClick={suivre}
                disabled={dejaSuivi || ajoutEnCours}
              >
                <Icon name={dejaSuivi ? 'valider' : 'plus'} size={18} />
                <span>{dejaSuivi ? 'Déjà suivi' : (ajoutEnCours ? 'Ajout…' : 'Suivre')}</span>
              </button>
            </>
          )}
        >
          {ouvert.sousTitre ? <p className="fiche__sous-titre">{ouvert.sousTitre}</p> : null}

          <div className="fiche__lignes">
            <div className="fiche__ligne">
              <span>Auteurs</span>
              <b>{ouvert.auteurs.join(', ') || 'inconnus'}</b>
            </div>
            <div className="fiche__ligne">
              <span>Parution</span>
              <b>{ouvert.datePublication || 'inconnue'}</b>
            </div>
            <div className="fiche__ligne">
              <span>Éditeur</span>
              <b>{ouvert.editeur || 'inconnu'}</b>
            </div>
            <div className="fiche__ligne">
              <span>ISBN</span>
              <b>{ouvert.isbn13 || ouvert.isbn10 || 'aucun'}</b>
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

          {ouvert.resume ? <p className="fiche__resume">{ouvert.resume}</p> : null}
        </Modal>
      )}
    </section>
  );
}
