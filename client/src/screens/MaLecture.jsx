/*
 * MaLecture.jsx — l'onglet de reprise. Applique §6.
 * SANS suggestions, volontairement : les suggestions vivent dans Recherche.
 * Cet écran répond à une seule question — « qu'est-ce que je reprends ? » —
 * et un entonnoir de décision ne supporte pas d'être encombré.
 * Trois sections dans l'ordre : En cours, Tome suivant à lire, À paraître.
 * N'importe que api.js, status.js et ses composants (§2, règle 1).
 */

import { useMemo } from 'react';
import { progressionDe, estAParaitre } from '../status.js';
import BookCard from '../components/BookCard.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import Icon from '../components/Icon.jsx';

export default function MaLecture({ bibliotheque, cardProps, onProgression }) {
  const { enCours, tomesSuivants, aParaitre } = useMemo(() => {
    const parus = bibliotheque.filter((o) => !estAParaitre(o.datePublication));

    /*
     * Tome suivant : uniquement sur les cycles RÉELLEMENT renseignés, et
     * uniquement sur ce que l'utilisateur possède déjà (§4.4). On ne prétend
     * jamais qu'un tome existe — proposer une recherche réseau pour le tome
     * n+1 appartient aux suggestions, en tranche 6.
     */
    const plusHautLu = new Map();
    parus.forEach((o) => {
      if (!o.cycleNom || !o.cycleTome) return;
      if (o.statut !== 'lu' && o.statut !== 'en_cours') return;
      const actuel = plusHautLu.get(o.cycleNom) || 0;
      if (o.cycleTome > actuel) plusHautLu.set(o.cycleNom, o.cycleTome);
    });

    const suivants = parus.filter((o) => (
      o.statut === 'a_lire'
      && o.cycleNom && o.cycleTome
      && plusHautLu.has(o.cycleNom)
      && o.cycleTome === plusHautLu.get(o.cycleNom) + 1
    ));

    return {
      enCours: parus.filter((o) => o.statut === 'en_cours'),
      tomesSuivants: suivants,
      aParaitre: bibliotheque.filter((o) => estAParaitre(o.datePublication)),
    };
  }, [bibliotheque]);

  if (bibliotheque.length === 0) {
    return (
      <p className="hint">
        Ajoute des livres à ton suivi et marque-en un « En cours » : tu le
        retrouveras ici, avec sa progression, pour reprendre où tu en étais.
      </p>
    );
  }

  return (
    <section className="lecture">
      <h2 className="soustitre soustitre--serre">En cours</h2>
      {enCours.length === 0 ? (
        <p className="hint">
          Aucun livre en cours. Ouvre un livre de ta bibliothèque et passe-le en
          « En cours » — ou fais un appui long sur sa couverture.
        </p>
      ) : (
        <div className="reprises">
          {enCours.map((o) => {
            const p = progressionDe(o);
            return (
              <div key={o.oeuvreId} className="reprise">
                <button
                  type="button"
                  className="reprise__couverture"
                  onClick={() => cardProps.onOuvrir(o)}
                  aria-label={`Ouvrir ${o.titre}`}
                >
                  {o.couvertureUrl
                    ? <img src={o.couvertureUrl} alt="" loading="lazy" />
                    : <span className="carte-livre__sans-image">Pas de couverture</span>}
                </button>
                <div className="reprise__corps">
                  <h3 className="reprise__titre">{o.titre}</h3>
                  <p className="reprise__auteur">{(o.auteurs || '').split(',')[0]}</p>
                  <ProgressBar progression={p} compact />
                  <button type="button" className="btn btn--primaire" onClick={() => onProgression(o)}>
                    <Icon name="livre" size={16} />
                    <span>J’en suis à…</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tomesSuivants.length > 0 && (
        <>
          <h2 className="soustitre">Tome suivant à lire</h2>
          <p className="hint">
            La suite des cycles que tu as entamés, et que tu possèdes déjà.
          </p>
          <div className="grille">
            {tomesSuivants.map((o) => (
              <BookCard key={o.oeuvreId} resultat={o} suivi={o} {...cardProps} />
            ))}
          </div>
        </>
      )}

      {aParaitre.length > 0 && (
        <>
          <h2 className="soustitre">À paraître</h2>
          <p className="hint">Pas encore sortis : ils ne comptent pas dans « À lire ».</p>
          <div className="grille">
            {aParaitre.map((o) => (
              <BookCard key={o.oeuvreId} resultat={o} suivi={o} {...cardProps} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
