import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function RoleRoute({ allow = [], children }) {
  const { isAuthed, me } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (!me) return <div style={{ padding: 24 }}>Verifica credenziali…</div>;
  if (!allow.includes(me.ruolo)) return <Navigate to="/login" replace />;
  return children;
}
