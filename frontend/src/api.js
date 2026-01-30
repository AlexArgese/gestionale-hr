// frontend/src/api.js
import { auth } from "./firebase";

// Supporta sia Vite (import.meta.env) che CRA (process.env)
const ENV_API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE) ||
  "";

export const API_BASE = (ENV_API_BASE || "https://clockeasy-api.onrender.com").replace(/\/$/, "");

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

export async function fetchMe(idToken) {
  const token = idToken || (await getIdToken());
  if (!token) return null;

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("auth/me " + res.status);
  return res.json(); // { email, role, id? }
}
