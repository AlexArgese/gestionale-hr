import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtenteDettaglio.module.css";
import { FiArrowLeft, FiSave, FiX } from "react-icons/fi";
import { API_BASE, getIdToken } from "../api";
import { CONTRACT_OPTIONS } from "../constants/contracts";

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function UtenteNuovo({
  postUrl = `${API}/utenti`,
  societaOptions = null,
  sediOptions = null,
  ruoliOptions = null,
  societaUrl = `${API}/societa`,
  sediUrl = `${API}/sedi`,
  ruoliUrl = `${API}/ruoli`,
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
    stato_attivo: true,
    tipo_contratto: "full_time",
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
  const [fieldErrors, setFieldErrors] = useState({});

  // helpers label/value sicuri
  const labelSocieta = (s) => s?.ragione_sociale || s?.nome || s?.denominazione || String(s?.id ?? s ?? "");
  const valueSocieta = (s) => s?.id ?? s;
  const labelSede = (s) => s?.nome || s?.label || String(s ?? "");
  const labelRuolo = (r) => r?.nome || r?.label || String(r ?? "");
  const valueRuolo = (r) => r?.id ?? r;

  // fetch opzioni se non fornite
  useEffect(() => {
    let alive = true;
    async function load(url, setter) {
      try {
        const res = await fetch(url, { headers: await authHeaders({ Accept: "application/json" }) });
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

  const getSelectedSedi = () => {
    if (!form.sede) return [];
    return form.sede.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  };

  const handleAddSede = (nomeSede) => {
    if (!nomeSede) return;
    const current = getSelectedSedi();
    if (current.includes(nomeSede)) return;
    setForm((f) => ({ ...f, sede: [...current, nomeSede].join(", ") }));
  };

  const handleRemoveSede = (nomeSede) => {
    const updated = getSelectedSedi().filter((s) => s !== nomeSede);
    setForm((f) => ({ ...f, sede: updated.join(", ") }));
  };

  const sediList = sedi.map((s) => labelSede(s));

  const validEmail = (v) => /^\S+@\S+\.\S+$/.test(v);
  const normalizeDateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  const FIELD_VALIDATORS = {
    email: (v) => (v && !validEmail(v) ? "Email non valida" : ""),
    codice_fiscale: (v) =>
      v && !/^[A-Za-z]{6}\d{2}[A-Za-z]\d{2}[A-Za-z]\d{3}[A-Za-z]$/.test(v)
        ? "Codice fiscale non valido (16 caratteri)"
        : "",
    cap_residenza: (v) => (v && !/^\d{5}$/.test(v) ? "CAP non valido (5 cifre)" : ""),
  };

  const validateField = (key) => {
    const validator = FIELD_VALIDATORS[key];
    if (!validator) return;
    setFieldErrors((prev) => ({ ...prev, [key]: validator(form[key]) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgError(""); setMsgOk("");

    // validazioni minime
    if (!form.nome?.trim() || !form.cognome?.trim()) {
      setMsgError("Nome e cognome sono obbligatori.");
      return;
    }

    const nextFieldErrors = {};
    Object.keys(FIELD_VALIDATORS).forEach((key) => {
      nextFieldErrors[key] = FIELD_VALIDATORS[key](form[key]);
    });
    setFieldErrors(nextFieldErrors);
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setMsgError("Controlla i campi evidenziati prima di salvare.");
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
        headers: await authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
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
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate(-1)}>
            <FiArrowLeft size={14} /> Dipendenti
          </button>
          <h1 className="page-title">Nuovo dipendente</h1>
          <p className="page-subtitle">Compila i dati principali: il resto si può completare in seguito.</p>
        </div>
      </header>

      {msgError && <div className="alert alert-danger">{msgError}</div>}
      {msgOk && <div className="alert alert-success">{msgOk}</div>}

      {/* Card form */}
      <form className={styles.card} onSubmit={handleSubmit}>

        {/* === Dati principali === */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHead}>
            <h3 className={styles.formSectionTitle}>Dati principali</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.group}>
              <label className={styles.label}>Nome</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.nome} onChange={onChange("nome")} placeholder="Mario" />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Cognome</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.cognome} onChange={onChange("cognome")} placeholder="Rossi" />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Email</label>
              <div className={`${styles.inputIcon} ${fieldErrors.email ? styles.hasError : ""}`}>
                <input
                  className="input"
                  value={form.email}
                  onChange={onChange("email")}
                  onBlur={() => validateField("email")}
                  placeholder="mario.rossi@azienda.it"
                />
              </div>
              {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
            </div>

          </div>
        </div>

        {/* === Rapporto di lavoro === */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHead}>
            <h3 className={styles.formSectionTitle}>Rapporto di lavoro</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.group}>
              <label className={styles.label}>Ruolo</label>
              <div className={styles.inputIcon}>
                <select className="select" value={form.ruolo} onChange={onChange("ruolo")}>
                  <option value="">Seleziona ruolo</option>
                  {ruoli.map((r) => (
                    <option key={valueRuolo(r)} value={valueRuolo(r)}>{labelRuolo(r)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Sedi</label>
              <div className={styles.inputIcon}>
                <select
                  className="select"
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) { handleAddSede(value); e.target.value = ""; }
                  }}
                >
                  <option value="">Aggiungi sede…</option>
                  {sediList.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className={styles.sediSelectedWrap}>
                {getSelectedSedi().length === 0 && (
                  <span className={styles.note}>Nessuna sede assegnata</span>
                )}
                {getSelectedSedi().length > 0 && (
                  <>
                    <div className={styles.sediChips}>
                      {getSelectedSedi().map((s) => (
                        <span key={s} className={styles.sedeChip}>
                          {s}
                          <button type="button" className={styles.sedeChipRemove} onClick={() => handleRemoveSede(s)} aria-label={`Rimuovi ${s}`}><FiX size={12} /></button>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Società</label>
              <div className={styles.inputIcon}>
                <select className="select" value={form.societa_id} onChange={onChange("societa_id")}>
                  <option value="">Seleziona società</option>
                  {societa.map((s) => (
                    <option key={valueSocieta(s)} value={valueSocieta(s)}>{labelSocieta(s)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Tipo contratto</label>
              <div className={styles.inputIcon}>
                <select
                  className="select"
                  value={form.tipo_contratto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tipo_contratto: e.target.value }))
                  }
                >
                  {CONTRACT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Stato</label>
              <div className={styles.inline}>
                <input id="chk-attivo" className={styles.check} type="checkbox" checked={form.stato_attivo} onChange={onChange("stato_attivo")} />
                <label htmlFor="chk-attivo" className={styles.checkLabel}>Dipendente attivo</label>
              </div>
              <div className={styles.note}>Se non attivo, il dipendente non può accedere all’app.</div>
            </div>
          </div>
        </div>

        {/* === Anagrafica === */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHead}>
            <h3 className={styles.formSectionTitle}>Anagrafica</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.group}>
              <label className={styles.label}>Data di nascita</label>
              <div className={styles.inputIcon}>
                <input className="input" type="date" value={form.data_nascita} onChange={onChange("data_nascita")} />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Luogo di nascita</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.luogo_nascita} onChange={onChange("luogo_nascita")} placeholder="Comune" />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Provincia di nascita</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.provincia_nascita} onChange={onChange("provincia_nascita")} placeholder="MI, RM, ..." />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Codice fiscale</label>
              <div className={`${styles.inputIcon} ${fieldErrors.codice_fiscale ? styles.hasError : ""}`}>
                <input
                  className="input"
                  value={form.codice_fiscale}
                  onChange={onChange("codice_fiscale")}
                  onBlur={() => validateField("codice_fiscale")}
                  placeholder="RSSMRA..."
                />
              </div>
              {fieldErrors.codice_fiscale && <span className={styles.fieldError}>{fieldErrors.codice_fiscale}</span>}
            </div>
          </div>
        </div>

        {/* === Residenza === */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHead}>
            <h3 className={styles.formSectionTitle}>Residenza</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.group}>
              <label className={styles.label}>Indirizzo di residenza</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.indirizzo_residenza} onChange={onChange("indirizzo_residenza")} placeholder="Via / Piazza..." />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Città di residenza</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.citta_residenza} onChange={onChange("citta_residenza")} placeholder="Città" />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Provincia di residenza</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.provincia_residenza} onChange={onChange("provincia_residenza")} placeholder="MI, RM, ..." />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>CAP di residenza</label>
              <div className={`${styles.inputIcon} ${fieldErrors.cap_residenza ? styles.hasError : ""}`}>
                <input
                  className="input"
                  value={form.cap_residenza}
                  onChange={onChange("cap_residenza")}
                  onBlur={() => validateField("cap_residenza")}
                  placeholder="20100"
                />
              </div>
              {fieldErrors.cap_residenza && <span className={styles.fieldError}>{fieldErrors.cap_residenza}</span>}
            </div>
          </div>
        </div>

        {/* === Contatti === */}
        <div className={styles.formSection}>
          <div className={styles.formSectionHead}>
            <h3 className={styles.formSectionTitle}>Contatti</h3>
          </div>
          <div className={styles.grid}>
            <div className={styles.group}>
              <label className={styles.label}>Cellulare</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.cellulare} onChange={onChange("cellulare")} placeholder="+39 ..." />
              </div>
            </div>

            <div className={styles.group}>
              <label className={styles.label}>Contatto emergenza</label>
              <div className={styles.inputIcon}>
                <input className="input" value={form.contatto_emergenza} onChange={onChange("contatto_emergenza")} placeholder="Nome + telefono" />
              </div>
            </div>
          </div>
        </div>

        {/* Azioni */}
        <div className={styles.actions}>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
            Annulla
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <FiSave size={15} /> {submitting ? "Salvataggio…" : "Crea dipendente"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default UtenteNuovo;
