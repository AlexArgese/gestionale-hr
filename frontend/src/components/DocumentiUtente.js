import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FiFile, FiFolder, FiTrash2, FiChevronRight, FiEdit2, FiCheck, FiX } from "react-icons/fi";
import styles from "./DocumentiUtente.module.css";
import { API_BASE, getIdToken } from "../api";
import { useConfirm } from "./ui/ConfirmDialog";

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function openDocumentoFile(baseUrl, docId) {
  const headers = await authHeaders();
  const res = await fetch(`${baseUrl}/documenti/${docId}/presigned`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { url } = await res.json();
  window.open(url, "_blank", "noopener,noreferrer");
}

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

const sortYearsDesc = ([a], [b]) => {
  const yearA = Number(a);
  const yearB = Number(b);
  const aIsYear = Number.isFinite(yearA);
  const bIsYear = Number.isFinite(yearB);

  if (aIsYear && bIsYear) return yearB - yearA;
  if (aIsYear) return -1;
  if (bIsYear) return 1;
  return b.localeCompare(a);
};


const mapDoc = (d) => ({
  id: d.id,
  name: d.nome_file || "documento",
  tipo: (d.tipo_documento || "Altro").toUpperCase().trim(),
  date: d.data_upload || null,
  scadenza: d.data_scadenza || null,
});

export default function DocumentiUtente({ userId, baseUrl = API }) {
  const confirm = useConfirm();
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
  const patchUrl  = (id) => `${baseUrl}/documenti/${id}`;

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true); setErr("");
      const r = await fetch(listUrl, { headers: await authHeaders({ Accept: "application/json" }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setDocs((Array.isArray(data) ? data : data?.items || []).map(d => mapDoc(d)));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [listUrl]);


  useEffect(() => { fetchDocs(); }, [fetchDocs]);

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
        Object.entries(g[cat]).sort(sortYearsDesc)
      );
    }
    return g;
  }, [docs]);

  const toggleCat = (cat) => {
    const willOpen = !openCats[cat];

    setOpenCats(p => ({ ...p, [cat]: !p[cat] }));
    if (willOpen) {
      setOpenYears(years => Object.fromEntries(
        Object.entries(years).filter(([key]) => !key.startsWith(`${cat}|`))
      ));
    }
  };
  const toggleYear = (cat, year) => setOpenYears(p => ({ ...p, [`${cat}|${year}`]: !p[`${cat}|${year}`] }));
  const isCatOpen  = (cat)       => !!openCats[cat];
  const isYearOpen = (cat, year) => !!openYears[`${cat}|${year}`];

  const deleteDoc = async (doc) => {
    const ok = await confirm({
      title: "Eliminare il documento?",
      message: `"${doc.name}" verrà eliminato definitivamente. L'azione non si può annullare.`,
      danger: true,
      confirmLabel: "Elimina",
    });
    if (!ok) return;
    try {
      setErr("");
      const r = await fetch(deleteUrl(doc.id), { method: "DELETE", headers: await authHeaders() });
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
        headers: await authHeaders({ "Content-Type": "application/json" }),
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
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tipo_documento: newCat }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      setErr(`Errore aggiornamento categoria: ${e.message}`);
      setDocs(p => p.map(d => d.id === dragging ? { ...d, tipo: doc.tipo } : d)); // rollback
    }
    setDragging(null);
  };

  const categorie = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Documenti</h2>
          <p className="card-desc">Trascina un documento su un’altra categoria per spostarlo.</p>
        </div>
      </div>

      {err && <div className={styles.alertWrap}><div className="alert alert-danger">{err}</div></div>}
      {loading && <div className="empty-state">Caricamento documenti…</div>}

      {!loading && categorie.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-title">Nessun documento</span>
          <span>I documenti caricati per questo dipendente compariranno qui.</span>
        </div>
      )}

      {!loading && categorie.length > 0 && (
        <div className={styles.categories}>
          {categorie.map(([cat, years]) => {
            const total = Object.values(years).reduce((n, arr) => n + arr.length, 0);
            const isOpen = isCatOpen(cat);
            const isDragOver = dragOverCat === cat;

            return (
              <div
                key={cat}
                className={`${styles.category} ${isDragOver ? styles.categoryDrop : ""}`}
                onDragOver={e => onCatDragOver(e, cat)}
                onDragLeave={onCatDragLeave}
                onDrop={e => onCatDrop(e, cat)}
              >
                <button
                  type="button"
                  className={styles.categoryHead}
                  onClick={() => toggleCat(cat)}
                  aria-expanded={isOpen}
                >
                  <FiChevronRight className={`${styles.chev} ${isOpen ? styles.chevOpen : ""}`} size={16} />
                  <FiFolder className={styles.folder} size={16} />
                  <span className={styles.categoryName}>{cat}</span>
                  <span className={styles.count}>{total}</span>
                </button>

                {isOpen && Object.entries(years).map(([year, items]) => {
                  const yOpen = isYearOpen(cat, year);
                  return (
                    <div key={year} className={styles.year}>
                      <button
                        type="button"
                        className={styles.yearHead}
                        onClick={() => toggleYear(cat, year)}
                        aria-expanded={yOpen}
                      >
                        <FiChevronRight className={`${styles.chev} ${yOpen ? styles.chevOpen : ""}`} size={14} />
                        {year}
                        <span className={styles.yearCount}>{items.length}</span>
                      </button>

                      {yOpen && (
                        <ul className={styles.list}>
                          {items
                            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                            .map(doc => (
                              <li
                                key={doc.id}
                                className={`${styles.item} ${dragging === doc.id ? styles.itemDragging : ""}`}
                                draggable={renamingId !== doc.id}
                                onDragStart={e => { if (renamingId === doc.id) { e.preventDefault(); return; } onDragStart(e, doc.id); }}
                                onDragEnd={onDragEnd}
                              >
                                {renamingId === doc.id ? (
                                  <>
                                    <input
                                      autoFocus
                                      className={`input ${styles.renameInput}`}
                                      value={renameVal}
                                      onChange={e => setRenameVal(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter")  commitRename(doc);
                                        if (e.key === "Escape") cancelRename();
                                      }}
                                    />
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => commitRename(doc)} title="Conferma" aria-label="Conferma">
                                      <FiCheck size={15} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={cancelRename} title="Annulla" aria-label="Annulla">
                                      <FiX size={15} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <FiFile className={styles.fileIcon} size={15} />
                                    <button
                                      type="button"
                                      className={styles.link}
                                      onClick={() => openDocumentoFile(baseUrl, doc.id).catch(e => setErr(e.message))}
                                      title={doc.name}
                                    >
                                      {doc.name}
                                    </button>
                                    {doc.scadenza && (
                                      <span className="badge badge-warning">Scade il {fmtData(doc.scadenza)}</span>
                                    )}
                                    <span className={styles.meta}>{fmtData(doc.date)}</span>
                                    <div className={styles.itemActions}>
                                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => startRename(doc)} title="Rinomina" aria-label="Rinomina">
                                        <FiEdit2 size={14} />
                                      </button>
                                      <button className={`btn btn-ghost btn-sm btn-icon ${styles.delBtn}`} onClick={() => deleteDoc(doc)} title="Elimina" aria-label="Elimina">
                                        <FiTrash2 size={14} />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
