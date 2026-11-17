import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FiGrid, FiUsers, FiClock, FiFileText, FiMessageSquare,
  FiLogOut, FiMenu, FiX,
} from 'react-icons/fi';
import styles from './AppShell.module.css';

const SEZIONI = [
  {
    titolo: null,
    voci: [
      { to: '/', label: 'Home', icon: FiGrid, end: true },
    ],
  },
  {
    titolo: 'Gestione',
    voci: [
      { to: '/utenti', label: 'Dipendenti', icon: FiUsers, match: ['/utenti', '/sedi'] },
      { to: '/presenze', label: 'Presenze', icon: FiClock },
      { to: '/documenti', label: 'Documenti', icon: FiFileText },
      { to: '/comunicazioni', label: 'Comunicazioni', icon: FiMessageSquare },
    ],
  },
];

function iniziali(email = '') {
  const nome = email.split('@')[0] || '';
  const parti = nome.split(/[._-]+/).filter(Boolean);
  const s = parti.length > 1 ? parti[0][0] + parti[1][0] : nome.slice(0, 2);
  return s.toUpperCase();
}

export default function AppShell({ me, onLogout, children }) {
  const location = useLocation();
  const [menuAperto, setMenuAperto] = useState(false);

  // chiude il menu mobile quando si cambia pagina
  useEffect(() => { setMenuAperto(false); }, [location.pathname]);

  const isAttiva = (voce) => {
    if (voce.end) return location.pathname === voce.to;
    const prefissi = voce.match || [voce.to];
    return prefissi.some((p) => location.pathname.startsWith(p));
  };

  return (
    <div className={styles.shell}>
      {/* Barra superiore solo su mobile */}
      <header className={styles.mobileBar}>
        <button
          className={styles.menuBtn}
          onClick={() => setMenuAperto((v) => !v)}
          aria-label={menuAperto ? 'Chiudi menu' : 'Apri menu'}
        >
          {menuAperto ? <FiX size={20} /> : <FiMenu size={20} />}
        </button>
        <img src="/Logo_esteso.png" alt="ClockEasy" className={styles.mobileLogo} />
      </header>

      <aside className={`${styles.sidebar} ${menuAperto ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <NavLink to="/" aria-label="ClockEasy — Home">
            <img src="/Logo_esteso.png" alt="ClockEasy" className={styles.logo} />
          </NavLink>
        </div>

        <nav className={styles.nav} aria-label="Navigazione principale">
          {SEZIONI.map((sezione, i) => (
            <div key={i} className={styles.navGroup}>
              {sezione.titolo && <div className={styles.navGroupTitle}>{sezione.titolo}</div>}
              {sezione.voci.map((voce) => {
                const Icon = voce.icon;
                const attiva = isAttiva(voce);
                return (
                  <NavLink
                    key={voce.to}
                    to={voce.to}
                    className={`${styles.navItem} ${attiva ? styles.navItemActive : ''}`}
                    aria-current={attiva ? 'page' : undefined}
                  >
                    <Icon size={17} className={styles.navIcon} />
                    <span>{voce.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.userBox}>
          <div className={styles.avatar} aria-hidden="true">{iniziali(me?.email)}</div>
          <div className={styles.userText}>
            <span className={styles.userEmail} title={me?.email}>{me?.email}</span>
            <span className={styles.userRole}>Amministratore</span>
          </div>
          <button className={styles.logoutBtn} onClick={onLogout} title="Esci" aria-label="Esci">
            <FiLogOut size={16} />
          </button>
        </div>
      </aside>

      {menuAperto && <div className={styles.backdrop} onClick={() => setMenuAperto(false)} />}

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
