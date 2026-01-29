// frontend/src/components/UtentiPage.js
import React, { useState } from "react";
import UtentiTable from "./UtentiTable";
import SediTable from "./SediTable";
import styles from "./UtentiTable.module.css";

function UtentiPage() {
  const [activeTab, setActiveTab] = useState("utenti"); // "utenti" | "sedi"

  return (
    <>
      {/* SOTTO-MENU STILE NAVBAR */}
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
              activeTab === "sedi" ? styles.subnavLinkActive : ""
            }`}
            onClick={() => setActiveTab("sedi")}
          >
            Sedi
          </button>
        </div>
      </div>

      {/* CONTENUTO TAB */}
      {activeTab === "utenti" && <UtentiTable />}
      {activeTab === "sedi" && <SediTable />}
    </>
  );
}

export default UtentiPage;
