/*
 * Modal.jsx — la seule façon de poser une question ou de demander une
 * confirmation dans toute l'application (§7, garde-fou 3).
 * ZÉRO window.prompt, ZÉRO window.confirm : sur Android ce sont des boîtes
 * système hors charte, non stylables, qui se comportent mal sur certains
 * WebView. Le projet séries en compte cinq, et le regrette.
 * Corrige aussi trois manques hérités : fermeture par Échap, piège de focus,
 * role="dialog" — absents des overlays du projet séries.
 */

import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function Modal({
  titre,
  children,
  onFermer,
  actions = null,
  danger = false,
}) {
  const sheet = useRef(null);

  useEffect(() => {
    const precedent = document.activeElement;
    sheet.current?.focus();

    const auClavier = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onFermer?.();
        return;
      }
      if (e.key !== 'Tab' || !sheet.current) return;

      // Piège de focus : sans lui on tabule derrière la modale.
      const cibles = sheet.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (cibles.length === 0) return;
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };

    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('keydown', auClavier);
      // Le focus revient à ce qui a ouvert la modale.
      if (precedent instanceof HTMLElement) precedent.focus();
    };
  }, [onFermer]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer?.(); }}>
      <div
        className={`sheet${danger ? ' sheet--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        ref={sheet}
      >
        <div className="sheet__head">
          <h2 className="sheet__titre">{titre}</h2>
          <button type="button" className="btn btn--ghost btn--icone" onClick={onFermer} aria-label="Fermer">
            <Icon name="fermer" size={20} />
          </button>
        </div>

        <div className="sheet__corps">{children}</div>

        {actions ? <div className="sheet__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
