/*
 * ErrorBoundary.jsx — attrape une erreur de rendu et montre une issue.
 * SEUL composant classe du projet, et seule exception à « composants
 * fonctionnels + hooks uniquement » (§1, §7 garde-fou 5) : React n'offre aucun
 * équivalent en hook. Exception écrite ici plutôt que découverte dans le code.
 * Piège évité : le projet séries n'en a pas — un crash de rendu y donne un
 * écran blanc, sans message, sans issue, y compris sur téléphone.
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  render() {
    const { erreur } = this.state;
    const { children } = this.props;

    if (!erreur) return children;

    return (
      <div className="ecran-casse">
        <h1 className="ecran-casse__titre">L&apos;application s&apos;est arrêtée</h1>
        <p className="hint">
          Tes données sont intactes : elles sont enregistrées sur l&apos;appareil, pas
          dans l&apos;écran. Relance l&apos;application pour continuer.
        </p>
        <p className="ecran-casse__detail">{erreur.message || String(erreur)}</p>
        <button type="button" className="btn btn--primaire btn--large" onClick={() => window.location.reload()}>
          Relancer
        </button>
      </div>
    );
  }
}
