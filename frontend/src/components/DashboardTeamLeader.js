import React, { useEffect, useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { API_BASE } from '../api';

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
      alert('Errore download: ' + e.message);
    }
  };

  const downloadRange = async () => {
    if (!dateStart || !dateEnd) return alert('Seleziona le date');
    if (dateStart > dateEnd) return alert('La data inizio deve essere prima della fine');
    setExporting(true);
    try {
      await downloadBlob(
        `${API_BASE}/presenze/tl/export?start=${dateStart}&end=${dateEnd}${sedeParam('&')}`,
        `presenze_${dateStart}_${dateEnd}${selectedSede ? `_${selectedSede}` : ''}.xlsx`
      );
    } catch (e) {
      alert('Errore download: ' + e.message);
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

  const card = { background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20, marginBottom: 24 };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>
          Dashboard Team Leader
        </h1>
        <p style={{ color: '#6B7280', margin: 0, fontSize: 14 }}>
          Sedi assegnate: <strong>{tlSedi.join(', ') || '—'}</strong>
        </p>
      </div>

      {/* Filtro sede — solo se TL ha più di una sede */}
      {tlSedi.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {['', ...tlSedi].map(sede => {
            const active = selectedSede === sede;
            return (
              <button
                key={sede || '__all__'}
                onClick={() => setSelectedSede(sede)}
                style={{
                  padding: '6px 18px',
                  borderRadius: 20,
                  border: active ? 'none' : '1px solid #D1D5DB',
                  background: active ? '#D0933C' : '#fff',
                  color: active ? '#fff' : '#374151',
                  fontWeight: active ? 700 : 400,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {sede || 'Tutte le sedi'}
              </button>
            );
          })}
        </div>
      )}

      {/* Presenze oggi */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Presenze di oggi{date ? ` — ${fmtDateLabel(date)}` : ''}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={loadOggi}
              disabled={loading}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}
            >
              {loading ? 'Aggiorno…' : 'Aggiorna'}
            </button>
            <button
              onClick={downloadOggi}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#D0933C', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Scarica Excel
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
            Caricamento…
          </div>
        ) : employees.length === 0 ? (
          <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '32px 0', fontSize: 14 }}>
            Nessuna presenza registrata oggi
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                {['Dipendente', 'Entrata', 'Uscita', 'Stato'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6B7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) =>
                emp.turni.map((t, j) => (
                  <tr key={`${i}-${j}`} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {j === 0 && (
                      <td rowSpan={emp.turni.length} style={{ padding: '10px 12px', fontWeight: 500, verticalAlign: 'top' }}>
                        {emp.cognome} {emp.nome}
                        {emp.turni.length > 1 && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#9CA3AF' }}>({emp.turni.length} turni)</span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{fmtTime(t.ora_entrata)}</td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>{fmtTime(t.ora_uscita)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {t.ora_uscita ? (
                        <span style={{ background: '#F3F4F6', color: '#6B7280', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>Uscito</span>
                      ) : (
                        <span style={{ background: '#ECFDF5', color: '#065F46', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>Presente</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Export per periodo */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>Esporta presenze per periodo</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dal</label>
            <input
              type="date"
              value={dateStart}
              onChange={e => setDateStart(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Al</label>
            <input
              type="date"
              value={dateEnd}
              onChange={e => setDateEnd(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, outline: 'none' }}
            />
          </div>
          <button
            onClick={downloadRange}
            disabled={exporting || !dateStart || !dateEnd}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: (exporting || !dateStart || !dateEnd) ? '#E5E7EB' : '#D0933C',
              color: (exporting || !dateStart || !dateEnd) ? '#9CA3AF' : '#fff',
              cursor: (exporting || !dateStart || !dateEnd) ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {exporting ? 'Esportando…' : 'Scarica Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
