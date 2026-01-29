import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebase';
import styles from './WbManager.module.css';

import {
  IoShieldCheckmarkOutline,
  IoSearch,
  IoAlertCircleOutline,
  IoChatbubbleEllipsesOutline,
  IoDocumentAttachOutline,
  IoPaperPlaneOutline,
  IoDownloadOutline,
  IoRefreshOutline,
  IoTrashOutline,
  IoTimeOutline,
  IoPersonCircleOutline,
} from 'react-icons/io5';

const STATI = [
  'submitted',
  'triage',
  'in_review',
  'need_info',
  'closed_substantiated',
  'closed_unsubstantiated',
  'closed_other',
];

async function getToken() {
  const u = auth.currentUser;
  if (!u) throw new Error('Non autenticato');
  return await u.getIdToken();
}

export default function WbManagerPanel({ apiBase }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [rescanning, setRescanning] = useState(new Set());

  const [detail, setDetail] = useState(null); // { report, messages }
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [msgBody, setMsgBody] = useState('');
  const [statusDraft, setStatusDraft] = useState('');

  const [search, setSearch] = useState('');
  const [protocolQuery, setProtocolQuery] = useState('');
  const fileRef = useRef(null);

  const threadEndRef = useRef(null);

  const apiFetch = async (path, options = {}) => {
    const token = await getToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j.error || j.detail || j.message || '';
      } catch {
        try {
          detail = await res.text();
        } catch {}
      }
      throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  const loadList = async () => {
    setErr('');
    try {
      const j = await apiFetch('/wb/manager/reports');
      setReports(j.reports || []);
    } catch (e) {
      setErr('Errore caricamento lista: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (!id) return;
    setErr('');
    try {
      const j = await apiFetch(`/wb/manager/reports/${id}`);
      setDetail(j);
      setStatusDraft(j.report?.status || '');
    } catch (e) {
      setErr('Errore dettaglio: ' + e.message);
    }
  };

  const loadAttachments = async (id) => {
    if (!id) return;
    setErr('');
    try {
      const j = await apiFetch(`/wb/manager/reports/${id}/attachments`);
      const arr = j.attachments || j.data || [];
      setAttachments(Array.isArray(arr) ? arr : []);
    } catch (e) {
      setErr('Errore allegati: ' + e.message);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    loadAttachments(selectedId);
  }, [selectedId]);

  // autoscroll chat quando arrivano messaggi
  useEffect(() => {
    if (!detail) return;
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [detail?.messages?.length, detail?.report?.id]);

  const onFindByProtocol = async (e) => {
    e.preventDefault();
    if (!protocolQuery.trim()) return;
    setErr('');
    try {
      const j = await apiFetch(
        `/wb/manager/reports/by-protocol/${encodeURIComponent(protocolQuery.trim())}`
      );
      if (j?.id) {
        setReports((prev) => (prev.some((r) => r.id === j.id) ? prev : [j, ...prev]));
        setSelectedId(j.id);
      } else {
        setErr('Protocollo non trovato');
      }
    } catch (e2) {
      setErr('Protocollo non trovato: ' + e2.message);
    }
  };

  const onSendMessage = async (e) => {
    e.preventDefault();
    if (!msgBody.trim() || !selectedId) return;
    setErr('');
    try {
      await apiFetch(`/wb/manager/reports/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: msgBody.trim() }),
      });
      setMsgBody('');
      await loadDetail(selectedId);
    } catch (e2) {
      setErr('Errore invio messaggio: ' + e2.message);
    }
  };

  const onUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedId || !statusDraft) return;
    setErr('');
    try {
      await apiFetch(`/wb/manager/reports/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      });
      await loadDetail(selectedId);
      await loadList();
    } catch (e2) {
      setErr('Errore aggiornamento stato: ' + e2.message);
    }
  };

  const onPickFile = (e) => {
    const f = e.target?.files?.[0];
    setSelectedFileName(f ? f.name : '');
  };

  const onUpload = async (e) => {
    e.preventDefault();
    if (!selectedId || !fileRef.current?.files?.length) return;
    setErr('');
    setIsUploading(true);
    try {
      const file = fileRef.current.files[0];
      const fd = new FormData();
      fd.append('file', file, file.name);

      await apiFetch(`/wb/manager/reports/${selectedId}/attachments`, {
        method: 'POST',
        body: fd,
      });

      fileRef.current.value = null;
      setSelectedFileName('');
      await loadAttachments(selectedId);
    } catch (e2) {
      setErr('Errore upload allegato: ' + e2.message);
    } finally {
      setIsUploading(false);
    }
  };

  const onDeleteAttachment = async (attId) => {
    if (!selectedId) return;
    const ok = window.confirm('Sei sicuro di voler eliminare definitivamente questo allegato?');
    if (!ok) return;

    setErr('');
    try {
      await apiFetch(`/wb/manager/attachments/${attId}`, { method: 'DELETE' });
      await loadAttachments(selectedId);
    } catch (e2) {
      setErr('Errore eliminazione: ' + e2.message);
    }
  };

  const onDownload = async (attId, fallbackName = 'allegato') => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/wb/manager/attachments/${attId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let detailTxt = '';
        try {
          detailTxt = await res.text();
        } catch {}
        throw new Error(`HTTP ${res.status} ${detailTxt}`.trim());
      }
      const blob = await res.blob();

      const cd = res.headers.get('Content-Disposition') || res.headers.get('content-disposition') || '';
      let filename = fallbackName;
      const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
      if (m && m[1]) {
        try {
          filename = decodeURIComponent(m[1].replace(/"/g, ''));
        } catch {
          filename = m[1];
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e2) {
      setErr('Errore download: ' + e2.message);
    }
  };

  const onRescan = async (attId) => {
    try {
      setRescanning((prev) => {
        const next = new Set(prev);
        next.add(attId);
        return next;
      });

      const res = await apiFetch(`/wb/manager/attachments/${attId}/rescan`, { method: 'POST' });
      await loadAttachments(selectedId);

      alert(`Rescan completato.\nStato antivirus: ${res.av_status || 'sconosciuto'}`);
    } catch (e2) {
      setErr('Errore rescan: ' + e2.message);
    } finally {
      setRescanning((prev) => {
        const next = new Set(prev);
        next.delete(attId);
        return next;
      });
    }
  };

  const filtered = useMemo(() => {
    const q = (search || '').toLowerCase().trim();
    if (!q) return reports;
    return reports.filter((r) =>
      (r.protocol_code || '').toLowerCase().includes(q) ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q)
    );
  }, [reports, search]);

  // chat messages: se thread vuoto mostra descrizione come prima bolla
  const chatMessages = useMemo(() => {
    if (!detail) return [];
    const msgs = Array.isArray(detail.messages) ? [...detail.messages] : [];
    const desc = (detail.report?.description || '').trim();
    if (desc && msgs.length === 0) {
      msgs.unshift({
        sender: 'reporter',
        created_at: detail.report?.created_at,
        body: desc,
        _synthetic: true,
      });
    }
    return msgs;
  }, [detail]);

  const selectedReport = useMemo(() => {
    if (!selectedId) return null;
    return reports.find((r) => r.id === selectedId) || null;
  }, [reports, selectedId]);

  return (
    <div className={styles.wb}>
      <div className={styles['wb-shell']}>
        {/* HEADER */}
        <header className={styles['wb-header']}>
          <div className={styles['wb-head-left']}>
            <div className={styles['wb-brand']}>
              <span className={styles['wb-brand-ico']} aria-hidden>
                <IoShieldCheckmarkOutline size={20} />
              </span>
              <div>
                <div className={styles['wb-title']}>Pannello Whistleblowing</div>
                <div className={styles['wb-subtitle']}>
                  Gestione segnalazioni • Chat con segnalante • Allegati
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={onFindByProtocol} className={styles['wb-protocol-search']}>
            <div className={styles['input-icon']}>
              <span className={`${styles.ico} ${styles.muted}`}>
                <IoSearch size={16} />
              </span>
              <input
                className={styles.input}
                placeholder="Cerca per protocollo (WB-2025-123456)"
                value={protocolQuery}
                onChange={(e) => setProtocolQuery(e.target.value)}
              />
            </div>
            <button className={`${styles.btn} ${styles['btn-primary']}`} type="submit">
              Cerca
            </button>
          </form>
        </header>

        {err && (
          <div className={styles.alert}>
            <IoAlertCircleOutline size={18} /> {err}
          </div>
        )}

        {/* LAYOUT: SINISTRA LISTA | DESTRA CHAT+ALLEGATI */}
        <div className={styles['wb-grid']}>
          {/* LEFT: LISTA */}
          <aside className={styles['wb-left']}>
            <section className={`${styles.card} ${styles['card-soft']}`}>
              <div className={styles['card-head']}>
                <div className={styles['card-head-title']}>
                  <b>Segnalazioni</b>
                  <span className={styles.pill}>{filtered.length}</span>
                </div>

                <div className={styles['input-icon']} style={{ minWidth: 220 }}>
                  <span className={`${styles.ico} ${styles.muted}`}>
                    <IoSearch size={16} />
                  </span>
                  <input
                    className={styles.input}
                    placeholder="Filtra per testo/stato…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className={`${styles['card-body']} ${styles['card-body-tight']}`}>
                {loading ? (
                  <div className={styles.empty}>
                    <div className={styles['empty-title']}>Caricamento…</div>
                    <div className={styles['empty-sub']}>Sto recuperando le segnalazioni.</div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className={styles.empty}>
                    <div className={styles['empty-title']}>Nessuna segnalazione</div>
                    <div className={styles['empty-sub']}>
                      Prova a cambiare filtro o cerca per protocollo.
                    </div>
                  </div>
                ) : (
                  <div className={styles['report-list']}>
                    {filtered.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={`${styles['report-item']} ${
                          selectedId === r.id ? styles.active : ''
                        }`}
                      >
                        <div className={styles['report-top']}>
                          <div className={`${styles.mono} ${styles['report-proto']}`}>
                            {r.protocol_code}
                          </div>
                          <span className={`${styles.badge} ${styles[badgeClass(r.status)]}`}>
                            {r.status}
                          </span>
                        </div>

                        <div className={styles['report-title']}>{r.title}</div>

                        <div className={styles['report-meta']}>
                          <span className={styles['meta-line']}>
                            <IoTimeOutline size={14} /> {fmt(r.created_at)}
                          </span>
                          <span className={styles['meta-dot']}>•</span>
                          <span className={styles['meta-line']}>Ultimo: {fmt(r.last_update)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles['card-foot']}>
                <div className={styles.small}>
                  Suggerimento: clicca una segnalazione per aprire chat e allegati a destra.
                </div>
              </div>
            </section>
          </aside>

          {/* RIGHT: CHAT + ALLEGATI */}
          <main className={styles['wb-right']}>
            {!selectedId ? (
              <section className={`${styles.card} ${styles['card-soft']}`}>
                <div className={styles['card-body']}>
                  <div className={styles.empty}>
                    <div className={styles['empty-title']}>Seleziona una segnalazione</div>
                    <div className={styles['empty-sub']}>
                      A sinistra trovi tutte le segnalazioni. Selezionane una per aprire il thread e
                      gli allegati.
                    </div>
                  </div>
                </div>
              </section>
            ) : !detail ? (
              <section className={`${styles.card} ${styles['card-soft']}`}>
                <div className={styles['card-body']}>
                  <div className={styles.empty}>
                    <div className={styles['empty-title']}>Carico dettagli…</div>
                    <div className={styles['empty-sub']}>Sto recuperando thread e allegati.</div>
                  </div>
                </div>
              </section>
            ) : (
              <div className={styles['right-stack']}>
                {/* CHAT CARD */}
                <section className={`${styles.card} ${styles['card-soft']} ${styles['chat-card']}`}>
                  {/* sticky header */}
                  <div className={styles['chat-head']}>
                    <div className={styles['chat-head-left']}>
                      <div className={styles['chat-title']}>
                        <IoChatbubbleEllipsesOutline size={18} className={`${styles.ico} ${styles.accent}`} />
                        <div className={styles['chat-title-text']}>
                          <div className={styles['chat-h']}>{detail.report.title}</div>

                          {/* 👇 QUI c’è la patch NON ANONIMO: mostra nome+email */}
                          <div className={styles['chat-sub']}>
                            <span className={styles.mono}>{detail.report.protocol_code}</span>

                            <span className={styles['meta-dot']}>•</span>
                            <span className={styles.small}>Stato:</span>
                            <span className={`${styles.badge} ${styles[badgeClass(detail.report.status)]}`}>
                              {detail.report.status}
                            </span>

                            <span className={styles['meta-dot']}>•</span>

                            {detail.report.is_anonymous ? (
                              <span className={styles.small}>
                                <IoPersonCircleOutline size={14} /> Anonima
                              </span>
                            ) : (
                              <>
                                <span className={styles.small}>
                                  <IoPersonCircleOutline size={14} />{' '}
                                  {detail.report.reporter?.full_name || 'Segnalante'}
                                </span>
                                {detail.report.reporter?.email ? (
                                  <>
                                    <span className={styles['meta-dot']}>•</span>
                                    <span className={styles.small}>{detail.report.reporter.email}</span>
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <form className={styles['chat-head-right']} onSubmit={onUpdateStatus}>
                      <select
                        className={styles.select}
                        value={statusDraft}
                        onChange={(e) => setStatusDraft(e.target.value)}
                        aria-label="Cambia stato"
                      >
                        {STATI.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <button className={`${styles.btn} ${styles['btn-primary']}`} type="submit">
                        <IoShieldCheckmarkOutline size={18} /> Aggiorna
                      </button>
                    </form>
                  </div>

                  {/* body chat */}
                  <div className={styles['chat-body']}>
                    {chatMessages.length === 0 ? (
                      <div className={`${styles.empty} ${styles['empty-in-chat']}`}>
                        <div className={styles['empty-title']}>Nessun messaggio</div>
                        <div className={styles['empty-sub']}>Scrivi per avviare la conversazione.</div>
                      </div>
                    ) : (
                      chatMessages.map((m, i) => (
                        <div
                          key={i}
                          className={`${styles['msg-row']} ${
                            m.sender === 'manager' ? styles.me : styles.other
                          }`}
                        >
                          <div
                            className={`${styles.bubble} ${
                              m.sender === 'manager' ? styles.me : styles.other
                            }`}
                          >
                            <div className={styles['bubble-meta']}>
                              {m.sender === 'manager' ? 'Avvocato' : 'Segnalante'}
                              <span className={styles['meta-dot']}>•</span>
                              {fmt(m.created_at)}
                              {m._synthetic ? (
                                <>
                                  <span className={styles['meta-dot']}>•</span>
                                  Segnalazione iniziale
                                </>
                              ) : null}
                            </div>
                            <div
                              className={styles['bubble-body']}
                              style={{ whiteSpace: 'pre-wrap' }}
                            >
                              {m.body}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={threadEndRef} />
                  </div>

                  {/* composer */}
                  <div className={styles['chat-compose']}>
                    <form className={styles['compose-form']} onSubmit={onSendMessage}>
                      <textarea
                        className={`${styles.input} ${styles['compose-textarea']}`}
                        placeholder="Scrivi una risposta… (Ctrl/Cmd + Enter per inviare)"
                        value={msgBody}
                        onChange={(e) => setMsgBody(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSendMessage(e);
                        }}
                      />
                      <button
                        className={`${styles.btn} ${styles['btn-primary']}`}
                        type="submit"
                        disabled={!msgBody.trim()}
                      >
                        <IoPaperPlaneOutline size={18} /> Invia
                      </button>
                    </form>
                  </div>
                </section>

                {/* ATTACHMENTS CARD */}
                <section className={`${styles.card} ${styles['card-soft']}`}>
                  <div className={styles['card-head']}>
                    <div className={styles['card-head-title']}>
                      <b>
                        <IoDocumentAttachOutline className={`${styles.ico} ${styles.accent}`} size={18} /> Allegati
                      </b>
                      <span className={styles.pill}>{attachments.length}</span>
                    </div>

                    <form className={styles['attach-upload']} onSubmit={onUpload}>
                      <label className={styles['file-pill']} title="Scegli file">
                        <IoDocumentAttachOutline size={16} />
                        <span className={styles['file-pill-text']}>
                          {selectedFileName || 'Scegli file…'}
                        </span>
                        <input ref={fileRef} type="file" onChange={onPickFile} />
                      </label>

                      <button
                        className={`${styles.btn} ${styles['btn-primary']}`}
                        type="submit"
                        disabled={isUploading || !selectedFileName}
                      >
                        <IoDocumentAttachOutline size={18} /> {isUploading ? 'Carico…' : 'Carica'}
                      </button>
                    </form>
                  </div>

                  <div className={styles['card-body']}>
                    {attachments.length === 0 ? (
                      <div className={styles.empty}>
                        <div className={styles['empty-title']}>Nessun allegato</div>
                        <div className={styles['empty-sub']}>
                          Carica un file per condividerlo col segnalante.
                        </div>
                      </div>
                    ) : (
                      <div className={styles['attach-grid']}>
                        {attachments.map((a) => (
                          <div key={a.id} className={styles['attach-item']}>
                            <div className={styles['attach-info']}>
                              <div className={styles['attach-name']} title={a.filename}>
                                {a.filename}
                              </div>
                              <div className={styles['attach-meta']}>
                                <span className={styles.mono}>{a.mime_type || '—'}</span>
                                <span className={styles['meta-dot']}>•</span>
                                <span>{a.size_bytes != null ? formatBytes(a.size_bytes) : '—'}</span>
                                <span className={styles['meta-dot']}>•</span>
                                <span className={`${styles.badge} ${styles[avBadge(a.av_status)]}`}>
                                  {a.av_status || 'pending'}
                                </span>
                              </div>
                              <div className={styles.small}>{fmt(a.created_at)}</div>
                            </div>

                            <div className={styles['attach-actions']}>
                              <button
                                type="button"
                                className={styles['icon-btn']}
                                onClick={() => onDownload(a.id, a.filename || 'allegato')}
                                title="Scarica"
                              >
                                <IoDownloadOutline size={18} />
                              </button>

                              <button
                                type="button"
                                className={styles['icon-btn']}
                                onClick={() => onRescan(a.id)}
                                disabled={rescanning.has(a.id)}
                                aria-busy={rescanning.has(a.id) ? 'true' : 'false'}
                                title={
                                  rescanning.has(a.id)
                                    ? 'Scansione in corso…'
                                    : 'Riesegui scansione antivirus'
                                }
                              >
                                <span
                                  className={rescanning.has(a.id) ? styles.spin : ''}
                                  style={{ display: 'inline-flex' }}
                                >
                                  <IoRefreshOutline size={18} />
                                </span>
                              </button>

                              <button
                                type="button"
                                className={`${styles['icon-btn']} ${styles.danger}`}
                                onClick={() => onDeleteAttachment(a.id)}
                                title="Elimina"
                              >
                                <IoTrashOutline size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ===== Helpers badge → class names coerenti con CSS ===== */
function badgeClass(status) {
  if (!status) return 'neutral';
  if (status.startsWith('closed_')) return 'closed';
  if (status === 'in_review') return 'review';
  if (status === 'need_info') return 'warn';
  if (status === 'triage') return 'triage';
  if (status === 'submitted') return 'submitted';
  return 'neutral';
}
function avBadge(av) {
  if (av === 'clean') return 'ok';
  if (av === 'quarantined') return 'danger';
  return 'pending';
}
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
