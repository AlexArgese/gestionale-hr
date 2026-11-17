// frontend/src/components/UtentiPage.js
import { useSearchParams } from "react-router-dom";
import UtentiTable from "./UtentiTable";
import SediTable from "./SediTable";

const TABS = [
  { key: "utenti", label: "Attivi" },
  { key: "archiviati", label: "Archiviati" },
  { key: "sedi", label: "Sedi" },
];

const SOTTOTITOLI = {
  utenti: "Anagrafica dei dipendenti, stato e sede di lavoro.",
  archiviati: "Dipendenti archiviati: non compaiono nelle altre sezioni.",
  sedi: "Sedi di lavoro e relative impostazioni di timbratura.",
};

function UtentiPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.key === rawTab) ? rawTab : "utenti";

  const setActiveTab = (tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Dipendenti</h1>
          <p className="page-subtitle">{SOTTOTITOLI[activeTab]}</p>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className="tab"
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "utenti" && <UtentiTable archived={false} activeTab="utenti" />}
      {activeTab === "archiviati" && <UtentiTable archived activeTab="archiviati" />}
      {activeTab === "sedi" && <SediTable />}
    </div>
  );
}

export default UtentiPage;
