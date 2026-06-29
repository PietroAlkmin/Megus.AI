/* global */
// Camada de auth — agora REAL, falando com o backend via window.MegusApi.
// Mantém a MESMA interface window.MegusAuth que as telas já usam (login/register),
// então as telas não mudam.

window.API_ROUTES = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    recovery: '/api/auth/recovery',
    me: '/api/auth/me',
  },
};

window.MegusAuth = {
  async login({ email, password }) {
    if (!email || !password) {
      return { success: false, data: null, message: 'Preencha e-mail e senha para entrar.', errors: ['VALIDATION'], correlationId: null, statusCode: 400 };
    }
    const r = await window.MegusApi.post(window.API_ROUTES.auth.login, { email, password });
    if (r && r.success && r.data && r.data.accessToken) {
      window.MegusApi.setToken(r.data.accessToken);
    }
    return r;
  },

  async register(payload) {
    return window.MegusApi.post(window.API_ROUTES.auth.register, payload);
  },

  async me() {
    return window.MegusApi.get(window.API_ROUTES.auth.me);
  },

  logout() {
    window.MegusApi.logout();
  },
};

window.getFriendlyError = (response, fallback) => {
  if (!response) return { message: fallback, correlationId: null };
  return { message: response.message ?? (response.errors && response.errors[0]) ?? fallback, correlationId: response.correlationId ?? null };
};