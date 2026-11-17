import React, { useEffect, useRef, useState, useMemo } from 'react';
import { API_BASE, getIdToken } from '../api';

import { FaMobileAlt, FaApple, FaAndroid, FaTimes, FaPaperPlane } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import styles from './AppAdoptionWidget.module.css';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const API = API_BASE;
const PLATFORM_COLORS = { ios: '#6A57D3', android: '#D0933C' };

function PlatformBadge({ platforms }) {
  const list = (platforms || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
  return (
    <span className={styles.badgeGroup}>
      {list.map(p => (
        <span key={p} className="badge">
          {p === 'ios' ? <FaApple /> : <FaAndroid />}
          {p === 'ios' ? 'iOS' : 'Android'}
        </span>
      ))}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AppAdoptionWidget() {
  const toast = useToast();
  const confirm = useConfirm();
  const [conApp, setConApp] = useState([]);
  const [senzaApp, setSenzaApp] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('con');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sending, setSending] = useState(false);
  const selectAllRef = useRef(null);

  useEffect(() => {
    authHeaders().then((headers) => Promise.all([
      fetch(`${API}/dashboard/app/con-app`, { headers }).then(r => r.json()),
      fetch(`${API}/dashboard/app/senza-app`, { headers }).then(r => r.json()),
    ]))
      .then(([con, senza]) => {
        setConApp(Array.isArray(con) ? con : []);
        setSenzaApp(Array.isArray(senza) ? senza : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    const counts = {};
    conApp.forEach(u => {
      (u.piattaforme || '').split(',').forEach(p => {
        const name = p.trim().toLowerCase();
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name === 'ios' ? 'iOS' : 'Android',
      value,
      color: PLATFORM_COLORS[name] || '#82ca9d',
    }));
  }, [conApp]);

  const total = conApp.length + senzaApp.length;
  const pct = total > 0 ? Math.round((conApp.length / total) * 100) : 0;

  const filteredCon = useMemo(() => {
    if (!search) return conApp;
    const q = search.toLowerCase();
    return conApp.filter(u =>
      `${u.nome} ${u.cognome}`.toLowerCase().includes(q) ||
      (u.sede || '').toLowerCase().includes(q)
    );
  }, [conApp, search]);

  const filteredSenza = useMemo(() => {
    if (!search) return senzaApp;
    const q = search.toLowerCase();
    return senzaApp.filter(u =>
      `${u.nome} ${u.cognome}`.toLowerCase().includes(q) ||
      (u.sede || '').toLowerCase().includes(q)
    );
  }, [senzaApp, search]);

  // Sync indeterminate state on select-all checkbox
  useEffect(() => {
    if (!selectAllRef.current) return;
    const allChecked = filteredSenza.length > 0 && filteredSenza.every(u => selectedIds.has(u.id));
    const someChecked = filteredSenza.some(u => selectedIds.has(u.id));
    selectAllRef.current.checked = allChecked;
    selectAllRef.current.indeterminate = someChecked && !allChecked;
  }, [filteredSenza, selectedIds]);

  useEffect(() => {
    if (!overlayOpen) return;
    const handler = e => { if (e.key === 'Escape') setOverlayOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [overlayOpen]);

  const handleTabChange = tab => {
    setActiveTab(tab);
    setSearch('');
    setSelectedIds(new Set());
  };

  const toggleOne = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allChecked = filteredSenza.length > 0 && filteredSenza.every(u => selectedIds.has(u.id));
    if (allChecked) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredSenza.forEach(u => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredSenza.forEach(u => next.add(u.id));
        return next;
      });
    }
  };

  const handleSendReminder = async () => {
    const ids = [...selectedIds];
    const count = ids.length;
    const ok = await confirm({
      title: 'Inviare il promemoria?',
      message: `Inviare email promemoria a ${count} dipendent${count === 1 ? 'e' : 'i'} selezionat${count === 1 ? 'o' : 'i'}? Verrà inviata un'email con il link per scaricare l'app ClockEasy.`,
      confirmLabel: 'Invia',
    });
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch(`${API}/dashboard/app/invia-promemoria`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ utente_ids: ids }),
      });
      const data = await res.json();
      if (data.errori?.length > 0) {
        toast.error(`Email inviate: ${data.inviati}. Errori: ${data.errori.length}`);
      } else {
        toast.success(`Email inviate con successo a ${data.inviati} dipendent${data.inviati === 1 ? 'e' : 'i'}!`);
      }
      setSelectedIds(new Set());
    } catch (e) {
      toast.error('Errore durante l\'invio. Riprova.');
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const piattaforma = (nome) => chartData.find(d => d.name === nome)?.value || 0;

  return (
    <>
      {/* ── Riquadro compatto ── */}
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">App mobile</h2>
            <p className="card-desc">Dipendenti attivi che hanno installato l'app.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Caricamento…</div>
        ) : (
          <div className="card-body">
            <div className={styles.headline}>
              <span className={styles.big}>{pct}%</span>
              <span className={styles.of}>{conApp.length} su {total} dipendenti</span>
            </div>
            <div className={styles.progress} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <dl className={styles.breakdown}>
              <div><dt><FaApple /> iOS</dt><dd>{piattaforma('iOS')}</dd></div>
              <div><dt><FaAndroid /> Android</dt><dd>{piattaforma('Android')}</dd></div>
              <div><dt><FaMobileAlt /> Senza app</dt><dd>{senzaApp.length}</dd></div>
            </dl>
          </div>
        )}
        <div className="card-foot">
          <button className="btn btn-outline btn-sm" onClick={() => setOverlayOpen(true)} disabled={loading}>
            Vedi dettagli
          </button>
        </div>
      </section>

      {/* ── Dettaglio ── */}
      {overlayOpen && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setOverlayOpen(false); }}
        >
          <div className={`modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="adozione-titolo">
            <div className="modal-head">
              <div>
                <h2 id="adozione-titolo" className="modal-title">App mobile</h2>
                <p className="modal-desc">
                  {conApp.length} con l'app · {senzaApp.length} senza app · {pct}% di adozione
                </p>
              </div>
              <button className="modal-close" onClick={() => setOverlayOpen(false)} aria-label="Chiudi">
                <FaTimes />
              </button>
            </div>

            <div className={styles.modalTools}>
              <div className="tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={activeTab === 'con'}
                  className="tab"
                  onClick={() => handleTabChange('con')}
                >
                  Con l'app <span className={styles.tabCount}>{conApp.length}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === 'senza'}
                  className="tab"
                  onClick={() => handleTabChange('senza')}
                >
                  Senza app <span className={styles.tabCount}>{senzaApp.length}</span>
                </button>
              </div>
              <div className="search">
                <FiSearch size={15} />
                <input
                  className="input"
                  placeholder="Cerca dipendente o sede"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className={`modal-body ${styles.modalBody}`}>
              {activeTab === 'con' ? (
                filteredCon.length === 0 ? (
                  <div className="empty-state">Nessun risultato</div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Dipendente</th>
                          <th>Sede</th>
                          <th>Piattaforma</th>
                          <th>Prima registrazione</th>
                          <th>Ultimo utilizzo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCon.map(u => (
                          <tr key={u.id}>
                            <td className="cell-strong">{u.nome} {u.cognome}</td>
                            <td>{u.sede || '—'}</td>
                            <td><PlatformBadge platforms={u.piattaforme} /></td>
                            <td className="tabular">{formatDate(u.prima_registrazione_app)}</td>
                            <td className="tabular">{formatDate(u.ultimo_utilizzo_app)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                filteredSenza.length === 0 ? (
                  <div className="empty-state">
                    {senzaApp.length === 0 ? 'Tutti i dipendenti hanno installato l\'app.' : 'Nessun risultato'}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className={styles.checkCol}>
                            <input
                              ref={selectAllRef}
                              type="checkbox"
                              className={styles.checkbox}
                              onChange={toggleAll}
                              aria-label="Seleziona tutti"
                            />
                          </th>
                          <th>Dipendente</th>
                          <th>Sede</th>
                          <th>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSenza.map(u => (
                          <tr key={u.id} className={styles.clickRow} onClick={() => toggleOne(u.id)}>
                            <td className={styles.checkCol}>
                              <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={selectedIds.has(u.id)}
                                onChange={() => toggleOne(u.id)}
                                onClick={e => e.stopPropagation()}
                                aria-label={`Seleziona ${u.nome} ${u.cognome}`}
                              />
                            </td>
                            <td className="cell-strong">{u.nome} {u.cognome}</td>
                            <td>{u.sede || '—'}</td>
                            <td className="muted">{u.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {activeTab === 'senza' && (
              <div className="modal-foot">
                <span className="muted">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} dipendent${selectedIds.size === 1 ? 'e' : 'i'} selezionat${selectedIds.size === 1 ? 'o' : 'i'}`
                    : 'Seleziona i dipendenti a cui inviare il link dell\'app'}
                </span>
                <button
                  className="btn btn-primary"
                  onClick={handleSendReminder}
                  disabled={sending || selectedIds.size === 0}
                >
                  <FaPaperPlane size={13} />
                  {sending ? 'Invio in corso…' : 'Invia promemoria'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
