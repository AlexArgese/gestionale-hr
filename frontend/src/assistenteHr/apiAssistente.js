import { API_BASE, getIdToken } from "../api";

// fetch verso il backend con il token Firebase dell'utente.
export async function apiFetch(path, opts = {}) {
  const token = await getIdToken();
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export async function apiPostJson(path, body) {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
