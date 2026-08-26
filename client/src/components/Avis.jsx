/*
 * Avis.jsx — ma note et mon commentaire sur un livre.
 *
 * Retour d'usage 112 : « j'aimerais pour chaque livre pouvoir ajouter une note
 * dessus, peu importe l'edition, note et commentaire associes ».
 *
 * La colonne `note` existait depuis le premier jour, avec sa fonction dans
 * `store.js` et dans la facade — mais AUCUN ecran ne la proposait. Elle etait
 * inaccessible. Seul le commentaire manquait vraiment.
 *
 * Les deux portent sur l'OEUVRE, jamais sur l'edition : ce qu'on pense d'un
 * texte ne change pas parce qu'on l'a lu en poche plutot qu'en grand format.
 *
 * DEUX RYTHMES D'ENREGISTREMENT, et c'est voulu :
 *  - l'etoile s'enregistre AU CLIC. Noter est un geste unique, attendre une
 *    validation apres l'avoir fait serait absurde.
 *  - le commentaire s'enregistre quand on quitte le champ, ET par un bouton
 *    qui n'apparait que si le texte a change. Le `onBlur` seul est capricieux
 *    sur telephone — si le clavier se referme autrement, le texte serait perdu,
 *    et perdre un texte qu'on vient d'ecrire est la pire chose qu'on puisse
 *    faire ici.
 */

import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const ETOILES = [1, 2, 3, 4, 5];

export default function Avis({ note, commentaire, onEnregistrer }) {
  const [texte, setTexte] = useState(commentaire || '');
  const [enregistre, setEnregistre] = useState(false);

  // La fiche peut changer de livre sous nos pieds : le champ suit.
  useEffect(() => { setTexte(commentaire || ''); }, [commentaire]);

  const modifie = texte.trim() !== String(commentaire || '').trim();

  const enregistrerTexte = async () => {
    if (!modifie) return;
    await onEnregistrer(note ?? null, texte);
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  };

  return (
    <div className="avis">
      <h3 className="soustitre soustitre--serre">Mon avis</h3>

      <div className="avis__etoiles" role="group" aria-label="Ma note">
        {ETOILES.map((n) => (
          <button
            key={n}
            type="button"
            className={`avis__etoile${note >= n ? ' est-pleine' : ''}`}
            aria-label={`${n} sur 5`}
            aria-pressed={note === n}
            /*
             * Retoucher la meme etoile efface la note : c'est le seul moyen de
             * revenir en arriere, et un bouton « effacer » a cote de cinq
             * etoiles serait plus encombrant qu'utile.
             */
            onClick={() => onEnregistrer(note === n ? null : n, texte)}
          >
            <Icon name="etoile" size={26} />
          </button>
        ))}
        {note ? (
          <span className="avis__mention">{note} sur 5</span>
        ) : (
          <span className="avis__mention">Pas encore noté</span>
        )}
      </div>

      <textarea
        className="champ__saisie champ__saisie--encadre avis__texte"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={enregistrerTexte}
        placeholder="Ce que j’en ai pensé, une phrase qui m’a marqué, à qui le prêter…"
        aria-label="Mon commentaire"
        rows={4}
      />

      {modifie && (
        <button type="button" className="btn btn--primaire" onClick={enregistrerTexte}>
          <Icon name="valider" size={16} />
          <span>Enregistrer mon commentaire</span>
        </button>
      )}
      {enregistre && !modifie && <p className="hint">Commentaire enregistré.</p>}
    </div>
  );
}
