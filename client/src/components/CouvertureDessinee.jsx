/*
 * CouvertureDessinee.jsx — ce qu'on affiche quand un livre n'a AUCUNE image.
 *
 * Mesure du 2026-08-25, sur 80 resultats reels : Google illustre 81 % des
 * livres, et le repli Open Library par ISBN n'en rattrape AUCUN sur les 15
 * restants — la promesse de « deux sur cinq » du §4.2 ne se verifie pas.
 * Une autre piste a ete testee puis ecartee : l'URL de couverture Google
 * construite a la main rend une image generique de 1269 octets, jamais la
 * vraie. Ces 19 % n'auront donc jamais de photo.
 *
 * Autant leur donner une couverture LISIBLE plutot qu'une case grise portant
 * « Pas de couverture » : le titre, l'auteur, et une couleur tiree du titre.
 * Un seul domicile pour cette regle — la grille et la fiche s'en servent
 * toutes deux, et deux teintes differentes pour le meme livre seraient pires
 * que pas de teinte du tout.
 */

/*
 * Couleur de fond. Deux exigences : elle doit etre STABLE (le meme livre garde
 * sa teinte d'une session a l'autre, sinon l'oeil ne le reconnait plus dans la
 * grille) et assez sombre pour qu'un texte blanc reste lisible par-dessus,
 * dans le theme clair comme dans le sombre.
 */
export function teinteDe(texte) {
  let somme = 0;
  const t = String(texte || '');
  for (let i = 0; i < t.length; i += 1) {
    somme = (somme * 31 + t.charCodeAt(i)) % 360;
  }
  return `linear-gradient(160deg, hsl(${somme} 32% 34%), hsl(${(somme + 40) % 360} 30% 24%))`;
}

export default function CouvertureDessinee({ titre, auteur }) {
  return (
    <span className="carte-livre__dessinee" style={{ background: teinteDe(titre) }}>
      <span className="carte-livre__dessinee-titre">{titre}</span>
      {auteur ? <span className="carte-livre__dessinee-auteur">{auteur}</span> : null}
    </span>
  );
}
