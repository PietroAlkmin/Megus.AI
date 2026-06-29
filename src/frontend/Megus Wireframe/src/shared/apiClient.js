/* global */
// apiClient — camada única de acesso HTTP ao backend Megus.
// Substitui os mocks: agora os services chamam apiGet/apiPost de verdade.
//
// A URL base do backend vem de window.MEGUS_API_BASE (definida no HTML).
// O token JWT (após login) é guardado em memória e no localStorage, e enviado
// no header Authorization das chamadas protegidas.
//
// Todas as respostas seguem o envelope ResultResponse do backend:
//   { success, data, message, errors, correlationId, statusCode }

(function () {
  const BASE = (window.MEGUS_API_BASE || "http://localhost:3000").replace(/\/$/, "");
  const TOKEN_KEY = "megus_access_token";

  function getToken() {
    return window.__megusToken || localStorage.getItem(TOKEN_KEY) || null;
  }
  function setToken(token) {
    window.__megusToken = token || null;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    let resp;
    try {
      resp = await fetch(BASE + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // erro de rede (backend fora do ar, CORS, etc.)
      return {
        success: false, data: null,
        message: "Não foi possível conectar ao servidor.",
        errors: ["NETWORK"], correlationId: null, statusCode: 0,
      };
    }

    // O backend sempre devolve o envelope ResultResponse em JSON.
    let json;
    try {
      json = await resp.json();
    } catch {
      return {
        success: false, data: null,
        message: "Resposta inválida do servidor.",
        errors: ["BAD_RESPONSE"], correlationId: null, statusCode: resp.status,
      };
    }
    return json;
  }

  window.MegusApi = {
    base: BASE,
    getToken,
    setToken,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    del: (path) => request("DELETE", path),
    logout: () => setToken(null),
  };
})();