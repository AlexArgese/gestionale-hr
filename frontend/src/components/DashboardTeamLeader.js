import React, { useEffect, useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { API_BASE } from '../api';
import { useToast } from './ui/Toast';
import { FiDownload, FiRefreshCw } from 'react-icons/fi';
import styles from './DashboardTeamLeader.module.css';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

function fmtDateLabel(dateStr) {
  if (!dateStr) return '';
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)}`;
}

async function getToken() {
  const u = getAuth().currentUser;
  if (!u) throw new Error('Non autenticato');
  return u.getIdToken();
}

export default function DashboardTeamLeader({ me }) {
  const toast = useToast();
  const [presenze, setPresenze] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSede, setSelectedSede] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [exporting, setExporting] = useState(false);

  const tlSedi = me?.team_leader_sedi?.split(',').map(s => s.trim()).filter(Boolean) || [];

  const sedeParam = (prefix = '?') =>
    selectedSede ? `${prefix}sede=${encodeURIComponent(selectedSede)}` : '';

  const loadOggi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/presenze/tl/oggi${sedeParam()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Errore caricamento presenze');
      const data = await res.json();
      setPresenze(data.presenze || []);
      setDate(data.date || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSede]);

  useEffect(() => { loadOggi(); }, [loadOggi]);

  const downloadBlob = async (url, filename) => {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Errore download');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  };

  const downloadOggi = async () => {
    try {
      await downloadBlob(
        `${API_BASE}/presenze/tl/export-oggi${sedeParam()}`,
        `presenze_oggi_${date}${selectedSede ? `_${selectedSede}` : ''}.xlsx`
      );
    } catch (e) {
      toast.error('Errore download: ' + e.message);
    }
  };

  const downloadRange = async () => {
    if (!dateStart || !dateEnd) return toast.error('Seleziona le date');
    if (dateStart > dateEnd) return toast.error('La data inizio deve essere prima della fine');
    setExporting(true);
    try {
      await downloadBlob(
        `${API_BASE}/presenze/tl/export?start=${dateStart}&end=${dateEnd}${sedeParam('&')}`,
        `presenze_${dateStart}_${dateEnd}${selectedSede ? `_${selectedSede}` : ''}.xlsx`
      );
    } catch (e) {
      toast.error('Errore download: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Raggruppa turni per dipendente
  const byEmployee = {};
  presenze.forEach(p => {
    const key = `${p.cognome}_${p.nome}`;
    if (!byEmployee[key]) byEmployee[key] = { nome: p.nome, cognome: p.cognome, turni: [] };
    byEmployee[key].turni.push(p);
  });
  const employees = Object.values(byEmployee).sort((a, b) =>
    a.cognome.localeCompare(b.cognome, 'it')
  );

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Presenze delle tue sedi</h1>
          <p className="page-subtitle">Sedi assegnate: {tlSedi.join(', ') || '—'}</p>
        </div>
      </header>

      {tlSedi.length > 1 && (
        <div className="tabs" role="tablist">
          {['', ...tlSedi].map(sede => (
            <button
              key={sede || '__all__'}
              type="button"
              role="tab"
              aria-selected={selectedSede === sede}
              className="tab"
              onClick={() => setSelectedSede(sede)}
            >
              {sede || 'Tutte le sedi'}
            </button>
          ))}
        </div>
      )}

      <section className={`card ${styles.tableCard}`}>
        <div className="card-head">
          <div>
            <h2 className="card-title">Presenti oggi</h2>
            {date && <p className="card-desc">{fmtDateLabel(date)}</p>}
          </div>
          <div className={styles.cardActions}>
            <button onClick={loadOggi} disabled={loading} className="btn btn-outline btn-sm">
              <FiRefreshCw size={14} /> {loading ? 'Aggiorno…' : 'Aggiorna'}
            </button>
            <button onClick={downloadOggi} className="btn btn-primary btn-sm">
              <FiDownload size={14} /> Scarica Excel
            </button>
          </div>
        </div>

        {error && <div className={styles.alertWrap}><div className="alert alert-danger">{error}</div></div>}

        {loading ? (
          <div className="empty-state">Caricamento…</div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-title">Nessuna presenza registrata oggi</span>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dipendente</th>
                  <th>Entrata</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, i) =>
                  emp.turni.map((t, j) => (
                    <tr key={`${i}-${j}`}>
                      {j === 0 && (
                        <td rowSpan={emp.turni.length} className={`cell-strong ${styles.empName}`}>
                          {emp.cognome} {emp.nome}
                          {emp.turni.length > 1 && (
                            <span className={styles.shiftsCount}>{emp.turni.length} turni</span>
                          )}
                        </td>
                      )}
                      <td className="tabular">{fmtTime(t.ora_entrata)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Esporta presenze per periodo</h2>
            <p className="card-desc">Scarica in Excel le timbrature delle tue sedi.</p>
          </div>
        </div>
        <div className="card-body">
          <div className={styles.exportRow}>
            <label className="field">
              <span className="field-label">Dal</span>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="input" />
            </label>
            <label className="field">
              <span className="field-label">Al</span>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="input" />
            </label>
          </div>
        </div>
        <div className="card-foot">
          <button
            onClick={downloadRange}
            disabled={exporting || !dateStart || !dateEnd}
            className="btn btn-primary"
          >
            <FiDownload size={15} /> {exporting ? 'Esportazione…' : 'Scarica Excel'}
          </button>
        </div>
      </section>
    </div>
  );
}
