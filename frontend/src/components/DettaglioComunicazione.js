import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiDownload,
  FiMessageSquare,
  FiTrash2,
  FiUsers,
  FiEye,
  FiEyeOff,
  FiHeart,
} from "react-icons/fi";
import styles from "./DettaglioComunicazione.module.css";

const API = "http://localhost:3001";

async function fetchOrThrow(input, init) {
  const res = await fetch(input, init);
  if (!res.ok) {
    const urlTxt = typeof input === "string" ? input : input?.toString?.() || "";
    let msg = `HTTP ${res.status} @ ${urlTxt}`;
    try {
      const j = await res.json();
      if (j?.error) msg += ` — ${j.error}`;
    } catch {}
    throw new Error(msg);
  }
  return res;
}

export default function DettaglioComunicazione({ canDelete = true }) {
  const { id: rawId } = useParams();
  const navigate = useNavigate();

  const id = Number(rawId);
  const idValido = Number.isInteger(id) && id > 0;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("info"); // info | destinatari | letti | non_letti | likes | comments

  const loadAdminDetail = useCallback(async () => {
    if (!idValido) return;
    setLoading(true);
    try {
      const res = await fetchOrThrow(`${API}/comunicazioni/${id}/admin`, { credentials: "include" });
      const j = await res.json();
      setData(j);
    } catch (e) {
      alert(e.message || "Errore caricamento comunicazione");
      navigate("/comunicazioni");
    } finally {
      setLoading(false);
    }
  }, [id, idValido, navigate]);

  useEffect(() => {
    if (!idValido) {
      alert("Comunicazione non trovata (ID non valido).");
      navigate("/comunicazioni");
      return;
    }
    loadAdminDetail();
  }, [rawId, idValido, navigate, loadAdminDetail]);

  const handleDelete = async () => {
    const ok = window.confirm("Eliminare questa comunicazione?");
    if (!ok) return;
    try {
      await fetchOrThrow(`${API}/comunicazioni/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      alert("Comunicazione eliminata");
      navigate("/comunicazioni");
    } catch (e) {
      alert(e?.message || "Errore eliminazione");
    }
  };

  if (!idValido) return null;
  if (loading || !data) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Comunicazione</h2>
          <button
            type="button"
            className={`btn btn-outline ${styles.backBtn}`}
            onClick={() => navigate("/comunicazioni")}
          >
            <FiArrowLeft /> Indietro
          </button>
        </div>
        <div className={styles.underline} />
        <p>Caricamento…</p>
      </div>
    );
  }

  const comm = data.comunicazione;
  const pubDate = comm.data_pubblicazione
    ? new Date(comm.data_pubblicazione).toLocaleString()
    : "";
  const hasAttachment = !!comm.allegato_url;
  const attachUrl = hasAttachment ? `${API}/comunicazioni/${id}/download` : null;
  const fileName = (comm.allegato_url || "").toLowerCase();
  const isPdf = fileName.endsWith(".pdf");

  return (
    <div className={styles.container}>
      {/* Header: titolo a sx + back a dx */}
      <div className={styles.header}>
        <h2 className={styles.title}>{comm.titolo || "Comunicazione"}</h2>
        <button
          type="button"
          className={`btn btn-outline ${styles.backBtn}`}
          onClick={() => navigate("/comunicazioni")}
        >
          <FiArrowLeft /> Indietro
        </button>
      </div>
      <div className={styles.underline} />

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={tab === "info" ? styles.tabActive : styles.tab} onClick={() => setTab("info")}>
          Info
        </button>
        <button className={tab === "destinatari" ? styles.tabActive : styles.tab} onClick={() => setTab("destinatari")}>
          <FiUsers /> Destinatari ({data.destinatari.length})
        </button>
        <button className={tab === "letti" ? styles.tabActive : styles.tab} onClick={() => setTab("letti")}>
          <FiEye /> Letti ({data.letti.length})
        </button>
        <button className={tab === "non_letti" ? styles.tabActive : styles.tab} onClick={() => setTab("non_letti")}>
          <FiEyeOff /> Non letti ({data.non_letti.length})
        </button>
        <button className={tab === "likes" ? styles.tabActive : styles.tab} onClick={() => setTab("likes")}>
          <FiHeart /> Like ({data.likes.length})
        </button>
        <button className={tab === "comments" ? styles.tabActive : styles.tab} onClick={() => setTab("comments")}>
          <FiMessageSquare /> Commenti ({data.comments.length})
        </button>
      </div>

      {/* Contenuti tab */}
      {tab === "info" && (
        <div className={styles.card}>
          <div className={styles.metaRow}>
            <span className={styles.metaBadge}>{pubDate}</span>
            <span className={styles.metaBadge}>
              <FiMessageSquare /> {data.comments.length}
            </span>
            <span className={styles.metaBadge}>
              <FiHeart /> {data.likes.length}
            </span>
          </div>

          <div className={styles.content}>{comm.contenuto || ""}</div>

          {/* Allegato */}
          {hasAttachment && (
            <div className={styles.attachWrap}>
              <div className={styles.attachTitle}>Allegato</div>
              <div className={styles.attachBox}>
                {isPdf ? (
                  <iframe title="allegato" src={attachUrl} />
                ) : (
                  <img alt="allegato" src={attachUrl} />
                )}
              </div>
              <div className={styles.actions} style={{ marginTop: 12 }}>
                <a className={styles.btnPrimary} href={attachUrl}>
                  <FiDownload /> Scarica allegato
                </a>
              </div>
            </div>
          )}

          {/* Azioni admin */}
          <div className={styles.actions}>
            {canDelete && (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleDelete}
                title="Elimina comunicazione"
              >
                <FiTrash2 /> Elimina
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "destinatari" && (
        <div className={styles.card}>
          <h3>Destinatari</h3>
          <ul className={styles.destList}>
            {data.destinatari.map((u) => (
              <li key={u.id} className={styles.destItem}>
                {u.nome} {u.cognome} — {u.email}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "letti" && (
        <div className={styles.card}>
          <h3>Letti</h3>
          <ul className={styles.destList}>
            {data.letti.map((u) => (
              <li key={u.utente_id} className={styles.destItem}>
                {u.nome} {u.cognome} — {u.email} • {new Date(u.data_lettura).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "non_letti" && (
        <div className={styles.card}>
          <h3>Non letti</h3>
          <ul className={styles.destList}>
            {data.non_letti.map((u) => (
              <li key={u.id} className={styles.destItem}>
                {u.nome} {u.cognome} — {u.email}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "likes" && (
        <div className={styles.card}>
          <h3>Like</h3>
          <ul className={styles.destList}>
            {data.likes.map((u, i) => (
              <li key={`${u.utente_id}-${i}`} className={styles.destItem}>
                {u.nome} {u.cognome} — {u.email}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "comments" && (
        <div className={styles.card}>
          <h3>Commenti</h3>
          <ul className={styles.commentsList}>
            {data.comments.map((c) => (
              <li key={c.id} className={styles.commentItem}>
                <div className={styles.commentMeta}>
                  {c.nome} {c.cognome} • {new Date(c.created_at).toLocaleString()}
                </div>
                <div className={styles.commentBody}>{c.contenuto}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
