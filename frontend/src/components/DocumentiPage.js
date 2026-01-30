import React, { useEffect, useState } from "react";
import {
  FiFilePlus,
  FiScissors,
  FiLayers,
} from "react-icons/fi";

import DocumentiSplitCF from "./DocumentiSplitCF";
import DocumentiMerge from "./DocumentiMerge";
import DocumentiCaricaDirettoCF from "./DocumentiCaricaDirettoCF";
import { API_BASE } from "../api";

const API = API_BASE;
import styles from "./DocumentiPage.module.css";

export default function DocumentiPage() {
  const [tipi, setTipi] = useState([]);
  const [tab, setTab] = useState("carica"); // carica | split | merge
  const [loadingTipi, setLoadingTipi] = useState(true);
  const [errorTipi, setErrorTipi] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingTipi(true);
        setErrorTipi("");
        const res = await fetch(`${API}/documenti/tipi`, {
          headers: { Authorization: localStorage.getItem("token") || "" },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (alive) setTipi(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        if (alive) setErrorTipi("Errore nel caricamento dei tipi documento.");
      } finally {
        if (alive) setLoadingTipi(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.container}>
      {/* Header: titolo, allineato come Utenti */}
      <div className={styles.header}>
        <h1 className={styles.title}>Documenti</h1>
        {/* In futuro qui puoi mettere CTA (es. "Gestisci tipi") */}
      </div>

      <div className={styles.underline} />

      {/* Subnav a pill per le 3 modalità */}
      <div className={styles.subnav}>
        <button
          className={`${styles.subnavLink} ${
            tab === "carica" ? styles.subnavLinkActive : ""
          }`}
          onClick={() => setTab("carica")}
        >
          <FiFilePlus />
          <span>Carica diretto</span>
        </button>

        <button
          className={`${styles.subnavLink} ${
            tab === "split" ? styles.subnavLinkActive : ""
          }`}
          onClick={() => setTab("split")}
        >
          <FiScissors />
          <span>Split automatico (CF)</span>
        </button>

        <button
          className={`${styles.subnavLink} ${
            tab === "merge" ? styles.subnavLinkActive : ""
          }`}
          onClick={() => setTab("merge")}
        >
          <FiLayers />
          <span>Merge PDF</span>
        </button>
      </div>

      {/* Card contenuto, stesso mood del resto del pannello */}
      <div className={`card ${styles.contentCard}`}>
        {loadingTipi && (
          <div className={styles.empty}>Caricamento tipi documento…</div>
        )}

        {errorTipi && !loadingTipi && (
          <div className={styles.empty}>{errorTipi}</div>
        )}

        {!loadingTipi && !errorTipi && (
          <>
            {tab === "carica" && <DocumentiCaricaDirettoCF tipi={tipi} />}
            {tab === "split" && <DocumentiSplitCF tipi={tipi} />}
            {tab === "merge" && <DocumentiMerge tipi={tipi} />}
          </>
        )}
      </div>
    </div>
  );
}
