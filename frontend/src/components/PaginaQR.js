import React, { useEffect, useState } from 'react';
import './PaginaQR.css';
import { API_BASE, getIdToken } from "../api";

const API = API_BASE;

function PaginaQR() {
  const [qrImage, setQrImage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(5); // 5 sec
  const [error, setError] = useState(null);

  const fetchQR = async () => {
    try {
      const token = await getIdToken();
      const res = await fetch(`${API}/presenze/qr`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) throw new Error('Non autorizzato');
      if (!res.ok) throw new Error('Errore fetch QR');
      const data = await res.json();
      setQrImage(data.image);
      setError(null);
      setTimeLeft(5); // reset timer
    } catch (err) {
      console.error('Errore nel caricamento QR:', err);
      setError('⚠️ Impossibile caricare il QR code. Riprova tra poco.');
    }
  };

  useEffect(() => {
    fetchQR();
    const qrInterval = setInterval(fetchQR, 5 * 1000); // ogni 5 sec
    const timerInterval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(qrInterval);
      clearInterval(timerInterval);
    };
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="qr-container">
      <div className="qr-panel">
        <img src="/Logo_esteso.png" alt="ClockEasy" className="qr-logo" />
        <h1>Inquadra il codice per timbrare</h1>
        <p className="qr-sub">Apri l’app ClockEasy e scansiona il QR code.</p>

        {error && <div className="alert alert-danger qr-error">{error}</div>}

        <div className="qr-frame">
          {qrImage ? (
            <img src={qrImage} alt="QR Code presenza" className="qr-code" />
          ) : (
            <span className="qr-loading">Caricamento…</span>
          )}
        </div>

        <p className="qr-timer">
          Il codice si rinnova tra <strong>{formatTime(timeLeft)}</strong>
        </p>
      </div>
    </div>
  );
}

export default PaginaQR;
