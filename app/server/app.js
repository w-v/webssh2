/* jshint esversion: 6, asi: true, node: true */
/* eslint no-unused-expressions: ["error", { "allowShortCircuit": true, "allowTernary": true }],
   no-console: ["error", { allow: ["warn", "error", "info"] }] */
// app.js

// eslint-disable-next-line import/order
const config = require('./config');
const path = require('path');

const nodeRoot = path.dirname(require.main.filename);
const publicPath = path.join(nodeRoot, 'client', 'public');
const express = require('express');
const logger = require('morgan');

const app = express();
const server = require('http').Server(app);
const favicon = require('serve-favicon');
const io = require('socket.io')(server, config.socketio);
const session = require('express-session')(config.express);

const debug = require('debug');
const appSocket = require('./socket');
const { setDefaultCredentials, basicAuth } = require('./util');
const { webssh2debug, webssh2debugreq } = require('./logging');
const { connect, notfound, handleErrors } = require('./routes');

setDefaultCredentials(config.user);

// safe shutdown
let remainingSeconds = config.safeShutdownDuration;
let shutdownMode = false;
let shutdownInterval;
let connectionCount = 0;
// eslint-disable-next-line consistent-return
function safeShutdownGuard(req, res, next) {
  if (!shutdownMode) return next();
  res.status(503).end('Service unavailable: Server shutting down');
}

function session_access(req, res, next){
	debug('WebSSH2')(`accessing session ${req.url}`)
	session(req, res, next);
	debug('WebSSH2')(`got session ${req.sessionID}`)
}
// express
app.use(safeShutdownGuard);
app.use(session_access);
if (config.accesslog) app.use(logger('common'));
app.disable('x-powered-by');
app.use(favicon(path.join(publicPath, 'favicon.ico')));
app.use(express.urlencoded({ extended: true }));
app.use('/ssh', express.static(publicPath, config.express.ssh));
app.use('/static', express.static(publicPath));
// app.use(basicAuth);
app.use(connect);
app.use(notfound);
app.use(handleErrors);

// clean stop
function stopApp(reason) {
  shutdownMode = false;
  if (reason) console.info(`Stopping: ${reason}`);
  clearInterval(shutdownInterval);
  io.close();
  server.close();
}

// bring up socket
io.on('connection', appSocket);

// socket.io
// expose express session with socket.request.session
io.use((socket, next) => {
  webssh2debug(socket, 'expose express session');
  if (socket.request.res){
    webssh2debug(socket, 'session(socket.request, socket.request.res, next);');
    session(socket.request, socket.request.res, next);
  }
  else{
    debug('WebSSH2')('next(next)');
    next(next);
  }
});

function countdownTimer() {
  if (!shutdownMode) clearInterval(shutdownInterval);
  remainingSeconds -= 1;
  if (remainingSeconds <= 0) {
    stopApp('Countdown is over');
  } else io.emit('shutdownCountdownUpdate', remainingSeconds);
}

const signals = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) =>
  process.on(signal, () => {
    if (shutdownMode) stopApp('Safe shutdown aborted, force quitting');
    if (!connectionCount > 0) stopApp('All connections ended');
    shutdownMode = true;
    console.error(
      `\r\n${connectionCount} client(s) are still connected.\r\nStarting a ${remainingSeconds} seconds countdown.\r\nPress Ctrl+C again to force quit`
    );
    if (!shutdownInterval) shutdownInterval = setInterval(countdownTimer, 1000);
  })
);

module.exports = { server, config };

const onConnection = (socket) => {
  webssh2debug(socket, 'onConnection');
  connectionCount += 1;
  socket.on('disconnect', () => {
    webssh2debug(socket, 'on disconnect');
    connectionCount -= 1;
    if (connectionCount <= 0 && shutdownMode) {
      stopApp('All clients disconnected');
    }
  });
  socket.on('geometry', (cols, rows, height, width) => {
    webssh2debug(socket, 'on geometry');
    // TODO need to rework how we pass settings to ssh2, this is less than ideal
    const s = socket;
    s.request.session.ssh.cols = cols;
    s.request.session.ssh.rows = rows;
    s.request.session.ssh.height = height;
    s.request.session.ssh.width = width;
    webssh2debug(socket, `SOCKET GEOMETRY: termCols = ${cols}, termRows = ${rows}, height = ${height}, width = ${width}`);
  });
};

io.on('connection', onConnection);
