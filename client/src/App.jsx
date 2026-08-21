/*
 * App.jsx — coquille : état partagé, navigation, overlays. Cible < 300 lignes (§2.2).
 * App.jsx EST le store (§9, hérité) : il détient la Map du suivi et distribue
 * des callbacks par props ; aucune librairie d'état.
 * Applique §9 : rechargement complet après chaque écriture, jamais de mise à
 * jour optimiste — brutal sur une base locale, mais cela élimine toute une
 * classe de bugs de désynchronisation.
 * N'importe QUE api.js, status.js et notify.js (§2, règle 1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  demarrer, etatBase, getBibliotheque, ajouterOeuvre,
  setStatut, getClesEditions, setActiveProfileId, surChangementDeFond, getProfilActif,
  quotaDuJour,
} from './api.js';
import { LIBELLES, STATUTS, classeStatut } from './status.js';
import { notify } from './notify.js';
import Icon from './components/Icon.jsx';
import Modal from './components/Modal.jsx';
import Toast from './components/Toast.jsx';
import Recherche from './screens/Recherche.jsx';
import Bibliotheque from './screens/Bibliotheque.jsx';
import Backup from './components/Backup.jsx';
import Detail from './components/Detail.jsx';
import ProfileSelector from './components/ProfileSelector.jsx';
import Progression from './components/Progression.jsx';
import MaLecture from './screens/MaLecture.jsx';

const ONGLETS = [
  { cle: 'recherche', libelle: 'Recherche', icone: 'recherche' },
  { cle: 'lecture', libelle: 'Ma lecture', icone: 'livre' },
  { cle: 'bibliotheque', libelle: 'Bibliothèque', icone: 'bibliotheque' },
  { cle: 'reglages', libelle: 'Réglages', icone: 'reglages' },
];

const ACCUEIL = 'recherche';

export default function App() {
  const [view, setView] = useState(ACCUEIL);
  const [etat, setEtat] = useState(null);
  const [nomProfil, setNomProfil] = useState('');
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [bibliotheque, setBibliotheque] = useState([]);
  const [editionsSuivies, setEditionsSuivies] = useState(() => new Set());
  const [statutCible, setStatutCible] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [progressionId, setProgressionId] = useState(null);
  const [sauvegardeOuverte, setSauvegardeOuverte] = useState(false);
  const [quota, setQuota] = useState(null);

  /*
   * §9 prescrit une « Map du suivi en mémoire », héritée du projet séries, où
   * elle donnait l'appartenance en O(1) depuis n'importe quelle grille.
   * Elle ne se transpose PAS telle quelle ici : une carte de recherche ne
   * connaît pas encore son identifiant d'œuvre — le résoudre demanderait un
   * appel Open Library par résultat, ce que §4.3 interdit. L'équivalent utile
   * est donc un Set des clés d'ÉDITION, qui sont celles des résultats.
   * La Map par oeuvre_id reviendra quand un écran en aura l'usage (tranche 5).
   */
  const recharger = useCallback(async () => {
    try {
      /*
       * Le nom affiche vient du profil ACTIF, pas de `etatBase()`. Celui-ci
       * rend le profil cree d'office au premier demarrage : l'en-tete restait
       * donc bloque sur « Moi » meme apres avoir change de profil. C'est ce
       * qui donnait l'impression qu'on ne pouvait pas choisir.
       */
      const [livres, cles, etatBd, profil] = await Promise.all([
        getBibliotheque(), getClesEditions(), etatBase(), getProfilActif(),
      ]);
      setBibliotheque(livres);
      setEditionsSuivies(new Set(cles));
      setEtat(etatBd);
      setNomProfil(profil ? profil.name : '');
    } catch (e) {
      notify(`La bibliothèque n'a pas pu être lue : ${e.message}`);
    }
  }, []);

  useEffect(() => {
    demarrer()
      .then(recharger)
      .catch((e) => notify(`La base n'a pas pu s'ouvrir : ${e.message}`));
  }, [recharger]);

  /*
   * L'identification d'un livre ajoute se termine APRES l'ajout (voir api.js) :
   * quand elle aboutit, la cle de l'oeuvre change et l'ecran doit suivre.
   */
  useEffect(() => { surChangementDeFond(recharger); return () => surChangementDeFond(null); }, [recharger]);

  /* Relu a chaque affichage des Reglages : le compteur bouge a chaque recherche. */
  useEffect(() => {
    if (view !== 'reglages') return;
    quotaDuJour().then(setQuota).catch(() => setQuota(null));
  }, [view]);

  /*
   * Rend l'identifiant de l'oeuvre ajoutee. L'appel restait muet, ce qui
   * interdisait d'enchainer une action dessus — or l'appui long depuis la
   * recherche (retour d'usage 83) doit ajouter le livre PUIS lui poser un
   * statut. `ajouterOeuvre` est idempotent (INSERT OR IGNORE), donc un livre
   * deja suivi rend simplement sa cle existante.
   */
  const suivre = useCallback(async (resultat, silencieux = false) => {
    try {
      const oeuvreId = await ajouterOeuvre(resultat);
      await recharger();
      if (!silencieux) notify(`« ${resultat.titre} » est dans ta bibliothèque.`, 'info');
      return oeuvreId;
    } catch (e) {
      notify(`Impossible d'ajouter ce livre : ${e.message}`);
      return null;
    }
  }, [recharger]);

  const changerStatut = useCallback(async (oeuvreId, statut) => {
    setStatutCible(null);
    try {
      await setStatut(oeuvreId, statut);
      await recharger();
    } catch (e) {
      notify(`Le statut n'a pas pu être changé : ${e.message}`);
    }
  }, [recharger]);

  /*
   * La fiche est désignée par son identifiant, pas par une copie de l'objet :
   * après un rattachement ou un retrait, l'œuvre disparaît de la bibliothèque
   * et la fiche se ferme d'elle-même, au lieu d'afficher un livre qui n'existe
   * plus.
   */
  const detailCible = useMemo(
    () => bibliotheque.find((o) => o.oeuvreId === detailId) || null,
    [bibliotheque, detailId],
  );

  const progressionCible = useMemo(
    () => bibliotheque.find((o) => o.oeuvreId === progressionId) || null,
    [bibliotheque, progressionId],
  );

  const basculerTheme = useCallback(() => {
    const suivant = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = suivant;
    localStorage.setItem('theme', suivant);
    setTheme(suivant);
  }, [theme]);

  /*
   * Bouton retour Android (§6) : overlay -> onglet -> onglet d'accueil -> sortie.
   * Ré-abonné à chaque changement d'état d'affichage, sinon il travaille sur
   * des valeurs figées et quitte l'application au premier appui.
   */
  useEffect(() => {
    const abonnement = CapApp.addListener('backButton', () => {
      if (document.querySelector('.sheet')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      } else if (view !== ACCUEIL) {
        setView(ACCUEIL);
      } else {
        CapApp.exitApp();
      }
    });
    return () => { abonnement.then((a) => a.remove()); };
  }, [view]);

  // Un seul objet passé à toutes les grilles, hérité du projet séries.
  const cardProps = useMemo(
    () => ({ onOuvrir: (o) => setDetailId(o.oeuvreId), onAppuiLong: setStatutCible }),
    [],
  );

  return (
    <>
      <header className="appbar">
        <span className="appbar__marque">Suivi Lecture</span>
        {nomProfil ? <span className="appbar__profil">{nomProfil}</span> : null}
      </header>

      <main className="content">
        {view === 'recherche' && <Recherche editionsSuivies={editionsSuivies} onSuivre={suivre} onChangement={recharger} />}

        {view === 'lecture' && (
          <MaLecture
            bibliotheque={bibliotheque}
            cardProps={cardProps}
            onProgression={(o) => setProgressionId(o.oeuvreId)}
          />
        )}

        {view === 'bibliotheque' && (
          <Bibliotheque bibliotheque={bibliotheque} cardProps={cardProps} />
        )}

        {view === 'reglages' && (
          <section className="reglages">
            <ProfileSelector onChangement={recharger} />

            <div className="carte">
              <h2 className="carte__titre">Affichage</h2>
              <div className="carte__ligne">
                <span>Thème {theme === 'dark' ? 'sombre' : 'clair'}</span>
                <button type="button" className="btn btn--fantome" onClick={basculerTheme}>
                  <Icon name={theme === 'dark' ? 'soleil' : 'lune'} size={18} />
                  <span>Basculer</span>
                </button>
              </div>
            </div>

            <div className="carte">
              <h2 className="carte__titre">Mes données</h2>
              <div className="carte__ligne"><span>Livres suivis</span><b>{bibliotheque.length}</b></div>
              <div className="carte__ligne">
                <span>Sauvegarde</span>
                <button type="button" className="btn btn--fantome" onClick={() => setSauvegardeOuverte(true)}>
                  <Icon name="sauver" size={18} />
                  <span>Ouvrir</span>
                </button>
              </div>
              <p className="carte__detail">
                Tout est enregistré sur cet appareil, et nulle part ailleurs.
                Une sauvegarde est le seul moyen de retrouver ta bibliothèque si
                tu changes de téléphone.
              </p>
            </div>

            {/*
              Le quota Google etait INVISIBLE : on ne decouvrait l'avoir epuise
              qu'en recevant « Trop de recherches pour aujourd'hui », c'est-a-dire
              quand il n'y avait plus rien a faire de la journee. Le rendre
              visible, c'est permettre de le menager.
            */}
            <div className="carte">
              <h2 className="carte__titre">Recherches du jour</h2>
              <div className="carte__ligne">
                <span>Utilisées aujourd’hui</span>
                <b>{quota ? `${quota.utilises} / ${quota.total}` : '…'}</b>
              </div>
              <p className="carte__detail">
                Google Books limite l’application à {quota ? quota.total : 1000} recherches
                par jour. Une recherche au fil de la frappe en consomme une ;
                le bouton « Actualiser » des suggestions en consomme une quinzaine,
                mais une seule fois par jour — ensuite il ressert le même résultat
                tant que ta bibliothèque n’a pas changé.
              </p>
            </div>

            <div className="carte">
              <h2 className="carte__titre">Base de données</h2>
              {etat ? (
                <>
                  <div className="carte__ligne"><span>Plateforme</span><b>{etat.plateforme}</b></div>
                  <div className="carte__ligne"><span>Version du schéma</span><b>v{etat.versionSchema}</b></div>
                  <div className="carte__ligne">
                    <span>Clés étrangères</span>
                    <b>{etat.clesEtrangeres ? 'actives' : 'INACTIVES'}</b>
                  </div>
                  <div className="carte__ligne"><span>Tables</span><b>{etat.tables.length}</b></div>
                </>
              ) : (
                <p className="hint">Ouverture de la base…</p>
              )}
            </div>
          </section>
        )}
      </main>

      <nav className="tabbar">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            className={`tabbar__item${view === o.cle ? ' is-active' : ''}`}
            onClick={() => setView(o.cle)}
            aria-current={view === o.cle ? 'page' : undefined}
          >
            <Icon name={o.icone} size={22} />
            <span>{o.libelle}</span>
          </button>
        ))}
      </nav>

      {/* Appui long sur une carte : changement de statut direct (§6). */}
      {statutCible && (
        <Modal titre={statutCible.titre} onFermer={() => setStatutCible(null)}>
          <p className="hint">Où en es-tu de ce livre ?</p>
          <div className="statuts">
            {STATUTS.map((s) => (
              <button
                key={s}
                type="button"
                className={`statbtn ${classeStatut(s)}${statutCible.statut === s ? ' is-active' : ''}`}
                onClick={() => changerStatut(statutCible.oeuvreId, s)}
              >
                <span className="statbtn__led" />
                <span>{LIBELLES[s]}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {detailCible && !progressionCible && (
        <Detail
          oeuvre={detailCible}
          bibliotheque={bibliotheque}
          onFerme={() => setDetailId(null)}
          onChange={recharger}
          onProgression={() => setProgressionId(detailCible.oeuvreId)}
        />
      )}

      {progressionCible && (
        <Progression
          oeuvre={progressionCible}
          onFerme={() => setProgressionId(null)}
          onChange={recharger}
        />
      )}

      {sauvegardeOuverte && (
        <Backup
          onFerme={() => setSauvegardeOuverte(false)}
          onRestaure={async (profileId) => { await setActiveProfileId(profileId); await recharger(); }}
        />
      )}

      <Toast />
    </>
  );
}
