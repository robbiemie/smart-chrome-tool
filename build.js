#!/usr/bin/env node

/**
 * Build script for smart-chrome-tool.
 *
 * Default:  node build.js            -> build BOTH variants (GitHub + Store), then zip each (no version change)
 *                                      GitHub variant keeps the self-update UI; Store variant strips it.
 *                                      Zips: smart-chrome-tool-github-vX.zip + smart-chrome-tool-store-vX.zip
 *           node build.js --no-store   -> build GitHub variant only (skip the Store variant)
 *           node build.js --store-only -> build Store variant only (Web Store submission, no release)
 * Bump:     node build.js --bump     -> bump manifest version, sync package.json, build both, zip each
 * Publish:  node build.js --publish  -> bump + build + zip + create a GitHub Release with the zip attached
 *   --force                          -> with --publish, delete an existing tag/release and recreate
 *   --notes "<text>"                 -> override auto-generated release notes
 *   --commit                         -> after publishing, git add + commit the version bump & dist, then push to origin
 *           Combined: node build.js --publish --commit  -> bump, build, zip, release, commit, push (one-shot)
 * Retry:    node build.js --retry    -> re-publish the CURRENT version (no bump). Implies --force + --commit.
 *                                      Use when a previous --publish failed midway (stale tag, network error, etc).
 * CI:       node build.js --ci --tag v0.0.x -> build + zip + attach to an ALREADY-PUSHED tag.
 *                                      No bump, no commit, no tag creation. Used by GitHub Actions
 *                                      on tag push events. Reads GITHUB_TOKEN from env.
 * Cut:      node build.js --cut    -> bump + commit + tag + push, then exit. No build, no release.
 *                                      The pushed tag triggers the CI workflow which builds &
 *                                      publishes. One-shot local release command.
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
const isCi = argv.includes('--ci');
const isCut = argv.includes('--cut');
// --cut is the local one-shot release command and is mutually exclusive with
// the other publish flows (they all build/release locally or assume a tag exists).
if (isCut && (isCi || argv.includes('--publish') || argv.includes('--release') || argv.includes('--retry'))) {
  console.error('--cut cannot be combined with --ci/--publish/--release/--retry.');
  process.exit(1);
}
const tagIndex = argv.indexOf('--tag');
const ciTag = isCi && tagIndex !== -1 ? argv[tagIndex + 1] : null;
if (isCi && !ciTag) {
  console.error('--ci requires --tag <vX.Y.Z>');
  process.exit(1);
}
// JSON helpers. Defined before any top-level code that reads a JSON file —
// the --ci validation block below runs eagerly at module load and would
// otherwise hit a temporal dead zone (ReferenceError: Cannot access
// 'readJsonFile' before initialization).
const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJsonFile = (filePath, content) => {
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

// CI mode validates that manifest.version matches the pushed tag, so the
// release asset and the extension's self-reported version always agree.
if (isCi) {
  const manifestVersion = readJsonFile(manifestJsonPath).version;
  const tagVersion = ciTag.replace(/^v/, '');
  if (manifestVersion !== tagVersion) {
    console.error(`Version mismatch: manifest.json is v${manifestVersion} but tag is ${ciTag}`);
    process.exit(1);
  }
}
const shouldRetry = argv.includes('--retry');
// Retry: re-publish the current version without bumping. Used when a previous
// --publish failed (e.g. gh auth glitch, network timeout). Implies --publish
// behavior (tag + release), --force (delete stale tag/release), and --commit.
const shouldPublish = shouldRetry || isCi || argv.includes('--publish') || argv.includes('--release');
// Version bumping is explicit: --bump or --publish. Plain builds keep the current version.
// Retry and CI do NOT bump — they reuse the current manifest version.
const shouldBump = !shouldRetry && !isCi && shouldPublish;
const forcePublish = argv.includes('--force') || shouldRetry;
// CI never commits back — the tag is already pushed and the workflow runs on a
// detached HEAD at that tag.
const shouldCommit = !isCi && (argv.includes('--commit') || shouldRetry);
// Beta builds rename the extension to "smart-chrome-toolkit Beta vX" and emit a
// "-beta-" zip so they are visually distinct from production packages in
// chrome://extensions and the Downloads folder. Forbidden with --publish
// because a release must never ship under the beta name.
const isBetaBuild = argv.includes('--beta');
if (isBetaBuild && shouldPublish) {
  console.error('--beta cannot be combined with --publish/--retry (a release must use the production name).');
  process.exit(1);
}
if (isBetaBuild && isCi) {
  console.error('--beta cannot be combined with --ci (releases must use the production name).');
  process.exit(1);
}
// Store-only build: produces a single Web Store submission zip with the
// self-update entry stripped (MOCKKIT_STORE_BUILD=1). Mutually exclusive with
// release flows — a store build must never be attached to a GitHub Release.
const storeOnly = argv.includes('--store-only');
if (storeOnly && (shouldPublish || isCi)) {
  console.error('--store-only cannot be combined with --publish/--retry/--ci.');
  process.exit(1);
}
// Skip the store variant in a plain local build (e.g. when iterating on the
// GitHub-distributed build). No-op in release flows, which already skip it.
const noStore = argv.includes('--no-store');
const notesIndex = argv.indexOf('--notes');
const customNotes = notesIndex !== -1 ? argv[notesIndex + 1] : null;

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
  // Keep the extension name stable (no version infix). Chrome Web Store policy
  // forbids version numbers in the name; chrome://extensions already shows the
  // version separately, so a stable name is correct for both local and store.
  manifestJson.name = 'smart-chrome-toolkit';
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

// Promise-wrapped vite build. When isStoreVariant is true, MOCKKIT_STORE_BUILD=1
// is injected so vite.config.js strips the self-update entry from the bundle.
// Each invocation overwrites html/iframePage/dist, so packaging must happen
// between builds (build → zip → build → zip), not build → build → zip → zip.
const runViteBuild = (isStoreVariant) => {
  const env = { ...process.env };
  if (isStoreVariant) {
    env.MOCKKIT_STORE_BUILD = '1';
    console.log('\n--- Building Store variant (self-update hidden) ---');
  } else {
    delete env.MOCKKIT_STORE_BUILD;
    console.log('\n--- Building GitHub variant (self-update visible) ---');
  }
  return new Promise((resolve, reject) => {
    const buildProcess = spawn('npm', ['run', 'build'], {
      cwd: iframePageRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env,
    });
    buildProcess.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Build failed with exit code ${code}.`));
      } else {
        resolve();
      }
    });
    buildProcess.on('error', reject);
  });
};

const runBuild = async () => {
  // --cut: local one-shot release. Bump + commit + tag + push, then exit. The
  // pushed tag triggers release.yml to build & publish. No local build here.
  if (isCut) {
    cutRelease();
    return;
  }

  // Sweep leftover zips from previous builds in ALL local flows so a stale
  // archive from an older version is never mistaken for the current release.
  // --cut returns early above and never produces a zip, so it is excluded.
  cleanupStaleZips();

  // Retry mode: don't bump, just rebuild + re-publish the current version.
  if (shouldRetry) {
    console.log('\n--- Retry mode: re-publishing the current version ---');
    syncPackageVersionFromManifest(readJsonFile(manifestJsonPath).version);
  } else if (shouldBump) {
    bumpVersion();
  } else {
    syncPackageVersionFromManifest(readJsonFile(manifestJsonPath).version);
  }

  // Beta builds rewrite the extension display name to "smart-chrome-toolkit Beta vX" so
  // it shows up distinctly in chrome://extensions. We swap the name in
  // manifest.json before the build (so the zip embeds it) and restore the
  // original after packaging so the working tree stays on the production name.
  let originalManifestName = null;
  if (isBetaBuild) {
    const manifestJson = readJsonFile(manifestJsonPath);
    originalManifestName = manifestJson.name;
    manifestJson.name = `smart-chrome-toolkit Beta v${manifestJson.version}`;
    writeJsonFile(manifestJsonPath, manifestJson);
    console.log(`Beta build: extension name set to "${manifestJson.name}"`);
  }

  // Decide which variants to produce:
  // - Release flows (--publish/--retry/--ci): GitHub variant only (attached to Release)
  // - --store-only: Store variant only (Web Store submission)
  // - --no-store: GitHub variant only (skip the store variant in a plain build)
  // - Default plain build: BOTH variants — GitHub first, then Store
  const isReleaseFlow = shouldPublish || isCi;
  const buildGitHub = !storeOnly;
  const buildStore = storeOnly || (!noStore && !isReleaseFlow);

  let githubZip = null;
  let storeZip = null;

  try {
    // GitHub variant: self-update UI visible. Built first because release
    // flows only need this one and we want to fail fast on the common path.
    if (buildGitHub) {
      await runViteBuild(false);
      console.log('\nBuild completed successfully.');
      githubZip = packageExtension(false);
      if (originalManifestName) {
        const mj = readJsonFile(manifestJsonPath);
        mj.name = originalManifestName;
        writeJsonFile(manifestJsonPath, mj);
        console.log('Restored production extension name in manifest.json.');
      }
    }

    // Store variant: self-update UI stripped. Built second so it overwrites
    // dist with the store-flavored bundle. Skipped entirely in release flows.
    if (buildStore) {
      await runViteBuild(true);
      console.log('\nStore build completed successfully.');
      storeZip = packageExtension(true);
      if (originalManifestName && !githubZip) {
        const mj = readJsonFile(manifestJsonPath);
        mj.name = originalManifestName;
        writeJsonFile(manifestJsonPath, mj);
        console.log('Restored production extension name in manifest.json.');
      }
    }

    if (shouldPublish) {
      publishToGitHub(githubZip);
    }
    if (shouldCommit) {
      commitAndPush();
    }
  } catch (error) {
    console.error('\n' + error.message);
    // Restore the manifest name even on failure so a crashed beta build
    // never leaves the working tree with the beta name persisted.
    if (originalManifestName) {
      const mj = readJsonFile(manifestJsonPath);
      mj.name = originalManifestName;
      writeJsonFile(manifestJsonPath, mj);
    }
    process.exit(1);
  }
};

const readManifestVersion = () => {
  const manifestPath = path.resolve(projectRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
};

// Sweep leftover smart-chrome-tool(-beta|-store|-github)?-v*.zip from the
// project root so each local build starts clean. Matches all three variant
// namings so switching between them never leaves stale archives. Other
// archives are left untouched. Called at the start of non-publish runs.
const cleanupStaleZips = () => {
  const entries = fs.readdirSync(projectRoot);
  const zipPattern = /^smart-chrome-tool-(?:beta-|store-|github-)?v\d+\.\d+\.\d+\.zip$/;
  let removed = 0;
  entries.forEach((entry) => {
    if (zipPattern.test(entry)) {
      try {
        fs.unlinkSync(path.resolve(projectRoot, entry));
        removed += 1;
      } catch (error) {
        // Best-effort: a locked/permission-denied zip should never abort the
        // build. Log and move on.
        console.warn(`Could not remove stale zip ${entry}: ${error.message}`);
      }
    }
  });
  if (removed > 0) {
    console.log(`Cleaned up ${removed} stale zip package(s) from previous build(s).`);
  }
};

const packageExtension = (isStoreVariant = false) => {
  const version = readManifestVersion();
  // Beta packages carry a "-beta-" infix; store packages carry a "-store-"
  // infix; GitHub packages carry a "-github-" infix so all three variants
  // stay distinct in the Downloads folder / Release assets.
  const infix = isBetaBuild ? 'beta-' : isStoreVariant ? 'store-' : 'github-';
  const zipName = `smart-chrome-tool-${infix}v${version}.zip`;

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

  // CI mode authenticates via GITHUB_TOKEN (auto-injected by GitHub Actions).
  // Skip the interactive gh auth status check, which fails in CI otherwise.
  if (isCi) return;

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
  if (!isCi) warnOnDirtyTree();

  const version = readManifestVersion();
  // CI mode: the tag was already pushed by the workflow trigger — use it
  // directly and skip all tag existence/force/delete logic.
  const tag = isCi ? ciTag : `v${version}`;

  if (!isCi) {
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
  } else {
    console.log(`\nCI mode: attaching to existing tag ${tag}`);
  }

  console.log(`\nCreating GitHub release ${tag} with ${zipName} ...`);
  createRelease(tag, zipName, customNotes);

  console.log(`\nRelease ${tag} published.`);
  console.log(`  https://github.com/robbiemie/smart-chrome-tool/releases/tag/${tag}`);
};

// After publishing, commit the version bump + rebuilt dist and push to origin
// so the remote master branch matches the released tag.
const commitAndPush = () => {
  console.log('\n--- Committing version bump & dist, then pushing ---');
  const version = readManifestVersion();

  // Stage all changes (version bump in manifest/package, rebuilt dist, etc).
  // The zip file is gitignored so it won't be included.
  runGit(['add', '-A'], { stdio: 'inherit' });

  // Check if there's anything staged to commit.
  const diffResult = runGit(['diff', '--cached', '--quiet']);
  if (diffResult.status === 0) {
    console.log('Nothing to commit — working tree clean.');
    return;
  }

  const commitMsg = `chore: v${version}`;
  const commitResult = runGit(['commit', '-m', commitMsg], { stdio: 'inherit' });
  if (commitResult.status !== 0) {
    throw new Error('git commit failed.');
  }

  const pushResult = runGit(['push', 'origin', 'HEAD'], { stdio: 'inherit' });
  if (pushResult.status !== 0) {
    throw new Error('git push failed.');
  }

  console.log(`\nCommitted and pushed: ${commitMsg}`);
};

// One-shot local release: bump version, commit, tag, and push. Does NOT build
// or create a GitHub Release — the pushed tag triggers the release.yml workflow
// which handles build + zip + attach to Release. This is the "cut a release"
// command: the only thing the developer runs locally.
//
// Local uncommitted changes are NOT fatal — they get bundled into the same
// release commit as the version bump. This is the whole point of the one-shot
// flow: write code → run `--cut` → bump + commit + tag + push in one go. The
// pre-commit file list is printed so the developer sees exactly what is being
// shipped under the tag.
const cutRelease = () => {
  console.log('\n--- Cutting release (bump + commit + tag + push) ---');

  // Surface any pre-existing working-tree changes so the developer knows they
  // will land in the release commit alongside the version bump. Informational
  // only — never aborts. .zip files are gitignored and skipped here.
  const preStatus = runGit(['status', '--porcelain']);
  const preDirty = preStatus.stdout.split('\n').filter((line) => line.trim() && !line.endsWith('.zip'));
  if (preDirty.length > 0) {
    console.log('\nBundling uncommitted changes into the release commit:');
    preDirty.forEach((line) => console.log(`  ${line}`));
  }

  bumpVersion();

  const version = readManifestVersion();
  const tag = `v${version}`;

  // Stage everything (manifest.json + package.json + package-lock.json + the
  // .build-meta.json the bump step wrote, PLUS any pre-existing working-tree
  // changes listed above — all go into one release commit).
  runGit(['add', '-A'], { stdio: 'inherit' });

  // Sanity: bump should always produce a diff. If not, manifest was unchanged.
  const diffResult = runGit(['diff', '--cached', '--quiet']);
  if (diffResult.status === 0) {
    console.error('\nNothing to commit after bump — manifest version unchanged?');
    process.exit(1);
  }

  // Print the full file list that will ship under the tag, so the developer
  // can eyeball it before the push goes out.
  const staged = runGit(['diff', '--cached', '--name-status']);
  const stagedFiles = staged.stdout.split('\n').filter((line) => line.trim());
  if (stagedFiles.length > 0) {
    console.log('\nFiles in this release commit:');
    stagedFiles.forEach((line) => console.log(`  ${line}`));
  }

  // Refuse to overwrite an existing tag — prevents shadowing a released version.
  if (tagExistsLocally(tag) || tagExistsRemote(tag)) {
    console.error(`\nTag ${tag} already exists. Bump manifest.json to a higher version first.`);
    process.exit(1);
  }

  const commitResult = runGit(['commit', '-m', `chore: ${tag}`], { stdio: 'inherit' });
  if (commitResult.status !== 0) {
    throw new Error('git commit failed.');
  }

  const tagResult = runGit(['tag', '-a', tag, '-m', `Release ${tag}`], { stdio: 'inherit' });
  if (tagResult.status !== 0) {
    throw new Error(`Failed to create tag ${tag}.`);
  }

  // --follow-tags pushes the branch AND any annotated tags reachable from it,
  // so the commit and its tag land on origin in one shot, triggering the
  // release.yml workflow.
  const pushResult = runGit(['push', 'origin', 'HEAD', '--follow-tags'], { stdio: 'inherit' });
  if (pushResult.status !== 0) {
    throw new Error('git push failed.');
  }

  console.log(`\nRelease ${tag} cut. CI will build and publish.`);
  console.log(`  Actions:  https://github.com/robbiemie/smart-chrome-tool/actions`);
  console.log(`  Release:  https://github.com/robbiemie/smart-chrome-tool/releases/tag/${tag}`);
};

runBuild();
