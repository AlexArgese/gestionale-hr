import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import styles from "./NuovaComunicazione.module.css";

import { API_BASE } from "../api";

const API = API_BASE;

export default function NuovaComunicazione() {
  const navigate = useNavigate();

  // form core
  const [titolo, setTitolo] = useState("");
  const [contenuto, setContenuto] = useState("");

  // allegati multipli
  const [files, setFiles] = useState([]); // Array<File>

  // destinatari
  const [inviaATutti, setInviaATutti] = useState(true);

  // filtri
  const [societa, setSocieta] = useState([]);
  const [sedi, setSedi] = useState([]);

  const [societaId, setSocietaId] = useState("");
  const [sedeId, setSedeId] = useState("");

  const [sending, setSending] = useState(false);

  // ==== LOAD LOOKUPS ====
  useEffect(() => {
    Promise.all([
      fetch(`${API}/societa`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/static/sedi`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ])
    .then(([soc, sed]) => {
      setSocieta(Array.isArray(soc) ? soc : []);
      setSedi(Array.isArray(sed) ? sed : []);
    })
    .catch(() => {});
  }, []);

  const canSubmit = useMemo(() => {
    if (!titolo.trim() || !contenuto.trim()) return false;
    return true;
  }, [titolo, contenuto]);

  const onFilesChange = (e) => {
    const list = Array.from(e.target.files || []);
    // concat per consentire più selezioni consecutive
    setFiles(prev => [...prev, ...list]);
    // reset del valore per riattivare lo stesso file se riselezionato
    e.target.value = "";
  };

  const removeFileAt = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    try {
      const fd = new FormData();
      fd.append("titolo", titolo);
      fd.append("contenuto", contenuto);

      // allegati multipli => stesso field name ripetuto (multer li raccoglie)
      for (const f of files) {
        fd.append("allegato", f);
      }

      // destinatari
      fd.append("invia_a_tutti", inviaATutti ? "1" : "0");
      if (!inviaATutti) {
        if (societaId) fd.append("societa_id", societaId);
        if (sedeId) fd.append("sede_id", sedeId);
      }

      const res = await fetch(`${API}/comunicazioni`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      alert("Comunicazione creata");
      navigate("/comunicazioni");
    } catch (err) {
      alert(err?.message || "Errore invio comunicazione");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Nuova comunicazione</h2>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate("/comunicazioni")}
        >
          <FiArrowLeft /> Torna all’elenco
        </button>
      </div>
      <div className={styles.underline} />

      <form className={styles.card} onSubmit={handleSubmit}>
        {/* Titolo + Allegati */}
        <div className={styles.grid}>
          <div className={styles.group}>
            <label className={styles.label} htmlFor="titolo">Titolo</label>
            <input
              id="titolo"
              type="text"
              className={styles.input}
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Inserisci il titolo"
              required
            />
          </div>

          <div className={styles.group} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label} htmlFor="contenuto">Contenuto</label>
            <textarea
              id="contenuto"
              className={styles.textarea}
              value={contenuto}
              onChange={(e) => setContenuto(e.target.value)}
              placeholder="Scrivi il testo della comunicazione…"
              required
            />
          </div>
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="file">Allegati (opzionale)</label>

          {/* CONTROLLO FILE CUSTOM: input nascosto + bottone + box nomi */}
          <input
            id="file"
            type="file"
            className={styles.fileHidden}
            accept="application/pdf,image/*"
            multiple
            onChange={onFilesChange}
          />

          <div className={styles.fileControl}>
            <button
              type="button"
              className={styles.fileBtn}
              onClick={() => document.getElementById("file")?.click()}
            >
              Scegli file
            </button>

            <div
              className={styles.fileBox}
              onClick={() => document.getElementById("file")?.click()}
              role="button"
              tabIndex={0}
            >
              {files.length === 0 ? (
                <span className={styles.filePlaceholder}>Nessun file selezionato</span>
              ) : (
                <div className={styles.fileList}>
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className={styles.fileChip}>
                      {f.name}
                      <button
                        type="button"
                        className={styles.removeChip}
                        onClick={(e) => { e.stopPropagation(); removeFileAt(i); }}
                        aria-label={`Rimuovi ${f.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Destinatari */}
        <div className={styles.grid}>
          <div className={styles.group} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Destinatari</label>
            <div className={styles.inline}>
              <input
                id="inviaATutti"
                type="checkbox"
                checked={inviaATutti}
                onChange={(e) => setInviaATutti(e.target.checked)}
              />
              <label htmlFor="inviaATutti" className={styles.note}>
                Invia a tutti gli utenti attivi
              </label>
            </div>
          </div>

          {!inviaATutti && (
            <>
              <div className={styles.group}>
                <label className={styles.label} htmlFor="societa">Società</label>
                <select
                  id="societa"
                  className={styles.select}
                  value={societaId}
                  onChange={(e) => setSocietaId(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {societa.map(s => (
                    <option key={s.id} value={s.id}>{s.ragione_sociale}</option>
                  ))}
                </select>
              </div>

              <div className={styles.group}>
                <label className={styles.label} htmlFor="sede">Sede</label>
                <select
                  id="sede"
                  className={styles.select}
                  value={sedeId}
                  onChange={(e) => setSedeId(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {sedi.map((s, i) => (
                    <option key={i} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Azioni */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => navigate("/comunicazioni")}
          >
            Annulla
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={!canSubmit || sending}
          >
            {sending ? "Invio..." : "Invia comunicazione"}
          </button>
        </div>
      </form>
    </div>
  );
}
