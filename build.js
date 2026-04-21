#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const iframePageRoot = path.resolve(__dirname, 'html/iframePage');

const runBuild = () => {
  const buildProcess = spawn('npm', ['run', 'build'], {
    cwd: iframePageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  buildProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('\nBuild completed successfully.');
      return;
    }

    console.error(`\nBuild failed with exit code ${code}.`);
    process.exit(code || 1);
  });

  buildProcess.on('error', (error) => {
    console.error('\nUnable to start the build process.');
    console.error(error.message);
    process.exit(1);
  });
};

runBuild();
