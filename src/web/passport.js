const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const config = require('../config');

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackUrl,
      scope: ['identify', 'guilds'],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    }
  )
);

module.exports = passport;
