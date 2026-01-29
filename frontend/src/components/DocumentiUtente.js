// frontend/src/DocumentiUtente.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiFile, FiChevronDown, FiTrash2, FiUpload, FiPaperclip } from "react-icons/fi";
import styles from "./DocumentiUtente.module.css";

/**
 * Rotte usate:
 *  - GET    /documenti/utente/:id          (lista)
 *  - GET    /documenti/tipi                (tipi ufficiali)
 *  - POST   /documenti/upload              (multipart: file, utente_id, tipo_documento, data_scadenza?)
 *  - DELETE /documenti/:docId
 *  - VIEW   static /uploads/documenti/<filename>  (apertura inline in nuova scheda)
 *
 * Tutte con credentials: 'include' (requireAuth).
 */

function DocumentiUtente({ userId, baseUrl = "http://localhost:3001" }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [tipi, setTipi] = useState([]); // da /documenti/tipi

  // upload state
  const [selFiles, setSelFiles] = useState([]); // [{file, tipo_documento:"", data_scadenza:""}]
  const fileInputRef = useRef(null);

  const listUrl     = `${baseUrl}/documenti/utente/${userId}`;
  const tipiUrl     = `${baseUrl}/documenti/tipi`;
  const uploadUrl   = `${baseUrl}/documenti/upload`;
  const deleteUrl   = (docId) => `${baseUrl}/documenti/${docId}`;
  const staticView  = (relPath) => `${baseUrl}/${relPath}`; // es: uploads/documenti/xxx.pdf

  // mappa record -> shape UI
  const mapDoc = (d) => {
    const rel = d?.url_file_signed || d?.url_file; // ✅ preferisci il firmato
    return {
      id: d?.id,
      name: d?.nome_file || "documento",
      tipo: d?.tipo_documento || "Altro",
      created_at: d?.data_upload || null,
      scadenza: d?.data_scadenza || null,
      viewHref: rel ? staticView(rel) : undefined,
      isSigned: !!d?.url_file_signed,
      yousignStatus: d?.yousign_status || null,
    };
  };


  const fetchDocs = async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await fetch(listUrl, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs((Array.isArray(data) ? data : (data?.items || [])).map(mapDoc));
    } catch (e) {
      setErr(e.message || "Errore caricamento documenti");
    } finally {
      setLoading(false);
    }
  };

  const fetchTipi = async () => {
    try {
      const res = await fetch(tipiUrl, { headers: { Accept: "application/json" }, credentials: "include" });
      if (!res.ok) return;
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length) setTipi(arr);
    } catch {}
  };

  useEffect(() => {
    fetchTipi();
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, baseUrl]);

  // grouping per tipo_documento
  const grouped = useMemo(() => {
    const g = {};
    for (const d of docs) {
      const key = d.tipo || "Altro";
      if (!g[key]) g[key] = [];
      g[key].push(d);
    }
    return g;
  }, [docs]);

  const onPickFiles = (ev) => {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    // nessun default: l’utente deve scegliere il tipo
    const withMeta = files.map((f) => ({ file: f, tipo_documento: "", data_scadenza: "" }));
    setSelFiles((prev) => [...prev, ...withMeta]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const changeChipTipo = (idx, val) => {
    setSelFiles((prev) => prev.map((x, i) => (i === idx ? { ...x, tipo_documento: val } : x)));
  };
  const changeChipScadenza = (idx, val) => {
    setSelFiles((prev) => prev.map((x, i) => (i === idx ? { ...x, data_scadenza: val } : x)));
  };
  const removeChip = (idx) => setSelFiles((prev) => prev.filter((_x, i) => i !== idx));

  const allHaveTipo = selFiles.length > 0 && selFiles.every((x) => String(x.tipo_documento || "").trim() !== "");

  const uploadAll = async () => {
    if (!allHaveTipo) return; // safety

    // 🔔 Conferma prima dell’upload
    const summary = selFiles
      .map((it) => `• ${it.file.name} — ${it.tipo_documento}${it.data_scadenza ? ` (scad. ${it.data_scadenza})` : ""}`)
      .join("\n");
    const ok = window.confirm(`Confermi il caricamento di ${selFiles.length} file?\n\n${summary}`);
    if (!ok) return;

    try {
      setErr("");
      // /documenti/upload accetta 1 file per volta → invio in serie
      for (const item of selFiles) {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("utente_id", String(userId));
        fd.append("tipo_documento", item.tipo_documento);
        if (item.data_scadenza) fd.append("data_scadenza", item.data_scadenza);

        const res = await fetch(uploadUrl, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Upload fallito (${res.status})`);
        }
      }
      setSelFiles([]);
      fetchDocs();
    } catch (e) {
      setErr(e.message || "Errore upload");
    }
  };

  const deleteDoc = async (doc) => {
    if (!window.confirm(`Eliminare il documento "${doc.name}"?`)) return;
    try {
      setErr("");
      const res = await fetch(deleteUrl(doc.id), { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      setErr(e.message || "Errore eliminazione");
    }
  };

  return (
    <div className={styles.container}>
      {/* Titolo sezione */}
      <div className={styles.head}>
        <FiFile className={styles.icon} />
        <h3 className={styles.title}>Documenti</h3>
      </div>
      <div className={styles.underline} />

      {err && <div className="small" style={{ color: "#8A1F1F", marginBottom: 8 }}>{err}</div>}
      {loading && <div className="small">Caricamento documenti…</div>}

      {/* UPLOAD */}
      <div className={styles.upload}>
        <div className={styles.controlsRow}>
          <input
            ref={fileInputRef}
            className={styles.hiddenFile}
            id="filepick"
            type="file"
            multiple
            onChange={onPickFiles}
          />
          <label htmlFor="filepick" className="btn btn-outline">
            <FiUpload /> Seleziona file
          </label>
          <button className="btn btn-primary" onClick={uploadAll} disabled={!allHaveTipo}>
            Carica {selFiles.length ? `(${selFiles.length})` : ""}
          </button>
        </div>

        {/* Chips dei file selezionati */}
        <div className={styles.filesBar}>
          {!selFiles.length && <span className={styles.helper}>Nessun file selezionato.</span>}
          {selFiles.map((f, idx) => (
            <div key={idx} className={styles.chip}>
              <span className={styles.name}>{f.file.name}</span>

              {/* Tipo documento OBBLIGATORIO */}
              <div className={styles.chipTipoWrapper}>
                <input
                  list={`tipi-doc-${idx}`}
                  className={styles.chipSelect}
                  value={f.tipo_documento}
                  onChange={(e) => changeChipTipo(idx, e.target.value)}
                  placeholder="Tipo documento…"
                />
                <datalist id={`tipi-doc-${idx}`}>
                  {tipi.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              {/* Scadenza opzionale */}
              <input
                type="date"
                className={styles.chipSelect}
                value={f.data_scadenza}
                onChange={(e) => changeChipScadenza(idx, e.target.value)}
                title="Data scadenza (opzionale)"
              />

              <button className={styles.chipBtn} onClick={() => removeChip(idx)} title="Rimuovi">
                ✕
              </button>
            </div>
          ))}
        </div>

        {!allHaveTipo && selFiles.length > 0 && (
          <div className="small" style={{ color: "#8A1F1F", marginTop: 8 }}>
            Seleziona il <b>Tipo documento</b> per tutti i file per abilitare il caricamento.
          </div>
        )}
      </div>

      {/* LISTA per tipo_documento */}
      {!loading && Object.keys(grouped).length === 0 && (
        <div className="small" style={{ color: "var(--txt-muted)" }}>
          Nessun documento caricato.
        </div>
      )}

      {!loading &&
        Object.entries(grouped).map(([tipo, items]) => (
          <details key={tipo} className={styles.details} open>
            <summary className={styles.summary}>
              <span>
                {tipo} ({items.length})
              </span>
              <span className={styles.chev}>
                <FiChevronDown />
              </span>
            </summary>
            <ul className={styles.list}>
              {items.map((d) => (
                <li key={d.id} className={styles.item}>
                  {/* APERTURA INLINE IN NUOVA SCHEDA */}
                  <a
                    className={styles.link}
                    href={d.viewHref || "#"}
                    target="_blank"
                    rel="noreferrer"
                    title="Apri in una nuova scheda"
                  >
                    <FiPaperclip style={{ verticalAlign: "-2px" }} /> {d.name}
                  </a>
                  <span className={styles.meta}>
                    {d.created_at ? ` • ${new Date(d.created_at).toLocaleDateString()}` : ""}
                    {d.scadenza ? ` • Scad.: ${new Date(d.scadenza).toLocaleDateString()}` : ""}
                  </span>
                  <button className={styles.delBtn} onClick={() => deleteDoc(d)} title="Elimina">
                    <FiTrash2 />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}

export default DocumentiUtente;
