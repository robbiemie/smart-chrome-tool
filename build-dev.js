#!/usr/bin/env node

/**
 * Dev/beta build script — fully isolated from the production build.js.
 *
 * Why this exists:
 *   - Production builds (build.js) must never be touched by dev-only changes.
 *   - Dev builds need a higher version number so Chrome treats them as an
 *     upgrade over the installed production copy (same version = no update).
 *   - Dev builds need a visible "Beta" label so they can coexist visually
 *     with the production install.
 *
 * What this does:
 *   1. Reads manifest.json, bumps the patch version (0.0.42 -> 0.0.43).
 *   2. Rewrites the name to "MockKit Beta v<version>" in memory and writes
 *      it back to manifest.json TEMPORARILY.
 *   3. Runs the iframe Vite build + zips the runtime.
 *   4. RESTORES the original manifest.json in a finally block — the source
 *      tree is never left in a beta state, even if the build crashes.
 *
 * Usage:
 *   node build-dev.js            -> bump patch, build, zip (beta-named)
 *
 * Output: smart-chrome-tool-beta-v<version>.zip
 * Install: drag the zip into chrome://extensions (developer mode ON).
 * The source manifest.json stays on the production name/version.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const iframePageRoot = path.resolve(projectRoot, 'html/iframePage');
const manifestJsonPath = path.resolve(projectRoot, 'manifest.json');

// Must mirror build.js RUNTIME_ENTRIES so the dev zip is runtime-complete.
const RUNTIME_ENTRIES = [
  'manifest.json',
  'service_worker.js',
  'content.js',
  'pageScripts',
  'icons',
  'html/iframePage/mock.js',
  'html/iframePage/dist',
];

const EXCLUDE_PATTERNS = [
  '*.DS_Store',
  '*/.DS_Store',
  'html/iframePage/dist/CHANGELOG.md',
];

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJsonFile = (filePath, content) => {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

const incrementPatchVersion = (version) => {
  const parts = String(version || '').split('.').map((n) => Number(n) || 0);
  if (parts.length < 1) return '0.0.1';
  parts[parts.length - 1] += 1;
  return parts.join('.');
};

const cleanupStaleZips = () => {
  const entries = fs.readdirSync(projectRoot);
  // Sweep BOTH production and beta zips so the folder stays clean and there
  // is never any ambiguity about which archive is the latest dev build.
  const zipPattern = /^smart-chrome-tool-(?:beta-)?v\d+\.\d+\.\d+\.zip$/;
  let removed = 0;
  entries.forEach((entry) => {
    if (zipPattern.test(entry)) {
      try {
        fs.unlinkSync(path.resolve(projectRoot, entry));
        removed += 1;
      } catch (error) {
        console.warn(`Could not remove stale zip ${entry}: ${error.message}`);
      }
    }
  });
  if (removed > 0) {
    console.log(`Cleaned up ${removed} stale zip package(s).`);
  }
};

const packageWithZip = (zipName) => {
  const args = ['-r', '-X', zipName, ...RUNTIME_ENTRIES];
  if (EXCLUDE_PATTERNS.length > 0) {
    args.push('-x', ...EXCLUDE_PATTERNS);
  }
  const result = spawnSync('zip', args, { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`zip command exited with code ${result.status}`);
  }
};

const packageWithPowerShell = (zipName) => {
  const paths = RUNTIME_ENTRIES.join(',');
  const script = `Compress-Archive -Path ${paths} -DestinationPath ${zipName} -Force`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`PowerShell Compress-Archive exited with code ${result.status}`);
  }
};

// Snapshot the exact source bytes so restoration is byte-identical regardless
// of how the build mutated the JSON object (key ordering, trailing newline).
const originalManifestBytes = fs.readFileSync(manifestJsonPath, 'utf8');

try {
  const manifest = readJsonFile(manifestJsonPath);
  const baseVersion = manifest.version;
  const devVersion = incrementPatchVersion(baseVersion);

  // Rewrite name + version for the dev build only. This is what makes the
  // dev package visually distinct in chrome://extensions, the toolbar badge,
  // and the DevTools panel tab.
  manifest.version = devVersion;
  manifest.name = `smart-chrome-toolkit Beta v${devVersion}`;
  writeJsonFile(manifestJsonPath, manifest);

  console.log(`\n--- Dev build: v${baseVersion} -> Beta v${devVersion} ---\n`);

  cleanupStaleZips();

  // Vite build (iframe workbench). spawnSync so the finally block runs after
  // completion — an async spawn would let process exit skip restoration.
  console.log('Building iframe workbench...');
  const buildResult = spawnSync('npm', ['run', 'build'], {
    cwd: iframePageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (buildResult.status !== 0) {
    throw new Error(`iframe build failed with exit code ${buildResult.status}`);
  }

  // Verify every runtime entry exists before archiving.
  RUNTIME_ENTRIES.forEach((entry) => {
    if (!fs.existsSync(path.resolve(projectRoot, entry))) {
      throw new Error(`Missing required runtime file: ${entry}`);
    }
  });

  const zipName = `smart-chrome-tool-beta-v${devVersion}.zip`;
  const zipPath = path.resolve(projectRoot, zipName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log('\nPackaging...');
  if (process.platform === 'win32') {
    packageWithPowerShell(zipName);
  } else {
    packageWithZip(zipName);
  }

  const stats = fs.statSync(zipPath);
  console.log(`\nPackaged: ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`Location: ${zipPath}`);
  console.log('\n--- Install ---');
  console.log('1. Open chrome://extensions');
  console.log('2. Enable Developer mode (top-right)');
  console.log('3. Drag the zip above into the window');
  console.log('4. The extension shows as "smart-chrome-toolkit Beta v' + devVersion + '"');
  console.log('\nSource manifest.json has been restored to production state.');
} catch (error) {
  console.error(`\nDev build failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  // CRITICAL: always restore the source manifest, even on failure. The dev
  // build must never leave the working tree in a beta state — that would
  // leak into production builds run via build.js afterwards.
  fs.writeFileSync(manifestJsonPath, originalManifestBytes, 'utf8');
}
