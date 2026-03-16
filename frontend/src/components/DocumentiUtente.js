import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { FiFile, FiChevronDown, FiTrash2, FiPaperclip, FiChevronRight, FiEdit2, FiCheck, FiX } from "react-icons/fi";
import styles from "./DocumentiUtente.module.css";
import { API_BASE } from "../api";

const API = API_BASE;

const fmtData = (v) => {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return ""; }
};
const getYear = (v) => {
  if (!v) return "—";
  try { return String(new Date(v).getFullYear()); }
  catch { return "—"; }
};

export default function DocumentiUtente({ userId, baseUrl = API }) {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  /* stato apertura categorie e anni */
  const [openCats, setOpenCats]   = useState({});
  const [openYears, setOpenYears] = useState({});

  /* drag & drop */
  const [dragging, setDragging]       = useState(null);
  const [dragOverCat, setDragOverCat] = useState(null);

  const [renamingId, setRenamingId] = useState(null);
  const [renameVal,  setRenameVal]  = useState("");

  const listUrl   = `${baseUrl}/documenti/utente/${userId}`;
  const deleteUrl = (id) => `${baseUrl}/documenti/${id}`;
  const viewUrl   = (id) => `${baseUrl}/documenti/${id}/view`;
  const patchUrl  = (id) => `${baseUrl}/documenti/${id}`;

  const mapDoc = (d) => ({
    id: d.id,
    name: d.nome_file || "documento",
    tipo: (d.tipo_documento || "Altro").toUpperCase().trim(),
    date: d.data_upload || null,
    scadenza: d.data_scadenza || null,
    viewHref: d.id ? viewUrl(d.id) : undefined,
  });

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const r = await fetch(listUrl, { headers: { Accept: "application/json" }, credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setDocs((Array.isArray(data) ? data : data?.items || []).map(mapDoc));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [listUrl]);


  useEffect(() => { fetchDocs(); }, [userId, baseUrl]);

  /* raggruppamento cat → anno → docs */
  const grouped = useMemo(() => {
    const g = {};
    for (const d of docs) {
      const cat  = d.tipo || "ALTRO";
      const year = getYear(d.date);
      if (!g[cat]) g[cat] = {};
      if (!g[cat][year]) g[cat][year] = [];
      g[cat][year].push(d);
    }
    for (const cat of Object.keys(g)) {
      g[cat] = Object.fromEntries(
        Object.entries(g[cat]).sort(([a], [b]) => b.localeCompare(a))
      );
    }
    return g;
  }, [docs]);

  const toggleCat  = (cat)       => setOpenCats(p  => ({ ...p, [cat]: !p[cat] }));
  const toggleYear = (cat, year) => setOpenYears(p => ({ ...p, [`${cat}|${year}`]: !p[`${cat}|${year}`] }));
  const isCatOpen  = (cat)       => !!openCats[cat];
  const isYearOpen = (cat, year) => openYears[`${cat}|${year}`] !== false; // default aperto  

  const deleteDoc = async (doc) => {
    if (!window.confirm(`Eliminare "${doc.name}"?`)) return;
    try {
      setErr("");
      const r = await fetch(deleteUrl(doc.id), { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDocs(p => p.filter(d => d.id !== doc.id));
    } catch (e) { setErr(e.message); }
  };

  const startRename = (doc) => {
    setRenamingId(doc.id);
    setRenameVal(doc.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameVal("");
  };

  const commitRename = async (doc) => {
    const newName = renameVal.trim();
    if (!newName || newName === doc.name) { cancelRename(); return; }

    // aggiornamento ottimistico
    setDocs(p => p.map(d => d.id === doc.id ? { ...d, name: newName } : d));
    cancelRename();

    try {
      const r = await fetch(patchUrl(doc.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nome_file: newName }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      setErr(`Errore rinomina: ${e.message}`);
      setDocs(p => p.map(d => d.id === doc.id ? { ...d, name: doc.name } : d)); // rollback
    }
  };

  /* drag & drop */
  const onDragStart = (e, docId) => { setDragging(docId); e.dataTransfer.effectAllowed = "move"; };
  const onDragEnd   = () => { setDragging(null); setDragOverCat(null); };

  const onCatDragOver  = (e, cat) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverCat(cat); };
  const onCatDragLeave = () => setDragOverCat(null);

  const onCatDrop = async (e, newCat) => {
    e.preventDefault();
    setDragOverCat(null);
    if (!dragging) return;
    const doc = docs.find(d => d.id === dragging);
    if (!doc || doc.tipo === newCat) return;

    setDocs(p => p.map(d => d.id === dragging ? { ...d, tipo: newCat } : d)); // ottimistic

    try {
      const r = await fetch(patchUrl(dragging), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tipo_documento: newCat }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      setErr(`Errore aggiornamento categoria: ${e.message}`);
      setDocs(p => p.map(d => d.id === dragging ? { ...d, tipo: doc.tipo } : d)); // rollback
    }
    setDragging(null);
  };

  return (
    <div className={styles.container}>
      {/* Titolo */}
      <div className={styles.head}>
        <FiFile className={styles.icon} />
        <h3 className={styles.title}>Documenti</h3>
      </div>
      <div className={styles.underline} />

      {err && <div className="small" style={{ color: "#8A1F1F", marginBottom: 8 }}>{err}</div>}
      {loading && <div className="small">Caricamento documenti…</div>}

      {/* Lista categorie */}
      {!loading && Object.keys(grouped).length === 0 && (
        <div className="small" style={{ color: "var(--txt-muted)" }}>Nessun documento caricato.</div>
      )}

      {!loading && Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, years]) => {
        const total    = Object.values(years).reduce((n, arr) => n + arr.length, 0);
        const isOpen   = isCatOpen(cat);
        const isDragOver = dragOverCat === cat;

        return (
          <details
            key={cat}
            className={styles.details}
            open={isOpen || undefined}
            style={isDragOver ? { outline: "2px dashed #D0933C", outlineOffset: 2 } : undefined}
            onDragOver={e => onCatDragOver(e, cat)}
            onDragLeave={onCatDragLeave}
            onDrop={e => onCatDrop(e, cat)}
          >
            <summary className={styles.summary} onClick={e => { e.preventDefault(); toggleCat(cat); }}>
              <span>{cat} ({total})</span>
              <span className={styles.chev}><FiChevronDown /></span>
            </summary>

            {isOpen && Object.entries(years).map(([year, items]) => {
              const yOpen = isYearOpen(cat, year);
              return (
                <div key={year} style={{ borderBottom: "1px solid var(--border, #E5E7EB)" }}>
                  {/* Header anno */}
                  <div
                    onClick={() => toggleYear(cat, year)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", cursor: "pointer", userSelect: "none",
                      background: "var(--bg-subtle, #F8FAFC)",
                      fontSize: 12, fontWeight: 600, color: "var(--txt-muted, #64748B)",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {yOpen ? <FiChevronDown size={11} /> : <FiChevronRight size={11} />}
                    {year}
                    <span style={{ fontWeight: 400, marginLeft: 2 }}>({items.length})</span>
                  </div>

                  {yOpen && (
                    <ul className={styles.list}>
                      {items
                        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                        .map(doc => (
                          <li
                            key={doc.id}
                            className={styles.item}
                            draggable={renamingId !== doc.id}
                            onDragStart={e => { if (renamingId === doc.id) { e.preventDefault(); return; } onDragStart(e, doc.id); }}
                            onDragEnd={onDragEnd}
                            style={dragging === doc.id ? { opacity: 0.4 } : undefined}
                          >
                            {renamingId === doc.id ? (
                              /* ── modalità rinomina ── */
                              <>
                                <input
                                  autoFocus
                                  className={styles.renameInput}
                                  value={renameVal}
                                  onChange={e => setRenameVal(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter")  commitRename(doc);
                                    if (e.key === "Escape") cancelRename();
                                  }}
                                />
                                <button className={styles.iconBtn} onClick={() => commitRename(doc)} title="Conferma">
                                  <FiCheck />
                                </button>
                                <button className={styles.iconBtn} onClick={cancelRename} title="Annulla">
                                  <FiX />
                                </button>
                              </>
                            ) : (
                              /* ── modalità visualizzazione ── */
                              <>
                                <a
                                  className={styles.link}
                                  href={doc.viewHref || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={doc.name}
                                >
                                  <FiPaperclip style={{ verticalAlign: "-2px", marginRight: 4 }} />
                                  {doc.name}
                                </a>
                                <span className={styles.meta}>
                                  {fmtData(doc.date)}
                                  {doc.scadenza && (
                                    <span style={{ color: "#D97706", marginLeft: 6 }}>⚠ {fmtData(doc.scadenza)}</span>
                                  )}
                                </span>
                                <button className={styles.iconBtn} onClick={() => startRename(doc)} title="Rinomina">
                                  <FiEdit2 />
                                </button>
                                <button className={styles.delBtn} onClick={() => deleteDoc(doc)} title="Elimina">
                                  <FiTrash2 />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}