/*
 * Icon.jsx — jeu d'icônes SVG écrites à la main, tracé unique 24×24.
 * Applique §1 : AUCUN émoji dans l'interface. Ce n'est pas une préférence :
 * sur certains Android les symboles absents des polices système s'affichent en
 * carré vide — bug réel constaté sur le projet séries, dont le champ de
 * recherche porte encore un émoji en dur alors que ce fichier existe pour ça.
 * Ajouter une icône = ajouter une entrée à TRACES, rien d'autre.
 */

const TRACES = {
  recherche: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  livre: 'M4 5.5C6.5 4.5 9 4.5 12 6v13c-3-1.5-5.5-1.5-8-.5zM20 5.5C17.5 4.5 15 4.5 12 6v13c3-1.5 5.5-1.5 8-.5z',
  bibliotheque: 'M4 5h5v14H4zM11 5h4v14h-4zM17.5 5.6l3 13.2',
  reglages: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.5 12c0-.6-.1-1.1-.2-1.6l1.7-1.3-1.8-3.1-2 .8a7.5 7.5 0 0 0-2.8-1.6L14 3h-4l-.4 2.2c-1 .3-2 .9-2.8 1.6l-2-.8-1.8 3.1 1.7 1.3a7.6 7.6 0 0 0 0 3.2l-1.7 1.3 1.8 3.1 2-.8c.8.7 1.8 1.3 2.8 1.6L10 21h4l.4-2.2c1-.3 2-.9 2.8-1.6l2 .8 1.8-3.1-1.7-1.3c.1-.5.2-1 .2-1.6z',
  lune: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  soleil: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  fermer: 'M6 6l12 12M18 6L6 18',
  valider: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  alerte: 'M12 3.5 1.8 20.5h20.4zM12 10v4.5M12 17.5v.5',
  scan: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10',
  sauver: 'M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15M12 3v12M7.5 10.5 12 15l4.5-4.5',
  actualiser: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4',
  // Cadre, soleil, et la ligne d'horizon en montagne : le pictogramme
  // d'image le plus universel, au meme trait que les autres.
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01',
};

export default function Icon({ name, size = 22, className = '' }) {
  const d = TRACES[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
