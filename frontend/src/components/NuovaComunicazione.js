import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiPaperclip, FiX, FiSend } from "react-icons/fi";
import styles from "./NuovaComunicazione.module.css";
import SelettoreDipendenti from "./SelettoreDipendenti";
import { useToast } from "./ui/Toast";

import { API_BASE, getIdToken } from "../api";

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function NuovaComunicazione() {
  const navigate = useNavigate();
  const toast = useToast();

  // form core
  const [titolo, setTitolo] = useState("");
  const [contenuto, setContenuto] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPicker, setShowPicker] = useState(false);

  // allegati multipli
  const [files, setFiles] = useState([]); // Array<File>

  // destinatari
  const [inviaATutti, setInviaATutti] = useState(true);

  // filtri
  const [societaList, setSocietaList] = useState([]);
  const [sediList, setSediList] = useState([]);

  const [selectedSocieta, setSelectedSocieta] = useState([]); // array di { id, label }
  const [selectedSedi, setSelectedSedi] = useState([]);       // array di stringhe nome

  const [sending, setSending] = useState(false);

  // ==== LOAD LOOKUPS ====
  useEffect(() => {
    authHeaders().then((headers) => Promise.all([
      fetch(`${API}/societa`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/sedi`, { headers }).then(r => r.ok ? r.json() : []),
    ]))
    .then(([soc, sed]) => {
      setSocietaList(Array.isArray(soc) ? soc : []);
      const arr = Array.isArray(sed) ? sed : (sed?.items || []);
      setSediList(arr.map(s => s?.nome || s).filter(Boolean));
    })
    .catch(() => {});
  }, []);

  const handleAddSocieta = (id, label) => {
    if (!id || selectedSocieta.some(s => String(s.id) === String(id))) return;
    setSelectedSocieta(prev => [...prev, { id, label }]);
  };

  const handleRemoveSocieta = (id) => {
    setSelectedSocieta(prev => prev.filter(s => String(s.id) !== String(id)));
  };

  const handleAddSede = (nome) => {
    if (!nome || selectedSedi.includes(nome)) return;
    setSelectedSedi(prev => [...prev, nome]);
  };

  const handleRemoveSede = (nome) => {
    setSelectedSedi(prev => prev.filter(s => s !== nome));
  };

  const canSubmit = useMemo(() => {
    if (!titolo.trim() || !contenuto.trim()) return false;
    if (!inviaATutti && manualMode && selectedIds.length === 0) return false;
    return true;
  }, [titolo, contenuto, inviaATutti, manualMode, selectedIds]);

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
      fd.append("send_email", sendEmail ? "1" : "0");

      // allegati multipli => stesso field name ripetuto (multer li raccoglie)
      for (const f of files) {
        fd.append("allegato", f);
      }

      // destinatari
      fd.append("invia_a_tutti", inviaATutti ? "1" : "0");
      if (!inviaATutti) {
        if (manualMode) {
          fd.append("utente_ids", JSON.stringify(selectedIds));
        } else {
          if (selectedSocieta.length) fd.append("societa_ids", JSON.stringify(selectedSocieta.map(s => s.id)));
          if (selectedSedi.length) fd.append("sede_ids", JSON.stringify(selectedSedi));
        }
      }

      const res = await fetch(`${API}/comunicazioni`, {
        method: "POST",
        body: fd,
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      toast.success("Comunicazione creata");
      navigate("/comunicazioni");
    } catch (err) {
      toast.error(err?.message || "Errore invio comunicazione");
    } finally {
      setSending(false);
    }
  };

  const modoDestinatari = inviaATutti ? "tutti" : manualMode ? "manuale" : "filtri";
  const setModoDestinatari = (modo) => {
    setInviaATutti(modo === "tutti");
    setManualMode(modo === "manuale");
    if (modo !== "filtri") { setSelectedSocieta([]); setSelectedSedi([]); }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate("/comunicazioni")}>
            <FiArrowLeft size={14} /> Comunicazioni
          </button>
          <h1 className="page-title">Nuova comunicazione</h1>
          <p className="page-subtitle">Il messaggio arriva ai dipendenti come notifica nell’app.</p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* ===== Messaggio ===== */}
        <section className="card">
          <div className="card-head"><h2 className="card-title">Messaggio</h2></div>
          <div className={`card-body ${styles.stack}`}>
            <label className="field" htmlFor="titolo">
              <span className="field-label">Titolo</span>
              <input
                id="titolo"
                type="text"
                className="input"
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                placeholder="Es. Chiusura uffici per festività"
                required
              />
            </label>

            <label className="field" htmlFor="contenuto">
              <span className="field-label">Testo</span>
              <textarea
                id="contenuto"
                className={`textarea ${styles.body}`}
                value={contenuto}
                onChange={(e) => setContenuto(e.target.value)}
                placeholder="Scrivi il testo della comunicazione…"
                required
              />
            </label>

            <div className="field">
              <span className="field-label">Allegati <span className={styles.optional}>(facoltativi)</span></span>
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
                  className="btn btn-outline btn-sm"
                  onClick={() => document.getElementById("file")?.click()}
                >
                  <FiPaperclip size={14} /> Aggiungi file
                </button>
                {files.length === 0 ? (
                  <span className={styles.filePlaceholder}>PDF o immagini</span>
                ) : (
                  <div className={styles.fileList}>
                    {files.map((f, i) => (
                      <span key={`${f.name}-${i}`} className={styles.fileChip}>
                        {f.name}
                        <button
                          type="button"
                          className={styles.removeChip}
                          onClick={() => removeFileAt(i)}
                          aria-label={`Rimuovi ${f.name}`}
                        >
                          <FiX size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Destinatari ===== */}
        <section className="card">
          <div className="card-head"><h2 className="card-title">Destinatari</h2></div>
          <div className={`card-body ${styles.stack}`}>
            <div className={styles.choices} role="radiogroup" aria-label="Destinatari">
              {[
                ["tutti", "Tutti i dipendenti attivi", "La comunicazione arriva a tutti."],
                ["filtri", "Per società e sede", "Scegli una o più società e sedi."],
                ["manuale", "Scelta manuale", "Seleziona i dipendenti uno per uno."],
              ].map(([k, titoloScelta, desc]) => (
                <label key={k} className={`${styles.choice} ${modoDestinatari === k ? styles.choiceOn : ""}`}>
                  <input
                    type="radio"
                    name="destinatari"
                    checked={modoDestinatari === k}
                    onChange={() => setModoDestinatari(k)}
                  />
                  <span>
                    <span className={styles.choiceTitle}>{titoloScelta}</span>
                    <span className={styles.choiceDesc}>{desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {modoDestinatari === "manuale" && (
              <div className={styles.manualRow}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPicker(true)}>
                  Scegli dipendenti
                </button>
                <span className="muted">
                  {selectedIds.length
                    ? `${selectedIds.length} dipendent${selectedIds.length === 1 ? "e selezionato" : "i selezionati"}`
                    : "Nessun dipendente selezionato"}
                </span>
              </div>
            )}

            {modoDestinatari === "filtri" && (
              <div className={styles.filterGrid}>
                <div className="field">
                  <span className="field-label">Società</span>
                  <select
                    className="select"
                    value=""
                    onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      handleAddSocieta(e.target.value, opt.text);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Aggiungi società…</option>
                    {societaList.map(s => (
                      <option key={s.id} value={s.id}>{s.ragione_sociale || s.nome || s.denominazione}</option>
                    ))}
                  </select>
                  <div className={styles.chipsWrap}>
                    {selectedSocieta.length === 0 && <span className="field-hint">Nessun filtro: tutte le società</span>}
                    {selectedSocieta.map(s => (
                      <span key={s.id} className={styles.filterChip}>
                        {s.label}
                        <button type="button" className={styles.filterChipRemove} onClick={() => handleRemoveSocieta(s.id)} aria-label={`Rimuovi ${s.label}`}>
                          <FiX size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span className="field-label">Sedi</span>
                  <select
                    className="select"
                    value=""
                    onChange={(e) => {
                      handleAddSede(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Aggiungi sede…</option>
                    {sediList.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <div className={styles.chipsWrap}>
                    {selectedSedi.length === 0 && <span className="field-hint">Nessun filtro: tutte le sedi</span>}
                    {selectedSedi.map(s => (
                      <span key={s} className={styles.filterChip}>
                        {s}
                        <button type="button" className={styles.filterChipRemove} onClick={() => handleRemoveSede(s)} aria-label={`Rimuovi ${s}`}>
                          <FiX size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== Notifiche ===== */}
        <section className="card">
          <div className="card-body">
            <label className={styles.checkRow}>
              <input
                id="sendEmail"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              <span>
                <span className={styles.choiceTitle}>Invia anche via email</span>
                <span className={styles.choiceDesc}>Oltre alla notifica nell’app, i destinatari ricevono un’email.</span>
              </span>
            </label>
          </div>
        </section>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate("/comunicazioni")}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit || sending}
          >
            <FiSend size={15} /> {sending ? "Invio…" : "Invia comunicazione"}
          </button>
        </div>
      </form>
      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={true}
          preselectedIds={selectedIds}
          onClose={() => setShowPicker(false)}
          onConfirm={(ids) => {
            setSelectedIds(ids || []);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}
