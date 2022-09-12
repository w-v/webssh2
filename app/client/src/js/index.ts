/* eslint-disable import/no-extraneous-dependencies */
import { io } from 'socket.io-client';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { ImageAddon } from 'xterm-addon-image';
import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faBars, faClipboard, faDownload, faKey, faCog } from '@fortawesome/free-solid-svg-icons';

library.add(faBars, faClipboard, faDownload, faKey, faCog);
dom.watch();

const debug = require('debug')('WebSSH2');
require('xterm/css/xterm.css');
require('../css/style.css');

/* global Blob, logBtn, credentialsBtn, reauthBtn, downloadLogBtn */ // eslint-disable-line
const term = new Terminal();
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
term.open(terminalContainer);
term.focus();
fitAddon.fit();

const socket = io({
  path: '/ssh/socket.io',
});

function resizeScreen() {
  fitAddon.fit();
  const width = terminalContainer.clientWidth;
  const height = terminalContainer.clientHeight;
  socket.emit('resize', { cols: term.cols, rows: term.rows, height, width });
  debug(`resize: ${JSON.stringify({ cols: term.cols, rows: term.rows, height, width })}`);
}

window.addEventListener('resize', resizeScreen, false);

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

term.onTitleChange((title) => {
  document.title = title;
});
