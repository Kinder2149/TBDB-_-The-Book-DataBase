/*
 * scanner.js — le scan de code-barres ISBN (§6, tranche 7).
 * Capacité de l'APPAREIL, pas une source de données : aucun `fetch` ici. Elle
 * vit à côté de files.js, et passe par api.js pour atteindre les écrans.
 * API vérifiée dans les définitions du paquet installé (@capacitor-mlkit/
 * barcode-scanning 8.1.0), pas devinée : `isSupported`, `checkPermissions`,
 * `requestPermissions`, `isGoogleBarcodeScannerModuleAvailable`,
 * `installGoogleBarcodeScannerModule`, `scan({ formats })`.
 * Piège évité : `rawValue` est OPTIONNEL dans la définition, `displayValue` ne
 * l'est pas — lire l'un sans l'autre rendrait `undefined` par intermittence.
 */

import { Capacitor } from '@capacitor/core';

/*
 * Tout code-barres n'est pas un livre. Un EAN-13 de livre commence par 978 ou
 * 979 (préfixe Bookland) ; le reste est une boîte de céréales. Le dire plutôt
 * que lancer une recherche vide.
 */
export function estIsbn(code) {
  const chiffres = String(code || '').replace(/[^0-9Xx]/g, '');
  if (chiffres.length === 10) return true;
  return chiffres.length === 13 && (chiffres.startsWith('978') || chiffres.startsWith('979'));
}

/** Le scan n'existe pas au navigateur : le bouton ne doit pas s'y afficher. */
export async function scanDisponible() {
  if (Capacitor.getPlatform() === 'web') return false;
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    const { supported } = await BarcodeScanner.isSupported();
    return supported;
  } catch {
    return false;
  }
}

/**
 * Ouvre le scanner et rend l'ISBN lu.
 * @returns {Promise<{isbn: string|null, raison: string|null}>}
 *   `isbn` nul avec une `raison` en français quand rien n'a été lu.
 */
export async function scannerIsbn() {
  if (Capacitor.getPlatform() === 'web') {
    return { isbn: null, raison: 'Le scan n’existe que sur téléphone.' };
  }

  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

  // 1. La caméra. Refuser est une réponse : on le dit et on s'arrête.
  let permission = await BarcodeScanner.checkPermissions();
  if (permission.camera !== 'granted') {
    permission = await BarcodeScanner.requestPermissions();
  }
  if (permission.camera !== 'granted') {
    return {
      isbn: null,
      raison: 'Sans accès à la caméra, le scan est impossible. Tu peux saisir l’ISBN à la main.',
    };
  }

  /*
   * 2. Le module de lecture de Google. Il n'est PAS embarqué dans l'APK : il
   * se télécharge à la première utilisation, via les services Google Play.
   * C'est la principale raison pour laquelle le premier scan peut échouer là
   * où les suivants marchent — autant l'installer explicitement.
   */
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
  } catch {
    // Appareil sans services Google Play : on tente le scan quand même,
    // l'échec sera signalé proprement plus bas.
  }

  // 3. Le scan. Deux formats seulement : c'est ce qui le rend rapide.
  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8],
    });

    const premier = barcodes && barcodes[0];
    if (!premier) return { isbn: null, raison: null };  // annulé, pas une erreur

    const code = premier.rawValue || premier.displayValue || '';
    if (!estIsbn(code)) {
      return { isbn: null, raison: `Ce code-barres (${code}) n’est pas celui d’un livre.` };
    }
    return { isbn: code.replace(/[^0-9Xx]/g, ''), raison: null };
  } catch (e) {
    return {
      isbn: null,
      raison: `Le scanner n’a pas pu démarrer : ${e.message || 'raison inconnue'}.`,
    };
  }
}
