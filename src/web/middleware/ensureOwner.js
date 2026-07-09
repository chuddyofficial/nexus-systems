const config = require('../../config');

function isOwner(userId) {
  return !!userId && config.ownerIds.includes(String(userId));
}

function ensureOwner(req, res, next) {
  if (!isOwner(req.user?.id)) {
    return res.status(403).render('error', { message: 'Website admin access only.' });
  }
  next();
}

function ensureOwnerApi(req, res, next) {
  if (!isOwner(req.user?.id)) {
    return res.status(403).json({ error: 'Website admin access only.' });
  }
  next();
}

module.exports = { isOwner, ensureOwner, ensureOwnerApi };
