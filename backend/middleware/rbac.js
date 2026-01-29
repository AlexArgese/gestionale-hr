// backend/middleware/rbac.js
function allowRoles(...ruoli) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      if (!ruoli.includes(req.user.ruolo)) {
        console.warn('RBAC forbid:', { got: req.user.ruolo, expected: ruoli });
        return res.status(403).json({ error: 'Forbidden', ruolo: req.user.ruolo });
      }
      next();
    };
  }
  
  module.exports = { allowRoles };
  