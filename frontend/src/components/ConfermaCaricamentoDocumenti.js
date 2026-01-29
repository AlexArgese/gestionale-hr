import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ConfermaCaricamentoDocumenti.module.css";

// default box firma (in px dentro la preview)
const DEFAULT_SIG = { x: 80, y: 120, width: 220, height: 60 };

export default function ConfermaCaricamentoDocumenti({
  open,
  onClose,
  onConfirm,
  items = [], // [{ id, name, cf, utenteId, thumb, thumbs[], pages[] }]
  tipoDocumento,
  dataScadenza,
  assegnamentoLabel,
  useCF,
  fallbackToSelected,
  utentiFull = [],
  loading = false,
}) {
  /* =========================
   *  Normalizzazione items
   * ========================= */
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
        destLabel,
        thumb,
        thumbs: thumbsList,
      };
    });
  }, [items, utentiFull, useCF, fallbackToSelected, assegnamentoLabel]);

  const totaleFile = filesInfo.length;

  /* =========================
   *  Selezione file + pagina
   * ========================= */
  const [activeId, setActiveId] = useState(null);
  const [activePageIdx, setActivePageIdx] = useState(0);

  // on open: seleziona primo file
  useEffect(() => {
    if (!open) return;
    if (filesInfo.length > 0) {
      setActiveId(filesInfo[0].id);
      setActivePageIdx(0);
    } else {
      setActiveId(null);
      setActivePageIdx(0);
    }
  }, [open, filesInfo]);

  const activeFile = useMemo(() => {
    return filesInfo.find((f) => f.id === activeId) || filesInfo[0] || null;
  }, [filesInfo, activeId]);

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

  // se cambio file, torno a pagina 0
  useEffect(() => {
    if (!open) return;
    setActivePageIdx(0);
  }, [open, activeId]);

  /* =========================
   *  Firma (box overlay)
   * ========================= */
  const [requireSignature, setRequireSignature] = useState(false);

  // placements: per ogni fileId salvo UNA posizione (per ora 1 per documento)
  // { [fileId]: { x,y,width,height,pageIndex,pageW,pageH } }
  const [signaturePlacements, setSignaturePlacements] = useState({});

  // reset quando chiudo
  useEffect(() => {
    if (!open) {
      setRequireSignature(false);
      setSignaturePlacements({});
    }
  }, [open]);

  // init placement quando attivo firma
  useEffect(() => {
    if (!open) return;
    if (!requireSignature) return;
    if (!activeFile?.id) return;

    const key = String(activeFile.id);

    setSignaturePlacements((prev) => {
      const existing = prev[key];
      // se cambio pagina, porto il box su quella pagina (stessa posizione/dimensioni)
      if (!existing) return prev;
      if (existing.pageIndex !== activePageIdx) {
        return { ...prev, [key]: { ...existing, pageIndex: activePageIdx } };
      }
      return prev;
    });
  }, [open, requireSignature, activeFile?.id, activePageIdx]);

  const currentPlacement = useMemo(() => {
    const key = String(activeFile?.id || "");
    return key ? signaturePlacements[key] : null;
  }, [signaturePlacements, activeFile?.id]);

  const resetSignatureBox = () => {
    if (!activeFile?.id) return;
    const key = String(activeFile.id);
    setSignaturePlacements((prev) => ({
      ...prev,
      [key]: { ...DEFAULT_SIG, pageIndex: activePageIdx, pageW: null, pageH: null },
    }));
  };

  const [placingSignature, setPlacingSignature] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const lastWheelTsRef = useRef(0);

  const goPrevPage = () => {
    if (pageCount <= 1) return;
    setActivePageIdx((idx) => Math.max(0, idx - 1));
  };

  const goNextPage = () => {
    if (pageCount <= 1) return;
    setActivePageIdx((idx) => Math.min(pageCount - 1, idx + 1));
  };

  /* =========================
   *  Preview refs
   * ========================= */
  const previewWrapRef = useRef(null);
  const previewImgRef = useRef(null);

  const placeSignatureAt = (clientX, clientY) => {
    if (!requireSignature || !activeFile?.id || !previewWrapRef.current || !imageReady) return;

    const wrapRect = previewWrapRef.current.getBoundingClientRect();
    const imgRect = previewImgRef.current?.getBoundingClientRect() || null;
    const rect = imgRect || wrapRect;
    if (!rect.width || !rect.height) return;

    const width = DEFAULT_SIG.width;
    const height = DEFAULT_SIG.height;
    const key = String(activeFile.id);

    const pageW = rect.width;
    const pageH = rect.height;

    const xPx = clamp(clientX - rect.left - width / 2, 0, pageW - width);
    const yPx = clamp(clientY - rect.top - height / 2, 0, pageH - height);

    setSignaturePlacements((prev) => ({
      ...prev,
      [key]: {
        pageIndex: activePageIdx,
        // percentuali TOP-LEFT based
        xPct: xPx / pageW,
        yPct: yPx / pageH,
        wPct: width / pageW,
        hPct: height / pageH,
        // salva anche dimensioni “di riferimento” (utile per debug)
        pageW: Math.round(pageW),
        pageH: Math.round(pageH),
      },
    }));
  };


  useEffect(() => {
    const onUp = () => setPlacingSignature(false);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    setImageReady(false);
  }, [currentThumb, activeId, activePageIdx]);

  /* =========================
   *  Render
   * ========================= */
  return open ? (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflowY: "auto",
        padding: 12,
      }}
    >
      <div
        className={styles.panel}
        style={{
          maxHeight: "92vh",
          width: "min(1180px, 96vw)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div className={styles.header} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className={styles.headerMain} style={{ flex: 1, minWidth: 0 }}>
            <h3 className={styles.title} style={{ margin: 0 }}>
              Conferma caricamento documenti
            </h3>
            <div className={styles.subtitle} style={{ opacity: 0.8 }}>
              Seleziona un file, verifica l’anteprima e (se richiesto) posiziona la firma.
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        {/* BODY */}
        <div
          className={styles.body}
          style={{
            padding: "14px 18px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "420px 1fr",
            gap: 14,
          }}
        >
          {/* LEFT: riepilogo + lista */}
          <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className={styles.summary} style={{ display: "grid", gap: 6 }}>
              <div>
                <span className={styles.label}>Tipo documento:</span>{" "}
                <span className={styles.value}>{tipoDocumento || "-"}</span>
              </div>
              <div>
                <span className={styles.label}>Data scadenza:</span>{" "}
                <span className={styles.value}>{dataScadenza || "Nessuna"}</span>
              </div>
              <div>
                <span className={styles.label}>Assegnazione:</span>{" "}
                <span className={styles.value}>{assegnamentoLabel || "-"}</span>
              </div>
              <div>
                <span className={styles.label}>Abbina per CF:</span>{" "}
                <span className={styles.value}>
                  {useCF ? "Sì" : "No"}
                  {useCF && fallbackToSelected ? " (fallback)" : ""}
                </span>
              </div>
              <div>
                <span className={styles.label}>File selezionati:</span>{" "}
                <span className={styles.value}>{totaleFile}</span>
              </div>
            </div>

            {/* firma toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 700 }}>Richiedi firma</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Attiva per posizionare il riquadro firma sull’anteprima.
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={requireSignature}
                  onChange={(e) => setRequireSignature(e.target.checked)}
                />
                <span className={styles.value}>{requireSignature ? "Sì" : "No"}</span>
              </label>
            </div>

            {/* lista file */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 700 }}>File</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Clicca un file per vedere l’anteprima.
                </div>
              </div>

              <div style={{ overflowY: "auto", maxHeight: "calc(92vh - 320px)" }}>
                <table className={styles.table} style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th className={styles.thumbCol}>Anteprima</th>
                      <th>File</th>
                      <th>CF</th>
                      <th>Destinatario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filesInfo.map((f) => {
                      const isActive = activeFile && activeFile.id === f.id;
                      return (
                        <tr
                          key={f.id}
                          className={isActive ? styles.rowSelected : undefined}
                          onClick={() => setActiveId(f.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td className={styles.thumbCell}>
                            {f.thumb ? (
                              <div
                                style={{
                                  width: 44,
                                  height: 58,
                                  borderRadius: 6,
                                  overflow: "hidden",
                                  background: "rgba(0,0,0,0.04)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <img
                                  src={f.thumb}
                                  alt={f.name}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  draggable={false}
                                />
                              </div>
                            ) : (
                              <div className={styles.thumbPlaceholder}>PDF</div>
                            )}
                          </td>
                          <td className={styles.fileName}>{f.name}</td>
                          <td>{f.cf ? <b>{f.cf}</b> : <span className={styles.muted}>—</span>}</td>
                          <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.destLabel}
                          </td>
                        </tr>
                      );
                    })}
                    {filesInfo.length === 0 && (
                      <tr>
                        <td colSpan={4} className={styles.empty}>
                          Nessun file selezionato.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT: preview */}
          <div
            style={{
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
              overflow: "hidden",
              background: "white",
            }}
          >
            {/* preview header */}
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, lineHeight: 1.1 }}>Anteprima</div>
                <div style={{ fontSize: 12, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeFile ? activeFile.name : "Nessun file"}
                </div>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {pageCount > 1 && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={goPrevPage}>
                      ‹
                    </button>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Pagina <b>{activePageIdx + 1}</b> / {pageCount}
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={goNextPage}>
                      ›
                    </button>
                  </>
                )}

                {requireSignature && (
                  <>
                    <div
                      onMouseDown={() => {
                        if (!imageReady) return;
                        setPlacingSignature(true);
                      }}
                      title={
                        imageReady
                          ? "Trascina per inserire la firma nell'anteprima"
                          : "Attendi il caricamento dell'anteprima"
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 86,
                        height: 32,
                        border: "2px dashed rgba(0,0,0,0.65)",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.06)",
                        fontWeight: 800,
                        cursor: imageReady ? "grab" : "not-allowed",
                        opacity: imageReady ? 1 : 0.5,
                        userSelect: "none",
                      }}
                    >
                      FIRMA
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={resetSignatureBox} disabled={!activeFile}>
                      Reset firma
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* preview body */}
            <div
              ref={previewWrapRef}
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                padding: 12,
                background: "rgba(0,0,0,0.02)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                cursor: currentThumb ? "pointer" : "default",
              }}
              onWheel={(e) => {
                if (pageCount <= 1) return;
                const now = Date.now();
                if (now - lastWheelTsRef.current < 200) return;
                if (Math.abs(e.deltaY) < 10) return;
                lastWheelTsRef.current = now;
                if (e.deltaY > 0) goNextPage();
                else goPrevPage();
              }}
              onMouseUp={(e) => {
                if (!placingSignature) return;
                placeSignatureAt(e.clientX, e.clientY);
                setPlacingSignature(false);
              }}
            >
              {!currentThumb && (
                <div style={{ textAlign: "center", maxWidth: 560 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Nessuna anteprima disponibile</div>
                  <div style={{ opacity: 0.85, marginBottom: 10 }}>
                    Per vedere l’anteprima, l’item deve avere <code>thumb</code> o <code>thumbs[]</code> valorizzati (URL o dataURL).
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Debug: currentThumb = <code>{String(currentThumb)}</code>
                  </div>
                </div>
              )}

              {currentThumb && (
                <>
                  <img
                    ref={previewImgRef}
                    src={currentThumb}
                    alt={activeFile?.name || "Anteprima"}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      display: "block",
                      borderRadius: 10,
                      boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                      background: "white",
                    }}
                    draggable={false}
                    onLoad={() => {
                      if (!previewWrapRef.current) return;
                      const imgRect = previewImgRef.current?.getBoundingClientRect();
                      if (!imgRect || !imgRect.width || !imgRect.height) return;
                      setImageReady(true);
                      if (requireSignature && activeFile?.id) {
                        const key = String(activeFile.id);
                        setSignaturePlacements((prev) => {
                          if (!prev[key]) return prev;
                          return {
                            ...prev,
                            [key]: {
                              ...prev[key],
                              pageW: Math.round(imgRect.width),
                              pageH: Math.round(imgRect.height),
                              pageIndex: activePageIdx,
                            },
                          };
                        });
                      }
                    }}
                    onError={(e) => {
                      // se l'immagine non carica, mostra placeholder utile
                      e.currentTarget.style.display = "none";
                    }}
                  />

                  {pageCount > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        right: 10,
                        top: 10,
                        bottom: 10,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, pageCount - 1)}
                        step={1}
                        value={activePageIdx}
                        onChange={(e) => setActivePageIdx(Number(e.target.value))}
                        aria-label="Selettore pagina"
                        style={{
                          height: "100%",
                          writingMode: "bt-lr",
                        }}
                      />
                    </div>
                  )}

                  {/* overlay firma */}
                  {requireSignature && activeFile && (
                    <SignatureBoxOverlay
                      placement={currentPlacement}
                      onChange={(next) => {
                        const key = String(activeFile.id);
                        setSignaturePlacements((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] || {}), ...next, pageIndex: activePageIdx },
                        }));
                      }}
                      containerRef={previewWrapRef}
                      imageRef={previewImgRef}
                      visible={!!currentThumb}
                    />
                  )}

                  {requireSignature && !imageReady && (
                    <div
                      style={{
                        position: "absolute",
                        left: 12,
                        bottom: 12,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "rgba(0,0,0,0.65)",
                        color: "white",
                        fontSize: 12,
                      }}
                    >
                      Caricamento anteprima…
                    </div>
                  )}

                </>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.footer} style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <div className={styles.hint} style={{ flex: 1, opacity: 0.9 }}>
            Premi <b>Conferma e carica</b> per avviare l’upload.
          </div>

          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annulla
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onConfirm({
                require_signature: requireSignature,
                signature_placements: signaturePlacements,
              })
            }
            disabled={loading || filesInfo.length === 0}
            title={filesInfo.length === 0 ? "Nessun file" : ""}
          >
            {loading ? "Carico…" : "Conferma e carica"}
          </button>
        </div>
      </div>
    </div>
  ) : null;
}

/* =========================================================
 *  Signature overlay (drag + resize)
 * ========================================================= */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function SignatureBoxOverlay({ placement, onChange, containerRef, imageRef, visible }) {
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const safePlacement = placement || { ...DEFAULT_SIG, pageW: null, pageH: null };
  const { x, y, width, height } = safePlacement;

  const getRects = useCallback(() => {
    const wrap = containerRef?.current;
    if (!wrap) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const img = imageRef?.current;
    if (!img) {
      return {
        offsetX: 0,
        offsetY: 0,
        width: wrapRect.width,
        height: wrapRect.height,
      };
    }
    const imgRect = img.getBoundingClientRect();
    return {
      offsetX: imgRect.left - wrapRect.left,
      offsetY: imgRect.top - wrapRect.top,
      width: imgRect.width,
      height: imgRect.height,
    };
  }, [containerRef, imageRef]);

  const updatePageSizeIfNeeded = useCallback(() => {
    const rects = getRects();
    if (!rects) return;
    const pageW = Math.round(rects.width);
    const pageH = Math.round(rects.height);
    if (safePlacement.pageW !== pageW || safePlacement.pageH !== pageH) {
      onChange({ pageW, pageH });
    }
  }, [getRects, onChange, safePlacement.pageW, safePlacement.pageH]);

  useEffect(() => {
    if (!visible) return;
    updatePageSizeIfNeeded();
  }, [visible, updatePageSizeIfNeeded]);

  const onMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(true);
    updatePageSizeIfNeeded();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
  };

  const onMouseMove = (e) => {
    if (!dragging || !dragRef.current) return;
    e.preventDefault();
    const rects = getRects();
    if (!rects) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    const nextX = clamp(dragRef.current.origX + dx, 0, rects.width - width);
    const nextY = clamp(dragRef.current.origY + dy, 0, rects.height - height);

    onChange({ x: Math.round(nextX), y: Math.round(nextY) });
  };

  const onMouseUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, width, height, x, y]);

  const onResizeMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(false);
    updatePageSizeIfNeeded();

    const rects = getRects();
    if (!rects) return;

    const start = {
      startX: e.clientX,
      startY: e.clientY,
      origW: width,
      origH: height,
      maxW: rects.width - x,
      maxH: rects.height - y,
    };

    const move = (ev) => {
      const dw = ev.clientX - start.startX;
      const dh = ev.clientY - start.startY;
      const nextW = clamp(start.origW + dw, 60, start.maxW);
      const nextH = clamp(start.origH + dh, 40, start.maxH);
      onChange({ width: Math.round(nextW), height: Math.round(nextH) });
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!visible || !placement) return null;
  const rects = getRects();
  const offsetX = rects?.offsetX || 0;
  const offsetY = rects?.offsetY || 0;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: offsetX + x,
          top: offsetY + y,
          width,
          height,
          border: "2px dashed rgba(0,0,0,0.75)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          letterSpacing: 0.5,
          pointerEvents: "auto",
          userSelect: "none",
          cursor: "move",
          backdropFilter: "blur(2px)",
        }}
        onMouseDown={onMouseDown}
        title="Trascina per posizionare la firma"
      >
        FIRMA
        <div
          onMouseDown={onResizeMouseDown}
          title="Ridimensiona"
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            width: 14,
            height: 14,
            borderRadius: 4,
            background: "rgba(0,0,0,0.55)",
            cursor: "nwse-resize",
          }}
        />
      </div>
    </div>
  );
}
