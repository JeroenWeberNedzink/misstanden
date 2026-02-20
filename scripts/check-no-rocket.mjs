import { spawnSync } from 'node:child_process';

const args = [
  '-n',
  '-i',
  'rocket\\.js|rocket\\.ew|data-rocket|rocketcdn|rocket-web\\.js|rocket-shot\\.js|static\\.rocket\\.new|builtwithrocket\\.new|application\\.rocket\\.new',
  '.',
  '-g',
  '!node_modules/**',
  '-g',
  '!dist/**',
  '-g',
  '!.git/**',
  '-g',
  '!README.md',
  '-g',
  '!docs/**',
  '-g',
  '!package.json',
  '-g',
  '!scripts/check-no-rocket.mjs',
];

const result = spawnSync('rg', args, { encoding: 'utf8' });

if (result.error) {
  console.error('Failed to run ripgrep (rg). Ensure rg is installed and in PATH.');
  process.exit(2);
}

if (result.status === 0) {
  console.error('Rocket remnants found:\n');
  console.error((result.stdout || '').trim());
  process.exit(1);
}

if (result.status === 1) {
  console.log('No Rocket remnants found.');
  process.exit(0);
}

if (result.stderr) {
  console.error(result.stderr.trim());
}
process.exit(result.status ?? 2);
