/*
 * Logic Quest backend adapter.
 * The game was written against a tiny `claude.use("user" | "db" | "downloads")` API that only exists
 * inside Claude artifacts. This file provides the same interface backed by this project's REST API,
 * so the game code in index.html works unchanged. If a real `window.claude` already exists, it is left alone.
 */
(function () {
  'use strict';
  if (typeof window.claude !== 'undefined') return;

  const H = { 'Content-Type': 'application/json', 'X-LQ': '1' };
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: H, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(method + ' ' + url + ' -> ' + r.status);
    return r.json();
  }

  const snap = (id, data) => ({ id, data: () => data });

  function collection(name) {
    return {
      async get() { const j = await api('GET', '/api/c/' + name); return { docs: j.items.map((i) => snap(i.id, i.data)) }; },
      doc: (id) => ({
        set: (data) => api('PUT', '/api/c/' + name + '/' + encodeURIComponent(id), data),
        delete: () => api('DELETE', '/api/c/' + name + '/' + encodeURIComponent(id)),
      }),
    };
  }

  const profileRef = {
    async get() { const j = await api('GET', '/api/profile'); return { exists: j.exists, data: () => j.data }; },
    set: (data) => api('PUT', '/api/profile', data),
    collection,
  };

  const services = {
    // Resolves to a guest-account id. If the API is unreachable (e.g. file:// or offline) id() returns null
    // and the game transparently falls back to localStorage.
    async user() {
      let id = null;
      try { id = (await api('POST', '/api/session')).id; } catch (e) { /* offline -> local only */ }
      return { id: async () => id };
    },
    async db() { return { doc: () => profileRef }; }, // game asks for "data/users/<id>/profile"; the server scopes by session cookie
    async downloads() {
      return {
        async save({ filename, data }) {
          const url = URL.createObjectURL(data);
          const a = document.createElement('a');
          a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        },
      };
    },
  };

  window.claude = { use: async (name) => { if (!services[name]) throw new Error('Unknown service: ' + name); return services[name](); } };
})();
