// frontend/src/pages/Landing.jsx
// Sito vetrina pubblico di ClockEasy (home "/" per chi non è autenticato).
// Nessun prezzo: tutte le CTA portano al contatto diretto.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import s from './Landing.module.css';

const CONTACT_EMAIL = 'clockeasyapp@gmail.com';

/* ------------------------------------------------------------------ */
/* Hook di utilità                                                     */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e) => setReduced(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

// Aggiunge la classe "visible" agli elementi con data-reveal quando entrano in viewport
function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(s.visible));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(s.visible);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

// Numero che "scorre" fino al valore target
function AnimatedNumber({ value, decimals = 0 }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const dur = 600;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (value - from) * eased;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value]);
  return <>{shown.toLocaleString('it-IT', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</>;
}

/* ------------------------------------------------------------------ */
/* Icone (inline, nessuna dipendenza)                                  */
/* ------------------------------------------------------------------ */

const I = {
  clock: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  users: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8" />,
  chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
  doc: <><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M10 13h6M10 17h4" /></>,
  sign: <path d="M3 17c3-1 4-6 6-6s1 5 3 5 3-3 4-3 1 2 5 2M4 21h16" />,
  ai: <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M7 7l-1.4-1.4M18.4 18.4 17 17M17 7l1.4-1.4M5.6 18.4 7 17M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  shield: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4" />,
  qr: <path d="M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2" />,
  pin: <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4" />,
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7Z" />,
  hand: <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.5 15.5a1.5 1.5 0 0 1 2.3-1.9L8 16" />,
  check: <path d="M5 12.5 10 17 19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  mail: <path d="M3 6h18v12H3V6ZM3 7l9 6 9-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M4 12 20 4l-6 16-3-7-7-1Z" />,
  layers: <path d="M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5l10 5 10-5" />,
};

function Icon({ name, size = 22, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {I[name]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* QR dinamico finto (cambia ogni pochi secondi, come quello reale)    */
/* ------------------------------------------------------------------ */

function makeQrMatrix(seed) {
  const N = 21;
  let x = seed * 9301 + 49297;
  const rnd = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const m = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) m[r][c] = rnd() > 0.52 ? 1 : 0;
  const finder = (r0, c0) => {
    for (let r = -1; r < 8; r++)
      for (let c = -1; c < 8; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        m[rr][cc] = inside && (edge || core) ? 1 : 0;
      }
  };
  finder(0, 0);
  finder(0, N - 7);
  finder(N - 7, 0);
  return m;
}

function DynamicQR({ seed }) {
  const m = useMemo(() => makeQrMatrix(seed), [seed]);
  return (
    <svg viewBox="-1 -1 23 23" className={s.qrSvg} aria-hidden="true">
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {m.map((row, r) =>
        row.map((v, c) =>
          v ? <rect key={`${r}-${c}`} x={c} y={r} width="1.02" height="1.02" fill="#0B1020" /> : null
        )
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* NAVBAR                                                              */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  ['#perche', 'Perché ClockEasy'],
  ['#giornata', 'Come funziona'],
  ['#moduli', 'Moduli'],
  ['#clockai', 'ClockAI'],
  ['#faq', 'FAQ'],
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setScrolled(h.scrollTop > 8);
      setProgress(max > 0 ? h.scrollTop / max : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className={`${s.nav} ${scrolled ? s.navScrolled : ''}`}>
      <div className={s.progress} style={{ transform: `scaleX(${progress})` }} />
      <div className={s.navInner}>
        <a href="#top" className={s.navLogo} aria-label="ClockEasy, torna su">
          <img src="/Logo_esteso.png" alt="ClockEasy" />
        </a>
        <nav className={`${s.navLinks} ${open ? s.navLinksOpen : ''}`}>
          {NAV_LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <a href="#contatti" className={s.navMobileOnly} onClick={() => setOpen(false)}>
            Contattaci
          </a>
        </nav>
        <div className={s.navCta}>
          <Link to="/login" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>
            Accedi
          </Link>
          <a href="#contatti" className={`${s.btn} ${s.btnPrimary} ${s.btnSm} ${s.hideXs}`}>
            Contattaci
          </a>
          <button
            type="button"
            className={`${s.burger} ${open ? s.burgerOpen : ''}`}
            aria-label={open ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* HERO con totem QR animato e feed timbrature live                    */
/* ------------------------------------------------------------------ */

const FEED_PEOPLE = [
  ['Giulia R.', 'Sede Milano', 'Entrata'],
  ['Marco B.', 'Sede Torino', 'Entrata'],
  ['Sara L.', 'Magazzino', 'Entrata'],
  ['Luca F.', 'Sede Milano', 'Uscita pausa'],
  ['Elena C.', 'Punto vendita 3', 'Entrata'],
  ['Davide M.', 'Sede Torino', 'Rientro pausa'],
  ['Chiara P.', 'Magazzino', 'Entrata'],
  ['Andrea G.', 'Punto vendita 1', 'Uscita'],
];

function Hero({ reduced }) {
  const [seed, setSeed] = useState(7);
  const [left, setLeft] = useState(5);
  const [feed, setFeed] = useState(() => FEED_PEOPLE.slice(0, 3).map((p, i) => ({ id: i, p, t: '08:0' + (2 - i) })));
  const [present, setPresent] = useState(38);
  const idRef = useRef(3);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setSeed((v) => v + 1);
          return 5;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      const id = idRef.current++;
      const p = FEED_PEOPLE[id % FEED_PEOPLE.length];
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setFeed((f) => [{ id, p, t: `${hh}:${mm}` }, ...f].slice(0, 4));
      setPresent((n) => (n >= 45 ? 38 : n + 1));
    }, 2600);
    return () => clearInterval(t);
  }, [reduced]);

  return (
    <section className={s.hero} id="top">
      <div className={s.heroGlowA} aria-hidden="true" />
      <div className={s.heroGlowB} aria-hidden="true" />
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <span className={s.pill}>
            <span className={s.pillDot} /> Il gestionale HR semplice, per davvero
          </span>
          <h1 className={s.h1}>
            Presenze, documenti e comunicazioni.
            <br />
            <span className={s.gradText}>Tutto in un'unica app.</span>
          </h1>
          <p className={s.heroSub}>
            ClockEasy sostituisce fogli Excel, cartellini di carta, email e gruppi WhatsApp con un'unica piattaforma:
            i dipendenti timbrano con lo smartphone, l'ufficio HR ha tutto sotto controllo in tempo reale.
          </p>
          <div className={s.heroActions}>
            <a href="#contatti" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
              Richiedi una demo <Icon name="arrow" size={18} />
            </a>
            <a href="#perche" className={`${s.btn} ${s.btnOutline} ${s.btnLg}`}>
              Scopri perché serve
            </a>
          </div>
          <ul className={s.heroChecks}>
            <li><Icon name="check" size={16} /> Nessuna installazione sui PC</li>
            <li><Icon name="check" size={16} /> Attivi solo i moduli che ti servono</li>
            <li><Icon name="check" size={16} /> Ti seguiamo nell'avvio</li>
          </ul>
        </div>

        <div className={s.heroVisual} aria-label="Anteprima animata di ClockEasy">
          <div className={s.totem}>
            <div className={s.totemHead}>
              <span>Totem · Sede Milano</span>
              <span className={s.live}><span className={s.liveDot} /> LIVE</span>
            </div>
            <div className={s.qrWrap}>
              <DynamicQR seed={seed} key={seed} />
              <div className={s.scanLine} aria-hidden="true" />
            </div>
            <div className={s.qrTimer}>
              Il codice cambia tra <strong>{left}s</strong>
              <div className={s.qrBar}><span style={{ width: `${(left / 5) * 100}%` }} /></div>
            </div>
          </div>

          <div className={s.feedCard}>
            <div className={s.feedHead}>
              <span>Timbrature di oggi</span>
              <strong>{present}<small>/45 presenti</small></strong>
            </div>
            <ul className={s.feedList}>
              {feed.map((f) => (
                <li key={f.id} className={s.feedItem}>
                  <span className={s.avatar}>{f.p[0].split(' ').map((x) => x[0]).join('')}</span>
                  <span className={s.feedWho}>
                    <b>{f.p[0]}</b>
                    <small>{f.p[1]}</small>
                  </span>
                  <span className={`${s.feedTag} ${f.p[2].startsWith('Uscita') ? s.feedTagOut : ''}`}>{f.p[2]}</span>
                  <span className={s.feedTime}>{f.t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={s.floatChip}>
            <Icon name="sign" size={18} />
            <span><b>Contratto firmato</b><small>da Sara L. · ora</small></span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PRIMA / DOPO — interruttore interattivo                             */
/* ------------------------------------------------------------------ */

const BEFORE_AFTER = [
  {
    icon: 'clock',
    title: 'Presenze',
    before: 'Cartellini di carta o fogli Excel da ricopiare a fine mese, con errori e firme mancanti.',
    after: 'Ogni dipendente timbra con lo smartphone inquadrando il QR: ore calcolate ed esportabili in un clic.',
  },
  {
    icon: 'doc',
    title: 'Cedolini e documenti',
    before: 'PDF unico dal consulente da dividere a mano e inviare uno per uno via email.',
    after: 'Carichi il file una volta: ClockEasy lo divide per codice fiscale e lo consegna a ciascuno nella sua area.',
  },
  {
    icon: 'chat',
    title: 'Comunicazioni',
    before: "Avvisi in bacheca o su WhatsApp: impossibile sapere chi li ha letti davvero.",
    after: 'Invii a tutti, a una sede o a un singolo e vedi in tempo reale chi ha letto e chi no.',
  },
  {
    icon: 'sign',
    title: 'Firme',
    before: 'Stampa, firma, scansiona, archivia. E rincorri chi non ha ancora firmato.',
    after: 'Firma elettronica direttamente dal telefono, con stato aggiornato e promemoria automatici.',
  },
  {
    icon: 'pin',
    title: 'Più sedi',
    before: 'Ogni sede gestisce le cose a modo suo e i dati arrivano in ritardo.',
    after: 'Una sola vista per tutte le sedi, con team leader che vedono solo la propria squadra.',
  },
];

function BeforeAfter() {
  const [withCE, setWithCE] = useState(true);
  return (
    <section className={`${s.section} ${s.sectionAlt}`} id="perche">
      <div className={s.inner}>
        <div className={s.sectionHead} data-reveal>
          <span className={s.eyebrow}>Perché ClockEasy</span>
          <h2 className={s.h2}>Il lavoro HR di tutti i giorni, senza il caos</h2>
          <p className={s.sub}>
            Prova l'interruttore: ecco cosa cambia nella gestione del personale quando tutto passa da un'unica app.
          </p>
        </div>

        <div className={s.switchRow} data-reveal>
          <span className={!withCE ? s.switchLabelOn : s.switchLabel}>Senza ClockEasy</span>
          <button
            type="button"
            role="switch"
            aria-checked={withCE}
            aria-label="Mostra con o senza ClockEasy"
            className={`${s.switch} ${withCE ? s.switchOn : ''}`}
            onClick={() => setWithCE((v) => !v)}
          >
            <span className={s.switchThumb} />
          </button>
          <span className={withCE ? s.switchLabelOn : s.switchLabel}>Con ClockEasy</span>
        </div>

        {/* data-reveal sul contenitore: le card cambiano className al toggle e perderebbero la classe "visible" */}
        <div className={s.baGrid} data-reveal>
          {BEFORE_AFTER.map((row, i) => (
            <article
              key={row.title}
              className={`${s.baCard} ${withCE ? s.baCardAfter : s.baCardBefore}`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className={s.baIcon}>
                <Icon name={row.icon} />
              </div>
              <h3>{row.title}</h3>
              <div className={s.baFlip}>
                <p className={s.baBefore} aria-hidden={withCE}>
                  <Icon name="x" size={16} /> {row.before}
                </p>
                <p className={s.baAfter} aria-hidden={!withCE}>
                  <Icon name="check" size={16} /> {row.after}
                </p>
              </div>
            </article>
          ))}
          <article className={`${s.baCard} ${s.baSummary}`}>
            <span className={s.baSummaryBig}>{withCE ? '1' : '5+'}</span>
            <p>{withCE ? 'unica piattaforma per persone, presenze e documenti' : 'strumenti diversi da tenere allineati a mano'}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* UNA GIORNATA CON CLOCKEASY — timeline auto-play                     */
/* ------------------------------------------------------------------ */

const DAY = [
  {
    time: '08:00',
    title: 'Si timbra in 2 secondi',
    text: "Il dipendente apre l'app e inquadra il QR del totem in sede. Il codice cambia di continuo: niente timbrature fatte da casa o al posto di un collega.",
    screen: 'timbra',
  },
  {
    time: '09:30',
    title: 'Una comunicazione arriva a tutti',
    text: "L'HR pubblica il nuovo regolamento ferie. Parte una notifica push e dalla dashboard si vede, persona per persona, chi l'ha letto.",
    screen: 'comunicazione',
  },
  {
    time: '12:00',
    title: 'I cedolini si distribuiscono da soli',
    text: 'Il PDF del consulente viene diviso automaticamente per codice fiscale: ogni dipendente trova solo il proprio cedolino.',
    screen: 'cedolini',
  },
  {
    time: '15:00',
    title: 'Firme senza carta',
    text: 'Contratti, informative e lettere si firmano dal telefono. Lo stato è sempre aggiornato e ai ritardatari arriva un promemoria.',
    screen: 'firma',
  },
  {
    time: '18:00',
    title: 'Il mese è già pronto',
    text: 'Le ore lavorate sono già calcolate. Esporti le presenze per il consulente del lavoro, senza ricopiare nulla.',
    screen: 'export',
  },
];

function PhoneScreen({ screen }) {
  switch (screen) {
    case 'timbra':
      return (
        <div className={s.scr}>
          <div className={s.scrTitle}>Buongiorno, Giulia</div>
          <div className={s.scrScan}>
            <div className={s.scrScanFrame}>
              <DynamicQR seed={3} />
            </div>
          </div>
          <div className={s.scrOk}>
            <Icon name="check" size={18} /> Entrata registrata · 08:00
          </div>
          <div className={s.scrMuted}>Sede Milano · Turno 08:00–17:00</div>
        </div>
      );
    case 'comunicazione':
      return (
        <div className={s.scr}>
          <div className={s.scrNotif}>
            <Icon name="bell" size={16} />
            <span><b>Nuova comunicazione</b><small>Regolamento ferie 2027</small></span>
          </div>
          <div className={s.scrTitle}>Lettura in tempo reale</div>
          <div className={s.scrStat}>
            <span>Letta</span><b>38/45</b>
          </div>
          <div className={s.scrBarBig}><span style={{ width: '84%' }} /></div>
          <ul className={s.scrList}>
            <li><span className={s.okDot} />Marco B. · letta 09:31</li>
            <li><span className={s.okDot} />Elena C. · letta 09:33</li>
            <li><span className={s.waitDot} />Andrea G. · non ancora</li>
          </ul>
        </div>
      );
    case 'cedolini':
      return (
        <div className={s.scr}>
          <div className={s.scrTitle}>Cedolini · Ottobre</div>
          <div className={s.scrSplit}>
            <div className={s.scrFile}><Icon name="doc" size={20} /> cedolini_ottobre.pdf</div>
            <div className={s.scrArrow}>↓ divisione per codice fiscale</div>
            <div className={s.scrFiles}>
              {['RSS GLI…', 'BNC MRC…', 'LNR SRA…', 'FRR LCU…'].map((cf) => (
                <span key={cf} className={s.scrMiniFile}><Icon name="doc" size={14} />{cf}</span>
              ))}
            </div>
          </div>
          <div className={s.scrOk}><Icon name="check" size={18} /> 45 documenti consegnati</div>
        </div>
      );
    case 'firma':
      return (
        <div className={s.scr}>
          <div className={s.scrTitle}>Da firmare</div>
          <div className={s.scrDoc}>
            <b>Lettera di assunzione</b>
            <small>Inviata dall'ufficio HR</small>
            <svg viewBox="0 0 160 40" className={s.signature} aria-hidden="true">
              <path d="M5 30c15-2 18-22 28-22s-4 24 6 24 10-18 18-18-2 16 8 16 14-10 22-10 6 8 18 6 20-6 40-8" />
            </svg>
          </div>
          <div className={s.scrOk}><Icon name="check" size={18} /> Firmato · 15:02</div>
          <div className={s.scrMuted}>2 colleghi riceveranno un promemoria</div>
        </div>
      );
    default:
      return (
        <div className={s.scr}>
          <div className={s.scrTitle}>Presenze · Ottobre</div>
          <div className={s.scrChart}>
            {[62, 80, 74, 90, 85, 70, 95, 88, 76, 92].map((h, i) => (
              <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
          <div className={s.scrStat}><span>Ore lavorate</span><b>7.128 h</b></div>
          <div className={s.scrStat}><span>Straordinari</span><b>142 h</b></div>
          <div className={s.scrBtn}>Esporta per il consulente</div>
        </div>
      );
  }
}

function DayTimeline({ reduced }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || paused || !inView) return;
    const t = setTimeout(() => setStep((v) => (v + 1) % DAY.length), 4500);
    return () => clearTimeout(t);
  }, [step, paused, inView, reduced]);

  return (
    <section className={s.section} id="giornata" ref={sectionRef}>
      <div className={s.inner}>
        <div className={s.sectionHead} data-reveal>
          <span className={s.eyebrow}>Come funziona</span>
          <h2 className={s.h2}>Una giornata in azienda con ClockEasy</h2>
          <p className={s.sub}>Dalla prima timbratura all'export di fine mese: ecco cosa succede, ora per ora.</p>
        </div>

        <div
          className={s.dayGrid}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          data-reveal
        >
          <ol className={s.dayList}>
            {DAY.map((d, i) => (
              <li key={d.time}>
                <button
                  type="button"
                  className={`${s.dayItem} ${i === step ? s.dayItemActive : ''}`}
                  onClick={() => setStep(i)}
                  aria-current={i === step}
                >
                  <span className={s.dayTime}>{d.time}</span>
                  <span className={s.dayBody}>
                    <b>{d.title}</b>
                    <span className={s.dayText}>{d.text}</span>
                  </span>
                  {i === step && !reduced && (
                    <span className={`${s.dayProgress} ${paused || !inView ? s.dayProgressPaused : ''}`} key={step} />
                  )}
                </button>
              </li>
            ))}
          </ol>

          <div className={s.phoneStage}>
            <div className={s.phone}>
              <div className={s.phoneNotch} />
              <div className={s.phoneTop}>
                <span>{DAY[step].time}</span>
                <span className={s.phoneBrand}>ClockEasy</span>
              </div>
              <div className={s.phoneBody} key={step}>
                <PhoneScreen screen={DAY[step].screen} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* MODULI                                                              */
/* ------------------------------------------------------------------ */

const MODULES = [
  {
    icon: 'qr',
    title: 'Presenze e timbratura QR',
    short: 'Timbrature dallo smartphone, ore calcolate',
    desc: "Il dipendente timbra dall'app inquadrando il QR dinamico della sede. Entrate, uscite e pause finiscono subito in dashboard; a fine mese esporti tutto per il consulente.",
    points: ['QR che cambia ogni pochi secondi', 'Calcolo automatico ore e straordinari', 'Export presenze per il consulente'],
  },
  {
    icon: 'users',
    title: 'Dipendenti e sedi',
    short: 'Anagrafica, ruoli, più sedi',
    desc: "Una scheda per ogni dipendente con dati, documenti e storico. Gestisci più sedi e assegna i ruoli giusti: amministratori, team leader, dipendenti.",
    points: ['Scheda dipendente centralizzata', 'Multi-sede', 'Dashboard dedicata per i team leader'],
  },
  {
    icon: 'chat',
    title: 'Comunicazioni',
    short: 'Avvisi con conferma di lettura',
    desc: "Invia comunicazioni a tutta l'azienda, a una sede o a singole persone. Notifica push immediata e conferma di lettura per ognuno.",
    points: ['Notifiche push sull\'app', 'Chi ha letto e chi no, in tempo reale', 'Modifica con avviso opzionale'],
  },
  {
    icon: 'doc',
    title: 'Documenti e cedolini',
    short: 'Divisione automatica per codice fiscale',
    desc: 'Carichi un unico PDF con tutti i cedolini o le CU: ClockEasy riconosce il codice fiscale e consegna a ciascuno il suo documento, in un archivio sempre consultabile.',
    points: ['Split e unione automatici per CF', 'Caricamento massivo', 'Ogni dipendente vede solo i suoi documenti'],
  },
  {
    icon: 'sign',
    title: 'Firma elettronica',
    short: 'Contratti firmati dal telefono',
    desc: 'Fai firmare contratti, informative e lettere direttamente dall\'app, senza stampare nulla. Lo stato di ogni firma è sempre sotto controllo.',
    points: ['Firma da smartphone', 'Stato firma aggiornato', 'Promemoria a chi non ha ancora firmato'],
  },
  {
    icon: 'ai',
    title: 'ClockAI, assistente HR',
    short: 'Chiedi, e ti risponde con i tuoi dati',
    desc: 'Fai domande in italiano come a un collega: "chi è assente oggi?", "quante ore ha fatto il magazzino a ottobre?". ClockAI cerca la risposta per te.',
    points: ['Domande in linguaggio naturale', 'Rispetta i permessi del tuo account', 'Risposte in pochi secondi'],
  },
  {
    icon: 'shield',
    title: 'Whistleblowing',
    short: 'Canale di segnalazione riservato',
    desc: 'Un canale dedicato e riservato per le segnalazioni, gestito da un ruolo separato con accesso esclusivo, per tutelare chi segnala.',
    points: ['Segnalazioni riservate', 'Gestore dedicato e separato', 'Allegati e storico'],
  },
];

function Modules({ reduced }) {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (reduced || hover) return;
    const t = setTimeout(() => setActive((v) => (v + 1) % MODULES.length), 6000);
    return () => clearTimeout(t);
  }, [active, hover, reduced]);

  const m = MODULES[active];
  return (
    <section className={`${s.section} ${s.sectionDark}`} id="moduli">
      <div className={s.inner}>
        <div className={s.sectionHead} data-reveal>
          <span className={`${s.eyebrow} ${s.eyebrowLight}`}>Moduli</span>
          <h2 className={`${s.h2} ${s.light}`}>Tutto quello che serve all'ufficio HR</h2>
          <p className={`${s.sub} ${s.subLight}`}>
            Sette moduli che lavorano insieme. Parti da quelli che ti servono oggi, aggiungi gli altri quando vuoi.
          </p>
        </div>

        <div
          className={s.modGrid}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          data-reveal
        >
          <div className={s.modList} role="tablist" aria-label="Moduli ClockEasy">
            {MODULES.map((mod, i) => (
              <button
                key={mod.title}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`${s.modItem} ${i === active ? s.modItemActive : ''}`}
                onClick={() => setActive(i)}
              >
                <span className={s.modIcon}><Icon name={mod.icon} /></span>
                <span>
                  <b>{mod.title}</b>
                  <small>{mod.short}</small>
                </span>
              </button>
            ))}
          </div>

          <div className={s.modPanel} role="tabpanel" key={active}>
            <span className={s.modPanelIcon}><Icon name={m.icon} size={30} /></span>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
            <ul>
              {m.points.map((p) => (
                <li key={p}><Icon name="check" size={18} /> {p}</li>
              ))}
            </ul>
            <a href="#contatti" className={`${s.btn} ${s.btnPrimary}`}>
              Voglio vederlo in azione <Icon name="arrow" size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CALCOLATORE TEMPO RISPARMIATO (stima indicativa, non prezzi)        */
/* ------------------------------------------------------------------ */

// Minuti al mese per dipendente che si stimano risparmiati, voce per voce.
const SAVINGS = [
  { key: 'presenze', label: 'Raccolta e controllo presenze', perEmp: 12 },
  { key: 'documenti', label: 'Distribuzione cedolini e documenti', perEmp: 5 },
  { key: 'comunicazioni', label: 'Comunicazioni e conferme di lettura', perEmp: 4 },
  { key: 'firme', label: 'Firme e archiviazione', perEmp: 4 },
];
const PER_SEDE_MIN = 60; // coordinamento tra sedi, minuti al mese per sede aggiuntiva

function Calculator() {
  const [emp, setEmp] = useState(40);
  const [sedi, setSedi] = useState(2);

  const rows = SAVINGS.map((r) => ({ ...r, min: r.perEmp * emp }));
  const coord = Math.max(0, sedi - 1) * PER_SEDE_MIN;
  const totalMin = rows.reduce((a, r) => a + r.min, 0) + coord;
  const hours = totalMin / 60;
  const days = hours / 8;
  const max = Math.max(...rows.map((r) => r.min), coord, 1);

  return (
    <section className={s.section} id="risparmio">
      <div className={s.inner}>
        <div className={s.sectionHead} data-reveal>
          <span className={s.eyebrow}>Tempo risparmiato</span>
          <h2 className={s.h2}>Quanto tempo ti restituisce ClockEasy?</h2>
          <p className={s.sub}>Muovi i cursori con i numeri della tua azienda e guarda la stima cambiare.</p>
        </div>

        <div className={s.calc} data-reveal>
          <div className={s.calcInputs}>
            <label className={s.range}>
              <span className={s.rangeHead}>
                Dipendenti <b>{emp}</b>
              </span>
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={emp}
                onChange={(e) => setEmp(Number(e.target.value))}
                style={{ '--p': `${((emp - 5) / 495) * 100}%` }}
              />
            </label>
            <label className={s.range}>
              <span className={s.rangeHead}>
                Sedi <b>{sedi}</b>
              </span>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={sedi}
                onChange={(e) => setSedi(Number(e.target.value))}
                style={{ '--p': `${((sedi - 1) / 19) * 100}%` }}
              />
            </label>

            <ul className={s.calcBars}>
              {rows.map((r) => (
                <li key={r.key}>
                  <span>{r.label}</span>
                  <span className={s.calcBar}><span style={{ width: `${(r.min / max) * 100}%` }} /></span>
                  <b>{Math.round(r.min / 60)} h</b>
                </li>
              ))}
              <li>
                <span>Coordinamento tra sedi</span>
                <span className={s.calcBar}><span style={{ width: `${(coord / max) * 100}%` }} /></span>
                <b>{Math.round(coord / 60)} h</b>
              </li>
            </ul>
          </div>

          <div className={s.calcResult}>
            <span className={s.calcLabel}>Ogni mese, circa</span>
            <span className={s.calcBig}>
              <AnimatedNumber value={Math.round(hours)} /> <small>ore</small>
            </span>
            <span className={s.calcDays}>
              cioè ≈ <AnimatedNumber value={days} decimals={1} /> giornate lavorative restituite all'ufficio HR
            </span>
            <a href="#contatti" className={`${s.btn} ${s.btnWhite}`}>
              Parliamo della tua azienda <Icon name="arrow" size={18} />
            </a>
            <span className={s.calcNote}>
              Stima indicativa basata su tempi medi per attività manuali tipiche. Il risultato reale dipende da come lavora oggi la tua azienda.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CLOCKAI — demo chat                                                 */
/* ------------------------------------------------------------------ */

const AI_QA = [
  {
    q: 'Chi è assente oggi nella sede di Milano?',
    a: 'Oggi a Milano sono assenti 3 persone: Luca F. (ferie), Paola S. (permesso fino alle 12:00) e Giorgio T. (malattia).',
  },
  {
    q: 'Quante ore ha lavorato il magazzino a ottobre?',
    a: 'A ottobre il magazzino ha registrato 1.284 ore lavorate, di cui 46 di straordinario. È il 4% in più rispetto a settembre.',
  },
  {
    q: 'Chi non ha ancora letto la comunicazione sulle ferie?',
    a: '7 dipendenti su 45 non hanno ancora letto "Regolamento ferie 2027". Vuoi che ti mostri l\'elenco per sede?',
  },
];

function ClockAIDemo({ reduced }) {
  const [msgs, setMsgs] = useState([
    { from: 'ai', text: 'Ciao! Sono ClockAI. Chiedimi qualcosa su presenze, dipendenti o comunicazioni.' },
  ]);
  const [typing, setTyping] = useState(false);
  const [used, setUsed] = useState([]);
  const timers = useRef([]);
  const listRef = useRef(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const ask = (i) => {
    if (typing) return;
    const { q, a } = AI_QA[i];
    setUsed((u) => [...u, i]);
    setMsgs((m) => [...m, { from: 'me', text: q }]);
    setTyping(true);
    const delay = reduced ? 200 : 1100;
    timers.current.push(
      setTimeout(() => {
        setTyping(false);
        if (reduced) {
          setMsgs((m) => [...m, { from: 'ai', text: a }]);
          return;
        }
        // effetto "macchina da scrivere"
        setMsgs((m) => [...m, { from: 'ai', text: '' }]);
        let n = 0;
        const step = () => {
          n += 3;
          setMsgs((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { from: 'ai', text: a.slice(0, n) };
            return copy;
          });
          if (n < a.length) timers.current.push(setTimeout(step, 18));
        };
        step();
      }, delay)
    );
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTyping(false);
    setUsed([]);
    setMsgs([{ from: 'ai', text: 'Ciao! Sono ClockAI. Chiedimi qualcosa su presenze, dipendenti o comunicazioni.' }]);
  };

  const remaining = AI_QA.map((x, i) => i).filter((i) => !used.includes(i));

  return (
    <section className={`${s.section} ${s.sectionAlt}`} id="clockai">
      <div className={`${s.inner} ${s.aiGrid}`}>
        <div className={s.aiCopy} data-reveal>
          <span className={s.eyebrow}>ClockAI</span>
          <h2 className={s.h2}>
            Fai una domanda.
            <br />
            <span className={s.gradText}>Ricevi una risposta, non un report.</span>
          </h2>
          <p className={s.sub}>
            ClockAI è l'assistente HR integrato in ClockEasy. Non devi cercare tra tabelle e filtri: chiedi in italiano
            e ottieni la risposta con i dati della tua azienda, sempre nel rispetto dei permessi di chi la chiede.
          </p>
          <ul className={s.aiPoints}>
            <li><Icon name="check" size={18} /> Risponde su presenze, assenze, dipendenti e comunicazioni</li>
            <li><Icon name="check" size={18} /> Usa solo strumenti controllati, senza accesso libero ai dati</li>
            <li><Icon name="check" size={18} /> Disponibile in ogni pagina del gestionale</li>
          </ul>
          <p className={s.tryHint}>👉 Prova: clicca una domanda nella chat.</p>
        </div>

        <div className={s.chat} data-reveal>
          <div className={s.chatHead}>
            <span className={s.chatAvatar}><Icon name="ai" size={18} /></span>
            <span>
              <b>ClockAI</b>
              <small>Assistente HR · demo</small>
            </span>
            {used.length > 0 && (
              <button type="button" className={s.chatReset} onClick={reset}>
                Ricomincia
              </button>
            )}
          </div>
          <div className={s.chatBody} ref={listRef} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`${s.bubble} ${m.from === 'me' ? s.bubbleMe : s.bubbleAi}`}>
                {m.text}
              </div>
            ))}
            {typing && (
              <div className={`${s.bubble} ${s.bubbleAi} ${s.typing}`} aria-label="ClockAI sta scrivendo">
                <span /><span /><span />
              </div>
            )}
          </div>
          <div className={s.chatSuggest}>
            {remaining.length > 0 ? (
              remaining.map((i) => (
                <button key={i} type="button" onClick={() => ask(i)} disabled={typing}>
                  {AI_QA[i].q}
                </button>
              ))
            ) : (
              <a href="#contatti" className={s.chatCta}>
                Vuoi provarlo con i tuoi dati? Contattaci <Icon name="arrow" size={16} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PUNTI DI FORZA                                                      */
/* ------------------------------------------------------------------ */

const STRENGTHS = [
  { icon: 'qr', title: 'Timbrature affidabili', text: 'Il QR in sede cambia ogni pochi secondi: chi timbra deve essere davvero lì. Niente foto del codice girate su WhatsApp.' },
  { icon: 'hand', title: 'Facile per tutti', text: "Pensato per chi non ama la tecnologia: il dipendente usa l'app per timbrare, leggere e firmare. Nient'altro da imparare." },
  { icon: 'layers', title: 'Modulare', text: 'Attivi solo i moduli che ti servono. Quando l\'azienda cresce, aggiungi il resto senza cambiare strumento.' },
  { icon: 'pin', title: 'Nato per più sedi', text: 'Sedi, reparti e team leader: ognuno vede quello che gli compete, la direzione vede tutto.' },
  { icon: 'bell', title: 'In tempo reale', text: 'Notifiche push, conferme di lettura e stato delle firme aggiornati al momento, non a fine mese.' },
  { icon: 'cloud', title: 'Zero installazioni', text: "Il gestionale funziona dal browser, l'app dallo smartphone. Nessun server da gestire in azienda." },
  { icon: 'shield', title: 'Accessi controllati', text: 'Ruoli e permessi separati per amministratori, team leader, dipendenti e gestore delle segnalazioni.' },
  { icon: 'users', title: 'Un referente vero', text: 'Dietro ClockEasy c\'è una persona che conosci: configurazione, import dei dati e supporto li seguiamo noi.' },
];

function Strengths() {
  // effetto "spotlight" che segue il mouse, aggiornato direttamente sulla card (niente re-render)
  const onMove = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <section className={s.section} id="punti-di-forza">
      <div className={s.inner}>
        <div className={s.sectionHead} data-reveal>
          <span className={s.eyebrow}>Punti di forza</span>
          <h2 className={s.h2}>Perché le aziende scelgono ClockEasy</h2>
        </div>
        <div className={s.strGrid}>
          {STRENGTHS.map((st, i) => (
            <article
              key={st.title}
              className={s.strCard}
              data-reveal
              onMouseMove={onMove}
              style={{ transitionDelay: `${(i % 4) * 70}ms` }}
            >
              <span className={s.strIcon}><Icon name={st.icon} /></span>
              <h3>{st.title}</h3>
              <p>{st.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

const FAQ = [
  {
    q: 'Quanto costa ClockEasy?',
    a: "Ogni azienda è diversa per numero di dipendenti, sedi e moduli necessari, quindi non abbiamo un listino unico. Scrivici: prepariamo insieme una proposta su misura, senza impegno.",
  },
  {
    q: 'Come timbrano i dipendenti?',
    a: "Con l'app ClockEasy sul proprio smartphone: inquadrano il QR mostrato sul totem o sullo schermo della sede e la timbratura viene registrata subito. Il codice cambia continuamente, quindi non si può timbrare a distanza.",
  },
  {
    q: 'Devo installare qualcosa sui computer dell\'ufficio?',
    a: "No. Il gestionale si usa dal browser, da qualsiasi computer. In sede serve solo un dispositivo (tablet, PC o monitor) che mostri il QR per le timbrature.",
  },
  {
    q: 'Posso attivare solo alcuni moduli?',
    a: 'Sì. Puoi partire, ad esempio, solo da presenze e documenti e aggiungere comunicazioni, firma, ClockAI o whistleblowing in un secondo momento.',
  },
  {
    q: 'Quanto ci vuole per partire?',
    a: "Dipende dal numero di dipendenti e sedi, ma l'avvio è rapido: importiamo noi l'anagrafica, configuriamo sedi e ruoli e ti accompagniamo nei primi giorni.",
  },
  {
    q: 'Chi può vedere i dati dei dipendenti?',
    a: 'Solo chi ha il ruolo per farlo. Amministratori, team leader, dipendenti e gestore delle segnalazioni hanno accessi separati: ognuno vede esclusivamente ciò che gli compete.',
  },
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className={`${s.section} ${s.sectionAlt}`} id="faq">
      <div className={`${s.inner} ${s.faqInner}`}>
        <div className={s.sectionHead} data-reveal>
          <span className={s.eyebrow}>FAQ</span>
          <h2 className={s.h2}>Domande frequenti</h2>
        </div>
        <div className={s.faqList} data-reveal>
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={`${s.faqItem} ${isOpen ? s.faqOpen : ''}`}>
                <button
                  type="button"
                  className={s.faqQ}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span>{f.q}</span>
                  <span className={s.faqPlus}><Icon name="plus" size={18} /></span>
                </button>
                <div className={s.faqA}>
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CONTATTI                                                            */
/* ------------------------------------------------------------------ */

function Contact() {
  const [form, setForm] = useState({ nome: '', azienda: '', email: '', telefono: '', dipendenti: '', messaggio: '' });
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const subject = `Richiesta informazioni ClockEasy — ${form.azienda || form.nome}`;
    const body = [
      `Nome: ${form.nome}`,
      `Azienda: ${form.azienda}`,
      `Email: ${form.email}`,
      form.telefono ? `Telefono: ${form.telefono}` : null,
      form.dipendenti ? `Numero dipendenti: ${form.dipendenti}` : null,
      '',
      form.messaggio,
    ]
      .filter((x) => x !== null)
      .join('\n');
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <section className={s.contact} id="contatti">
      <div className={s.heroGlowA} aria-hidden="true" />
      <div className={`${s.inner} ${s.contactGrid}`}>
        <div className={s.contactCopy} data-reveal>
          <span className={`${s.eyebrow} ${s.eyebrowLight}`}>Contatti</span>
          <h2 className={`${s.h2} ${s.light}`}>Il prezzo giusto lo costruiamo insieme</h2>
          <p className={`${s.sub} ${s.subLight}`}>
            Non esiste un listino uguale per tutti: dipende da quante persone lavorano con te, quante sedi hai e quali
            moduli ti servono. Raccontaci la tua azienda e ti preparo una proposta su misura, con una demo dal vivo.
          </p>
          <ul className={s.contactPoints}>
            <li><Icon name="check" size={18} /> Demo gratuita e senza impegno</li>
            <li><Icon name="check" size={18} /> Proposta costruita sui tuoi numeri</li>
            <li><Icon name="check" size={18} /> Ti rispondo personalmente</li>
          </ul>
          <a className={s.contactMail} href={`mailto:${CONTACT_EMAIL}`}>
            <Icon name="mail" size={20} /> {CONTACT_EMAIL}
          </a>
        </div>

        <form className={s.form} onSubmit={submit} data-reveal>
          <div className={s.formRow}>
            <label>
              Nome e cognome
              <input required value={form.nome} onChange={set('nome')} autoComplete="name" />
            </label>
            <label>
              Azienda
              <input required value={form.azienda} onChange={set('azienda')} autoComplete="organization" />
            </label>
          </div>
          <div className={s.formRow}>
            <label>
              Email
              <input required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </label>
            <label>
              Telefono <span className={s.opt}>(facoltativo)</span>
              <input type="tel" value={form.telefono} onChange={set('telefono')} autoComplete="tel" />
            </label>
          </div>
          <label>
            Quanti dipendenti avete?
            <select value={form.dipendenti} onChange={set('dipendenti')}>
              <option value="">Seleziona…</option>
              <option>1–10</option>
              <option>11–50</option>
              <option>51–250</option>
              <option>251–500</option>
              <option>Più di 500</option>
            </select>
          </label>
          <label>
            Di cosa avete bisogno?
            <textarea
              rows={4}
              value={form.messaggio}
              onChange={set('messaggio')}
              placeholder="Es. timbrature su 3 sedi e distribuzione cedolini…"
            />
          </label>
          <button type="submit" className={`${s.btn} ${s.btnPrimary} ${s.btnLg} ${s.btnBlock}`}>
            <Icon name="send" size={18} /> Contattami
          </button>
          <p className={s.formNote}>
            {sent
              ? `Si è aperto il tuo programma di posta con il messaggio pronto. Se non si apre, scrivi direttamente a ${CONTACT_EMAIL}.`
              : 'Cliccando si apre il tuo programma di posta con il messaggio già compilato.'}
          </p>
        </form>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FOOTER                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className={s.footer}>
      <div className={`${s.inner} ${s.footerInner}`}>
        <div className={s.footerBrand}>
          <img src="/Logo_esteso.png" alt="ClockEasy" />
          <p>Il gestionale HR per presenze, documenti e comunicazioni.</p>
        </div>
        <div className={s.footerCol}>
          <h4>Prodotto</h4>
          <a href="#perche">Perché ClockEasy</a>
          <a href="#moduli">Moduli</a>
          <a href="#clockai">ClockAI</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className={s.footerCol}>
          <h4>Area clienti</h4>
          <Link to="/login">Accedi al gestionale</Link>
          <a href="#contatti">Richiedi una demo</a>
        </div>
        <div className={s.footerCol}>
          <h4>Contatti</h4>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </div>
      <div className={`${s.inner} ${s.footerBottom}`}>
        <span>© {new Date().getFullYear()} ClockEasy. Tutti i diritti riservati.</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* PAGINA                                                              */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const rootRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  useReveal(rootRef);

  useEffect(() => {
    const prev = document.title;
    document.title = 'ClockEasy — Presenze, documenti e comunicazioni in un\'unica app';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className={s.page} ref={rootRef}>
      <Navbar />
      <main>
        <Hero reduced={reduced} />
        <BeforeAfter />
        <DayTimeline reduced={reduced} />
        <Modules reduced={reduced} />
        <Calculator />
        <ClockAIDemo reduced={reduced} />
        <Strengths />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
