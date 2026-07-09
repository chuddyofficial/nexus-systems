function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.redirect('/login');
}

function ensureAuthApi(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { ensureAuth, ensureAuthApi };
