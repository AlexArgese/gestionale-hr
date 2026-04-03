import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import styles from "./UtenteDettaglio.module.css";
import {
  FiArrowLeft,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
  FiSave,
  FiUser,
  FiAtSign,
  FiCalendar,
  FiMapPin,
  FiHome,
  FiPhone,
  FiHash,
  FiBriefcase,
  FiGrid,
} from "react-icons/fi";
import DocumentiUtente from "./DocumentiUtente";
import PresenzeExportUtente from "./PresenzeExportUtente";
import { API_BASE } from "../api";

const API = API_BASE;

function UtenteDettaglio({
  fetchUrlBase = `${API}/utenti`,
  // Se vuoi ancora usare select, passa gli array via props:
  ruoliOptions = null,   // es. ["Impiegato","Operaio","Amministratore"]
  sediOptions  = null,   // es. ["Milano","Roma"]
  societaUrl   = `${API}/societa`, // opzionale
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msgError, setMsgError] = useState("");
  const [msgOk, setMsgOk] = useState("");
  const [sediFromApi, setSediFromApi] = useState([]);
  const [navIds, setNavIds] = useState([]);

  // opzioni: sedi/ruoli opzionali, società da API se esiste
  const [societa, setSocieta] = useState([]);
  const ruoli = Array.isArray(ruoliOptions) ? ruoliOptions : [];
  const sediList = Array.isArray(sediOptions) && sediOptions.length
    ? sediOptions
    : sediFromApi.map((s) => s?.nome || s); // ["AMMINISTRAZIONE", ...]


  const labelSocieta = (s) => s?.ragione_sociale || s?.nome || s?.denominazione || String(s?.id ?? s ?? "");
  const valueSocieta = (s) => s?.id ?? s;

  // GET utente
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${fetchUrlBase}/${id}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!alive) return;
        setForm({
          nome: data?.nome ?? "",
          cognome: data?.cognome ?? "",
          email: data?.email ?? "",
          ruolo: data?.ruolo ?? "",
          sede: data?.sede ?? "",
          societa_id: data?.societa_id ?? data?.societa?.id ?? "",
          tipo_contratto: data?.tipo_contratto ?? "full_time",
          stato_attivo: !!data?.stato_attivo,
          data_nascita: data?.data_nascita ?? "",
          luogo_nascita: data?.luogo_nascita ?? "",
          provincia_nascita: data?.provincia_nascita ?? "",
          codice_fiscale: data?.codice_fiscale ?? "",
          indirizzo_residenza: data?.indirizzo_residenza ?? "",
          citta_residenza: data?.citta_residenza ?? "",
          provincia_residenza: data?.provincia_residenza ?? "",
          cap_residenza: data?.cap_residenza ?? "",
          cellulare: data?.cellulare ?? "",
          contatto_emergenza: data?.contatto_emergenza ?? "",
          iban: data?.iban ?? "",              // 👈 IBAN qui
        });
      } catch {
        if (alive) setMsgError("Errore caricamento utente");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, fetchUrlBase]);

  // Società (se route esiste)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!societaUrl) return;
        const res = await fetch(societaUrl, { headers: { Accept: "application/json" } });
        const ok = res.ok && (res.headers.get("content-type") || "").includes("application/json");
        const data = ok ? await res.json() : [];
        if (alive) setSocieta(Array.isArray(data) ? data : (data?.items || []));
      } catch { /* opzionale, ok ignorare */ }
    })();
    return () => { alive = false; };
  }, [societaUrl]);

  const onChange = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  // converto la stringa "AMMINISTRAZIONE, INGRESSO" in array
  const getSelectedSedi = () => {
    if (!form?.sede) return [];
    return form.sede
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const handleAddSede = (nomeSede) => {
    if (!nomeSede) return;
    const current = getSelectedSedi();
    if (current.includes(nomeSede)) return; // niente duplicati
    const updated = [...current, nomeSede];
    setForm((f) => ({ ...f, sede: updated.join(", ") }));
  };

  const handleBackToList = () => {
    navigate(location.state?.backTo || "/utenti", {
      state: {
        activeTab: location.state?.activeTab || "utenti",
      },
    });
  };

  const handleRemoveSede = (nomeSede) => {
    const current = getSelectedSedi();
    const updated = current.filter((s) => s !== nomeSede);
    setForm((f) => ({ ...f, sede: updated.join(", ") }));
  };


  const normalizeDateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  const handleSubmit = async () => {
    setMsgError(""); setMsgOk("");
    try {
      setSaving(true);
      const societa_id_norm = /^\d+$/.test(String(form.societa_id)) ? Number(form.societa_id) : form.societa_id;

      const payload = {
        nome: form.nome,
        cognome: form.cognome,
        email: form.email,
        ruolo: form.ruolo,
        sede: form.sede,
        tipo_contratto: form.tipo_contratto || "full_time",
        stato_attivo: !!form.stato_attivo,
        societa_id: societa_id_norm,
        data_nascita: normalizeDateOrNull(form.data_nascita),
        luogo_nascita: form.luogo_nascita,
        provincia_nascita: form.provincia_nascita,
        codice_fiscale: form.codice_fiscale,
        indirizzo_residenza: form.indirizzo_residenza,
        citta_residenza: form.citta_residenza,
        provincia_residenza: form.provincia_residenza,
        cap_residenza: form.cap_residenza,
        cellulare: form.cellulare,
        contatto_emergenza: form.contatto_emergenza,
        iban: form.iban,                     // 👈 IBAN nel payload
      };

      const res = await fetch(`${fetchUrlBase}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      if (!res.ok) {
        const body = isJson ? await res.json().catch(() => null) : await res.text();
        const msg = isJson ? (body?.error || body?.message || `HTTP ${res.status}`) : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const body = isJson ? await res.json().catch(() => ({})) : {};
      setMsgOk(body?.message || "Modifiche salvate con successo");
    } catch (err) {
      setMsgError(err.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // Sedi (se non passate via props, le prendo da /sedi)
  useEffect(() => {
    if (Array.isArray(sediOptions) && sediOptions.length) return; // uso quelle passate

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API}/sedi`, {
          headers: { Accept: "application/json" },
        });
        const ok = res.ok && (res.headers.get("content-type") || "").includes("application/json");
        const data = ok ? await res.json() : [];
        if (alive) {
          const arr = Array.isArray(data) ? data : (data?.items || []);
          setSediFromApi(arr);
        }
      } catch (e) {
        console.error("Errore caricamento sedi", e);
      }
    })();

    return () => { alive = false; };
  }, [sediOptions]);

  useEffect(() => {
    const key = location.state?.listStorageKey;
    if (!key) {
      setNavIds([]);
      return;
    }

    try {
      const raw = sessionStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setNavIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setNavIds([]);
    }
  }, [location.state, id]);

  if (loading) return <div className={styles.container}>Caricamento…</div>;
  if (!form) return <div className={styles.container}>Utente non trovato</div>;

  const currentIdNum = Number(id);
  const currentIndex = navIds.findIndex((x) => Number(x) === currentIdNum);

  const prevId = currentIndex > 0 ? navIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < navIds.length - 1
    ? navIds[currentIndex + 1]
    : null;

  const goPrev = () => {
    if (!prevId) return;
    navigate(`/utenti/${prevId}`, {
      state: location.state,
    });
  };

  const goNext = () => {
    if (!nextId) return;
    navigate(`/utenti/${nextId}`, {
      state: location.state,
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Dettaglio utente: {form.nome} {form.cognome}
          </h1>

          {currentIndex >= 0 && navIds.length > 0 && (
            <div className={styles.note} style={{ marginTop: 6 }}>
              Utente {currentIndex + 1} di {navIds.length} nella lista corrente
            </div>
          )}
        </div>

        <div className={styles.headerCta}>
          <button className={`btn btn-outline`} onClick={handleBackToList}>
            <FiArrowLeft /> Indietro
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={goPrev}
            disabled={!prevId}
            title="Dipendente precedente"
          >
            <FiChevronLeft />
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={goNext}
            disabled={!nextId}
            title="Dipendente successivo"
          >
            <FiChevronRight />
          </button>

          <button
            className={`btn ${styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={saving}
          >
            <FiSave /> {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>

      <div className={styles.underline} />

      {msgError && <div className={styles.error}>{msgError}</div>}
      {msgOk && <div className={styles.success}>{msgOk}</div>}

      {/* --- CARD: Form utente --- */}
      <div className={`card ${styles.card}`}>
        <div className={styles.grid}>
          {/* Nome */}
          <div className={styles.group}>
            <label className={styles.label}>Nome</label>
            <div className={styles.inputIcon}>
              <FiUser className={styles.icon}/>
              <input className="input" value={form.nome} onChange={onChange("nome")} />
            </div>
          </div>
          {/* Cognome */}
          <div className={styles.group}>
            <label className={styles.label}>Cognome</label>
            <div className={styles.inputIcon}>
              <FiUser className={styles.icon}/>
              <input className="input" value={form.cognome} onChange={onChange("cognome")} />
            </div>
          </div>
          {/* Email */}
          <div className={styles.group}>
            <label className={styles.label}>Email</label>
            <div className={styles.inputIcon}>
              <FiAtSign className={styles.icon}/>
              <input className="input" value={form.email} onChange={onChange("email")} />
            </div>
          </div>

          {/* Ruolo: select se hai ruoliOptions, altrimenti input testo */}
          <div className={styles.group}>
            <label className={styles.label}>Ruolo</label>
            <div className={styles.inputIcon}>
              <FiBriefcase className={styles.icon}/>
              {ruoli.length ? (
                <select className="select" value={form.ruolo} onChange={onChange("ruolo")}>
                  <option value="">Seleziona ruolo</option>
                  {ruoli.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input className="input" value={form.ruolo} onChange={onChange("ruolo")} placeholder="Ruolo"/>
              )}
            </div>
          </div>

          {/* Sedi: multi-selezione da dropdown, salvate come stringa separata da virgole */}
          <div className={styles.group}>
            <label className={styles.label}>Sedi</label>

            {/* Dropdown: ogni scelta aggiunge una sede */}
            <div className={styles.inputIcon}>
              <FiMapPin className={styles.icon} />
              <select
                className="select"
                value="" // sempre vuoto così puoi aggiungere più sedi
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    handleAddSede(value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Aggiungi sede…</option>
                {sediList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Sedi attualmente collegate all'utente (editabili) */}
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
                        <button
                          type="button"
                          className={styles.sedeChipRemove}
                          onClick={() => handleRemoveSede(s)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Rappresentazione "raw" come stringa, esattamente come verrà salvata nel DB */}
                  <div className={styles.note} style={{ marginTop: 6 }}>
                    Valore salvato:{" "}
                    <span className={styles.mono}>
                      {getSelectedSedi().join(", ")}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Società (select se disponibile) */}
          <div className={styles.group}>
            <label className={styles.label}>Società</label>
            <div className={styles.inputIcon}>
              <FiGrid className={styles.icon}/>
              {societa.length ? (
                <select className="select" value={form.societa_id} onChange={onChange("societa_id")}>
                  <option value="">Seleziona società</option>
                  {societa.map((s) => (
                    <option key={valueSocieta(s)} value={valueSocieta(s)}>{labelSocieta(s)}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value={form.societa_id} onChange={onChange("societa_id")} placeholder="ID società"/>
              )}
            </div>
          </div>

          {/* Data nascita */}
          <div className={styles.group}>
            <label className={styles.label}>Data di nascita</label>
            <div className={styles.inputIcon}>
              <FiCalendar className={styles.icon}/>
              <input className="input" type="date" value={form.data_nascita || ""} onChange={onChange("data_nascita")} />
            </div>
          </div>

          {/* Luogo nascita */}
          <div className={styles.group}>
            <label className={styles.label}>Luogo di nascita</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.luogo_nascita} onChange={onChange("luogo_nascita")} />
            </div>
          </div>

          {/* Provincia nascita */}
          <div className={styles.group}>
            <label className={styles.label}>Provincia di nascita</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.provincia_nascita} onChange={onChange("provincia_nascita")} />
            </div>
          </div>

          {/* Codice fiscale */}
          <div className={styles.group}>
            <label className={styles.label}>Codice fiscale</label>
            <div className={styles.inputIcon}>
              <FiHash className={styles.icon}/>
              <input className="input" value={form.codice_fiscale} onChange={onChange("codice_fiscale")} />
            </div>
          </div>

          {/* Residenza */}
          <div className={styles.group}>
            <label className={styles.label}>Indirizzo di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.indirizzo_residenza} onChange={onChange("indirizzo_residenza")} />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Città di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.citta_residenza} onChange={onChange("citta_residenza")} />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Provincia di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.provincia_residenza} onChange={onChange("provincia_residenza")} />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>CAP di residenza</label>
            <div className={styles.inputIcon}>
              <FiHome className={styles.icon}/>
              <input className="input" value={form.cap_residenza} onChange={onChange("cap_residenza")} />
            </div>
          </div>

          {/* IBAN */}
          <div className={styles.group}>
            <label className={styles.label}>IBAN</label>
            <div className={styles.inputIcon}>
              <FiHash className={styles.icon}/>
              <input className="input" value={form.iban} onChange={onChange("iban")} />
            </div>
          </div>

          {/* Contatti */}
          <div className={styles.group}>
            <label className={styles.label}>Cellulare</label>
            <div className={styles.inputIcon}>
              <FiPhone className={styles.icon}/>
              <input className="input" value={form.cellulare} onChange={onChange("cellulare")} />
            </div>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>Contatto emergenza</label>
            <div className={styles.inputIcon}>
              <FiPhone className={styles.icon}/>
              <input className="input" value={form.contatto_emergenza} onChange={onChange("contatto_emergenza")} />
            </div>
          </div>

          {/* Tipo contratto */}
          <div className={styles.group}>
            <label className={styles.label}>Tipo contratto</label>
            <div className={styles.inputIcon}>
              <FiBriefcase className={styles.icon}/>
              <select
                className="select"
                value={form.tipo_contratto}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tipo_contratto: e.target.value }))
                }
              >
                <option value="full_time">Full time 6,40</option>
                <option value="part_time_2">Part time 2</option>
                <option value="part_time_3">Part time 3</option>
                <option value="part_time_4">Part time 4</option>
                <option value="part_time_6">Part time 6</option>
                <option value="part_time_8">Part time 8</option>
                <option value="chiamata_6">Chiamata 6</option>
              </select>
            </div>
          </div>

          {/* Stato attivo */}
          <div className={styles.group}>
            <label className={styles.label}>Stato</label>
            <div className={styles.inline}>
              <input id="chk-attivo" type="checkbox" checked={!!form.stato_attivo} onChange={onChange("stato_attivo")} />
              <label htmlFor="chk-attivo">Dipendente attivo</label>
            </div>
            <div className={styles.note}>Se disattivato, l’utente non potrà accedere all’app.</div>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={`btn btn-outline`} onClick={handleBackToList}>
            Annulla
          </button>
          <button type="button" className={`btn ${styles.btnPrimary}`} onClick={handleSubmit} disabled={saving}>
            <FiSave /> {saving ? "Salvataggio…" : "Salva modifiche"}
          </button>
        </div>
      </div>

      <PresenzeExportUtente
        userId={id}
        nome={form ? `${form.nome} ${form.cognome}` : ""}
      />

      {/* --- SEZIONE: Documenti utente (senza card wrapper) --- */}
      <DocumentiUtente userId={id} />
    </div>
  );
}

export default UtenteDettaglio;
