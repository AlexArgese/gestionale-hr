// frontend/src/components/UtentiPage.js
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import UtentiTable from "./UtentiTable";
import SediTable from "./SediTable";
import styles from "./UtentiTable.module.css";

const TAB_STORAGE_KEY = "utentiPage:activeTab";

function UtentiPage() {
  const location = useLocation();

  const getInitialTab = () => {
    if (location.state?.activeTab) return location.state.activeTab;

    try {
      const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
      if (saved) return saved;
    } catch {}

    return "utenti";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab); // "utenti" | "archiviati" | "sedi"

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.activeTab && location.state.activeTab !== activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state, activeTab]);

  return (
    <>
      <div className={styles.subnavBar}>
        <div className={styles.subnav}>
          <button
            type="button"
            className={`${styles.subnavLink} ${
              activeTab === "utenti" ? styles.subnavLinkActive : ""
            }`}
            onClick={() => setActiveTab("utenti")}
          >
            Dipendenti
          </button>

          <button
            type="button"
            className={`${styles.subnavLink} ${
              activeTab === "archiviati" ? styles.subnavLinkActive : ""
            }`}
            onClick={() => setActiveTab("archiviati")}
          >
            Archiviati
          </button>

          <button
            type="button"
            className={`${styles.subnavLink} ${
              activeTab === "sedi" ? styles.subnavLinkActive : ""
            }`}
            onClick={() => setActiveTab("sedi")}
          >
            Sedi
          </button>
        </div>
      </div>

      {activeTab === "utenti" && <UtentiTable archived={false} activeTab="utenti" />}
      {activeTab === "archiviati" && <UtentiTable archived activeTab="archiviati" />}
      {activeTab === "sedi" && <SediTable />}
    </>
  );
}

export default UtentiPage;