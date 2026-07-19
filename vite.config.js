import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Passthrough: 2 entries HTML, sem transformar o monólito
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index:    resolve(__dirname, 'index.html'),
        encartes: resolve(__dirname, 'estudio-encartes.html'),
      },
    },
  },
  server: {
    port: 5173,
    // Dev local: backend Express na 3000 (npm run dev)
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [
    {
      // espelha o rewrite /encartes → /estudio-encartes.html do vercel.json no dev server
      name: 'rewrite-encartes-dev',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/encartes') req.url = '/estudio-encartes.html';
          next();
        });
      },
    },
  ],
});
