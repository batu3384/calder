#!/usr/bin/env node

const path = require('path');
const proc = require('child_process');

const electron = require('electron');

const appPath = path.resolve(__dirname, '..');
const child = proc.spawn(electron, [appPath], {
  stdio: 'inherit',
  windowsHide: false,
});

let childClosed = false;
child.on('close', (code, signal) => {
  childClosed = true;
  if (code === null) {
    console.error(electron, 'exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});

const handleTerminationSignal = (signal) => {
  process.on(signal, () => {
    if (!childClosed) {
      child.kill(signal);
    }
  });
};

handleTerminationSignal('SIGINT');
handleTerminationSignal('SIGTERM');
handleTerminationSignal('SIGUSR2');
