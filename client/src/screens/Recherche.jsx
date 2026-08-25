/*
 * Recherche.jsx — l'écran de recherche. Écran à part dès le premier jour :
 * le projet séries l'avait écrit dans App.jsx, qui a fini à 656 lignes (§2.2).
 * N'importe que api.js et ses composants (§2, règle 1).
 * Applique §4.7 : compteur de séquence anti-course sur la frappe — trois
 * lignes qui remplacent une librairie de requêtes, hérité tel quel.
 * Ouvrir un résultat déclenche l'identification Open Library ; jamais pendant
 * la frappe (§4.3, quota). Suivre un livre ne pose AUCUNE question (§9).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  rechercherAvecEtat, identifierResultat, getSuggestions, scanDisponible, scannerIsbn,
  creerOeuvreManuelle, setStatut,
} from '../api.js';
import { LIBELLES, STATUTS, classeStatut, ageLisible } from '../status.js';
import { grouperParAuteur } from '../auteurs.js';
import { notify } from '../notify.js';
import SearchBar from '../components/SearchBar.jsx';
import BookCard from '../components/BookCard.jsx';
import Modal from '../components/Modal.jsx';
import FicheResultat from '../components/FicheResultat.jsx';
import MenuCategorie from '../components/MenuCategorie.jsx';
import CreationManuelle from '../components/CreationManuelle.jsx';
import Icon from '../components/Icon.jsx';

export default function Recherche({ editionsSuivies, onSuivre, onChangement }) {
  const [mode, setMode] = useState('titre');
  const [resultats, setResultats] = useState([]);
  const [etat, setEtat] = useState('vide'); // vide|charge|fait|erreur
  const [ouvert, setOuvert] = useState(null);
  const [identite, setIdentite] = useState(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [messageErreur, setMessageErreur] = useState(null);
  // Age des resultats affiches : non nul = ils viennent de l'archive (§4.7).
  const [poseArchive, setPoseArchive] = useState(null);
  // Le texte reellement interroge — sert a mettre l'auteur cherche en tete.
  const [derniereRequete, setDerniereRequete] = useState('');
  // Livre sur lequel on vient de faire un appui long, pour choisir sa categorie.
  const [categorieCible, setCategorieCible] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsEnCours, setSuggestionsEnCours] = useState(false);
  const [scanPossible, setScanPossible] = useState(false);
  const [ajoutRapide, setAjoutRapide] = useState(null);   // cleSource en cours d'ajout
  const [saisie, setSaisie] = useState(null);             // formulaire de creation manuelle

  // Une seule interrogation de l'appareil, au montage : la camera ne change
  // pas d'avis en cours de route.
  useEffect(() => { scanDisponible().then(setScanPossible).catch(() => setScanPossible(false)); }, []);

  /*
   * Les groupes ne se calculent qu'en mode Auteur : c'est le seul mode ou la
   * question « de qui ? » se pose. En Titre ou ISBN, regrouper n'aurait aucun
   * sens — on cherche une oeuvre precise, pas une bibliographie.
   */
  const groupes = useMemo(
    () => (mode === 'auteur' && resultats.length > 0
      ? grouperParAuteur(resultats, derniereRequete)
      : null),
    [mode, resultats, derniereRequete],
  );

  const sequence = useRef(0);
  // Ce qu'il faut rejouer quand l'utilisateur touche « Reessayer ».
  const derniere = useRef(null);
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
    setPoseArchive(null);
  }, []);

  const revenirAuVide = useCallback(() => {
    sequence.current += 1;
    setResultats([]);
    setEtat('vide');
    setMessageErreur(null);
    setPoseArchive(null);
  }, []);

  const lancer = useCallback(async (texte, modeCourant) => {
    const seq = ++sequence.current;
    derniere.current = { texte, mode: modeCourant };
    setDerniereRequete(texte);
    setEtat('charge');
    try {
      const { resultats: trouves, ancien, pose } = await rechercherAvecEtat(texte, modeCourant);
      if (seq !== sequence.current) return;   // une frappe plus récente a gagné
      setResultats(trouves);
      setPoseArchive(ancien ? pose : null);
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
    derniere.current = { texte: isbn, mode: 'isbn' };
    const seq = ++sequence.current;
    setEtat('charge');
    try {
      const { resultats: trouves, ancien, pose } = await rechercherAvecEtat(isbn, 'isbn');
      if (seq !== sequence.current) return;
      setResultats(trouves);
      setPoseArchive(ancien ? pose : null);
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

  /* Une seule definition de la carte de resultat : la grille simple et les
     grilles par auteur doivent rester identiques a la virgule pres. */
  const carteResultat = (r) => (
    <BookCard
      key={r.cleSource}
      resultat={r}
      marque={editionsSuivies.has(r.cleSource)}
      onOuvrir={ouvrir}
      onAppuiLong={() => setCategorieCible(r)}
      onAjoutRapide={ajouterVite}
      ajoutEnCours={ajoutRapide === r.cleSource}
    />
  );

  /*
   * Ranger un resultat dans une categorie : on l'ajoute EN SILENCE (le message
   * final dit deja tout), puis on lui pose son statut. `ajouterOeuvre` est
   * idempotent, donc un livre deja suivi voit simplement son statut changer.
   */
  const rangerDansCategorie = useCallback(async (livre, statut) => {
    setCategorieCible(null);
    const oeuvreId = await onSuivre(livre, true);
    if (!oeuvreId) return;
    try {
      await setStatut(oeuvreId, statut);
      await onChangement();
      notify(`« ${livre.titre} » — ${LIBELLES[statut]}.`, 'info');
    } catch (e) {
      notify(e.message);
    }
  }, [onSuivre, onChangement]);

  const creerALaMain = useCallback(async () => {
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
  }, [saisie, onChangement]);

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

      {/*
        Une erreur n'est plus un cul-de-sac (§4.7, tranche 10). Six essais
        laissent environ 4 % des recherches en echec, et il n'y a rien a faire
        de plus cote reseau : la seule reponse utile est de rendre le nouvel
        essai IMMEDIAT, sans retaper.
      */}
      {etat === 'erreur' && (
        <div className="suggestions">
          <p className="error">{messageErreur || 'La recherche a échoué.'}</p>
          <button
            type="button"
            className="btn btn--large"
            onClick={() => {
              const d = derniere.current;
              if (d) lancer(d.texte, d.mode);
            }}
          >
            <Icon name="actualiser" size={16} />
            <span>Réessayer</span>
          </button>
        </div>
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
                  onAppuiLong={() => setCategorieCible(r)}
                  onAjoutRapide={ajouterVite}
                  ajoutEnCours={ajoutRapide === r.cleSource}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {poseArchive ? (
        <p className="hint hint--archive">
          <Icon name="alerte" size={16} />
          <span>
            Google Books ne répond pas. Voici ta recherche {ageLisible(poseArchive)},
            gardée sur l’appareil.
          </span>
        </p>
      ) : null}

      {/*
        En mode Auteur, les livres sont presentes PAR AUTEUR : l'auteur cherche
        d'abord, les homonymes en dessous, sous un intertitre qui le dit. Dans
        les autres modes, la grille reste telle quelle — regrouper n'y aurait
        aucun sens.
      */}
      {groupes ? (
        groupes.map((g, rang) => (
          <div key={g.nom} className="groupe-auteur">
            {rang === 1 && g.proximite === 0 ? (
              <p className="hint groupe-auteur__separateur">
                Autres auteurs portant un nom proche
              </p>
            ) : null}
            <h2 className="soustitre soustitre--serre groupe-auteur__nom">
              <span>{g.nom}</span>
              <span className="groupe-auteur__compte">
                {g.livres.length} livre{g.livres.length > 1 ? 's' : ''}
              </span>
            </h2>
            <div className="grille">
              {g.livres.map((r) => carteResultat(r))}
            </div>
          </div>
        ))
      ) : resultats.length > 0 ? (
        <div className="grille">{resultats.map((r) => carteResultat(r))}</div>
      ) : null}

      {saisie && (
        <CreationManuelle
          saisie={saisie}
          onChange={(champ, valeur) => setSaisie((v) => ({ ...v, [champ]: valeur }))}
          onValider={creerALaMain}
          onFermer={() => setSaisie(null)}
        />
      )}

      {/*
        Appui long sur un resultat (retour d'usage 83) : choisir la categorie
        AJOUTE le livre et lui pose le statut d'un seul geste. Le detour par la
        fiche n'etait pas une etape utile, c'etait un passage oblige.
      */}
      {categorieCible && (
        <MenuCategorie
          titre={categorieCible.titre}
          onFermer={() => setCategorieCible(null)}
          onChoisir={(st) => rangerDansCategorie(categorieCible, st)}
        />
      )}

      {ouvert && (
        <FicheResultat
          resultat={ouvert}
          identite={identite}
          dejaSuivi={dejaSuivi}
          ajoutEnCours={ajoutEnCours}
          onSuivre={suivre}
          onFermer={fermer}
        />
      )}
    </section>
  );
}
