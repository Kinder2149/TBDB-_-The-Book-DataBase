/*
 * vite.config.js — configuration de build, volontairement minimale.
 * Décision §1 : Vite 6 + plugin React, rien d'autre. Pas d'alias, pas de
 * découpage manuel de chunks, pas de proxy (le client est autonome, §9).
 * Piège évité : `sql-wasm.wasm` n'est PAS résolu par le bundler ; il est copié
 * à la main dans public/assets/ (`npm run wasm`) et servi tel quel.
 * `host: 0.0.0.0` sert à tester depuis le téléphone sur le réseau local.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // PORT permet à un outil de lancement d'imposer le port ; sinon 5173.
  server: { host: '0.0.0.0', port: Number(process.env.PORT) || 5173 },
});
