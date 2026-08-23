/**
 * Package the extension into a versioned .vsix under release/.
 *
 * Output: release/stocks-ticker-v<version>.vsix
 * Version is read from package.json (single source of truth).
 *
 * After a successful build, older .vsix packages in release/ are removed so
 * only the latest installable build remains. The just-built package is always
 * kept, guaranteeing at least one latest package is available.
 *
 * Usage: npm run package
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseDir = path.join(root, 'release');
const outFile = `stocks-ticker-v${version}.vsix`;
const outPath = path.join(releaseDir, outFile);

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

console.log(`Packaging v${version} → release/${outFile}`);

// Run vsce package with explicit output path.
// --no-git-tagVersion: don't auto-bump version, we read from package.json.
// --allow-star-activation: activationEvents uses "onStartupFinished" which is fine.
execSync(`npx vsce package --out "${outPath}"`, { stdio: 'inherit', cwd: root });

// Remove older .vsix packages so only the latest build remains. The just-built
// package (current version) is always kept, guaranteeing at least one latest
// installable package. Newer-version packages, if any, are also kept.
cleanupOldPackages(version);

console.log(`\nDone: ${path.relative(root, outPath)}`);

// Compare semver-like X.Y.Z strings: negative if a < b, positive if a > b, 0 if equal.
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function cleanupOldPackages(currentVersion) {
  if (!fs.existsSync(releaseDir)) return;
  const vsixPattern = /^stocks-ticker-v(\d+\.\d+\.\d+)\.vsix$/;
  let removed = 0;
  fs.readdirSync(releaseDir).forEach((entry) => {
    const match = entry.match(vsixPattern);
    if (!match) return;
    const fileVersion = match[1];
    // Keep the just-built package and any newer versions; remove strictly older ones.
    if (compareVersions(fileVersion, currentVersion) >= 0) return;
    try {
      fs.unlinkSync(path.join(releaseDir, entry));
      console.log(`Removed old package: ${entry}`);
      removed += 1;
    } catch (error) {
      console.warn(`Could not remove ${entry}: ${error.message}`);
    }
  });
  if (removed > 0) {
    console.log(`Cleaned up ${removed} old package(s); latest remains: ${outFile}`);
  }
}
