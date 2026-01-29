import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtenteNuovo.module.css";
import {
  FiArrowLeft, FiSave, FiUser, FiAtSign, FiCalendar,
  FiMapPin, FiHome, FiPhone, FiHash, FiBriefcase, FiGrid
} from "react-icons/fi";

function UtenteNuovo({
  postUrl = "http://localhost:3001/utenti",
  societaOptions = null,
  sediOptions = null,
  ruoliOptions = null,
  societaUrl = "http://localhost:3001/societa",
  sediUrl = "http://localhost:3001/sedi",
  ruoliUrl = "http://localhost:3001/ruoli",
}) {
  const navigate = useNavigate();

  // opzioni select
  const [societa, setSocieta] = useState(Array.isArray(societaOptions) ? societaOptions : []);
  const [ruoli, setRuoli] = useState(Array.isArray(ruoliOptions) ? ruoliOptions : []);
  const [sedi, setSedi] = useState(Array.isArray(sediOptions) ? sediOptions : []);

  // stato form (chiavi esattamente come nel backend POST /utenti)
  const [form, setForm] = useState({
    // base
    nome: "",
    cognome: "",
    email: "",
    ruolo: "",
    sede: "",
    societa_id: "",
    codice_teamsystem: "",
    stato_attivo: true,
    // anagrafica
    data_nascita: "",
    luogo_nascita: "",
    provincia_nascita: "",
    codice_fiscale: "",
    // residenza
    indirizzo_residenza: "",
    citta_residenza: "",
    provincia_residenza: "",
    cap_residenza: "",
    // contatti
    cellulare: "",
    contatto_emergenza: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [msgError, setMsgError] = useState("");
  const [msgOk, setMsgOk] = useState("");

  // helpers label/value sicuri
  const labelSocieta = (s) => s?.ragione_sociale || s?.nome || s?.denominazione || String(s?.id ?? s ?? "");
  const valueSocieta = (s) => s?.id ?? s;
  const labelSede = (s) => s?.nome || s?.label || String(s ?? "");
  const valueSede = (s) => s?.id ?? s;
  const labelRuolo = (r) => r?.nome || r?.label || String(r ?? "");
  const valueRuolo = (r) => r?.id ?? r;

  // fetch opzioni se non fornite
  useEffect(() => {
    let alive = true;
    async function load(url, setter) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        const ok = res.ok && (res.headers.get("content-type") || "").includes("application/json");
        const data = ok ? await res.json() : [];
        if (alive) setter(Array.isArray(data) ? data : (data?.items || []));
      } catch {/* noop */}
    }
    if (!societaOptions) load(societaUrl, setSocieta);
    if (!sediOptions)    load(sediUrl, setSedi);
    if (!ruoliOptions)   load(ruoliUrl, setRuoli);
    return () => { alive = false; };
  }, [societaOptions, sediOptions, ruoliOptions, societaUrl, sediUrl, ruoliUrl]);

  const onChange = (k) => (e) => {
    const v = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const validEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
  const normalizeDateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgError(""); setMsgOk("");

    // validazioni minime
    if (!form.nome?.trim() || !form.cognome?.trim()) {
      setMsgError("Nome e cognome sono obbligatori.");
      return;
    }
    if (form.email && !validEmail(form.email)) {
      setMsgError("Email non valida.");
      return;
    }

    // normalizzazioni per backend
    const societa_id_norm = /^\d+$/.test(String(form.societa_id))
      ? Number(form.societa_id)
      : form.societa_id;

    const payload = {
      ...form,
      societa_id: societa_id_norm,
      data_nascita: normalizeDateOrNull(form.data_nascita),
    };

    try {
      setSubmitting(true);
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      if (!res.ok) {
        const body = isJson ? await res.json().catch(() => null) : await res.text();
        const msg = isJson ? (body?.message || body?.error || `Errore HTTP ${res.status}`) : `Errore HTTP ${res.status}`;
        throw new Error(msg);
      }

      const saved = isJson ? await res.json() : null;
      setMsgOk(saved?.message || "Utente creato correttamente.");
      if (saved?.id) navigate(`/utenti/${saved.id}`);
      else navigate("/utenti");
    } catch (err) {
      setMsgError(err.message || "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Nuovo utente</h1>
        <div className={styles.headerCta}>
          <button className={`btn btn-outline ${styles.backBtn}`} onClick={() => navigate(-1)}>
            <FiArrowLeft /> Indietro
          </button>
          <button className={`btn ${styles.btnPrimary}`} onClick={handleSubmit} disabled={submitting}>
            <FiSave /> {submitting ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>

      <div className={styles.underline} />

      {/* Messaggi */}
      {msgError && <div className={styles.error}>{msgError}</div>}
      {msgOk && <div className={styles.success}>{msgOk}</div>}

      {/* Card form */}
      <form className={`card ${styles.card}`} onSubmit={handleSubmit}>
        <div className={styles.grid}>
          {/* === Base === */}
          <div className={styles.group}>
            <label className={styles.label}>Nome</label>
            <div className={styles.inputIcon}>
              <FiUser className={styles.icon} />
              <input className="input" value={form.nome} onChange={onChange("nome")} placeholder="Mario" />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Cognome</label>
            <div className={styles.inputIcon}>
              <FiUser className={styles.icon} />
              <input className="input" value={form.cognome} onChange={onChange("cognome")} placeholder="Rossi" />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Email</label>
            <div className={styles.inputIcon}>
              <FiAtSign className={styles.icon} />
              <input className="input" value={form.email} onChange={onChange("email")} placeholder="mario.rossi@azienda.it" />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Ruolo</label>
            <div className={styles.inputIcon}>
              <FiBriefcase className={styles.icon} />
              <select className="select" value={form.ruolo} onChange={onChange("ruolo")}>
                <option value="">Seleziona ruolo</option>
                {ruoli.map((r) => (
                  <option key={valueRuolo(r)} value={valueRuolo(r)}>{labelRuolo(r)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Sede</label>
            <div className={styles.inputIcon}>
              <FiMapPin className={styles.icon} />
              <select className="select" value={form.sede} onChange={onChange("sede")}>
                <option value="">Seleziona sede</option>
                {sedi.map((s) => (
                  <option key={valueSede(s)} value={valueSede(s)}>{labelSede(s)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Società</label>
            <div className={styles.inputIcon}>
              <FiGrid className={styles.icon} />
              <select className="select" value={form.societa_id} onChange={onChange("societa_id")}>
                <option value="">Seleziona società</option>
                {societa.map((s) => (
                  <option key={valueSocieta(s)} value={valueSocieta(s)}>{labelSocieta(s)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Codice TeamSystem</label>
            <div className={styles.inputIcon}>
              <FiHash className={styles.icon} />
              <input className="input" value={form.codice_teamsystem} onChange={onChange("codice_teamsystem")} placeholder="TS-..." />
            </div>
          </div>

          {/* === Anagrafica === */}
          <div className={styles.group}>
            <label className={styles.label}>Data di nascita</label>
            <div className={styles.inputIcon}>
              <FiCalendar className={styles.icon} />
              <input className="input" type="date" value={form.data_nascita} onChange={onChange("data_nascita")} />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Luogo di nascita</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.luogo_nascita} onChange={onChange("luogo_nascita")} placeholder="Comune" />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Provincia di nascita</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.provincia_nascita} onChange={onChange("provincia_nascita")} placeholder="MI, RM, ..." />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Codice fiscale</label>
            <div className={styles.inputIcon}>
              <FiHash className={styles.icon} />
              <input className="input" value={form.codice_fiscale} onChange={onChange("codice_fiscale")} placeholder="RSSMRA..." />
            </div>
          </div>

          {/* === Residenza === */}
          <div className={styles.group}>
            <label className={styles.label}>Indirizzo di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.indirizzo_residenza} onChange={onChange("indirizzo_residenza")} placeholder="Via / Piazza..." />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Città di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.citta_residenza} onChange={onChange("citta_residenza")} placeholder="Città" />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Provincia di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.provincia_residenza} onChange={onChange("provincia_residenza")} placeholder="MI, RM, ..." />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>CAP di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon} />
              <input className="input" value={form.cap_residenza} onChange={onChange("cap_residenza")} placeholder="20100" />
            </div>
          </div>

          {/* === Contatti === */}
          <div className={styles.group}>
            <label className={styles.label}>Cellulare</label>
            <div className={styles.inputIcon}>
              <FiPhone className={styles.icon} />
              <input className="input" value={form.cellulare} onChange={onChange("cellulare")} placeholder="+39 ..." />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Contatto emergenza</label>
            <div className={styles.inputIcon}>
              <FiPhone className={styles.icon} />
              <input className="input" value={form.contatto_emergenza} onChange={onChange("contatto_emergenza")} placeholder="Nome + telefono" />
            </div>
          </div>

          {/* Stato */}
          <div className={styles.group}>
            <label className={styles.label}>Stato</label>
            <div className={styles.inline}>
              <input id="chk-attivo" type="checkbox" checked={form.stato_attivo} onChange={onChange("stato_attivo")} />
              <label htmlFor="chk-attivo">Dipendente attivo</label>
            </div>
            <div className={styles.note}>Se disattivato, l’utente non potrà accedere all’app.</div>
          </div>
        </div>

        {/* Azioni */}
        <div className={styles.actions}>
          <button type="button" className={`btn ${styles.btnOutline}`} onClick={() => navigate(-1)}>
            Annulla
          </button>
          <button type="submit" className={`btn ${styles.btnPrimary}`} disabled={submitting}>
            <FiSave /> {submitting ? "Salvataggio..." : "Salva utente"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default UtenteNuovo;
