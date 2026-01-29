// backend/lib/files.js
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'data', 'wb'); // NON esposto come static
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function pathForAttachment(reportId, attachmentId) {
  const dir = path.join(BASE, reportId);
  ensureDir(dir);
  return { dir, file: path.join(dir, attachmentId) }; // niente estensione
}

function storageKey(reportId, attachmentId) {
  // chiave interna per retention (niente nomi utente)
  return `${reportId}/${attachmentId}`;
}

function filePathFromStorageKey(storage_key) {
  return path.join(BASE, storage_key); // reportId/attachmentId
}

module.exports = { pathForAttachment, storageKey, filePathFromStorageKey };
