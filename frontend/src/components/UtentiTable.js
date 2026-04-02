import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtentiTable.module.css";
import {
  FiPlus,
  FiSearch,
  FiCheckCircle,
  FiSlash,
  FiArchive,
  FiRotateCcw,
} from "react-icons/fi";
import { API_BASE } from "../api";

function UtentiTable({
  fetchUrl,
  archived = false,
  onAddUser,
  onRowClick,
}) {
  const navigate = useNavigate();

  const effectiveFetchUrl =
    fetchUrl || `${API_BASE}/utenti${archived ? "/archiviati" : ""}`;

  // dati
  const [utenti, setUtenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [q, setQ] = useState("");
  const [filterSede, setFilterSede] = useState("tutte");
  const [filterStato, setFilterStato] = useState("tutti");
  const [sortBy, setSortBy] = useState("nome");
  const [sortDir, setSortDir] = useState("asc");

  // paginazione
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  // selezione multipla
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setSelectedIds([]);

        const res = await fetch(effectiveFetchUrl, {
          headers: { Accept: "application/json, text/plain, */*" },
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
    setPage(1);
    setQ("");
    setFilterSede("tutte");
    setFilterStato("tutti");
    setSelectedIds([]);
  }, [archived]);

  const sedi = useMemo(() => {
    const s = new Set();
    utenti.forEach((u) => u?.sede && s.add(u.sede));
    return ["tutte", ...Array.from(s)];
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
      if (filterSede !== "tutte" && u?.sede !== filterSede) return false;
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
  }, [utenti, q, filterSede, filterStato, sortBy, sortDir]);

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

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, page * pageSize);

  const pageItemIds = useMemo(
    () => pageItems.map((u) => u.id).filter(Boolean),
    [pageItems]
  );

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

  const handleRowClick = (u) => {
    if (typeof onRowClick === "function") onRowClick(u);
    else navigate(`/utenti/${u?.id || ""}`);
  };

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
      headers: { Accept: "application/json, text/plain, */*" },
    });
    const data = await res.json();
    setUtenti(Array.isArray(data) ? data : data?.items || []);
  };

  const handleBulkAction = async () => {
    if (!selectedIds.length || bulkLoading) return;

    const actionLabel = archived ? "ripristinare" : "archiviare";
    const ok = window.confirm(
      `Vuoi ${actionLabel} ${selectedIds.length} dipendenti?`
    );
    if (!ok) return;

    try {
      setBulkLoading(true);

      const endpoint = archived
        ? `${API_BASE}/utenti/bulk/ripristina`
        : `${API_BASE}/utenti/bulk/archivia`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        },
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
      alert(e.message || "Errore durante operazione multipla");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSingleRestore = async (id) => {
    const ok = window.confirm("Vuoi ripristinare questo dipendente?");
    if (!ok) return;

    try {
      const res = await fetch(`${API_BASE}/utenti/${id}/ripristina`, {
        method: "PATCH",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
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
      alert(e.message || "Errore durante ripristino");
    }
  };

  const PaginationBar = () => (
    <div className={styles.paginationBar}>
      <div className={styles.paginationLeft}>
        <label className={styles.pageSizeLabel}>Mostra</label>
        <select
          className={styles.pageSizeSelect}
          value={pageSize}
          onChange={(e) => {
            const newSize = Number(e.target.value);
            setPage(1);
            setPageSize(newSize);
          }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <div className={styles.paginationCenter}>
        <span>Totale: {totalItems}</span>
        <span className={styles.dot}>•</span>
        <span>Mostrati {from}–{to}</span>
        <span className={styles.dot}>•</span>
        <span>
          Pagina {page} di {totalPages}
        </span>
      </div>

      <div className={styles.paginationControls}>
        <button
          className={styles.pageBtn}
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ←
        </button>

        <button
          className={styles.pageBtn}
          disabled={page === totalPages || totalItems === 0}
          onClick={() => setPage((p) => p + 1)}
        >
          →
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {archived ? "Dipendenti archiviati" : "Utenti"}
        </h1>

        <div className={styles.headerCta}>
          {!!selectedIds.length && (
            <button
              className={`btn ${archived ? "btn-secondary" : "btn-warning"} ${styles.addBtn}`}
              onClick={handleBulkAction}
              disabled={bulkLoading}
            >
              {archived ? <FiRotateCcw /> : <FiArchive />}
              {bulkLoading
                ? "Operazione in corso..."
                : archived
                ? ` Ripristina selezionati (${selectedIds.length})`
                : ` Archivia selezionati (${selectedIds.length})`}
            </button>
          )}

          {!archived && (
            <button className={`btn btn-primary ${styles.addBtn}`} onClick={goAdd}>
              <FiPlus /> Nuovo utente
            </button>
          )}
        </div>
      </div>

      <div className={styles.underline} />

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          {q === "" ? <FiSearch className={styles.searchIcon} /> : null}
          <input
            className={`input ${styles.search}`}
            placeholder="     Cerca nome, cognome, email…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className={styles.filters}>
          <select
            className="select"
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
            className="select"
            value={filterStato}
            onChange={(e) => {
              setFilterStato(e.target.value);
              setPage(1);
            }}
          >
            <option value="tutti">Tutti gli stati</option>
            <option value="attivi">Solo attivi</option>
            <option value="disattivi">Solo disattivi</option>
          </select>
        </div>
      </div>

      <div className={`card ${styles.tableCard}`}>
        {loading && <div className={styles.empty}>Caricamento…</div>}
        {error && !loading && <div className={styles.empty}>Errore: {error}</div>}

        {!loading && !error && (
          <>
            <PaginationBar />

            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th} style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>

                  <th
                    className={styles.th}
                    onClick={() => toggleSort("nome")}
                    style={{ cursor: "pointer" }}
                  >
                    Cognome / Nome{" "}
                    {sortBy === "nome" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>

                  <th
                    className={styles.th}
                    onClick={() => toggleSort("email")}
                    style={{ cursor: "pointer" }}
                  >
                    Email {sortBy === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>

                  <th
                    className={styles.th}
                    onClick={() => toggleSort("sede")}
                    style={{ cursor: "pointer" }}
                  >
                    Sede {sortBy === "sede" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>

                  <th
                    className={styles.th}
                    onClick={() => toggleSort("stato")}
                    style={{ cursor: "pointer", width: 120 }}
                  >
                    Stato {sortBy === "stato" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>

                  <th className={styles.th} style={{ width: archived ? 130 : 50 }} />
                </tr>
              </thead>

              <tbody>
                {pageItems.map((u) => {
                  const nomeCompleto = `${u?.cognome || ""} ${u?.nome || ""}`.trim();
                  const isSelected = selectedIds.includes(u.id);

                  return (
                    <tr
                      key={u?.id || nomeCompleto + u?.email}
                      className={styles.row}
                      onClick={() => handleRowClick(u)}
                    >
                      <td
                        className={styles.td}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleUserSelection(u.id)}
                        />
                      </td>

                      <td className={styles.td}>{nomeCompleto || "—"}</td>
                      <td className={styles.td}>{u?.email || "—"}</td>
                      <td className={styles.td}>{u?.sede || "—"}</td>

                      <td className={styles.td}>
                        {u?.stato_attivo ? (
                          <span className={styles.badgeOk}>
                            <FiCheckCircle /> Attivo
                          </span>
                        ) : (
                          <span className={styles.badgeNo}>
                            <FiSlash /> Non attivo
                          </span>
                        )}
                      </td>

                      <td
                        className={styles.td}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {archived ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleSingleRestore(u.id)}
                          >
                            <FiRotateCcw /> Ripristina
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}

                {!pageItems.length && (
                  <tr>
                    <td className={styles.td} colSpan={6}>
                      <div className={styles.empty}>
                        Nessun risultato con i filtri correnti.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <PaginationBar />
          </>
        )}
      </div>
    </div>
  );
}

export default UtentiTable;