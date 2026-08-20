/*
 * files.js — sortir un fichier de l'application, et en lire un.
 * Ne connaît que « écrire un texte », « lire un fichier », « nommer un fichier
 * daté » : aucun rapport avec les livres. C'est le fichier le plus réutilisable
 * du projet séries, repris tel quel à un préfixe près.
 * Piège évité : un WebView Android NE SAIT PAS télécharger. Un <a download> y
 * est inerte. Il faut écrire dans Directory.Cache puis passer par la feuille
 * de partage du système — c'est la seule solution correcte.
 */

import { Capacitor } from '@capacitor/core';

const estWeb = () => Capacitor.getPlatform() === 'web';

/** « suivi-lecture-2026-08-20.json » — daté, donc jamais écrasé par erreur. */
export function nomFichierSauvegarde(extension = 'json') {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `suivi-lecture-${d.getFullYear()}-${mois}-${jour}.${extension}`;
}

/**
 * Remet un texte à l'utilisateur, par le chemin qui marche sur sa plateforme.
 * @returns {Promise<'telechargement'|'partage'>} par où c'est sorti
 */
export async function sortirTexte(nom, contenu, typeMime = 'application/json') {
  if (estWeb()) {
    const blob = new Blob([contenu], { type: `${typeMime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    // Révocation différée : révoquer tout de suite annule le téléchargement
    // sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'telechargement';
  }

  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  await Filesystem.writeFile({
    path: nom,
    data: contenu,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  const { uri } = await Filesystem.getUri({ path: nom, directory: Directory.Cache });

  await Share.share({
    title: nom,
    text: 'Sauvegarde Suivi Lecture',
    url: uri,
    dialogTitle: 'Enregistrer la sauvegarde',
  });
  return 'partage';
}

/*
 * Lecture d'un fichier choisi par l'utilisateur. Un <input type="file"> natif
 * fonctionne des deux côtés, y compris dans le WebView Android : c'est le
 * sélecteur du système qui s'ouvre. Pas besoin de plugin.
 */
export function lireFichierTexte(accept = '.json,application/json') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const fichier = input.files && input.files[0];
      document.body.removeChild(input);
      if (!fichier) { resolve(null); return; }

      const lecteur = new FileReader();
      lecteur.onload = () => resolve({ nom: fichier.name, contenu: String(lecteur.result) });
      lecteur.onerror = () => reject(new Error('Le fichier n’a pas pu être lu.'));
      lecteur.readAsText(fichier, 'utf-8');
    });

    document.body.appendChild(input);
    input.click();
  });
}
