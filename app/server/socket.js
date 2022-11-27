/* eslint-disable complexity */
/* eslint no-unused-expressions: ["error", { "allowShortCircuit": true, "allowTernary": true }],
   no-console: ["error", { allow: ["warn", "error"] }] */
/* jshint esversion: 6, asi: true, node: true */
// socket.js

// private
const debug = require('debug');
const SSH = require('ssh2').Client;
const CIDRMatcher = require('cidr-matcher');
const validator = require('validator');
const dnsPromises = require('dns').promises;
const util = require('util');
const { webssh2debugreq, webssh2debug, auditLog, logError } = require('./logging');

/**
 * parse conn errors
 * @param {object} socket Socket object
 * @param {object} err    Error object
 */
function connError(socket, err) {
  let msg = util.inspect(err);
  const { session } = socket.request;
  if (err?.level === 'client-authentication') {
    msg = `Authentication failure user=${session.username} from=${socket.handshake.address}`;
    socket.emit('allowreauth', session.ssh.allowreauth);
    socket.emit('reauth');
  }
  if (err?.code === 'ENOTFOUND') {
    msg = `Host not found: ${err.hostname}`;
  }
  if (err?.level === 'client-timeout') {
    msg = `Connection Timeout: ${session.ssh.host}`;
  }
  logError(socket, 'CONN ERROR', msg);
}

/**
 * check ssh host is in allowed subnet
 * @param {object} socket Socket information
 */
async function checkSubnet(socket) {
  let ipaddress = socket.request.session.ssh.host;
  if (!validator.isIP(`${ipaddress}`)) {
    try {
      const result = await dnsPromises.lookup(socket.request.session.ssh.host);
      ipaddress = result.address;
    } catch (err) {
      logError(
        socket,
        'CHECK SUBNET',
        `${err.code}: ${err.hostname} user=${socket.request.session.username} from=${socket.handshake.address}`
      );
      socket.emit('ssherror', '404 HOST IP NOT FOUND');
      socket.disconnect(true);
      return;
    }
  }

  const matcher = new CIDRMatcher(socket.request.session.ssh.allowedSubnets);
  if (!matcher.contains(ipaddress)) {
    logError(
      socket,
      'CHECK SUBNET',
      `Requested host ${ipaddress} outside configured subnets / REJECTED user=${socket.request.session.username} from=${socket.handshake.address}`
    );
    socket.emit('ssherror', '401 UNAUTHORIZED');
    socket.disconnect(true);
  }
}

// public
module.exports = function appSocket(socket) {
  let login = false;

  webssh2debugreq(socket, 'appSocket');

  socket.once('disconnecting', (reason) => {
    webssh2debug(socket, `SOCKET DISCONNECTING: ${reason}`);
    if (login === true) {
      auditLog(
        socket,
        `LOGOUT user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
      );
      login = false;
    }
  });

  async function setupConnection() {
    // if websocket connection arrives without an express session, kill it
    if (!socket.request.session) {
      socket.emit('401 UNAUTHORIZED');
      webssh2debug(socket, 'SOCKET: No Express Session / REJECTED');
      socket.disconnect(true);
      return;
    }

    // If configured, check that requsted host is in a permitted subnet
    if (socket.request.session?.ssh?.allowedSubnets?.length > 0) {
      checkSubnet(socket);
    }

    const conn = new SSH();

    conn.on('banner', (data) => {
      webssh2debug(socket, 'on banner');
      // need to convert to cr/lf for proper formatting
      socket.emit('data', data.replace(/\r?\n/g, '\r\n').toString('utf-8'));
    });

    conn.on('handshake', (() => {
      webssh2debug(socket, 'on handshake');
      socket.emit('setTerminalOpts', socket.request.session.ssh.terminal);
    }));

    conn.on('ready', () => {
      webssh2debug(
        socket,
        `CONN READY: LOGIN: user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host} port=${socket.request.session.ssh.port} allowreplay=${socket.request.session.ssh.allowreplay} term=${socket.request.session.ssh.term}`
      );
      auditLog(
        socket,
        `LOGIN user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
      );
      login = true;
      setTimeout( () => {
      let { term, cols, rows, height, width } = socket.request.session.ssh;
      let update = false;
      if (!cols) {
        update = true;
      }
      webssh2debug(socket, `CONNECT GEOMETRY: termCols = ${cols}, termRows = ${rows}, height = ${height}, width = ${width}`);
      conn.shell({ term, cols, rows, height, width }, (err, stream) => {
        if (update) {
          ({ term, cols, rows, height, width } = socket.request.session.ssh);
          stream.setWindow(rows, cols, height, width);
          webssh2debug(socket, `POST CONNECT GEOMETRY: termCols = ${cols}, termRows = ${rows}, height = ${height}, width = ${width}`);
        }
        if (err) {
          logError(socket, `EXEC ERROR`, err);
          conn.end();
          socket.disconnect(true);
          return;
        }
        socket.once('disconnect', (reason) => {
          webssh2debug(socket, `CLIENT SOCKET DISCONNECT: ${util.inspect(reason)}`);
          conn.end();
          socket.request.session.destroy();
        });
        socket.on('error', (errMsg) => {
          webssh2debug(socket, `SOCKET ERROR: ${errMsg}`);
          logError(socket, 'SOCKET ERROR', errMsg);
          conn.end();
          socket.disconnect(true);
        });
        socket.on('resize', (data) => {
          stream.setWindow(data.rows, data.cols, data.height, data.width);
          webssh2debug(socket, `SOCKET RESIZE: ${JSON.stringify([data.rows, data.cols, data.height, data.width])}`);
        });
        socket.on('geometry', (cols_, rows_, height_, width_) => {
          webssh2debug(socket, `SOCKET POST CONNECT GEOMETRY: termCols = ${cols_}, termRows = ${rows_}, height = ${height_}, width = ${width_}`);
          stream.setWindow(rows_, cols_, height_, width_);
          webssh2debug(socket, `SOCKET GEOMETRY RESIZE: ${JSON.stringify([rows_, cols_, height_, width_])}`);
        });
        socket.on('data', (data) => {
          stream.write(data);
        });
        stream.on('data', (data) => {
          socket.emit('data', data.toString('utf-8'));
        });
        stream.on('close', (code, signal) => {
          webssh2debug(socket, `STREAM CLOSE: ${util.inspect([code, signal])}`);
          if (socket.request.session?.username && login === true) {
            auditLog(
              socket,
              `LOGOUT user=${socket.request.session.username} from=${socket.handshake.address} host=${socket.request.session.ssh.host}:${socket.request.session.ssh.port}`
            );
            login = false;
          }
          if (code !== 0 && typeof code !== 'undefined')
            logError(socket, 'STREAM CLOSE', util.inspect({ message: [code, signal] }));
          socket.disconnect(true);
          conn.end();
        });
        stream.stderr.on('data', (data) => {
          console.error(`STDERR: ${data}`);
        });
      }); }, 1000);
    });

    conn.on('end', (err) => {
      if (err) logError(socket, 'CONN END BY HOST', err);
      webssh2debug(socket, 'CONN END BY HOST');
      socket.disconnect(true);
    });
    conn.on('close', (err) => {
      if (err) logError(socket, 'CONN CLOSE', err);
      webssh2debug(socket, 'CONN CLOSE');
      socket.disconnect(true);
    });
    conn.on('error', (err) => connError(socket, err));

    conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, _prompts, finish) => {
      webssh2debug(socket, 'CONN keyboard-interactive');
      finish([socket.request.session.userpassword]);
    });
    if (
      socket.request.session.username &&
      (socket.request.session.userpassword || socket.request.session.privatekey) &&
      socket.request.session.ssh
    ) {
      webssh2debug(
        socket,
        `CONN CONNECT: ${socket.request.session} ${socket.request.session.username}
        )}`
      );
      // console.log('hostkeys: ' + hostkeys[0].[0])
      //
      const { ssh } = socket.request.session;
      ssh.username = socket.request.session.username;
      ssh.password = socket.request.session.userpassword;
      ssh.tryKeyboard = true;
      ssh.debug = debug('ssh2');
      conn.connect(ssh);
    } else {
      webssh2debug(
        socket,
        `CONN CONNECT: Attempt to connect without session.username/password or session varialbles defined, potentially previously abandoned client session. disconnecting websocket client.\r\nHandshake information: \r\n  ${util.inspect(
          socket.handshake
        )}`
      );
      if (!socket.request.session.username) {
        webssh2debug(socket, `username missing`);
      }
      if (!socket.request.session.userpassword) {
        webssh2debug(socket, `userpassword missing`);
      }
      if (!socket.request.session.privatekey) {
        webssh2debug(socket, `privatekey missing`);
      }
      if (!socket.request.session.ssh) {
        webssh2debug(socket, `ssh missing}`);
      }
      socket.emit('ssherror', 'WEBSOCKET ERROR - Refresh the browser and try again');
      socket.request.session.destroy();
      socket.disconnect(true);
    }
  }
  setupConnection();
};
