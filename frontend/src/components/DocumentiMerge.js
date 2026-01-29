import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import SelettoreDipendenti from "./SelettoreDipendenti";
import ConfermaCaricamentoDocumenti from "./ConfermaCaricamentoDocumenti";
import styles from "./DocumentiMerge.module.css";

const API = "http://localhost:3001";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

async function renderPdfPageFromPdfToDataUrl(pdf, pageNo = 1, scale = 1.1) {
  const safePage = Math.min(Math.max(1, pageNo), pdf.numPages);
  const page = await pdf.getPage(safePage);
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  await page
    .render({
      canvasContext: ctx,
      viewport: viewport.clone({ scale: scale * ratio }),
    })
    .promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function renderAllPdfPagesToThumbsFromBytes(bytes, scale = 1.05) {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const thumbs = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    thumbs.push(await renderPdfPageFromPdfToDataUrl(pdf, p, scale));
  }
  return thumbs;
}
export default function DocumentiMerge({ tipi = [] }) {
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");

  // files + ordine
  const [files, setFiles] = useState([]); // [{key,name,file}]
  const [order, setOrder] = useState([]); // array di indici (0..N-1)
  const inputRef = useRef(null);

  // assegnazione
  const [assegnaMode, setAssegnaMode] = useState("some"); // 'one' | 'some' | 'all'
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPicker, setShowPicker] = useState(false);

  // utenti
  const [utenti, setUtenti] = useState([]);

  // ui
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState(null); // {type, text}

  // overlay conferma caricamento
  const [showPreview, setShowPreview] = useState(false);
  const [previewPreparing, setPreviewPreparing] = useState(false);
  const [mergedThumbs, setMergedThumbs] = useState([]);

  useEffect(() => {
    fetch(`${API}/utenti`)
      .then((r) => r.json())
      .then(setUtenti)
      .catch(console.error);
  }, []);

  const utentiById = useMemo(() => {
    const m = new Map();
    utenti.forEach((u) => m.set(String(u.id), u));
    return m;
  }, [utenti]);

  const selectedUsers = useMemo(
    () =>
      selectedIds
        .map((id) => utentiById.get(String(id)))
        .filter(Boolean),
    [selectedIds, utentiById]
  );

  /* ---------- DEDUP FILES + DROP/PICKER ---------- */

  const stableKey = (f) => `${f.name}::${f.size}`;

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(
      (f) => f.type === "application/pdf"
    );
    if (incoming.length === 0) return;

    const batchMap = new Map();
    incoming.forEach((f) => {
      const k = stableKey(f);
      if (!batchMap.has(k)) batchMap.set(k, f);
    });

    setFiles((prev) => {
      const existing = new Set(prev.map((x) => x.key));
      const toAdd = [];
      for (const [k, f] of batchMap.entries()) {
        if (!existing.has(k)) toAdd.push({ key: k, name: f.name, file: f });
      }
      const skipped = batchMap.size - toAdd.length;
      if (skipped > 0)
        setBanner({
          type: "info",
          text: `Saltati ${skipped} duplicati già presenti.`,
        });
      else setBanner(null);

      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });

    if (inputRef.current) inputRef.current.value = "";
  }

  function onPickFiles(e) {
    addFiles(e.target.files);
  }

  const [dragOver, setDragOver] = useState(false);
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  /* ---------- KEEP ORDER IN SYNC ---------- */
  useEffect(() => {
    setOrder((prev) => {
      const max = files.length - 1;
      const seen = new Set();
      const clean = [];
      for (const i of prev) {
        if (
          Number.isInteger(i) &&
          i >= 0 &&
          i <= max &&
          !seen.has(i)
        ) {
          clean.push(i);
          seen.add(i);
        }
      }
      for (let i = 0; i <= max; i++) {
        if (!seen.has(i)) clean.push(i);
      }
      return clean;
    });
  }, [files]);

  /* ---------- UTILS ORDINE ---------- */
  function moveUp(idx) {
    setOrder((prev) => {
      const arr = [...prev];
      const pos = arr.indexOf(idx);
      if (pos > 0) [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
      return arr;
    });
  }
  function moveDown(idx) {
    setOrder((prev) => {
      const arr = [...prev];
      const pos = arr.indexOf(idx);
      if (pos >= 0 && pos < arr.length - 1)
        [arr[pos + 1], arr[pos]] = [arr[pos], arr[pos + 1]];
      return arr;
    });
  }
  function removeFile(idx) {
    setFiles((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
  }
  function clearAll() {
    setFiles([]);
    setOrder([]);
    setBanner(null);
  }

  const orderedFiles = useMemo(
    () => order.map((i) => files[i]).filter(Boolean),
    [order, files]
  );

  /* ---------- MERGE + UPLOAD ---------- */
  async function mergePdfBytes(fileObjsInOrder) {
    const out = await PDFDocument.create();
    for (const fo of fileObjsInOrder) {
      const bytes = await fo.file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const copied = await out.copyPages(pdf, pdf.getPageIndices());
      copied.forEach((p) => out.addPage(p));
    }
    return await out.save();
  }

  // calcola i target in base a assegnazione + selezioni
  const computeTargetIds = () => {
    let targetIds = [];
    if (assegnaMode === "all") {
      targetIds = utenti
        .filter((u) => u.stato_attivo)
        .map((u) => String(u.id));
    } else {
      if (selectedIds.length === 0) return [];
      targetIds = Array.from(new Set(selectedIds.map(String)));
    }
    return targetIds;
  };

  // riepilogo testo assegnazione (per modale)
  const targetSummary = useMemo(() => {
    if (assegnaMode === "all") {
      const count = utenti.filter((u) => u.stato_attivo).length;
      return count
        ? `Tutti i dipendenti attivi (${count})`
        : "Tutti i dipendenti attivi";
    }
    if (assegnaMode === "one") {
      if (selectedUsers[0])
        return `${selectedUsers[0].cognome} ${selectedUsers[0].nome}`;
      return "Nessun dipendente selezionato";
    }
    if (assegnaMode === "some") {
      if (selectedUsers.length === 0) return "Nessun dipendente selezionato";
      if (selectedUsers.length <= 3)
        return selectedUsers
          .map((u) => `${u.cognome} ${u.nome}`)
          .join(", ");
      return `${selectedUsers.length} dipendenti selezionati`;
    }
    return "Nessun target definito";
  }, [assegnaMode, selectedUsers, utenti]);

  // item per la modale di conferma: una riga per ogni dipendente destinatario
  const previewItems = useMemo(() => {
    const targetIds = computeTargetIds();
    return targetIds.map((uid) => {
      const u = utentiById.get(String(uid));
      return {
        id: String(uid),
        utenteId: String(uid),
        name: u ? `${u.cognome} ${u.nome}` : `ID ${uid}`,
        cf: u?.codice_fiscale || null,
        thumbs: mergedThumbs,
        thumb: mergedThumbs[0] || null,
      };
    });
  }, [assegnaMode, selectedIds, utentiById, mergedThumbs]);

  async function handleConfermaUpload({ require_signature, signature_placements } = {}) {
    try {
      if (!tipoDocumento) {
        setBanner({
          type: "info",
          text: "Seleziona il tipo documento.",
        });
        return;
      }
      if (orderedFiles.length < 1) {
        setBanner({
          type: "info",
          text: "Seleziona uno o più PDF da unire.",
        });
        return;
      }

      const targetIds = computeTargetIds();
      if (targetIds.length === 0) {
        setBanner({
          type: "info",
          text: "Seleziona almeno un dipendente.",
        });
        return;
      }

      setLoading(true);
      setBanner({
        type: "info",
        text: "Creo il PDF unito e carico…",
      });

      const mergedBytes = await mergePdfBytes(orderedFiles);
      const mergedBlob = new Blob([mergedBytes], {
        type: "application/pdf",
      });

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        setLoading(false);
        setBanner({
          type: "error",
          text: "Non sei autenticato. Rifai login.",
        });
        return;
      }

      let ok = 0;
      for (const uid of targetIds) {
        const placementRaw = signature_placements?.[String(uid)] || null;
        const placement =
          placementRaw && typeof placementRaw === "object"
            ? {
                ...placementRaw,
                page: Number.isFinite(placementRaw.pageIndex)
                  ? placementRaw.pageIndex + 1
                  : placementRaw.page,
              }
            : null;

        const fd = new FormData();
        fd.append(
          "file",
          mergedBlob,
          `${tipoDocumento}_merged_${uid}.pdf`
        );
        fd.append("tipo_documento", tipoDocumento);
        fd.append("utente_id", uid);
        fd.append("require_signature", require_signature ? "true" : "false");
        if (placement) {
          fd.append("signature_placement", JSON.stringify(placement));
        }
        if (dataScadenza) fd.append("data_scadenza", dataScadenza);

        const res = await fetch(`${API}/documenti/upload`, {
          method: "POST",
          body: fd,
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) ok += 1;
        else
          console.error(
            "Upload fallito per utente",
            uid,
            await res.text().catch(() => "")
          );
      }

      setBanner({
        type: ok === targetIds.length ? "success" : "error",
        text:
          ok === targetIds.length
            ? `Merge caricato: ${ok}/${targetIds.length} assegnazioni completate.`
            : `Completato con errori: ${ok}/${targetIds.length} assegnazioni (vedi console).`,
      });
    } catch (e) {
      console.error(e);
      setBanner({
        type: "error",
        text: "Errore durante merge o upload.",
      });
    } finally {
      setLoading(false);
      setShowPreview(false);
    }
  }

  // apre solo la modale di conferma, facendo i check base
  async function openPreview() {
    if (!tipoDocumento) {
      setBanner({
        type: "info",
        text: "Seleziona il tipo documento.",
      });
      return;
    }
    if (orderedFiles.length < 1) {
      setBanner({
        type: "info",
        text: "Seleziona uno o più PDF da unire.",
      });
      return;
    }
    const targetIds = computeTargetIds();
    if (targetIds.length === 0) {
      setBanner({
        type: "info",
        text: "Seleziona almeno un dipendente.",
      });
      return;
    }
    if (previewPreparing) return;
    setPreviewPreparing(true);
    setBanner({ type: "info", text: "Genero anteprime pagine…" });
    try {
      const mergedBytes = await mergePdfBytes(orderedFiles);
      const thumbs = await renderAllPdfPagesToThumbsFromBytes(mergedBytes, 1.05);
      setMergedThumbs(thumbs);
      setShowPreview(true);
      setBanner(null);
    } catch (e) {
      console.error("Anteprime merge fallite:", e);
      setMergedThumbs([]);
      setBanner({ type: "error", text: "Errore durante la generazione anteprime." });
      setShowPreview(true);
    } finally {
      setPreviewPreparing(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* FORM: tipo + scadenza */}
      <div className={styles.formRow}>
        <label className={styles.label}>1. Seleziona il tipo documento</label>
        <div className={styles.formRow}>
          <input
            className={`input ${styles.field}`}
            list="tipi-documento-merge"
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value.toUpperCase())}
            placeholder="Es. CUD, CONTRATTO, CIRCOLARE…"
            required
          />
          <datalist id="tipi-documento-merge">
            {tipi.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.formRow}>
        <label className={styles.label}>2. Imposta data scadenza (opzionale)</label>
        <input
          type="date"
          className={`input ${styles.field}`}
          value={dataScadenza}
          onChange={(e) => setDataScadenza(e.target.value)}
        />
      </div>

      {/* DROPZONE PDF */}
      <div className={styles.formRow}>
        <label className={styles.label}>3. Seleziona file da unire</label>
        <div
          className={`${styles.dropzone} ${
            dragOver ? styles.dropzoneOver : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className={styles.dropText}>
            Trascina qui i PDF oppure
          </p>
          <button
            type="button"
            className={`btn ${styles.secondaryBtn}`}
            onClick={() => inputRef.current?.click()}
          >
            Scegli file…
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={onPickFiles}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {/* ORDINE FILE */}
      {files.length > 0 && (
        <div className={styles.orderBox}>
          <div className={styles.orderTitle}>
            <span>
              Ordine{" "}
              <span className={styles.muted}>
                ({files.length} file)
              </span>
            </span>
            <div className={styles.orderTitleActions}>
              <button
                className={`btn ${styles.secondaryBtn} ${styles.smallBtn}`}
                onClick={() => inputRef.current?.click()}
              >
                Aggiungi altri…
              </button>
              <button
                className={`btn ${styles.secondaryBtn} ${styles.smallBtn}`}
                onClick={clearAll}
              >
                Svuota
              </button>
            </div>
          </div>

          <ul className={styles.orderList}>
            {order.map((idx) => (
              <li
                key={files[idx]?.key || idx}
                className={styles.orderItem}
              >
                <span
                  className={styles.fileName}
                  title={files[idx]?.name}
                >
                  {files[idx]?.name}
                </span>
                <div className={styles.orderBtns}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => moveUp(idx)}
                    title="Su"
                  >
                    ↑
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={() => moveDown(idx)}
                    title="Giù"
                  >
                    ↓
                  </button>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => removeFile(idx)}
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ASSEGNA A */}
      <div className={styles.formRow}>
        <label className={styles.label}>4. Assegna a</label>
        <fieldset className={styles.assignBox}>
          <div className={styles.assignRadios}>
            <label className={styles.radio}>
              <input
                type="radio"
                name="assign"
                checked={assegnaMode === "one"}
                onChange={() => {
                  setAssegnaMode("one");
                  setSelectedIds((p) => p.slice(0, 1));
                }}
              />
              <span>Un dipendente</span>
            </label>

            <label className={styles.radio}>
              <input
                type="radio"
                name="assign"
                checked={assegnaMode === "some"}
                onChange={() => setAssegnaMode("some")}
              />
              <span>Alcuni dipendenti</span>
            </label>

            <label className={styles.radio}>
              <input
                type="radio"
                name="assign"
                checked={assegnaMode === "all"}
                onChange={() => setAssegnaMode("all")}
              />
              <span>Tutti (attivi)</span>
            </label>
          </div>

          {(assegnaMode === "one" || assegnaMode === "some") && (
            <div className={styles.assignBottom}>
              <button
                type="button"
                className={`btn ${styles.secondaryBtn}`}
                onClick={() => setShowPicker(true)}
              >
                Cerca e seleziona dipendenti
              </button>

              <div className={styles.chips}>
                {selectedUsers.map((u) => (
                  <span
                    className={styles.chip}
                    key={u.id}
                    title={`${u.cognome} ${u.nome}`}
                  >
                    {u.cognome} {u.nome}
                    <button
                      className={styles.chipRemove}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.filter(
                            (id) => String(id) !== String(u.id)
                          )
                        )
                      }
                      title="Rimuovi"
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedUsers.length === 0 && (
                  <span className={styles.chipHint}>
                    Nessuno selezionato
                  </span>
                )}
              </div>
            </div>
          )}
        </fieldset>
      </div>

      {/* BANNER */}
      {banner && (
        <div
          className={`${styles.banner} ${
            banner.type === "success"
              ? styles.bannerSuccess
              : banner.type === "error"
              ? styles.bannerError
              : styles.bannerInfo
          }`}
        >
          <span>{banner.text}</span>
          <button
            className={`btn ${styles.smallBtn} ${styles.secondaryBtn}`}
            onClick={() => setBanner(null)}
            type="button"
          >
            Chiudi
          </button>
        </div>
      )}

      {/* CTA FINALE */}
      <div className={styles.actionsRow}>
        <button
          className={` btn-primary ${styles.primaryBtn}`}
          disabled={loading || previewPreparing}
          onClick={openPreview}
          type="button"
        >
          {loading ? "Unisco e carico…" : previewPreparing ? "Preparo anteprime…" : "Unisci e carica"}
        </button>
      </div>

      {/* Modal conferma caricamento (riusabile) */}
      <ConfermaCaricamentoDocumenti
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={handleConfermaUpload}
        items={previewItems}
        tipoDocumento={tipoDocumento}
        dataScadenza={dataScadenza}
        assegnamentoLabel={targetSummary}
        useCF={false}
        fallbackToSelected={false}
        utentiFull={utenti}
        loading={loading}
      />

      {/* Selettore dipendenti */}
      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={assegnaMode !== "one"}
          preselectedIds={selectedIds}
          onClose={() => setShowPicker(false)}
          onConfirm={(ids) => {
            if (assegnaMode === "one") setSelectedIds(ids.slice(0, 1));
            else {
              const all = new Set([
                ...selectedIds.map(String),
                ...(ids || []).map(String),
              ]);
              setSelectedIds(Array.from(all));
            }
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}
