// src/components/DashboardHome.jsx
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardHome.module.css';
import { API_BASE } from "../api";

const API = API_BASE;

import { FiUsers, FiFileText, FiAlertCircle, FiDownload } from 'react-icons/fi';
import { BsBriefcase } from 'react-icons/bs';

function DashboardHome() {
  const navigate = useNavigate();
  const [metriche, setMetriche] = useState(null);
  const [distribuzione, setDistribuzione] = useState([]);
  const [storico, setStorico] = useState([]);
  const [avvisi, setAvvisi] = useState([]);

  useEffect(() => {
    fetch(`${API}/dashboard/metriche`)
      .then(res => res.ok ? res.json() : res.text().then(t => { throw new Error(t) }))
      .then(setMetriche)
      .catch(err => console.error('Metriche:', err.message));

    fetch(`${API}/dashboard/distribuzione/societa`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setDistribuzione(data) : setDistribuzione([]));

    fetch(`${API}/dashboard/storico/assunzioni`)
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
      });

    fetch(`${API}/dashboard/avvisi/documenti`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setAvvisi(data) : setAvvisi([]));
  }, []);

  const COLORS = ['#D0933C', '#6A57D3', '#82ca9d', '#ff8042'];

  return (
    <div className={styles.dashboardContainer}>
      {/* Header */}
      <div className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>Dashboard HR</h1>
        <div className={styles.dashboardUnderline} />
      </div>

      {/* METRICHE */}
      {metriche && (
        <div className={styles.cardsMetriche}>
          <div className={styles.card}>
            <FiUsers size={20} color="#6A57D3" />
            Dipendenti attivi: <span className={styles.metricValue}>{metriche.dipendentiAttivi}</span>
          </div>
          <div className={styles.card}>
            <BsBriefcase size={20} color="#6A57D3" />
            Contratti mancanti: <span className={styles.metricValue}>{metriche.contrattiMancanti}</span>
          </div>
          <div className={styles.card}>
            <FiFileText size={20} color="#6A57D3" />
            Documenti scaduti: <span className={styles.metricValue}>{metriche.documentiScaduti}</span>
          </div>
          <div className={styles.card}>
            <FiAlertCircle size={20} color="#6A57D3" />
            Profili incompleti: <span className={styles.metricValue}>{metriche.profiliIncompleti}</span>
          </div>
        </div>
      )}
      <div className={styles.grafici}>
        {/* GRAFICO DISTRIBUZIONE SOCIETA */}
        <div className={styles.grafico}>
          <h3 className={styles.sectionTitle}>
            <BsBriefcase /> Dipendenti per Società
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={distribuzione} dataKey="totale" nameKey="societa" label>
                {distribuzione.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* GRAFICO STORICO ASSUNZIONI */}
        <div className={styles.grafico} >
          <h3 className={styles.sectionTitle}>
            <FiUsers /> Assunzioni per mese
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={storico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mese" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="totale" fill="#6A57D3" name="Assunzioni" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* AVVISI */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FiAlertCircle /> Da risolvere
        </h3>
        {avvisi.length === 0 ? (
          <p className={styles.muted}>Nessun problema segnalato</p>
        ) : (
          <ul className={styles.list}>
            {avvisi.map((a, i) => (
              <li key={i} className={styles.listItem}>
                <b
                  className={styles.linkStrong}
                  onClick={() => navigate(`/utenti/${a.id}`)}
                >
                  {a.nome} {a.cognome}
                </b>: {a.problema}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* DOWNLOAD MASSIVO */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FiDownload /> Scarica documenti in blocco
        </h3>
        <div className={styles.downloadSection}>
          <select id="tipo-doc-download" defaultValue="" className={styles.select}>
            <option value="" disabled>Seleziona tipo documento</option>
            <option value="Contratto">Contratto</option>
            <option value="CUD">CUD</option>
          </select>
          <button
            className={styles.button}
            onClick={() => {
              const tipo = document.getElementById('tipo-doc-download').value;
              if (!tipo) return alert('Seleziona un tipo documento');
              window.open(`${API}/dashboard/download-massivo/${tipo}`, '_blank');
            }}
          >
            <FiDownload /> Scarica tutti
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardHome;
