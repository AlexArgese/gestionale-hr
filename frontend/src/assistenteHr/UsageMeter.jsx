import React from "react";
import styles from "./AssistenteHr.module.css";

// Palette di stato (fissa, non tematica): verde/ambra/rosso per ok/in esaurimento/esaurito.
const COLORE_BUONO = "#0ca30c";
const COLORE_ATTENZIONE = "#fab219";
const COLORE_CRITICO = "#d03b3b";

function coloreDa(percentuale) {
  if (percentuale >= 100) return COLORE_CRITICO;
  if (percentuale >= 70) return COLORE_ATTENZIONE;
  return COLORE_BUONO;
}

// Cerchio piccolo, solo percentuale del limite giornaliero — niente importi,
// niente riferimenti al mese. Il tooltip on-hover ripete la percentuale in
// forma leggibile e quando si azzera.
export default function MiniGauge({ consumo }) {
  if (!consumo) return null;

  // Mostra il limite giornaliero più vicino all'esaurimento: quello personale
  // dell'utente o quello complessivo dell'azienda.
  const oggi =
    consumo.utente_oggi && consumo.utente_oggi.percentuale > consumo.oggi.percentuale
      ? consumo.utente_oggi
      : consumo.oggi;
  const SIZE = 30;
  const STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const pct = Math.min(Math.max(oggi.percentuale, 0), 100);
  const offset = C * (1 - pct / 100);
  const colore = coloreDa(oggi.percentuale);
  const rimanente = Math.max(100 - Math.round(oggi.percentuale), 0);

  return (
    <div className={styles.miniGaugeWrap} tabIndex={0}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#E5E7EB" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={colore}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
        />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#334155">
          {Math.round(oggi.percentuale)}%
        </text>
      </svg>
      <div className={styles.miniGaugeTooltip}>
        Consumato il {Math.round(oggi.percentuale)}% del limite giornaliero — resta il {rimanente}%
        <br />
        <span className={styles.tooltipMuted}>Si azzera a mezzanotte</span>
      </div>
    </div>
  );
}
