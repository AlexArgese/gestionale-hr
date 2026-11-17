import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiTrash2, FiEdit2, FiSave, FiX } from "react-icons/fi";
import styles from "./DettaglioComunicazione.module.css";
import { API_BASE, getIdToken, downloadWithAuth } from "../api";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

const API = API_BASE;

async function fetchOrThrow(input, init = {}) {
  const token = await getIdToken();
  const headers = { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(input, { ...init, headers });
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
  const toast = useToast();
  const confirm = useConfirm();

  const id = Number(rawId);
  const idValido = Number.isInteger(id) && id > 0;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("info"); // info | destinatari | letti | non_letti | likes | comments

  const [editing, setEditing] = useState(false);
  const [editTitolo, setEditTitolo] = useState("");
  const [editContenuto, setEditContenuto] = useState("");
  const [editNotify, setEditNotify] = useState("none"); // "both" | "push" | "none"
  const [saving, setSaving] = useState(false);

  const loadAdminDetail = useCallback(async () => {
    if (!idValido) return;
    setLoading(true);
    try {
      const res = await fetchOrThrow(`${API}/comunicazioni/${id}/admin`, { credentials: "include" });
      const j = await res.json();
      setData(j);
    } catch (e) {
      toast.error(e.message || "Errore caricamento comunicazione");
      navigate("/comunicazioni");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, idValido, navigate]);

  useEffect(() => {
    if (!idValido) {
      toast.error("Comunicazione non trovata (ID non valido).");
      navigate("/comunicazioni");
      return;
    }
    loadAdminDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId, idValido, navigate, loadAdminDetail]);

  // l'anteprima (img/iframe) non può portare l'header Authorization via src,
  // quindi scarichiamo il file col token e lo mostriamo da un blob: URL
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const comunicazioneData = data?.comunicazione;
  const hasAttachmentForPreview =
    !!(Array.isArray(data?.attachments) && data.attachments.length) || !!comunicazioneData?.allegato_url;

  useEffect(() => {
    if (!hasAttachmentForPreview) { setPreviewBlobUrl(null); return; }
    let revoked = false;
    let objectUrl = null;
    (async () => {
      try {
        const res = await fetchOrThrow(`${API}/comunicazioni/${id}/view`);
        const blob = await res.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewBlobUrl(objectUrl);
      } catch {
        setPreviewBlobUrl(null);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasAttachmentForPreview]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Eliminare la comunicazione?",
      message: "L'azione è irreversibile: la comunicazione e le relative letture/firme verranno eliminate.",
      danger: true,
      confirmLabel: "Elimina",
    });
    if (!ok) return;
    try {
      await fetchOrThrow(`${API}/comunicazioni/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Comunicazione eliminata");
      navigate("/comunicazioni");
    } catch (e) {
      toast.error(e?.message || "Errore eliminazione");
    }
  };

  const startEditing = () => {
    setEditTitolo(data?.comunicazione?.titolo || "");
    setEditContenuto(data?.comunicazione?.contenuto || "");
    setEditNotify("none");
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const handleSaveEdit = async () => {
    const titolo = editTitolo.trim();
    const contenuto = editContenuto.trim();
    if (!titolo || !contenuto) {
      toast.error("Titolo e contenuto sono obbligatori");
      return;
    }
    setSaving(true);
    try {
      const res = await fetchOrThrow(`${API}/comunicazioni/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ titolo, contenuto, notify: editNotify }),
      });
      const updated = await res.json();
      setData((prev) => ({ ...prev, comunicazione: { ...prev.comunicazione, ...updated } }));
      setEditing(false);
      toast.success("Modifiche salvate");
    } catch (e) {
      toast.error(e?.message || "Errore modifica comunicazione");
    } finally {
      setSaving(false);
    }
  };

  if (!idValido) return null;
  if (loading || !data) {
    return (
      <div className="page">
        <header className="page-header">
          <div className="page-header-text">
            <button type="button" className="page-eyebrow" onClick={() => navigate("/comunicazioni")}>
              <FiArrowLeft size={14} /> Comunicazioni
            </button>
            <h1 className="page-title">Comunicazione</h1>
          </div>
        </header>
        <div className="empty-state">Caricamento…</div>
      </div>
    );
  }

  const comm = data.comunicazione;
  const pubDate = comm.data_pubblicazione
    ? new Date(comm.data_pubblicazione).toLocaleString("it-IT", {
        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
  // 🔥 prima prova nuovi allegati (tabella comunicazione_attachments)
  const firstAttachment =
    Array.isArray(data.attachments) && data.attachments.length
      ? data.attachments[0]
      : null;

  // fallback legacy
  const hasAttachment = !!firstAttachment || !!comm.allegato_url;

  const fileName = (firstAttachment?.file_url || comm.allegato_url || "").toLowerCase();
  const isPdf = fileName.endsWith(".pdf") || (firstAttachment?.mime_type === "application/pdf");

  const fmtDataOra = (v) => (v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const totDest = data.destinatari.length;
  const percLetti = totDest ? Math.round((data.letti.length / totDest) * 100) : 0;

  const TABS = [
    ["info", "Messaggio", null],
    ["letti", "Letti", data.letti.length],
    ["non_letti", "Non letti", data.non_letti.length],
    ["likes", "Mi piace", data.likes.length],
    ["comments", "Commenti", data.comments.length],
    ["destinatari", "Destinatari", totDest],
  ];

  const PersoneTable = ({ rows, conData }) => (
    rows.length === 0 ? (
      <div className="empty-state">Nessuno in questo elenco.</div>
    ) : (
      <div className={styles.tableScroll}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Dipendente</th>
              <th>Email</th>
              {conData && <th>Letto il</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => (
              <tr key={`${u.id ?? u.utente_id}-${i}`}>
                <td className="cell-strong">{u.nome} {u.cognome}</td>
                <td className={styles.muted}>{u.email}</td>
                {conData && <td className="tabular">{fmtDataOra(u.data_lettura)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate("/comunicazioni")}>
            <FiArrowLeft size={14} /> Comunicazioni
          </button>
          <h1 className="page-title">{comm.titolo || "Comunicazione"}</h1>
          {pubDate && <p className="page-subtitle">Pubblicata il {pubDate}</p>}
        </div>
        {!editing && (
          <div className="page-actions">
            {hasAttachment && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => downloadWithAuth(`${API}/comunicazioni/${id}/download`, "allegato").catch((err) => toast.error(err.message))}
              >
                <FiDownload size={15} /> Allegato
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={startEditing}>
              <FiEdit2 size={15} /> Modifica
            </button>
            {canDelete && (
              <button type="button" className="btn btn-danger-outline" onClick={handleDelete}>
                <FiTrash2 size={15} /> Elimina
              </button>
            )}
          </div>
        )}
      </header>

      {/* Numeri */}
      <div className={styles.stats}>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Destinatari</span>
          <span className={styles.statValue}>{totDest}</span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Letta da</span>
          <span className={styles.statValue}>{data.letti.length}<span className={styles.statSub}>{percLetti}%</span></span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Mi piace</span>
          <span className={styles.statValue}>{data.likes.length}</span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Commenti</span>
          <span className={styles.statValue}>{data.comments.length}</span>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="tab"
            onClick={() => setTab(k)}
          >
            {label}{n !== null && <span className={styles.tabCount}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <section className="card">
          {editing ? (
            <>
              <div className={`card-body ${styles.editForm}`}>
                <label className="field" htmlFor="editTitolo">
                  <span className="field-label">Titolo</span>
                  <input
                    id="editTitolo"
                    type="text"
                    className="input"
                    value={editTitolo}
                    onChange={(e) => setEditTitolo(e.target.value)}
                  />
                </label>
                <label className="field" htmlFor="editContenuto">
                  <span className="field-label">Testo</span>
                  <textarea
                    id="editContenuto"
                    className="textarea"
                    rows={8}
                    value={editContenuto}
                    onChange={(e) => setEditContenuto(e.target.value)}
                  />
                </label>
                <div className="field">
                  <span className="field-label">Dopo il salvataggio</span>
                  <div className={styles.notifyOptions}>
                    {[
                      ["both", "Invia una nuova email e una notifica"],
                      ["push", "Invia solo la notifica nell’app"],
                      ["none", "Non avvisare: aggiorna solo il testo"],
                    ].map(([v, label]) => (
                      <label key={v} className={styles.notifyOption}>
                        <input
                          type="radio"
                          name="editNotify"
                          value={v}
                          checked={editNotify === v}
                          onChange={() => setEditNotify(v)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card-foot">
                <button type="button" className="btn btn-outline" onClick={cancelEditing} disabled={saving}>
                  <FiX size={15} /> Annulla
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                  <FiSave size={15} /> {saving ? "Salvataggio…" : "Salva modifiche"}
                </button>
              </div>
            </>
          ) : (
            <div className="card-body">
              <div className={styles.content}>{comm.contenuto || ""}</div>

              {hasAttachment && (
                <div className={styles.attachWrap}>
                  <p className={styles.attachTitle}>Allegato</p>
                  <div className={styles.attachBox}>
                    {!previewBlobUrl ? (
                      <div className="empty-state">Caricamento anteprima…</div>
                    ) : isPdf ? (
                      <iframe title="allegato" src={previewBlobUrl} className={styles.pdfFrame} />
                    ) : (
                      <img alt="allegato" src={previewBlobUrl} className={styles.imgPreview} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "destinatari" && <section className="card"><PersoneTable rows={data.destinatari} /></section>}
      {tab === "letti" && <section className="card"><PersoneTable rows={data.letti} conData /></section>}
      {tab === "non_letti" && <section className="card"><PersoneTable rows={data.non_letti} /></section>}
      {tab === "likes" && <section className="card"><PersoneTable rows={data.likes} /></section>}

      {tab === "comments" && (
        <section className="card">
          {data.comments.length === 0 ? (
            <div className="empty-state">Nessun commento.</div>
          ) : (
            <ul className={styles.commentsList}>
              {data.comments.map((c) => (
                <li key={c.id} className={styles.commentItem}>
                  <div className={styles.commentAvatar} aria-hidden="true">
                    {(c.nome?.[0] || "").toUpperCase()}{(c.cognome?.[0] || "").toUpperCase()}
                  </div>
                  <div className={styles.commentMain}>
                    <div className={styles.commentMeta}>
                      <span className={styles.commentAuthor}>{c.nome} {c.cognome}</span>
                      <span>{fmtDataOra(c.created_at)}</span>
                    </div>
                    <div className={styles.commentBody}>{c.contenuto}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
