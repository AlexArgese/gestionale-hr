import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebase';
import './WbManager.css';

import {
  IoShieldCheckmarkOutline,
  IoSearch,
  IoAlertCircleOutline,
  IoChatbubbleEllipsesOutline,
  IoDocumentAttachOutline,
  IoPaperPlaneOutline,
  IoDownloadOutline,
  IoRefreshOutline,
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

  const [detail, setDetail] = useState(null); // { report, messages }
  const [attachments, setAttachments] = useState([]);
  const [msgBody, setMsgBody] = useState('');
  const [statusDraft, setStatusDraft] = useState('');

  const [search, setSearch] = useState('');
  const [protocolQuery, setProtocolQuery] = useState('');
  const fileRef = useRef(null);

  const apiFetch = async (path, options = {}) => {
    const token = await getToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.error || j.detail || ''; } catch {}
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
      setAttachments(j.attachments || []);
    } catch (e) {
      setErr('Errore allegati: ' + e.message);
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    loadAttachments(selectedId);
  }, [selectedId]);

  const onFindByProtocol = async (e) => {
    e.preventDefault();
    if (!protocolQuery.trim()) return;
    setErr('');
    try {
      const j = await apiFetch(`/wb/manager/reports/by-protocol/${encodeURIComponent(protocolQuery.trim())}`);
      if (j?.id) {
        setReports((prev) => (prev.some((r) => r.id === j.id) ? prev : [j, ...prev]));
        setSelectedId(j.id);
      } else {
        setErr('Protocollo non trovato');
      }
    } catch (e) {
      setErr('Protocollo non trovato: ' + e.message);
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
    } catch (e) {
      setErr('Errore invio messaggio: ' + e.message);
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
    } catch (e) {
      setErr('Errore aggiornamento stato: ' + e.message);
    }
  };

  const onUpload = async (e) => {
    e.preventDefault();
    if (!selectedId || !fileRef.current?.files?.length) return;
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current.files[0]);
      await apiFetch(`/wb/manager/reports/${selectedId}/attachments`, { method: 'POST', body: fd });
      fileRef.current.value = '';
      await loadAttachments(selectedId);
    } catch (e) {
      setErr('Errore upload allegato: ' + e.message);
    }
  };

  const onDownload = async (attId, filename = 'allegato') => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/wb/manager/attachments/${attId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr('Errore download: ' + e.message);
    }
  };

  const onRescan = async (attId) => {
    try {
      await apiFetch(`/wb/manager/attachments/${attId}/rescan`, { method: 'POST' });
      await loadAttachments(selectedId);
    } catch (e) {
      setErr('Errore rescan: ' + e.message);
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
  // Messaggi del thread con "descrizione iniziale" come prima bolla se il thread è vuoto
const chatMessages = useMemo(() => {
  if (!detail) return [];
  const msgs = Array.isArray(detail.messages) ? [...detail.messages] : [];
  const desc = (detail.report?.description || '').trim();

  // Se non ci sono messaggi e c'è una descrizione, inseriscila come prima bolla del segnalante
  if (desc && msgs.length === 0) {
    msgs.unshift({
      sender: 'reporter',
      created_at: detail.report?.created_at,
      body: desc,
      _synthetic: true, // flag interno per UI
    });
  }
  return msgs;
}, [detail]);


  return (
    <div className="wb">
      <div className="wb-inner">

        {/* TOP BAR */}
        <div className="wb-topbar">
          <div>
            <h1 className="wb-title">
              <span className="ico accent" aria-hidden><IoShieldCheckmarkOutline size={22} /></span>{" "}
              Pannello Whistleblowing (Avvocato)
            </h1>
            <div className="wb-title-underline" />
            <div className="wb-apibase">apiBase: {apiBase}</div>
          </div>

          <form onSubmit={onFindByProtocol} className="row-line">
            <div className="input-icon">
              <span className="ico"><IoSearch size={18} /></span>
              <input
                className="input"
                placeholder="Cerca per protocollo (es. WB-2025-123456)"
                value={protocolQuery}
                onChange={(e) => setProtocolQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit">Cerca</button>
          </form>
        </div>

        {err && (
          <div className="alert"><IoAlertCircleOutline size={18} /> {err}</div>
        )}

        {/* MAIN GRID */}
        <div className="wb-main">
          {/* ===== LISTA ===== */}
          <aside>
            <section className="card">
              <div className="card-head">
                <b>Segnalazioni</b>
                <div className="input-icon">
                  <span className="ico"><IoSearch size={16} /></span>
                  <input
                    className="input"
                    placeholder="Filtra per testo/stato…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="card-body">
                {loading ? (
                  <div className="small">Caricamento…</div>
                ) : filtered.length === 0 ? (
                  <div className="small">Nessuna segnalazione.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Protocollo</th>
                          <th>Titolo</th>
                          <th>Stato</th>
                          <th>Creata</th>
                          <th>Ultimo agg.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => setSelectedId(r.id)}
                            className={`row ${selectedId === r.id ? 'active' : ''}`}
                          >
                            <td className="mono">{r.protocol_code}</td>
                            <td>{r.title}</td>
                            <td>
                              <span className={`badge ${badgeClass(r.status)}`}>{r.status}</span>
                            </td>
                            <td>{fmt(r.created_at)}</td>
                            <td>{fmt(r.last_update)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </aside>

          {/* ===== DETTAGLIO ===== */}
          <section>
            {!selectedId ? (
              <section className="card">
                <div className="card-body">
                  <div className="row-line">
                    <span className="ico accent"><IoShieldCheckmarkOutline size={20} /></span>
                    <b>Seleziona una segnalazione per vedere i dettagli.</b>
                  </div>
                </div>
              </section>
            ) : !detail ? (
              <section className="card"><div className="card-body">Carico dettagli…</div></section>
            ) : (
              <>
                {/* RIEPILOGO */}
                <section className="card">
                  <div className="card-head">
                    <div>
                      <div className="small mono">{detail.report.protocol_code}</div>
                      <div className="h2">{detail.report.title}</div>
                    </div>
                    <form className="row-line" onSubmit={onUpdateStatus}>
                      <select className="select" value={statusDraft} onChange={(e)=>setStatusDraft(e.target.value)}>
                        {STATI.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="btn btn-primary" type="submit">
                        <IoShieldCheckmarkOutline size={18} /> Aggiorna stato
                      </button>
                    </form>
                  </div>

                  <div className="card-body">
                    <div className="grid-2">
                      <div className="kv">
                        <b>Stato:</b>
                        <span className={`badge ${badgeClass(detail.report.status)}`}>{detail.report.status}</span>
                      </div>
                      <div className="kv"><b>Anonima:</b> {detail.report.is_anonymous ? 'Sì' : 'No'}</div>
                      {!detail.report.is_anonymous && detail.report.reporter && (
                        <div className="kv">
                          <b>Segnalante:</b> {detail.report.reporter.full_name || '—'} — {detail.report.reporter.email || '—'}
                        </div>
                      )}
                      <div className="kv">
                        <b>Creata:</b> {fmt(detail.report.created_at)}
                        <span className="small">•</span>
                        <b>Ultimo agg.:</b> {fmt(detail.report.last_update)}
                      </div>
                      {detail.report.category_id != null && (
                        <div className="kv"><b>Categoria ID:</b> {detail.report.category_id}</div>
                      )}
                    </div>

                    <div className="mt-3">
                      <b>Descrizione</b>
                      <div className="mt-2">{detail.report.description || '(descrizione non disponibile)'}</div>
                    </div>
                  </div>
                </section>

                {/* THREAD */}
                <section className="card">
                  <div className="card-head">
                    <b><IoChatbubbleEllipsesOutline className="ico accent" size={18} /> Thread</b>
                  </div>

                  <div className="thread">
                    {chatMessages.length === 0 && <div className="small">Nessun messaggio.</div>}
                    {chatMessages.map((m, i) => (
                      <div key={i} className={`bubble ${m.sender === 'manager' ? 'me' : 'other'}`}>
                        <div className="meta">
                          {m.sender === 'manager' ? 'Avvocato' : 'Segnalante'} • {fmt(m.created_at)}
                          {m._synthetic ? ' • Segnalazione iniziale' : ''}
                        </div>
                        <div style={{ whiteSpace:'pre-wrap' }}>{m.body}</div>
                      </div>
                    ))}
                  </div>

                  <div className="card-body">
                    <form className="row-line" onSubmit={onSendMessage}>
                      <input
                        className="input" style={{flex:1}}
                        placeholder="Scrivi una risposta al segnalante…"
                        value={msgBody}
                        onChange={(e) => setMsgBody(e.target.value)}
                      />
                      <button className="btn btn-primary" type="submit">
                        <IoPaperPlaneOutline size={18} /> Invia
                      </button>
                    </form>
                  </div>
                </section>


                {/* ALLEGATI */}
                <section className="card">
                  <div className="card-head">
                    <b><IoDocumentAttachOutline className="ico accent" size={18} /> Allegati</b>
                    <form className="row-line" onSubmit={onUpload}>
                      <input ref={fileRef} type="file" />
                      <button className="btn btn-primary" type="submit">
                        <IoDocumentAttachOutline size={18} /> Carica
                      </button>
                    </form>
                  </div>

                  <div className="card-body">
                    {attachments.length === 0 ? (
                      <div className="small">Nessun allegato.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Nome</th>
                              <th>MIME</th>
                              <th>Size</th>
                              <th>AV</th>
                              <th>Creato</th>
                              <th>Azioni</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attachments.map(a => (
                              <tr key={a.id}>
                                <td>{a.filename}</td>
                                <td>{a.mime_type}</td>
                                <td>{a.size_bytes != null ? a.size_bytes : '—'}</td>
                                <td>
                                  <span className={`badge ${avBadge(a.av_status)}`}>{a.av_status || 'pending'}</span>
                                </td>
                                <td>{fmt(a.created_at)}</td>
                                <td className="row-line">
                                  <button type="button" className="btn btn-outline" onClick={() => onDownload(a.id, a.filename || 'allegato')}>
                                    <IoDownloadOutline size={18} /> Scarica
                                  </button>
                                  <button type="button" className="btn btn-outline" onClick={() => onRescan(a.id)}>
                                    <IoRefreshOutline size={18} /> Rescan AV
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </section>
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
