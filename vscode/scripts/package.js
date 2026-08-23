/**
 * Package the extension into a versioned .vsix under release/.
 *
 * Output: release/stocks-ticker-v<version>.vsix
 * Version is read from package.json (single source of truth).
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

console.log(`\nDone: ${path.relative(root, outPath)}`);
