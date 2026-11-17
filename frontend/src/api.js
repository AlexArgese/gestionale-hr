// frontend/src/api.js
import { auth } from "./firebase";

export const API_BASE = (process.env.REACT_APP_API_BASE || "https://clockeasy-api.onrender.com").replace(/\/$/, "");

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

/**
 * Scarica un file da una rotta protetta da token (serve perché <a href> /
 * window.open non possono portare l'header Authorization): fa il fetch con
 * il token, legge il blob e simula il click di un <a download>.
 */
export async function downloadWithAuth(url, fallbackName = "download") {
  const token = await getIdToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    throw new Error(`HTTP ${res.status} ${detail}`.trim());
  }
  const blob = await res.blob();

  const cd = res.headers.get("Content-Disposition") || res.headers.get("content-disposition") || "";
  let filename = fallbackName;
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  if (m && m[1]) {
    try { filename = decodeURIComponent(m[1].replace(/"/g, "")); }
    catch { filename = m[1]; }
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
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
