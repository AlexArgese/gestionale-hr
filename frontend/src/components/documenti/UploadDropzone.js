import React, { useState } from "react";
import styles from "./UploadDropzone.module.css";

/**
 * Contenitore unico per lo step "seleziona file": superficie drag&drop che,
 * vuota, mostra il prompt grande con bottone "Scegli file…"; con file
 * presenti, si riduce a una fascia sottile sopra il contenuto fornito dal
 * chiamante via children — mai due box separati per lo stesso step.
 * L'intero box resta drop-target in entrambi gli stati.
 *
 * Nessuna logica di business: il parent possiede inputRef, onFiles e lo
 * stato sui file.
 */
export default function UploadDropzone({
  inputRef,
  onFiles,
  accept,
  multiple = false,
  isEmpty,
  promptText,
  browseLabel = "Scegli file…",
  condensedLabel = "+ Aggiungi altri file",
  className,
  children,
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    onFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`${styles.box} ${dragOver ? styles.boxOver : ""} ${className || ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {isEmpty ? (
        <div className={styles.prompt}>
          <p className={styles.promptText}>{promptText}</p>
          <button
            type="button"
            className={`btn ${styles.browseBtn}`}
            onClick={() => inputRef.current?.click()}
          >
            {browseLabel}
          </button>
        </div>
      ) : (
        <>
          <div className={styles.condensedBar}>
            <button
              type="button"
              className={styles.condensedTrigger}
              onClick={() => inputRef.current?.click()}
            >
              {condensedLabel}
            </button>
          </div>
          <div className={styles.content}>{children}</div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onFiles(e.target.files)}
        style={{ display: "none" }}
      />
    </div>
  );
}
