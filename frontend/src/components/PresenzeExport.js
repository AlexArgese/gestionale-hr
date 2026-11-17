import React, { useEffect, useState, useMemo } from 'react';
import Select from 'react-select';
import { FiDownload } from 'react-icons/fi';
import styles from './PresenzeExport.module.css';
import { API_BASE, getIdToken, downloadWithAuth } from "../api";
import { useToast } from './ui/Toast';

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const NOMI_MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

// Il libro paga si prepara a mese chiuso: di default il mese precedente.
function mesePrecedente() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
}

// downloadWithAuth riporta "HTTP 404 {"error":"…"}": mostra solo il messaggio.
function messaggioErrore(e) {
  const testo = (e && e.message) || '';
  const json = /\{.*\}\s*$/.exec(testo);
  if (json) {
    try {
      const dati = JSON.parse(json[0]);
      if (dati && dati.error) return dati.error;
    } catch {}
  }
  return testo || 'Errore durante il download';
}

function PresenzeExport() {
  const toast = useToast();
  // Stato date + filtro "solo presenti"
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [soloPresenti, setSoloPresenti] = useState(false);
  const [dettagli, setDettagli] = useState(false);

  // Opzioni select
  const [sedeOptions, setSedeOptions] = useState([]);

  // Valori selezionati
  const [selectedSedi, setSelectedSedi] = useState([]);
  const [societaOptions, setSocietaOptions] = useState([]);
  const [selectedSocieta, setSelectedSocieta] = useState([]);

  // Libro paga: mese da scaricare
  const [libroPeriodo, setLibroPeriodo] = useState(mesePrecedente);
  const [libroInCorso, setLibroInCorso] = useState(false);
  const [libroSocieta, setLibroSocieta] = useState([]);
  const [libroSedi, setLibroSedi] = useState([]);
  const anniLibro = useMemo(() => {
    const corrente = new Date().getFullYear();
    return [corrente, corrente - 1, corrente - 2, corrente - 3];
  }, []);

  useEffect(() => {
    authHeaders().then((headers) => fetch(`${API}/societa`, { headers }))
      .then((r) => r.json())
      .then((data) => {
        setSocietaOptions(data.map((s) => ({
          label: s.ragione_sociale,
          value: s.ragione_sociale,
        })));
      })
      .catch(() => {});

    // Carico sedi dalla tabella sedi
    authHeaders().then((headers) => fetch(`${API}/sedi`, { headers }))
      .then((r) => r.json())
      .then((data) => {
        const sedi = data
          .map((s) => {
            const nomeSede = s.nome || s.sede || s.label || '';
            return nomeSede
              ? { label: nomeSede, value: nomeSede }
              : null;
          })
          .filter(Boolean);

        setSedeOptions(sedi);
      })
      .catch(() => {
        // eventualmente gestisci errore
      });
  }, []);

  // Derivati per UI
  const hasRange = !!(startDate && endDate);

  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return 'Nessun intervallo';
    if (startDate && !endDate) return `Dal ${startDate}`;
    if (!startDate && endDate) return `Fino al ${endDate}`;
    return `${startDate} → ${endDate}`;
  }, [startDate, endDate]);

  const canDownload = hasRange;

  // Download Excel
  const handleDownload = async () => {
    if (!hasRange) {
      toast.error('Seleziona entrambe le date');
      return;
    }

    const params = new URLSearchParams();
    params.append('start', startDate);
    params.append('end', endDate);

    if (soloPresenti) params.append('solo_presenti', '1');
    if (dettagli) params.append('dettagli', '1');

    // Multi-sede cumulativo
    selectedSedi.forEach((s) => {
      params.append('sede', s.value);
    });
    selectedSocieta.forEach((s) => {
      params.append('societa', s.value);
    });

    try {
      await downloadWithAuth(`${API}/presenze/export?${params.toString()}`, 'presenze.xlsx');
    } catch (e) {
      toast.error(e.message || 'Errore durante il download');
    }
  };

  // Download libro paga del mese (base precompilata dalle timbrature)
  const handleDownloadLibroPaga = async () => {
    const mese = `${libroPeriodo.anno}-${String(libroPeriodo.mese).padStart(2, '0')}`;

    const params = new URLSearchParams();
    params.append('mese', mese);

    libroSedi.forEach((s) => {
      params.append('sede', s.value);
    });
    libroSocieta.forEach((s) => {
      params.append('societa', s.value);
    });

    setLibroInCorso(true);
    try {
      await downloadWithAuth(
        `${API}/presenze/libro-paga?${params.toString()}`,
        `libro_paga_${mese}.xlsx`
      );
    } catch (e) {
      toast.error(messaggioErrore(e));
    } finally {
      setLibroInCorso(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Presenze</h1>
          <p className="page-subtitle">Esporta le timbrature e prepara la base del libro paga.</p>
        </div>
      </header>

      {/* ===== Esportazione ===== */}
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Esporta presenze</h2>
            <p className="card-desc">Scegli il periodo e, se serve, filtra per società e sede.</p>
          </div>
          <span className="badge">{rangeLabel}</span>
        </div>

        <div className="card-body">
          <div className={styles.filtersGrid}>
            <label className="field">
              <span className="field-label">Dal</span>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Al</span>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <div className="field">
              <span className="field-label">Società</span>
              <Select
                classNamePrefix="rs"
                options={societaOptions}
                value={selectedSocieta}
                onChange={setSelectedSocieta}
                isMulti
                isClearable
                isSearchable
                closeMenuOnSelect={false}
                placeholder="Tutte le società"
              />
            </div>
            <div className="field">
              <span className="field-label">Sedi</span>
              <Select
                classNamePrefix="rs"
                options={sedeOptions}
                value={selectedSedi}
                onChange={setSelectedSedi}
                isMulti
                isClearable
                isSearchable
                closeMenuOnSelect={false}
                placeholder="Tutte le sedi"
              />
            </div>
          </div>

          <div className={styles.options}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={soloPresenti}
                onChange={(e) => setSoloPresenti(e.target.checked)}
              />
              Solo dipendenti presenti nel periodo
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={dettagli}
                onChange={(e) => setDettagli(e.target.checked)}
              />
              Aggiungi il dettaglio giorno per giorno
            </label>
          </div>
        </div>

        <div className="card-foot">
          <button className="btn btn-primary" onClick={handleDownload} disabled={!canDownload}>
            <FiDownload size={15} /> Scarica Excel
          </button>
        </div>
      </section>

      {/* ===== Libro paga ===== */}
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Libro paga</h2>
            <p className="card-desc">
              Base precompilata del mese: calendario, festività e giorni lavorati dalle timbrature.
            </p>
          </div>
        </div>
        <div className="card-body">
          <div className={styles.filtersGrid}>
            <label className="field" htmlFor="libro-paga-mese">
              <span className="field-label">Mese</span>
              <select
                id="libro-paga-mese"
                className="select"
                value={libroPeriodo.mese}
                onChange={(e) =>
                  setLibroPeriodo((p) => ({ ...p, mese: Number(e.target.value) }))
                }
              >
                {NOMI_MESI.map((nome, i) => (
                  <option key={nome} value={i + 1}>{nome}</option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="libro-paga-anno">
              <span className="field-label">Anno</span>
              <select
                id="libro-paga-anno"
                className="select"
                value={libroPeriodo.anno}
                onChange={(e) =>
                  setLibroPeriodo((p) => ({ ...p, anno: Number(e.target.value) }))
                }
              >
                {anniLibro.map((anno) => (
                  <option key={anno} value={anno}>{anno}</option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Società</span>
              <Select
                classNamePrefix="rs"
                options={societaOptions}
                value={libroSocieta}
                onChange={setLibroSocieta}
                isMulti
                isClearable
                isSearchable
                closeMenuOnSelect={false}
                placeholder="Tutte le società"
              />
            </div>
            <div className="field">
              <span className="field-label">Sedi</span>
              <Select
                classNamePrefix="rs"
                options={sedeOptions}
                value={libroSedi}
                onChange={setLibroSedi}
                isMulti
                isClearable
                isSearchable
                closeMenuOnSelect={false}
                placeholder="Tutte le sedi"
              />
            </div>
          </div>
        </div>
        <div className="card-foot">
          <button
            className="btn btn-primary"
            onClick={handleDownloadLibroPaga}
            disabled={libroInCorso}
          >
            <FiDownload size={15} />
            {libroInCorso ? 'Preparazione…' : 'Scarica libro paga'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default PresenzeExport;