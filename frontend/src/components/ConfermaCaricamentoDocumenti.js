import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./ConfermaCaricamentoDocumenti.module.css";

/* posizioni di default dei riquadri, in FRAZIONI 0..1 della pagina — sfalsate per non sovrapporsi */
const DEFAULT_SIG = { xPct: 0.12, yPct: 0.62, wPct: 0.34, hPct: 0.09 };
const DEFAULT_HEADER = { xPct: 0.09, yPct: 0.055, wPct: 0.5, hPct: 0.035 };
const DEFAULT_DATE = { xPct: 0.09, yPct: 0.11, wPct: 0.22, hPct: 0.035 };

const LAYERS = {
  signature: { accent: "#0f172a", label: "FIRMA", def: DEFAULT_SIG, minW: 80, minH: 40 },
  header: { accent: "#2563eb", label: "INTESTAZIONE", def: DEFAULT_HEADER, minW: 40, minH: 16 },
  date: { accent: "#d97706", label: "DATA", def: DEFAULT_DATE, minW: 40, minH: 16 },
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const mkPlacement = (def, pageIndex) => ({ ...def, pageIndex });

function todayIt(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function ConfermaCaricamentoDocumenti({
  open,
  onClose,
  items = [],
  onConfirm,
  tipoDocumento,
  dataScadenza,
  loading = false,
  title = "Conferma caricamento documenti",
  customFileNames = {},
  setCustomFileNames,
  assegnamentoLabel,
  useCF = false,
  fallbackToSelected = false,
  utentiFull = [],
  // capabilità: Split/Merge supportano solo la firma lato server
  allowSignature = true,
  allowStamps = true,
  allowAppendNames = true,
  allowEmailText = true,
}) {
  /* ---------- normalizzazione items ---------- */
  const filesInfo = useMemo(() => {
    return (items || []).map((it) => {
      const u = it.utenteId
        ? utentiFull.find((x) => String(x.id) === String(it.utenteId))
        : null;

      let destLabel = "";
      if (useCF && u) destLabel = `${u.cognome} ${u.nome} (da CF)`;
      else if (!useCF || (useCF && !u && fallbackToSelected))
        destLabel = assegnamentoLabel || "Selezione corrente";
      else destLabel = "Nessun target (verrà saltato)";

      const thumbsList = Array.isArray(it.thumbs) ? it.thumbs : [];
      const thumb = it.thumb || it.preview || it.thumbDataUrl || thumbsList[0] || null;

      return {
        id: it.id,
        name: it.name || "Documento",
        cf: it.cf || null,
        utenteId: it.utenteId || null,
        matchedName: u ? `${u.nome} ${u.cognome}`.trim() : null,
        destLabel,
        thumb,
        thumbs: thumbsList,
        fileName: it.fileName || "",
        defaultFileName: it.defaultFileName || "",
      };
    });
  }, [items, utentiFull, useCF, fallbackToSelected, assegnamentoLabel]);

  const totaleFile = filesInfo.length;

  /* ---------- file + pagina attivi ---------- */
  const [activeId, setActiveId] = useState(null);
  const [activePageIdx, setActivePageIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActiveId(filesInfo.length ? filesInfo[0].id : null);
    setActivePageIdx(0);
  }, [open, filesInfo]);

  const activeFile = useMemo(
    () => filesInfo.find((f) => f.id === activeId) || filesInfo[0] || null,
    [filesInfo, activeId]
  );

  const activeThumbs = useMemo(() => {
    if (!activeFile) return [];
    if (Array.isArray(activeFile.thumbs) && activeFile.thumbs.length) return activeFile.thumbs;
    if (activeFile.thumb) return [activeFile.thumb];
    return [];
  }, [activeFile]);

  const pageCount = activeThumbs.length;
  const currentThumb = pageCount
    ? activeThumbs[Math.min(activePageIdx, pageCount - 1)]
    : null;

  useEffect(() => {
    if (!open) return;
    setActivePageIdx(0);
  }, [open, activeId]);

  /* ---------- stato elementi ---------- */
  const [requireSignature, setRequireSignature] = useState(false);
  const [addHeader, setAddHeader] = useState(false);
  const [addDate, setAddDate] = useState(false);
  const [appendNames, setAppendNames] = useState(false);
  const [activeLayer, setActiveLayer] = useState(null); // 'signature' | 'header' | 'date'

  // email di notifica ai dipendenti (vuoti = testo preimpostato)
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [signaturePlacements, setSignaturePlacements] = useState({});
  const [headerPlacements, setHeaderPlacements] = useState({});
  const [datePlacements, setDatePlacements] = useState({});

  const setters = useMemo(
    () => ({
      signature: setSignaturePlacements,
      header: setHeaderPlacements,
      date: setDatePlacements,
    }),
    []
  );
  const enabledOf = {
    signature: requireSignature,
    header: addHeader,
    date: addDate,
  };
  const setEnabledOf = {
    signature: setRequireSignature,
    header: setAddHeader,
    date: setAddDate,
  };

  /* ---------- reset alla chiusura ---------- */
  useEffect(() => {
    if (open) return;
    setRequireSignature(false);
    setAddHeader(false);
    setAddDate(false);
    setAppendNames(false);
    setActiveLayer(null);
    setSignaturePlacements({});
    setHeaderPlacements({});
    setDatePlacements({});
    setEmailSubject("");
    setEmailBody("");
  }, [open]);

  /* ---------- preview refs + zoom ---------- */
  const previewWrapRef = useRef(null);
  const stageRef = useRef(null);
  const previewImgRef = useRef(null);
  const [imageReady, setImageReady] = useState(false);
  const lastWheelTsRef = useRef(0);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 5;
  const [zoom, setZoom] = useState(1); // 1 = "adatta"
  const [fit, setFit] = useState({ w: 0, h: 0 }); // px alla scala "adatta"

  const setZoomClamped = useCallback(
    (updater) =>
      setZoom((z) => {
        const next = typeof updater === "function" ? updater(z) : updater;
        return clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX);
      }),
    []
  );

  const recomputeFit = useCallback(() => {
    const wrap = previewWrapRef.current;
    const img = previewImgRef.current;
    if (!wrap || !img || !img.naturalWidth || !img.naturalHeight) return;
    const availW = wrap.clientWidth - 36; // .canvas padding 18*2
    const availH = wrap.clientHeight - 36;
    if (availW < 80 || availH < 80) return; // layout non ancora assestato
    const ratio = img.naturalWidth / img.naturalHeight;
    const w = Math.min(availW, availH * ratio);
    const h = w / ratio;
    if (w > 0 && h > 0) {
      setFit((prev) =>
        Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1
          ? prev
          : { w: Math.round(w), h: Math.round(h) }
      );
    }
  }, []);

  useEffect(() => {
    setImageReady(false);
    setFit({ w: 0, h: 0 }); // ricalcolato appena l'anteprima è pronta
  }, [currentThumb, activeId, activePageIdx]);

  // calcola la scala "adatta" quando l'immagine è pronta (anche se già in cache: onLoad non scatta)
  useEffect(() => {
    if (!open || !currentThumb) return;
    let raf = 0;
    const tryFit = () => {
      const img = previewImgRef.current;
      if (img && img.complete && img.naturalWidth && img.naturalHeight) {
        recomputeFit();
        setImageReady(true);
      } else {
        raf = requestAnimationFrame(tryFit);
      }
    };
    tryFit();
    return () => cancelAnimationFrame(raf);
  }, [open, currentThumb, recomputeFit]);

  // ri-adatta l'anteprima a ogni variazione reale dell'area disponibile
  // (apertura modale, layout che si assesta, resize finestra, cambio pagina)
  useLayoutEffect(() => {
    if (!open) return;
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recomputeFit);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [open, currentThumb, recomputeFit]);

  // reset zoom quando cambio file/pagina o chiudo
  useEffect(() => {
    setZoom(1);
  }, [activeId, activePageIdx, open]);

  // zoom con Ctrl/⌘ + rotella (listener non-passivo per poter usare preventDefault)
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || !open) return;
    const onWheelZoom = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoomClamped((z) => z * (e.deltaY > 0 ? 0.9 : 1.1));
    };
    el.addEventListener("wheel", onWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", onWheelZoom);
  }, [open, currentThumb, setZoomClamped]);

  const stageW = Math.round(fit.w * zoom);
  const stageH = Math.round(fit.h * zoom);

  /* ---------- init di un layer quando lo attivo (crea se manca; NON sposta di pagina) ---------- */
  const ensureLayer = useCallback(
    (name) => {
      if (!activeFile?.id) return;
      const key = String(activeFile.id);
      setters[name]((prev) =>
        prev[key] ? prev : { ...prev, [key]: mkPlacement(LAYERS[name].def, activePageIdx) }
      );
    },
    [activeFile?.id, activePageIdx, setters]
  );

  useEffect(() => {
    if (open && requireSignature) ensureLayer("signature");
  }, [open, requireSignature, ensureLayer]);
  useEffect(() => {
    if (open && addHeader) ensureLayer("header");
  }, [open, addHeader, ensureLayer]);
  useEffect(() => {
    if (open && addDate) ensureLayer("date");
  }, [open, addDate, ensureLayer]);

  /* ---------- fissa pageW/pageH + percentuali quando l'anteprima è pronta ---------- */
  const patchSize = useCallback(
    (name) => {
      const r = previewImgRef.current?.getBoundingClientRect();
      if (!r || !r.width || !r.height || !activeFile?.id) return;
      const key = String(activeFile.id);
      const pageW = Math.round(r.width);
      const pageH = Math.round(r.height);
      setters[name]((prev) => {
        const p = prev[key];
        if (!p || p.pageIndex !== activePageIdx) return prev; // solo il layer sulla pagina visibile
        const next = { ...p, pageW, pageH };
        if (Number.isFinite(p.xPct)) {
          // riallinea i px alla dimensione corrente dell'anteprima (cambio file/pagina/resize)
          next.x = Math.round(clamp(p.xPct, 0, 1) * pageW);
          next.y = Math.round(clamp(p.yPct, 0, 1) * pageH);
          if (Number.isFinite(p.wPct)) next.width = Math.round(p.wPct * pageW);
          if (Number.isFinite(p.hPct)) next.height = Math.round(p.hPct * pageH);
        } else if (Number.isFinite(p.x)) {
          next.xPct = clamp(p.x / pageW, 0, 1);
          next.yPct = clamp(p.y / pageH, 0, 1);
          next.wPct = (p.width ?? 0) / pageW;
          next.hPct = (p.height ?? 0) / pageH;
        }
        return { ...prev, [key]: next };
      });
    },
    [activeFile?.id, activePageIdx, setters]
  );

  useEffect(() => {
    if (!imageReady) return;
    if (requireSignature) patchSize("signature");
    if (addHeader) patchSize("header");
    if (addDate) patchSize("date");
  }, [imageReady, requireSignature, addHeader, addDate, patchSize]);

  /* ---------- azioni ---------- */
  // attivando un elemento, il suo riquadro compare sulla PAGINA CORRENTE
  const toggleLayer = (name, checked) => {
    setEnabledOf[name](checked);
    if (checked) {
      if (activeFile?.id) {
        const key = String(activeFile.id);
        setters[name]((prev) => {
          const ex = prev[key];
          const nextPl = ex
            ? { ...ex, pageIndex: activePageIdx }
            : mkPlacement(LAYERS[name].def, activePageIdx);
          return { ...prev, [key]: nextPl };
        });
      }
      setActiveLayer(name);
      if (imageReady) setTimeout(() => patchSize(name), 0);
    } else if (activeLayer === name) {
      const others = ["signature", "header", "date"].filter(
        (n) => n !== name && enabledOf[n] && (n === "signature" ? allowSignature : allowStamps)
      );
      setActiveLayer(others[0] || null);
    }
  };

  // "Centra": riporta al default sulla pagina corrente
  const centerLayer = (name) => {
    if (!activeFile?.id) return;
    const key = String(activeFile.id);
    setters[name]((prev) => ({ ...prev, [key]: mkPlacement(LAYERS[name].def, activePageIdx) }));
    setActiveLayer(name);
    if (imageReady) setTimeout(() => patchSize(name), 0);
  };

  // "Porta qui": sposta il riquadro esistente sulla pagina corrente mantenendo la posizione
  const moveLayerHere = (name) => {
    if (!activeFile?.id) return;
    const key = String(activeFile.id);
    setters[name]((prev) =>
      prev[key] ? { ...prev, [key]: { ...prev[key], pageIndex: activePageIdx } } : prev
    );
    setActiveLayer(name);
    if (imageReady) setTimeout(() => patchSize(name), 0);
  };

  const updatePlacement = (name, next) => {
    if (!activeFile?.id) return;
    const key = String(activeFile.id);
    setters[name]((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...next },
    }));
  };

  const goPage = (delta) => {
    if (pageCount <= 1) return;
    setActivePageIdx((i) => clamp(i + delta, 0, pageCount - 1));
  };

  /* ---------- placement correnti ---------- */
  const placementOf = (name) => {
    const map = {
      signature: signaturePlacements,
      header: headerPlacements,
      date: datePlacements,
    };
    const key = String(activeFile?.id || "");
    return key ? map[name][key] || null : null;
  };

  /* ---------- sample text per i riquadri ---------- */
  const sampleName = activeFile?.matchedName || "Nome Cognome";
  const sampleOf = {
    signature: "",
    header: `Gent. dipendente ${sampleName}`,
    date: todayIt(),
  };

  /* ---------- righe elemento visibili ---------- */
  const elementRows = useMemo(() => {
    const rows = [];
    if (allowSignature) rows.push("signature");
    if (allowStamps) rows.push("header", "date");
    return rows;
  }, [allowSignature, allowStamps]);

  const activeElements = elementRows.filter((n) => enabledOf[n]);

  const descOf = {
    signature: "Riquadro di firma digitale (YouSign).",
    header: "Stampa nel PDF «Gent. dipendente Nome Cognome» a 12px.",
    date: "Stampa nel PDF la data di oggi a 12px.",
  };
  const nameOf = { signature: "Firma", header: "Intestazione", date: "Data" };

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <h3 className={styles.title}>{title}</h3>
            <div className={styles.subtitle}>
              Verifica i dettagli, attiva gli elementi e trascina i riquadri sull’anteprima.
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className={styles.body}>
          {/* LEFT */}
          <div className={styles.left}>
            {/* riepilogo */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Riepilogo</div>
              <div className={styles.kvList}>
                <div className={styles.kv}>
                  <span className={styles.kvKey}>Tipo documento</span>
                  <span className={styles.kvVal}>{tipoDocumento || "—"}</span>
                </div>
                <div className={styles.kv}>
                  <span className={styles.kvKey}>Scadenza</span>
                  <span className={styles.kvVal}>{dataScadenza || "Nessuna"}</span>
                </div>
                <div className={styles.kv}>
                  <span className={styles.kvKey}>Assegnazione</span>
                  <span className={styles.kvVal}>{assegnamentoLabel || "—"}</span>
                </div>
                <div className={styles.kv}>
                  <span className={styles.kvKey}>Abbina per CF</span>
                  <span className={styles.kvVal}>
                    {useCF ? (fallbackToSelected ? "Sì (con fallback)" : "Sì") : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* elementi sul documento */}
            {elementRows.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Elementi sul documento</div>
                {elementRows.map((name) => {
                  const on = enabledOf[name];
                  const isActive = activeLayer === name && on;
                  const pl = on ? placementOf(name) : null;
                  const plPage = pl && Number.isFinite(pl.pageIndex) ? pl.pageIndex : activePageIdx;
                  const onThisPage = plPage === activePageIdx;
                  return (
                    <div
                      key={name}
                      className={`${styles.elem} ${isActive ? styles.elemActive : ""}`}
                    >
                      <div
                        className={styles.elemHead}
                        onClick={() => on && setActiveLayer(name)}
                      >
                        <span
                          className={styles.dot}
                          style={{ background: LAYERS[name].accent }}
                        />
                        <div className={styles.elemBody}>
                          <div className={styles.elemName}>{nameOf[name]}</div>
                          <div className={styles.elemDesc}>{descOf[name]}</div>
                        </div>
                        <input
                          type="checkbox"
                          className={styles.chk}
                          checked={on}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => toggleLayer(name, e.target.checked)}
                        />
                      </div>
                      {on && (
                        <div className={styles.elemBar}>
                          <span>
                            {pageCount > 1
                              ? onThisPage
                                ? `Pagina ${plPage + 1}`
                                : `Sulla pagina ${plPage + 1}`
                              : "Posiziona sull’anteprima"}
                          </span>
                          <span className={styles.elemBarSpacer} />
                          {pageCount > 1 && !onThisPage && (
                            <button
                              type="button"
                              className={styles.miniBtn}
                              onClick={() => moveLayerHere(name)}
                            >
                              Porta qui
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.miniBtn}
                            onClick={() => centerLayer(name)}
                          >
                            Centra
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* opzioni file */}
            {allowAppendNames && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Opzioni nome file</div>
                <label className={styles.optRow}>
                  <div className={styles.elemBody}>
                    <div className={styles.elemName}>Aggiungi nome e cognome</div>
                    <div className={styles.elemDesc}>
                      Un file «NomeFile_Nome_Cognome.pdf» per ogni destinatario. In cronologia
                      resta il nome base.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className={styles.chk}
                    checked={appendNames}
                    onChange={(e) => setAppendNames(e.target.checked)}
                  />
                </label>
              </div>
            )}

            {/* email di notifica */}
            {allowEmailText && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Email ai dipendenti</div>
                <div className={styles.mailBox}>
                  <label className={styles.mailField}>
                    <span className={styles.mailLabel}>Oggetto</span>
                    <input
                      type="text"
                      className={styles.finput}
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="ClockEasy - Nuovo documento disponibile"
                    />
                  </label>
                  <label className={styles.mailField}>
                    <span className={styles.mailLabel}>Testo</span>
                    <textarea
                      className={styles.ftext}
                      rows={4}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder={
                        "Ciao {nome},\nè stato caricato un nuovo documento su ClockEasy.\nDocumento: {documento}\nTipo: {tipo}"
                      }
                    />
                  </label>
                  <div className={styles.mailHint}>
                    Lascia vuoto per usare il testo predefinito. Segnaposto:{" "}
                    <code>{"{nome}"}</code> <code>{"{cognome}"}</code>{" "}
                    <code>{"{documento}"}</code> <code>{"{tipo}"}</code>.
                  </div>
                </div>
              </div>
            )}

            {/* file */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                File{totaleFile ? ` (${totaleFile})` : ""}
              </div>
              <div className={styles.fileList}>
                {filesInfo.map((f) => {
                  const sel = activeFile && activeFile.id === f.id;
                  return (
                    <div
                      key={f.id}
                      className={`${styles.fileItem} ${sel ? styles.fileItemActive : ""}`}
                      onClick={() => setActiveId(f.id)}
                    >
                      <div className={styles.fthumb}>
                        {f.thumb ? <img src={f.thumb} alt={f.name} draggable={false} /> : "PDF"}
                      </div>
                      <div className={styles.fmeta}>
                        <div className={styles.fname} title={f.name}>
                          {f.name}
                        </div>
                        <div className={styles.fsub}>
                          {f.destLabel}
                          {f.cf ? ` · ${f.cf}` : ""}
                        </div>
                        <input
                          type="text"
                          className={styles.finput}
                          value={customFileNames[f.id] ?? f.fileName ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            setCustomFileNames?.((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                          placeholder={f.defaultFileName || "Nome file"}
                        />
                      </div>
                    </div>
                  );
                })}
                {filesInfo.length === 0 && (
                  <div className={styles.emptyPv}>Nessun file selezionato.</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — anteprima */}
          <div className={styles.right}>
            <div className={styles.pvHead}>
              <div className={styles.pvTitleWrap}>
                <div className={styles.pvTitle}>Anteprima</div>
                <div className={styles.pvFile}>{activeFile ? activeFile.name : "Nessun file"}</div>
              </div>
              <div className={styles.pager}>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  onClick={() => setZoomClamped((z) => z / 1.25)}
                  disabled={!currentThumb || zoom <= ZOOM_MIN}
                  aria-label="Riduci zoom"
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.zoomVal}
                  onClick={() => setZoom(1)}
                  disabled={!currentThumb}
                  title="Adatta alla finestra"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  onClick={() => setZoomClamped((z) => z * 1.25)}
                  disabled={!currentThumb || zoom >= ZOOM_MAX}
                  aria-label="Aumenta zoom"
                >
                  +
                </button>

                <span className={styles.pagerSep} />

                <button
                  type="button"
                  className={styles.pagerBtn}
                  onClick={() => goPage(-1)}
                  disabled={pageCount <= 1 || activePageIdx === 0}
                  aria-label="Pagina precedente"
                >
                  ‹
                </button>
                <span>
                  Pag. {activePageIdx + 1}
                  {pageCount ? ` / ${pageCount}` : ""}
                </span>
                <button
                  type="button"
                  className={styles.pagerBtn}
                  onClick={() => goPage(1)}
                  disabled={pageCount <= 1 || activePageIdx >= pageCount - 1}
                  aria-label="Pagina successiva"
                >
                  ›
                </button>
              </div>
            </div>

            {activeElements.length > 0 && (
              <div className={styles.legend}>
                {activeElements.map((n) => {
                  const pi = placementOf(n)?.pageIndex ?? activePageIdx;
                  const off = pageCount > 1 && pi !== activePageIdx;
                  return (
                    <span
                      key={n}
                      className={styles.legendItem}
                      style={off ? { opacity: 0.45 } : undefined}
                    >
                      <span className={styles.dot} style={{ background: LAYERS[n].accent }} />
                      {nameOf[n]}
                      {off ? ` (pag. ${pi + 1})` : ""}
                    </span>
                  );
                })}
                <span className={styles.legendItem} style={{ color: "#94a3b8" }}>
                  · clic su un riquadro per selezionarlo
                </span>
              </div>
            )}

            <div
              ref={previewWrapRef}
              className={styles.canvas}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) return; // zoom gestito dal listener non-passivo
                // rotella semplice = cambio pagina solo se non si è ingranditi
                if (zoom > 1.01 || pageCount <= 1) return;
                const now = Date.now();
                if (now - lastWheelTsRef.current < 250) return;
                if (Math.abs(e.deltaY) < 12) return;
                lastWheelTsRef.current = now;
                goPage(e.deltaY > 0 ? 1 : -1);
              }}
            >
              {!currentThumb && (
                <div className={styles.emptyPv}>
                  Anteprima non disponibile per questo file. Puoi comunque confermare il
                  caricamento.
                </div>
              )}

              {currentThumb && (
                <div
                  ref={stageRef}
                  className={styles.stage}
                  style={fit.w ? { width: stageW, height: stageH } : undefined}
                >
                  <img
                    ref={previewImgRef}
                    src={currentThumb}
                    alt={activeFile?.name || "Anteprima"}
                    className={styles.canvasImg}
                    draggable={false}
                    style={
                      fit.w
                        ? { width: "100%", height: "100%" }
                        : { maxWidth: "100%", maxHeight: "100%" }
                    }
                    onLoad={() => {
                      recomputeFit();
                      const el = previewImgRef.current;
                      if (el && el.naturalWidth && el.naturalHeight) setImageReady(true);
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />

                  {activeElements
                    .filter((name) => (placementOf(name)?.pageIndex ?? activePageIdx) === activePageIdx)
                    .map((name) => (
                      <PlacedBoxOverlay
                        key={name}
                        label={LAYERS[name].label}
                        accent={LAYERS[name].accent}
                        minW={LAYERS[name].minW}
                        minH={LAYERS[name].minH}
                        sample={sampleOf[name]}
                        isSignature={name === "signature"}
                        active={activeLayer === name}
                        placement={placementOf(name)}
                        onActivate={() => setActiveLayer(name)}
                        onReset={() => centerLayer(name)}
                        onChange={(next) => updatePlacement(name, next)}
                        stageRef={stageRef}
                      />
                    ))}

                  {activeElements.length > 0 && !imageReady && (
                    <div className={styles.loadingChip}>Caricamento anteprima…</div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.pvHint}>
              Trascina un riquadro per spostarlo · angolo in basso a destra per ridimensionare ·
              doppio clic per centrarlo · <b>Ctrl/⌘ + rotella</b> per zoomare.
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <div className={styles.footerHint}>
            {activeElements.length
              ? `${activeElements.length} element${
                  activeElements.length === 1 ? "o" : "i"
                } da applicare a ${activeFile ? "«" + activeFile.name + "»" : "ogni file"}.`
              : "Nessun elemento da stampare: verrà caricato il documento così com’è."}
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={loading}>
            Annulla
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() =>
              onConfirm?.({
                require_signature: requireSignature,
                signature_placements: signaturePlacements,
                header_placements: addHeader ? headerPlacements : {},
                date_placements: addDate ? datePlacements : {},
                append_names: appendNames,
                email_subject: allowEmailText ? emailSubject.trim() : "",
                email_body: allowEmailText ? emailBody.trim() : "",
              })
            }
            disabled={loading || filesInfo.length === 0}
          >
            {loading ? "Carico…" : "Conferma e carica"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 *  Riquadro posizionabile (firma / intestazione / data)
 *  drag + resize; emette sempre px + percentuali top-left
 * ========================================================= */
function PlacedBoxOverlay({
  placement,
  onChange,
  onActivate,
  onReset,
  stageRef,
  label,
  accent,
  sample = "",
  isSignature = false,
  active = false,
  minW = 60,
  minH = 40,
}) {
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const base = placement || { ...DEFAULT_SIG };

  const getRect = useCallback(() => {
    const el = stageRef?.current;
    if (!el || !el.clientWidth || !el.clientHeight) return null;
    return { width: el.clientWidth, height: el.clientHeight };
  }, [stageRef]);

  // geometria effettiva in px sullo "stage" corrente (ricavata dalle percentuali → segue lo zoom)
  const r = getRect();
  const W = r?.width || 0;
  const H = r?.height || 0;
  const effW = Number.isFinite(base.wPct) && W ? base.wPct * W : base.width ?? minW;
  const effH = Number.isFinite(base.hPct) && H ? base.hPct * H : base.height ?? minH;
  const rawX = Number.isFinite(base.xPct) && W ? base.xPct * W : base.x ?? 0;
  const rawY = Number.isFinite(base.yPct) && H ? base.yPct * H : base.y ?? 0;
  const effX = W ? clamp(rawX, 0, Math.max(0, W - effW)) : rawX;
  const effY = H ? clamp(rawY, 0, Math.max(0, H - effH)) : rawY;

  const emitPos = (nx, ny, rr) =>
    onChange({
      x: Math.round(nx),
      y: Math.round(ny),
      xPct: nx / rr.width,
      yPct: ny / rr.height,
      wPct: effW / rr.width,
      hPct: effH / rr.height,
      pageW: Math.round(rr.width),
      pageH: Math.round(rr.height),
    });

  const emitSize = (nw, nh, rr) =>
    onChange({
      width: Math.round(nw),
      height: Math.round(nh),
      xPct: effX / rr.width,
      yPct: effY / rr.height,
      wPct: nw / rr.width,
      hPct: nh / rr.height,
      pageW: Math.round(rr.width),
      pageH: Math.round(rr.height),
    });

  const onMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate?.();
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: effX, oy: effY };
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const d = dragRef.current;
      const rr = getRect();
      if (!d || !rr) return;
      const nx = clamp(d.ox + (e.clientX - d.sx), 0, Math.max(0, rr.width - effW));
      const ny = clamp(d.oy + (e.clientY - d.sy), 0, Math.max(0, rr.height - effH));
      emitPos(nx, ny, rr);
    };
    const up = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, effW, effH, effX, effY]);

  const onResizeDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onActivate?.();
    const rr = getRect();
    if (!rr) return;
    const start = {
      sx: e.clientX,
      sy: e.clientY,
      ow: effW,
      oh: effH,
      maxW: rr.width - effX,
      maxH: rr.height - effY,
    };
    const move = (ev) => {
      const nw = clamp(start.ow + (ev.clientX - start.sx), minW, start.maxW);
      const nh = clamp(start.oh + (ev.clientY - start.sy), minH, start.maxH);
      emitSize(nw, nh, rr);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!placement) return null;

  // scala del testo di anteprima: 12pt come appariranno nel PDF (stima A4), segue lo zoom
  const ptRef = H >= W ? 595.28 : 841.89;
  const previewScale = W ? W / ptRef : 1;
  const sampleFontPx = Math.max(7, Math.min(220, 12 * previewScale));

  return (
    <div className={styles.boxLayer}>
      <div
        className={styles.box}
        onMouseDown={onMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onReset?.();
        }}
        title={`Trascina: ${label}`}
        style={{
          left: effX,
          top: effY,
          width: effW,
          height: effH,
          justifyContent: isSignature ? "center" : "flex-start",
          border: `${active ? "2px solid" : "2px dashed"} ${accent}`,
          background: active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)",
          opacity: active ? 1 : 0.7,
          zIndex: active ? 3 : 2,
          boxShadow: active ? `0 2px 10px ${hexA(accent, 0.35)}` : "none",
        }}
      >
        <span className={styles.boxLabel} style={{ background: accent }}>
          {label}
        </span>
        {isSignature ? (
          <span className={styles.boxSigText} style={{ color: accent }}>
            FIRMA
          </span>
        ) : (
          <span className={styles.boxSample} style={{ fontSize: sampleFontPx }}>
            {sample}
          </span>
        )}
        {active && (
          <span
            className={styles.boxHandle}
            style={{ background: accent }}
            onMouseDown={onResizeDown}
            title="Ridimensiona"
          />
        )}
      </div>
    </div>
  );
}

/* colore esadecimale -> rgba con alpha */
function hexA(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return `rgba(15,23,42,${a})`;
  const [, rr, gg, bb] = m;
  return `rgba(${parseInt(rr, 16)},${parseInt(gg, 16)},${parseInt(bb, 16)},${a})`;
}
