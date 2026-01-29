import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function SedeNuova() {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [societaId, setSocietaId] = useState("");
  const [societaList, setSocietaList] = useState([]);

  const [utenti, setUtenti] = useState([]);
  const [selectedUtenti, setSelectedUtenti] = useState([]);
  const [filterUtente, setFilterUtente] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // carico società e utenti (per selezione)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);

        // 1) Società (endpoint che già usi per altri form tipo utente nuovo)
        const resSoc = await fetch("http://localhost:3001/societa", {
          headers: { Accept: "application/json, text/plain, */*" },
        });
        const socJson = await resSoc.json();
        if (alive) setSocietaList(Array.isArray(socJson) ? socJson : socJson.items || []);

        // 2) Utenti
        const resU = await fetch("http://localhost:3001/utenti", {
          headers: { Accept: "application/json, text/plain, */*" },
        });
        const utentiJson = await resU.json();
        if (alive) setUtenti(Array.isArray(utentiJson) ? utentiJson : utentiJson.items || []);
      } catch (e) {
        if (alive) setError(e.message || "Errore di caricamento iniziale");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleToggleUtente = (id) => {
    setSelectedUtenti((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim()) {
      setError("Inserisci un nome per la sede");
      return;
    }
    if (!societaId) {
      setError("Seleziona una società");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 1) crea la sede
      const res = await fetch("http://localhost:3001/sedi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        },
        body: JSON.stringify({
          nome: nome.trim(),
          societa_id: societaId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Errore creazione sede");
      }

      const sedeId = data.id;

      // 2) collega gli utenti selezionati a questa sede
      if (selectedUtenti.length > 0) {
        const res2 = await fetch(`http://localhost:3001/sedi/${sedeId}/utenti`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
          },
          body: JSON.stringify({
            utenti_ids: selectedUtenti,
          }),
        });

        const data2 = await res2.json();
        if (!res2.ok) {
          throw new Error(data2?.error || data2?.message || "Errore associazione utenti");
        }
      }

      // ok, torna alla lista sedi
      navigate("/utenti", { replace: true }); // vai sulla pagina con tab Sedi
    } catch (e) {
      console.error("Errore salvataggio sede:", e);
      setError(e.message || "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // filtra utenti per testo libero (nome/cognome/email)
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

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="h2">Nuova sede</h2>
          <p className="small">Crea una nuova sede e associa i dipendenti.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate(-1)}
          >
            Annulla
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Salvataggio…" : "Salva sede"}
          </button>
        </div>
      </div>

      <div className="card-body">
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #FECACA",
              background: "#FEF2F2",
              color: "#B91C1C",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* NOME SEDE */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
            >
              Nome sede
            </label>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. AMMINISTRAZIONE, FASANOLANDIA..."
            />
          </div>

          {/* SOCIETA */}
          <div style={{ marginBottom: 24 }}>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
            >
              Società di appartenenza
            </label>
            <select
              className="select"
              value={societaId}
              onChange={(e) => setSocietaId(e.target.value)}
            >
              <option value="">Seleziona una società…</option>
              {societaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ragione_sociale || s.nome}
                </option>
              ))}
            </select>
          </div>

          {/* LISTA UTENTI */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
            >
              Dipendenti di questa sede
            </label>
            <p className="small" style={{ marginBottom: 8 }}>
              Seleziona i dipendenti che devono appartenere a questa sede.
            </p>

            {/* filtro rapida */}
            <input
              className="input"
              placeholder="Filtra dipendenti per nome, cognome, email…"
              value={filterUtente}
              onChange={(e) => setFilterUtente(e.target.value)}
              style={{ marginBottom: 10 }}
            />

            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 8,
                background: "#FFFFFF",
              }}
            >
              {filteredUtenti.length === 0 && (
                <div className="small">Nessun dipendente trovato.</div>
              )}

              {filteredUtenti.map((u) => {
                const id = u.id;
                const nomeCompleto = `${u.cognome || ""} ${u.nome || ""}`.trim();
                const checked = selectedUtenti.includes(id);
                return (
                  <label
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 2px",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleUtente(id)}
                    />
                    <span>
                      <strong>{nomeCompleto || "—"}</strong>{" "}
                      <span className="small">
                        ({u.email || "senza email"}) –{" "}
                        {u.sede || "nessuna sede"}

                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SedeNuova;
