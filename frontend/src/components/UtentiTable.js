import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtentiTable.module.css";
import {
  FiPlus,
  FiSearch,
  FiArchive,
  FiChevronUp,
  FiChevronDown,
  FiRotateCcw,
  FiToggleLeft,
  FiToggleRight,
} from "react-icons/fi";
import { API_BASE, getIdToken } from "../api";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";
import { CONTRACT_OPTIONS } from "../constants/contracts";
import Pagination from "./ui/Pagination";

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function UtentiTable({
  fetchUrl,
  archived = false,
  activeTab = "utenti",
  onAddUser,
  onRowClick,
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const effectiveFetchUrl =
    fetchUrl || `${API_BASE}/utenti${archived ? "/archiviati" : ""}`;

  const storageKey = archived
    ? "utentiTableState:archiviati"
    : "utentiTableState:attivi";

  const listStorageKey = archived
    ? "utentiTableList:archiviati"
    : "utentiTableList:attivi";

  // dati
  const [utenti, setUtenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);


  const [bulkContract, setBulkContract] = useState("");

  // UI state
  const readSavedState = () => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const [q, setQ] = useState(() => readSavedState()?.q ?? "");
  const [filterSede, setFilterSede] = useState(() => readSavedState()?.filterSede ?? "tutte");
  const [filterSocieta, setFilterSocieta] = useState(() => readSavedState()?.filterSocieta ?? "tutte");
  const [filterStato, setFilterStato] = useState(() => readSavedState()?.filterStato ?? "tutti");
  const [sortBy, setSortBy] = useState(() => readSavedState()?.sortBy ?? "nome");
  const [sortDir, setSortDir] = useState(() => readSavedState()?.sortDir ?? "asc");

  const [pageSize, setPageSize] = useState(() => readSavedState()?.pageSize ?? 100);
  const [page, setPage] = useState(() => readSavedState()?.page ?? 1);

  // selezione multipla
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef(null);

  useEffect(() => {
    if (!selectedIds.length) setBulkMenuOpen(false);
  }, [selectedIds.length]);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const onClickOutside = (e) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) {
        setBulkMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [bulkMenuOpen]);

  // fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setSelectedIds([]);

        const res = await fetch(effectiveFetchUrl, {
          headers: await authHeaders({ Accept: "application/json, text/plain, */*" }),
        });

        const ctype = res.headers.get("content-type") || "";
        const isJson = ctype.includes("application/json");

        if (!res.ok) {
          const msg = isJson
            ? (await res.json().catch(() => null))?.message || `HTTP ${res.status}`
            : `HTTP ${res.status} — non JSON`;
          throw new Error(msg);
        }

        const data = isJson ? await res.json() : [];
        if (alive) setUtenti(Array.isArray(data) ? data : data?.items || []);
      } catch (e) {
        if (alive) setError(e.message || "Errore di caricamento");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [effectiveFetchUrl]);

  // reset pagina quando cambia vista
  useEffect(() => {
    setSelectedIds([]);
  }, [archived]);

  // "Acquapark Egnazia, Ingresso" -> "Acquapark Egnazia"
  const baseSede = (s) => String(s || "").split(",")[0].trim();

  const sedi = useMemo(() => {
    const m = new Map();
    utenti.forEach((u) => {
      const b = baseSede(u?.sede);
      if (b && !m.has(b.toLowerCase())) m.set(b.toLowerCase(), b);
    });
    return [
      "tutte",
      ...Array.from(m.values()).sort((a, b) =>
        a.localeCompare(b, "it", { sensitivity: "base" })
      ),
    ];
  }, [utenti]);

  const societa = useMemo(() => {
    const s = new Set();
    utenti.forEach((u) => u?.societa_nome && s.add(u.societa_nome));
    return ["tutte", ...Array.from(s).sort()];
  }, [utenti]);

  const filtered = useMemo(() => {
    const QQ = q.trim().toLowerCase();

    let out = utenti.filter((u) => {
      const nome = `${u?.nome || ""} ${u?.cognome || ""}`.trim();
      const hay = [
        nome.toLowerCase(),
        (u?.email || "").toLowerCase(),
        (u?.ruolo || "").toLowerCase(),
        (u?.sede || "").toLowerCase(),
        (u?.societa_nome || "").toLowerCase(),
      ].join(" ");

      if (QQ && !hay.includes(QQ)) return false;
      if (filterSede !== "tutte") {
        const sel = filterSede.trim().toLowerCase();
        const full = String(u?.sede || "").trim().toLowerCase();
        // match sulla sede base (include tutte le sotto-sedi, es. "…, Ingresso")
        // oppure sul valore completo (retro-compatibilità con filtri salvati)
        if (baseSede(u?.sede).toLowerCase() !== sel && full !== sel) return false;
      }
      if (filterSocieta !== "tutte" && u?.societa_nome !== filterSocieta) return false;
      if (filterStato === "attivi" && !u?.stato_attivo) return false;
      if (filterStato === "disattivi" && !!u?.stato_attivo) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const m = (v) => (v ?? "").toString().toLowerCase();
      switch (sortBy) {
        case "email":
          return m(a.email).localeCompare(m(b.email)) * dir;
        case "sede":
          return m(a.sede).localeCompare(m(b.sede)) * dir;
        case "stato":
          return ((a.stato_attivo ? 1 : 0) - (b.stato_attivo ? 1 : 0)) * dir;
        case "nome":
        default: {
          const an = `${m(a.cognome)} ${m(a.nome)}`.trim();
          const bn = `${m(b.cognome)} ${m(b.nome)}`.trim();
          return an.localeCompare(bn) * dir;
        }
      }
    });

    return out;
  }, [utenti, q, filterSede, filterSocieta, filterStato, sortBy, sortDir]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          q,
          filterSede,
          filterSocieta,
          filterStato,
          sortBy,
          sortDir,
          pageSize,
          page,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [storageKey, q, filterSede, filterSocieta, filterStato, sortBy, sortDir, pageSize, page]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        listStorageKey,
        JSON.stringify(filtered.map((u) => u.id).filter(Boolean))
      );
    } catch {
      // ignore storage errors
    }
  }, [listStorageKey, filtered]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );


  const pageItemIds = useMemo(
    () => pageItems.map((u) => u.id).filter(Boolean),
    [pageItems]
  );
  const selectedUsers = useMemo(
    () => utenti.filter((u) => selectedIds.includes(u.id)),
    [utenti, selectedIds]
  );

  const selectedStates = useMemo(
    () => Array.from(new Set(selectedUsers.map((u) => !!u.stato_attivo))),
    [selectedUsers]
  );

  const selectedHaveUniformState = selectedStates.length <= 1;
  const selectedStateValue =
    selectedStates.length === 1 ? selectedStates[0] : null;

  const allPageSelected =
    pageItemIds.length > 0 && pageItemIds.every((id) => selectedIds.includes(id));

  const somePageSelected =
    pageItemIds.some((id) => selectedIds.includes(id)) && !allPageSelected;

  const toggleSort = (key) => {
    if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const goAdd = () => {
    if (typeof onAddUser === "function") onAddUser();
    else navigate("/utenti/nuovo");
  };

  const handleRowClick = useCallback((u) => {
    if (typeof onRowClick === "function") {
      onRowClick(u);
      return;
    }

    navigate(`/utenti/${u?.id || ""}`, {
      state: {
        listStorageKey,
        tableStateKey: storageKey,
        backTo: `/utenti?tab=${activeTab}`,
      },
    });
  }, [navigate, onRowClick, listStorageKey, storageKey, activeTab]);

  const toggleUserSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        return prev.filter((id) => !pageItemIds.includes(id));
      }
      return Array.from(new Set([...prev, ...pageItemIds]));
    });
  };

  const reloadData = async () => {
    const res = await fetch(effectiveFetchUrl, {
      headers: await authHeaders({ Accept: "application/json, text/plain, */*" }),
    });
    const data = await res.json();
    setUtenti(Array.isArray(data) ? data : data?.items || []);
  };
  const handleBulkToggleStatus = async () => {
    if (!selectedIds.length || bulkLoading) return;

    if (!selectedHaveUniformState) {
      toast.error("Gli utenti selezionati non hanno tutti lo stesso stato.");
      return;
    }

    const nextState = !selectedStateValue;
    const label = nextState ? "attivi" : "non attivi";

    const ok = await confirm({
      title: "Conferma cambio stato",
      message: `Vuoi impostare ${selectedIds.length} dipendenti come ${label}?`,
      confirmLabel: "Conferma",
    });
    if (!ok) return;

    try {
      setBulkLoading(true);

      const res = await fetch(`${API_BASE}/utenti/bulk/stato-attivo`, {
        method: "PATCH",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        }),
        body: JSON.stringify({
          ids: selectedIds,
          stato_attivo: nextState,
        }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      const payload = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }

      await reloadData();
      setSelectedIds([]);
    } catch (e) {
      toast.error(e.message || "Errore durante cambio stato");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkContractChange = async () => {
    if (!selectedIds.length || !bulkContract || bulkLoading) return;

    const label =
      CONTRACT_OPTIONS.find((c) => c.value === bulkContract)?.label || bulkContract;

    const ok = await confirm({
      title: "Conferma cambio contratto",
      message: `Vuoi impostare il contratto "${label}" a ${selectedIds.length} dipendenti?`,
      confirmLabel: "Conferma",
    });
    if (!ok) return;

    try {
      setBulkLoading(true);

      const res = await fetch(`${API_BASE}/utenti/bulk/tipo-contratto`, {
        method: "PATCH",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        }),
        body: JSON.stringify({
          ids: selectedIds,
          tipo_contratto: bulkContract,
        }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      const payload = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }

      await reloadData();
      setSelectedIds([]);
      setBulkContract("");
    } catch (e) {
      toast.error(e.message || "Errore durante cambio contratto");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSingleArchive = async (id) => {
    const ok = await confirm({
      title: "Archiviare il dipendente?",
      message: "Non comparirà più tra i dipendenti attivi. Potrai ripristinarlo in qualsiasi momento dalla scheda Archiviati.",
      confirmLabel: "Archivia",
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/utenti/${id}/archivia`, {
        method: "PATCH",
        headers: await authHeaders({
          Accept: "application/json, text/plain, */*",
        }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      const payload = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }

      await reloadData();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } catch (e) {
      toast.error(e.message || "Errore durante archiviazione");
    }
  };

  const handleBulkAction = async () => {
    if (!selectedIds.length || bulkLoading) return;

    const actionLabel = archived ? "ripristinare" : "archiviare";
    const ok = await confirm({
      title: archived ? "Ripristinare i dipendenti?" : "Archiviare i dipendenti?",
      message: `Vuoi ${actionLabel} ${selectedIds.length} dipendenti?`,
      confirmLabel: archived ? "Ripristina" : "Archivia",
    });
    if (!ok) return;

    try {
      setBulkLoading(true);

      const endpoint = archived
        ? `${API_BASE}/utenti/bulk/ripristina`
        : `${API_BASE}/utenti/bulk/archivia`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        }),
        body: JSON.stringify({ ids: selectedIds }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      const payload = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }

      await reloadData();
      setSelectedIds([]);
    } catch (e) {
      toast.error(e.message || "Errore durante operazione multipla");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSingleRestore = async (id) => {
    const ok = await confirm({
      title: "Ripristinare il dipendente?",
      message: "Tornerà tra i dipendenti attivi con tutti i suoi dati e documenti.",
      confirmLabel: "Ripristina",
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/utenti/${id}/ripristina`, {
        method: "PATCH",
        headers: await authHeaders({
          Accept: "application/json, text/plain, */*",
        }),
      });

      const ctype = res.headers.get("content-type") || "";
      const isJson = ctype.includes("application/json");
      const payload = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }

      await reloadData();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } catch (e) {
      toast.error(e.message || "Errore durante ripristino");
    }
  };

  const sortIcon = (key) =>
    sortBy === key ? (sortDir === "asc" ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />) : null;

  const SortTh = ({ k, children, style }) => (
    <th
      className={styles.sortable}
      onClick={() => toggleSort(k)}
      style={style}
      aria-sort={sortBy === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className={styles.thInner}>{children}{sortIcon(k)}</span>
    </th>
  );

  return (
    <div className={styles.container}>
      {/* Barra strumenti: ricerca e filtri a sinistra, azioni a destra */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={`search ${styles.searchBox}`}>
            <FiSearch size={15} />
            <input
              className="input"
              placeholder="Cerca per nome, cognome o email"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className={`select ${styles.filterSelect}`}
            value={filterSede}
            onChange={(e) => {
              setFilterSede(e.target.value);
              setPage(1);
            }}
          >
            {sedi.map((s) => (
              <option key={s} value={s}>
                {s === "tutte" ? "Tutte le sedi" : s}
              </option>
            ))}
          </select>

          <select
            className={`select ${styles.filterSelect}`}
            value={filterSocieta}
            onChange={(e) => {
              setFilterSocieta(e.target.value);
              setPage(1);
            }}
          >
            {societa.map((s) => (
              <option key={s} value={s}>
                {s === "tutte" ? "Tutte le società" : s}
              </option>
            ))}
          </select>

          <select
            className={`select ${styles.filterSelect}`}
            value={filterStato}
            onChange={(e) => {
              setFilterStato(e.target.value);
              setPage(1);
            }}
          >
            <option value="tutti">Tutti gli stati</option>
            <option value="attivi">Solo attivi</option>
            <option value="disattivi">Solo non attivi</option>
          </select>
        </div>

        <div className={styles.actions}>
          {!!selectedIds.length && (
            <div className={styles.bulkMenuWrap} ref={bulkMenuRef}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setBulkMenuOpen((o) => !o)}
                disabled={bulkLoading}
                aria-expanded={bulkMenuOpen}
              >
                {bulkLoading ? "Operazione in corso…" : `Azioni (${selectedIds.length})`}
                <FiChevronDown size={15} />
              </button>

              {bulkMenuOpen && (
                <div className={styles.bulkMenu} role="menu">
                  <button
                    type="button"
                    className={styles.bulkMenuItem}
                    onClick={() => {
                      setBulkMenuOpen(false);
                      handleBulkAction();
                    }}
                    disabled={bulkLoading}
                  >
                    {archived ? <FiRotateCcw /> : <FiArchive />}
                    {archived ? "Ripristina selezionati" : "Archivia selezionati"}
                  </button>

                  {!archived && (
                    <button
                      type="button"
                      className={styles.bulkMenuItem}
                      onClick={() => {
                        setBulkMenuOpen(false);
                        handleBulkToggleStatus();
                      }}
                      disabled={bulkLoading || !selectedHaveUniformState}
                      title={
                        selectedHaveUniformState
                          ? ""
                          : "I dipendenti selezionati non hanno tutti lo stesso stato"
                      }
                    >
                      {selectedStateValue ? <FiToggleLeft /> : <FiToggleRight />}
                      {selectedHaveUniformState
                        ? selectedStateValue
                          ? "Imposta come non attivi"
                          : "Imposta come attivi"
                        : "Stato misto"}
                    </button>
                  )}

                  {!archived && (
                    <div className={styles.bulkMenuSection}>
                      <span className={styles.bulkMenuLabel}>Tipo di contratto</span>
                      <div className={styles.bulkMenuContractRow}>
                        <select
                          className="select"
                          value={bulkContract}
                          onChange={(e) => setBulkContract(e.target.value)}
                          disabled={bulkLoading}
                        >
                          <option value="">Seleziona…</option>
                          {CONTRACT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleBulkContractChange}
                          disabled={bulkLoading || !bulkContract}
                        >
                          Applica
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!archived && (
            <button className="btn btn-primary" onClick={goAdd}>
              <FiPlus size={16} /> Nuovo dipendente
            </button>
          )}
        </div>
      </div>

      {!!selectedIds.length && !archived && !selectedHaveUniformState && (
        <div className="alert alert-info">
          I dipendenti selezionati non hanno tutti lo stesso stato. Per cambiare stato in blocco,
          seleziona solo dipendenti attivi oppure solo non attivi.
        </div>
      )}

      <div className={`card ${styles.tableCard}`}>
        {loading && <div className="empty-state">Caricamento…</div>}
        {error && !loading && <div className="empty-state">Errore: {error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.tableScroll}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className={styles.checkCol}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        aria-label="Seleziona tutti nella pagina"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = somePageSelected;
                        }}
                        onChange={toggleSelectAllPage}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                    <SortTh k="nome">Dipendente</SortTh>
                    <SortTh k="email">Email</SortTh>
                    <SortTh k="sede">Sede</SortTh>
                    <SortTh k="stato" style={{ width: 130 }}>Stato</SortTh>
                    <th style={{ width: 64 }} aria-label="Azioni" />
                  </tr>
                </thead>

                <tbody>
                  {pageItems.map((u) => {
                    const nomeCompleto = `${u?.cognome || ""} ${u?.nome || ""}`.trim();
                    const isSelected = selectedIds.includes(u.id);

                    return (
                      <tr
                        key={u?.id || nomeCompleto + u?.email}
                        className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
                        onClick={() => handleRowClick(u)}
                      >
                        <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className={styles.check}
                            aria-label={`Seleziona ${nomeCompleto}`}
                            checked={isSelected}
                            onChange={() => toggleUserSelection(u.id)}
                          />
                        </td>

                        <td className="cell-strong">{nomeCompleto || "—"}</td>
                        <td className={styles.muted}>{u?.email || "—"}</td>
                        <td>{u?.sede || "—"}</td>

                        <td>
                          {u?.stato_attivo ? (
                            <span className="badge badge-success">Attivo</span>
                          ) : (
                            <span className="badge">Non attivo</span>
                          )}
                        </td>

                        <td className={styles.actionCell} onClick={(e) => e.stopPropagation()}>
                          {archived ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => handleSingleRestore(u.id)}
                              title="Ripristina dipendente"
                              aria-label="Ripristina dipendente"
                            >
                              <FiRotateCcw size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => handleSingleArchive(u.id)}
                              title="Archivia dipendente"
                              aria-label="Archivia dipendente"
                            >
                              <FiArchive size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!pageItems.length && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">Nessun dipendente corrisponde ai filtri.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPage(1); setPageSize(n); }}
              itemLabel="dipendenti"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default UtentiTable;