// frontend/src/components/UtentiPage.js
import React, { useState } from "react";
import UtentiTable from "./UtentiTable";
import SediTable from "./SediTable";
import styles from "./UtentiTable.module.css";

function UtentiPage() {
  const [activeTab, setActiveTab] = useState("utenti"); // "utenti" | "archiviati" | "sedi"

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

      {activeTab === "utenti" && <UtentiTable archived={false} />}
      {activeTab === "archiviati" && <UtentiTable archived />}
      {activeTab === "sedi" && <SediTable />}
    </>
  );
}

export default UtentiPage;