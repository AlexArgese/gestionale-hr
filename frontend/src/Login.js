import React, { useState } from 'react';
import { auth } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import './Login.css';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');

  const login = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err) {
      setErrore('Credenziali non valide');
    }
  };

  return (
    <div className="login-container">
      <a href="/" className="login-back">← Torna al sito</a>
      <form onSubmit={login} className="login-box">
        {/* Logo */}
        <a href="/" aria-label="Vai al sito ClockEasy">
          <img src="/logo.png" alt="Logo" className="login-logo" />
        </a>

        <h2>Login HR</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>

        {errore && <p className="login-error">{errore}</p>}
      </form>
    </div>
  );
}
