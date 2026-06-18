// src/pages/WhistleblowingPage.jsx
import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'https://clockeasy-api.onrender.com';

const RELATIONSHIP_OPTIONS = [
  { value: 'dipendente', label: 'Dipendente' },
  { value: 'ex_dipendente', label: 'Ex dipendente' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'fornitore', label: 'Fornitore' },
  { value: 'contraente', label: 'Contraente / Appaltatore' },
  { value: 'altro', label: 'Altro' },
];

const HARDCODED_CATEGORIES = [
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

/* ─── Main page ─── */
export default function WhistleblowingPage() {
  const [view, setView] = useState('home');
  const [trackPrefill, setTrackPrefill] = useState(null);

  useEffect(() => {
    document.title = 'Whistleblowing – ClockEasy';
    return () => { document.title = 'ClockEasy'; };
  }, []);

  const handleDone = (protocol, password) => {
    setTrackPrefill({ protocol, password });
    setView('track');
  };

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <a href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/Logo_esteso.png" alt="ClockEasy" style={s.logo} />
          </a>
          <div style={s.headerNav}>
            {view !== 'track' && (
              <button style={s.linkBtn} onClick={() => { setTrackPrefill(null); setView('track'); }}>
                <span style={s.linkBtnIcon}>🔍</span> Segui segnalazione
              </button>
            )}
            {view !== 'home' && (
              <button style={s.linkBtn} onClick={() => setView('home')}>
                ← Home
              </button>
            )}
          </div>
        </div>
      </header>

      <main style={s.main}>
        {view === 'home' && (
          <HomeView
            onNew={() => setView('wizard')}
            onTrack={() => { setTrackPrefill(null); setView('track'); }}
          />
        )}
        {view === 'wizard' && (
          <WbWizard
            onBack={() => setView('home')}
            onDone={handleDone}
          />
        )}
        {view === 'track' && (
          <TrackView
            prefill={trackPrefill}
            onBack={() => setView('home')}
          />
        )}
      </main>

      <footer style={s.footer}>
        <p style={s.footerText}>
          © {new Date().getFullYear()} ClockEasy — Conforme al D.Lgs. 24/2023 (Direttiva UE Whistleblowing)
        </p>
      </footer>
    </div>
  );
}

/* ─── Landing ─── */
function HomeView({ onNew, onTrack }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? HARDCODED_CATEGORIES : HARDCODED_CATEGORIES.slice(0, 7);

  return (
    <div style={s.container}>
      {/* Hero */}
      <div style={s.hero}>
        <div style={s.heroBadge}>🔒 Spazio sicuro</div>
        <h1 style={s.heroTitle}>Fai una segnalazione in modo sicuro</h1>
        <p style={s.heroSub}>
          Le informazioni vengono criptate end-to-end. Solo la persona designata
          dall'azienda potrà accedervi.
        </p>
        <div style={s.heroBtns}>
          <button style={s.btnPrimary} onClick={onNew}>
            ✏️&nbsp; Nuova segnalazione
          </button>
          <button style={s.btnOutline} onClick={onTrack}>
            🔍&nbsp; Segui una segnalazione
          </button>
        </div>
      </div>

      {/* Steps preview */}
      <div style={s.card}>
        <p style={s.cardLabel}>3 fasi del processo</p>
        <div style={s.stepsRow}>
          <Step n={1} label="Compila il modulo" icon="📋" />
          <div style={s.stepArrow}>→</div>
          <Step n={2} label="Crea una password" icon="🔑" />
          <div style={s.stepArrow}>→</div>
          <Step n={3} label="Ricevi il codice" icon="🎫" />
        </div>
      </div>

      {/* Security info */}
      <div style={{ ...s.card, background: 'linear-gradient(135deg, #fdf4e7 0%, #f0edff 100%)' }}>
        <p style={s.cardLabel}>Garanzie di sicurezza</p>
        <ul style={s.securityList}>
          {[
            '🔐 Crittografia end-to-end dei dati',
            '👤 Anonimato garantito — nessun dato personale richiesto',
            '⚖️ Conformità D.Lgs. 24/2023 (recepimento Direttiva UE 2019/1937)',
            '🚫 Divieto assoluto di ritorsioni verso il segnalante',
            '📬 Solo la persona designata potrà leggere la segnalazione',
          ].map((item, i) => (
            <li key={i} style={s.securityItem}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Categories */}
      <div style={s.card}>
        <p style={s.cardLabel}>Tipologie di condotte segnalabili</p>
        <div style={s.categoriesGrid}>
          {visible.map((cat) => (
            <span key={cat} style={s.catChip}>{cat}</span>
          ))}
        </div>
        <button style={s.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Visualizza meno ▲' : `Visualizza tutte (${HARDCODED_CATEGORIES.length}) ▼`}
        </button>
      </div>

      <button style={{ ...s.btnPrimary, width: '100%', marginTop: 8 }} onClick={onNew}>
        ✏️&nbsp; Inizia la segnalazione
      </button>
    </div>
  );
}

function Step({ n, label, icon }) {
  return (
    <div style={s.stepItem}>
      <div style={s.stepCircle}>{icon}</div>
      <div style={s.stepNum}>Fase {n}</div>
      <div style={s.stepLabel}>{label}</div>
    </div>
  );
}

/* ─── Wizard ─── */
function WbWizard({ onBack, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    relationship: '',
    categoryLabel: '',
    title: '',
    description: '',
    policy: false,
  });
  const [files, setFiles] = useState([]);
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null); // { protocol }

  const fileRef = useRef();

  const STEP_LABELS = ['Compila il modulo', 'Crea una password', 'Ricevi il codice'];

  const handleFileAdd = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => {
      const seen = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...picked.filter(f => !seen.has(f.name + f.size))];
    });
    e.target.value = '';
  };

  const validateStep1 = () => {
    if (!form.relationship) return 'Seleziona il tuo rapporto con l\'azienda.';
    if (!form.categoryLabel) return 'Seleziona il tipo di condotta scorretta.';
    if (!form.description.trim()) return 'La descrizione è obbligatoria.';
    if (!form.policy) return 'Devi accettare l\'informativa per procedere.';
    return null;
  };

  const validateStep2 = () => {
    if (password.length < 8) return 'La password deve essere di almeno 8 caratteri.';
    if (password !== confirmPwd) return 'Le due password non coincidono.';
    return null;
  };

  const handleNext = async () => {
    setError('');
    if (step === 0) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(1);
    } else if (step === 1) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      // submit
      await submit();
    }
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const relLabel = RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship)?.label || form.relationship;
      const title = form.title.trim() || form.categoryLabel;
      const descFull = `Rapporto: ${relLabel}\n\n${form.description.trim()}`;

      const body = {
        title,
        description: descFull,
        categoryId: null,
        policyAccepted: true,
        relationship: relLabel,
        password,
      };

      const res = await fetch(`${API_BASE}/wb/anon/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Errore ${res.status}`);
      }

      const data = await res.json();
      const protocol = data.protocol;

      // upload attachments if any
      if (files.length > 0) {
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          await fetch(
            `${API_BASE}/wb/anon/attachments/${encodeURIComponent(protocol)}/${encodeURIComponent(password)}`,
            { method: 'POST', body: fd }
          );
        }
      }

      setReceipt({ protocol });
      setStep(2);
    } catch (e) {
      setError(e.message || 'Invio non riuscito. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.container}>
      {/* Back */}
      <button style={s.backBtn} onClick={step === 0 ? onBack : () => setStep(step - 1)}>
        ← {step === 0 ? 'Home' : STEP_LABELS[step - 1]}
      </button>

      {/* Step indicator */}
      <StepIndicator current={step} labels={STEP_LABELS} />

      {/* Steps */}
      {step === 0 && (
        <Step1Form
          form={form}
          setForm={setForm}
          files={files}
          setFiles={setFiles}
          fileRef={fileRef}
          handleFileAdd={handleFileAdd}
          error={error}
          onNext={handleNext}
        />
      )}
      {step === 1 && (
        <Step2Password
          password={password}
          setPassword={setPassword}
          confirmPwd={confirmPwd}
          setConfirmPwd={setConfirmPwd}
          form={form}
          error={error}
          loading={loading}
          onNext={handleNext}
        />
      )}
      {step === 2 && receipt && (
        <Step3Receipt
          protocol={receipt.protocol}
          password={password}
          onTrack={() => onDone(receipt.protocol, password)}
        />
      )}
    </div>
  );
}

/* ── Step indicator ── */
function StepIndicator({ current, labels }) {
  return (
    <div style={s.stepIndicator}>
      {labels.map((label, i) => (
        <React.Fragment key={i}>
          <div style={s.stepIndicatorItem}>
            <div style={{
              ...s.stepIndicatorCircle,
              background: i < current ? '#16A34A' : i === current ? 'linear-gradient(135deg,#D0933C,#6A57D3)' : '#E5E7EB',
              color: i <= current ? '#fff' : '#9CA3AF',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{
              ...s.stepIndicatorLabel,
              color: i === current ? '#0F172A' : '#94A3B8',
              fontWeight: i === current ? 700 : 400,
            }}>{label}</span>
          </div>
          {i < labels.length - 1 && (
            <div style={{ ...s.stepIndicatorLine, background: i < current ? '#16A34A' : '#E5E7EB' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Step 1: Form ── */
function Step1Form({ form, setForm, files, setFiles, fileRef, handleFileAdd, error, onNext }) {
  const up = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      <div style={s.card}>
        <h2 style={s.cardTitle}>Dicci cosa è successo</h2>

        {/* Relationship */}
        <label style={s.label}>Qual è il tuo rapporto con l'azienda?<span style={s.req}>*</span></label>
        <div style={s.radioGroup}>
          {RELATIONSHIP_OPTIONS.map(opt => (
            <label key={opt.value} style={{
              ...s.radioItem,
              ...(form.relationship === opt.value ? s.radioItemActive : {}),
            }}>
              <input
                type="radio"
                name="relationship"
                value={opt.value}
                checked={form.relationship === opt.value}
                onChange={() => up('relationship', opt.value)}
                style={{ display: 'none' }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {/* Category */}
        <label style={{ ...s.label, marginTop: 16 }}>
          Tipo di condotta scorretta<span style={s.req}>*</span>
        </label>
        <select
          style={s.select}
          value={form.categoryLabel}
          onChange={e => up('categoryLabel', e.target.value)}
        >
          <option value="">— Seleziona —</option>
          {HARDCODED_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Optional title */}
        <label style={{ ...s.label, marginTop: 16 }}>
          Titolo breve <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opzionale)</span>
        </label>
        <input
          style={s.input}
          type="text"
          placeholder="Es. Pressioni indebite su fornitore…"
          maxLength={120}
          value={form.title}
          onChange={e => up('title', e.target.value)}
        />

        {/* Description */}
        <label style={{ ...s.label, marginTop: 16 }}>
          Descrizione<span style={s.req}>*</span>
        </label>
        <textarea
          style={{ ...s.input, height: 150, resize: 'vertical' }}
          placeholder="Descrivi in dettaglio cosa è accaduto, dove e quando, e chi è coinvolto."
          value={form.description}
          onChange={e => up('description', e.target.value)}
        />

        {/* Files */}
        <label style={{ ...s.label, marginTop: 16 }}>Allegati <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opzionale, max 10 MB)</span></label>
        <div style={s.fileArea} onClick={() => fileRef.current?.click()}>
          <span style={{ fontSize: 24 }}>📎</span>
          <span style={{ color: '#64748B', fontSize: 14 }}>Clicca per aggiungere file</span>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileAdd} />
        </div>
        {files.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {files.map((f, i) => (
              <div key={i} style={s.fileRow}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ flex: 1, fontSize: 13, color: '#0F172A', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button style={s.fileRemove} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Policy */}
        <label style={{ ...s.checkRow, marginTop: 20 }}>
          <input
            type="checkbox"
            checked={form.policy}
            onChange={e => up('policy', e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
          />
          <span style={{ color: '#334155', fontSize: 14 }}>
            Ho letto e preso visione del{' '}
            <a href="#" style={{ color: '#6A57D3' }}>Sistema informativo interno e difesa dell'informatore</a>
            {' '}e dell'{' '}
            <a href="#" style={{ color: '#6A57D3' }}>Informativa sulla privacy</a>.
          </span>
        </label>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <button
        style={{ ...s.btnPrimary, width: '100%', marginTop: 12 }}
        onClick={onNext}
      >
        Avanti →
      </button>
    </div>
  );
}

/* ── Step 2: Password ── */
function Step2Password({ password, setPassword, confirmPwd, setConfirmPwd, form, error, loading, onNext }) {
  const relLabel = RELATIONSHIP_OPTIONS.find(r => r.value === form.relationship)?.label || form.relationship;
  const [showPwd, setShowPwd] = useState(false);

  return (
    <div>
      {/* Summary card */}
      <div style={{ ...s.card, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <p style={s.cardLabel}>Riepilogo segnalazione</p>
        <div style={s.summaryRow}><span style={s.summaryKey}>Rapporto</span><span style={s.summaryVal}>{relLabel}</span></div>
        <div style={s.summaryRow}><span style={s.summaryKey}>Condotta</span><span style={s.summaryVal}>{form.categoryLabel}</span></div>
        {form.title && <div style={s.summaryRow}><span style={s.summaryKey}>Titolo</span><span style={s.summaryVal}>{form.title}</span></div>}
        <div style={s.summaryRow}>
          <span style={s.summaryKey}>Descrizione</span>
          <span style={{ ...s.summaryVal, maxHeight: 80, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {form.description}
          </span>
        </div>
      </div>

      {/* Password card */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>🔑 Crea una password</h2>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          Scegli una password <strong>memorabile</strong> di almeno 8 caratteri.
          Ti servirà insieme al codice protocollo per seguire l'avanzamento della segnalazione e rispondere al responsabile.
        </p>

        <div style={s.infoBox}>
          ⚠️ <strong>Importante:</strong> se perdi la password non potrai più accedere alla tua segnalazione.
          Salvala in un luogo sicuro.
        </div>

        <label style={{ ...s.label, marginTop: 16 }}>Password<span style={s.req}>*</span></label>
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...s.input, paddingRight: 42 }}
            type={showPwd ? 'text' : 'password'}
            placeholder="Minimo 8 caratteri"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            style={s.eyeBtn}
            title={showPwd ? 'Nascondi' : 'Mostra'}
          >{showPwd ? '🙈' : '👁️'}</button>
        </div>

        {/* Strength indicator */}
        {password.length > 0 && (
          <PasswordStrength password={password} />
        )}

        <label style={{ ...s.label, marginTop: 14 }}>Conferma password<span style={s.req}>*</span></label>
        <input
          style={{ ...s.input, borderColor: confirmPwd && confirmPwd !== password ? '#EF4444' : undefined }}
          type={showPwd ? 'text' : 'password'}
          placeholder="Ripeti la password"
          value={confirmPwd}
          onChange={e => setConfirmPwd(e.target.value)}
          autoComplete="new-password"
        />
        {confirmPwd && confirmPwd !== password && (
          <p style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>Le password non coincidono</p>
        )}
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <button
        style={{ ...s.btnPrimary, width: '100%', marginTop: 12, opacity: loading ? 0.7 : 1 }}
        onClick={onNext}
        disabled={loading}
      >
        {loading ? '⏳ Invio in corso…' : '🔒 Invia segnalazione'}
      </button>
    </div>
  );
}

function PasswordStrength({ password }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ].filter(Boolean).length;

  const labels = ['', 'Debole', 'Discreta', 'Buona', 'Forte', 'Ottima'];
  const colors = ['', '#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#16A34A'];

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= score ? colors[score] : '#E5E7EB',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: colors[score], fontWeight: 600 }}>{labels[score]}</span>
    </div>
  );
}

/* ── Step 3: Receipt ── */
function Step3Receipt({ protocol, password, onTrack }) {
  const [copied, setCopied] = useState(false);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  return (
    <div>
      {/* Success banner */}
      <div style={s.successBanner}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>✅</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>Segnalazione inviata!</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 14 }}>
            La tua segnalazione è stata ricevuta in modo sicuro.
          </p>
        </div>
      </div>

      <div style={s.card}>
        <p style={s.cardLabel}>Conserva questi dati per seguire la segnalazione</p>

        {/* Protocol */}
        <div style={s.receiptRow}>
          <div style={{ flex: 1 }}>
            <p style={s.receiptKey}>Codice Protocollo</p>
            <p style={s.receiptVal}>{protocol}</p>
          </div>
          <button style={s.copyBtn} onClick={() => copy(protocol)}>
            {copied ? '✓ Copiato' : '📋 Copia'}
          </button>
        </div>

        {/* Password reminder */}
        <div style={s.receiptRow}>
          <div style={{ flex: 1 }}>
            <p style={s.receiptKey}>Password (da te scelta)</p>
            <p style={{ ...s.receiptVal, color: '#6A57D3', letterSpacing: '0.1em' }}>
              {'•'.repeat(Math.min(password.length, 12))}
            </p>
          </div>
        </div>

        {/* Warning */}
        <div style={s.warnBox}>
          ⚠️ Salva subito il <strong>codice protocollo</strong> e la <strong>password</strong> in un
          posto sicuro. Senza questi dati non potrai seguire l'avanzamento né rispondere al responsabile.
        </div>

        {/* Instructions */}
        <p style={{ color: '#334155', fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
          Per seguire l'avanzamento:
          <br />1. Clicca su <strong>Segui la segnalazione</strong>
          <br />2. Inserisci il <strong>codice protocollo</strong> e la tua <strong>password</strong>
          <br />3. Potrai vedere lo stato e rispondere al responsabile
        </p>
      </div>

      <button style={{ ...s.btnPrimary, width: '100%', marginTop: 12 }} onClick={onTrack}>
        🔍 Segui la segnalazione
      </button>
    </div>
  );
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
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (prefill?.protocol && prefill?.password) {
      loadThread(prefill.protocol, prefill.password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (thread) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const loadThread = async (proto, pwd) => {
    setLoading(true);
    setError('');
    setThread(null);
    try {
      const res = await fetch(
        `${API_BASE}/wb/anon/thread/${encodeURIComponent(proto)}/${encodeURIComponent(pwd)}`
      );
      if (res.status === 403) throw new Error('Protocollo o password non corretti.');
      if (res.status === 404) throw new Error('Segnalazione non trovata.');
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setThread(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => {
    if (!protocol.trim() || !password.trim()) {
      setError('Inserisci protocollo e password.');
      return;
    }
    loadThread(protocol.trim(), password.trim());
  };

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `${API_BASE}/wb/anon/thread/${encodeURIComponent(protocol)}/${encodeURIComponent(password)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: reply }),
        }
      );
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      setReply('');
      await loadThread(protocol, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const status = thread?.status;
  const statusLabel = STATUS_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || '#64748B';

  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onBack}>← Home</button>

      <div style={s.card}>
        <h2 style={s.cardTitle}>🔍 Segui la tua segnalazione</h2>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 16 }}>
          Inserisci il codice protocollo e la password che hai scelto al momento dell'invio.
        </p>

        <label style={s.label}>Codice protocollo</label>
        <input
          style={s.input}
          type="text"
          placeholder="Es. WB-2026-123456"
          value={protocol}
          onChange={e => setProtocol(e.target.value.toUpperCase())}
        />

        <label style={{ ...s.label, marginTop: 14 }}>Password</label>
        <input
          style={{ ...s.input, marginBottom: 0 }}
          type="password"
          placeholder="La password scelta al momento dell'invio"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
        />

        {error && <div style={s.errorBox}>{error}</div>}

        <button
          style={{ ...s.btnPrimary, width: '100%', marginTop: 14, opacity: loading ? 0.7 : 1 }}
          onClick={handleLoad}
          disabled={loading}
        >
          {loading ? '⏳ Caricamento…' : '🔍 Carica thread'}
        </button>
      </div>

      {/* Thread */}
      {thread && (
        <div style={s.card}>
          {/* Header thread */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <p style={s.cardLabel}>Segnalazione</p>
              <h3 style={{ margin: '4px 0', color: '#0F172A', fontSize: 16 }}>{thread.title}</h3>
              <code style={{ color: '#6A57D3', fontSize: 12 }}>{thread.protocol}</code>
            </div>
            <div style={{
              background: statusColor + '22',
              color: statusColor,
              border: `1px solid ${statusColor}44`,
              borderRadius: 20,
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 700,
            }}>
              {statusLabel}
            </div>
          </div>

          {/* Progress tracker */}
          <ProgressTracker status={status} />

          {/* Messages */}
          <div style={s.messagesContainer}>
            {thread.messages?.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply — only if not closed/rejected */}
          {status !== 'chiusa' && status !== 'respinta' && (
            <div style={{ marginTop: 16 }}>
              <label style={s.label}>Rispondi al responsabile</label>
              <textarea
                style={{ ...s.input, height: 90, resize: 'vertical' }}
                placeholder="Scrivi un messaggio…"
                value={reply}
                onChange={e => setReply(e.target.value)}
              />
              <button
                style={{ ...s.btnPrimary, marginTop: 8, opacity: sending ? 0.7 : 1 }}
                onClick={handleSend}
                disabled={sending || !reply.trim()}
              >
                {sending ? '⏳ Invio…' : '📤 Invia risposta'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Progress tracker ── */
function ProgressTracker({ status }) {
  const steps = [
    { key: 'ricevuta', label: 'Ricevuta' },
    { key: 'in_lavorazione', label: 'In lavorazione' },
    { key: 'chiusa', label: 'Chiusa' },
  ];
  const order = ['ricevuta', 'in_lavorazione', 'chiusa', 'respinta'];
  const currentIdx = order.indexOf(status);

  return (
    <div style={{ ...s.stepsRow, marginBottom: 16, justifyContent: 'flex-start', gap: 0 }}>
      {steps.map((step, i) => {
        const stepIdx = order.indexOf(step.key);
        const done = currentIdx >= stepIdx;
        const active = status === step.key;
        return (
          <React.Fragment key={step.key}>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', margin: '0 auto',
                background: done ? (active ? '#6A57D3' : '#10B981') : '#E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: done ? '#fff' : '#9CA3AF',
              }}>
                {done && !active ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? '#6A57D3' : done ? '#10B981' : '#9CA3AF', fontWeight: active ? 700 : 400, marginTop: 4, display: 'block' }}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: currentIdx > stepIdx ? '#10B981' : '#E5E7EB', alignSelf: 'center', marginBottom: 20, minWidth: 20 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Message bubble ── */
function MessageBubble({ msg }) {
  const isReporter = msg.sender === 'reporter';
  const isSistema = msg.sender === 'sistema';

  if (isSistema) {
    return (
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 20, padding: '4px 14px', fontSize: 12 }}>
          🤖 {msg.body}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isReporter ? 'flex-end' : 'flex-start',
      margin: '8px 0',
    }}>
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>
        {isReporter ? 'Tu' : 'Responsabile'} · {new Date(msg.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{
        maxWidth: '80%',
        background: isReporter ? 'linear-gradient(135deg,#6A57D3,#8B78E0)' : '#F1F5F9',
        color: isReporter ? '#fff' : '#0F172A',
        borderRadius: isReporter ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {msg.body}
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const s = {
  page: {
    minHeight: '100vh',
    background: '#F6F8FA',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: '#fff',
    borderBottom: '1px solid #EEF2F7',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  logo: { height: 28, width: 'auto', display: 'block' },
  headerNav: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  linkBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6A57D3',
    fontWeight: 600,
    fontSize: 14,
    padding: '6px 12px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  linkBtnIcon: { fontSize: 14 },
  main: { flex: 1, padding: '24px 20px 40px' },
  footer: {
    background: '#fff',
    borderTop: '1px solid #EEF2F7',
    padding: '16px 20px',
    textAlign: 'center',
  },
  footerText: { margin: 0, color: '#94A3B8', fontSize: 13 },

  // Container
  container: {
    maxWidth: 680,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  // Hero
  hero: {
    background: 'linear-gradient(135deg, #fff9f0 0%, #f0edff 100%)',
    border: '1px solid #ede9fe',
    borderRadius: 20,
    padding: '32px 28px',
    textAlign: 'center',
  },
  heroBadge: {
    display: 'inline-block',
    background: 'linear-gradient(135deg,#D0933C,#6A57D3)',
    color: '#fff',
    borderRadius: 20,
    padding: '4px 16px',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 16,
  },
  heroTitle: {
    margin: '0 0 12px',
    fontSize: 'clamp(22px, 4vw, 30px)',
    fontWeight: 900,
    color: '#0F172A',
    lineHeight: 1.3,
  },
  heroSub: {
    margin: '0 0 24px',
    color: '#64748B',
    fontSize: 15,
    lineHeight: 1.6,
    maxWidth: 480,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  heroBtns: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },

  // Cards
  card: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #EEF2F7',
    padding: '20px 22px',
    boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
  },
  cardTitle: { margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#0F172A' },
  cardLabel: {
    margin: '0 0 14px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#94A3B8',
  },

  // Steps preview
  stepsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stepArrow: { color: '#CBD5E1', fontWeight: 900, fontSize: 18 },
  stepItem: { textAlign: 'center', minWidth: 90 },
  stepCircle: { fontSize: 28, marginBottom: 4 },
  stepNum: { fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
  stepLabel: { fontSize: 13, color: '#334155', fontWeight: 600, marginTop: 2 },

  // Security list
  securityList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  securityItem: { fontSize: 14, color: '#334155', lineHeight: 1.5 },

  // Categories
  categoriesGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catChip: {
    background: '#F1F5F9',
    border: '1px solid #E2E8F0',
    borderRadius: 20,
    padding: '5px 12px',
    fontSize: 13,
    color: '#334155',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: '#6A57D3',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
  },

  // Buttons
  btnPrimary: {
    background: 'linear-gradient(135deg, #D0933C 0%, #6A57D3 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px 28px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    boxShadow: '0 4px 16px rgba(106,87,211,0.3)',
    transition: 'opacity 0.2s',
  },
  btnOutline: {
    background: '#fff',
    color: '#6A57D3',
    border: '2px solid #6A57D3',
    borderRadius: 12,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#64748B',
    fontSize: 14,
    fontWeight: 600,
    padding: '4px 0',
    alignSelf: 'flex-start',
  },

  // Step indicator
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #EEF2F7',
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  },
  stepIndicatorItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 },
  stepIndicatorCircle: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
  },
  stepIndicatorLabel: { fontSize: 12, textAlign: 'center', lineHeight: 1.3 },
  stepIndicatorLine: { height: 2, width: 24, flexShrink: 0 },

  // Form
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 },
  req: { color: '#EF4444', marginLeft: 2 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 15,
    color: '#0F172A',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 15,
    color: '#0F172A',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    appearance: 'auto',
  },
  radioGroup: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  radioItem: {
    border: '1.5px solid #E5E7EB',
    borderRadius: 20,
    padding: '7px 14px',
    fontSize: 14,
    cursor: 'pointer',
    color: '#334155',
    fontWeight: 500,
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  radioItemActive: {
    border: '1.5px solid #6A57D3',
    background: '#EEF2FF',
    color: '#6A57D3',
    fontWeight: 700,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    cursor: 'pointer',
  },

  // Files
  fileArea: {
    border: '2px dashed #D1D5DB',
    borderRadius: 12,
    padding: '20px',
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    transition: 'border-color 0.2s',
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#F8FAFC',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    padding: '8px 12px',
  },
  fileRemove: {
    background: '#FEE2E2',
    border: 'none',
    borderRadius: 6,
    color: '#EF4444',
    cursor: 'pointer',
    fontWeight: 700,
    padding: '2px 8px',
    fontSize: 12,
  },

  // Info/error/warning
  infoBox: {
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 13,
    color: '#92400E',
    lineHeight: 1.6,
  },
  errorBox: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 14,
    color: '#B91C1C',
  },
  warnBox: {
    marginTop: 14,
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 13,
    color: '#92400E',
    lineHeight: 1.6,
  },

  // Password
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: 0,
  },

  // Summary
  summaryRow: { display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' },
  summaryKey: { fontSize: 12, fontWeight: 600, color: '#94A3B8', minWidth: 80, paddingTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' },
  summaryVal: { fontSize: 14, color: '#0F172A', flex: 1 },

  // Success
  successBanner: {
    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '1px solid #86efac',
    borderRadius: 16,
    padding: '24px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },

  // Receipt
  receiptRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid #F1F5F9',
  },
  receiptKey: { margin: 0, fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  receiptVal: { margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: '#0F172A', letterSpacing: '0.05em' },
  copyBtn: {
    background: 'linear-gradient(135deg,#D0933C,#6A57D3)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Thread
  messagesContainer: {
    background: '#F8FAFC',
    borderRadius: 12,
    padding: '14px 16px',
    maxHeight: 400,
    overflowY: 'auto',
    border: '1px solid #EEF2F7',
    display: 'flex',
    flexDirection: 'column',
  },
};
