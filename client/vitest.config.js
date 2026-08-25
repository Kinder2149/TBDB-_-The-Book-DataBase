/*
 * Configuration des verifications automatiques.
 * Volontairement minimale : Vitest est le compagnon de Vite, deja present, et
 * lit la meme configuration de compilation que l'application. Rien a doubler.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Necessaire pour lire les fichiers .jsx des ecrans.
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/preparation.js'],
    // Les verifications de base de donnees partagent un moteur SQL en memoire :
    // elles doivent se suivre, pas se chevaucher.
    fileParallelism: false,
    // Une verification qui depasse 15 s est un signal, pas une lenteur normale.
    testTimeout: 15000,
  },
});
