import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import * as pdfjsLib from "pdfjs-dist";
import styles from "./DocumentiGestione.module.css";

/* Worker pdf.js via CDN (compatibile CRA/Webpack) */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const API = "http://localhost:3001";

function isPdf(nameOrUrl = "") {
  return /\.pdf($|\?)/i.test(nameOrUrl);
}
function isImage(nameOrUrl = "") {
  return /\.(png|jpe?g|webp|gif)($|\?)/i.test(nameOrUrl);
}

/** Rende la prima pagina del PDF in un dataURL (thumb) */
async function renderPdfFirstPageToDataUrl(url) {
  try {
    const loadingTask = pdfjsLib.getDocument({ url });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.9 });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({
      canvasContext: ctx,
      viewport: viewport.clone({ scale: 0.9 * ratio }),
    }).promise;
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch (e) {
    console.error("Anteprima PDF fallita:", e);
    return null;
  }
}

export default function DocumentiGestione() {
  const [utenti, setUtenti] = useState([]);
  const [query, setQuery] = useState("");
  const [fSocieta, setFSocieta] = useState("");
  const [fSede, setFSede] = useState("");
  const [fRuolo, setFRuolo] = useState("");
  const [fAttivo, setFAttivo] = useState("");
  const [ordinamento, setOrdinamento] = useState("alfabetico");

  const [selectedUser, setSelectedUser] = useState(null);
  const [docs, setDocs] = useState([]); // [{id,tipo_documento,nome_file,url_file,data_upload,data_scadenza}]
  const [thumbs, setThumbs] = useState({}); // docId -> dataUrl
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [toast, setToast] = useState(null); // {type:'success'|'error'|'info', text}

  // === Viewer stato ===
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null); // documento selezionato
  const [viewerImg, setViewerImg] = useState(null); // dataURL attuale
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerTotal, setViewerTotal] = useState(1);
  const pdfInstanceRef = useRef(null); // istanza pdfjs del documento aperto
  const loadingPageRef = useRef(false);

  // --- carica utenti per sidebar ---
  useEffect(() => {
    fetch(`${API}/utenti`)
      .then((r) => r.json())
      .then(setUtenti)
      .catch((e) => console.error("Load utenti:", e));
  }, []);

  // --- filtri utenti come nella pagina Dipendenti ---
  const utentiFiltrati = useMemo(() => {
    let res = [...utenti];

    if (query.trim()) {
      const q = query.toLowerCase();
      res = res.filter(
        (u) =>
          u.nome?.toLowerCase().includes(q) ||
          u.cognome?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }
    if (fSocieta) res = res.filter((u) => u.societa_nome === fSocieta);
    if (fSede) res = res.filter((u) => u.sede === fSede);
    if (fRuolo) res = res.filter((u) => u.ruolo === fRuolo);
    if (fAttivo) res = res.filter((u) => String(u.stato_attivo) === fAttivo);

    if (ordinamento === "alfabetico") {
      res.sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));
    } else if (ordinamento === "modifica") {
      res.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } else {
      res.sort((a, b) => b.id - a.id);
    }
    return res;
  }, [utenti, query, fSocieta, fSede, fRuolo, fAttivo, ordinamento]);

  const sedi = useMemo(
    () => [...new Set(utenti.map((u) => u.sede).filter(Boolean))],
    [utenti]
  );
  const ruoli = useMemo(
    () => [...new Set(utenti.map((u) => u.ruolo).filter(Boolean))],
    [utenti]
  );
  const societa = useMemo(
    () => [...new Set(utenti.map((u) => u.societa_nome).filter(Boolean))],
    [utenti]
  );

  // --- carica documenti utente selezionato ---
  const caricaDocumenti = async (user) => {
    if (!user) return;
    setSelectedUser(user);
    setLoadingDocs(true);
    setDocs([]);
    setThumbs({});
    try {
      const r = await fetch(`${API}/documenti/utente/${user.id}`);
      const data = await r.json();
      setDocs(data || []);

      // genera anteprime in background
      const nextThumbs = {};
      for (const d of data) {
        const urlAbs = `${API}/${d.url_file}`;
        if (isImage(d.nome_file) || isImage(d.url_file)) {
          nextThumbs[d.id] = urlAbs; // usa direttamente l'immagine
        } else if (isPdf(d.nome_file) || isPdf(d.url_file)) {
          const t = await renderPdfFirstPageToDataUrl(urlAbs);
          if (t) nextThumbs[d.id] = t;
        }
      }
      setThumbs(nextThumbs);
    } catch (e) {
      console.error("Load documenti utente:", e);
      setToast({
        type: "error",
        text: "Errore nel caricamento dei documenti.",
      });
    } finally {
      setLoadingDocs(false);
    }
  };

  // --- elimina documento ---
  const eliminaDocumento = async (docId) => {
    const ok = window.confirm(
      "Confermi l'eliminazione del documento? L'azione è irreversibile."
    );
    if (!ok) return;

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        setToast({ type: "error", text: "Non sei autenticato. Rifai login." });
        return;
      }
      const r = await fetch(`${API}/documenti/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`DELETE ${r.status}: ${txt}`);
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      setThumbs((prev) => {
        const c = { ...prev };
        delete c[docId];
        return c;
      });
      setToast({ type: "success", text: "Documento eliminato." });
      // chiudi viewer se stai guardando proprio quel documento
      if (viewerOpen && viewerDoc?.id === docId) closeViewer();
    } catch (e) {
      console.error("Delete documento:", e);
      setToast({ type: "error", text: "Eliminazione fallita." });
    }
  };

  // === Viewer: apertura ===
  const openViewer = async (doc) => {
    const urlAbs = `${API}/${doc.url_file}`;
    setViewerDoc(doc);
    setViewerOpen(true);
    setViewerImg(null);
    setViewerPage(1);
    setViewerTotal(1);
    pdfInstanceRef.current = null;

    if (isImage(doc.nome_file) || isImage(doc.url_file)) {
      setViewerImg(urlAbs);
      setViewerTotal(1);
      return;
    }

    if (isPdf(doc.nome_file) || isPdf(doc.url_file)) {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: urlAbs });
        const pdf = await loadingTask.promise;
        pdfInstanceRef.current = pdf;
        setViewerTotal(pdf.numPages);
        await renderCurrentPage(1);
      } catch (e) {
        console.error("Apertura PDF fallita:", e);
        setToast({ type: "error", text: "Impossibile aprire il PDF." });
      }
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerDoc(null);
    setViewerImg(null);
    setViewerPage(1);
    setViewerTotal(1);
    pdfInstanceRef.current = null;
  };

  // === Viewer: render pagina corrente ===
  const renderCurrentPage = async (pageNumber) => {
    if (!pdfInstanceRef.current || loadingPageRef.current) return;
    try {
      loadingPageRef.current = true;
      const page = await pdfInstanceRef.current.getPage(pageNumber);
      const baseScale = 1.3; // qualità anteprima
      const viewport = page.getViewport({ scale: baseScale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      await page.render({
        canvasContext: ctx,
        viewport: viewport.clone({ scale: baseScale * ratio }),
      }).promise;
      setViewerImg(canvas.toDataURL("image/jpeg", 0.92));
      setViewerPage(pageNumber);
    } catch (e) {
      console.error("Render pagina PDF fallito:", e);
    } finally {
      loadingPageRef.current = false;
    }
  };

  const nextPage = async () => {
    if (!pdfInstanceRef.current) return;
    const n = Math.min(viewerTotal, viewerPage + 1);
    if (n !== viewerPage) await renderCurrentPage(n);
  };
  const prevPage = async () => {
    if (!pdfInstanceRef.current) return;
    const n = Math.max(1, viewerPage - 1);
    if (n !== viewerPage) await renderCurrentPage(n);
  };

  // scorciatoie tastiera
  useEffect(() => {
    const onKey = (e) => {
      if (!viewerOpen) return;
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowRight") nextPage();
      if (e.key === "ArrowLeft") prevPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerOpen, viewerPage, viewerTotal]);

  return (
    <div className={styles.container}>
      {/* HEADER PAGINA */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Gestione documenti</h1>
        {selectedUser && (
          <div className={styles.pageHeaderInfo}>
            <span className={styles.chip}>
              {selectedUser.cognome} {selectedUser.nome}
            </span>
            <span className={styles.chipMuted}>
              {selectedUser.ruolo || "Ruolo non impostato"}
            </span>
          </div>
        )}
      </div>

      <div className={styles.underline} />

      {/* LAYOUT SIDEBAR + MAIN */}
      <div className={styles.layout}>
        {/* Sidebar: filtri + lista utenti */}
        <aside className={styles.side}>
          <h3 className={styles.sideTitle}>Dipendenti</h3>

          <input
            className={`input ${styles.search}`}
            placeholder="Cerca nome, cognome o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className={styles.filters}>
            <select
              className={`select ${styles.filterSelect}`}
              value={ordinamento}
              onChange={(e) => setOrdinamento(e.target.value)}
            >
              <option value="alfabetico">Cognome (A-Z)</option>
              <option value="inserimento">Ultima aggiunta</option>
              <option value="modifica">Ultima modifica</option>
            </select>

            <select
              className={`select ${styles.filterSelect}`}
              value={fSocieta}
              onChange={(e) => setFSocieta(e.target.value)}
            >
              <option value="">Tutte le società</option>
              {societa.map((s, i) => (
                <option key={i} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className={`select ${styles.filterSelect}`}
              value={fSede}
              onChange={(e) => setFSede(e.target.value)}
            >
              <option value="">Tutte le sedi</option>
              {sedi.map((s, i) => (
                <option key={i} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className={`select ${styles.filterSelect}`}
              value={fRuolo}
              onChange={(e) => setFRuolo(e.target.value)}
            >
              <option value="">Tutti i ruoli</option>
              {ruoli.map((r, i) => (
                <option key={i} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              className={`select ${styles.filterSelect}`}
              value={fAttivo}
              onChange={(e) => setFAttivo(e.target.value)}
            >
              <option value="">Tutti gli stati</option>
              <option value="true">Attivi</option>
              <option value="false">Non attivi</option>
            </select>
          </div>

          <div className={styles.usersList}>
            {utentiFiltrati.map((u) => {
              const active = selectedUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  className={`${styles.userItem} ${
                    active ? styles.userItemActive : ""
                  }`}
                  onClick={() => caricaDocumenti(u)}
                  title={`${u.cognome} ${u.nome}`}
                >
                  <div className={styles.userName}>
                    <b>{u.cognome}</b> {u.nome}
                  </div>
                  <div className={styles.userSub}>
                    {u.sede || "Nessuna sede"} · {u.societa_nome || "N/D"}
                  </div>
                </button>
              );
            })}
            {utentiFiltrati.length === 0 && (
              <div className={styles.empty}>
                Nessun dipendente con i filtri attuali.
              </div>
            )}
          </div>
        </aside>

        {/* Area principale: documenti utente */}
        <main className={styles.main}>
          {!selectedUser && (
            <div className={styles.placeholder}>
              Seleziona un dipendente per vedere i documenti.
            </div>
          )}

          {selectedUser && (
            <>
              <div className={styles.header}>
                <div>
                  <h2 className={styles.title}>
                    Documenti di {selectedUser.cognome} {selectedUser.nome}
                  </h2>
                  <div className={styles.headerSub}>
                    {selectedUser.ruolo || "Ruolo non impostato"} ·{" "}
                    {selectedUser.sede || "Nessuna sede"} ·{" "}
                    {selectedUser.societa_nome || "Società non impostata"}
                  </div>
                </div>
                <button
                  className={`btn ${styles.refreshBtn}`}
                  onClick={() => caricaDocumenti(selectedUser)}
                  disabled={loadingDocs}
                >
                  ↻ {loadingDocs ? "Aggiornamento…" : "Aggiorna"}
                </button>
              </div>

              {toast && (
                <div
                  className={`${styles.toast} ${
                    toast.type === "success"
                      ? styles.toastSuccess
                      : toast.type === "error"
                      ? styles.toastError
                      : styles.toastInfo
                  }`}
                >
                  <span>{toast.text}</span>
                  <button
                    className={styles.toastClose}
                    onClick={() => setToast(null)}
                  >
                    ✕
                  </button>
                </div>
              )}

              {loadingDocs && (
                <div className={styles.loading}>Caricamento documenti…</div>
              )}

              {!loadingDocs && docs.length === 0 && (
                <div className={styles.empty}>
                  Nessun documento presente per questo dipendente.
                </div>
              )}

              <div className={styles.grid}>
                {docs.map((d) => {
                  const urlAbs = `${API}/${d.url_file}`;
                  const thumb = thumbs[d.id];
                  const downloadableName = d.nome_file || "documento.pdf";

                  return (
                    <div className={`card ${styles.card}`} key={d.id}>
                      <div
                        className={styles.thumb}
                        title="Apri anteprima"
                        role="button"
                        onClick={() => openViewer(d)}
                      >
                        {thumb ? (
                          <img src={thumb} alt={downloadableName} />
                        ) : isImage(urlAbs) ? (
                          <img src={urlAbs} alt={downloadableName} />
                        ) : (
                          <div className={styles.thumbPlaceholder}>
                            Anteprima…
                          </div>
                        )}
                        {isPdf(urlAbs) && (
                          <span className={styles.badge}>PDF</span>
                        )}
                      </div>

                      <div className={styles.meta}>
                        <div
                          className={styles.docTitle}
                          title={downloadableName}
                        >
                          {downloadableName}
                        </div>
                        <div className={styles.docSub}>
                          {d.tipo_documento} ·{" "}
                          {new Date(d.data_upload).toLocaleDateString()}
                          {d.data_scadenza
                            ? ` · Scad.: ${new Date(
                                d.data_scadenza
                              ).toLocaleDateString()}`
                            : ""}
                        </div>
                      </div>

                      <div className={styles.actions}>
                        <a
                          className={styles.linkBtn}
                          href={`${API}/documenti/${d.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Scarica
                        </a>
                        <button
                          className={styles.dangerBtn}
                          onClick={() => eliminaDocumento(d.id)}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* === Viewer Overlay === */}
      {viewerOpen && (
        <div className={styles.viewerOverlay} onClick={closeViewer}>
          <aside
            className={styles.viewerPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.viewerHeader}>
              <div className={styles.viewerTitle}>
                {viewerDoc?.nome_file}
                {isPdf(viewerDoc?.nome_file || viewerDoc?.url_file) && (
                  <span className={styles.viewerPages}>
                    {" "}
                    · Pag. {viewerPage}/{viewerTotal}
                  </span>
                )}
              </div>
              <div className={styles.flexSpacer} />
              {isPdf(viewerDoc?.nome_file || viewerDoc?.url_file) && (
                <>
                  <button
                    className={styles.iconBtn}
                    onClick={prevPage}
                    disabled={viewerPage <= 1}
                  >
                    ←
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={nextPage}
                    disabled={viewerPage >= viewerTotal}
                  >
                    →
                  </button>
                </>
              )}
              <button className={styles.iconBtn} onClick={closeViewer}>
                ✕
              </button>
            </div>

            <div className={styles.viewerBody}>
              {viewerImg ? (
                <img src={viewerImg} alt="Anteprima" />
              ) : (
                <div className={styles.viewerPlaceholder}>Caricamento…</div>
              )}
            </div>

            <div className={styles.viewerFooter}>
              <a
                className={styles.linkBtn}
                href={`${API}/documenti/${viewerDoc?.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                Scarica
              </a>
              <div className={styles.flexSpacer} />
              <button
                className={styles.dangerBtn}
                onClick={() => eliminaDocumento(viewerDoc.id)}
              >
                Elimina
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
