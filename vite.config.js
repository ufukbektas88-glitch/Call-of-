import { defineConfig } from 'vite';

// Tarayıcıda geliştirme yaparken GİB'e CORS'suz erişmek için proxy.
export default defineConfig({
  server: {
    proxy: {
      '/gib-prod': { target: 'https://earsivportal.efatura.gov.tr', changeOrigin: true, rewrite: (p) => p.replace(/^\/gib-prod/, '') },
      '/gib-test': { target: 'https://earsivportaltest.efatura.gov.tr', changeOrigin: true, rewrite: (p) => p.replace(/^\/gib-test/, '') },
    },
  },
  build: { chunkSizeWarningLimit: 3000 },
});
