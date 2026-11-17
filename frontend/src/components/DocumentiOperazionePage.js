import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import DocumentiCaricaDirettoCF from "./DocumentiCaricaDirettoCF";
import DocumentiSplitCF from "./DocumentiSplitCF";
import DocumentiMerge from "./DocumentiMerge";
import { API_BASE, getIdToken } from "../api";
import styles from "./DocumentiPage.module.css";

const API = API_BASE;

const META = {
  carica: {
    label: "Carica documenti",
    desc: "Carica uno o più file e assegnali ai dipendenti tramite codice fiscale.",
  },
  split: {
    label: "Dividi PDF per dipendente",
    desc: "Separa un PDF di più pagine e assegna ogni parte al dipendente giusto.",
  },
  merge: {
    label: "Unisci PDF",
    desc: "Unisci più PDF in un unico file e assegnalo a un dipendente.",
  },
};

export default function DocumentiOperazionePage() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const [tipi, setTipi] = useState([]);

  useEffect(() => {
    getIdToken()
      .then((token) => fetch(`${API}/documenti/tipi`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }))
      .then(r => r.ok ? r.json() : [])
      .then(data => setTipi(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const meta = META[mode];
  if (!meta) {
    navigate("/documenti", { replace: true });
    return null;
  }

  const { label, desc } = meta;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate("/documenti")}>
            <FiArrowLeft size={14} /> Documenti
          </button>
          <h1 className="page-title">{label}</h1>
          <p className="page-subtitle">{desc}</p>
        </div>
      </header>

      <div className={`card ${styles.contentCard}`}>
        {mode === "carica" && <DocumentiCaricaDirettoCF tipi={tipi} />}
        {mode === "split"  && <DocumentiSplitCF tipi={tipi} />}
        {mode === "merge"  && <DocumentiMerge tipi={tipi} />}
      </div>
    </div>
  );
}
