import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FiArrowLeft } from 'react-icons/fi';
import './Login.css';

function messaggioErrore(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'L’indirizzo email non è valido.';
    case 'auth/missing-password':
      return 'Inserisci la password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email o password non corrette.';
    case 'auth/user-disabled':
      return 'Questo account è stato disattivato.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi di accesso. Attendi qualche minuto e riprova.';
    case 'auth/network-request-failed':
      return 'Connessione assente. Controlla la rete e riprova.';
    default:
      return `Accesso non riuscito${code ? ` (${code})` : ''}. Riprova.`;
  }
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const login = async (e) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err) {
      setErrore(messaggioErrore(err?.code));
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="login-page">
      <a href="/" className="login-back"><FiArrowLeft size={15} /> Torna al sito</a>

      <div className="login-panel">
        <a href="/" aria-label="Vai al sito ClockEasy" className="login-logo-link">
          <img src="/Logo_esteso.png" alt="ClockEasy" className="login-logo" />
        </a>

        <div className="login-head">
          <h1>Accedi al gestionale</h1>
          <p>Inserisci le credenziali del tuo account aziendale.</p>
        </div>

        <form onSubmit={login} className="login-form" noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="nome@azienda.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {errore && <div className="alert alert-danger" role="alert">{errore}</div>}

          <button type="submit" className="btn btn-primary login-submit" disabled={invio}>
            {invio ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>

      <p className="login-foot">© {new Date().getFullYear()} ClockEasy</p>
    </div>
  );
}
