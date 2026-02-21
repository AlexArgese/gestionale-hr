// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import UtentiPage from './components/UtentiPage';
import UtenteDettaglio from './components/UtenteDettaglio';
import UtenteNuovo from './components/UtenteNuovo';
import DashboardHome from './components/DashboardHome';
import PresenzeExport from './components/PresenzeExport';
import ComunicazioniPage from './components/ComunicazioniPage';
import DettaglioComunicazione from './components/DettaglioComunicazione';
import NuovaComunicazione from './components/NuovaComunicazione';
import PaginaQR from './components/PaginaQR';
import Login from './Login';
import DocumentiPage from './components/DocumentiPage';
import DocumentiGestione from './components/DocumentiGestione';
import './App.css';

import { fetchMe } from './api';
import WbManagerPage from './pages/WbManagerPage';

function AppContent() {
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null); // { email, role }
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  // login/logout Firebase + fetch ruolo dal backend
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) {
        setMe(null);
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }
      try {
        const token = await u.getIdToken();
        const info = await fetchMe(token);
        setMe(info); // { email, role }
      } catch (e) {
        console.error('Errore fetch ruolo', e);
        setMe(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [auth, navigate]);

  // logout
  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        setUser(null);
        setMe(null);
        navigate('/login', { replace: true });
      })
      .catch((err) => {
        console.error('Errore logout:', err);
      });
  };

  // ruolo
  const role = me?.role || null;
  const isAdmin = role === 'admin' || role === 'admin_lan';
  const isWbManager = role === 'wb_manager';

  // redirect iniziale in base al ruolo
  useEffect(() => {
    if (loading) return;
    if (!user) return; // gestito sopra -> /login

    // se sono in root o su /login dopo il login, porta alla pagina giusta
    if (location.pathname === '/' || location.pathname === '/login') {
      if (isWbManager) navigate('/wb-manager', { replace: true });
      else if (isAdmin) navigate('/', { replace: true }); // home admin
      else navigate('/qr', { replace: true }); // dipendente
    }
  }, [loading, user, isAdmin, isWbManager, navigate, location.pathname]);

  if (!user) {
    // IMPORTANTISSIMO: il tuo Login.js chiama onLogin(); passiamo una no-op per evitare errori
    return <Login onLogin={() => {}} />;
  }

  if (loading && !role) {
    return <div style={{ padding: 24 }}>Caricamento…</div>;
  }

  return (
    <div className="app-container">
      {/* NAVBAR (solo admin) */}
      {isAdmin && (
        <nav className="navbar">
          <div className="navbar-links">
            <Link to="/">Home</Link>
            <Link to="/utenti">Dipendenti</Link>
            <Link to="/comunicazioni">Comunicazioni</Link>
            <Link to="/presenze">Presenze</Link>
            <Link to="/qr">QR Code</Link>
            <Link to="/documenti">Documenti</Link>
            <Link to="/documenti/gestione">Archivio</Link>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </nav>
      )}

      {!isAdmin && (
        <div style={{ textAlign: 'right', padding: '1rem' }}>
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      )}

      {/* ROUTING */}
      <div className="main-content">
        <Routes>
          {/* ADMIN: vede il tuo gestionale */}
          {isAdmin && (
            <>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/utenti" element={<UtentiPage />} />
              <Route path="/utenti/nuovo" element={<UtenteNuovo />} />
              <Route path="/utenti/:id" element={<UtenteDettaglio />} />
              <Route path="/comunicazioni" element={<ComunicazioniPage />} />
              <Route path="/comunicazioni/nuova" element={<NuovaComunicazione />} />
              <Route path="/comunicazioni/:id" element={<DettaglioComunicazione />} />
              <Route path="/presenze" element={<PresenzeExport />} />
              <Route path="/qr" element={<PaginaQR />} />
              <Route path="/documenti" element={<DocumentiPage />} />
              <Route path="/documenti/gestione" element={<DocumentiGestione />} />
              {/* accesso alla pagina avvocato vietato per admin */}
              <Route path="/wb-manager" element={<Navigate to="/" replace />} />
              {/* fallback admin */}
              <Route path="*" element={<DashboardHome />} />
            </>
          )}

          {/* AVVOCATO: vede SOLO la sua pagina */}
          {isWbManager && (
            <>
              <Route path="/wb-manager" element={<WbManagerPage />} />
              {/* blocca le rotte admin */}
              <Route path="/" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/utenti" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/comunicazioni/*" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/presenze" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/documenti/*" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/qr" element={<Navigate to="/wb-manager" replace />} />
              {/* fallback wb */}
              <Route path="*" element={<Navigate to="/wb-manager" replace />} />
            </>
          )}

          {/* ALTRI UTENTI (dipendenti): solo QR */}
          {!isAdmin && !isWbManager && (
            <>
              <Route path="/qr" element={<PaginaQR />} />
              <Route path="*" element={<PaginaQR />} />
            </>
          )}
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
