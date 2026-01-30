import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiPlus, FiSearch } from "react-icons/fi";
import styles from "./ComunicazioniPage.module.css";
import { API_BASE } from "../api";

const API = API_BASE;

export default function ComunicazioniPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`${API}/comunicazioni`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} @ /comunicazioni`);
        return r.json();
      })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => {
      const t = (c.titolo || "").toLowerCase();
      const body = (c.contenuto || "").toLowerCase();
      return t.includes(s) || body.includes(s);
    });
  }, [items, q]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Comunicazioni</h2>
        <button
          type="button"
          className={styles.btnNuova}
          onClick={() => navigate("/comunicazioni/nuova")}
          title="Nuova comunicazione"
        >
          <FiPlus />&nbsp;Nuova
        </button>
      </div>
      <div className={styles.underline} />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <FiSearch className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="Cerca per titolo o testo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p>Caricamento…</p>
      ) : filtered.length ? (
        <ul className={styles.list}>
          {filtered.map((c) => (
            <li key={c.id} className={styles.item}>
              <div className={styles.itemHead}>
                <Link to={`/comunicazioni/${c.id}`} className={styles.itemTitle}>
                  {c.titolo || "Senza titolo"}
                </Link>
                <span className={styles.date}>
                  {c.data_pubblicazione
                    ? new Date(c.data_pubblicazione).toLocaleDateString()
                    : ""}
                </span>
              </div>

              <p className={styles.content}>
                {c.contenuto || ""}
              </p>

              <div className={styles.itemActions}>
                <Link to={`/comunicazioni/${c.id}`} className={styles.btnOutline}>
                  Apri
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          Nessuna comunicazione {q ? "per questa ricerca" : ""}.
        </div>
      )}
    </div>
  );
}
