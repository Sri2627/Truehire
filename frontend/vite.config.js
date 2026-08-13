import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Every one of these path prefixes is shared by two completely different
// things: the Express API mount (app.use('/jobs', ...) etc in
// backend/server.js) and a React Router client-side route with the exact
// same prefix (/jobs, /jobs/:id, /jobs/:id/matches, /candidates, /team,
// /fraud). An axios call to e.g. GET /jobs/abc123/matches SHOULD go to
// Express - but a hard refresh (or a shared/bookmarked link) on that same
// URL is a real browser page navigation, and without the check below it
// would ALSO get proxied straight to Express, which has no page to
// return for it and no Authorization header to check (browser
// navigations don't send one) - so it 500s with a bare
// '{"error":"Missing or malformed Authorization header"}' JSON body
// instead of loading the app.
//
// axios requests ask for JSON (Accept: application/json); real browser
// navigations ask for HTML (Accept: text/html,...) - bypass the proxy for
// the latter so Vite's own dev server serves index.html and the SPA's
// router takes over instead.
function apiProxy() {
  return {
    target: 'http://localhost:5000',
    changeOrigin: true,
    bypass(req) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return '/index.html';
      }
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the React dev server call /auth, /jobs, /candidates, /team,
      // /fraud, /institutions without CORS pain.
      '/auth': apiProxy(),
      '/jobs': apiProxy(),
      '/candidates': apiProxy(),
      '/team': apiProxy(),
      '/fraud': apiProxy(),
      '/institutions': apiProxy(),
    },
  },
});
