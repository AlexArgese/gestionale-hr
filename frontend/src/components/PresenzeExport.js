import React, { useEffect, useState, useMemo } from 'react';
import Select from 'react-select';
import {
  FiDownload,
  FiCalendar,
  FiUsers,
  FiMapPin,
  FiFileText,
  FiSave,
} from 'react-icons/fi';
import styles from './PresenzeExport.module.css';
import { API_BASE } from "../api";

const API = API_BASE;

function PresenzeExport() {
  // Stato date + filtro "solo presenti"
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [soloPresenti, setSoloPresenti] = useState(false);

  // Opzioni select
  const [sedeOptions, setSedeOptions] = useState([]);
  const [utentiOptions, setUtentiOptions] = useState([]);

  // Valori selezionati
  const [selectedSedi, setSelectedSedi] = useState([]);
  const [selectedUtenti, setSelectedUtenti] = useState([]);
  const [nota, setNota] = useState('');

  useEffect(() => {
    // Carico utenti per sezione note
    fetch(`${API}/utenti`)
      .then((r) => r.json())
      .then((data) => {
        const utenti = data.map((u) => ({
          label: `${u.nome} ${u.cognome}`,
          value: u.id,
        }));

        setUtentiOptions(utenti);
      })
      .catch(() => {
        // eventualmente gestisci errore
      });

    // Carico sedi dalla tabella sedi
    fetch(`${API}/sedi`)
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
  const canSaveNote =
    hasRange && selectedUtenti.length > 0 && nota.trim().length > 0;

  // Download Excel
  const handleDownload = () => {
    if (!hasRange) {
      alert('Seleziona entrambe le date');
      return;
    }

    const params = new URLSearchParams();
    params.append('start', startDate);
    params.append('end', endDate);

    if (soloPresenti) params.append('solo_presenti', '1');

    // Multi-sede cumulativo
    selectedSedi.forEach((s) => {
      params.append('sede', s.value);
    });

    window.open(
      `${API}/presenze/export?${params.toString()}`,
      '_blank'
    );
  };

  // Salvataggio nota
  const handleSaveNote = () => {
    if (!canSaveNote) {
      alert('Compila tutti i campi per salvare una nota');
      return;
    }

    const payload = {
      utenti: selectedUtenti.map((u) => u.value),
      start: startDate,
      end: endDate,
      nota: nota.trim(),
    };

    const conferma = window.confirm(
      `Confermi il salvataggio della nota per ${
        selectedUtenti.length
      } dipendente/i nel periodo ${rangeLabel}?`
    );

    if (!conferma) return;

    fetch(`${API}/presenze/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          alert('Nota salvata correttamente');
          setNota('');
          setSelectedUtenti([]);
        } else {
          alert('Errore: ' + (data.error || 'salvataggio nota fallito'));
        }
      })
      .catch(() => {
        alert('Errore di comunicazione con il server');
      });
  };

  const Icon = ({ Cmp, className }) =>
    Cmp ? <Cmp className={className} /> : null;

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Icon Cmp={FiDownload} className={styles.titleIcon} />
          Gestione Presenze
        </h2>
      </div>

      {/* TOOLBAR SUPERIORE: intervallo + solo presenti */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <div className={styles.group}>
            <label className={styles.label}>
              <Icon Cmp={FiCalendar} className={styles.labelIcon} />
              Data inizio
            </label>
            <div className={styles.inputIcon}>
              <Icon Cmp={FiCalendar} className={styles.icon} />
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>
              <Icon Cmp={FiCalendar} className={styles.labelIcon} />
              Data fine
            </label>
            <div className={styles.inputIcon}>
              <Icon Cmp={FiCalendar} className={styles.icon} />
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.inline}>
              <input
                type="checkbox"
                checked={soloPresenti}
                onChange={(e) => setSoloPresenti(e.target.checked)}
              />
              <span className={styles.help}>Mostra solo i presenti</span>
            </label>
          </div>
        </div>

        <div className={styles.toolbarRange}>
          <span className={styles.rangeLabelTitle}>Intervallo attivo:</span>
          <span className={styles.rangeBadge}>{rangeLabel}</span>
        </div>
      </div>

      <div className={styles.underline} />

      {/* LAYOUT A DUE CARD */}
      <div className={styles.layout}>
        {/* CARD EXPORT */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <h3 className={styles.sectionTitle}>
                <Icon Cmp={FiDownload} className={styles.sectionIcon} />
                Esporta presenze
              </h3>
              <span className={styles.rangeBadgeSmall}>{rangeLabel}</span>
            </div>
          </div>

          <div className={styles.cardBody}>
            <div className={styles.group}>
              <label className={styles.label}>
                <Icon Cmp={FiMapPin} className={styles.labelIcon} />
                Sedi
              </label>
              <div className={styles.selectWrap}>
                <Select
                  classNamePrefix="presenze-select"
                  options={sedeOptions}
                  value={selectedSedi}
                  onChange={setSelectedSedi}
                  isMulti
                  isClearable
                  isSearchable
                  closeMenuOnSelect={false}
                  placeholder="Seleziona una o più sedi"
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                onClick={handleDownload}
                disabled={!canDownload}
              >
                <Icon Cmp={FiDownload} />
                Scarica Excel
              </button>
            </div>
          </div>
        </div>

        {/* CARD NOTE */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleWrap}>
              <h3 className={styles.sectionTitle}>
                <Icon Cmp={FiFileText} className={styles.sectionIcon} />
                Note presenze
              </h3>
              <span className={styles.rangeBadgeSmall}>{rangeLabel}</span>
            </div>
          </div>

          <div className={styles.cardBody}>
            <div className={styles.group}>
              <label className={styles.label}>
                <Icon Cmp={FiUsers} className={styles.labelIcon} />
                Dipendenti
              </label>
              <div className={styles.selectWrap}>
                <Select
                  classNamePrefix="presenze-select"
                  options={utentiOptions}
                  value={selectedUtenti}
                  onChange={setSelectedUtenti}
                  isMulti
                  isSearchable
                  placeholder="Seleziona uno o più dipendenti"
                />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>
                <Icon Cmp={FiFileText} className={styles.labelIcon} />
                Nota
              </label>
              <textarea
                className="textarea"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows="3"
                placeholder="Scrivi una nota collegata all'intervallo attivo..."
              />
            </div>

            <div className={styles.actions}>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveNote}
                disabled={!canSaveNote}
              >
                <Icon Cmp={FiSave} />
                Salva nota
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PresenzeExport;