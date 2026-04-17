import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiFilePlus, FiScissors, FiLayers } from "react-icons/fi";
import DocumentiCaricaDirettoCF from "./DocumentiCaricaDirettoCF";
import DocumentiSplitCF from "./DocumentiSplitCF";
import DocumentiMerge from "./DocumentiMerge";
import { API_BASE } from "../api";
import styles from "./DocumentiPage.module.css";

const API = API_BASE;

const META = {
  carica: { label: "Carica diretto",         Icon: FiFilePlus  },
  split:  { label: "Split automatico (CF)",   Icon: FiScissors  },
  merge:  { label: "Merge PDF",               Icon: FiLayers    },
};

export default function DocumentiOperazionePage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const [tipi, setTipi] = useState([]);

  useEffect(() => {
    fetch(`${API}/documenti/tipi`, {
      headers: { Authorization: localStorage.getItem("token") || "" },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setTipi(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const meta = META[mode];
  if (!meta) {
    navigate("/documenti", { replace: true });
    return null;
  }

  const { label, Icon } = meta;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.opHeader}>
          <button
            className={styles.backBtn}
            onClick={() => navigate("/documenti")}
          >
            <FiArrowLeft /> Indietro
          </button>
          <div className={styles.opTitleWrap}>
            <div className={styles.opIconWrap}><Icon /></div>
            <h1 className={styles.title}>{label}</h1>
          </div>
        </div>
      </div>
      <div className={styles.underline} />

      <div className={`card ${styles.contentCard}`}>
        {mode === "carica" && <DocumentiCaricaDirettoCF tipi={tipi} />}
        {mode === "split"  && <DocumentiSplitCF tipi={tipi} />}
        {mode === "merge"  && <DocumentiMerge tipi={tipi} />}
      </div>
    </div>
  );
}
