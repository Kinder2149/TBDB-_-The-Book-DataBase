/*
 * ProgressBar.jsx — la barre de progression, et rien d'autre.
 * Le calcul vient de status.js (§5.3) : une soustraction, jamais un appel.
 * Piège évité : le projet séries a une barre qui peut dépasser 100 % parce que
 * son numérateur et son dénominateur ne comptent pas la même chose. Ici le
 * pourcentage est borné à la source, dans progressionDe().
 */

import { libelleProgression } from '../status.js';

export default function ProgressBar({ progression, compact = false }) {
  const p = progression;

  return (
    <div className={`jauge${compact ? ' jauge--compacte' : ''}`}>
      <div
        className="jauge__piste"
        role="progressbar"
        aria-valuenow={p.pourcent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression de lecture"
      >
        {/* Le seul style en ligne du projet : une largeur calculée ne peut pas
            vivre dans une feuille de style. */}
        <span className="jauge__remplissage" style={{ width: `${p.pourcent}%` }} />
      </div>
      <div className="jauge__legende">
        <span>{libelleProgression(p)}</span>
        <b>{p.pourcent} %</b>
      </div>
    </div>
  );
}
