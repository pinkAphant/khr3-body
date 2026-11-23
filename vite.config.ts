import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite 8 bundles with Rolldown: `build.rolldownOptions.output.codeSplitting` replaces the
// deprecated `rollupOptions.output.manualChunks`. Higher `priority` groups claim modules first, so shared vendors (rapier, three, react)
// must outrank uikit or uikit's group pulls them in as its dependencies.
// The mode scenes are split by dynamic import() in src/AppViewport.tsx; these groups only keep
// large, rarely-changing vendors in their own long-cached chunks.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Rapier's compat build inlines its WASM as base64 (~4.3 MB, ~1.6 MB gzip). It cannot be split
    // further, so it stays above this limit on purpose and only loads with the range scene.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Vite's __vitePreload helper backs every dynamic import(); left ungrouped it lands in the first
            // lazy vendor chunk that uses it (uikit), which then gets preloaded by the entry.
            { name: 'preload-helper', test: /vite[\\/]preload-helper/, priority: 60 },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]rapier3d-compat[\\/]/, priority: 50 },
            { name: 'uikit', test: /node_modules[\\/](@react-three[\\/]uikit|@pmndrs[\\/]uikit)/, priority: 20 },
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 40 },
            // The R3F runtime is eager (<Canvas>) and shared with uikit: keep it out of uikit's chunk.
            { name: 'r3f', test: /node_modules[\\/](@react-three[\\/](fiber|drei)|zustand|its-fine|suspend-react|react-use-measure|react-reconciler)[\\/]/, priority: 36 },
            // Shared by the eager HUD signal store and uikit: without its own group it rides in uikit's chunk.
            { name: 'signals', test: /node_modules[\\/]@preact[\\/]signals-core[\\/]/, priority: 35 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
          ],
        },
      },
    },
  },
});
