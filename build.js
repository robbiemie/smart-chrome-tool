#!/usr/bin/env node

/**
 * Build script for smart-chrome-tool.
 *
 * Default:  node build.js            -> build iframe app, then zip the runtime (no version change)
 * Bump:     node build.js --bump     -> bump manifest version, sync package.json, build, then zip
 * Publish:  node build.js --publish  -> bump + build + zip + create a GitHub Release with the zip attached
 *   --force                          -> with --publish, delete an existing tag/release and recreate
 *   --notes "<text>"                 -> override auto-generated release notes
 *
 * Version model:
 *   - manifest.json is the single source of truth for the extension version.
 *   - package.json / package-lock.json versions are mirrors, synced from manifest
 *     before every build so npm's lifecycle banners and the zip name agree.
 *   - Bumping is explicit (--bump / --publish); plain builds never mutate the version.
 *
 * Publish prerequisites:
 *   - GitHub CLI installed (brew install gh) and authenticated (gh auth login)
 *   - Current HEAD should be the commit you want tagged; commit the version bump before publishing
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const iframePageRoot = path.resolve(projectRoot, 'html/iframePage');
const manifestJsonPath = path.resolve(projectRoot, 'manifest.json');
const packageJsonPath = path.resolve(iframePageRoot, 'package.json');
const packageLockPath = path.resolve(iframePageRoot, 'package-lock.json');
const buildMetaPath = path.resolve(iframePageRoot, '.build-meta.json');

// Files and directories required by the extension at runtime.
// Anything not listed here (source, configs, node_modules, docs) is excluded from the archive.
const RUNTIME_ENTRIES = [
  'manifest.json',
  'service_worker.js',
  'content.js',
  'pageScripts',
  'icons',
  'html/iframePage/mock.js',
  'html/iframePage/dist',
];

// Patterns stripped from the archive (metadata/build by-products).
const EXCLUDE_PATTERNS = [
  '*.DS_Store',
  '*/.DS_Store',
  'html/iframePage/dist/CHANGELOG.md',
];

const argv = process.argv.slice(2);
const shouldPublish = argv.includes('--publish') || argv.includes('--release');
// Version bumping is explicit: --bump or --publish. Plain builds keep the current version.
const shouldBump = shouldPublish || argv.includes('--bump');
const forcePublish = argv.includes('--force');
const notesIndex = argv.indexOf('--notes');
const customNotes = notesIndex !== -1 ? argv[notesIndex + 1] : null;

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJsonFile = (filePath, content) => {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

const incrementPatchVersion = (version) => {
  const versionParts = version.split('.');

  if (versionParts.length !== 3) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const [major, minor, patch] = versionParts.map((part) => Number(part));

  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return `${major}.${minor}.${patch + 1}`;
};

// Mirror manifest.json's version into package.json + package-lock.json so npm's
// lifecycle banners (which read package.json before any script runs) report the
// same version as the zip (which reads manifest.json). This is what previously
// made a single build appear to emit two different version numbers.
const syncPackageVersionFromManifest = (manifestVersion) => {
  const packageJson = readJsonFile(packageJsonPath);
  if (packageJson.version === manifestVersion) return;

  packageJson.version = manifestVersion;
  writeJsonFile(packageJsonPath, packageJson);

  if (fs.existsSync(packageLockPath)) {
    const packageLockJson = readJsonFile(packageLockPath);
    packageLockJson.version = manifestVersion;
    if (packageLockJson.packages && packageLockJson.packages['']) {
      packageLockJson.packages[''].version = manifestVersion;
    }
    writeJsonFile(packageLockPath, packageLockJson);
  }
};

const bumpVersion = () => {
  const manifestJson = readJsonFile(manifestJsonPath);
  const previousVersion = manifestJson.version;
  const nextVersion = incrementPatchVersion(previousVersion);

  // manifest.json is the authoritative version; package.json/lock are mirrors.
  manifestJson.version = nextVersion;
  writeJsonFile(manifestJsonPath, manifestJson);
  syncPackageVersionFromManifest(nextVersion);

  // Hand off build metadata so the iframe app's postbuild step can append a
  // matching changelog entry.
  writeJsonFile(buildMetaPath, {
    previousVersion,
    nextVersion,
    builtAt: new Date().toISOString(),
  });

  console.log(`Version bumped: v${previousVersion} -> v${nextVersion}`);
};

const runBuild = () => {
  // Resolve the version BEFORE spawning `npm run build`. Bumping here (rather
  // than in npm's prebuild hook) guarantees npm's lifecycle banners and the
  // final zip name reference the same version in a single build run.
  if (shouldBump) {
    bumpVersion();
  } else {
    syncPackageVersionFromManifest(readJsonFile(manifestJsonPath).version);
  }

  const buildProcess = spawn('npm', ['run', 'build'], {
    cwd: iframePageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  buildProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`\nBuild failed with exit code ${code}.`);
      process.exit(code || 1);
      return;
    }

    console.log('\nBuild completed successfully.');
    try {
      const zipName = packageExtension();
      if (shouldPublish) {
        publishToGitHub(zipName);
      }
    } catch (error) {
      console.error('\nPost-build step failed.');
      console.error(error.message);
      process.exit(1);
    }
  });

  buildProcess.on('error', (error) => {
    console.error('\nUnable to start the build process.');
    console.error(error.message);
    process.exit(1);
  });
};

const readManifestVersion = () => {
  const manifestPath = path.resolve(projectRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
};

const packageExtension = () => {
  const version = readManifestVersion();
  const zipName = `smart-chrome-tool-v${version}.zip`;

  // Verify every runtime entry exists before archiving so a broken build
  // never produces a half-populated zip.
  RUNTIME_ENTRIES.forEach((entry) => {
    if (!fs.existsSync(path.resolve(projectRoot, entry))) {
      throw new Error(`Missing required runtime file: ${entry}`);
    }
  });

  const zipPath = path.resolve(projectRoot, zipName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  if (process.platform === 'win32') {
    packageWithPowerShell(zipName);
  } else {
    packageWithZip(zipName);
  }

  const stats = fs.statSync(zipPath);
  console.log(`\nPackaged: ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`Location: ${zipPath}`);
  return zipName;
};

const packageWithZip = (zipName) => {
  const args = ['-r', '-X', zipName, ...RUNTIME_ENTRIES];
  if (EXCLUDE_PATTERNS.length > 0) {
    args.push('-x', ...EXCLUDE_PATTERNS);
  }
  const result = spawnSync('zip', args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`zip command exited with code ${result.status}`);
  }
};

const packageWithPowerShell = (zipName) => {
  // Compress-Archive has no exclude flag; harmless build metadata
  // (e.g. CHANGELOG.md) is accepted on Windows.
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

const runGit = (gitArgs, options = {}) => {
  const result = spawnSync('git', gitArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options,
  });
  return result;
};

const runGh = (ghArgs) => {
  const result = spawnSync('gh', ghArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  return result;
};

const ensureGhAvailable = () => {
  const versionCheck = spawnSync('gh', ['--version'], { stdio: 'pipe', encoding: 'utf8' });
  if (versionCheck.status !== 0) {
    console.error('\nGitHub CLI (gh) is required to publish but was not found.');
    console.error('Install it on macOS with:  brew install gh');
    console.error('Then authenticate with:    gh auth login');
    process.exit(1);
  }

  const authCheck = spawnSync('gh', ['auth', 'status'], { stdio: 'pipe', encoding: 'utf8' });
  if (authCheck.status !== 0 && !process.env.GH_TOKEN) {
    console.error('\nGitHub CLI is not authenticated.');
    console.error('Run: gh auth login');
    console.error('Or export GH_TOKEN with a personal access token (repo scope).');
    process.exit(1);
  }
};

const warnOnDirtyTree = () => {
  const status = runGit(['status', '--porcelain']);
  const lines = status.stdout.split('\n').filter((line) => line.trim() && !line.endsWith('.zip'));
  if (lines.length === 0) return;

  console.log('\nWarning: working tree has uncommitted changes.');
  console.log('The git tag will point to the current HEAD, which may not include these changes:');
  lines.forEach((line) => console.log(`  ${line}`));
  console.log('Consider committing the version bump before publishing.');
};

const tagExistsLocally = (tag) => {
  const result = runGit(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
  return result.status === 0 && result.stdout.trim() !== '';
};

const tagExistsRemote = (tag) => {
  const result = runGit(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
  return result.stdout.trim() !== '';
};

const deleteExistingTag = (tag) => {
  if (tagExistsLocally(tag)) {
    runGit(['tag', '-d', tag], { stdio: 'inherit' });
  }
  if (tagExistsRemote(tag)) {
    const pushResult = runGit(['push', 'origin', `:refs/tags/${tag}`], { stdio: 'inherit' });
    if (pushResult.status !== 0) {
      throw new Error(`Failed to delete remote tag ${tag}.`);
    }
  }
  // Best-effort: remove an existing release with the same tag so we can recreate it.
  spawnSync('gh', ['release', 'delete', tag, '--yes', '--cleanup-tag'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
};

const createAndPushTag = (tag) => {
  const tagResult = runGit(['tag', '-a', tag, '-m', `Release ${tag}`], { stdio: 'inherit' });
  if (tagResult.status !== 0) {
    throw new Error(`Failed to create tag ${tag}.`);
  }

  const pushResult = runGit(['push', 'origin', tag], { stdio: 'inherit' });
  if (pushResult.status !== 0) {
    throw new Error(`Failed to push tag ${tag} to origin.`);
  }
};

const createRelease = (tag, zipName, notes) => {
  const zipPath = path.resolve(projectRoot, zipName);
  const releaseArgs = ['release', 'create', tag, zipPath, '--title', tag];

  if (notes) {
    releaseArgs.push('--notes', notes);
  } else {
    releaseArgs.push('--generate-notes');
  }

  const result = runGh(releaseArgs);
  if (result.status !== 0) {
    throw new Error('gh release create failed.');
  }
};

const publishToGitHub = (zipName) => {
  console.log('\n--- Publishing to GitHub Releases ---');

  ensureGhAvailable();
  warnOnDirtyTree();

  const version = readManifestVersion();
  const tag = `v${version}`;
  const hasLocal = tagExistsLocally(tag);
  const hasRemote = tagExistsRemote(tag);

  if (hasLocal || hasRemote) {
    if (!forcePublish) {
      console.error(`\nTag ${tag} already exists. Use --force to delete and recreate.`);
      process.exit(1);
    }
    console.log(`\n--force: removing existing tag ${tag} ...`);
    deleteExistingTag(tag);
  }

  console.log(`\nCreating and pushing tag ${tag} ...`);
  createAndPushTag(tag);

  console.log(`\nCreating GitHub release ${tag} with ${zipName} ...`);
  createRelease(tag, zipName, customNotes);

  console.log(`\nRelease ${tag} published.`);
  console.log(`  https://github.com/robbiemie/smart-chrome-tool/releases/tag/${tag}`);
};

runBuild();
