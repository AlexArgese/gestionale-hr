import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import SelettoreDipendenti from "./SelettoreDipendenti";
import ConfermaCaricamentoDocumenti from "./ConfermaCaricamentoDocumenti";
import styles from "./DocumentiCaricaDirettoCF.module.css";
import { API_BASE } from "../api";

const API = API_BASE;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CF_REGEX =
  /[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]/i;

const isPdf = (name = "", type = "") =>
  type === "application/pdf" || /\.pdf$/i.test(name);
const isImage = (name = "", type = "") =>
  /^image\//.test(type) || /\.(png|jpe?g|webp|gif)$/i.test(name);

function normalizeForCF(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function pickBestCF(rawText, whitelistSet) {
  const clean = normalizeForCF(rawText);
  const matches = clean.match(new RegExp(CF_REGEX, "g")) || [];
  if (matches.length === 0) return null;
  if (!whitelistSet || whitelistSet.size === 0) return matches[0];
  for (const m of matches) {
    if (whitelistSet.has(m)) return m;
  }
  return matches[0];
}

async function extractTextFromPdfNative(file, maxPages = 3) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = Math.min(maxPages, pdf.numPages);
  let out = "";
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const txt = tc.items.map((it) => it.str || "").join(" ");
    out += "\n" + txt;
  }
  return out;
}

async function renderPdfPageToDataUrl(file, pageNo = 1, scale = 1.4) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
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
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function renderPdfPageFromPdfToDataUrl(pdf, pageNo = 1, scale = 1.2) {
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

async function renderAllPdfPagesToThumbs(file, scale = 1.1) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const thumbs = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    thumbs.push(await renderPdfPageFromPdfToDataUrl(pdf, p, scale));
  }
  return thumbs;
}

async function ocrDataUrl(dataUrl) {
  try {
    const { data } = await Tesseract.recognize(dataUrl, "ita+eng");
    return data?.text || "";
  } catch (e) {
    console.error("OCR error", e);
    return "";
  }
}

async function detectCFAndThumb(file, whitelistCF) {
  try {
    let thumbDataUrl = null;
    if (isPdf(file.name, file.type))
      thumbDataUrl = await renderPdfPageToDataUrl(file, 1, 1.0);
    else if (isImage(file.name, file.type))
      thumbDataUrl = URL.createObjectURL(file);

    if (isPdf(file.name, file.type)) {
      const nativeTxt = (await extractTextFromPdfNative(file, 3)) || "";
      const cf = pickBestCF(nativeTxt, whitelistCF);
      if (cf) return { cf, thumbDataUrl };
    }

    if (isPdf(file.name, file.type)) {
      for (let p = 1; p <= 3; p++) {
        const img = await renderPdfPageToDataUrl(file, p, 1.6);
        const text = await ocrDataUrl(img);
        const cf = pickBestCF(text, whitelistCF);
        if (cf) return { cf, thumbDataUrl: thumbDataUrl || img };
        if (!thumbDataUrl) thumbDataUrl = img;
      }
    }

    if (isImage(file.name, file.type)) {
      const text = await ocrDataUrl(thumbDataUrl);
      const cf = pickBestCF(text, whitelistCF);
      return { cf: cf || null, thumbDataUrl };
    }

    return { cf: null, thumbDataUrl };
  } catch (e) {
    console.error("detectCFAndThumb failed", e);
    return { cf: null, thumbDataUrl: null };
  }
}

async function ensureThumbOnly(file) {
  try {
    if (isPdf(file.name, file.type)) {
      return await renderPdfPageToDataUrl(file, 1, 1.0);
    }
    if (isImage(file.name, file.type)) {
      return URL.createObjectURL(file);
    }
    return null;
  } catch (e) {
    console.error("ensureThumbOnly failed", e);
    return null;
  }
}

export default function DocumentiCaricaDirettoCF({ tipi = [] }) {
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");

  // CF map veloce
  const [utentiCF, setUtentiCF] = useState([]);
  useEffect(() => {
    fetch(`${API}/utenti/cf/all`)
      .then((r) => r.json())
      .then((rows) => setUtentiCF(rows || []))
      .catch(console.error);
  }, []);

  const utentiByCF = useMemo(() => {
    const m = new Map();
    (utentiCF || []).forEach((u) => {
      const cf = (u.codice_fiscale || "").toUpperCase().trim();
      if (cf) m.set(cf, u);
    });
    return m;
  }, [utentiCF]);

  const cfWhitelist = useMemo(
    () => new Set(Array.from(utentiByCF.keys())),
    [utentiByCF]
  );

  // elenco utenti completo (per mostrare nomi)
  const [utentiFull, setUtentiFull] = useState([]);
  useEffect(() => {
    fetch(`${API}/utenti`)
      .then((r) => r.json())
      .then(setUtentiFull)
      .catch(console.error);
  }, []);

  // files
  const [items, setItems] = useState([]);
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // selezione manuale
  const [assegnaMode, setAssegnaMode] = useState("some"); // 'one' | 'some' | 'all'
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const selectedUsers = useMemo(
    () =>
      selectedIds
        .map((id) => utentiFull.find((u) => String(u.id) === String(id)))
        .filter(Boolean),
    [selectedIds, utentiFull]
  );

  // opzioni CF
  const [useCF, setUseCF] = useState(true);
  const [fallbackToSelected, setFallbackToSelected] = useState(true);

  // banner + loading
  const [banner, setBanner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewPreparing, setPreviewPreparing] = useState(false);

  // overlay conferma
  const [showPreview, setShowPreview] = useState(false);

  const stableKey = (f) => `${f.name}::${f.size}`;
  function addFiles(list) {
    const arr = Array.from(list || []);
    if (arr.length === 0) return;

    setItems((prev) => {
      const exist = new Set(prev.map((x) => x.key));
      const seen = new Set();
      const toAdd = [];
      for (const f of arr) {
        const k = stableKey(f);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!exist.has(k)) {
          toAdd.push({
            id: crypto.randomUUID(),
            key: k,
            name: f.name,
            file: f,
            thumb: null,
            cf: null,
            utenteId: null,
          });
        }
      }
      const skipped = seen.size - toAdd.length;
      if (skipped > 0)
        setBanner({
          type: "info",
          text: `Saltati ${skipped} duplicati.`,
        });
      return [...prev, ...toAdd];
    });

    // ✅ crea anteprime in background per i nuovi file
    setTimeout(async () => {
      // usa l'array catturato prima di svuotare l'input
      const arr2 = arr;
      for (const f of arr2) {
        const k = stableKey(f);

        // trova l'item relativo e se non ha thumb lo genera
        setItems((prev) => {
          const idx = prev.findIndex((x) => x.key === k);
          if (idx === -1) return prev;
          if (prev[idx].thumb) return prev; // già ok
          return prev;
        });

        // genero thumb fuori dal setState
        const thumb = await ensureThumbOnly(f);

        if (thumb) {
          setItems((prev) => {
            const idx = prev.findIndex((x) => x.key === k);
            if (idx === -1) return prev;
            if (prev[idx].thumb) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], thumb };
            return next;
          });
        }
      }
    }, 0);

    if (inputRef.current) inputRef.current.value = "";
  }

  async function analizza() {
    if (items.length === 0) {
      setBanner({ type: "info", text: "Aggiungi dei file prima." });
      return;
    }
    setBanner({ type: "info", text: "Analisi in corso…" });

    const updated = [...items];
    for (const it of updated) {
      const { cf, thumbDataUrl } = await detectCFAndThumb(it.file, cfWhitelist);
      let utenteId = null;
      if (cf && utentiByCF.has(cf)) utenteId = utentiByCF.get(cf).id;
      it.cf = cf || null;
      it.thumb = thumbDataUrl || it.thumb;
      it.utenteId = utenteId;
      setItems([...updated]);
    }
    setBanner({
      type: "success",
      text: "Analisi completata. Controlla gli abbinamenti.",
    });
  }

  const computeGlobalTargets = () => {
    if (assegnaMode === "all") {
      return utentiFull
        .filter((u) => u.stato_attivo)
        .map((u) => String(u.id));
    } else if (assegnaMode === "one" || assegnaMode === "some") {
      return Array.from(new Set(selectedIds.map(String)));
    }
    return [];
  };

  const targetSummary = useMemo(() => {
    if (assegnaMode === "all") {
      const count = utentiFull.filter((u) => u.stato_attivo).length;
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
  }, [assegnaMode, selectedUsers, utentiFull]);

  async function carica({ require_signature, signature_placements } = {}) {
    if (!tipoDocumento) {
      setBanner({ type: "info", text: "Seleziona il tipo documento." });
      return;
    }
    if (items.length === 0) {
      setBanner({ type: "info", text: "Nessun file da caricare." });
      return;
    }

    const globalTargets = computeGlobalTargets();

    if (!useCF && globalTargets.length === 0) {
      setBanner({
        type: "info",
        text: "Se non usi il CF, seleziona un target (uno/alcuni/tutti).",
      });
      return;
    }

    setLoading(true);
    setBanner({ type: "info", text: "Caricamento in corso…" });

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        setLoading(false);
        setBanner({ type: "error", text: "Non sei autenticato." });
        return;
      }

      let ok = 0,
        tot = 0;

      for (const it of items) {
        let targetsForFile = [];

        if (useCF && it.utenteId) {
          targetsForFile = [String(it.utenteId)];
        } else if (useCF && !it.utenteId && fallbackToSelected) {
          targetsForFile = [...globalTargets];
        } else if (!useCF) {
          targetsForFile = [...globalTargets];
        } else {
          continue;
        }

        const placementRaw = signature_placements?.[it.id] || null;
        const placement =
          placementRaw && typeof placementRaw === "object"
            ? {
                ...placementRaw,
                page: Number.isFinite(placementRaw.pageIndex)
                  ? placementRaw.pageIndex + 1
                  : placementRaw.page,
              }
            : null;

        for (const uid of targetsForFile) {
          tot += 1;
          const fd = new FormData();
          fd.append("file", it.file, it.name);
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
              "Upload fallito (uid:",
              uid,
              "):",
              await res.text().catch(() => "")
            );
        }
      }

      if (tot === 0) {
        setBanner({
          type: "info",
          text: "Nessun file aveva un target valido (controlla CF/fallback o selezioni).",
        });
      } else {
        setBanner({
          type: ok === tot ? "success" : "error",
          text:
            ok === tot
              ? `Caricati ${ok}/${tot} documenti.`
              : `Completato con errori: ${ok}/${tot} upload.`,
        });
      }
    } catch (e) {
      console.error(e);
      setBanner({ type: "error", text: "Errore durante l'upload." });
    } finally {
      setLoading(false);
      setShowPreview(false);
    }
  }

  async function handleOpenPreview() {
    if (!tipoDocumento) {
      setBanner({ type: "info", text: "Seleziona il tipo documento." });
      return;
    }
    if (items.length === 0) {
      setBanner({ type: "info", text: "Nessun file da caricare." });
      return;
    }

    const globalTargets = computeGlobalTargets();

    if (!useCF && globalTargets.length === 0) {
      setBanner({
        type: "info",
        text: "Se non usi il CF, seleziona un target (uno/alcuni/tutti).",
      });
      return;
    }

    if (previewPreparing) return;
    setPreviewPreparing(true);
    setBanner({ type: "info", text: "Genero anteprime pagine…" });
    try {
      const updated = await Promise.all(
        items.map(async (it) => {
          if (Array.isArray(it.thumbs) && it.thumbs.length) return it;
          if (!it.file) return it;
          if (isPdf(it.file.name, it.file.type)) {
            const thumbs = await renderAllPdfPagesToThumbs(it.file, 1.05);
            return { ...it, thumbs, thumb: thumbs[0] || it.thumb };
          }
          if (isImage(it.file.name, it.file.type)) {
            const thumb = it.thumb || URL.createObjectURL(it.file);
            return { ...it, thumbs: [thumb], thumb };
          }
          return it;
        })
      );
      setItems(updated);
      setShowPreview(true);
      setBanner(null);
    } catch (e) {
      console.error("Anteprime fallite:", e);
      setBanner({ type: "error", text: "Errore durante la generazione anteprime." });
      setShowPreview(true);
    } finally {
      setPreviewPreparing(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* 1. Tipo documento + scadenza */}
      <div className={styles.formGrid}>
        <div className={styles.formRow}>
        <label className={styles.label}>1. Seleziona il tipo documento</label>
          <div className={styles.formRow}>
            <input
              className={`input ${styles.field}`}
              list="tipi-documento-esistenti"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value.toUpperCase())}
              placeholder="Es. CUD, CONTRATTO, VERBALE DISCIPLINARE…"
              required
            />
            <datalist id="tipi-documento-esistenti">
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
            className={`input ${styles.field}`}
            type="date"
            value={dataScadenza}
            onChange={(e) => setDataScadenza(e.target.value)}
          />
        </div>
      </div>

      {/* 3. Dropzone */}
      <div className={styles.formRow}>
        <label className={styles.label}>3. Seleziona file</label>
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
            addFiles(e.dataTransfer.files);
          }}
        >
          <p className={styles.dropText}>Trascina qui PDF/immagini oppure</p>
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
            accept="application/pdf,image/*"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {/* 4. Opzioni CF */}
      <div className={styles.formRow}>
        <label className={styles.label}>4. Analizza</label>
        <div className={styles.dashedBox}>
          <div className={styles.actionsRow}>
            <div className={styles.cfBox}>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={useCF}
                  onChange={(e) => setUseCF(e.target.checked)}
                />
                <span>
                  Abbina automaticamente per Codice Fiscale (se rilevato)
                </span>
              </label>
              <label
                className={`${styles.switch} ${
                  !useCF ? styles.switchDisabled : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={fallbackToSelected}
                  disabled={!useCF}
                  onChange={(e) => setFallbackToSelected(e.target.checked)}
                />
                <span>Se non trovato, assegna ai selezionati</span>
              </label>
            </div>

            <div className={styles.actionsButtons}>
              <button className={`btn ${styles.secondaryBtn}`} onClick={analizza}>
                Analizza & abbina per CF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista file */}
      <div className={styles.cards}>
        {items.map((it) => {
          const u = it.utenteId
            ? utentiFull.find((x) => x.id === it.utenteId)
            : null;
          return (
            <div
              className={`card ${styles.fileCard} ${
                it.utenteId ? styles.fileCardOk : ""
              }`}
              key={it.id}
            >
              <div className={styles.thumb}>
                {it.thumb ? (
                  <img src={it.thumb} alt={it.name} />
                ) : (
                  <div className={styles.thumbPlaceholder}>Anteprima</div>
                )}
              </div>
              <div className={styles.meta}>
                <div className={styles.fileTitle} title={it.name}>
                  {it.name}
                </div>
                <div className={styles.fileSub}>
                  CF:{" "}
                  {it.cf ? (
                    <b>{it.cf}</b>
                  ) : (
                    <span className={styles.muted}>non rilevato</span>
                  )}
                </div>
                <div className={styles.assignInline}>
                  {u ? (
                    <span className={styles.chip}>
                      {u.cognome} {u.nome}
                    </span>
                  ) : (
                    <span className={styles.muted}>
                      Nessun dipendente abbinato
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!items.length && (
          <div className={styles.emptyHint}>
            Nessun file aggiunto. Trascina qui i PDF/immagini per iniziare.
          </div>
        )}
      </div>

      {/* 5. Assegna a */}
      <div className={styles.formRow}>
        <label className={styles.label}>5. Assegna a</label>
        <fieldset className={styles.assignBox}>
          <div className={styles.assignRadios}>
            <label className={styles.radio}>
              <input
                type="radio"
                name="assign"
                checked={assegnaMode === "one"}
                onChange={() => {
                  setAssegnaMode("one");
                  setSelectedIds((prev) => prev.slice(0, 1));
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
                  <span className={styles.chip} key={u.id}>
                    {u.cognome} {u.nome}
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.filter((id) => String(id) !== String(u.id))
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedUsers.length === 0 && (
                  <span className={styles.chipHint}>Nessuno selezionato</span>
                )}
              </div>
            </div>
          )}
        </fieldset>
      </div>

      {/* Banner notifiche */}
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
            type="button"
            className={`btn ${styles.bannerClose}`}
            onClick={() => setBanner(null)}
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Modal anteprima caricamento (riutilizzabile) */}
      <ConfermaCaricamentoDocumenti
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={carica}
        items={items}
        tipoDocumento={tipoDocumento}
        dataScadenza={dataScadenza}
        assegnamentoLabel={targetSummary}
        useCF={useCF}
        fallbackToSelected={fallbackToSelected}
        utentiFull={utentiFull}
        loading={loading}
      />

      {/* Selettore dipendenti */}
      {showPicker && (
        <SelettoreDipendenti
          allowMultiple={assegnaMode === "some" || assegnaMode === "all"}
          preselectedIds={selectedIds}
          onClose={() => setShowPicker(false)}
          onConfirm={(ids) => {
            setSelectedIds(ids || []);
            setShowPicker(false);
          }}
        />
      )}

      <button
        className={`btn-primary ${styles.primaryBtn}`}
        onClick={handleOpenPreview}
        disabled={loading || previewPreparing}
      >
        {loading ? "Carico…" : previewPreparing ? "Preparo anteprime…" : "Carica"}
      </button>
    </div>
  );
}
