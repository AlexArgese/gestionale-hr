// frontend/src/api.js
import { auth } from './firebase';

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

export async function fetchMe(idToken) {
  const token = idToken || (await getIdToken());
  if (!token) return null;
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('auth/me ' + res.status);
  return res.json(); // { email, role, id? }
}
