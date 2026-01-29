import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtentiTable.module.css";
import { FiPlus, FiSearch } from "react-icons/fi";

function SediTable({
  fetchUrl = "http://localhost:3001/sedi",
  onAddSede,
  onRowClick,
}) {
  const navigate = useNavigate();

  // dati
  const [sedi, setSedi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("nome"); // per estensioni future
  const [sortDir, setSortDir] = useState("asc");

  // paginazione
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  // fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(fetchUrl, {
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
        if (alive) setSedi(Array.isArray(data) ? data : (data?.items || []));
      } catch (e) {
        if (alive) setError(e.message || "Errore di caricamento");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchUrl]);

  // filtro + sort
  const filtered = useMemo(() => {
    const QQ = q.trim().toLowerCase();
    let out = sedi.filter((s) => {
      const nome = (s?.nome || "").toLowerCase();
      if (QQ && !nome.includes(QQ)) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const m = (v) => (v ?? "").toString().toLowerCase();
      switch (sortBy) {
        case "nome":
        default:
          return m(a.nome).localeCompare(m(b.nome)) * dir;
      }
    });

    return out;
  }, [sedi, q, sortBy, sortDir]);

  // paginazione derivata
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, page * pageSize);

  const toggleSort = (key) => {
    if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const goAdd = () => {
    if (typeof onAddSede === "function") onAddSede();
    else navigate("/sedi/nuova"); // futura route, oppure la cambi tu
  };

  const handleRowClick = (s) => {
    if (typeof onRowClick === "function") onRowClick(s);
    else navigate(`/sedi/${s?.id || ""}`); // idem sopra
  };

  // barra di paginazione riusata
  const PaginationBar = () => (
    <div className={styles.paginationBar}>
      {/* SELECT PER PAGINA */}
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

      {/* INFO CENTRATE */}
      <div className={styles.paginationCenter}>
        <span>Totale: {totalItems}</span>
        <span className={styles.dot}>•</span>
        <span>Mostrati {from}–{to}</span>
        <span className={styles.dot}>•</span>
        <span>
          Pagina {page} di {totalPages}
        </span>
      </div>

      {/* FRECCE A DESTRA */}
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
      {/* Header: titolo a sx, CTA a dx */}
      <div className={styles.header}>
        <h1 className={styles.title}>Sedi</h1>
        <div className={styles.headerCta}>
          <button className={`btn btn-primary ${styles.addBtn}`} onClick={goAdd}>
            <FiPlus /> Nuova sede
          </button>
        </div>
      </div>

      <div className={styles.underline} />

      {/* Toolbar: solo search */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          {q === "" ? <FiSearch className={styles.searchIcon} /> : null}
          <input
            className={`input ${styles.search}`}
            placeholder="     Cerca sede…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* Nessun filtro a dx per ora */}
        <div className={styles.filters} />
      </div>

      {/* Tabella in card */}
      <div className={`card ${styles.tableCard}`}>
        {loading && <div className={styles.empty}>Caricamento…</div>}
        {error && !loading && <div className={styles.empty}>Errore: {error}</div>}

        {!loading && !error && (
          <>
            <PaginationBar />

            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th
                    className={styles.th}
                    onClick={() => toggleSort("nome")}
                    style={{ cursor: "pointer" }}
                  >
                    Nome sede{" "}
                    {sortBy === "nome" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className={styles.th} style={{ width: 50 }}>
                    {" "}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((s) => (
                  <tr
                    key={s?.id || s?.nome}
                    className={styles.row}
                    onClick={() => handleRowClick(s)}
                  >
                    <td className={styles.td}>{s?.nome || "—"}</td>
                    <td
                      className={styles.td}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {/* azioni future */}
                    </td>
                  </tr>
                ))}
                {!pageItems.length && (
                  <tr>
                    <td className={styles.td} colSpan={2}>
                      <div className={styles.empty}>
                        Nessuna sede trovata con i filtri correnti.
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

export default SediTable;
