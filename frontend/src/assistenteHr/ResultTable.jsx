import React, { useState } from "react";
import styles from "./AssistenteHr.module.css";
import { IoChevronForward } from "react-icons/io5";

// Rende i dati grezzi restituiti dal tool eseguito lato backend — la "fonte
// di verità" indipendente dal testo dell'LLM. La tabella (spesso lunga) è
// chiusa di default e si apre al click, per non affollare la chat.
const TITOLI_TOOL = {
  cerca_dipendente: "Ricerca dipendente",
  conta_dipendenti: "Conteggio dipendenti",
  dettaglio_dipendente: "Dettaglio dipendente",
  documenti_da_firmare: "Documenti da firmare",
  documenti_scaduti: "Documenti scaduti",
  chi_ha_timbrato: "Chi ha timbrato",
  chi_non_ha_timbrato: "Chi non ha timbrato",
  ore_lavorate: "Ore lavorate",
};

export default function ResultTable({ dati, mostraTitolo = false }) {
  const [aperto, setAperto] = useState(false);
  if (!dati) return null;

  const { tool, ...resto } = dati;
  const arrayEntry = Object.entries(resto).find(([, v]) => Array.isArray(v));
  const scalarEntries = Object.entries(resto).filter(([k]) => !arrayEntry || k !== arrayEntry[0]);

  const righe = arrayEntry ? arrayEntry[1] : [];
  const colonne = righe.length > 0 ? Object.keys(righe[0]) : [];

  return (
    <div className={styles.resultBox}>
      {mostraTitolo && <div className={styles.resultTitle}>{TITOLI_TOOL[tool] || formatChiave(tool)}</div>}
      {scalarEntries.length > 0 && (
        <div className={styles.resultSummary}>
          {scalarEntries.map(([k, v]) => (
            <span key={k} className={styles.resultStat}>
              <strong>{formatValore(v)}</strong> <span>{formatChiave(k)}</span>
            </span>
          ))}
        </div>
      )}

      {righe.length > 0 && (
        <>
          <button
            type="button"
            className={styles.resultToggle}
            onClick={() => setAperto((v) => !v)}
            aria-expanded={aperto}
          >
            <IoChevronForward size={13} className={aperto ? styles.resultToggleIconOpen : ""} />
            {aperto ? "Nascondi" : "Mostra"} {righe.length} risultati
          </button>

          {aperto && (
            <div className={styles.resultTableWrap}>
              <table className={styles.resultTable}>
                <thead>
                  <tr>
                    {colonne.map((c) => (
                      <th key={c}>{formatChiave(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={i}>
                      {colonne.map((c) => (
                        <td key={c}>{formatValore(r[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatChiave(k) {
  return String(k).replace(/_/g, " ");
}

function formatValore(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
