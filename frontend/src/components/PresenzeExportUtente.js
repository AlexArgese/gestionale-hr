import React, { useState } from "react";
import { FiDownload, FiCalendar } from "react-icons/fi";
import { API_BASE } from "../api";

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
  const [err, setErr]     = useState("");

  const canDownload = !!(start && end && userId);

  const handleDownload = () => {
    if (!canDownload) { setErr("Seleziona entrambe le date."); return; }
    if (start > end)  { setErr("La data inizio deve essere prima della data fine."); return; }
    setErr("");

    const params = new URLSearchParams({
      start,
      end,
      utente_id: String(userId),
    });

    window.open(`${API_BASE}/presenze/export?${params.toString()}`, "_blank");
  };

  return (
    <div style={{
      background: "var(--bg-card, #fff)",
      border: "1px solid var(--border, #E5E7EB)",
      borderRadius: "var(--radius, 16px)",
      boxShadow: "var(--shadow-soft, 0 8px 28px rgba(15,23,42,.06))",
      padding: "16px 18px",
      marginBottom: 16,
      marginTop: 16,
    }}>
      {/* Intestazione */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <FiDownload style={{ color: "var(--brand-1, #D0933C)", width: 18, height: 18 }} />
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--txt-strong, #0F172A)" }}>
          Esporta presenze{nome ? ` — ${nome}` : ""}
        </span>
      </div>

      {/* Form */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--txt-muted, #64748B)", display: "flex", alignItems: "center", gap: 4 }}>
            <FiCalendar size={12} /> Data inizio
          </label>
          <input
            type="date"
            className="input"
            value={start}
            onChange={e => { setStart(e.target.value); setErr(""); }}
            style={{ minWidth: 140 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--txt-muted, #64748B)", display: "flex", alignItems: "center", gap: 4 }}>
            <FiCalendar size={12} /> Data fine
          </label>
          <input
            type="date"
            className="input"
            value={end}
            onChange={e => { setEnd(e.target.value); setErr(""); }}
            style={{ minWidth: 140 }}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={!canDownload}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <FiDownload size={14} /> Scarica Excel
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b" }}>{err}</div>
      )}
    </div>
  );
}