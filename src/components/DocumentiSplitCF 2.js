import React, { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import { getAuth } from "firebase/auth";
import SelettoreDipendenti from "./SelettoreDipendenti";
import "./DocumentiSplitCF.css";
import { API_BASE } from "../api";

const API = API_BASE;
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
  const { data } = await Tesseract.recognize(
    dataUrl,
    "eng",
    { preserve_interword_spaces: "1" }
  );
  return detectAnyCF((data?.text || "").toUpperCase());
}

export default function DocumentiSplitCF({ tipi = [] }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [thumbs, setThumbs] = useState([]);      // [{index, dataUrl, cf?, matched?}]
  const [utenti, setUtenti] = useState([]);      // per selettore (da /utenti)
  const [utentiCF, setUtentiCF] = useState([]);  // per mapping (da /utenti/cf/all)

  const [tipoDocumento, setTipoDocumento] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [bucketMap, setBucketMap] = useState({}); // utenteId | 'unmatched' -> Set(pageIndex)
  const [loading, setLoading] = useState(false);

  // banner messaggi (success/error/info)
  const [banner, setBanner] = useState(null); // {type: 'success'|'error'|'info', text: string, ts: number}

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

  /* Carica utenti (selettore) e utentiCF (mapping certo) */
  useEffect(() => {
    fetch(`${API}/utenti`)
      .then(r => r.json())
      .then(setUtenti)
      .catch(console.error);

    fetch(`${API}/utenti/cf/all`)
      .then(r => r.json())
      .then(setUtentiCF)
      .catch(console.error);
  }, []);

  // auto-hide banner dopo 6s
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const utentiByCF = useMemo(() => {
    const m = new Map();
    utentiCF.forEach(u => {
      const cf = (u.codice_fiscale || "").toUpperCase().trim();
      if (cf.length === 16) m.set(cf, u);
    });
    return m;
  }, [utentiCF]);

  /* Reset stato quando scelgo un nuovo PDF */
  const onPickPDF = (file) => {
    setPdfFile(file || null);
    setThumbs([]);
    setBucketMap({});
    setBulkSelection(new Set());
    setViewerOpen(false);
    setViewerImg(null);
    setViewerPageIdx(null);
    setOcrProgress(null);
    setBanner(null);
  };

  /* Render pagina -> dataURL (thumb o viewer) */
  const renderPageToDataUrl = async (pdf, pageNumber, scale = 1.25, mime = "image/jpeg", quality = 0.88) => {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({ canvasContext: ctx, viewport: viewport.clone({ scale: scale * ratio }) }).promise;
    return canvas.toDataURL(mime, quality);
  };

  /* Analisi: estrazione testo + CF + anteprime; OCR fallback su unmatched */
  const estraiTestoEAnteprime = async () => {
    if (!pdfFile) return;
    if (utentiCF.length === 0) { setBanner({ type: "info", text: "Attendi il caricamento dei codici fiscali e riprova.", ts: Date.now() }); return; }

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
        pageText = textContent.items.map(it => it.str).join(" ");
      } catch { pageText = ""; }

      const cfAny = detectAnyCF(pageText);
      const thumbUrl = await renderPageToDataUrl(pdf, i);

      let matched = false;
      let bucketKey = "unmatched";
      if (cfAny) {
        const u = mapCFtoUtente(cfAny, utentiByCF);
        if (u) { matched = true; bucketKey = String(u.id); }
      }

      thumbsArr.push({ index: i - 1, dataUrl: thumbUrl, cf: cfAny || undefined, matched });

      if (!initialMap[bucketKey]) initialMap[bucketKey] = new Set();
      initialMap[bucketKey].add(i - 1);
    }

    setThumbs(thumbsArr);
    setBucketMap(initialMap);

    // PASSO 2 — OCR solo su pagine unmatched SENZA cf candidato
    const toOcr = Array.from((initialMap["unmatched"] || new Set()).values())
      .filter(p => !thumbsArr.find(t => t.index === p)?.cf)
      .sort((a, b) => a - b);

    if (toOcr.length > 0) {
      setOcrProgress({ done: 0, total: toOcr.length });
      setBanner({ type: "info", text: `Nessun CF su ${toOcr.length} pagine. Avvio OCR…`, ts: Date.now() });

      const updatedThumbs = [...thumbsArr];
      let updatedMap = { ...initialMap };

      for (let i = 0; i < toOcr.length; i++) {
        const pageIdx = toOcr[i];
        const imgUrl = updatedThumbs.find(t => t.index === pageIdx)?.dataUrl
          || await renderPageToDataUrl(pdf, pageIdx + 1, 1.4);

        const cfByOcr = await ocrDetectAnyCF(imgUrl);
        if (cfByOcr) {
          const u = mapCFtoUtente(cfByOcr, utentiByCF);
          const tIndex = updatedThumbs.findIndex(t => t.index === pageIdx);
          if (tIndex >= 0) {
            updatedThumbs[tIndex] = { ...updatedThumbs[tIndex], cf: cfByOcr, matched: !!u };
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
      setBanner({ type: "success", text: "OCR completato. Verifica e correggi se necessario.", ts: Date.now() });
      setOcrProgress(null);
    } else {
      setBanner({ type: "success", text: "Analisi completata. Controlla l'anteprima e correggi se serve.", ts: Date.now() });
    }

    setLoading(false);
  };

  /* Bucket helpers */
  const findBucketOf = (pageIdx) => {
    for (const [k, set] of Object.entries(bucketMap)) if (set.has(pageIdx)) return k;
    return null;
  };
  const movePageToBucket = (pageIndex, toKey) => {
    setBucketMap(prev => {
      const next = { ...prev };
      for (const [, set] of Object.entries(next)) set.delete(pageIndex);
      if (!next[toKey]) next[toKey] = new Set();
      next[toKey].add(pageIndex);
      return next;
    });
  };
  const bulkAssignTo = (utenteId) => {
    const toKey = String(utenteId);
    setBucketMap(prev => {
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

  /* Creazione e upload dei PDF per bucket */
  const creaPdfPer = async (sourceArrayBuffer, pageIndices) => {
    const src = await PDFDocument.load(sourceArrayBuffer);
    const dest = await PDFDocument.create();
    const copied = await dest.copyPages(src, pageIndices);
    copied.forEach(p => dest.addPage(p));
    return await dest.save();
  };

  const handleConfermaUpload = async () => {
    try {
      if (!tipoDocumento) return setBanner({ type: "info", text: "Seleziona un tipo documento.", ts: Date.now() });
      if (!pdfFile) return setBanner({ type: "info", text: "Seleziona un PDF da analizzare.", ts: Date.now() });

      const source = await pdfFile.arrayBuffer();
      const entries = Object.entries(bucketMap).filter(
        ([k, set]) => k !== "unmatched" && set && set.size > 0
      );
      if (entries.length === 0) {
        setBanner({ type: "info", text: "Nessun dipendente con pagine assegnate.", ts: Date.now() });
        return;
      }

      setLoading(true);
      setBanner({ type: "info", text: "Creo PDF e carico…", ts: Date.now() });

      // 🔐 Bearer Firebase ID Token
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        setLoading(false);
        setBanner({ type: "error", text: "Non sei autenticato. Rifai login e riprova.", ts: Date.now() });
        return;
      }

      let ok = 0;
      let fail = 0;

      for (const [utenteId, set] of entries) {
        const ids = Array.from(set).sort((a, b) => a - b);
        const pdfBytes = await creaPdfPer(source, ids);

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const fd = new FormData();
        fd.append("file", blob, `${tipoDocumento}_${utenteId}.pdf`);
        fd.append("tipo_documento", tipoDocumento);
        fd.append("utente_id", utenteId);
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
          console.error(`Upload fallito per utente ${utenteId}:`, res.status, txt);
        }
      }

      setBanner({
        type: fail ? "error" : "success",
        text: `Upload concluso: ${ok}/${entries.length} dipendenti caricati${fail ? `, ${fail} falliti (vedi console)` : ""}.`,
        ts: Date.now()
      });

      // reset contenuti caricati
      setBucketMap({});
      setThumbs([]);
      setBulkSelection(new Set());
      setViewerOpen(false);
      setViewerImg(null);
      setViewerPageIdx(null);
    } catch (e) {
      console.error(e);
      setBanner({ type: "error", text: "Errore nella creazione/caricamento dei PDF.", ts: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  /* ==== LISTA CHIAVI BUCKET ==== */
  const bucketKeyList = useMemo(() => {
    const keys = Object.keys(bucketMap);
    const numeric = keys.filter(k => k !== "unmatched").sort((a, b) => Number(a) - Number(b));
    return [...numeric, ...(keys.includes("unmatched") ? ["unmatched"] : [])];
  }, [bucketMap]);

  /* ==== HELPERS NOMI/PAGINE ==== */
  const getBucketName = (key) => {
    if (key === "unmatched") return "Non riconosciuto";
    const u = utenti.find(x => String(x.id) === String(key));
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
    await page.render({ canvasContext: ctx, viewport: viewport.clone({ scale: 1.6 * ratio }) }).promise;
    setViewerImg(canvas.toDataURL("image/jpeg", 0.92));
  };
  const closeViewer = () => { setViewerOpen(false); setViewerImg(null); setViewerPageIdx(null); };
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
      if (e.key.toLowerCase() === "a") { setAssignMode({ type: "single", pageIdx: viewerPageIdx }); setShowPicker(true); }
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen, viewerPageIdx]);

  const toggleBulk = (pageIdx) => {
    setBulkSelection(prev => {
      const next = new Set(prev);
      next.has(pageIdx) ? next.delete(pageIdx) : next.add(pageIdx);
      return next;
    });
  };
  const clearBulk = () => setBulkSelection(new Set());

  const onAssignConfirm = (ids) => {
    const utenteId = ids[0];
    if (assignMode.type === "single" && assignMode.pageIdx != null) {
      movePageToBucket(assignMode.pageIdx, String(utenteId));
    } else if (assignMode.type === "bulk") {
      bulkAssignTo(utenteId);
    }
    setShowPicker(false);
  };

  return (
    <div className="splitcf">
      <div className="doc-row">
        <label>Tipo documento</label>
        <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} required>
          <option value="">Seleziona...</option>
          {tipi.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="doc-row">
        <label>Data scadenza (opzionale)</label>
        <input type="date" value={dataScadenza} onChange={(e) => setDataScadenza(e.target.value)} />
      </div>

      <div className="doc-row">
        <label>PDF multiplo</label>
        <input type="file" accept="application/pdf" onChange={(e) => onPickPDF(e.target.files?.[0])} />
        <button className="btn-primary" onClick={estraiTestoEAnteprime} disabled={!pdfFile || loading || utentiCF.length === 0} type="button">
          {loading ? "Analizzo..." : "Analizza e propone abbinamenti"}
        </button>
      </div>

      {banner && (
        <div
          className={`banner banner-${banner.type}`}
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background: banner.type === "success" ? "#e8fff1" : banner.type === "error" ? "#ffe8e8" : "#eef3ff",
            border: `1px solid ${banner.type === "success" ? "#9ee2b1" : banner.type === "error" ? "#f3a5a5" : "#b8c7ff"}`
          }}
        >
          <span>{banner.text}</span>
          <div style={{ flex: 1 }} />
          <button className="btn-outline small" onClick={() => setBanner(null)}>Chiudi</button>
        </div>
      )}

      {ocrProgress && (
        <div className="doc-msg" style={{ marginTop: ".25rem" }}>
          OCR: {ocrProgress.done}/{ocrProgress.total} pagine…
        </div>
      )}

      {/* Toolbar massiva */}
      {thumbs.length > 0 && (
        <div className="splitcf-bulkbar">
          <span>Selezionate: {bulkSelection.size}</span>
          <div style={{ flex: 1 }} />
          <button
            className="btn-outline"
            disabled={bulkSelection.size === 0}
            onClick={() => { setAssignMode({ type: "bulk", pageIdx: null }); setShowPicker(true); }}
          >
            Assegna selezionate…
          </button>
          <button className="btn-secondary" disabled={bulkSelection.size === 0} onClick={clearBulk}>
            Svuota selezione
          </button>
        </div>
      )}

      {/* Buckets */}
      <div className="splitcf-grid">
        {bucketKeyList.map((key) => (
          <div className={`splitcf-bucket ${key === "unmatched" ? "danger" : ""}`} key={key}>
            <div className="splitcf-bucket-header">
              <h4>{getBucketName(key)}</h4>
              <span>{getBucketPages(key).length} pagine</span>
            </div>

            <div className="splitcf-pages">
              {getBucketPages(key).map((pIdx) => {
                const t = thumbs.find((x) => x.index === pIdx);
                const checked = bulkSelection.has(pIdx);
                const badgeClass = t?.matched ? "ok" : (t?.cf ? "warn" : "ko");
                const badgeText = t?.cf ? t.cf : "—";
                return (
                  <div className="splitcf-page" key={pIdx}>
                    <div className="splitcf-thumb" onClick={() => openViewer(pIdx)} role="button" title="Clic per anteprima grande">
                      {t ? <img src={t.dataUrl} alt={`Pagina ${pIdx + 1}`} /> : <div className="ph" />}
                      <span className="splitcf-pn">#{pIdx + 1}</span>
                    </div>
                    <div className="splitcf-actions">
                      <span className={`cf-badge ${badgeClass}`}>{badgeText}</span>
                      <label className="chk">
                        <input type="checkbox" checked={checked} onChange={() => toggleBulk(pIdx)} />
                        Seleziona
                      </label>
                      <button
                        className="btn-outline small"
                        onClick={() => { setAssignMode({ type: "single", pageIdx: pIdx }); setShowPicker(true); }}
                      >
                        Assegna…
                      </button>
                    </div>
                  </div>
                );
              })}
              {getBucketPages(key).length === 0 && <div className="splitcf-empty">Nessuna pagina</div>}
            </div>
          </div>
        ))}
      </div>

      {bucketKeyList.length > 0 && (
        <div className="doc-actions" style={{ marginTop: "1rem" }}>
          <button className="btn-primary" onClick={handleConfermaUpload} disabled={loading} type="button">
            {loading ? "Carico..." : "Conferma e carica per dipendente"}
          </button>
        </div>
      )}

      {/* Viewer */}
      {viewerOpen && (
        <div className="viewer-overlay" onClick={closeViewer}>
          <aside className="viewer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="viewer-header">
              <b>Pagina #{(viewerPageIdx ?? 0) + 1}</b>
              <div className="spacer" />
              <button className="btn-icon" onClick={prevPage} title="Precedente">←</button>
              <button className="btn-icon" onClick={nextPage} title="Successiva">→</button>
              <button className="btn-icon" onClick={closeViewer} title="Chiudi">✕</button>
            </div>
            <div className="viewer-body">
              {viewerImg ? <img src={viewerImg} alt="Anteprima" /> : <div className="ph" />}
            </div>
            <div className="viewer-footer">
              <div>Attuale: <b>{getBucketName(findBucketOf(viewerPageIdx)) || "-"}</b></div>
              <div className="spacer" />
              <button
                className="btn-primary"
                onClick={() => { setAssignMode({ type: "single", pageIdx: viewerPageIdx }); setShowPicker(true); }}
              >
                Assegna a…
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Selettore dipendenti */}
      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={false}
          preselectedIds={[]}
          onClose={() => setShowPicker(false)}
          onConfirm={(ids) => onAssignConfirm(ids)}
        />
      )}
    </div>
  );
}
