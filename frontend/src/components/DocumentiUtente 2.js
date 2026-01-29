import React, { useEffect, useState } from 'react';
import './DocumentiUtente.css';

/* fallback locale: se il fetch fallisce mostriamo comunque le opzioni */
const TIPI_STATICI = [
  'Carta Identità',
  'Patente',
  'Permesso di soggiorno',
  'Certificato medico',
  'CUD',
  'Contratto',
];

export default function DocumentiUtente({ utenteId }) {
  const [loading, setLoading]         = useState(true);
  const [docsPerTipo, setDocsPerTipo] = useState({});
  const [tipi, setTipi]               = useState(TIPI_STATICI);
  const [tipoSel, setTipoSel]         = useState('');
  const [file, setFile]               = useState(null);

  /* --- lista documenti -------------------------------------------- */
  const caricaDocumenti = async () => {
    setLoading(true);
    const res  = await fetch(`http://localhost:3001/documenti/utente/${utenteId}`);
    const list = await res.json();

    const grouped = {};
    list.forEach(d => {
      if (!grouped[d.tipo_documento]) grouped[d.tipo_documento] = [];
      grouped[d.tipo_documento].push(d);
    });
    setDocsPerTipo(grouped);
    setLoading(false);
  };

  /* --- lista tipi disponibili ------------------------------------- */
  const caricaTipi = async () => {
    try {
      const res   = await fetch('http://localhost:3001/documenti/tipi');
      const array = await res.json(); // sempre una lista
      if (Array.isArray(array) && array.length) setTipi(array);
    } catch {
      /* se il fetch fallisce rimangono i TIPI_STATICI */
    }
  };

  useEffect(() => {
    caricaDocumenti();
    caricaTipi();
  }, [utenteId]);

  /* --- upload ------------------------------------------------------ */
  const handleUpload = async e => {
    e.preventDefault();
    if (!file || !tipoSel) { alert('Seleziona file e tipo'); return; }
  
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo_documento', tipoSel);
      fd.append('utente_id', utenteId);
  
      const res = await fetch('http://localhost:3001/documenti/upload', {
        method: 'POST',
        body: fd,
      });
  
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const json = await res.json(); errMsg = json.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
  
      alert('Documento caricato!');
      document.getElementById('fileInput').value = '';
      setFile(null); setTipoSel('');
      caricaDocumenti();
    } catch (err) {
      console.error('Upload', err);
      alert('Errore upload: ' + err.message);
    }
  };

  /* ------------------------------ UI ------------------------------ */
  if (loading) return <p>Caricamento documenti…</p>;

  return (
    <div className="documenti-container">
      <h3>Documenti</h3>

      {Object.keys(docsPerTipo).length === 0 && <p>Nessun documento.</p>}

      {Object.entries(docsPerTipo).map(([tipo, docs]) => (
        <details key={tipo} open>
          <summary>{tipo} ({docs.length})</summary>
          <ul>
            {docs.map(d => (
              <li key={d.id}>
                <a
                  href={`http://localhost:3001/documenti/${d.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {d.nome_file}
                </a>{' '}
                <small style={{ color: '#666' }}>
                  ({new Date(d.data_upload).toLocaleDateString()})
                </small>
              </li>
            ))}
          </ul>
        </details>
      ))}

      <hr />
      <form className="upload-form" onSubmit={handleUpload}>
        <h4>Carica nuovo documento</h4>
        <label>
          Tipo:&nbsp;
          <select
            value={tipoSel}
            onChange={e => setTipoSel(e.target.value)}
            required
          >
            <option value="">— seleziona —</option>
            {tipi.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          File:&nbsp;
          <input
            id="fileInput"
            type="file"
            onChange={e => setFile(e.target.files[0])}
            required
          />
        </label>
        <button type="submit">Upload</button>
      </form>
    </div>
  );
}
