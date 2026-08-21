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
import { LIBELLES, STATUTS, classeStatut } from '../status.js';
import { notify } from '../notify.js';
import SearchBar from '../components/SearchBar.jsx';
import BookCard from '../components/BookCard.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

/*
 * REGROUPEMENT PAR AUTEUR (retour d'usage 81). « La recherche par auteur me
 * donne des livres plutot qu'une liste d'auteurs et leurs oeuvres. »
 *
 * Une vraie liste d'auteurs a ete mesuree puis ECARTEE : Open Library est la
 * seule source qui en propose une (`/search/authors.json`) et elle met de
 * 3,8 a 51 SECONDES, en rendant des doublons (« BernarD Werber » et
 * « Bernard Werber » sont deux fiches distinctes). Google Books, lui, n'a
 * aucun point d'entree « auteurs ».
 *
 * Mais Google rend deja le nom de l'auteur avec chaque livre : le regroupement
 * se fait donc ICI, sur ce qu'on a deja, sans un seul appel de plus et sans
 * une seconde d'attente. L'auteur cherche vient en tete, les homonymes en
 * dessous — ce sont eux, et non le manque de liste, qui brouillaient l'ecran.
 */
function sansAccent(texte) {
  return String(texte || '').toLowerCase().normalize('NFD')
    // Meme precaution qu'en §books.js : les signes combinants s'ecrivent en
    // echappement, jamais en caracteres bruts — ils sont invisibles, et une
    // copie de fichier peut les avaler sans que rien ne le signale.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * Cle de regroupement d'un auteur. Google Books n'a AUCUN identifiant
 * d'auteur : il n'a que des chaines, et il ecrit le meme ecrivain de
 * plusieurs facons. Constate sur appels reels :
 *   « Alexandre Dumas » / « Alexandre Dumas (père) » / « Alexandre Dumas (1802-1870) »
 *   « John Ronald Reuel Tolkien » / « J.R.R. Tolkien » / « Tolkien J.R.R. »
 *   « Herbert George Wells » / « H.G Wells » / « H. G. Wells, H. G. »
 * Deux formes sur quatre recherches testees : ce n'est pas un cas limite.
 *
 * La cle est « nom de famille + initiales des autres mots, dedoublonnees et
 * triees ». Deux choix, tous deux corriges apres mesure :
 *
 *  - Le nom de famille est le DERNIER mot de plus d'une lettre. Une premiere
 *    version prenait « le mot le plus long » : elle echouait sur « Herbert
 *    George Wells », ou le prenom est plus long que le nom, et laissait Wells
 *    en quatre groupes. Le dernier mot long marche aussi sur les inversions
 *    (« Tolkien J.R.R. »), ou les initiales suivent le nom.
 *  - Les initiales sont DEDOUBLONNEES : « Herbert George Wells H G » repete
 *    les memes initiales sous deux formes dans une seule chaine.
 *
 * LIMITE ASSUMEE : deux auteurs partageant nom de famille ET initiales se
 * retrouvent fusionnes (« Alexandre Dumas » et « André Dumas »). C'est un
 * ecran de recherche, pas un catalogue de bibliotheque ; les titres affiches
 * montrent immediatement si quelque chose detonne.
 */
function cleAuteur(nom) {
  const propre = sansAccent(String(nom || '').replace(/\([^)]*\)/g, ' ').replace(/[.,]/g, ' '));
  const mots = propre.split(' ').filter(Boolean);
  if (mots.length === 0) return '';

  const longs = mots.filter((m) => m.length > 1);
  const famille = longs.length ? longs[longs.length - 1] : mots[mots.length - 1];

  const initiales = [...new Set(
    mots.filter((m) => m !== famille).map((m) => m[0]),
  )].sort().join('');

  return `${famille}|${initiales}`;
}

/* Le nom LISIBLE, pour juger de la proximite avec ce que l'utilisateur a tape.
 * La cle ci-dessus ne convient pas : « werber » ne se retrouve pas dans
 * « bernard|w ». */
function nomComparable(nom) {
  return sansAccent(String(nom || '').replace(/\([^)]*\)/g, ' '));
}

function grouperParAuteur(resultats, requete) {
  const cherche = sansAccent(requete);
  const groupes = new Map();

  resultats.forEach((r) => {
    const nom = (r.auteurs && r.auteurs[0]) || 'Auteur inconnu';
    const cle = cleAuteur(nom);
    if (!groupes.has(cle)) groupes.set(cle, { nom, livres: [] });
    const g = groupes.get(cle);
    // Entre deux ecritures du meme auteur, on affiche la plus courte : c'est
    // la forme canonique, celle sans les dates ni la mention entre
    // parentheses. « Alexandre Dumas » plutot que « Alexandre Dumas (père) ».
    if (nom.length < g.nom.length) g.nom = nom;
    g.livres.push(r);
  });

  /* 3 = le nom demande exactement ; 2 = il le contient ; 1 = tous les mots y
     sont (« werber » trouve « Bernard Werber ») ; 0 = un homonyme. */
  const proximite = (nom) => {
    const c = nomComparable(nom);
    if (!cherche) return 0;
    if (c === cherche) return 3;
    if (c.includes(cherche)) return 2;
    return cherche.split(' ').every((mot) => c.includes(mot)) ? 1 : 0;
  };

  return [...groupes.values()]
    .map((g) => ({ ...g, proximite: proximite(g.nom) }))
    .sort((a, b) => (b.proximite - a.proximite) || (b.livres.length - a.livres.length));
}

/*
 * « il y a 5 minutes » plutot qu'une date : ce qui compte pour l'utilisateur
 * n'est pas QUAND la recherche a ete faite, mais a quel point elle est vieille.
 */
function ageLisible(pose) {
  const minutes = Math.round((Date.now() - pose) / 60000);
  if (minutes < 2) return 'de tout à l’heure';
  if (minutes < 60) return `d’il y a ${minutes} minutes`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return heures === 1 ? 'd’il y a une heure' : `d’il y a ${heures} heures`;
  const jours = Math.round(heures / 24);
  return jours === 1 ? 'd’hier' : `d’il y a ${jours} jours`;
}

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

      {/*
        Appui long sur un resultat (retour d'usage 83) : choisir la categorie
        AJOUTE le livre et lui pose le statut d'un seul geste. Le detour par la
        fiche n'etait pas une etape utile, c'etait un passage oblige.
      */}
      {categorieCible && (
        <Modal titre={categorieCible.titre} onFermer={() => setCategorieCible(null)}>
          <p className="hint">Dans quelle catégorie veux-tu le ranger ?</p>
          <div className="statuts">
            {STATUTS.map((st) => (
              <button
                key={st}
                type="button"
                className={`statbtn ${classeStatut(st)}`}
                onClick={async () => {
                  const livre = categorieCible;
                  setCategorieCible(null);
                  const oeuvreId = await onSuivre(livre, true);
                  if (!oeuvreId) return;
                  try {
                    await setStatut(oeuvreId, st);
                    await onChangement();
                    notify(`« ${livre.titre} » — ${LIBELLES[st]}.`, 'info');
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <span className="statbtn__led" />
                <span>{LIBELLES[st]}</span>
              </button>
            ))}
          </div>
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
