const path = require('node:path');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const { Server: SocketServer } = require('socket.io');

const config = require('../config');
const db = require('../database/db');
const passport = require('./passport');
const bus = require('../bot/utils/eventBus');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiters');

function createServer(client) {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketServer(server);

  app.locals.discordClient = client;
  app.locals.config = config;

  // When deployed behind nginx (production), trust the X-Forwarded-* headers
  // it sets so secure cookies and req.protocol behave correctly over HTTPS.
  if (config.isProduction) app.set('trust proxy', 1);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Security headers. CSP is intentionally left permissive for inline
  // scripts/styles — this app has no build step and relies on small inline
  // <script> blocks (e.g. window.GUILD_ID = ...) throughout the views, so a
  // strict default-src CSP would break the dashboard. The other headers
  // (frame-ancestors, nosniff, HSTS, referrer-policy) still apply.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: config.isProduction,
    })
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Persisted in MySQL (the sessions table is created automatically) rather
  // than the default in-memory store. That in-memory store loses every
  // logged-in session (including live console sockets) on every process
  // restart — deadly for a bot that gets restarted often during deploys.
  const sessionStore = new MySQLStore({ expiration: 1000 * 60 * 60 * 24 * 7, createDatabaseTable: true }, db.pool);
  sessionStore.onReady?.().catch((err) => console.error('[session-store]', err));

  const sessionMiddleware = session({
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: config.isProduction,
      sameSite: 'lax',
    },
  });
  app.use(sessionMiddleware);
  io.engine.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/auth', authLimiter, authRoutes);
  app.use('/api', apiLimiter, apiRoutes);
  app.use('/', dashboardRoutes);

  app.use((req, res) => {
    res.status(404).render('error', { message: 'Page not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[web]', err);
    res.status(500).render('error', { message: 'Something went wrong.' });
  });

  io.on('connection', (socket) => {
    const req = socket.request;
    if (!req.session?.passport?.user) {
      // Emitted before disconnecting so the client can show *why* instead of
      // just going quiet — most commonly an expired/invalidated session.
      socket.emit('auth_error', 'Your session has expired — refresh the page and log in again.');
      socket.disconnect();
      return;
    }

    const onConsole = (payload) => {
      if (socket.data.guildId && payload.guildId && payload.guildId !== socket.data.guildId) return;
      socket.emit('console', payload);
    };
    bus.on('console', onConsole);

    // Site-wide admin broadcasts (payload.guildId === null) go to every
    // connected socket; single-server broadcasts only reach sockets
    // currently subscribed to that server's dashboard.
    const onAnnouncement = (payload) => {
      if (payload.guildId && socket.data.guildId !== payload.guildId) return;
      socket.emit('announcement', payload);
    };
    bus.on('announcement', onAnnouncement);

    socket.on('subscribe', (guildId) => {
      socket.data.guildId = guildId;
      // Immediate proof-of-life so the console never looks silently dead —
      // this event only goes to the subscribing socket, not broadcast.
      socket.emit('console', {
        guildId,
        level: 'system',
        message: 'Connected — live events for this server will appear here as they happen.',
        at: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      bus.off('console', onConsole);
      bus.off('announcement', onAnnouncement);
    });
  });

  return { app, server, io };
}

module.exports = { createServer };
