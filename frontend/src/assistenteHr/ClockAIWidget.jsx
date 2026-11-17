import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "./apiAssistente";
import ResultTable from "./ResultTable";
import MiniGauge from "./UsageMeter";
import ConversationSidebar from "./ConversationSidebar";
import styles from "./AssistenteHr.module.css";
import {
  IoSparklesOutline,
  IoPaperPlaneOutline,
  IoCloseOutline,
  IoThumbsUpOutline,
  IoThumbsUp,
  IoThumbsDownOutline,
  IoThumbsDown,
} from "react-icons/io5";
import { useConfirm } from "../components/ui/ConfirmDialog";

const MESSAGGIO_BENVENUTO = `Ciao! 👋

Sono **ClockAI**, l'assistente HR di ClockEasy. Sono qui per aiutarti con domande su:

- **Dipendenti**: ricerca, dati anagrafici, ore lavorate
- **Presenze**: timbrature, chi non ha timbrato, assenze
- **Documenti**: firme pendenti, documenti scaduti

Come posso aiutarti oggi?`;

const MESSAGGIO_INIZIALE = { ruolo: "assistant", testo: MESSAGGIO_BENVENUTO, iniziale: true };

// `dati` è un array di risultati (uno per tool eseguito); le conversazioni
// salvate prima di questa modifica hanno un singolo oggetto.
function elencoDati(dati) {
  if (!dati) return [];
  return Array.isArray(dati) ? dati : [dati];
}

export default function ClockAIWidget() {
  const confirm = useConfirm();
  const [aperto, setAperto] = useState(false);

  // { ruolo: 'user'|'assistant', testo, dati?, iniziale? } — il messaggio "iniziale"
  // è solo un saluto statico in UI, non fa parte della conversazione persistita.
  const [messaggi, setMessaggi] = useState([MESSAGGIO_INIZIALE]);
  const [conversazioni, setConversazioni] = useState([]);
  const [conversazioneId, setConversazioneId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");
  const [blocco, setBlocco] = useState(null); // messaggio quando l'assistente non è utilizzabile (saldo/budget esaurito)
  const [consumo, setConsumo] = useState(null); // { oggi: {speso,limite,percentuale}, mese: {...} }
  const fineListaRef = useRef(null);

  useEffect(() => {
    if (!aperto) return;
    // Auto-scroll confinato alla lista messaggi del pannello, mai alla pagina sottostante.
    fineListaRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messaggi, loading, aperto]);

  const caricaConversazioni = useCallback(async () => {
    try {
      const res = await apiFetch("/assistente-hr/conversazioni");
      if (res.ok) setConversazioni(await res.json());
    } catch {
      // silenzioso: la sidebar è un'informazione accessoria
    }
  }, []);

  useEffect(() => {
    if (!aperto) return;
    caricaConversazioni();
    (async () => {
      try {
        const res = await apiFetch("/assistente-hr/consumo");
        if (res.ok) setConsumo(await res.json());
      } catch {
        // silenzioso
      }
    })();
  }, [aperto, caricaConversazioni]);

  const nuovaConversazione = useCallback(() => {
    setConversazioneId(null);
    setMessaggi([MESSAGGIO_INIZIALE]);
    setErrore("");
  }, []);

  const apriConversazione = useCallback(async (id) => {
    setErrore("");
    try {
      const res = await apiFetch(`/assistente-hr/conversazioni/${id}`);
      if (!res.ok) throw new Error("Impossibile aprire la conversazione");
      const data = await res.json();
      setConversazioneId(data.id);
      setMessaggi(data.messaggi);
    } catch (err) {
      setErrore(err.message || "Errore nell'apertura della conversazione");
    }
  }, []);

  const eliminaConversazione = useCallback(
    async (id) => {
      const ok = await confirm({
        title: "Eliminare la conversazione?",
        message: "Eliminare questa conversazione?",
        danger: true,
        confirmLabel: "Elimina",
      });
      if (!ok) return;
      try {
        const res = await apiFetch(`/assistente-hr/conversazioni/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Impossibile eliminare la conversazione");
        setConversazioni((prev) => prev.filter((c) => c.id !== id));
        if (conversazioneId === id) nuovaConversazione();
      } catch (err) {
        setErrore(err.message || "Errore nell'eliminazione");
      }
    },
    [conversazioneId, nuovaConversazione, confirm]
  );

  const invia = useCallback(
    async (e) => {
      e.preventDefault();
      const domanda = input.trim();
      if (!domanda || loading || blocco) return;

      setErrore("");
      setMessaggi((prev) => [...prev, { ruolo: "user", testo: domanda }]);
      setInput("");
      setLoading(true);

      try {
        const res = await apiFetch("/assistente-hr/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domanda, conversazione_id: conversazioneId }),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (j.error === "saldo_esaurito" || j.error === "budget_esaurito") {
            if (j.consumo) setConsumo(j.consumo);
            setBlocco(j.message || "ClockAI non disponibile al momento.");
            return;
          }
          throw new Error(j.message || j.error || `Errore ${res.status}`);
        }

        if (j.consumo) setConsumo(j.consumo);
        if (j.conversazione_id != null) {
          const eraNuova = conversazioneId == null;
          setConversazioneId(j.conversazione_id);
          if (eraNuova) caricaConversazioni();
        }
        setMessaggi((prev) => [
          ...prev,
          { id: j.messaggio_id, ruolo: "assistant", testo: j.risposta, dati: j.dati, feedback: null },
        ]);
      } catch (err) {
        setErrore(err.message || "Errore nella richiesta");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, blocco, conversazioneId, caricaConversazioni]
  );

  // Cliccare di nuovo sullo stesso pollice toglie il feedback.
  const inviaFeedback = useCallback(async (messaggioId, valoreAttuale, valore) => {
    const nuovo = valoreAttuale === valore ? 0 : valore;
    const aggiorna = (v) =>
      setMessaggi((prev) => prev.map((m) => (m.id === messaggioId ? { ...m, feedback: v || null } : m)));
    aggiorna(nuovo);
    try {
      const res = await apiFetch(`/assistente-hr/messaggi/${messaggioId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valore: nuovo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      aggiorna(valoreAttuale);
      setErrore("Impossibile salvare il feedback");
    }
  }, []);

  return (
    <>
      <button
        className={styles.fab}
        onClick={() => setAperto((v) => !v)}
        aria-label={aperto ? "Chiudi ClockAI" : "Apri ClockAI"}
        title="ClockAI"
      >
        {aperto ? <IoCloseOutline size={26} /> : <IoSparklesOutline size={24} />}
      </button>

      {aperto && (
        <>
          <div className={styles.backdrop} onClick={() => setAperto(false)} />

          <div className={styles.pageLayout}>
            <ConversationSidebar
              conversazioni={conversazioni}
              conversazioneAttivaId={conversazioneId}
              onNuova={nuovaConversazione}
              onApri={apriConversazione}
              onElimina={eliminaConversazione}
            />

            <div className={styles.main}>
              <div className={styles.header}>
                <IoSparklesOutline size={18} className={styles.headerIcon} />
                <h1 className={styles.title}>ClockAI</h1>
                <button className={styles.closeBtn} onClick={() => setAperto(false)} aria-label="Chiudi">
                  <IoCloseOutline size={18} />
                </button>
              </div>

              <div className={styles.chatBody}>
                <div className={styles.chatInner}>
                  {blocco && <div className={styles.alertSaldo}>⚠️ {blocco}</div>}

                  {messaggi.map((m, i) =>
                    m.ruolo === "user" ? (
                      <div key={i} className={`${styles.msgRow} ${styles.me}`}>
                        <div className={styles.bubble}>
                          <div className={styles.bubbleBody}>{m.testo}</div>
                        </div>
                      </div>
                    ) : (
                      <div key={i} className={`${styles.msgRow} ${styles.other}`}>
                        <div className={styles.avatar}>
                          <IoSparklesOutline size={14} />
                        </div>
                        <div className={styles.otherContent}>
                          <div className={styles.bubbleBody}>
                            <ReactMarkdown>{m.testo}</ReactMarkdown>
                          </div>
                          {elencoDati(m.dati).map((d, j, tutti) => (
                            <ResultTable key={j} dati={d} mostraTitolo={tutti.length > 1} />
                          ))}
                          {m.id != null && (
                            <div className={styles.feedbackRow}>
                              <button
                                type="button"
                                className={`${styles.feedbackBtn} ${m.feedback === 1 ? styles.feedbackAttivo : ""}`}
                                onClick={() => inviaFeedback(m.id, m.feedback, 1)}
                                aria-label="Risposta utile"
                                aria-pressed={m.feedback === 1}
                                title="Risposta utile"
                              >
                                {m.feedback === 1 ? <IoThumbsUp size={14} /> : <IoThumbsUpOutline size={14} />}
                              </button>
                              <button
                                type="button"
                                className={`${styles.feedbackBtn} ${m.feedback === -1 ? styles.feedbackAttivo : ""}`}
                                onClick={() => inviaFeedback(m.id, m.feedback, -1)}
                                aria-label="Risposta non utile"
                                aria-pressed={m.feedback === -1}
                                title="Risposta non utile o sbagliata"
                              >
                                {m.feedback === -1 ? <IoThumbsDown size={14} /> : <IoThumbsDownOutline size={14} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {loading && (
                    <div className={`${styles.msgRow} ${styles.other}`}>
                      <div className={styles.avatar}>
                        <IoSparklesOutline size={14} />
                      </div>
                      <div className={styles.typingDots}>
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}

                  <div ref={fineListaRef} />
                </div>
              </div>

              <div className={styles.composeWrap}>
                <div className={styles.composeInner}>
                  {errore && <div className={styles.errorBox}>{errore}</div>}
                  <form className={styles.composeForm} onSubmit={invia}>
                    <textarea
                      className={styles.composeTextarea}
                      placeholder={blocco ? "Assistente non disponibile" : "Scrivi una domanda… (Ctrl/Cmd + Enter per inviare)"}
                      value={input}
                      disabled={!!blocco}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") invia(e);
                      }}
                    />
                    <MiniGauge consumo={consumo} />
                    <button className={styles.btnPrimary} type="submit" disabled={!input.trim() || loading || !!blocco}>
                      <IoPaperPlaneOutline size={16} />
                    </button>
                  </form>
                  <p className={styles.avvisoAi}>
                    ClockAI usa un servizio AI esterno e può sbagliare: verifica i dati nella tabella sotto la
                    risposta. Le conversazioni vengono cancellate dopo 90 giorni.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
