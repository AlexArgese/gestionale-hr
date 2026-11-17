// backend/routes/comunicazioni.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { allowRoles } = require('../middleware/rbac');

const { upload } = require('../services/comunicazioni/upload');
const {
  feedHandler,
  letturaHandler,
  detailHandler,
  likeHandler,
  commentsListHandler,
  commentsCreateHandler,
} = require('../services/comunicazioni/feed');
const {
  viewHandler,
  downloadHandler,
  attachmentViewHandler,
  attachmentDownloadHandler,
} = require('../services/comunicazioni/attachments');
const {
  listHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  adminBreakdownHandler,
} = require('../services/comunicazioni/admin');

/* =========================================================
   FEED / LETTURE / LIKE / COMMENTI (lato dipendente)
   ========================================================= */
router.get('/feed', requireAuth, feedHandler);
router.post('/:id/lettura', requireAuth, letturaHandler);
router.get('/:id', requireAuth, detailHandler);
router.post('/:id/like', requireAuth, likeHandler);
router.get('/:id/comments', requireAuth, commentsListHandler);
router.post('/:id/comments', requireAuth, commentsCreateHandler);

/* =========================================================
   ROTTE ADMIN: elenco/crea/modifica/elimina/breakdown
   ========================================================= */
router.get('/', requireAuth, allowRoles('admin'), listHandler);
router.post('/', requireAuth, allowRoles('admin'), upload.array('allegato'), createHandler);
router.put('/:id', requireAuth, updateHandler);
router.delete('/:id', requireAuth, allowRoles('admin'), deleteHandler);
router.get('/:id/admin', requireAuth, adminBreakdownHandler);

/* =========================================================
   ALLEGATI (view/download, legacy + per-attachment)
   ========================================================= */
router.get('/:id/view', requireAuth, viewHandler);
router.get('/:id/download', requireAuth, downloadHandler);
router.get('/attachments/:attachmentId/view', requireAuth, attachmentViewHandler);
router.get('/attachments/:attachmentId/download', requireAuth, attachmentDownloadHandler);

module.exports = router;
