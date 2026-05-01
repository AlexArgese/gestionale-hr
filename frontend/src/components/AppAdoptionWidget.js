import React, { useEffect, useRef, useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { API_BASE } from '../api';
import { FaMobileAlt, FaApple, FaAndroid, FaTimes, FaPaperPlane } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import styles from './AppAdoptionWidget.module.css';

const API = API_BASE;
const PLATFORM_COLORS = { ios: '#6A57D3', android: '#D0933C' };

function PlatformBadge({ platforms }) {
  const list = (platforms || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
  return (
    <span className={styles.badgeGroup}>
      {list.map(p => (
        <span key={p} className={styles.platformBadge} data-platform={p}>
          {p === 'ios' ? <FaApple /> : <FaAndroid />}
          {p === 'ios' ? ' iOS' : ' Android'}
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
    Promise.all([
      fetch(`${API}/dashboard/app/con-app`).then(r => r.json()),
      fetch(`${API}/dashboard/app/senza-app`).then(r => r.json()),
    ])
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
    const ok = window.confirm(
      `Inviare email promemoria a ${count} dipendent${count === 1 ? 'e' : 'i'} selezionat${count === 1 ? 'o' : 'i'}?\n\nVerrà inviata un'email con il link per scaricare l'app ClockEasy.`
    );
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch(`${API}/dashboard/app/invia-promemoria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utente_ids: ids }),
      });
      const data = await res.json();
      const msg = data.errori?.length > 0
        ? `✅ Email inviate: ${data.inviati}\n⚠️ Errori: ${data.errori.length}`
        : `✅ Email inviate con successo a ${data.inviati} dipendent${data.inviati === 1 ? 'e' : 'i'}!`;
      alert(msg);
      setSelectedIds(new Set());
    } catch (e) {
      alert('Errore durante l\'invio. Riprova.');
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const emptyChart = [{ name: 'Nessuno', value: 1, color: '#E5E7EB' }];
  const displayChart = chartData.length > 0 ? chartData : emptyChart;

  return (
    <>
      {/* ── Compact Widget Card ── */}
      <div
        className={styles.widget}
        onClick={() => setOverlayOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOverlayOpen(true)}
      >
        <div className={styles.widgetHeader}>
          <h3 className={styles.widgetTitle}>
            <FaMobileAlt /> Adozione App Mobile
          </h3>
          <div className={styles.widgetHeaderRight}>
            <span className={styles.activeOnlyBadge}>Solo dipendenti attivi</span>
            <span className={styles.widgetHint}>Clicca per dettagli →</span>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>Caricamento…</div>
        ) : (
          <div className={styles.widgetBody}>
            <div className={styles.chartWrap}>
              <PieChart width={150} height={150}>
                <Pie
                  data={displayChart}
                  cx={70} cy={70}
                  innerRadius={45} outerRadius={65}
                  paddingAngle={chartData.length > 1 ? 3 : 0}
                  dataKey="value"
                  startAngle={90} endAngle={-270}
                  isAnimationActive={false}
                >
                  {displayChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' utenti', n]} />
              </PieChart>
              <div className={styles.chartCenter}>
                <span className={styles.chartCenterNum}>{conApp.length}</span>
                <span className={styles.chartCenterLabel}>utenti</span>
              </div>
            </div>

            <div className={styles.widgetStats}>
              <div className={styles.statLine}>
                <span className={styles.statBig}>{conApp.length}</span>
                <span className={styles.statOf}>/ {total} dipendenti</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.statPct}>{pct}% ha installato l'app</div>
              <div className={styles.platformSummary}>
                {chartData.map(d => (
                  <span key={d.name} className={styles.platformChip} style={{ background: d.color }}>
                    {d.name === 'iOS' ? <FaApple /> : <FaAndroid />} {d.name}: {d.value}
                  </span>
                ))}
                {senzaApp.length > 0 && (
                  <span className={styles.platformChipMissing}>Mancanti: {senzaApp.length}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Overlay Modal ── */}
      {overlayOpen && (
        <div
          className={styles.overlay}
          onClick={e => { if (e.target === e.currentTarget) setOverlayOpen(false); }}
        >
          <div className={styles.modal}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}><FaMobileAlt /> Adozione App Mobile</h2>
              <button className={styles.closeBtn} onClick={() => setOverlayOpen(false)}>
                <FaTimes />
              </button>
            </div>

            {/* Summary */}
            <div className={styles.modalSummary}>
              <span className={styles.summaryItem} style={{ color: '#6A57D3' }}>
                <strong>{conApp.length}</strong> con l'app
              </span>
              <span className={styles.summarySep}>·</span>
              <span className={styles.summaryItem} style={{ color: '#D0933C' }}>
                <strong>{senzaApp.length}</strong> senza app
              </span>
              <span className={styles.summarySep}>·</span>
              <span className={styles.summaryItem}><strong>{pct}%</strong> adozione</span>
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'con' ? styles.tabActive : ''}`}
                onClick={() => handleTabChange('con')}
              >
                Con l'app ({conApp.length})
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'senza' ? styles.tabActive : ''}`}
                onClick={() => handleTabChange('senza')}
              >
                Senza app ({senzaApp.length})
              </button>
            </div>

            {/* Search */}
            <div className={styles.searchWrap}>
              <FiSearch className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Cerca dipendente o sede…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {/* Tab content */}
            <div className={styles.modalBody}>
              {activeTab === 'con' ? (
                filteredCon.length === 0 ? (
                  <p className={styles.empty}>Nessun risultato</p>
                ) : (
                  <table className={styles.table}>
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
                          <td className={styles.nameCell}>{u.nome} {u.cognome}</td>
                          <td className={styles.sedeCell}>{u.sede || '—'}</td>
                          <td><PlatformBadge platforms={u.piattaforme} /></td>
                          <td className={styles.dateCell}>{formatDate(u.prima_registrazione_app)}</td>
                          <td className={styles.dateCell}>{formatDate(u.ultimo_utilizzo_app)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                filteredSenza.length === 0 ? (
                  <p className={styles.empty}>
                    {senzaApp.length === 0 ? 'Tutti i dipendenti hanno installato l\'app! 🎉' : 'Nessun risultato'}
                  </p>
                ) : (
                  <>
                    {/* Seleziona tutti */}
                    <div className={styles.selectAllRow}>
                      <label className={styles.selectAllLabel}>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className={styles.checkbox}
                          onChange={toggleAll}
                        />
                        Seleziona tutti ({filteredSenza.length})
                      </label>
                    </div>

                    {/* Lista */}
                    <div className={styles.senzaList}>
                      {filteredSenza.map(u => (
                        <label key={u.id} className={styles.senzaItem}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={selectedIds.has(u.id)}
                            onChange={() => toggleOne(u.id)}
                          />
                          <div className={styles.senzaAvatar}>
                            {(u.nome?.[0] || '').toUpperCase()}{(u.cognome?.[0] || '').toUpperCase()}
                          </div>
                          <div className={styles.senzaInfo}>
                            <div className={styles.senzaName}>{u.nome} {u.cognome}</div>
                            <div className={styles.senzaMeta}>{u.sede || '—'} · {u.email}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )
              )}
            </div>

            {/* Action bar — appare solo con selezione attiva */}
            {activeTab === 'senza' && selectedIds.size > 0 && (
              <div className={styles.actionBar}>
                <span className={styles.actionCount}>
                  {selectedIds.size} dipendent{selectedIds.size === 1 ? 'e' : 'i'} selezionat{selectedIds.size === 1 ? 'o' : 'i'}
                </span>
                <button
                  className={styles.sendBtn}
                  onClick={handleSendReminder}
                  disabled={sending}
                >
                  <FaPaperPlane />
                  {sending ? 'Invio in corso…' : 'Invia email promemoria'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
