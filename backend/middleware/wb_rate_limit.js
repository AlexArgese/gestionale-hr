// backend/middleware/wb_rate_limit.js
const rateLimit = require('express-rate-limit');

const createReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1h
  max: 5,                    // 5 nuove segnalazioni/ora per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests' },
});

const anonMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 20,                   // 20 messaggi/15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests' },
});

module.exports = { createReportLimiter, anonMessageLimiter };
