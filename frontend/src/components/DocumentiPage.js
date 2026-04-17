import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiFilePlus, FiScissors, FiLayers,
  FiRefreshCw, FiDownload, FiTrash2, FiPenTool,
  FiX, FiUsers, FiMapPin, FiCalendar, FiFileText, FiChevronRight,
} from "react-icons/fi";
import { API_BASE } from "../api";
import styles from "./DocumentiPage.module.css";

const API = API_BASE;

const MODES = [
  {
    id: "carica",
    Icon: FiFilePlus,
    label: "Carica diretto",
    desc: "Carica documenti assegnandoli a un dipendente via codice fiscale.",
  },
  {
    id: "split",
    Icon: FiScissors,
    label: "Split automatico (CF)",
    desc: "Dividi un PDF multi-pagina e assegna ogni sezione al dipendente corrispondente.",
  },
  {
    id: "merge",
    Icon: FiLayers,
    label: "Merge PDF",
    desc: "Unisci più PDF in un unico file e assegna il risultato a un dipendente.",
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
  const [cronologia, setCronologia] = useState([]);
  const [loadingCron, setLoadingCron] = useState(false);
  const [errorCron, setErrorCron] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null); // batch selezionato per drawer

  const fetchCronologia = useCallback(async () => {
    setLoadingCron(true);
    setErrorCron("");
    try {
      const res = await fetch(`${API}/documenti?limit=100`, {
        headers: { Authorization: localStorage.getItem("token") || "" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCronologia(Array.isArray(data) ? data : (data?.items || []));
    } catch {
      setErrorCron("Impossibile caricare la cronologia.");
    } finally {
      setLoadingCron(false);
    }
  }, []);

  useEffect(() => { fetchCronologia(); }, [fetchCronologia]);

  // Elimina un singolo destinatario dal batch
  const eliminaSingolo = async (docId, urlFile) => {
    if (!window.confirm("Rimuovere questo destinatario dal documento?")) return;
    try {
      const res = await fetch(`${API}/documenti/${docId}`, { method: "DELETE" });
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
      alert("Errore durante l'eliminazione.");
    }
  };

  // Elimina l'intero batch
  const eliminaBatch = async (urlFile) => {
    if (!window.confirm("Eliminare il documento per TUTTI i destinatari? L'azione è irreversibile.")) return;
    try {
      const res = await fetch(`${API}/documenti/batch`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url_file: urlFile }),
      });
      if (!res.ok) throw new Error();
      setCronologia(prev => prev.filter(d => d.url_file !== urlFile));
      setSelectedDoc(null);
    } catch {
      alert("Errore durante l'eliminazione.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Documenti</h1>
      </div>
      <div className={styles.underline} />

      <div className={styles.layout}>
        {/* LEFT: selettore operazione */}
        <aside className={styles.left}>
          <h3 className={styles.panelTitle}>Operazione</h3>
          <div className={styles.modeList}>
            {MODES.map(({ id, Icon, label, desc }) => (
              <button
                key={id}
                className={styles.modeCard}
                onClick={() => navigate(`/documenti/${id}`)}
              >
                <div className={styles.modeIconWrap}><Icon /></div>
                <div className={styles.modeText}>
                  <div className={styles.modeLabel}>{label}</div>
                  <div className={styles.modeDesc}>{desc}</div>
                </div>
                <FiChevronRight className={styles.modeArrow} />
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT: cronologia */}
        <main className={styles.right}>
          <div className={styles.cronHeader}>
            <h3 className={styles.panelTitle}>Cronologia caricamenti</h3>
            <button
              className={styles.refreshBtn}
              onClick={fetchCronologia}
              disabled={loadingCron}
              title="Aggiorna"
            >
              <FiRefreshCw className={loadingCron ? styles.spinning : ""} />
            </button>
          </div>

          {loadingCron && <div className={styles.stateMsg}>Caricamento…</div>}
          {errorCron  && <div className={styles.stateMsg}>{errorCron}</div>}
          {!loadingCron && !errorCron && cronologia.length === 0 && (
            <div className={styles.stateMsg}>
              Nessun caricamento recente. Usa le operazioni a sinistra per caricare documenti.
            </div>
          )}

          <div className={styles.cronList}>
            {cronologia.map(doc => (
              <CronologiaItem
                key={doc.url_file}
                doc={doc}
                isSelected={selectedDoc?.url_file === doc.url_file}
                onClick={() => setSelectedDoc(doc)}
                onDelete={() => eliminaBatch(doc.url_file)}
              />
            ))}
          </div>
        </main>
      </div>

      {/* DRAWER dettaglio */}
      {selectedDoc && (
        <DocDetailDrawer
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onEliminaSingolo={eliminaSingolo}
          onEliminaBatch={eliminaBatch}
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
    <div
      className={`${styles.cronItem} ${isSelected ? styles.cronItemSelected : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <div className={styles.cronExtBadge}>{ext || "DOC"}</div>

      <div className={styles.cronMeta}>
        <div className={styles.cronNome}>{doc.nome_file || "—"}</div>
        <div className={styles.cronSub}>
          {doc.tipo_documento && <span>{doc.tipo_documento}</span>}
          {sediUniche.length > 0 && <span> · {sediUniche.slice(0, 2).join(", ")}{sediUniche.length > 2 ? "…" : ""}</span>}
          <span> · {dataFmt}</span>
        </div>
        <div className={styles.cronBadgeRow}>
          <span className={styles.destBadge}>
            <FiUsers /> {doc.n_destinatari} {doc.n_destinatari === 1 ? "dest." : "dest."}
          </span>
          {hasFirmaOk      && <span className={`${styles.firmaBadge} ${styles.firma_firmato}`}>✓ Firmato</span>}
          {hasFirmaPendente && <span className={`${styles.firmaBadge} ${styles.firma_attesa}`}>⏳ Firma in attesa</span>}
        </div>
      </div>

      <div className={styles.cronActions} onClick={e => e.stopPropagation()}>
        <a
          className={styles.actionBtn}
          href={`${API}/documenti/${doc.id}/download`}
          target="_blank"
          rel="noreferrer"
          title="Scarica"
        >
          <FiDownload />
        </a>
        <button
          className={`${styles.actionBtn} ${styles.actionDanger}`}
          onClick={onDelete}
          title="Elimina tutti"
        >
          <FiTrash2 />
        </button>
      </div>
    </div>
  );
}

/* ─── DocDetailDrawer ─────────────────────────────────────── */
function DocDetailDrawer({ doc, onClose, onEliminaSingolo, onEliminaBatch }) {
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
          <button className={styles.drawerClose} onClick={onClose}><FiX /></button>
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
                        <span className={`${styles.firmaBadge} ${styles[`firma_${firma}`]}`}>
                          {firma === "firmato" ? "✓ Firmato" : "⏳ In attesa di firma"}
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
                          Link firma →
                        </a>
                      )}
                    </div>
                    <div className={styles.destActions}>
                      <a
                        className={styles.actionBtn}
                        href={`${API}/documenti/${d.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        title="Scarica"
                      >
                        <FiDownload />
                      </a>
                      <button
                        className={`${styles.actionBtn} ${styles.actionDanger}`}
                        onClick={() => onEliminaSingolo(d.id, doc.url_file)}
                        title="Rimuovi questo destinatario"
                      >
                        <FiTrash2 />
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
          <button className={styles.btnOutline} onClick={onClose}>Chiudi</button>
          <button
            className={styles.btnDanger}
            onClick={() => onEliminaBatch(doc.url_file)}
          >
            <FiTrash2 /> Elimina per tutti
          </button>
        </div>
      </aside>
    </>
  );
}
