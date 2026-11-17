import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./UtenteDettaglio.module.css";
import { FiArrowLeft, FiSave } from "react-icons/fi";
import SedeDipendentiPicker from "./SedeDipendentiPicker";
import { API_BASE, getIdToken } from "../api";

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function SedeDettaglio({
  fetchUrlBase = `${API}/sedi`,
  societaUrl = `${API}/societa`,
  utentiUrl = `${API}/utenti`,
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msgError, setMsgError] = useState("");
  const [msgOk, setMsgOk] = useState("");

  const [societa, setSocieta] = useState([]);
  const [utenti, setUtenti] = useState([]);
  const [filterUtente, setFilterUtente] = useState("");
  const [selectedUtenti, setSelectedUtenti] = useState([]);
  const [teamLeaderIds, setTeamLeaderIds] = useState(new Set());
  // nome originale dal DB — usato per l'init; non cambia se l'utente edita il campo nome
  const [originalNomeSede, setOriginalNomeSede] = useState(null);

  const labelSocieta = (s) =>
    s?.ragione_sociale ||
    s?.nome ||
    s?.denominazione ||
    String(s?.id ?? s ?? "");
  const valueSocieta = (s) => s?.id ?? s;

  /* =========================
     FETCH Sede (dettaglio)
  ========================== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${fetchUrlBase}/${id}`, {
          headers: await authHeaders({ Accept: "application/json" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!alive) return;
        const nomeDB = data?.nome ?? "";
        setOriginalNomeSede(nomeDB);
        setForm({
          nome: nomeDB,
          societa_id: data?.societa_id ?? data?.societa?.id ?? "",
        });
      } catch (e) {
        console.error("Errore caricamento sede:", e);
        if (alive) setMsgError("Errore caricamento sede");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, fetchUrlBase]);

  /* =========================
     FETCH Società
  ========================== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!societaUrl) return;
        const res = await fetch(societaUrl, {
          headers: await authHeaders({ Accept: "application/json" }),
        });
        const ok =
          res.ok &&
          (res.headers.get("content-type") || "").includes("application/json");
        const data = ok ? await res.json() : [];
        if (alive)
          setSocieta(Array.isArray(data) ? data : data?.items || []);
      } catch (e) {
        console.error("Errore caricamento società", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [societaUrl]);

  /* =========================
     FETCH Utenti
  ========================== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(utentiUrl, {
          headers: await authHeaders({ Accept: "application/json" }),
        });
        const ok =
          res.ok &&
          (res.headers.get("content-type") || "").includes("application/json");
        const data = ok ? await res.json() : [];
        if (!alive) return;
        const arr = Array.isArray(data) ? data : data?.items || [];
        setUtenti(arr);
      } catch (e) {
        console.error("Errore caricamento utenti", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [utentiUrl]);

  /* =========================
     Calcola utenti che hanno questa sede
     (quando ho sia form.nome che utenti)
  ========================== */
  useEffect(() => {
    // Dipende da originalNomeSede (immutabile dopo il fetch) e non da form.nome
    // così l'utente può editare il campo nome senza perdere le selezioni TL
    if (!originalNomeSede || !utenti.length) return;

    const hasThisSede = (u) => {
      const raw = (u?.sede || "").trim();
      if (!raw) return false;
      return raw.split(",").map(s => s.trim()).filter(s => s.length > 0).includes(originalNomeSede);
    };

    const preselected = utenti.filter(hasThisSede).map((u) => u.id);
    setSelectedUtenti(preselected);

    const isLeaderOfThisSede = (u) => {
      const tl = (u.team_leader_sedi || "").split(",").map(s => s.trim()).filter(Boolean);
      return tl.includes(originalNomeSede);
    };
    const tls = new Set(
      utenti.filter((u) => hasThisSede(u) && isLeaderOfThisSede(u)).map((u) => u.id)
    );
    setTeamLeaderIds(tls);
  }, [originalNomeSede, utenti]);

  /* =========================
     Helpers
  ========================== */
  const onChange = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const toggleUtente = (uid) => {
    setSelectedUtenti((prev) => {
      if (prev.includes(uid)) {
        // Se si deseleziona il dipendente, rimuovi anche il suo ruolo TL
        setTeamLeaderIds((tls) => {
          if (!tls.has(uid)) return tls;
          const next = new Set(tls);
          next.delete(uid);
          return next;
        });
        return prev.filter((x) => x !== uid);
      }
      return [...prev, uid];
    });
  };

  const toggleTeamLeader = (uid) => {
    setTeamLeaderIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const filteredUtenti = utenti.filter((u) => {
    const q = filterUtente.trim().toLowerCase();
    if (!q) return true;
    const testo = [
      u?.nome || "",
      u?.cognome || "",
      u?.email || "",
      u?.sede || "",
    ]
      .join(" ")
      .toLowerCase();
    return testo.includes(q);
  });

  /* =========================
     Salva: PUT sede + POST associa utenti
  ========================== */
  const handleSubmit = async () => {
    if (!form) return;
    setMsgError("");
    setMsgOk("");

    try {
      setSaving(true);

      const societa_id_norm = /^\d+$/.test(String(form.societa_id))
        ? Number(form.societa_id)
        : form.societa_id;

      // 1) Aggiorno sede
      const res = await fetch(`${fetchUrlBase}/${id}`, {
        method: "PUT",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          nome: form.nome,
          societa_id: societa_id_norm || null,
        }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      if (!res.ok) {
        const body = isJson
          ? await res.json().catch(() => null)
          : await res.text();
        const msg = isJson
          ? body?.error || body?.message || `HTTP ${res.status}`
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // 2) Associo gli utenti selezionati
      if (selectedUtenti.length > 0) {
        const res2 = await fetch(`${fetchUrlBase}/${id}/utenti`, {
          method: "POST",
          headers: await authHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({
            utenti_ids: selectedUtenti,
          }),
        });

        const ctype2 = res2.headers.get("content-type") || "";
        const isJson2 = ctype2.includes("application/json");
        if (!res2.ok) {
          const body2 = isJson2
            ? await res2.json().catch(() => null)
            : await res2.text();
          const msg2 = isJson2
            ? body2?.error || body2?.message || `HTTP ${res2.status}`
            : `HTTP ${res2.status}`;
          throw new Error(msg2);
        }
      }

      // 3) Aggiorno team_leader_sedi per gli utenti di questa sede che sono cambiati
      const sedeName = form.nome;           // nome corrente (potrebbe essere cambiato)
      const oldSedeName = originalNomeSede; // nome originale dal DB

      for (const uid of selectedUtenti) {
        const u = utenti.find((x) => x.id === uid);
        if (!u) continue;

        const rawTLSedi = (u.team_leader_sedi || "").split(",").map(s => s.trim()).filter(Boolean);
        // Se la sede è stata rinominata, aggiorna il riferimento nel campo TL
        const baseTLSedi = rawTLSedi.map(s =>
          s === oldSedeName && oldSedeName !== sedeName ? sedeName : s
        );

        const wasLeaderHere = baseTLSedi.includes(sedeName);
        const isLeaderHere = teamLeaderIds.has(uid);
        if (wasLeaderHere === isLeaderHere) continue;

        const newTLSedi = isLeaderHere
          ? [...baseTLSedi.filter(s => s !== sedeName), sedeName].join(", ")
          : baseTLSedi.filter(s => s !== sedeName).join(", ");

        const r = await fetch(`${utentiUrl}/${uid}/team-leader`, {
          method: "PATCH",
          headers: await authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
          body: JSON.stringify({ team_leader_sedi: newTLSedi }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(
            body?.error || `Errore aggiornamento Team Leader per dipendente #${uid}`
          );
        }
      }

      setMsgOk("Modifiche salvate con successo");
    } catch (err) {
      console.error("Errore salvataggio sede:", err);
      setMsgError(err.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     RENDER
  ========================== */

  if (loading || !form) {
    return (
      <div className="empty-state">
        {loading ? "Caricamento…" : "Sede non trovata"}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate(-1)}>
            <FiArrowLeft size={14} /> Sedi
          </button>
          <h1 className="page-title">{form.nome || "Sede"}</h1>
          <p className="page-subtitle">Dati della sede e dipendenti associati.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            <FiSave size={15} /> {saving ? "Salvataggio…" : "Salva modifiche"}
          </button>
        </div>
      </header>

      {msgError && <div className="alert alert-danger">{msgError}</div>}
      {msgOk && <div className="alert alert-success">{msgOk}</div>}

      <div className={styles.formSection}>
        <div className={styles.formSectionHead}>
          <h3 className={styles.formSectionTitle}>Dati della sede</h3>
        </div>
        <div className={styles.grid}>
          <div className={styles.group}>
            <label className={styles.label}>Nome sede</label>
            <input className="input" value={form.nome} onChange={onChange("nome")} />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Società di appartenenza</label>
            {societa.length ? (
              <select className="select" value={form.societa_id} onChange={onChange("societa_id")}>
                <option value="">Seleziona società</option>
                {societa.map((s) => (
                  <option key={valueSocieta(s)} value={valueSocieta(s)}>
                    {labelSocieta(s)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={form.societa_id}
                onChange={onChange("societa_id")}
                placeholder="ID società"
              />
            )}
          </div>
        </div>
      </div>

      <SedeDipendentiPicker
        utenti={filteredUtenti}
        filter={filterUtente}
        onFilterChange={setFilterUtente}
        selectedIds={selectedUtenti}
        onToggle={toggleUtente}
        teamLeaderIds={teamLeaderIds}
        onToggleTeamLeader={toggleTeamLeader}
      />

      <div className={styles.actions}>
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
          Annulla
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <FiSave size={15} /> {saving ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </div>
    </div>
  );
}

export default SedeDettaglio;
