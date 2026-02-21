import React, { useEffect, useState } from 'react';
import './PaginaQR.css';
import { API_BASE } from "../api";

const API = API_BASE;

function PaginaQR() {
  const [qrImage, setQrImage] = useState(null);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minuti in secondi
  const [error, setError] = useState(null);

  const fetchQR = async () => {
    try {
      const res = await fetch(`${API}/presenze/qr`);
      if (!res.ok) throw new Error('Errore fetch QR');
      const data = await res.json();
      setQrImage(data.image);
      setError(null);
      setTimeLeft(15 * 60); // reset timer
    } catch (err) {
      console.error('Errore nel caricamento QR:', err);
      setError('⚠️ Impossibile caricare il QR code. Riprova tra poco.');
    }
  };

  useEffect(() => {
    fetchQR();
    const qrInterval = setInterval(fetchQR, 15 * 60 * 1000); // ogni 15 minuti
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
      <h1>Scansiona per timbrare la presenza</h1>

      {error && <p className="qr-error">{error}</p>}

      {qrImage ? (
        <img src={qrImage} alt="QR Code Presenza" className="qr-code" />
      ) : (
        <p>Caricamento QR...</p>
      )}

      <p className="qr-timer">
        ⚠️ Questo QR scade tra: <strong>{formatTime(timeLeft)}</strong>
      </p>
    </div>
  );
}

export default PaginaQR;
