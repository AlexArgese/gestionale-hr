import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './Pagination.module.css';

/**
 * Barra di paginazione standard del gestionale.
 * Va messa in fondo a una card/tabella.
 */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemLabel = 'risultati',
}) {
  const safeTotalPages = Math.max(totalPages || 1, 1);
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {onPageSizeChange && (
          <label className={styles.size}>
            Righe per pagina
            <select
              className="select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className={styles.right}>
        <span className={styles.info}>
          {from}–{to} di {totalItems} {itemLabel}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm btn-icon"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          aria-label="Pagina precedente"
        >
          <FiChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm btn-icon"
          onClick={() => onPageChange(Math.min(page + 1, safeTotalPages))}
          disabled={page >= safeTotalPages || totalItems === 0}
          aria-label="Pagina successiva"
        >
          <FiChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
