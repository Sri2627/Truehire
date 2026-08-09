import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the React dev server call /auth, /jobs, /candidates, /team,
      // /fraud without CORS pain.
      '/auth': 'http://localhost:5000',
      '/jobs': 'http://localhost:5000',
      '/candidates': 'http://localhost:5000',
      '/team': 'http://localhost:5000',
      '/fraud': 'http://localhost:5000',
    },
  },
});
