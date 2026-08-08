import axios from 'axios';

const api = axios.create({ baseURL: '/' });

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
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
