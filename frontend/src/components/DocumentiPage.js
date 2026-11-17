import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiFilePlus, FiScissors, FiLayers,
  FiRefreshCw, FiDownload, FiTrash2,
  FiX, FiUsers, FiMapPin, FiCalendar, FiFileText, FiChevronRight, FiBell,
} from "react-icons/fi";
import { API_BASE, getIdToken } from "../api";
import styles from "./DocumentiPage.module.css";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";
import Pagination from "./ui/Pagination";

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function openDocumentoFile(docId) {
  const headers = await authHeaders();
  const res = await fetch(`${API}/documenti/${docId}/presigned`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { url } = await res.json();
  window.open(url, "_blank", "noopener,noreferrer");
}

const MODES = [
  {
    id: "carica",
    Icon: FiFilePlus,
    label: "Carica documenti",
    desc: "Carica uno o più file e assegnali ai dipendenti tramite codice fiscale.",
  },
  {
    id: "split",
    Icon: FiScissors,
    label: "Dividi PDF per dipendente",
    desc: "Separa un PDF di più pagine e assegna ogni parte al dipendente giusto.",
  },
  {
    id: "merge",
    Icon: FiLayers,
    label: "Unisci PDF",
    desc: "Unisci più PDF in un unico file e assegnalo a un dipendente.",
  },
];

const FIRMA_DONE = new Set(["done", "completed", "signed"]);

function firmaStatoDa(dest) {
  if (!dest) return null;
  if (FIRMA_DONE.has(dest.yousign_status)) return "firmato";
  if (dest.yousign_status && !["canceled", "expired", "init_error"].includes(dest.yousign_status)) return "attesa";
  return null;
}

export default function DocumentiPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [cronologia, setCronologia] = useState([]);
  const [loadingCron, setLoadingCron] = useState(false);
  const [errorCron, setErrorCron] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null); // batch selezionato per drawer
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchCronologia = useCallback(async (targetPage = page, targetPageSize = pageSize) => {
    setLoadingCron(true);
    setErrorCron("");
    try {
      const res = await fetch(`${API}/documenti?limit=${targetPageSize}&page=${targetPage}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCronologia(data);
        setTotalPages(1);
        setTotalItems(data.length);
      } else {
        setCronologia(data?.items || []);
        setTotalPages(data?.totalPages || 1);
        setTotalItems(data?.total || 0);
      }
    } catch {
      setErrorCron("Impossibile caricare la cronologia.");
    } finally {
      setLoadingCron(false);
    }
  }, [page, pageSize]);

  useEffect(() => { fetchCronologia(page, pageSize); }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Elimina un singolo destinatario dal batch
  const eliminaSingolo = async (docId, urlFile) => {
    const ok = await confirm({
      title: "Rimuovere il destinatario?",
      message: "Il dipendente non vedrà più questo documento nell'app.",
      danger: true,
      confirmLabel: "Rimuovi",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API}/documenti/${docId}`, { method: "DELETE", headers: await authHeaders() });
      if (!res.ok) throw new Error();
      // aggiorna cronologia
      setCronologia(prev => prev.map(d => {
        if (d.url_file !== urlFile) return d;
        const nuovi = d.destinatari.filter(r => r.id !== docId);
        if (nuovi.length === 0) return null;
        return { ...d, destinatari: nuovi, n_destinatari: nuovi.length };
      }).filter(Boolean));
      // aggiorna drawer
      setSelectedDoc(prev => {
        if (!prev || prev.url_file !== urlFile) return prev;
        const nuovi = prev.destinatari.filter(r => r.id !== docId);
        if (nuovi.length === 0) return null;
        return { ...prev, destinatari: nuovi, n_destinatari: nuovi.length };
      });
    } catch {
      toast.error("Errore durante l'eliminazione.");
    }
  };

  // Elimina l'intero batch
  const eliminaBatch = async (doc) => {
    const ok = await confirm({
      title: "Eliminare il documento?",
      message: "Il documento verrà eliminato per tutti i destinatari. L'azione non si può annullare.",
      danger: true,
      confirmLabel: "Elimina",
    });
    if (!ok) return;
    try {
      const body = doc.batch_id
        ? { batch_id: doc.batch_id }
        : { url_file: doc.url_file };
      const res = await fetch(`${API}/documenti/batch`, {
        method: "DELETE",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const key = doc.batch_id || doc.url_file;
      setCronologia(prev => prev.filter(d => (d.batch_id || d.url_file) !== key));
      setSelectedDoc(null);
    } catch {
      toast.error("Errore durante l'eliminazione.");
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Documenti</h1>
          <p className="page-subtitle">Carica buste paga e documenti, e segui lo stato delle firme.</p>
        </div>
      </header>

      {/* Operazioni */}
      <div className={styles.modeGrid}>
        {MODES.map(({ id, Icon, label, desc }) => (
          <button
            key={id}
            className={styles.modeCard}
            onClick={() => navigate(`/documenti/${id}`)}
          >
            <span className={styles.modeIconWrap}><Icon size={18} /></span>
            <span className={styles.modeText}>
              <span className={styles.modeLabel}>{label}</span>
              <span className={styles.modeDesc}>{desc}</span>
            </span>
            <FiChevronRight className={styles.modeArrow} size={16} />
          </button>
        ))}
      </div>

      {/* Cronologia */}
      <section className={`card ${styles.historyCard}`}>
        <div className="card-head">
          <div>
            <h2 className="card-title">Cronologia caricamenti</h2>
            <p className="card-desc">Apri un caricamento per vedere destinatari e stato delle firme.</p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fetchCronologia(page, pageSize)}
            disabled={loadingCron}
          >
            <FiRefreshCw size={14} className={loadingCron ? styles.spinning : ""} /> Aggiorna
          </button>
        </div>

        {loadingCron && <div className="empty-state">Caricamento…</div>}
        {errorCron && <div className="empty-state">{errorCron}</div>}
        {!loadingCron && !errorCron && cronologia.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-title">Nessun caricamento</span>
            <span>Usa una delle operazioni qui sopra per caricare i primi documenti.</span>
          </div>
        )}

        {!loadingCron && !errorCron && cronologia.length > 0 && (
          <div className={styles.tableScroll}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Destinatari</th>
                  <th>Firma</th>
                  <th>Caricato il</th>
                  <th aria-label="Azioni" />
                </tr>
              </thead>
              <tbody>
                {cronologia.map(doc => (
                  <CronologiaItem
                    key={doc.batch_id || doc.url_file}
                    doc={doc}
                    isSelected={(selectedDoc?.batch_id || selectedDoc?.url_file) === (doc.batch_id || doc.url_file)}
                    onClick={() => setSelectedDoc(doc)}
                    onDelete={() => eliminaBatch(doc)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingCron && !errorCron && totalItems > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            itemLabel="caricamenti"
          />
        )}
      </section>

      {/* DRAWER dettaglio */}
      {selectedDoc && (
        <DocDetailDrawer
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onEliminaSingolo={eliminaSingolo}
          onEliminaBatch={() => eliminaBatch(selectedDoc)}
        />
      )}
    </div>
  );
}

/* ─── CronologiaItem ──────────────────────────────────────── */
function CronologiaItem({ doc, isSelected, onClick, onDelete }) {
  const ext = (doc.nome_file || "").split(".").pop().toUpperCase().slice(0, 4);
  const dataFmt = doc.data_upload
    ? new Date(doc.data_upload).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const hasFirmaPendente = (doc.destinatari || []).some(d => firmaStatoDa(d) === "attesa");
  const hasFirmaOk       = (doc.destinatari || []).some(d => firmaStatoDa(d) === "firmato");

  const sediUniche = [...new Set(
    (doc.destinatari || []).flatMap(d =>
      (d.sede || "").split(",").map(s => s.trim()).filter(Boolean)
    )
  )];

  return (
    <tr
      className={`${styles.cronRow} ${isSelected ? styles.cronRowSelected : ""}`}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <td>
        <div className={styles.docCell}>
          <span className={styles.extBadge}>{ext || "DOC"}</span>
          <div className={styles.docText}>
            <span className={styles.docName} title={doc.nome_file}>{doc.nome_file || "—"}</span>
            <span className={styles.docSub}>
              {[doc.tipo_documento, sediUniche.slice(0, 2).join(", ") + (sediUniche.length > 2 ? "…" : "")]
                .filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      </td>
      <td className="tabular">{doc.n_destinatari}</td>
      <td>
        {hasFirmaPendente
          ? <span className="badge badge-warning">In attesa</span>
          : hasFirmaOk
            ? <span className="badge badge-success">Firmato</span>
            : <span className={styles.dash}>—</span>}
      </td>
      <td className={`tabular ${styles.dateCell}`}>{dataFmt}</td>
      <td className={styles.rowActions} onClick={e => e.stopPropagation()}>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={() => openDocumentoFile(doc.id).catch(console.error)}
          title="Apri documento"
          aria-label="Apri documento"
        >
          <FiDownload size={15} />
        </button>
        <button
          className={`btn btn-ghost btn-sm btn-icon ${styles.dangerIcon}`}
          onClick={onDelete}
          title="Elimina per tutti"
          aria-label="Elimina per tutti"
        >
          <FiTrash2 size={15} />
        </button>
      </td>
    </tr>
  );
}

/* ─── DocDetailDrawer ─────────────────────────────────────── */
function DocDetailDrawer({ doc, onClose, onEliminaSingolo, onEliminaBatch }) {
  const [remindSending, setRemindSending] = useState(new Set()); // Set di doc id in invio
  const [remindResult, setRemindResult] = useState(null);

  const sendRemind = async (docIds) => {
    setRemindSending(new Set(docIds));
    setRemindResult(null);
    try {
      const res = await fetch(`${API}/documenti/remind-firma`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ doc_ids: docIds }),
      });
      const data = await res.json();
      setRemindResult(data);
    } catch {
      setRemindResult({ error: 'Errore di rete' });
    } finally {
      setRemindSending(new Set());
    }
  };

  const pendingIds = (doc.destinatari || [])
    .filter(d => firmaStatoDa(d) === 'attesa')
    .map(d => d.id);

  // onEliminaBatch viene chiamata senza argomenti (il doc è già nel closure)
  const sediUniche = [...new Set(
    (doc.destinatari || []).flatMap(d =>
      (d.sede || "").split(",").map(s => s.trim()).filter(Boolean)
    )
  )];

  const societaUniche = [...new Set(
    (doc.destinatari || []).map(d => d.societa_nome).filter(Boolean)
  )];

  const dataFmt = doc.data_upload
    ? new Date(doc.data_upload).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <aside className={styles.drawer}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            <div className={styles.drawerExt}>
              {(doc.nome_file || "").split(".").pop().toUpperCase().slice(0, 4) || "DOC"}
            </div>
            <div>
              <div className={styles.drawerNome}>{doc.nome_file || "—"}</div>
              <div className={styles.drawerTipo}>{doc.tipo_documento || "—"}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Chiudi"><FiX size={18} /></button>
        </div>

        <div className={styles.drawerBody}>
          {/* Info rapide */}
          <div className={styles.drawerInfoGrid}>
            <div className={styles.drawerInfoCell}>
              <FiCalendar className={styles.drawerInfoIcon} />
              <div>
                <div className={styles.drawerInfoLabel}>Caricato il</div>
                <div className={styles.drawerInfoVal}>{dataFmt}</div>
              </div>
            </div>
            {doc.data_scadenza && (
              <div className={styles.drawerInfoCell}>
                <FiCalendar className={styles.drawerInfoIcon} />
                <div>
                  <div className={styles.drawerInfoLabel}>Scadenza</div>
                  <div className={styles.drawerInfoVal}>
                    {new Date(doc.data_scadenza).toLocaleDateString("it-IT")}
                  </div>
                </div>
              </div>
            )}
            <div className={styles.drawerInfoCell}>
              <FiUsers className={styles.drawerInfoIcon} />
              <div>
                <div className={styles.drawerInfoLabel}>Destinatari</div>
                <div className={styles.drawerInfoVal}>{doc.n_destinatari}</div>
              </div>
            </div>
            <div className={styles.drawerInfoCell}>
              <FiFileText className={styles.drawerInfoIcon} />
              <div>
                <div className={styles.drawerInfoLabel}>Firma richiesta</div>
                <div className={styles.drawerInfoVal}>{doc.require_signature ? "Sì" : "No"}</div>
              </div>
            </div>
          </div>

          {/* Sedi */}
          {sediUniche.length > 0 && (
            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><FiMapPin /> Sedi coinvolte</div>
              <div className={styles.tagRow}>
                {sediUniche.map(s => <span key={s} className={styles.tag}>{s}</span>)}
              </div>
            </div>
          )}

          {/* Società */}
          {societaUniche.length > 0 && (
            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}><FiFileText /> Società</div>
              <div className={styles.tagRow}>
                {societaUniche.map(s => <span key={s} className={styles.tag}>{s}</span>)}
              </div>
            </div>
          )}

          {/* Destinatari */}
          <div className={styles.drawerSection}>
            <div className={styles.drawerSectionTitle}><FiUsers /> Destinatari</div>

            {remindResult && (
              <div className={`alert ${remindResult.error ? "alert-danger" : "alert-success"} ${styles.remindAlert}`}>
                {remindResult.error
                  ? `Errore: ${remindResult.error}`
                  : `Mail inviate: ${remindResult.sent}${remindResult.errors?.length ? ` · ${remindResult.errors.length} non consegnate` : ''}`}
              </div>
            )}

            <div className={styles.destList}>
              {(doc.destinatari || []).map(d => {
                const firma = firmaStatoDa(d);
                const nome = [d.cognome, d.nome].filter(Boolean).join(" ") || `Utente ${d.utente_id}`;
                return (
                  <div key={d.id} className={styles.destRow}>
                    <div className={styles.destAvatar}>
                      {(d.cognome || "?")[0].toUpperCase()}
                    </div>
                    <div className={styles.destInfo}>
                      <div className={styles.destNome}>{nome}</div>
                      <div className={styles.destSub}>
                        {d.sede && <span>{d.sede}</span>}
                        {d.societa_nome && <span>{d.sede ? " · " : ""}{d.societa_nome}</span>}
                        {d.email && <span> · {d.email}</span>}
                      </div>
                      {firma && (
                        <span className={`badge ${firma === "firmato" ? "badge-success" : "badge-warning"} ${styles.destBadge}`}>
                          {firma === "firmato" ? "Firmato" : "In attesa di firma"}
                          {firma === "firmato" && d.signed_at
                            ? ` · ${new Date(d.signed_at).toLocaleDateString("it-IT")}`
                            : ""}
                        </span>
                      )}
                      {firma === "attesa" && d.yousign_signature_link && (
                        <a
                          href={d.yousign_signature_link}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.firmaLink}
                        >
                          Apri link di firma
                        </a>
                      )}
                    </div>
                    <div className={styles.destActions}>
                      {firma === "attesa" && (
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => sendRemind([d.id])}
                          disabled={remindSending.has(d.id)}
                          title="Invia promemoria firma"
                          aria-label="Invia promemoria firma"
                        >
                          <FiBell size={15} />
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => openDocumentoFile(d.id).catch(console.error)}
                        title="Apri documento"
                        aria-label="Apri documento"
                      >
                        <FiDownload size={15} />
                      </button>
                      <button
                        className={`btn btn-ghost btn-sm btn-icon ${styles.dangerIcon}`}
                        onClick={() => onEliminaSingolo(d.id, doc.url_file)}
                        title="Rimuovi questo destinatario"
                        aria-label="Rimuovi questo destinatario"
                      >
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.drawerFooter}>
          <button
            className="btn btn-danger-outline"
            onClick={() => onEliminaBatch(doc.url_file)}
          >
            <FiTrash2 size={15} /> Elimina per tutti
          </button>
          <span className={styles.footerSpacer} />
          {pendingIds.length > 0 && (
            <button
              className="btn btn-outline"
              onClick={() => sendRemind(pendingIds)}
              disabled={remindSending.size > 0}
            >
              <FiBell size={15} /> {remindSending.size > 0 ? 'Invio…' : `Promemoria a tutti (${pendingIds.length})`}
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
        </div>
      </aside>
    </>
  );
}
