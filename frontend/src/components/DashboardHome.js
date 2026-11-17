import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import styles from './DashboardHome.module.css';
import { API_BASE, getIdToken, downloadWithAuth } from "../api";

import { FiDownload, FiSend, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import AppAdoptionWidget from './AppAdoptionWidget';

const API = API_BASE;

const ACCENT = '#5B4FD6';
const COLORS = ['#5B4FD6', '#A39CEB', '#D0933C', '#98A2B3', '#E4C79A', '#6B62C9'];
const AXIS_TICK = { fontSize: 12, fill: '#667085' };
const TOOLTIP_STYLE = {
  border: '1px solid #E4E7EC', borderRadius: 8, fontSize: 13,
  boxShadow: '0 4px 12px -2px rgba(16,24,40,.08)',
};

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function DashboardHome() {
  const navigate = useNavigate();
  const [dipendentiStato, setDipendentiStato] = useState([]);
  const [distribuzione, setDistribuzione] = useState([]);
  const [storico, setStorico] = useState([]);
  const [avvisi, setAvvisi] = useState([]);
  const [selectedAvvisi, setSelectedAvvisi] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [avvisiPageSize, setAvvisiPageSize] = useState(10);
  const [avvisiPage, setAvvisiPage] = useState(1);

  // Presenze oggi
  const [societaOptions, setSocietaOptions] = useState([]);
  const [sedeOptions, setSedeOptions] = useState([]);
  const [selectedSocietaOggi, setSelectedSocietaOggi] = useState([]);
  const [selectedSediOggi, setSelectedSediOggi] = useState([]);

  useEffect(() => {
    authHeaders().then((headers) => fetch(`${API}/dashboard/dipendenti/stato`, { headers }))
      .then(res => res.ok ? res.json() : res.text().then(t => { throw new Error(t) }))
      .then(data => Array.isArray(data) ? setDipendentiStato(data) : setDipendentiStato([]))
      .catch(err => console.error('Dipendenti stato:', err.message));

    authHeaders().then((headers) => fetch(`${API}/dashboard/distribuzione/societa`, { headers }))
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setDistribuzione(data) : setDistribuzione([]))
      .catch(err => console.error('Distribuzione:', err.message));

    authHeaders().then((headers) => fetch(`${API}/dashboard/storico/assunzioni`, { headers }))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const mesiTradotti = data.map(item => {
            const date = new Date(item.mese + '-01');
            const formatter = new Intl.DateTimeFormat('it-IT', { year: 'numeric', month: 'long' });
            return { ...item, mese: formatter.format(date) };
          });
          setStorico(mesiTradotti);
        } else {
          setStorico([]);
        }
      })
      .catch(err => console.error('Storico:', err.message));

    authHeaders().then((headers) => fetch(`${API}/dashboard/avvisi/documenti`, { headers }))
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setAvvisi(data) : setAvvisi([]))
      .catch(err => console.error('Avvisi:', err.message));

    authHeaders().then((headers) => fetch(`${API}/societa`, { headers }))
      .then(r => r.json())
      .then(data => setSocietaOptions(data.map(s => ({ label: s.ragione_sociale, value: s.ragione_sociale }))))
      .catch(() => {});

    authHeaders().then((headers) => fetch(`${API}/sedi`, { headers }))
      .then(r => r.json())
      .then(data => setSedeOptions(
        data.map(s => { const n = s.nome || s.sede || s.label || ''; return n ? { label: n, value: n } : null; }).filter(Boolean)
      ))
      .catch(() => {});
  }, []);

  const toggleAvviso = (id) => {
    setSelectedAvvisi(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAvvisi.size === avvisi.length) setSelectedAvvisi(new Set());
    else setSelectedAvvisi(new Set(avvisi.map(a => a.id)));
  };

  const avvisiTotalPages = Math.max(Math.ceil(avvisi.length / avvisiPageSize), 1);
  const avvisiPageClamped = Math.min(avvisiPage, avvisiTotalPages);
  const avvisiPaginati = avvisi.slice(
    (avvisiPageClamped - 1) * avvisiPageSize,
    avvisiPageClamped * avvisiPageSize
  );

  const handleAvvisiPageSizeChange = (newSize) => {
    setAvvisiPageSize(newSize);
    setAvvisiPage(1);
  };

  const sendReminders = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${API}/documenti/remind-firma`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ doc_ids: [...selectedAvvisi] }),
      });
      const data = await res.json();
      setSendResult(data);
      setSelectedAvvisi(new Set());
    } catch {
      setSendResult({ error: 'Errore di rete' });
    } finally {
      setSending(false);
    }
  };

  const handleDownloadOggi = async () => {
    const params = new URLSearchParams();
    selectedSocietaOggi.forEach(s => params.append('societa', s.value));
    selectedSediOggi.forEach(s => params.append('sede', s.value));
    try {
      await downloadWithAuth(`${API}/presenze/export-oggi?${params.toString()}`, 'presenze_oggi.xlsx');
    } catch (e) {
      console.error(e);
    }
  };


  // Statistiche derivate dai dati già caricati (nessuna chiamata aggiuntiva)
  const totaleDipendenti = distribuzione.reduce((sum, d) => sum + (Number(d.totale) || 0), 0);
  const societaAttive = distribuzione.length;
  const ultimoMese = storico.length ? storico[storico.length - 1] : null;

  const oggi = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Dashboard</h1>
          <p className={`page-subtitle ${styles.capitalize}`}>{oggi}</p>
        </div>
      </header>

      {/* ===== Numeri chiave ===== */}
      <div className={styles.statGrid}>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Dipendenti attivi</span>
          <span className={styles.statValue}>{totaleDipendenti}</span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Società attive</span>
          <span className={styles.statValue}>{societaAttive}</span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Documenti da firmare</span>
          <span className={styles.statValue}>{avvisi.length}</span>
        </div>
        <div className={`card ${styles.stat}`}>
          <span className={styles.statLabel}>Ultime assunzioni</span>
          <span className={styles.statValue}>{ultimoMese ? ultimoMese.totale : '—'}</span>
          {ultimoMese && <span className={styles.statSub}>{ultimoMese.mese}</span>}
        </div>
      </div>

      <div className={styles.columns}>
        {/* ===== Colonna principale ===== */}
        <section className={`card ${styles.cardFlush}`}>
          <div className="card-head">
            <div>
              <h2 className="card-title">Documenti in attesa di firma</h2>
              <p className="card-desc">Seleziona i dipendenti a cui inviare un promemoria via email.</p>
            </div>
            {avvisi.length > 0 && (
              <button
                className="btn btn-primary btn-sm"
                disabled={selectedAvvisi.size === 0 || sending}
                onClick={sendReminders}
              >
                <FiSend size={14} />
                {sending ? 'Invio…' : `Invia promemoria${selectedAvvisi.size > 0 ? ` (${selectedAvvisi.size})` : ''}`}
              </button>
            )}
          </div>

          {sendResult && (
            <div className={styles.alertWrap}>
              <div className={`alert ${sendResult.error ? 'alert-danger' : 'alert-success'}`}>
                {sendResult.error
                  ? `Errore: ${sendResult.error}`
                  : `Email inviate: ${sendResult.sent}${sendResult.errors?.length ? ` · ${sendResult.errors.length} non consegnate` : ''}`}
              </div>
            </div>
          )}

          {avvisi.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-title">Nessun documento in attesa</span>
              <span>Tutti i documenti inviati risultano firmati.</span>
            </div>
          ) : (
            <>
              <div className={styles.tableScroll}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className={styles.checkCol}>
                        <input
                          type="checkbox"
                          className={styles.check}
                          aria-label="Seleziona tutti"
                          checked={selectedAvvisi.size === avvisi.length}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Dipendente</th>
                      <th>Documento</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avvisiPaginati.map((a, i) => (
                      <tr key={a.id ?? i}>
                        <td className={styles.checkCol}>
                          <input
                            type="checkbox"
                            className={styles.check}
                            aria-label={`Seleziona ${a.nome} ${a.cognome}`}
                            checked={selectedAvvisi.has(a.id)}
                            onChange={() => toggleAvviso(a.id)}
                          />
                        </td>
                        <td>
                          <button
                            className={styles.personLink}
                            onClick={() => navigate(`/utenti/${a.utente_id}`)}
                          >
                            {a.nome} {a.cognome}
                          </button>
                        </td>
                        <td className={styles.fileCell} title={a.nome_file}>{a.nome_file}</td>
                        <td><span className="badge">{a.tipo_documento || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <label className={styles.pageSize}>
                  Righe per pagina
                  <select
                    className="select"
                    value={avvisiPageSize}
                    onChange={e => handleAvvisiPageSizeChange(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
                <div className={styles.pageNav}>
                  <span className={styles.pageInfo}>
                    Pagina {avvisiPageClamped} di {avvisiTotalPages} · {avvisi.length} documenti
                  </span>
                  <button
                    className="btn btn-outline btn-sm btn-icon"
                    onClick={() => setAvvisiPage(p => Math.max(p - 1, 1))}
                    disabled={avvisiPageClamped <= 1}
                    aria-label="Pagina precedente"
                  >
                    <FiChevronLeft size={16} />
                  </button>
                  <button
                    className="btn btn-outline btn-sm btn-icon"
                    onClick={() => setAvvisiPage(p => Math.min(p + 1, avvisiTotalPages))}
                    disabled={avvisiPageClamped >= avvisiTotalPages}
                    aria-label="Pagina successiva"
                  >
                    <FiChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ===== Colonna laterale ===== */}
        <div className={styles.sideCol}>
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Presenze di oggi</h2>
                <p className="card-desc">Esporta le timbrature della giornata in Excel.</p>
              </div>
            </div>
            <div className={`card-body ${styles.oggi}`}>
              <div className="field">
                <span className="field-label">Società</span>
                <Select
                  classNamePrefix="rs"
                  options={societaOptions}
                  value={selectedSocietaOggi}
                  onChange={setSelectedSocietaOggi}
                  isMulti isClearable isSearchable closeMenuOnSelect={false}
                  placeholder="Tutte le società"
                />
              </div>
              <div className="field">
                <span className="field-label">Sedi</span>
                <Select
                  classNamePrefix="rs"
                  options={sedeOptions}
                  value={selectedSediOggi}
                  onChange={setSelectedSediOggi}
                  isMulti isClearable isSearchable closeMenuOnSelect={false}
                  placeholder="Tutte le sedi"
                />
              </div>
              <button className="btn btn-outline" onClick={handleDownloadOggi}>
                <FiDownload size={15} /> Scarica Excel
              </button>
            </div>
          </section>

          <AppAdoptionWidget />
        </div>
      </div>

      {/* ===== Andamento ===== */}
      <div className={styles.charts}>
        <section className="card">
          <div className="card-head"><h2 className="card-title">Dipendenti totali e attivi</h2></div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dipendentiStato} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF0F3" />
                <XAxis dataKey="nome" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#F8F9FB' }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="totale" fill={ACCENT} name="Dipendenti" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2 className="card-title">Dipendenti per società</h2></div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={distribuzione}
                  dataKey="totale"
                  nameKey="societa"
                  innerRadius={56}
                  outerRadius={86}
                  paddingAngle={2}
                  stroke="none"
                >
                  {distribuzione.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <ul className={styles.legend}>
              {distribuzione.map((d, i) => (
                <li key={d.societa ?? i}>
                  <span className={styles.legendDot} style={{ background: COLORS[i % COLORS.length] }} />
                  <span className={styles.legendName}>{d.societa}</span>
                  <span className={styles.legendValue}>{d.totale}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2 className="card-title">Assunzioni per mese</h2></div>
          <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={storico} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF0F3" />
                <XAxis dataKey="mese" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#F8F9FB' }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="totale" fill={ACCENT} name="Assunzioni" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

export default DashboardHome;
