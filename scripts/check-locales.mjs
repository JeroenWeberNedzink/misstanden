import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(scriptDir, '../src/i18n/locales');
const mojibakeMarkers = [
  String.fromCodePoint(0x00c3),
  String.fromCodePoint(0x00c2),
  String.fromCodePoint(0x00c5),
  String.fromCodePoint(0x00e2, 0x20ac),
  String.fromCodePoint(0x00ef, 0x00bb, 0x00bf),
  String.fromCodePoint(0x00ef, 0x00bf, 0x00bd),
  '\uFFFD',
];
const failures = [];

for (const entry of fs.readdirSync(localesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const localeFile = path.join(localesDir, entry.name, 'translation.json');
  if (!fs.existsSync(localeFile)) continue;

  const contents = fs.readFileSync(localeFile);
  const text = contents.toString('utf8');

  if (contents.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    failures.push(`${entry.name}: translation.json contains a UTF-8 BOM`);
  }

  try {
    JSON.parse(text);
  } catch (error) {
    failures.push(`${entry.name}: invalid JSON (${error.message})`);
  }

  const marker = mojibakeMarkers.find((candidate) => text.includes(candidate));
  if (marker) {
    failures.push(`${entry.name}: probable mojibake detected (${JSON.stringify(marker)})`);
  }

  if ([...text].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x80 && codePoint <= 0x9f;
  })) {
    failures.push(`${entry.name}: unexpected C1 control character detected`);
  }
}

if (failures.length > 0) {
  console.error(`Locale validation failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Locale validation passed.');
}
