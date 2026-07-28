const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..', '..');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
const distChangelogPath = path.join(projectRoot, 'dist', 'CHANGELOG.md');
const buildMetaPath = path.join(projectRoot, '.build-meta.json');

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

const runPostbuild = () => {
  // Only append a changelog entry when the outer build.js recorded a version bump.
  // Plain `node build.js` runs (no bump) skip the entry but still mirror the
  // existing changelog into dist/ so the committed dist artifact stays intact.
  if (fs.existsSync(buildMetaPath)) {
    const buildMeta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf8'));
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
    fs.unlinkSync(buildMetaPath);
  }

  // Vite empties dist/ on each build; re-create the dist changelog mirror so
  // the committed dist/CHANGELOG.md does not silently disappear.
  if (fs.existsSync(path.join(projectRoot, 'dist')) && fs.existsSync(changelogPath)) {
    fs.writeFileSync(
      distChangelogPath,
      fs.readFileSync(changelogPath, 'utf8'),
      'utf8'
    );
  }
};

const mode = process.argv[2];

if (mode === 'postbuild') {
  runPostbuild();
} else {
  throw new Error(`Unsupported mode: ${mode}`);
}
