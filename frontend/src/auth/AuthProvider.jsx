import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, onIdTokenChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthCtx = createContext(null);

export function AuthProvider({ children, apiBase = process.env.REACT_APP_API_BASE || 'http://localhost:3001' }) {
  const [idToken, setIdTokenState] = useState(() => localStorage.getItem('idToken') || '');
  const [me, setMe] = useState(null);
  const isAuthed = !!idToken;

  function setIdToken(tok) {
    if (!tok) {
      localStorage.removeItem('idToken');
      setIdTokenState('');
      setMe(null);
    } else {
      localStorage.setItem('idToken', tok);
      setIdTokenState(tok);
    }
  }

  async function fetchMe(token = idToken) {
    if (!token) { setMe(null); return; }
    try {
      const res = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('auth/me ' + res.status);
      const j = await res.json(); // { email, role, id? }
      setMe(j);
    } catch {
      setMe(null);
    }
  }

  async function loginWithEmailPassword(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    setIdToken(token);
    await fetchMe(token);
  }

  function loginWithTokenPaste(token) {
    setIdToken(token);
    fetchMe(token);
  }

  async function logout() {
    try { await signOut(auth); } catch {}
    setIdToken('');
    setMe(null);
  }

  // refresh automatico token Firebase
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) { setIdToken(''); setMe(null); return; }
      const token = await user.getIdToken();
      setIdToken(token);
      fetchMe(token);
    });
    return () => unsub();
    // eslint-disable-next-line
  }, []);

  // prima fetch di me() se ho già un token in localStorage
  useEffect(() => { fetchMe(); /* eslint-disable-next-line */ }, [idToken]);

  const value = { idToken, setIdToken, me, isAuthed, loginWithEmailPassword, loginWithTokenPaste, logout, apiBase };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth fuori da <AuthProvider>');
  return ctx;
}
