// frontend/src/pages/WhistleblowingPage.jsx
import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'https://clockeasy-api.onrender.com';

const RELATIONSHIP_OPTIONS = [
  { value: '', label: '— Seleziona —' },
  { value: 'dipendente', label: 'Dipendente' },
  { value: 'ex_dipendente', label: 'Ex dipendente' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fornitore', label: 'Fornitore' },
  { value: 'contraente', label: 'Contraente / Appaltatore' },
  { value: 'altro', label: 'Altro' },
];

const CATEGORIES = [
  '— Seleziona —',
  'Appalti pubblici',
  'Competenza',
  'Corruzione / Tangenti',
  'Imposte sulle società',
  "Interessi finanziari dell'Unione europea",
  'Molestie sessuali',
  'Molestie sul posto di lavoro',
  'Prevenzione del riciclaggio di denaro / finanziamento del terrorismo',
  'Proprietà intellettuale',
  'Protezione ambientale',
  'Protezione clienti',
  'Radioprotezione e sicurezza nucleare',
  'Salute pubblica',
  'Sicurezza alimentare',
  'Sicurezza dei prodotti',
  'Sicurezza dei trasporti',
  'Sicurezza delle reti e dei sistemi informativi',
  'Tutela dei dati personali e della privacy',
];

const STATUS_LABELS = {
  ricevuta: 'Ricevuta',
  in_lavorazione: 'In lavorazione',
  chiusa: 'Chiusa',
  respinta: 'Respinta',
};
const STATUS_COLORS = {
  ricevuta: '#D97706',
  in_lavorazione: '#2563EB',
  chiusa: '#16A34A',
  respinta: '#DC2626',
};

/* ─── Root ─── */
export default function WhistleblowingPage() {
  const [view, setView] = useState('home');
  const [trackPrefill, setTrackPrefill] = useState(null);

  useEffect(() => {
    document.title = 'Whistleblowing – ClockEasy';
    return () => { document.title = 'ClockEasy'; };
  }, []);

  if (view === 'legal') return <LegalPage onBack={() => setView('home')} />;
  if (view === 'privacy') return <PrivacyPage onBack={() => setView('home')} />;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <a href="/" style={{ lineHeight: 0 }}>
            <img src="/Logo_esteso.png" alt="ClockEasy" style={{ height: 26, width: 'auto' }} />
          </a>
          <div style={{ display: 'flex', gap: 16 }}>
            {view !== 'track' && (
              <button style={s.navBtn} onClick={() => { setTrackPrefill(null); setView('track'); }}>
                Segui segnalazione
              </button>
            )}
            {view !== 'home' && (
              <button style={s.navBtn} onClick={() => setView('home')}>← Home</button>
            )}
          </div>
        </div>
      </header>

      <main style={s.main}>
        {view === 'home' && (
          <HomeView
            onNew={() => setView('wizard')}
            onTrack={() => { setTrackPrefill(null); setView('track'); }}
            onLegal={() => setView('legal')}
            onPrivacy={() => setView('privacy')}
          />
        )}
        {view === 'wizard' && (
          <WbWizard
            onBack={() => setView('home')}
            onDone={(protocol, password) => { setTrackPrefill({ protocol, password }); setView('track'); }}
            onLegal={() => setView('legal')}
            onPrivacy={() => setView('privacy')}
          />
        )}
        {view === 'track' && (
          <TrackView prefill={trackPrefill} onBack={() => setView('home')} />
        )}
      </main>

      <footer style={s.footer}>
        <p style={s.footerText}>
          © {new Date().getFullYear()} ClockEasy —{' '}
          <button style={s.footerLink} onClick={() => setView('legal')}>Sistema informativo interno</button>
          {' · '}
          <button style={s.footerLink} onClick={() => setView('privacy')}>Informativa privacy</button>
          {' · '}
          Conforme al D.Lgs. 24/2023
        </p>
      </footer>
    </div>
  );
}

/* ─── Home ─── */
function HomeView({ onNew, onTrack, onLegal, onPrivacy }) {
  return (
    <div style={s.container}>
      <div style={s.heroSection}>
        <span style={s.badge}>🔒 Spazio sicuro</span>
        <h1 style={s.heroTitle}>Segnalazione Whistleblowing</h1>
        <p style={s.heroSub}>
          Le informazioni vengono criptate. Solo la persona designata dall'azienda potrà accedervi.
          Nessun dato personale è richiesto.
        </p>
      </div>

      <div style={s.stepsRow}>
        {['Compila il modulo', 'Crea una password', 'Ricevi il codice'].map((label, i) => (
          <div key={i} style={s.stepItem}>
            <div style={s.stepNum}>{i + 1}</div>
            <span style={s.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div style={s.actionRow}>
        <button style={s.btnPrimary} onClick={onNew}>Nuova segnalazione</button>
        <button style={s.btnSecondary} onClick={onTrack}>Segui segnalazione esistente</button>
      </div>

      <div style={s.legalLinks}>
        <button style={s.textLink} onClick={onLegal}>Sistema informativo interno e difesa dell'informatore</button>
        <span style={{ color: '#CBD5E1' }}>·</span>
        <button style={s.textLink} onClick={onPrivacy}>Informativa sulla privacy</button>
      </div>

      <div style={s.infoSection}>
        <p style={s.infoTitle}>Usa questo modulo per segnalare:</p>
        <div style={s.categoryList}>
          {CATEGORIES.slice(1).map(c => (
            <span key={c} style={s.categoryTag}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Wizard ─── */
function WbWizard({ onBack, onDone, onLegal, onPrivacy }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ relationship: '', category: '', title: '', description: '', policy: false });
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const fileRef = useRef();

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleFileAdd = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...picked.filter(f => !seen.has(f.name + f.size))];
    });
    e.target.value = '';
  };

  const next = async () => {
    setError('');
    if (step === 0) {
      if (!form.relationship) return setError("Seleziona il rapporto con l'azienda.");
      if (!form.category || form.category === '— Seleziona —') return setError('Seleziona il tipo di condotta.');
      if (!form.description.trim()) return setError('La descrizione è obbligatoria.');
      if (!form.policy) return setError("Devi accettare l'informativa per procedere.");
      setStep(1);
    } else if (step === 1) {
      if (password.length < 8) return setError('La password deve essere di almeno 8 caratteri.');
      if (password !== confirmPwd) return setError('Le password non coincidono.');
      await submit();
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      const relLabel = RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship)?.label || form.relationship;
      const res = await fetch(`${API_BASE}/wb/anon/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || form.category,
          description: `Rapporto: ${relLabel}\n\n${form.description.trim()}`,
          categoryId: null,
          policyAccepted: true,
          relationship: relLabel,
          password,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Errore ${res.status}`);
      }
      const { protocol } = await res.json();
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await fetch(
          `${API_BASE}/wb/anon/attachments/${encodeURIComponent(protocol)}/${encodeURIComponent(password)}`,
          { method: 'POST', body: fd }
        ).catch(() => {});
      }
      setReceipt({ protocol });
      setStep(2);
    } catch (e) {
      setError(e.message || 'Invio non riuscito.');
    } finally {
      setLoading(false);
    }
  };

  const STEPS = ['Compila il modulo', 'Crea una password', 'Ricevi il codice'];

  return (
    <div style={s.container}>
      <button style={s.backLink} onClick={step === 0 ? onBack : () => setStep(st => st - 1)}>
        ← {step === 0 ? 'Home' : STEPS[step - 1]}
      </button>

      {/* Step indicator */}
      <div style={s.stepIndicator}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                ...s.stepDot,
                background: i < step ? '#16A34A' : i === step ? '#6A57D3' : '#E2E8F0',
                color: i <= step ? '#fff' : '#9CA3AF',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <div style={{ ...s.stepDotLabel, color: i === step ? '#0F172A' : '#9CA3AF', fontWeight: i === step ? 600 : 400 }}>
                {label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? '#16A34A' : '#E2E8F0', alignSelf: 'flex-start', marginTop: 14 }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 */}
      {step === 0 && (
        <div style={s.formCard}>
          <h2 style={s.formTitle}>Dicci cosa è successo</h2>

          <Field label="Rapporto con l'azienda *">
            <select style={s.select} value={form.relationship} onChange={e => up('relationship', e.target.value)}>
              {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Tipo di condotta scorretta *">
            <select style={s.select} value={form.category} onChange={e => up('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Titolo breve (opzionale)">
            <input style={s.input} type="text" placeholder="Es. Pressioni indebite su fornitore…" maxLength={120}
              value={form.title} onChange={e => up('title', e.target.value)} />
          </Field>

          <Field label="Descrizione *">
            <textarea style={{ ...s.input, height: 140, resize: 'vertical' }}
              placeholder="Descrivi cosa è accaduto, dove, quando e chi è coinvolto."
              value={form.description} onChange={e => up('description', e.target.value)} />
          </Field>

          <Field label="Allegati (opzionale)">
            <button type="button" style={s.uploadBtn} onClick={() => fileRef.current?.click()}>
              Aggiungi file
            </button>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileAdd} />
            {files.map((f, i) => (
              <div key={i} style={s.fileRow}>
                <span style={{ flex: 1, fontSize: 13, color: '#334155' }}>{f.name}</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button style={s.fileRemove} onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </Field>

          <label style={s.checkRow}>
            <input type="checkbox" checked={form.policy} onChange={e => up('policy', e.target.checked)} />
            <span style={s.checkText}>
              Ho letto e preso visione del{' '}
              <button style={s.inlineLink} onClick={onLegal}>Sistema informativo interno e difesa dell'informatore</button>
              {' '}e dell'{' '}
              <button style={s.inlineLink} onClick={onPrivacy}>Informativa sulla privacy</button>.
            </span>
          </label>

          {error && <p style={s.error}>{error}</p>}
          <button style={s.btnPrimary} onClick={next}>Avanti →</button>
        </div>
      )}

      {/* Step 2 */}
      {step === 1 && (
        <div style={s.formCard}>
          <h2 style={s.formTitle}>Crea una password</h2>
          <p style={s.formSub}>
            Scegli una password di almeno 8 caratteri che ricorderai.
            Ti servirà insieme al codice protocollo per seguire la segnalazione.
          </p>

          <div style={s.summaryBox}>
            <SummaryRow k="Rapporto" v={RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship)?.label} />
            <SummaryRow k="Condotta" v={form.category} />
            {form.title && <SummaryRow k="Titolo" v={form.title} />}
          </div>

          <div style={s.warnBox}>
            ⚠️ Se perdi la password non potrai più accedere alla tua segnalazione.
          </div>

          <Field label="Password *">
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 40 }}
                type={showPwd ? 'text' : 'password'}
                placeholder="Minimo 8 caratteri"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password" />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 0 }}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
            {password.length > 0 && <PwdStrength password={password} />}
          </Field>

          <Field label="Conferma password *">
            <input style={{ ...s.input, borderColor: confirmPwd && confirmPwd !== password ? '#EF4444' : undefined }}
              type={showPwd ? 'text' : 'password'}
              placeholder="Ripeti la password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              autoComplete="new-password" />
            {confirmPwd && confirmPwd !== password && <p style={{ color: '#EF4444', fontSize: 12, margin: '4px 0 0' }}>Le password non coincidono</p>}
          </Field>

          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={next} disabled={loading}>
            {loading ? 'Invio in corso…' : 'Invia segnalazione'}
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 2 && receipt && (
        <div style={s.formCard}>
          <div style={s.successHeader}>
            <span style={{ fontSize: 32 }}>✅</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0F172A' }}>Segnalazione inviata</h2>
              <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 14 }}>Ricevuta in modo sicuro.</p>
            </div>
          </div>

          <div style={s.receiptBox}>
            <p style={s.receiptLabel}>Codice protocollo</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={s.receiptCode}>{receipt.protocol}</code>
              <CopyBtn text={receipt.protocol} />
            </div>
          </div>

          <div style={s.warnBox}>
            Salva il <strong>codice protocollo</strong> e la tua <strong>password</strong>.
            Senza questi dati non potrai seguire la segnalazione.
          </div>

          <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, margin: '16px 0' }}>
            Per seguire l'avanzamento clicca <strong>Segui la segnalazione</strong>,
            inserisci il codice protocollo e la password.
          </p>

          <button style={s.btnPrimary} onClick={() => onDone(receipt.protocol, password)}>
            Segui la segnalazione
          </button>
        </div>
      )}
    </div>
  );
}

function PwdStrength({ password }) {
  const score = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const colors = ['#EF4444', '#F59E0B', '#3B82F6', '#16A34A'];
  const labels = ['Debole', 'Discreta', 'Buona', 'Forte'];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < score ? colors[score - 1] : '#E2E8F0' }} />)}
      </div>
      <span style={{ fontSize: 11, color: colors[score - 1] || '#94A3B8' }}>{labels[score - 1] || ''}</span>
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch (_) {}
  };
  return <button style={s.copyBtn} onClick={copy}>{done ? '✓ Copiato' : 'Copia'}</button>;
}

/* ─── Track ─── */
function TrackView({ prefill, onBack }) {
  const [protocol, setProtocol] = useState(prefill?.protocol || '');
  const [password, setPassword] = useState(prefill?.password || '');
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    if (prefill?.protocol && prefill?.password) load(prefill.protocol, prefill.password);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (thread) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const load = async (p, pwd) => {
    setLoading(true); setError(''); setThread(null);
    try {
      const res = await fetch(`${API_BASE}/wb/anon/thread/${encodeURIComponent(p)}/${encodeURIComponent(pwd)}`);
      if (res.status === 403) throw new Error('Protocollo o password non corretti.');
      if (res.status === 404) throw new Error('Segnalazione non trovata.');
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setThread(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `${API_BASE}/wb/anon/thread/${encodeURIComponent(protocol)}/${encodeURIComponent(password)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) }
      );
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setReply('');
      await load(protocol, password);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  const status = thread?.status;

  return (
    <div style={s.container}>
      <button style={s.backLink} onClick={onBack}>← Home</button>

      <div style={s.formCard}>
        <h2 style={s.formTitle}>Segui la tua segnalazione</h2>
        <p style={s.formSub}>Inserisci il codice protocollo e la password scelta al momento dell'invio.</p>

        <Field label="Codice protocollo">
          <input style={s.input} type="text" placeholder="Es. WB-2026-123456"
            value={protocol} onChange={e => setProtocol(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Password">
          <input style={s.input} type="password" placeholder="La tua password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(protocol, password)} />
        </Field>

        {error && <p style={s.error}>{error}</p>}
        <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={() => load(protocol, password)} disabled={loading}>
          {loading ? 'Caricamento…' : 'Carica thread'}
        </button>
      </div>

      {thread && (
        <div style={s.formCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, color: '#0F172A' }}>{thread.title}</h3>
              <code style={{ color: '#6A57D3', fontSize: 12 }}>{thread.protocol}</code>
            </div>
            <span style={{
              background: (STATUS_COLORS[status] || '#64748B') + '18',
              color: STATUS_COLORS[status] || '#64748B',
              border: `1px solid ${(STATUS_COLORS[status] || '#64748B')}44`,
              borderRadius: 20, padding: '3px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>

          <ProgressBar status={status} />

          <div style={s.messages}>
            {thread.messages?.map((msg, i) => <Bubble key={i} msg={msg} />)}
            <div ref={endRef} />
          </div>

          {status !== 'chiusa' && status !== 'respinta' && (
            <div style={{ marginTop: 16 }}>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }}
                placeholder="Scrivi un messaggio al responsabile…"
                value={reply} onChange={e => setReply(e.target.value)} />
              <button style={{ ...s.btnPrimary, marginTop: 8, opacity: sending ? 0.7 : 1 }}
                onClick={send} disabled={sending || !reply.trim()}>
                {sending ? 'Invio…' : 'Invia risposta'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ status }) {
  const steps = ['ricevuta', 'in_lavorazione', 'chiusa'];
  const idx = steps.indexOf(status);
  const labels = ['Ricevuta', 'In lavorazione', 'Chiusa'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', margin: '0 auto 4px',
              background: i <= idx ? '#6A57D3' : '#E2E8F0',
              color: i <= idx ? '#fff' : '#9CA3AF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
            }}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 11, color: i <= idx ? '#6A57D3' : '#9CA3AF', fontWeight: i === idx ? 600 : 400 }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: i < idx ? '#6A57D3' : '#E2E8F0', marginBottom: 16 }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Bubble({ msg }) {
  const isMe = msg.sender === 'reporter';
  const isSys = msg.sender === 'sistema';
  if (isSys) return (
    <div style={{ textAlign: 'center', margin: '8px 0' }}>
      <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 20, padding: '3px 12px', fontSize: 12 }}>
        {msg.body}
      </span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', margin: '8px 0' }}>
      <span style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>
        {isMe ? 'Tu' : 'Responsabile'} · {new Date(msg.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
      <div style={{
        maxWidth: '80%', padding: '9px 13px', fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
        background: isMe ? '#6A57D3' : '#F1F5F9',
        color: isMe ? '#fff' : '#0F172A',
        borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
      }}>
        {msg.body}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function SummaryRow({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, minWidth: 70, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>{k}</span>
      <span style={{ fontSize: 14, color: '#0F172A' }}>{v}</span>
    </div>
  );
}

/* ─── Legal pages ─── */
function LegalPage({ onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div style={s.legalPage}>
      <div style={s.legalInner}>
        <button style={s.backLink} onClick={onBack}>← Torna al modulo</button>
        <h1 style={s.legalTitle}>Principi generali del Sistema interno di informazione e difesa dell'informatore</h1>

        <LegalSection title="Fatti rilevabili">
          <p>Il Canale delle Segnalazioni è uno strumento che consente la comunicazione di comportamenti che possono costituire mancanze o irregolarità che potrebbero andare contro gli interessi dell'Unione Europea o costituire un atto illecito o una violazione delle normative applicabili.</p>
        </LegalSection>

        <LegalSection title="Diritti del segnalatore">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { t: "Diritto all'anonimato", d: "Il segnalatore può mantenere l'anonimato riguardo alla propria identità durante tutto il processo. È facoltativo includere dati che consentano la sua identificazione." },
              { t: 'Diritto alla riservatezza', d: "Il contenuto del rapporto e l'identità del segnalatore saranno riservati e non potranno essere rivelati a nessuno senza esplicito consenso, salvo eccezioni previste dalla legge." },
              { t: 'Divieto di ritorsione', d: "Il segnalatore sarà protetto contro le ritorsioni, anche se l'indagine verifica che non ci sia stata alcuna violazione, a condizione che non abbia agito in malafede." },
              { t: 'Diritto di scelta', d: 'Il segnalatore può scegliere il canale più appropriato, potendo utilizzare canali interni o esterni (autorità competenti).' },
              { t: 'Diritto di ricevere informazioni', d: 'Il segnalatore ha il diritto di essere informato sullo stato della sua segnalazione e dei risultati delle indagini.' },
              { t: 'Diritto a informazioni limitate', d: "Il segnalatore non sarà obbligato a fornire dati non strettamente necessari. Le informazioni fornite non possono essere utilizzate per scopi diversi dall'indagine." },
              { t: 'Diritto di esercitare i diritti di protezione dei dati', d: 'Il segnalatore avrà il diritto di esercitare i diritti conferiti dalla normativa sulla protezione dei dati personali.' },
              { t: 'Diritto di ricevere una risposta entro un periodo ragionevole', d: 'Conferma di ricezione entro 7 giorni dalla ricezione. Il termine per l\'elaborazione delle indagini non può superare i tre mesi.' },
              { t: 'Diritto alla cancellazione dei dati', d: 'Dopo tre mesi, i dati devono essere cancellati dal sistema, tranne quando necessario per conservare prove o in caso di procedimenti giudiziari.' },
            ].map(item => (
              <div key={item.t} style={{ borderLeft: '2px solid #6A57D3', paddingLeft: 12 }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{item.t}</p>
                <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: 14 }}>{item.d}</p>
              </div>
            ))}
          </div>
        </LegalSection>

        <LegalSection title="Impostazione di misure disciplinari">
          <p>Se durante l'indagine è verificato che i fatti sono veri e collegati a condotte irregolari o illecite, la persona segnalata può essere soggetta a sanzioni in conformità alla legislazione del lavoro e ad altre obbligazioni civili e commerciali. I fatti possono essere resi disponibili alle autorità competenti se possono costituire un reato.</p>
        </LegalSection>

        <LegalSection title="Comunicazione di segnalazioni false o in malafede">
          <p>Il Canale delle Segnalazioni deve essere utilizzato in modo responsabile. Se i fatti segnalati risultano manifestamente falsi e la segnalazione è presentata in mala fede: (i) la segnalazione verrà archiviata; (ii) la circostanza sarà trasferita al responsabile competente per le misure disciplinari; (iii) la sanzione verrà comunicata all'organo di gestione competente.</p>
        </LegalSection>

        <LegalSection title="Procedura di indagine">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Fase iniziale</p>
          <p>Il segnalatore compila il modulo di reclamo. La segnalazione deve essere individuale. L'azienda conferma la ricezione entro 7 giorni e può richiedere informazioni aggiuntive se necessario.</p>
          <p style={{ fontWeight: 600, margin: '16px 0 6px' }}>Fase istruttiva</p>
          <p>Apertura della procedura con assegnazione di un livello di rischio (BASSO, MEDIO, ALTO o CRITICO). Il termine di risoluzione non supererà i 3 mesi, prorogabili a 6 in casi eccezionali.</p>
          <p style={{ fontWeight: 600, margin: '16px 0 6px' }}>Fase di risoluzione</p>
          <p>L'azienda emetterà una Risoluzione comunicata al segnalatore e alla parte segnalata. Le risoluzioni possibili sono: verifica con misure correttive; nessuna verifica con chiusura del caso; rinvio a un'altra istanza.</p>
        </LegalSection>

        <button style={s.btnPrimary} onClick={onBack}>← Torna al modulo</button>
      </div>
    </div>
  );
}

function PrivacyPage({ onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div style={s.legalPage}>
      <div style={s.legalInner}>
        <button style={s.backLink} onClick={onBack}>← Torna al modulo</button>
        <h1 style={s.legalTitle}>Informativa sulla protezione dei dati personali</h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 28 }}>
          Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 24/2023.
        </p>

        <LegalSection title="1. Titolare del trattamento">
          <p><strong>ClockEasy</strong> è il titolare del trattamento dei dati personali raccolti tramite questo Canale di Segnalazione Whistleblowing.</p>
          <p style={{ marginTop: 8 }}>Per informazioni o per esercitare i tuoi diritti: <strong>privacy@clockeasy.it</strong></p>
        </LegalSection>

        <LegalSection title="2. Quali dati raccogliamo">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Dati del segnalatore (se non anonimo):</p>
          <ul style={s.ul}>
            <li>Dati identificativi: nome, cognome</li>
            <li>Contatti: email, telefono</li>
            <li>Prove: descrizione dei fatti, documenti allegati</li>
          </ul>
          <p style={{ fontWeight: 600, margin: '14px 0 6px' }}>Dati della persona segnalata:</p>
          <ul style={s.ul}>
            <li>Dati identificativi e di contatto</li>
            <li>Dati relativi alla condotta: dati lavorativi, fiscali, finanziari se forniti nel corso dell'indagine</li>
          </ul>
        </LegalSection>

        <LegalSection title="3. Finalità del trattamento">
          <ul style={s.ul}>
            <li>Ricezione e gestione delle segnalazioni</li>
            <li>Indagine e proposta di risoluzioni nei tempi previsti dalla normativa</li>
            <li>Adozione di eventuali misure disciplinari</li>
            <li>Avvio di azioni legali nei confronti delle persone interessate</li>
            <li>Conservazione delle prove del corretto funzionamento del sistema</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Base giuridica">
          <ul style={s.ul}>
            <li><strong>Obbligo legale</strong> (art. 6.1.c GDPR): ai sensi del D.Lgs. 24/2023 sulla Protezione degli Informatori</li>
            <li><strong>Interesse pubblico</strong> (art. 6.1.e GDPR): per dati di categoria speciale</li>
            <li><strong>Interesse legittimo</strong> (art. 6.1.f GDPR): per la conservazione delle prove</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Conservazione dei dati">
          <p>I dati saranno conservati per il tempo necessario alla gestione della segnalazione. In generale, non oltre <strong>10 anni</strong>. In caso di indagine, per la durata dell'indagine (max 3 mesi, prorogabili a 6). Scaduto il termine, i dati verranno bloccati e resi disponibili solo per la difesa in giudizio.</p>
        </LegalSection>

        <LegalSection title="6. Condivisione con terzi">
          <p>I dati non saranno trasferiti a terzi, salvo ai fornitori di servizi per la gestione delle segnalazioni (responsabili del trattamento) e alle autorità competenti (Forze dell'Ordine, Magistratura, Procura) ove richiesto dalla legge. L'identità del segnalatore resterà in ogni caso riservata.</p>
        </LegalSection>

        <LegalSection title="7. I tuoi diritti">
          <ul style={s.ul}>
            <li><strong>Accesso</strong>: ottenere accesso ai tuoi dati personali</li>
            <li><strong>Rettifica</strong>: correggere dati inesatti o incompleti</li>
            <li><strong>Cancellazione</strong>: richiedere la cancellazione dei dati</li>
            <li><strong>Limitazione</strong>: bloccare l'ulteriore utilizzo dei dati</li>
            <li><strong>Opposizione</strong>: opporsi a determinati tipi di trattamento</li>
            <li><strong>Portabilità</strong>: ricevere i tuoi dati in formato leggibile</li>
            <li><strong>Revoca del consenso</strong>: in qualsiasi momento</li>
          </ul>
          <p style={{ marginTop: 10 }}>Per esercitare i tuoi diritti: <strong>privacy@clockeasy.it</strong></p>
          <p style={{ marginTop: 6 }}>Reclami al Garante per la Protezione dei Dati Personali: <strong>www.garanteprivacy.it</strong></p>
        </LegalSection>

        <LegalSection title="8. Modifiche alla presente informativa">
          <p>ClockEasy si riserva il diritto di aggiornare questa informativa. In caso di modifiche sostanziali gli utenti saranno informati adeguatamente.</p>
        </LegalSection>

        <button style={s.btnPrimary} onClick={onBack}>← Torna al modulo</button>
      </div>
    </div>
  );
}

function LegalSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

/* ─── Styles ─── */
const s = {
  page: { minHeight: '100vh', background: '#F8FAFC', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', color: '#334155', display: 'flex', flexDirection: 'column' },

  header: { background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 50 },
  headerInner: { maxWidth: 700, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6A57D3', fontWeight: 600, fontSize: 14, padding: '4px 0' },

  main: { flex: 1, padding: '32px 20px 48px' },
  footer: { background: '#fff', borderTop: '1px solid #E2E8F0', padding: '14px 20px', textAlign: 'center' },
  footerText: { margin: 0, color: '#94A3B8', fontSize: 13 },
  footerLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13, padding: 0, textDecoration: 'underline' },

  container: { maxWidth: 660, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },

  heroSection: { textAlign: 'center', padding: '4px 0' },
  badge: { display: 'inline-block', background: '#EEF2FF', color: '#6A57D3', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12 },
  heroTitle: { margin: '0 0 10px', fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: '#0F172A' },
  heroSub: { margin: '0 auto', color: '#64748B', fontSize: 15, lineHeight: 1.6, maxWidth: 460 },

  stepsRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, maxWidth: 160 },
  stepNum: { width: 28, height: 28, borderRadius: '50%', background: '#EEF2FF', color: '#6A57D3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 },
  stepLabel: { fontSize: 13, color: '#64748B', textAlign: 'center' },

  actionRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  legalLinks: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  textLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#6A57D3', fontSize: 13, padding: 0, textDecoration: 'underline' },

  infoSection: { borderTop: '1px solid #E2E8F0', paddingTop: 20 },
  infoTitle: { margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#334155' },
  categoryList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  categoryTag: { background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '3px 10px', fontSize: 13, color: '#475569' },

  btnPrimary: { background: '#6A57D3', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#6A57D3', border: '1.5px solid #6A57D3', borderRadius: 8, padding: '11px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  backLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 14, fontWeight: 500, padding: '2px 0', alignSelf: 'flex-start' },

  stepIndicator: { display: 'flex', alignItems: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 20px' },
  stepDot: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, margin: '0 auto 6px' },
  stepDotLabel: { fontSize: 12, textAlign: 'center' },

  formCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '24px' },
  formTitle: { margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#0F172A' },
  formSub: { margin: '0 0 20px', color: '#64748B', fontSize: 14 },

  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #D1D5DB', borderRadius: 7, padding: '9px 12px', fontSize: 14, color: '#0F172A', background: '#fff', fontFamily: 'inherit', outline: 'none' },
  select: { width: '100%', boxSizing: 'border-box', border: '1px solid #D1D5DB', borderRadius: 7, padding: '9px 12px', fontSize: 14, color: '#0F172A', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' },

  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16 },
  checkText: { fontSize: 14, color: '#334155', lineHeight: 1.5 },
  inlineLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#6A57D3', fontSize: 14, padding: 0, textDecoration: 'underline' },

  uploadBtn: { background: '#F8FAFC', border: '1px solid #D1D5DB', borderRadius: 7, padding: '8px 16px', fontSize: 14, color: '#374151', cursor: 'pointer', marginBottom: 8 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 10px', marginBottom: 4 },
  fileRemove: { background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: '0 2px' },

  summaryBox: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 },
  warnBox: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', marginBottom: 16 },
  error: { color: '#DC2626', fontSize: 13, margin: '0 0 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '8px 12px' },

  successHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  receiptBox: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '14px 16px', marginBottom: 14 },
  receiptLabel: { margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' },
  receiptCode: { fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '0.06em', fontFamily: 'monospace' },
  copyBtn: { background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' },

  messages: { background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', padding: '12px 14px', maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column' },

  legalPage: { background: '#F8FAFC', minHeight: '100vh' },
  legalInner: { maxWidth: 720, margin: '0 auto', padding: '32px 24px 56px' },
  legalTitle: { fontSize: 'clamp(18px, 3vw, 22px)', fontWeight: 800, color: '#0F172A', margin: '12px 0 24px', lineHeight: 1.3 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid #E2E8F0' },
  ul: { paddingLeft: 18, margin: 0, lineHeight: 2 },
};
