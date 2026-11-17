import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import styles from "./CategoriaDocumentoInput.module.css";

/**
 * Combobox per "tipo documento": testo libero (il valore NON è forzato a
 * stare nella lista) + pannello di suggerimenti filtrati dalle categorie
 * già esistenti. Componente "dumb", controllato dal chiamante.
 */
export default function CategoriaDocumentoInput({
  value,
  onChange,
  options = [],
  placeholder = "",
  id,
  name,
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = String(value || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o).toLowerCase().includes(q));
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [open, value]);

  const selectOption = (opt) => {
    onChange(opt);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex] != null) {
        e.preventDefault();
        selectOption(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={`${styles.wrap} ${className || ""}`} ref={wrapRef}>
      <div className={styles.inputRow}>
        <input
          className={`input ${styles.field}`}
          id={id}
          name={name}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <button
          type="button"
          className={styles.chevron}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          tabIndex={-1}
          aria-label="Mostra categorie esistenti"
        >
          <FiChevronDown />
        </button>
      </div>

      {open && !disabled && (
        <div className={styles.panel}>
          {filtered.length === 0 && (
            <div className={styles.empty}>Nessuna categoria esistente corrispondente</div>
          )}
          {filtered.map((opt, idx) => (
            <button
              type="button"
              key={opt}
              className={`${styles.option} ${idx === activeIndex ? styles.optionActive : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
