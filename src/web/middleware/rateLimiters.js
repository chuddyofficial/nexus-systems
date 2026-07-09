const rateLimit = require('express-rate-limit');

// Generous enough for normal dashboard use (polling, page loads across many
// guild pages) while still blocking scripted abuse against a logged-in
// session or credential-stuffing style probing.
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

// The OAuth login/callback flow doesn't need anywhere near this volume —
// keep it tight to blunt brute-force/enumeration attempts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later.' },
});

module.exports = { apiLimiter, authLimiter };
