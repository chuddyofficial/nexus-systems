const express = require('express');
const passport = require('../passport');

const router = express.Router();

router.get('/discord', passport.authenticate('discord'));

router.get(
  '/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/servers')
);

router.post('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

module.exports = router;
