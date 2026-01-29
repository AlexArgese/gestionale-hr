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
].filter(Boolean);


app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});


// ✅ CORS globale (senza app.options('*', ...))
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);              // curl, app mobile, ecc.
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS: ' + origin));
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

// Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROUTES esistenti
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
const yousignWebhookRoutes = require("./routes/yousignWebhook");
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/presenze', presenzeRoutes);
app.use('/auth', authRoutes);
app.use('/profilo', profileRoutes);
app.use('/sedi', sediRoutes);
app.use("/firma", firmaRoutes);
app.use("/yousign", yousignWebhookRoutes);
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
app.listen(PORT, () => {
  console.log(`✅ Backend avviato su http://localhost:${PORT}`);
});
