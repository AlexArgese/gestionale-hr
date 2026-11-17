import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiPlus, FiSearch, FiChevronRight } from "react-icons/fi";
import styles from "./ComunicazioniPage.module.css";
import { API_BASE, getIdToken } from "../api";
import { useToast } from "./ui/Toast";

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function ComunicazioniPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    authHeaders({ Accept: "application/json, text/plain, */*" })
      .then((headers) => fetch(`${API_BASE}/comunicazioni`, { headers }))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} @ /comunicazioni`);
        return r.json();
      })
      .then((data) => setItems(Array.isArray(data) ? data : (data?.items || [])))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [toast]);

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
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Comunicazioni</h1>
          <p className="page-subtitle">Avvisi e messaggi inviati ai dipendenti tramite l’app.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/comunicazioni/nuova`)}
          >
            <FiPlus size={16} /> Nuova comunicazione
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={`search ${styles.searchBox}`}>
          <FiSearch size={15} />
          <input
            className="input"
            placeholder="Cerca per titolo o testo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <section className={`card ${styles.listCard}`}>
        {loading ? (
          <div className="empty-state">Caricamento…</div>
        ) : filtered.length ? (
          <ul className={styles.list}>
            {filtered.map((c) => (
              <li key={c.id}>
                <Link to={`/comunicazioni/${c.id}`} className={styles.item}>
                  <span className={styles.itemMain}>
                    <span className={styles.itemTitle}>{c.titolo || "Senza titolo"}</span>
                    <span className={styles.itemExcerpt}>{c.contenuto || ""}</span>
                  </span>
                  <span className={styles.date}>
                    {c.data_pubblicazione
                      ? new Date(c.data_pubblicazione).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
                      : ""}
                  </span>
                  <FiChevronRight className={styles.chev} size={16} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <span className="empty-state-title">
              {q ? "Nessun risultato" : "Nessuna comunicazione"}
            </span>
            <span>{q ? "Prova con un’altra ricerca." : "Le comunicazioni inviate compariranno qui."}</span>
          </div>
        )}
      </section>
    </div>
  );
}
