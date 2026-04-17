import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiFilePlus, FiScissors, FiLayers,
  FiRefreshCw, FiDownload, FiTrash2, FiPenTool,
} from "react-icons/fi";
import { API_BASE } from "../api";
import styles from "./DocumentiPage.module.css";

const API = API_BASE;

const MODES = [
  {
    id: "carica",
    Icon: FiFilePlus,
    label: "Carica diretto",
    desc: "Carica uno o più documenti assegnandoli direttamente a un dipendente via codice fiscale.",
  },
  {
    id: "split",
    Icon: FiScissors,
    label: "Split automatico (CF)",
    desc: "Dividi un PDF multi-pagina e assegna automaticamente ogni sezione al dipendente corrispondente.",
  },
  {
    id: "merge",
    Icon: FiLayers,
    label: "Merge PDF",
    desc: "Unisci più PDF in un unico file e assegna il risultato a un dipendente.",
  },
];

export default function DocumentiPage() {
  const navigate = useNavigate();
  const [cronologia, setCronologia] = useState([]);
  const [loadingCron, setLoadingCron] = useState(false);
  const [errorCron, setErrorCron] = useState("");

  const fetchCronologia = useCallback(async () => {
    setLoadingCron(true);
    setErrorCron("");
    try {
      const res = await fetch(`${API}/documenti?limit=50&order=desc`, {
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

  const eliminaDoc = async (docId) => {
    if (!window.confirm("Eliminare questo documento? L'azione è irreversibile.")) return;
    try {
      const res = await fetch(`${API}/documenti/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCronologia(prev => prev.filter(d => d.id !== docId));
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

          {loadingCron && (
            <div className={styles.stateMsg}>Caricamento…</div>
          )}
          {errorCron && (
            <div className={styles.stateMsg}>{errorCron}</div>
          )}
          {!loadingCron && !errorCron && cronologia.length === 0 && (
            <div className={styles.stateMsg}>
              Nessun caricamento recente. Usa le operazioni a sinistra per caricare documenti.
            </div>
          )}

          <div className={styles.cronList}>
            {cronologia.map(doc => (
              <CronologiaItem key={doc.id} doc={doc} onDelete={eliminaDoc} />
            ))}
          </div>
        </main>
      </div>

    </div>
  );
}

const FIRMA_DONE = new Set(["done", "completed", "signed"]);

function CronologiaItem({ doc, onDelete }) {
  const ext = (doc.nome_file || "").split(".").pop().toUpperCase().slice(0, 4);

  const dataFmt = doc.data_upload
    ? new Date(doc.data_upload).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const firmaStato = FIRMA_DONE.has(doc.yousign_status)
    ? "firmato"
    : doc.require_signature && doc.yousign_status && !["canceled", "expired", "init_error"].includes(doc.yousign_status)
    ? "attesa"
    : null;

  const nomeUtente = doc.utente_cognome
    ? `${doc.utente_cognome} ${doc.utente_nome || ""}`.trim()
    : null;

  return (
    <div className={styles.cronItem}>
      <div className={styles.cronExtBadge}>{ext || "DOC"}</div>

      <div className={styles.cronMeta}>
        <div className={styles.cronNome}>{doc.nome_file || "—"}</div>
        <div className={styles.cronSub}>
          {doc.tipo_documento && <span>{doc.tipo_documento}</span>}
          {nomeUtente && <span> · {nomeUtente}</span>}
          <span> · {dataFmt}</span>
        </div>
        {firmaStato && (
          <span className={`${styles.firmaBadge} ${styles[`firma_${firmaStato}`]}`}>
            {firmaStato === "firmato" ? "✓ Firmato" : "⏳ Firma in attesa"}
          </span>
        )}
      </div>

      <div className={styles.cronActions}>
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
          onClick={() => onDelete(doc.id)}
          title="Elimina"
        >
          <FiTrash2 />
        </button>
        {firmaStato && (
          <button
            className={`${styles.actionBtn} ${styles.actionFirma}`}
            title="Monitoraggio firma"
          >
            <FiPenTool />
          </button>
        )}
      </div>
    </div>
  );
}
