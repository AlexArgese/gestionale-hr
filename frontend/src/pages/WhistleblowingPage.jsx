// frontend/src/pages/WhistleblowingPage.jsx
import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'https://clockeasy-api.onrender.com';

/* ── SVG Icons ── */
const Icon = ({ d, size = 18, color = 'currentColor', fill = 'none', strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const IcoLock     = (p) => <Icon {...p} d="M12 1C9.24 1 7 3.24 7 6v2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v2H9V6c0-1.66 1.34-3 3-3zm0 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />;
const IcoShield   = (p) => <Icon {...p} d={['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']} />;
const IcoClipboard= (p) => <Icon {...p} d={['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2','M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z']} />;
const IcoKey      = (p) => <Icon {...p} d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />;
const IcoTag      = (p) => <Icon {...p} d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />;
const IcoCheck    = (p) => <Icon {...p} d={['M22 11.08V12a10 10 0 1 1-5.93-9.14','M22 4 12 14.01l-3-3']} />;
const IcoWarn     = (p) => <Icon {...p} d={['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z','M12 9v4','M12 17h.01']} />;
const IcoEye      = (p) => <Icon {...p} d={['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z']} />;
const IcoEyeOff   = (p) => <Icon {...p} d={['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24','M1 1l22 22']} />;
const IcoCopy     = (p) => <Icon {...p} d={['M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2','M16 2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z']} />;
const IcoPaperclip= (p) => <Icon {...p} d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />;
const IcoSend     = (p) => <Icon {...p} d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />;
const IcoArrowR   = (p) => <Icon {...p} d="M5 12h14M12 5l7 7-7 7" />;

/* ── Data ── */
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
  'Altro',
];

const STATUS_LABELS = {
  ricevuta: 'Ricevuta', submitted: 'Ricevuta',
  in_corso: 'In lavorazione', in_attesa: 'In attesa', in_lavorazione: 'In lavorazione',
  chiusa: 'Chiusa', chiusa_fondata: 'Chiusa', chiusa_infondata: 'Chiusa',
  respinta: 'Respinta',
};
const STATUS_COLORS = {
  ricevuta: '#D97706', submitted: '#D97706',
  in_corso: '#2563EB', in_attesa: '#7C3AED', in_lavorazione: '#2563EB',
  chiusa: '#16A34A', chiusa_fondata: '#16A34A', chiusa_infondata: '#64748B',
  respinta: '#DC2626',
};

/* ── Root ── */
export default function WhistleblowingPage() {
  const [view, setView] = useState('home');
  const [trackPrefill, setTrackPrefill] = useState(null);

  useEffect(() => {
    document.title = 'Whistleblowing – ClockEasy';
    return () => { document.title = 'ClockEasy'; };
  }, []);

  if (view === 'legal')   return <LegalPage   onBack={() => setView('home')} />;
  if (view === 'privacy') return <PrivacyPage onBack={() => setView('home')} />;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <a href="/" style={{ lineHeight: 0 }}>
            <img src="/Logo_esteso.png" alt="ClockEasy" style={{ height: 28, width: 'auto' }} />
          </a>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {view !== 'track' && (
              <button style={s.headerBtn} onClick={() => { setTrackPrefill(null); setView('track'); }}>
                Segui segnalazione
              </button>
            )}
            {view !== 'home' && (
              <button style={s.headerBtnGhost} onClick={() => setView('home')}>← Home</button>
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
          © {new Date().getFullYear()} ClockEasy &nbsp;·&nbsp;
          <button style={s.footerLink} onClick={() => setView('legal')}>Sistema informativo interno</button>
          &nbsp;·&nbsp;
          <button style={s.footerLink} onClick={() => setView('privacy')}>Informativa privacy</button>
          &nbsp;·&nbsp; Conforme al D.Lgs. 24/2023
        </p>
      </footer>
    </div>
  );
}

/* ── Home ── */
function HomeView({ onNew, onTrack, onLegal, onPrivacy }) {
  return (
    <div style={s.wrap}>
      {/* Hero */}
      <div style={s.hero}>
        <div style={s.heroBadge}>
          <IcoShield size={13} /> Spazio sicuro
        </div>
        <h1 style={s.heroTitle}>Fai una segnalazione in modo sicuro</h1>
        <p style={s.heroSub}>
          Informazioni criptate end-to-end. Solo la persona designata dall'azienda può accedervi.
          Nessun dato personale è richiesto.
        </p>
      </div>

      {/* 3 steps */}
      <div style={s.card}>
        <p style={s.cardMeta}>3 fasi</p>
        <div style={s.stepsRow}>
          <StepCard n={1} icon={<IcoClipboard size={22} color="#6A57D3" />} label="Compila il modulo" />
          <div style={s.stepDivider} />
          <StepCard n={2} icon={<IcoKey size={22} color="#6A57D3" />} label="Crea una password" />
          <div style={s.stepDivider} />
          <StepCard n={3} icon={<IcoTag size={22} color="#6A57D3" />} label="Ricevi il codice" />
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        <button style={s.btnPrimary} onClick={onNew}>
          <IcoClipboard size={17} color="#fff" /> Nuova segnalazione
        </button>
      </div>

    </div>
  );
}

function StepCard({ n, icon, label }) {
  return (
    <div style={s.stepCard}>
      <div style={s.stepIcon}>{icon}</div>
      <span style={s.stepN}>Fase {n}</span>
      <span style={s.stepLabel}>{label}</span>
    </div>
  );
}

/* ── Wizard ── */
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
      if (!form.policy) return setError("Accetta l'informativa per procedere.");
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
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Errore ${res.status}`); }
      const { protocol } = await res.json();
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file);
        await fetch(`${API_BASE}/wb/anon/attachments/${encodeURIComponent(protocol)}/${encodeURIComponent(password)}`,
          { method: 'POST', body: fd }).catch(() => {});
      }
      setReceipt({ protocol });
      setStep(2);
    } catch (e) {
      setError(e.message || 'Invio non riuscito.');
    } finally { setLoading(false); }
  };

  const STEPS = ['Compila il modulo', 'Crea una password', 'Ricevi il codice'];

  return (
    <div style={s.wrap}>
      <button style={s.backLink} onClick={step === 0 ? onBack : () => setStep(st => st - 1)}>
        ← {step === 0 ? 'Home' : STEPS[step - 1]}
      </button>

      {/* Step indicator */}
      <div style={s.stepIndicator}>
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                ...s.stepDot,
                background: i < step ? '#16A34A' : i === step ? 'linear-gradient(135deg,#D0933C,#6A57D3)' : '#EEF2F7',
                color: i <= step ? '#fff' : '#9CA3AF',
                boxShadow: i === step ? '0 2px 10px rgba(106,87,211,0.35)' : 'none',
              }}>
                {i < step ? <IcoCheck size={14} color="#fff" /> : <span style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 11, color: i === step ? '#0F172A' : '#9CA3AF', fontWeight: i === step ? 700 : 400, textAlign: 'center', maxWidth: 80 }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, borderRadius: 1, background: i < step ? '#16A34A' : '#EEF2F7', alignSelf: 'flex-start', marginTop: 15 }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1 */}
      {step === 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Dicci cosa è successo</h2>

          <F label="Rapporto con l'azienda *">
            <select style={s.select} value={form.relationship} onChange={e => up('relationship', e.target.value)}>
              {RELATIONSHIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </F>

          <F label="Tipo di condotta scorretta *">
            <select style={s.select} value={form.category} onChange={e => up('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </F>

          <F label="Titolo breve (opzionale)">
            <input style={s.input} type="text" placeholder="Es. Pressioni indebite su fornitore…"
              maxLength={120} value={form.title} onChange={e => up('title', e.target.value)} />
          </F>

          <F label="Descrizione *">
            <textarea style={{ ...s.input, height: 140, resize: 'vertical' }}
              placeholder="Descrivi cosa è accaduto, dove, quando e chi è coinvolto."
              value={form.description} onChange={e => up('description', e.target.value)} />
          </F>

          <F label="Allegati (opzionale)">
            <button type="button" style={s.uploadBtn} onClick={() => fileRef.current?.click()}>
              <IcoPaperclip size={15} color="#6A57D3" /> Aggiungi file
            </button>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileAdd} />
            {files.map((f, i) => (
              <div key={i} style={s.fileRow}>
                <IcoPaperclip size={14} color="#94A3B8" />
                <span style={{ flex: 1, fontSize: 13, color: '#334155', fontWeight: 600 }}>{f.name}</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button style={s.fileRemove} onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </F>

          <label style={s.checkRow}>
            <input type="checkbox" checked={form.policy} onChange={e => up('policy', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#6A57D3' }} />
            <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
              Ho letto e preso visione del{' '}
              <button style={s.inlineLink} onClick={onLegal}>Sistema informativo interno e difesa dell'informatore</button>
              {' '}e dell'{' '}
              <button style={s.inlineLink} onClick={onPrivacy}>Informativa sulla privacy</button>.
            </span>
          </label>

          {error && <div style={s.errorBox}>{error}</div>}
          <button style={s.btnPrimary} onClick={next}>
            Avanti <IcoArrowR size={16} color="#fff" />
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 1 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>Crea una password</h2>
          <p style={s.cardSub}>Scegli una password memorabile di almeno 8 caratteri. Ti servirà con il codice protocollo per seguire la segnalazione.</p>

          <div style={s.summaryBox}>
            <SRow k="Rapporto" v={RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship)?.label} />
            <SRow k="Condotta" v={form.category} />
            {form.title && <SRow k="Titolo" v={form.title} />}
          </div>

          <div style={s.warnBox}>
            <IcoWarn size={16} color="#92400E" />
            <span>Se perdi la password non potrai più accedere alla segnalazione. Salvala in un posto sicuro.</span>
          </div>

          <F label="Password *">
            <div style={{ position: 'relative' }}>
              <input style={{ ...s.input, paddingRight: 42 }}
                type={showPwd ? 'text' : 'password'}
                placeholder="Minimo 8 caratteri"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password" />
              <button type="button" onClick={() => setShowPwd(v => !v)} style={s.eyeBtn}>
                {showPwd ? <IcoEyeOff size={16} color="#94A3B8" /> : <IcoEye size={16} color="#94A3B8" />}
              </button>
            </div>
            {password.length > 0 && <PwdStrength password={password} />}
          </F>

          <F label="Conferma password *">
            <input
              style={{ ...s.input, borderColor: confirmPwd && confirmPwd !== password ? '#EF4444' : undefined }}
              type={showPwd ? 'text' : 'password'}
              placeholder="Ripeti la password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              autoComplete="new-password" />
            {confirmPwd && confirmPwd !== password && (
              <p style={{ color: '#EF4444', fontSize: 12, margin: '4px 0 0' }}>Le password non coincidono</p>
            )}
          </F>

          {error && <div style={s.errorBox}>{error}</div>}
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={next} disabled={loading}>
            {loading ? 'Invio in corso…' : <><IcoSend size={16} color="#fff" /> Invia segnalazione</>}
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 2 && receipt && (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={s.successCircle}>
              <IcoCheck size={22} color="#16A34A" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Segnalazione inviata</h2>
              <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: 14 }}>Ricevuta in modo sicuro e cifrato.</p>
            </div>
          </div>

          <div style={s.receiptBox}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Codice protocollo
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                {receipt.protocol}
              </code>
              <CopyBtn text={receipt.protocol} />
            </div>
          </div>

          <div style={s.warnBox}>
            <IcoWarn size={16} color="#92400E" />
            <span>Salva il <strong>codice protocollo</strong> e la tua <strong>password</strong>. Senza questi dati non potrai più accedere alla segnalazione.</span>
          </div>

          <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, margin: '16px 0' }}>
            Per seguire l'avanzamento usa il pulsante qui sotto, inserisci il codice protocollo e la tua password.
          </p>

          <button style={s.btnPrimary} onClick={() => onDone(receipt.protocol, password)}>
            Segui la segnalazione <IcoArrowR size={16} color="#fff" />
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
      <div style={{ display: 'flex', gap: 4 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < score ? colors[score - 1] : '#EEF2F7' }} />
        ))}
      </div>
      {score > 0 && <span style={{ fontSize: 11, color: colors[score - 1], fontWeight: 600 }}>{labels[score - 1]}</span>}
    </div>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch (_) {}
  };
  return (
    <button style={s.copyBtn} onClick={copy}>
      <IcoCopy size={14} color={done ? '#16A34A' : '#6A57D3'} />
      {done ? 'Copiato' : 'Copia'}
    </button>
  );
}

/* ── Track ── */
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
    <div style={s.wrap}>
      <button style={s.backLink} onClick={onBack}>← Home</button>

      <div style={s.card}>
        <h2 style={s.cardTitle}>Segui la tua segnalazione</h2>
        <p style={s.cardSub}>Inserisci il codice protocollo e la password scelta al momento dell'invio.</p>

        <F label="Codice protocollo">
          <input style={s.input} type="text" placeholder="Es. WB-2026-123456"
            value={protocol} onChange={e => setProtocol(e.target.value.toUpperCase())} />
        </F>
        <F label="Password">
          <input style={s.input} type="password" placeholder="La tua password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(protocol, password)} />
        </F>

        {error && <div style={s.errorBox}>{error}</div>}
        <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} onClick={() => load(protocol, password)} disabled={loading}>
          {loading ? 'Caricamento…' : 'Carica thread'}
        </button>
      </div>

      {thread && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{thread.title}</h3>
              <code style={{ color: '#6A57D3', fontSize: 12 }}>{thread.protocol}</code>
            </div>
            <span style={{
              background: (STATUS_COLORS[status] || '#64748B') + '18',
              color: STATUS_COLORS[status] || '#64748B',
              border: `1px solid ${(STATUS_COLORS[status] || '#64748B')}44`,
              borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>

          <ProgressBar status={status} />

          <div style={s.messages}>
            {thread.messages?.map((msg, i) => <Bubble key={i} msg={msg} />)}
            <div ref={endRef} />
          </div>

          {!['chiusa','chiusa_fondata','chiusa_infondata','respinta'].includes(status) && (
            <div style={{ marginTop: 16 }}>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }}
                placeholder="Scrivi un messaggio al responsabile…"
                value={reply} onChange={e => setReply(e.target.value)} />
              <button style={{ ...s.btnPrimary, marginTop: 8, opacity: sending ? 0.7 : 1 }}
                onClick={send} disabled={sending || !reply.trim()}>
                {sending ? 'Invio…' : <><IcoSend size={15} color="#fff" /> Invia risposta</>}
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
  const labels = ['Ricevuta', 'In lavorazione', 'Chiusa'];
  const STATUS_STEP = { ricevuta: 0, in_corso: 1, in_attesa: 1, in_lavorazione: 1, chiusa: 2, chiusa_fondata: 2, chiusa_infondata: 2 };
  const idx = STATUS_STEP[status] ?? steps.indexOf(status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div style={{ textAlign: 'center', minWidth: 72 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px',
              background: i < idx ? '#16A34A' : i === idx ? 'linear-gradient(135deg,#D0933C,#6A57D3)' : '#EEF2F7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {i < idx
                ? <IcoCheck size={14} color="#fff" />
                : <span style={{ fontSize: 12, fontWeight: 700, color: i === idx ? '#fff' : '#9CA3AF' }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 11, color: i === idx ? '#6A57D3' : i < idx ? '#16A34A' : '#9CA3AF', fontWeight: i === idx ? 700 : 400 }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, borderRadius: 1, background: i < idx ? '#16A34A' : '#EEF2F7', marginBottom: 18 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Bubble({ msg }) {
  const isMe = msg.sender === 'reporter';
  const isSys = msg.sender === 'sistema';
  if (isSys) return (
    <div style={{ textAlign: 'center', margin: '10px 0' }}>
      <span style={{ background: '#EEF2F7', color: '#64748B', borderRadius: 20, padding: '4px 14px', fontSize: 12 }}>
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
        maxWidth: '78%', padding: '10px 14px', fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        background: isMe ? 'linear-gradient(135deg,#6A57D3,#8B78E6)' : '#F1F5F9',
        color: isMe ? '#fff' : '#0F172A',
        borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
        boxShadow: '0 1px 4px rgba(15,23,42,.07)',
      }}>
        {msg.body}
      </div>
    </div>
  );
}

/* ── Helpers ── */
function F({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

function SRow({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, minWidth: 72, textTransform: 'uppercase', letterSpacing: '0.05em', paddingTop: 2 }}>{k}</span>
      <span style={{ fontSize: 14, color: '#0F172A' }}>{v}</span>
    </div>
  );
}

/* ── Legal pages ── */
function LegalPage({ onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <LegalShell title="Principi generali del Sistema interno di informazione e difesa dell'informatore" onBack={onBack}>
      <LS title="Fatti rilevabili">
        <p>Il Canale delle Segnalazioni è uno strumento che consente la comunicazione di comportamenti che possono costituire mancanze o irregolarità contro gli interessi dell'Unione Europea o atti illeciti o violazioni delle normative applicabili.</p>
      </LS>
      <LS title="Diritti del segnalatore">
        {[
          { t: "Diritto all'anonimato", d: "Il segnalatore può mantenere l'anonimato durante tutto il processo. È facoltativo includere dati identificativi." },
          { t: 'Diritto alla riservatezza', d: "Il contenuto del rapporto e l'identità del segnalatore sono riservati e non possono essere rivelati senza esplicito consenso, salvo eccezioni di legge." },
          { t: 'Divieto di ritorsione', d: "Il segnalatore è protetto contro ritorsioni, anche se l'indagine non conferma alcuna violazione, purché non abbia agito in malafede." },
          { t: 'Diritto di scelta', d: 'Il segnalatore può scegliere canali interni o esterni (autorità competenti).' },
          { t: 'Diritto di ricevere informazioni', d: 'Il segnalatore ha diritto di essere informato sullo stato della segnalazione e sui risultati delle indagini.' },
          { t: 'Diritto a informazioni limitate', d: "Non sarà obbligato a fornire dati non strettamente necessari. Le informazioni non possono essere usate per scopi diversi dall'indagine." },
          { t: 'Diritto di protezione dei dati', d: 'Il segnalatore può esercitare i diritti conferiti dalla normativa sulla protezione dei dati personali.' },
          { t: 'Diritto a risposta entro termine ragionevole', d: 'Conferma di ricezione entro 7 giorni. Il termine per l\'elaborazione delle indagini non può superare i tre mesi.' },
          { t: 'Diritto alla cancellazione dei dati', d: 'Dopo tre mesi i dati devono essere cancellati, tranne quando necessario per conservare prove o in caso di procedimenti giudiziari.' },
        ].map(item => (
          <div key={item.t} style={{ borderLeft: '3px solid #6A57D3', paddingLeft: 14, marginBottom: 14 }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', fontSize: 14 }}>{item.t}</p>
            <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: 14 }}>{item.d}</p>
          </div>
        ))}
      </LS>
      <LS title="Misure disciplinari">
        <p>Se i fatti segnalati risultano veri e collegati a condotte irregolari, la persona segnalata può essere soggetta a sanzioni ai sensi della legislazione del lavoro. I fatti possono essere trasmessi alle autorità competenti se costituiscono reato.</p>
      </LS>
      <LS title="Segnalazioni false o in malafede">
        <p>Il Canale deve essere usato responsabilmente. Se i fatti sono manifestamente falsi e la segnalazione è presentata in mala fede: (i) la segnalazione verrà archiviata; (ii) il responsabile HR verrà informato per le misure disciplinari; (iii) la sanzione verrà comunicata all'organo di gestione.</p>
      </LS>
      <LS title="Procedura di indagine">
        <p style={{ fontWeight: 700, marginBottom: 6 }}>Fase iniziale</p>
        <p>Il segnalatore compila il modulo individualmente. L'azienda conferma la ricezione entro 7 giorni e può richiedere informazioni aggiuntive. Se non arriva risposta entro 30 giorni, la segnalazione si considera rinunciata (salvo casi critici).</p>
        <p style={{ fontWeight: 700, margin: '16px 0 6px' }}>Fase istruttiva</p>
        <p>Viene assegnato un livello di rischio (BASSO, MEDIO, ALTO, CRITICO). Il termine di risoluzione è di 3 mesi, prorogabili a 6 in casi eccezionali.</p>
        <p style={{ fontWeight: 700, margin: '16px 0 6px' }}>Fase di risoluzione</p>
        <p>L'azienda emette una Risoluzione documentata comunicata al segnalatore e alla parte segnalata. Esiti possibili: verifica con misure correttive; nessuna verifica con chiusura del caso; rinvio a un'altra istanza o alle autorità.</p>
      </LS>
    </LegalShell>
  );
}

function PrivacyPage({ onBack }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <LegalShell title="Informativa sulla protezione dei dati personali" onBack={onBack}>
      <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
        Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 24/2023.
      </p>
      <LS title="1. Titolare del trattamento">
        <p><strong>ClockEasy</strong> è il titolare del trattamento dei dati raccolti tramite questo Canale di Segnalazione.</p>
        <p style={{ marginTop: 8 }}>Contatti: <strong>clockeasyapp@gmail.com</strong></p>
      </LS>
      <LS title="2. Dati raccolti">
        <p style={{ fontWeight: 700, marginBottom: 6 }}>Segnalatore (se non anonimo):</p>
        <ul style={s.ul}><li>Nome e cognome</li><li>Email e telefono</li><li>Descrizione dei fatti e documenti allegati</li></ul>
        <p style={{ fontWeight: 700, margin: '12px 0 6px' }}>Persona segnalata:</p>
        <ul style={s.ul}><li>Dati identificativi e di contatto</li><li>Dati lavorativi, fiscali, finanziari se forniti nel corso dell'indagine</li></ul>
      </LS>
      <LS title="3. Finalità">
        <ul style={s.ul}>
          <li>Ricezione e gestione delle segnalazioni</li>
          <li>Indagine e proposizione di risoluzioni nei termini di legge</li>
          <li>Adozione di misure disciplinari</li>
          <li>Avvio di azioni legali se necessario</li>
          <li>Conservazione delle prove del corretto funzionamento del sistema</li>
        </ul>
      </LS>
      <LS title="4. Base giuridica">
        <ul style={s.ul}>
          <li><strong>Obbligo legale</strong> (art. 6.1.c GDPR) — D.Lgs. 24/2023</li>
          <li><strong>Interesse pubblico</strong> (art. 6.1.e GDPR) — per dati di categoria speciale</li>
          <li><strong>Interesse legittimo</strong> (art. 6.1.f GDPR) — conservazione delle prove</li>
        </ul>
      </LS>
      <LS title="5. Conservazione">
        <p>I dati sono conservati per il tempo necessario alla gestione della segnalazione, in generale non oltre <strong>10 anni</strong>. In caso di indagine, per la sua durata (max 3 mesi, prorogabili a 6). Scaduto il termine, i dati vengono bloccati.</p>
      </LS>
      <LS title="6. Condivisione con terzi">
        <p>I dati non vengono ceduti a terzi, salvo a fornitori di servizi (responsabili del trattamento) e alle autorità competenti (Forze dell'Ordine, Magistratura) ove richiesto dalla legge. L'identità del segnalatore resta sempre riservata.</p>
      </LS>
      <LS title="7. I tuoi diritti">
        <ul style={s.ul}>
          <li><strong>Accesso</strong> — ottenere accesso ai tuoi dati</li>
          <li><strong>Rettifica</strong> — correggere dati inesatti</li>
          <li><strong>Cancellazione</strong> — richiedere la rimozione dei dati</li>
          <li><strong>Limitazione</strong> — bloccare l'ulteriore utilizzo</li>
          <li><strong>Opposizione</strong> — opporsi a determinati trattamenti</li>
          <li><strong>Portabilità</strong> — ricevere i dati in formato leggibile</li>
          <li><strong>Revoca del consenso</strong> — in qualsiasi momento</li>
        </ul>
        <p style={{ marginTop: 10 }}>Richieste: <strong>clockeasyapp@gmail.com</strong></p>
      </LS>
      <LS title="8. Modifiche">
        <p>ClockEasy si riserva il diritto di aggiornare questa informativa. In caso di modifiche sostanziali gli interessati saranno informati.</p>
      </LS>
    </LegalShell>
  );
}

function LegalShell({ title, onBack, children }) {
  return (
    <div style={{ background: '#F6F8FA', minHeight: '100vh' }}>
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px 60px' }}>
        <button style={s.backLink} onClick={onBack}>← Torna al modulo</button>
        <div style={s.gradientBar} />
        <h1 style={{ fontSize: 'clamp(17px,3vw,22px)', fontWeight: 900, color: '#0F172A', margin: '16px 0 28px', lineHeight: 1.35 }}>{title}</h1>
        {children}
        <button style={{ ...s.btnPrimary, marginTop: 8 }} onClick={onBack}>← Torna al modulo</button>
      </div>
    </div>
  );
}

function LS({ title, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #EEF2F7' }}>{title}</h2>
      <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

/* ── Styles ── */
const SHADOW = '0 4px 20px rgba(15,23,42,.07)';

const s = {
  page: { minHeight: '100vh', background: '#F6F8FA', fontFamily: 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', color: '#334155', display: 'flex', flexDirection: 'column' },

  header: { background: '#fff', borderBottom: '1px solid #EEF2F7', position: 'sticky', top: 0, zIndex: 50 },
  headerInner: { maxWidth: 760, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { background: '#6A57D3', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  headerBtnGhost: { background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontWeight: 600, fontSize: 14 },

  main: { flex: 1, padding: '32px 20px 52px' },
  footer: { background: '#fff', borderTop: '1px solid #EEF2F7', padding: '14px 24px', textAlign: 'center' },
  footerText: { margin: 0, color: '#94A3B8', fontSize: 13 },
  footerLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13, padding: 0, textDecoration: 'underline' },

  wrap: { maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },

  /* Hero */
  hero: { textAlign: 'center', padding: '8px 0 4px' },
  heroBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', color: '#6A57D3', borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 700, marginBottom: 14 },
  heroTitle: { margin: '0 0 10px', fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.01em' },
  heroSub: { margin: '0 auto', color: '#64748B', fontSize: 15, lineHeight: 1.65, maxWidth: 460 },

  /* Cards */
  card: { background: '#fff', borderRadius: 16, border: '1px solid #EEF2F7', padding: '20px 22px', boxShadow: SHADOW },
  cardTitle: { margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#0F172A' },
  cardSub: { margin: '0 0 18px', color: '#64748B', fontSize: 14 },
  cardMeta: { margin: '0 0 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' },

  /* Steps preview */
  stepsRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  stepCard: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' },
  stepIcon: { width: 46, height: 46, borderRadius: 13, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepDivider: { width: 32, height: 1, background: '#EEF2F7', marginTop: 23, flexShrink: 0 },
  stepN: { fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  stepLabel: { fontSize: 13, color: '#334155', fontWeight: 600 },

  /* Chips */
  chip: { background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: '#475569' },

  /* Buttons */
  btnPrimary: { background: 'linear-gradient(135deg,#D0933C,#6A57D3)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 3px 14px rgba(106,87,211,.28)' },
  btnOutline: { background: '#fff', color: '#6A57D3', border: '1.5px solid #6A57D3', borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6A57D3', fontSize: 13, padding: 0, textDecoration: 'underline' },
  backLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 14, fontWeight: 500, padding: '2px 0', alignSelf: 'flex-start' },

  /* Step indicator */
  stepIndicator: { background: '#fff', border: '1px solid #EEF2F7', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', boxShadow: SHADOW },
  stepDot: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  /* Form */
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '10px 13px', fontSize: 14, color: '#0F172A', background: '#fff', fontFamily: 'inherit', outline: 'none' },
  select: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '10px 13px', fontSize: 14, color: '#0F172A', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' },
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16 },
  inlineLink: { background: 'none', border: 'none', cursor: 'pointer', color: '#6A57D3', fontSize: 14, padding: 0, textDecoration: 'underline' },

  /* Upload */
  uploadBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '8px 16px', fontSize: 14, color: '#6A57D3', fontWeight: 600, cursor: 'pointer', marginBottom: 8 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: 8, padding: '7px 10px', marginBottom: 4 },
  fileRemove: { background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: '0 2px' },

  /* Misc */
  summaryBox: { background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  warnBox: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400E', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5 },
  errorBox: { background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 13px', fontSize: 13, color: '#B91C1C', marginBottom: 12 },
  eyeBtn: { position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' },

  successCircle: { width: 46, height: 46, borderRadius: '50%', background: '#DCFCE7', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  receiptBox: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '16px 18px', marginBottom: 14 },
  copyBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EEF2FF', border: '1px solid #DDD6FE', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#6A57D3' },

  messages: { background: '#F8FAFC', borderRadius: 12, border: '1px solid #EEF2F7', padding: '12px 14px', maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column' },

  gradientBar: { height: 4, width: 50, borderRadius: 2, background: 'linear-gradient(90deg,#D0933C,#6A57D3)', marginTop: 12 },
  ul: { paddingLeft: 18, margin: 0, lineHeight: 2.1 },
};
