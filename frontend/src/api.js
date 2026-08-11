import axios from 'axios';

const api = axios.create({ baseURL: '/' });

// Flag Login.jsx reads (and clears) so it can show "your session expired"
// instead of a blank sign-in form. sessionStorage (not React state) because
// this module has no component tree of its own and the flag needs to
// survive the redirect that's about to happen.
function announceSessionExpired() {
  sessionStorage.setItem('th_session_expired', '1');
  window.dispatchEvent(new Event('th:session-expired'));
}

// Attach the stored access token to every request automatically.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('th_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If a request comes back 401, try once to refresh the access token using
// the stored refresh token before giving up and forcing a re-login.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('th_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post('/auth/refresh', { refreshToken });
          localStorage.setItem('th_access_token', data.accessToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch (refreshErr) {
          localStorage.removeItem('th_access_token');
          localStorage.removeItem('th_refresh_token');
          localStorage.removeItem('th_user');
          // Tell AuthContext (a separate React tree - this module can't
          // call its setUser directly) that the session is dead, so the
          // UI actually redirects to /login instead of silently staying
          // "logged in" and re-sending every request with no token.
          announceSessionExpired();
        }
      } else {
        // No refresh token to even try (cleared by another tab, wiped
        // manually, or never issued) - same dead-session situation, so
        // the same cleanup + redirect applies.
        localStorage.removeItem('th_access_token');
        localStorage.removeItem('th_user');
        announceSessionExpired();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
