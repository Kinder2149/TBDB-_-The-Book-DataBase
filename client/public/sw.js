/*
 * sw.js — service worker volontairement PASSTHROUGH, sans aucun cache.
 * Décision héritée : il n'existe que pour satisfaire les critères
 * d'installabilité PWA du navigateur, jamais pour servir du contenu.
 * Piège évité : un cache ici entrerait en conflit avec CapacitorHttp (§4.5)
 * et masquerait des réponses réseau pendant le développement.
 */
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
