/* eslint-disable import/no-extraneous-dependencies */
import { io } from 'socket.io-client';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ImageAddon } from 'xterm-addon-image';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { CanvasAddon } from 'xterm-addon-canvas';
import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faBars, faClipboard, faDownload, faKey, faCog } from '@fortawesome/free-solid-svg-icons';

library.add(faBars, faClipboard, faDownload, faKey, faCog);
dom.watch();

const debug = require('debug')('WebSSH2');
require('xterm/css/xterm.css');
require('../css/style.css');

/* global Blob, logBtn, credentialsBtn, reauthBtn, downloadLogBtn */ // eslint-disable-line
const term = new Terminal({ allowProposedApi: true });
// DOM properties
const fitAddon = new FitAddon();
const terminalContainer = document.getElementById('terminal-container');
term.loadAddon(fitAddon);
//
// const opts = {
//   enableSizeReports: false,
//   pixelLimit: 16777216, // limit to 4096 * 4096 pixels
//   sixelSupport: true,
//   sixelScrolling: true,
//   sixelPaletteLimit: 256,
//   sixelSizeLimit: 25000000,
//   storageLimit: 128,
//   showPlaceholder: true
// };

const imageAddon = new ImageAddon('/static/xterm-addon-image-worker.js');//,opts);
term.loadAddon(imageAddon);
term.loadAddon(new WebLinksAddon());
term.open(terminalContainer);

try {
  const webglAddon = new WebglAddon();
  webglAddon.onContextLoss(() => {
    webglAddon.dispose();
  });
  term.loadAddon(webglAddon);
} catch (error) {
  term.loadAddon(new CanvasAddon());
}
term.focus();
fitAddon.fit();

const socket = io({
  path: '/ssh/socket.io',
  // transports:  ['websocket']
});

function resizeScreen() {
  fitAddon.fit();
  const width = terminalContainer.clientWidth;
  const height = terminalContainer.clientHeight;
  socket.emit('resize', { cols: term.cols, rows: term.rows, height, width });
  debug(`resize: ${JSON.stringify({ cols: term.cols, rows: term.rows, height, width })}`);
}

window.addEventListener('resize', resizeScreen, false);

function closeSession() {
  debug('window close requested, sending Ctrl-C');
  socket.emit('data', '\u0003');
  socket.disconnect();
}

window.addEventListener('beforeunload', closeSession);
window.addEventListener('unload', closeSession);

term.onData((data) => {
  socket.emit('data', data);
});

socket.on('data', (data: string | Uint8Array) => {
  term.write(data);
});

socket.on('connect', () => {
  const width = terminalContainer.clientWidth;
  const height = terminalContainer.clientHeight;
  socket.emit('geometry', term.cols, term.rows, height, width);
  debug(`geometry: ${term.cols}, ${term.rows}, ${height}, ${width}`);
});

socket.on(
  'setTerminalOpts',
  (data: {
    cursorBlink: boolean;
    scrollback: number;
    tabStopWidth: number;
    bellStyle: 'none' | 'sound';
    fontSize: number;
    fontFamily: string;
    letterSpacing: number;
    lineHeight: number;
  }) => {
    term.options = data;
  }
);
