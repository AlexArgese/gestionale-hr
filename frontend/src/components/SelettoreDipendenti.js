import React, { useEffect, useMemo, useState, useRef } from "react";
import styles from "./SelettoreDipendenti.module.css";

/**
 * Modal per scegliere 1/N dipendenti con:
 * - ricerca nome/cognome/email
 * - filtri società/sede/ruolo/stato
 * - ordinamento come in UtentiTable
 * - checkbox "seleziona tutti (filtrati)" reattivo ai cambi filtro
 *
 * Props:
 *  onClose(): void
 *  onConfirm(selectedIds: number[]): void
 *  preselectedIds?: number[]
 *  allowMultiple?: boolean (default true)
 */
export default function SelettoreDipendenti({
  onClose,
  onConfirm,
  preselectedIds = [],
  allowMultiple = true,
}) {
  const [utenti, setUtenti] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroSocieta, setFiltroSocieta] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroRuolo, setFiltroRuolo] = useState("");
  const [filtroAttivo, setFiltroAttivo] = useState("");
  const [ordinamento, setOrdinamento] = useState("alfabetico");
  const [selected, setSelected] = useState(new Set(preselectedIds));
  const [selectAllMode, setSelectAllMode] = useState(false);
  const masterCheckboxRef = useRef(null);

  useEffect(() => {
    fetch("http://localhost:3001/utenti")
      .then((r) => r.json())
      .then(setUtenti)
      .catch(console.error);
  }, []);

  // --- helpers sedi come in SedeDettaglio (multi-sede, split su virgola) ---
  const getSediFromUtente = (u) => {
    const raw = (u?.sede || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const societaUniche = useMemo(
    () => [...new Set(utenti.map((u) => u.societa_nome).filter(Boolean))],
    [utenti]
  );

  const sediUniche = useMemo(() => {
    const set = new Set();
    utenti.forEach((u) => {
      getSediFromUtente(u).forEach((s) => set.add(s));
    });
    return [...set];
  }, [utenti]);

  const ruoliUniche = useMemo(
    () => [...new Set(utenti.map((u) => u.ruolo).filter(Boolean))],
    [utenti]
  );

  const filtered = useMemo(() => {
    let res = [...utenti];

    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      res = res.filter((u) => {
        const testo = [
          u?.nome || "",
          u?.cognome || "",
          u?.email || "",
          u?.sede || "",
        ]
          .join(" ")
          .toLowerCase();
        return testo.includes(t);
      });
    }

    if (filtroSocieta) {
      res = res.filter((u) => u.societa_nome === filtroSocieta);
    }

    if (filtroSede) {
      res = res.filter((u) => getSediFromUtente(u).includes(filtroSede));
    }

    if (filtroRuolo) {
      res = res.filter((u) => u.ruolo === filtroRuolo);
    }

    if (filtroAttivo) {
      res = res.filter((u) => String(u.stato_attivo) === filtroAttivo);
    }

    if (ordinamento === "alfabetico") {
      res.sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));
    } else if (ordinamento === "modifica") {
      res.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } else if (ordinamento === "inserimento") {
      res.sort((a, b) => b.id - a.id);
    }

    return res;
  }, [
    utenti,
    searchTerm,
    filtroSocieta,
    filtroSede,
    filtroRuolo,
    filtroAttivo,
    ordinamento,
  ]);

  // Se "selectAllMode" è attivo e cambiano i filtri,
  // sincronizza la selezione con l'elenco visibile
  useEffect(() => {
    if (!selectAllMode) return;
    const visibleIds = new Set(filtered.map((u) => u.id));
    const next = new Set([...selected].filter((id) => visibleIds.has(id)));
    setSelected(next);
  }, [filtered, selectAllMode]); // eslint-disable-line

  const toggle = (id) => {
    setSelectAllMode(false); // qualsiasi toggle manuale esce dalla modalità "tutti"
    if (!allowMultiple) {
      setSelected(new Set([id]));
      return;
    }
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const allIds = filtered.map((u) => u.id);
  const allChecked = allIds.every((id) => selected.has(id)) && allIds.length > 0;
  const someChecked = allIds.some((id) => selected.has(id)) && !allChecked;

  // gestisco lo stato indeterminate del master checkbox
  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  const toggleAllFiltered = () => {
    const next = new Set(selected);
    if (allChecked) {
      allIds.forEach((id) => next.delete(id));
    } else {
      allIds.forEach((id) => next.add(id));
    }
    setSelected(next);
    setSelectAllMode(!allChecked);
  };

  const visibleSelectedCount = filtered.filter((u) =>
    selected.has(u.id)
  ).length;

  return (
    <div className={styles["sel-overlay"]} role="dialog" aria-modal="true">
      <div className={styles["sel-panel"]}>
        {/* HEADER */}
        <div className={styles["sel-header"]}>
          <div className={styles["sel-header-main"]}>
            <h3 className={styles["sel-title"]}>Seleziona dipendenti</h3>
            <span className={styles["sel-subtitle"]}>
              Usa ricerca e filtri per restringere l&apos;elenco, poi seleziona
              uno o più dipendenti.
            </span>
          </div>
          <button
            className={styles["sel-close"]}
            onClick={onClose}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* TOOLBAR (search + ordinamento) */}
        <div className={styles["sel-toolbar"]}>
          <div className={styles["sel-search-wrap"]}>
            <input
              type="text"
              placeholder="Cerca per nome, cognome o email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles["sel-search"]}
            />
          </div>

          <div className={styles["sel-toolbar-right"]}>
            <span className={styles["sel-count"]}>
              {filtered.length} risultati
            </span>
            <select
              value={ordinamento}
              onChange={(e) => setOrdinamento(e.target.value)}
              className={styles["sel-select"]}
            >
              <option value="alfabetico">Cognome (A-Z)</option>
              <option value="inserimento">Ultima aggiunta</option>
              <option value="modifica">Ultima modifica</option>
            </select>
          </div>
        </div>

        {/* FILTRI */}
        <div className={styles["sel-filters"]}>
          <select
            value={filtroSocieta}
            onChange={(e) => setFiltroSocieta(e.target.value)}
            className={styles["sel-select"]}
          >
            <option value="">Tutte le società</option>
            {societaUniche.map((x, i) => (
              <option key={i} value={x}>
                {x}
              </option>
            ))}
          </select>

          <select
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            className={styles["sel-select"]}
          >
            <option value="">Tutte le sedi</option>
            {sediUniche.map((x, i) => (
              <option key={i} value={x}>
                {x}
              </option>
            ))}
          </select>


          <select
            value={filtroAttivo}
            onChange={(e) => setFiltroAttivo(e.target.value)}
            className={styles["sel-select"]}
          >
            <option value="">Tutti gli stati</option>
            <option value="true">Attivi</option>
            <option value="false">Non attivi</option>
          </select>
        </div>

        {/* TABELLA */}
        <div className={styles["sel-table-wrap"]}>
          <table className={styles["sel-table"]}>
            <thead>
              <tr>
                <th className={styles["sel-th-check"]}>
                  <input
                    type="checkbox"
                    ref={masterCheckboxRef}
                    checked={allChecked}
                    onChange={toggleAllFiltered}
                    disabled={!allowMultiple || filtered.length === 0}
                    title={
                      allowMultiple
                        ? "Seleziona tutto (filtrati)"
                        : "Selezione singola"
                    }
                  />
                </th>
                <th>Cognome</th>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Sede</th>
                <th>Società</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isSelected = selected.has(u.id);
                return (
                  <tr
                    key={u.id}
                    className={
                      isSelected ? styles["sel-row-selected"] : undefined
                    }
                    onClick={() => toggle(u.id)}
                  >
                    <td
                      onClick={(e) => e.stopPropagation()}
                      className={styles["sel-td-check"]}
                    >
                      <input
                        type="checkbox"
                        onChange={() => toggle(u.id)}
                        checked={isSelected}
                        disabled={!allowMultiple && !isSelected}
                      />
                    </td>
                    <td>{u.cognome}</td>
                    <td>{u.nome}</td>
                    <td>{u.email}</td>
                    <td>{u.ruolo}</td>
                    <td>{u.sede}</td>
                    <td>{u.societa_nome}</td>
                    <td>
                      {u.stato_attivo ? (
                        <span className={styles["sel-badge-ok"]}>Attivo</span>
                      ) : (
                        <span className={styles["sel-badge-no"]}>
                          Non attivo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles["sel-empty"]}>
                    Nessun risultato con i filtri correnti.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className={styles["sel-footer"]}>
          <span className={styles["sel-summary"]}>
            {visibleSelectedCount} selezionati (visibili)
            {selectAllMode || selected.size !== visibleSelectedCount
              ? ` / ${selected.size} totali`
              : ""}
          </span>
          <div className={styles["sel-spacer"]} />
          <button
            className={`btn btn-secondary ${styles["sel-btn"]}`}
            onClick={onClose}
            type="button"
          >
            Annulla
          </button>
          <button
            className={`btn btn-primary ${styles["sel-btn"]}`}
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
            type="button"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}
