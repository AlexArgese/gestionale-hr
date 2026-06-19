const express = require('express');
const cors = require('cors');
const path = require('path');

process.env.TZ = 'Europe/Rome';
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:8081',
  'http://192.168.182.51:8081',
  process.env.FRONTEND_URL, 
  'https://gestionale-hr-zorh.vercel.app',
  'https://clockeasy.it',
  'https://www.clockeasy.it'
].filter(Boolean);


app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});


// ✅ CORS globale (senza app.options('*', ...))
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    const isVercel = /^https:\/\/.*\.vercel\.app$/.test(origin);

    if (allowedOrigins.includes(origin) || isVercel) return cb(null, true);

    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],    // 👈 aggiunto PATCH
  allowedHeaders: ['Authorization','Content-Type','Accept','X-Requested-With'],
}));

// ✅ opzionale ma utile: gestisci OPTIONS senza wildcard '*'
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const yousignWebhookRoutes = require("./routes/yousignWebhook");
app.use("/yousign", yousignWebhookRoutes);

// Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const utentiRoutes = require('./routes/utenti');
const societaRoutes = require('./routes/societa');
const staticRoutes = require('./routes/static');
const documentiRoutes = require('./routes/documenti');
const dashboardRoutes = require('./routes/dashboard');
const comunicazioniRoutes = require('./routes/comunicazioni');
const presenzeRoutes = require('./routes/presenze');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profilo');
const sediRoutes = require('./routes/sedi');
const firmaRoutes = require("./routes/firma");

const pushRoutes = require("./routes/push");


// WB ROUTES
const wbAnonRoutes = require('./routes/wb');            // /wb/anon/...
const wbManagerRoutes = require('./routes/wb_manager'); // /wb/manager/...
const wbAttachRoutes = require('./routes/wb_attachments'); // /wb/(anon|manager)/attachments...

// mount
app.use('/utenti', utentiRoutes);
app.use('/societa', societaRoutes);
app.use('/static', staticRoutes);
app.use('/documenti', documentiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/comunicazioni', comunicazioniRoutes);
app.use('/presenze', presenzeRoutes);
app.use('/auth', authRoutes);
app.use('/profilo', profileRoutes);
app.use('/sedi', sediRoutes);
app.use("/firma", firmaRoutes);
app.use("/push", pushRoutes);


// WB mount
app.use('/wb', wbAnonRoutes);
app.use('/wb/manager', wbManagerRoutes);
app.use('/wb', wbAttachRoutes);

// jobs
const { startWbDeadlinesJob } = require('./jobs/wb_deadlines');
const { startWbRetentionJob } = require('./jobs/wb_retention');
startWbDeadlinesJob();
startWbRetentionJob();

const PORT = process.env.PORT || 3001;
const db = require('./db');

async function runMigrations() {
  await db.query(`ALTER TABLE documenti ADD COLUMN IF NOT EXISTS batch_id UUID`)
    .catch(e => console.warn('migrate batch_id:', e.message));

  await db.query(`
    ALTER TABLE wb_reports
      ADD COLUMN IF NOT EXISTS policy_accepted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS policy_version  TEXT    NOT NULL DEFAULT 'v1'
  `).catch(e => console.warn('migrate wb policy cols:', e.message));

  await db.query(`ALTER TABLE wb_reports DROP CONSTRAINT IF EXISTS wb_reports_status_chk`)
    .catch(e => console.warn('migrate drop status chk:', e.message));
  await db.query(`
    ALTER TABLE wb_reports ADD CONSTRAINT wb_reports_status_chk CHECK (
      status = ANY (ARRAY[
        'ricevuta','in_corso','in_attesa',
        'chiusa_fondata','chiusa_infondata','chiusa',
        'submitted','triage','in_review','need_info',
        'closed_substantiated','closed_unsubstantiated','closed_other'
      ])
    )
  `).catch(e => console.warn('migrate wb status constraint:', e.message));

  await db.query(`ALTER TABLE wb_messages DROP CONSTRAINT IF EXISTS wb_messages_sender_role_check`)
    .catch(e => console.warn('migrate drop sender_role chk:', e.message));
  await db.query(`
    ALTER TABLE wb_messages ADD CONSTRAINT wb_messages_sender_role_check CHECK (
      sender_role = ANY (ARRAY['reporter','manager','sistema'])
    )
  `).catch(e => console.warn('migrate wb sender_role constraint:', e.message));
}

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Backend avviato su http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Errore migrazioni:', err);
    process.exit(1);
  });
