/**
 * Rebuild a NEW versioned package in one shot — "重新打一个新包".
 *
 * Bumps the patch version in package.json, then delegates to the standard
 * package script, which compiles, builds the .vsix, and cleans up older
 * packages so only the latest installable build remains.
 *
 * Output: release/stocks-ticker-v<new-version>.vsix (old versions removed)
 *
 * Usage: npm run repackage
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const parts = pkg.version.split('.').map(Number);
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  console.error(`Unsupported version format: ${pkg.version}`);
  process.exit(1);
}
const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;

pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Version bumped: -> v${nextVersion}`);

// Delegate to the standard package script: compile + build + cleanup old packages.
execSync('npm run package', { stdio: 'inherit', cwd: root });
