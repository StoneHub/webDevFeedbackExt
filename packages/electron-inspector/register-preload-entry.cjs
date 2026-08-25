'use strict';

const { ipcRenderer } = require('electron');
const { installElectronInspectorPreload } = require('./preload.cjs');

installElectronInspectorPreload({ ipcRenderer });
