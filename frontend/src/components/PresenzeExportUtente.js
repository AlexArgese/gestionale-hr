import React, { useState } from "react";
import { FiDownload } from "react-icons/fi";
import styles from "./PresenzeExportUtente.module.css";
import { API_BASE, downloadWithAuth } from "../api";

/**
 * PresenzeExportUtente
 * Piccolo widget da inserire in UtenteDettaglio prima dei documenti.
 * Scarica un Excel delle presenze filtrato per singolo dipendente.
 *
 * Props:
 *   userId  — id numerico del dipendente (da useParams nel parent)
 *   nome    — nome completo, usato solo per il titolo
 */
export default function PresenzeExportUtente({ userId, nome = "" }) {
  const [start, setStart] = useState("");
  const [end, setEnd]     = useState("");
  const [dettagli, setDettagli] = useState(false);
  const [err, setErr]     = useState("");

  const canDownload = !!(start && end && userId);

  const handleDownload = async () => {
    if (!canDownload) { setErr("Seleziona entrambe le date."); return; }
    if (start > end)  { setErr("La data inizio deve essere prima della data fine."); return; }
    setErr("");

    const params = new URLSearchParams({
      start,
      end,
      utente_id: String(userId),
    });
    if (dettagli) params.append("dettagli", "1");

    try {
      await downloadWithAuth(`${API_BASE}/presenze/export?${params.toString()}`, "presenze.xlsx");
    } catch (e) {
      setErr(e.message || "Errore durante il download");
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Esporta presenze</h2>
          <p className="card-desc">
            Scarica in Excel le timbrature{nome.trim() ? ` di ${nome.trim()}` : ""} per un periodo.
          </p>
        </div>
      </div>

      <div className="card-body">
        <div className={styles.row}>
          <label className="field">
            <span className="field-label">Dal</span>
            <input
              type="date"
              className="input"
              value={start}
              onChange={e => { setStart(e.target.value); setErr(""); }}
            />
          </label>
          <label className="field">
            <span className="field-label">Al</span>
            <input
              type="date"
              className="input"
              value={end}
              onChange={e => { setEnd(e.target.value); setErr(""); }}
            />
          </label>
        </div>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={dettagli}
            onChange={e => { setDettagli(e.target.checked); setErr(""); }}
          />
          <span>
            Includi il foglio “Dettaglio timbrature”
            <span className={styles.hint}>Orari di entrata e uscita giorno per giorno.</span>
          </span>
        </label>

        {err && <div className="alert alert-danger" style={{ marginTop: 16 }}>{err}</div>}
      </div>

      <div className="card-foot">
        <button className="btn btn-primary" onClick={handleDownload} disabled={!canDownload}>
          <FiDownload size={15} /> Scarica Excel
        </button>
      </div>
    </section>
  );
}