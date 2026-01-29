import React, { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import { getAuth } from "firebase/auth";
import SelettoreDipendenti from "./SelettoreDipendenti";
import ConfermaCaricamentoDocumenti from "./ConfermaCaricamentoDocumenti";
import styles from "./DocumentiSplitCF.module.css";

const API = "http://localhost:3001";

/* Worker pdf.js via CDN (compatibile CRA/Webpack) */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/* Pattern CF */
const CF_STRICT = /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/;
const CF_ANY16 = /[A-Z0-9]{16}/g;

/* Estrazione CF “robusta” */
function detectAnyCF(pageText) {
  if (!pageText) return null;
  const upper = pageText.toUpperCase();

  const normalized = upper.replace(/\s+/g, " ");
  let m = normalized.match(CF_STRICT);
  if (m) return m[1];

  const flat = upper.replace(/[^A-Z0-9]/g, "");
  m = flat.match(CF_STRICT);
  if (m) return m[1];

  const any = flat.match(CF_ANY16);
  return any && any.length ? any[0] : null;
}

/* Map CF -> utente (in base ai dati /utenti/cf/all) */
function mapCFtoUtente(cf, utentiByCF) {
  if (!cf) return null;
  return utentiByCF.get(cf.toUpperCase()) || null;
}

/* OCR fallback */
async function ocrDetectAnyCF(dataUrl) {
  const { data } = await Tesseract.recognize(dataUrl, "ita+eng", {
    preserve_interword_spaces: "1",
  });
  return detectAnyCF((data?.text || "").toUpperCase());
}

export default function DocumentiSplitCF({ tipi = [] }) {
  const [pdfFile, setPdfFile] = useState(null); // UNICO file sorgente da splittare
  const [thumbs, setThumbs] = useState([]);      // [{index, dataUrl, cf?, matched?}]

  // utenti
  const [utenti, setUtenti] = useState([]);      // per UI / label bucket
  const [utentiCF, setUtentiCF] = useState([]);  // per mapping (da /utenti/cf/all)

  // riferimento input file
  const inputRef = useRef(null);

  const [tipoDocumento, setTipoDocumento] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [bucketMap, setBucketMap] = useState({}); // utenteId | 'unmatched' -> Set(pageIndex)
  const [loading, setLoading] = useState(false);

  // banner messaggi
  const [banner, setBanner] = useState(null); // {type: 'success'|'error'|'info', text, ts}

  // viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPageIdx, setViewerPageIdx] = useState(null);
  const [viewerImg, setViewerImg] = useState(null);

  // selettore dipendenti
  const [showPicker, setShowPicker] = useState(false);
  const [assignMode, setAssignMode] = useState({ type: "single", pageIdx: null }); // single|bulk
  const [bulkSelection, setBulkSelection] = useState(new Set());

  // progresso OCR
  const [ocrProgress, setOcrProgress] = useState(null); // {done, total}

  const pdfRef = useRef(null);

  // drag&drop stato
  const [dragOver, setDragOver] = useState(false);

  // overlay di conferma caricamento
  const [showPreview, setShowPreview] = useState(false);

  /* Carica utenti (selettore) e utentiCF (mapping certo) */
  useEffect(() => {
    fetch(`${API}/utenti`)
      .then((r) => r.json())
      .then(setUtenti)
      .catch(console.error);

    fetch(`${API}/utenti/cf/all`)
      .then((r) => r.json())
      .then(setUtentiCF)
      .catch(console.error);
  }, []);

  // auto-hide banner
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const utentiByCF = useMemo(() => {
    const m = new Map();
    utentiCF.forEach((u) => {
      const cf = (u.codice_fiscale || "").toUpperCase().trim();
      if (cf.length === 16) m.set(cf, u);
    });
    return m;
  }, [utentiCF]);

  /* Reset stato quando scelgo un nuovo PDF */
  const onPickPDF = (file) => {
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

    if (!isPdf) {
      setBanner({
        type: "error",
        text: "Carica un file PDF valido.",
        ts: Date.now(),
      });
      return;
    }

    setPdfFile(file);
    setThumbs([]);
    setBucketMap({});
    setBulkSelection(new Set());
    setViewerOpen(false);
    setViewerImg(null);
    setViewerPageIdx(null);
    setOcrProgress(null);
    setBanner(null);

    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const first = arr[0];
    onPickPDF(first);
  };

  const renderPageToDataUrl = async (
    pdf,
    pageNumber,
    scale = 1.25,
    mime = "image/jpeg",
    quality = 0.88
  ) => {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({
      canvasContext: ctx,
      viewport: viewport.clone({ scale: scale * ratio }),
    }).promise;
    return canvas.toDataURL(mime, quality);
  };

  /* Analisi: estrazione testo + CF + anteprime; OCR fallback su unmatched */
  const estraiTestoEAnteprime = async () => {
    if (!pdfFile) {
      setBanner({
        type: "info",
        text: "Seleziona prima un PDF da analizzare.",
        ts: Date.now(),
      });
      return;
    }

    console.log("[DocumentiSplitCF] avvio analisi", {
      hasPdf: !!pdfFile,
      utentiCFLen: utentiCF.length,
    });

    if (utentiCF.length === 0) {
      setBanner({
        type: "info",
        text: "Nessun codice fiscale caricato: le pagine verranno messe in 'Non riconosciuto'.",
        ts: Date.now(),
      });
    }

    setLoading(true);
    setBanner({ type: "info", text: "Analisi PDF in corso…", ts: Date.now() });

    const arrayBuf = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
    pdfRef.current = pdf;

    const thumbsArr = [];
    const initialMap = {};

    // PASSO 1 — testo + anteprime + CF “any”
    for (let i = 1; i <= pdf.numPages; i++) {
      let pageText = "";
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        pageText = textContent.items.map((it) => it.str).join(" ");
      } catch {
        pageText = "";
      }

      const cfAny = detectAnyCF(pageText);
      const thumbUrl = await renderPageToDataUrl(pdf, i);

      let matched = false;
      let bucketKey = "unmatched";
      if (cfAny) {
        const u = mapCFtoUtente(cfAny, utentiByCF);
        if (u) {
          matched = true;
          bucketKey = String(u.id);
        }
      }

      thumbsArr.push({
        index: i - 1,
        dataUrl: thumbUrl,
        cf: cfAny || undefined,
        matched,
      });

      if (!initialMap[bucketKey]) initialMap[bucketKey] = new Set();
      initialMap[bucketKey].add(i - 1);
    }

    setThumbs(thumbsArr);
    setBucketMap(initialMap);

    // PASSO 2 — OCR su unmatched senza cf
    const toOcr = Array.from((initialMap["unmatched"] || new Set()).values())
      .filter((p) => !thumbsArr.find((t) => t.index === p)?.cf)
      .sort((a, b) => a - b);

    if (toOcr.length > 0) {
      setOcrProgress({ done: 0, total: toOcr.length });
      setBanner({
        type: "info",
        text: `Nessun CF su ${toOcr.length} pagine. Avvio OCR…`,
        ts: Date.now(),
      });

      const updatedThumbs = [...thumbsArr];
      let updatedMap = { ...initialMap };

      for (let i = 0; i < toOcr.length; i++) {
        const pageIdx = toOcr[i];
        const imgUrl =
          updatedThumbs.find((t) => t.index === pageIdx)?.dataUrl ||
          (await renderPageToDataUrl(pdf, pageIdx + 1, 1.4));

        const cfByOcr = await ocrDetectAnyCF(imgUrl);
        if (cfByOcr) {
          const u = mapCFtoUtente(cfByOcr, utentiByCF);
          const tIndex = updatedThumbs.findIndex((t) => t.index === pageIdx);
          if (tIndex >= 0) {
            updatedThumbs[tIndex] = {
              ...updatedThumbs[tIndex],
              cf: cfByOcr,
              matched: !!u,
            };
          }
          if (u) {
            for (const [, set] of Object.entries(updatedMap)) set.delete(pageIdx);
            const k = String(u.id);
            if (!updatedMap[k]) updatedMap[k] = new Set();
            updatedMap[k].add(pageIdx);
          }
        }
        setOcrProgress({ done: i + 1, total: toOcr.length });
      }

      setThumbs(updatedThumbs);
      setBucketMap(updatedMap);
      setBanner({
        type: "success",
        text: "OCR completato. Verifica e correggi se necessario.",
        ts: Date.now(),
      });
      setOcrProgress(null);
    } else {
      setBanner({
        type: "success",
        text: "Analisi completata. Controlla l'anteprima e correggi se serve.",
        ts: Date.now(),
      });
    }

    setLoading(false);
  };

  /* Bucket helpers */
  const findBucketOf = (pageIdx) => {
    if (pageIdx == null) return null;
    for (const [k, set] of Object.entries(bucketMap)) {
      if (set.has(pageIdx)) return k;
    }
    return null;
  };

  const movePageToBucket = (pageIndex, toKey) => {
    setBucketMap((prev) => {
      const next = { ...prev };
      for (const [, set] of Object.entries(next)) set.delete(pageIndex);
      if (!next[toKey]) next[toKey] = new Set();
      next[toKey].add(pageIndex);
      return next;
    });
  };

  const bulkAssignTo = (utenteId) => {
    const toKey = String(utenteId);
    setBucketMap((prev) => {
      const next = { ...prev };
      for (const [, set] of Object.entries(next)) {
        for (const p of bulkSelection) set.delete(p);
      }
      if (!next[toKey]) next[toKey] = new Set();
      for (const p of bulkSelection) next[toKey].add(p);
      return next;
    });
    setBulkSelection(new Set());
  };

  /* Creazione PDF per bucket */
  const creaPdfPer = async (sourceArrayBuffer, pageIndices) => {
    const src = await PDFDocument.load(sourceArrayBuffer);
    const dest = await PDFDocument.create();
    const copied = await dest.copyPages(src, pageIndices);
    copied.forEach((p) => dest.addPage(p));
    return await dest.save();
  };

  /* === ANTEPRIMA: items per ConfermaCaricamentoDocumenti === */
  const previewItems = useMemo(() => {
    const entries = Object.entries(bucketMap).filter(
      ([k, set]) => k !== "unmatched" && set && set.size > 0
    );

    return entries.map(([utenteId, set]) => {
      const pages = Array.from(set).sort((a, b) => a - b);

      // tutte le thumb delle pagine assegnate a questo utente
      const pageThumbs = pages.map((pIdx) => {
        const t = thumbs.find((x) => x.index === pIdx);
        return t?.dataUrl || null;
      });

      // prima thumb valida usata anche nella tabella a sinistra
      const firstThumb = pageThumbs.find((t) => !!t) || null;

      const u = utenti.find((x) => String(x.id) === String(utenteId));
      const cfFromDb =
        utentiCF.find((x) => String(x.id) === String(utenteId))?.codice_fiscale ||
        null;

      const baseName = u ? `${u.cognome} ${u.nome}` : `ID ${utenteId}`;
      const pagesLabel =
        pages.length <= 10
          ? `pagine ${pages.map((p) => p + 1).join(", ")}`
          : `${pages.length} pagine assegnate`;

      return {
        id: String(utenteId),
        name: `${baseName} – ${pagesLabel}`,
        cf: cfFromDb,
        utenteId: utenteId,
        pages,           // es. [0,1,2]
        thumbs: pageThumbs,
        thumb: firstThumb,
      };
    });
  }, [bucketMap, utenti, utentiCF, thumbs]);

  

  const handleConfermaUpload = async ({ require_signature, signature_placements } = {}) => {
    try {
      if (!tipoDocumento) {
        setBanner({
          type: "info",
          text: "Seleziona un tipo documento.",
          ts: Date.now(),
        });
        return;
      }
      if (!pdfFile) {
        setBanner({
          type: "info",
          text: "Seleziona un PDF da analizzare.",
          ts: Date.now(),
        });
        return;
      }

      const source = await pdfFile.arrayBuffer();
      const entries = Object.entries(bucketMap).filter(
        ([k, set]) => k !== "unmatched" && set && set.size > 0
      );
      if (entries.length === 0) {
        setBanner({
          type: "info",
          text: "Nessun dipendente con pagine assegnate.",
          ts: Date.now(),
        });
        return;
      }

      setLoading(true);
      setBanner({
        type: "info",
        text: "Creo PDF e carico…",
        ts: Date.now(),
      });

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        setLoading(false);
        setBanner({
          type: "error",
          text: "Non sei autenticato. Rifai login e riprova.",
          ts: Date.now(),
        });
        return;
      }

      let ok = 0;
      let fail = 0;

      for (const [utenteId, set] of entries) {
        const placementRaw = signature_placements?.[String(utenteId)] || null;
        const placement =
          placementRaw && typeof placementRaw === "object"
            ? {
                ...placementRaw,
                page: Number.isFinite(placementRaw.pageIndex)
                  ? placementRaw.pageIndex + 1
                  : placementRaw.page,
              }
            : null;

        const ids = Array.from(set).sort((a, b) => a - b);
        const pdfBytes = await creaPdfPer(source, ids);

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const fd = new FormData();
        fd.append("file", blob, `${tipoDocumento}_${utenteId}.pdf`);
        fd.append("tipo_documento", tipoDocumento);
        fd.append("utente_id", utenteId);
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

        if (res.ok) {
          ok += 1;
        } else {
          fail += 1;
          const txt = await res.text().catch(() => "");
          console.error(
            `Upload fallito per utente ${utenteId}:`,
            res.status,
            txt
          );
        }
      }

      setBanner({
        type: fail ? "error" : "success",
        text: `Upload concluso: ${ok}/${entries.length} dipendenti caricati${
          fail ? `, ${fail} falliti (vedi console)` : ""
        }.`,
        ts: Date.now(),
      });

      // reset
      setBucketMap({});
      setThumbs([]);
      setBulkSelection(new Set());
      setViewerOpen(false);
      setViewerImg(null);
      setViewerPageIdx(null);
      setPdfFile(null);
    } catch (e) {
      console.error(e);
      setBanner({
        type: "error",
        text: "Errore nella creazione/caricamento dei PDF.",
        ts: Date.now(),
      });
    } finally {
      setLoading(false);
      setShowPreview(false);
    }
  };

  // apre solo l'overlay, facendo i check base
  const openPreview = () => {
    if (!tipoDocumento) {
      setBanner({
        type: "info",
        text: "Seleziona un tipo documento.",
        ts: Date.now(),
      });
      return;
    }
    if (!pdfFile) {
      setBanner({
        type: "info",
        text: "Seleziona un PDF da analizzare.",
        ts: Date.now(),
      });
      return;
    }
    const entries = Object.entries(bucketMap).filter(
      ([k, set]) => k !== "unmatched" && set && set.size > 0
    );
    if (entries.length === 0) {
      setBanner({
        type: "info",
        text: "Nessun dipendente con pagine assegnate.",
        ts: Date.now(),
      });
      return;
    }
    setShowPreview(true);
  };

  /* ==== LISTA CHIAVI BUCKET ==== */
  const bucketKeyList = useMemo(() => {
    const keys = Object.keys(bucketMap);
    const numeric = keys
      .filter((k) => k !== "unmatched")
      .sort((a, b) => Number(a) - Number(b));
    return [...numeric, ...(keys.includes("unmatched") ? ["unmatched"] : [])];
  }, [bucketMap]);

  const getBucketName = (key) => {
    if (key === "unmatched") return "Non riconosciuto";
    const u = utenti.find((x) => String(x.id) === String(key));
    return u ? `${u.cognome} ${u.nome}` : `ID ${key}`;
  };

  const getBucketPages = (key) => {
    const set = bucketMap[key];
    if (!set) return [];
    return Array.from(set).sort((a, b) => a - b);
  };

  /* Viewer grande */
  const openViewer = async (pageIdx) => {
    if (!pdfRef.current) return;
    setViewerPageIdx(pageIdx);
    setViewerOpen(true);
    const page = await pdfRef.current.getPage(pageIdx + 1);
    const viewport = page.getViewport({ scale: 1.6 });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    await page.render({
      canvasContext: ctx,
      viewport: viewport.clone({ scale: 1.6 * ratio }),
    }).promise;
    setViewerImg(canvas.toDataURL("image/jpeg", 0.92));
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerImg(null);
    setViewerPageIdx(null);
  };

  const nextPage = () => {
    if (viewerPageIdx == null || !pdfRef.current) return;
    const max = pdfRef.current.numPages - 1;
    const n = Math.min(max, viewerPageIdx + 1);
    if (n !== viewerPageIdx) openViewer(n);
  };

  const prevPage = () => {
    if (viewerPageIdx == null || !pdfRef.current) return;
    const n = Math.max(0, viewerPageIdx - 1);
    if (n !== viewerPageIdx) openViewer(n);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!viewerOpen) return;
      if (e.key === "ArrowRight") nextPage();
      if (e.key === "ArrowLeft") prevPage();
      if (e.key.toLowerCase() === "a") {
        setAssignMode({ type: "single", pageIdx: viewerPageIdx });
        setShowPicker(true);
      }
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen, viewerPageIdx]);

  const toggleBulk = (pageIdx) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      next.has(pageIdx) ? next.delete(pageIdx) : next.add(pageIdx);
      return next;
    });
  };

  const clearBulk = () => setBulkSelection(new Set());

  const onAssignConfirm = (ids) => {
    const utenteId = ids[0];
    if (!utenteId) {
      setShowPicker(false);
      return;
    }
    if (assignMode.type === "single" && assignMode.pageIdx != null) {
      movePageToBucket(assignMode.pageIdx, String(utenteId));
    } else if (assignMode.type === "bulk") {
      bulkAssignTo(utenteId);
    }
    setShowPicker(false);
  };

  /* ===================== JSX ===================== */

  return (
    <div className={styles.wrapper}>
      {/* BLOCCO FORM PRINCIPALE */}
      <div className={styles.formGrid}>
        <div className={styles.formRow}>
          <label className={styles.label}>1. Seleziona il tipo documento</label>
          <input
            className={`input ${styles.field}`}
            list="tipi-documento-split"
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value.toUpperCase())}
            placeholder="Es. CUD, CONTRATTO, CIRCOLARE…"
            required
          />
          <datalist id="tipi-documento-split">
            {tipi.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.formRow}>
          <label className={styles.label}>
            2. Imposta data scadenza (opzionale)
          </label>
          <input
            type="date"
            className={`input ${styles.field}`}
            value={dataScadenza}
            onChange={(e) => setDataScadenza(e.target.value)}
          />
      </div>

      {/* FILE / DROPZONE */}
      <div className={styles.formRow}>
        <label className={styles.label}>3. Seleziona PDF da splittare</label>
        <div
          className={`${styles.dropzone} ${
            dragOver ? styles.dropzoneOver : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <p className={styles.dropText}>Trascina qui il PDF oppure</p>
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
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </div>
        {pdfFile && (
          <div className={styles.selectedFileInfo}>
            <span>
              File selezionato: <b>{pdfFile.name}</b>
            </span>
          </div>
        )}
      </div>

      {/* ANALISI */}
      <div className={styles.formRow}>
        <label className={styles.label}>4. Analizza e abbina</label>
        <div className={styles.dashedBox}>
          <div className={styles.actionsRow}>
            <div className={styles.actionsButtons}>
              <button
                className={`btn ${styles.primaryBtn}`}
                onClick={estraiTestoEAnteprime}
                disabled={!pdfFile || loading}
                type="button"
              >
                {loading ? "Analizzo..." : "Analizza e propone abbinamenti"}
              </button>
            </div>
          </div>
        </div>
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
            className={`btn ${styles.bannerClose}`}
            onClick={() => setBanner(null)}
            type="button"
          >
            Chiudi
          </button>
        </div>
      )}

      {ocrProgress && (
        <div className={styles.ocrMsg}>
          OCR: {ocrProgress.done}/{ocrProgress.total} pagine…
        </div>
      )}

      {/* TOOLBAR MASSIVA */}
      {thumbs.length > 0 && (
        <div className={styles.bulkBar}>
          <span>Selezionate: {bulkSelection.size}</span>
          <div className={styles.flexSpacer} />
          <button
            className={`btn ${styles.secondaryBtn}`}
            disabled={bulkSelection.size === 0}
            onClick={() => {
              setAssignMode({ type: "bulk", pageIdx: null });
              setShowPicker(true);
            }}
            type="button"
          >
            Assegna selezionate…
          </button>
          <button
            className={`btn ${styles.secondaryBtn}`}
            disabled={bulkSelection.size === 0}
            onClick={clearBulk}
            type="button"
          >
            Svuota selezione
          </button>
        </div>
      )}

      {/* BUCKETS */}
      <div className={styles.grid}>
        {bucketKeyList.map((key) => (
          <div
            className={`${styles.bucket} ${
              key === "unmatched" ? styles.bucketDanger : ""
            }`}
            key={key}
          >
            <div className={styles.bucketHeader}>
              <h4 className={styles.bucketTitle}>{getBucketName(key)}</h4>
              <span className={styles.bucketCount}>
                {getBucketPages(key).length} pagine
              </span>
            </div>

            <div className={styles.pages}>
              {getBucketPages(key).map((pIdx) => {
                const t = thumbs.find((x) => x.index === pIdx);
                const checked = bulkSelection.has(pIdx);
                const badgeClass = t?.matched
                  ? styles.cfOk
                  : t?.cf
                  ? styles.cfWarn
                  : styles.cfKo;
                const badgeText = t?.cf ? t.cf : "—";

                return (
                  <div className={styles.page} key={pIdx}>
                    <div
                      className={styles.thumb}
                      onClick={() => openViewer(pIdx)}
                      role="button"
                      title="Clic per anteprima grande"
                    >
                      {t ? (
                        <img src={t.dataUrl} alt={`Pagina ${pIdx + 1}`} />
                      ) : (
                        <div className={styles.thumbPlaceholder} />
                      )}
                      <span className={styles.pageNumber}>#{pIdx + 1}</span>
                    </div>
                    <div className={styles.pageActions}>
                      <span className={`${styles.cfBadge} ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulk(pIdx)}
                        />
                        <span>Seleziona</span>
                      </label>
                      <button
                        className={`btn ${styles.smallBtn} ${styles.secondaryBtn}`}
                        onClick={() => {
                          setAssignMode({
                            type: "single",
                            pageIdx: pIdx,
                          });
                          setShowPicker(true);
                        }}
                        type="button"
                      >
                        Assegna…
                      </button>
                    </div>
                  </div>
                );
              })}
              {getBucketPages(key).length === 0 && (
                <div className={styles.bucketEmpty}>Nessuna pagina</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA FINALE */}
      {bucketKeyList.length > 0 && (
        <div className={styles.actionsRow}>
          <button
            className={`btn ${styles.primaryBtn}`}
            onClick={openPreview}
            disabled={loading}
            type="button"
          >
            {loading ? "Carico..." : "Conferma e carica per dipendente"}
          </button>
        </div>
      )}

      {/* Viewer */}
      {viewerOpen && (
        <div className={styles.viewerOverlay} onClick={closeViewer}>
          <aside
            className={styles.viewerPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.viewerHeader}>
              <b>Pagina #{(viewerPageIdx ?? 0) + 1}</b>
              <div className={styles.flexSpacer} />
              <button
                className={styles.iconBtn}
                onClick={prevPage}
                title="Precedente"
                type="button"
              >
                ←
              </button>
              <button
                className={styles.iconBtn}
                onClick={nextPage}
                title="Successiva"
                type="button"
              >
                →
              </button>
              <button
                className={styles.iconBtn}
                onClick={closeViewer}
                title="Chiudi"
                type="button"
              >
                ✕
              </button>
            </div>
            <div className={styles.viewerBody}>
              {viewerImg ? (
                <img src={viewerImg} alt="Anteprima" />
              ) : (
                <div className={styles.viewerPlaceholder} />
              )}
            </div>
            <div className={styles.viewerFooter}>
              <div>
                Attuale:{" "}
                <b>{getBucketName(findBucketOf(viewerPageIdx)) || "-"}</b>
              </div>
              <div className={styles.flexSpacer} />
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAssignMode({
                    type: "single",
                    pageIdx: viewerPageIdx,
                  });
                  setShowPicker(true);
                }}
                type="button"
              >
                Assegna a…
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Modal conferma caricamento (riusabile) */}
      <ConfermaCaricamentoDocumenti
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={handleConfermaUpload}
        items={previewItems}
        tipoDocumento={tipoDocumento}
        dataScadenza={dataScadenza}
        assegnamentoLabel="Un PDF per ciascun dipendente con pagine assegnate"
        useCF={true}
        fallbackToSelected={false}
        utentiFull={utenti}
        loading={loading}
      />

      {/* Selettore dipendenti */}
      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={false}
          preselectedIds={[]}
          onClose={() => setShowPicker(false)}
          onConfirm={onAssignConfirm}
        />
      )}
    </div>
  );
}
