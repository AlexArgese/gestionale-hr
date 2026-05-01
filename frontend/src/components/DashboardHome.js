import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import styles from './DashboardHome.module.css';
import { API_BASE } from "../api";

import { FiUsers, FiAlertCircle } from 'react-icons/fi';
import { BsBriefcase } from 'react-icons/bs';
import AppAdoptionWidget from './AppAdoptionWidget';

const API = API_BASE;

function DashboardHome() {
  const navigate = useNavigate();
  const [dipendentiStato, setDipendentiStato] = useState([]);
  const [distribuzione, setDistribuzione] = useState([]);
  const [storico, setStorico] = useState([]);
  const [avvisi, setAvvisi] = useState([]);

  useEffect(() => {
    fetch(`${API}/dashboard/dipendenti/stato`)
      .then(res => res.ok ? res.json() : res.text().then(t => { throw new Error(t) }))
      .then(data => Array.isArray(data) ? setDipendentiStato(data) : setDipendentiStato([]))
      .catch(err => console.error('Dipendenti stato:', err.message));

    fetch(`${API}/dashboard/distribuzione/societa`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setDistribuzione(data) : setDistribuzione([]))
      .catch(err => console.error('Distribuzione:', err.message));

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
      })
      .catch(err => console.error('Storico:', err.message));

    fetch(`${API}/dashboard/avvisi/documenti`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setAvvisi(data) : setAvvisi([]))
      .catch(err => console.error('Avvisi:', err.message));
  }, []);

  const COLORS = ['#D0933C', '#6A57D3', '#82ca9d', '#ff8042'];

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>Dashboard HR</h1>
        <div className={styles.dashboardUnderline} />
      </div>

      <div className={styles.grafici}>
        {/* GRAFICO DIPENDENTI TOTALI / ATTIVI */}
        <div className={styles.grafico}>
          <h3 className={styles.sectionTitle}>
            <FiUsers /> Dipendenti totali e attivi
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dipendentiStato}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="totale" fill="#6A57D3" name="Dipendenti" />
            </BarChart>
          </ResponsiveContainer>
        </div>

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
        <div className={styles.grafico}>
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

      {/* APP ADOPTION */}
      <AppAdoptionWidget />

      {/* AVVISI */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <FiAlertCircle /> Documenti in attesa di firma
        </h3>

        {avvisi.length === 0 ? (
          <p className={styles.muted}>Nessun documento in attesa di firma</p>
        ) : (
          <ul className={styles.list}>
            {avvisi.map((a, i) => (
              <li key={i} className={styles.listItem}>
                <div>
                  <b
                    className={styles.linkStrong}
                    onClick={() => navigate(`/utenti/${a.utente_id}`)}
                  >
                    {a.nome} {a.cognome}
                  </b>
                  {' — '}
                  <span>{a.nome_file}</span>
                  {' — '}
                  <span>{a.tipo_documento}</span>
                  {' '}
                  <span className={styles.badgeWarning}>In attesa di firma</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DashboardHome;