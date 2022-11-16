/* eslint-disable no-console */
// ssh.js
const validator = require('validator');
const path = require('path');

const nodeRoot = path.dirname(require.main.filename);

const publicPath = path.join(nodeRoot, 'client', 'public');
const { parseBool } = require('./util');
const config = require('./config');

exports.connect = function connect(req, res) {
  res.sendFile(path.join(path.join(publicPath, 'client.htm')));

  const { host, port } = config.ssh;
  const { text: header, background: headerBackground } = config.header;
  const { term: sshterm, readyTimeout } = config.ssh;
  const {
    cursorBlink,
    scrollback,
    tabStopWidth,
    bellStyle,
    fontSize,
    fontFamily,
    letterSpacing,
    lineHeight,
  } = config.terminal;

  req.session.ssh = {
    host,
    port,
    localAddress: config.ssh.localAddress,
    localPort: config.ssh.localPort,
    header: {
      name: header,
      background: headerBackground,
    },
    algorithms: config.algorithms,
    keepaliveInterval: config.ssh.keepaliveInterval,
    keepaliveCountMax: config.ssh.keepaliveCountMax,
    allowedSubnets: config.ssh.allowedSubnets,
    term: sshterm,
    terminal: {
      cursorBlink,
      scrollback,
      tabStopWidth,
      bellStyle,
      fontSize,
      fontFamily,
      letterSpacing,
      lineHeight,
    },
    allowreplay:
      config.options.challengeButton ||
      (validator.isBoolean(`${req.headers.allowreplay}`)
        ? parseBool(req.headers.allowreplay)
        : false),
    allowreauth: config.options.allowreauth || false,
    mrhsession:
      validator.isAlphanumeric(`${req.headers.mrhsession}`) && req.headers.mrhsession
        ? req.headers.mrhsession
        : 'none',
    serverlog: {
      client: config.serverlog.client || false,
      server: config.serverlog.server || false,
    },
    readyTimeout,
  };
  if (req.session.ssh.header.name) validator.escape(req.session.ssh.header.name);
  if (req.session.ssh.header.background) validator.escape(req.session.ssh.header.background);
};

exports.notfound = function notfound(_req, res) {
  res.status(404).send("Sorry, can't find that!");
};

exports.handleErrors = function handleErrors(err, _req, res) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
};
