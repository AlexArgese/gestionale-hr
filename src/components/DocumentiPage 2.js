import React, { useEffect, useState } from "react";
import SelettoreDipendenti from "./SelettoreDipendenti";
import DocumentiSplitCF from "./DocumentiSplitCF";
import DocumentiMerge from "./DocumentiMerge";
import DocumentiCaricaDirettoCF from "./DocumentiCaricaDirettoCF"
import "./DocumentiPage.css";
import { API_BASE } from "../api";

const API = API_BASE;

export default function DocumentiPage() {
  const [tipi, setTipi] = useState([]);
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [file, setFile] = useState(null);
  const [dataScadenza, setDataScadenza] = useState("");
  const [assegnazione, setAssegnazione] = useState("uno"); // uno | alcuni | tutti
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("carica"); // carica | split | merge

  useEffect(() => {
    fetch(`${API}/documenti/tipi`, {
      headers: { Authorization: localStorage.getItem("token") || "" },
    })
      .then((r) => r.json())
      .then(setTipi)
      .catch(console.error);
  }, []);

  const apriSelettore = () => setShowPicker(true);
  const chiudiSelettore = () => setShowPicker(false);
  const confermaSelezione = (ids) => {
    setSelectedIds(ids);
    setShowPicker(false);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!file) return setMsg("Seleziona un file.");
    if (!tipoDocumento) return setMsg("Seleziona un tipo documento.");

    try {
      setLoading(true);

      let targetIds = [];
      if (assegnazione === "tutti") {
        const all = await fetch(`${API}/utenti`).then((r) => r.json());
        targetIds = all.map((u) => u.id);
      } else if (assegnazione === "alcuni") {
        if (selectedIds.length === 0) {
          setLoading(false);
          return setMsg("Seleziona almeno un dipendente.");
        }
        targetIds = selectedIds;
      } else {
        if (selectedIds.length !== 1) {
          setLoading(false);
          return setMsg("Seleziona un solo dipendente.");
        }
        targetIds = selectedIds;
      }

      const token = localStorage.getItem("token") || "";
      let ok = 0;
      for (const utenteId of targetIds) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tipo_documento", tipoDocumento);
        fd.append("utente_id", String(utenteId));
        if (dataScadenza) fd.append("data_scadenza", dataScadenza);

        const res = await fetch(`${API}/documenti/upload`, {
          method: "POST",
          body: fd,
          headers: { Authorization: token },
        });
        if (res.ok) ok += 1;
      }

      setMsg(`Caricamento completato: ${ok}/${targetIds.length} assegnazioni riuscite.`);
      setFile(null);
      setSelectedIds([]);
      (document.getElementById("doc-file") || {}).value = "";
    } catch (err) {
      console.error(err);
      setMsg("Errore durante l'upload.");
    } finally {
      setLoading(false);
    }
  };

  const labelSelezionati =
    assegnazione === "tutti"
      ? "Tutti i dipendenti"
      : selectedIds.length === 0
      ? "Nessuno selezionato"
      : selectedIds.length === 1
      ? `1 dipendente selezionato`
      : `${selectedIds.length} dipendenti selezionati`;

  return (
    <div className="doc-page">
      <h2>Documenti</h2>

      <div className="doc-tabs">
        <button
          className={`doc-tab ${tab === "carica" ? "active" : ""}`}
          onClick={() => setTab("carica")}
        >
          Carica diretto
        </button>
        <button
          className={`doc-tab ${tab === "split" ? "active" : ""}`}
          onClick={() => setTab("split")}
        >
          Split automatico (CF)
        </button>
        <button
          className={`doc-tab ${tab === "merge" ? "active" : ""}`}
          onClick={() => setTab("merge")}
        >
          Merge PDF
        </button>
      </div>

      {tab === "carica" && (
        <DocumentiCaricaDirettoCF tipi={tipi} />
      )}

      {tab === "split" && (
        <DocumentiSplitCF tipi={tipi} />
      )}

      {tab === "merge" && (
        <DocumentiMerge tipi={tipi} />
      )}

      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={assegnazione === "alcuni" || assegnazione === "tutti"}
          preselectedIds={selectedIds}
          onClose={chiudiSelettore}
          onConfirm={confermaSelezione}
        />
      )}
    </div>
  );
}
