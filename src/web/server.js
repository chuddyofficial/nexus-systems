const path = require('node:path');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const { Server: SocketServer } = require('socket.io');

const config = require('../config');
const passport = require('./passport');
const bus = require('../bot/utils/eventBus');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

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

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  const sessionMiddleware = session({
    secret: config.sessionSecret,
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

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
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
      socket.disconnect();
      return;
    }

    const onConsole = (payload) => {
      if (socket.data.guildId && payload.guildId && payload.guildId !== socket.data.guildId) return;
      socket.emit('console', payload);
    };
    bus.on('console', onConsole);

    socket.on('subscribe', (guildId) => {
      socket.data.guildId = guildId;
    });

    socket.on('disconnect', () => {
      bus.off('console', onConsole);
    });
  });

  return { app, server, io };
}

module.exports = { createServer };
