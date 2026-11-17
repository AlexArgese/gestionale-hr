// frontend/src/App.js
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { FiLogOut } from 'react-icons/fi';
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
import DocumentiOperazionePage from './components/DocumentiOperazionePage';
import ClockAIWidget from './assistenteHr/ClockAIWidget';
import SedeNuova from './components/SedeNuova';
import SedeDettaglio from './components/SedeDettaglio';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import AppShell from './components/layout/AppShell';

import { fetchMe } from './api';
import WbManagerPage from './pages/WbManagerPage';
import WhistleblowingPage from './pages/WhistleblowingPage';
import DashboardTeamLeader from './components/DashboardTeamLeader';
import Landing from './pages/Landing';

function AppContent() {
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null); // { email, ruolo }
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  const isPublicRoute = location.pathname.startsWith('/whistleblowing');

  // login/logout Firebase + fetch ruolo dal backend
  useEffect(() => {
    if (isPublicRoute) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (!u) {
        setMe(null);
        setLoading(false);
        // la home "/" è il sito vetrina pubblico: non forzare il redirect al login
        if (window.location.pathname !== '/') navigate('/login', { replace: true });
        return;
      }
      // finché il ruolo non arriva dal backend non si decide il redirect,
      // altrimenti subito dopo il login si finisce su /nessun-accesso
      setLoading(true);
      try {
        const token = await u.getIdToken();
        const info = await fetchMe(token);
        setMe(info); // { email, ruolo }
      } catch (e) {
        console.error('Errore fetch ruolo', e);
        setMe(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [auth, navigate, isPublicRoute]);

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
  const ruolo = me?.ruolo || null;
  const isAdmin = ruolo === 'admin';
  const isWbManager = ruolo === 'wb_manager';
  const isTeamLeader = !isAdmin && !isWbManager && !!(me?.team_leader_sedi?.trim());
  // Il QR (usato per la timbratura) deve essere visibile solo dal totem/admin,
  // mai da un dipendente che accede con la propria email da internet.
  const isQrViewer = isAdmin || (me?.email || '').toLowerCase() === 'qrcode@clockeasy.it';

  // redirect iniziale in base al ruolo
  useEffect(() => {
    if (isPublicRoute) return;
    if (loading) return;
    if (!user) return; // gestito sopra -> /login

    // se sono in root o su /login dopo il login, porta alla pagina giusta
    if (location.pathname === '/' || location.pathname === '/login') {
      if (isWbManager) navigate('/wb-manager', { replace: true });
      else if (isTeamLeader) navigate('/tl', { replace: true });
      else if (isAdmin) navigate('/', { replace: true }); // home admin
      else if (isQrViewer) navigate('/qr', { replace: true }); // account totem QR
      else navigate('/nessun-accesso', { replace: true }); // dipendente
    }
  }, [loading, user, isAdmin, isWbManager, isTeamLeader, isQrViewer, navigate, location.pathname, isPublicRoute]);

  // Route pubblica — nessuna autenticazione richiesta
  if (isPublicRoute) {
    return <WhistleblowingPage />;
  }

  if (!user) {
    // Home pubblica = sito vetrina (in attesa del controllo auth mostriamo una pagina vuota,
    // così un admin già loggato non vede lampeggiare la vetrina prima della dashboard)
    if (location.pathname === '/') {
      return loading ? <div style={{ minHeight: '100vh', background: '#fff' }} /> : <Landing />;
    }
    // IMPORTANTISSIMO: il tuo Login.js chiama onLogin(); passiamo una no-op per evitare errori
    return <Login onLogin={() => {}} />;
  }

  if (loading && !ruolo) {
    return <div className="empty-state" style={{ minHeight: '100vh' }}>Caricamento…</div>;
  }

  const ruoloLabel = isWbManager ? 'Gestore segnalazioni' : isTeamLeader ? 'Team leader' : '';

  const routes = (
        <Routes>
          {isAdmin && (
            <>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/utenti" element={<UtentiPage />} />
              <Route path="/utenti/nuovo" element={<UtenteNuovo />} />
              <Route path="/utenti/:id" element={<UtenteDettaglio />} />
              <Route path="/sedi/:id" element={<SedeDettaglio />} />
              <Route path="/sedi/nuova" element={<SedeNuova />} />
              <Route path="/comunicazioni" element={<ComunicazioniPage />} />
              <Route path="/comunicazioni/nuova" element={<NuovaComunicazione />} />
              <Route path="/comunicazioni/:id" element={<DettaglioComunicazione />} />
              <Route path="/presenze" element={<PresenzeExport />} />
              <Route path="/qr" element={<PaginaQR />} />
              <Route path="/documenti" element={<DocumentiPage />} />
              <Route path="/documenti/:mode" element={<DocumentiOperazionePage />} />
              <Route path="/wb-manager" element={<Navigate to="/" replace />} />
              <Route path="*" element={<DashboardHome />} />
            </>
          )}
  
          {isWbManager && (
            <>
              <Route path="/wb-manager" element={<WbManagerPage />} />
              <Route path="/" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/utenti" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/comunicazioni/*" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/presenze" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/documenti/*" element={<Navigate to="/wb-manager" replace />} />
              <Route path="/qr" element={<Navigate to="/wb-manager" replace />} />
              <Route path="*" element={<Navigate to="/wb-manager" replace />} />
            </>
          )}
  
          {isTeamLeader && (
            <>
              <Route path="/tl" element={<DashboardTeamLeader me={me} />} />
              <Route path="*" element={<Navigate to="/tl" replace />} />
            </>
          )}

          {!isAdmin && !isWbManager && !isTeamLeader && (
            <>
              {isQrViewer ? (
                <>
                  <Route path="/qr" element={<PaginaQR />} />
                  <Route path="*" element={<PaginaQR />} />
                </>
              ) : (
                <>
                  <Route path="/qr" element={<Navigate to="/nessun-accesso" replace />} />
                  <Route path="*" element={<NessunAccesso />} />
                </>
              )}
            </>
          )}
        </Routes>
  );

  if (isAdmin) {
    return (
      <>
        <AppShell me={me} onLogout={handleLogout}>{routes}</AppShell>
        {/* ClockAI — widget flottante globale, solo per admin, su tutte le pagine */}
        <ClockAIWidget />
      </>
    );
  }

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="nav-inner">
          <a
            className="nav-logo"
            href={isWbManager ? '/wb-manager' : isTeamLeader ? '/tl' : isQrViewer ? '/qr' : '/nessun-accesso'}
            aria-label="ClockEasy Home"
          >
            <img src="/Logo_esteso.png" alt="ClockEasy" />
          </a>
          <div className="nav-right">
            {me?.email && (
              <span className="nav-user">
                {me.email}{ruoloLabel ? ` · ${ruoloLabel}` : ''}
              </span>
            )}
            <button className="btn-logout" onClick={handleLogout}>
              <FiLogOut size={14} /> Esci
            </button>
          </div>
        </div>
      </header>
      <main className="main-content">{routes}</main>
    </div>
  );
}

function NessunAccesso() {
  return (
    <div className="card empty-state" style={{ maxWidth: 520, margin: '64px auto 0' }}>
      <span className="empty-state-title">Accesso non disponibile</span>
      <span>Questa sezione non è consultabile dal tuo account.</span>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </ToastProvider>
    </Router>
  );
}
