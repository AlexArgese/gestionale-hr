import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtenteDettaglio.module.css";
import { FiArrowLeft, FiSave } from "react-icons/fi";
import SedeDipendentiPicker from "./SedeDipendentiPicker";
import { API_BASE, getIdToken } from "../api";

const API = API_BASE;

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function SedeNuova() {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [societaId, setSocietaId] = useState("");
  const [societaList, setSocietaList] = useState([]);

  const [utenti, setUtenti] = useState([]);
  const [selectedUtenti, setSelectedUtenti] = useState([]);
  const [teamLeaderIds, setTeamLeaderIds] = useState(new Set());
  const [filterUtente, setFilterUtente] = useState("");

  const [saving, setSaving] = useState(false);
  const [msgError, setMsgError] = useState("");

  // carico società e utenti (per selezione)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setMsgError("");

        const resSoc = await fetch(`${API}/societa`, {
          headers: await authHeaders({ Accept: "application/json, text/plain, */*" }),
        });
        const socJson = await resSoc.json();
        if (alive) setSocietaList(Array.isArray(socJson) ? socJson : socJson.items || []);

        const resU = await fetch(`${API}/utenti`, {
          headers: await authHeaders({ Accept: "application/json, text/plain, */*" }),
        });
        const utentiJson = await resU.json();
        if (alive) setUtenti(Array.isArray(utentiJson) ? utentiJson : utentiJson.items || []);
      } catch (e) {
        if (alive) setMsgError(e.message || "Errore di caricamento iniziale");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleUtente = (uid) => {
    setSelectedUtenti((prev) => {
      if (prev.includes(uid)) {
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
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim()) {
      setMsgError("Inserisci un nome per la sede");
      return;
    }
    if (!societaId) {
      setMsgError("Seleziona una società");
      return;
    }

    try {
      setSaving(true);
      setMsgError("");

      // 1) crea la sede
      const res = await fetch(`${API}/sedi`, {
        method: "POST",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        }),
        body: JSON.stringify({ nome: nome.trim(), societa_id: societaId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Errore creazione sede");
      }

      const sedeId = data.id;
      const sedeNome = nome.trim();

      // 2) collega gli utenti selezionati a questa sede
      if (selectedUtenti.length > 0) {
        const res2 = await fetch(`${API}/sedi/${sedeId}/utenti`, {
          method: "POST",
          headers: await authHeaders({
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
          }),
          body: JSON.stringify({ utenti_ids: selectedUtenti }),
        });

        const data2 = await res2.json();
        if (!res2.ok) {
          throw new Error(data2?.error || data2?.message || "Errore associazione utenti");
        }
      }

      // 3) imposta i Team Leader selezionati per questa sede
      for (const uid of teamLeaderIds) {
        const u = utenti.find((x) => x.id === uid);
        if (!u) continue;
        const existing = (u.team_leader_sedi || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (existing.includes(sedeNome)) continue;
        const newTLSedi = [...existing, sedeNome].join(", ");

        const r = await fetch(`${API}/utenti/${uid}/team-leader`, {
          method: "PATCH",
          headers: await authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
          body: JSON.stringify({ team_leader_sedi: newTLSedi }),
        });
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error || `Errore impostazione Team Leader per dipendente #${uid}`);
        }
      }

      navigate("/utenti?tab=sedi", { replace: true });
    } catch (e) {
      console.error("Errore salvataggio sede:", e);
      setMsgError(e.message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const filteredUtenti = utenti.filter((u) => {
    const q = filterUtente.trim().toLowerCase();
    if (!q) return true;
    const testo = [u?.nome || "", u?.cognome || "", u?.email || "", u?.sede || ""]
      .join(" ")
      .toLowerCase();
    return testo.includes(q);
  });

  return (
    <form className="page" onSubmit={handleSubmit}>
      <header className="page-header">
        <div className="page-header-text">
          <button type="button" className="page-eyebrow" onClick={() => navigate(-1)}>
            <FiArrowLeft size={14} /> Sedi
          </button>
          <h1 className="page-title">Nuova sede</h1>
          <p className="page-subtitle">Crea la sede e associa i dipendenti che vi lavorano.</p>
        </div>
      </header>

      {msgError && <div className="alert alert-danger">{msgError}</div>}

      <div className={styles.formSection}>
        <div className={styles.formSectionHead}>
          <h3 className={styles.formSectionTitle}>Dati della sede</h3>
        </div>
        <div className={styles.grid}>
          <div className={styles.group}>
            <label className={styles.label}>Nome sede</label>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Amministrazione"
            />
          </div>
          <div className={styles.group}>
            <label className={styles.label}>Società di appartenenza</label>
            <select className="select" value={societaId} onChange={(e) => setSocietaId(e.target.value)}>
              <option value="">Seleziona una società…</option>
              {societaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ragione_sociale || s.nome}
                </option>
              ))}
            </select>
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
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <FiSave size={15} /> {saving ? "Salvataggio…" : "Crea sede"}
        </button>
      </div>
    </form>
  );
}

export default SedeNuova;
