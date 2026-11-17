import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./UtentiTable.module.css";
import { FiPlus, FiSearch, FiChevronUp, FiChevronDown, FiChevronRight } from "react-icons/fi";
import Pagination from "./ui/Pagination";
import { API_BASE, getIdToken } from "../api";

async function authHeaders(extra = {}) {
  const token = await getIdToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function SediTable({
  fetchUrl = `${API_BASE}/sedi`,
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
  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={`search ${styles.searchBox}`}>
            <FiSearch size={15} />
            <input
              className="input"
              placeholder="Cerca sede"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={goAdd}>
            <FiPlus size={16} /> Nuova sede
          </button>
        </div>
      </div>

      <div className={`card ${styles.tableCard}`}>
        {loading && <div className="empty-state">Caricamento…</div>}
        {error && !loading && <div className="empty-state">Errore: {error}</div>}

        {!loading && !error && (
          <>
            <div className={styles.tableScroll}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th
                      className={styles.sortable}
                      onClick={() => toggleSort("nome")}
                      aria-sort={sortBy === "nome" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <span className={styles.thInner}>
                        Nome sede
                        {sortBy === "nome" ? (sortDir === "asc" ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />) : null}
                      </span>
                    </th>
                    <th style={{ width: 48 }} aria-label="Apri" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => (
                    <tr
                      key={s?.id || s?.nome}
                      className={styles.row}
                      onClick={() => handleRowClick(s)}
                    >
                      <td className="cell-strong">{s?.nome || "—"}</td>
                      <td className={styles.chevronCell}><FiChevronRight size={16} /></td>
                    </tr>
                  ))}
                  {!pageItems.length && (
                    <tr>
                      <td colSpan={2}>
                        <div className="empty-state">Nessuna sede trovata.</div>
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
              itemLabel="sedi"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default SediTable;
