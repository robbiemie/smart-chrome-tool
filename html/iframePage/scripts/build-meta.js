const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..', '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const manifestJsonPath = path.join(repoRoot, 'manifest.json');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
const distChangelogPath = path.join(projectRoot, 'dist', 'CHANGELOG.md');
const buildMetaPath = path.join(projectRoot, '.build-meta.json');

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

const runGitCommand = (command) => {
  try {
    return execSync(command, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch (error) {
    return '';
  }
};

const syncVersions = (nextVersion) => {
  const packageJson = readJsonFile(packageJsonPath);
  packageJson.version = nextVersion;
  writeJsonFile(packageJsonPath, packageJson);

  if (fs.existsSync(packageLockPath)) {
    const packageLockJson = readJsonFile(packageLockPath);
    packageLockJson.version = nextVersion;

    if (packageLockJson.packages && packageLockJson.packages['']) {
      packageLockJson.packages[''].version = nextVersion;
    }

    writeJsonFile(packageLockPath, packageLockJson);
  }

  if (fs.existsSync(manifestJsonPath)) {
    const manifestJson = readJsonFile(manifestJsonPath);
    manifestJson.version = nextVersion;
    writeJsonFile(manifestJsonPath, manifestJson);
  }
};

const getChangedFiles = () => {
  const statusOutput = runGitCommand('git status --short --untracked-files=all');

  if (!statusOutput) {
    return [];
  }

  return statusOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('html/iframePage/dist/'))
    .filter((line) => !line.includes('html/iframePage/node_modules/'))
    .filter((line) => !line.includes('html/iframePage/.build-meta.json'))
    .map((line) => line.replace(/^([A-Z?]{1,2}|\?\?)\s+/, ''));
};

const buildChangelogEntry = (buildMeta) => {
  const branchName = runGitCommand('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const commitHash = runGitCommand('git rev-parse --short HEAD') || 'unknown';
  const changedFiles = getChangedFiles();
  const changedFilesSection = changedFiles.length > 0
    ? changedFiles.map((filePath) => `- ${filePath}`).join('\n')
    : '- No source file changes detected';

  return [
    `## v${buildMeta.nextVersion}`,
    '',
    `- Built At: ${buildMeta.builtAt}`,
    `- Previous Version: v${buildMeta.previousVersion}`,
    `- Git Branch: ${branchName}`,
    `- Git Commit: ${commitHash}`,
    '',
    '### Changed Files',
    changedFilesSection,
    '',
  ].join('\n');
};

const runPrebuild = () => {
  const packageJson = readJsonFile(packageJsonPath);
  const previousVersion = packageJson.version;
  const nextVersion = incrementPatchVersion(previousVersion);

  syncVersions(nextVersion);

  // Persist build metadata so postbuild can generate a matching changelog entry.
  writeJsonFile(buildMetaPath, {
    previousVersion,
    nextVersion,
    builtAt: new Date().toISOString(),
  });
};

const runPostbuild = () => {
  if (!fs.existsSync(buildMetaPath)) {
    throw new Error('Missing build metadata. Run the prebuild step first.');
  }

  const buildMeta = readJsonFile(buildMetaPath);
  const nextEntry = buildChangelogEntry(buildMeta);
  const previousChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  const changelogContent = [
    '# Build Changelog',
    '',
    nextEntry,
    previousChangelog.replace(/^# Build Changelog\s*/, '').trim(),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trimEnd() + '\n';

  fs.writeFileSync(changelogPath, changelogContent, 'utf8');

  if (fs.existsSync(path.join(projectRoot, 'dist'))) {
    fs.writeFileSync(distChangelogPath, changelogContent, 'utf8');
  }

  fs.unlinkSync(buildMetaPath);
};

const mode = process.argv[2];

if (mode === 'prebuild') {
  runPrebuild();
} else if (mode === 'postbuild') {
  runPostbuild();
} else {
  throw new Error(`Unsupported mode: ${mode}`);
}
