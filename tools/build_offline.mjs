#!/usr/bin/env node
/**
 * Baut die Offline-Fassung: eine einzige HTML-Datei plus ZIP-Archiv.
 *
 * Schritte:
 *   1. Vite-Build mit IIFE-Ausgabe (vite.offline.config.ts)
 *   2. Skript und Stylesheet in die HTML-Datei einbetten
 *   3. Eine kurze Anleitung daneben legen und beides zippen
 *
 * Ergebnis: release/Aetheria-Offline.zip - entpacken, Aetheria.html
 * doppelklicken, spielen. Kein Server, keine Installation.
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'dist-offline');
const releaseDir = path.join(root, 'release');
const htmlName = 'Aetheria.html';

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

/** Bettet eine Datei als Text in die HTML ein. */
async function readAsset(name) {
  return fs.readFile(path.join(outDir, name), 'utf8');
}

async function main() {
  console.log('> Offline-Build wird erstellt ...');
  await fs.rm(outDir, { recursive: true, force: true });
  run('npx', ['vite', 'build', '--config', 'vite.offline.config.ts']);

  let html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');

  // Stylesheet einbetten.
  const cssFiles = (await fs.readdir(outDir)).filter((f) => f.endsWith('.css'));
  for (const file of cssFiles) {
    const css = await readAsset(file);
    const link = new RegExp(
      `\\s*<link[^>]+href="[^"]*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
      'g',
    );
    // Ersetzung als Funktion: sonst deutet String.replace Zeichenfolgen wie
    // "$&" oder "$`" im eingebetteten Inhalt als Muster und zerstoert ihn.
    html = html.replace(link, () => `\n    <style>\n${css}\n    </style>`);
  }

  // Skript einbetten - bewusst ohne type="module", sonst blockiert der
  // Browser die Datei ueber file:// aus Sicherheitsgruenden.
  const jsFiles = (await fs.readdir(outDir)).filter((f) => f.endsWith('.js'));
  if (jsFiles.length !== 1) {
    throw new Error(`Erwartet genau eine JS-Datei, gefunden: ${jsFiles.join(', ') || 'keine'}`);
  }
  const js = await readAsset(jsFiles[0]);
  const scriptTag = new RegExp(
    `\\s*<script[^>]+src="[^"]*${jsFiles[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>\\s*</script>`,
    'g',
  );
  // Ein "</script>" im Code wuerde das Skript vorzeitig beenden.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  // Vite haengt das Modul-Skript in den Kopf. Ein gewoehnliches Skript liefe
  // dort vor dem Aufbau des Dokuments - deshalb wandert es ans Ende des
  // Koerpers, wo Canvas und UI-Wurzel bereits vorhanden sind.
  html = html.replace(scriptTag, () => '');
  if (!html.includes('</body>')) throw new Error('Kein </body> in der HTML-Datei');
  html = html.replace('</body>', () => `  <script>\n${safeJs}\n  </script>\n  </body>`);

  // Modul-Vorladehinweise entfernen: sie zeigen auf geloeschte Dateien.
  html = html.replace(/\s*<link[^>]+rel="modulepreload"[^>]*>/g, '');

  const leftovers = html.match(/(src|href)="\.?\/?(assets\/)?aetheria\.[a-z]+"/g);
  if (leftovers) {
    throw new Error(`Nicht eingebettete Verweise: ${leftovers.join(', ')}`);
  }
  if (/type="module"/.test(html)) {
    throw new Error('Es ist noch ein Modul-Skript in der HTML-Datei enthalten');
  }

  await fs.mkdir(releaseDir, { recursive: true });
  const htmlPath = path.join(releaseDir, htmlName);
  await fs.writeFile(htmlPath, html, 'utf8');

  const readme = [
    'AETHERIA - Offline-Fassung',
    '==========================',
    '',
    'Spielen:',
    '  1. Dieses Archiv vollstaendig entpacken.',
    `  2. Die Datei "${htmlName}" doppelklicken.`,
    '  3. Beim ersten Klick oder Tastendruck startet der Ton.',
    '',
    'Es wird kein Server und keine Internetverbindung benoetigt.',
    'Das gesamte Spiel steckt in dieser einen Datei.',
    '',
    'Steuerung:',
    '  WASD / Pfeiltasten  Bewegen',
    '  Umschalt            Rennen (ab den Laufschuhen)',
    '  Leertaste           Springen',
    '  E / Enter           Interagieren und Bestaetigen',
    '  Maus ziehen         Kamera frei um 360 Grad drehen',
    '  Q / C               Kamera nach links / rechts drehen',
    '  Bild auf / ab       Kamera neigen',
    '  R                   Kamera hinter die Figur zuruecksetzen',
    '  Mausrad             Heranzoomen und herauszoomen',
    '  Esc / X             Zurueck',
    '  M                   Menue',
    '  N                   Karte (ab der Regionskarte)',
    '  F5                  Schnellspeichern',
    '  F1                  Entwickleransicht (Bildrate, Zustand)',
    '',
    'Spielstaende:',
    '  Sie liegen im Speicher des Browsers (localStorage bzw. IndexedDB).',
    '  Wird die HTML-Datei verschoben, koennen aeltere Staende in manchen',
    '  Browsern nicht mehr gefunden werden - die Datei am besten liegen',
    '  lassen, wo sie ist.',
    '',
    'Empfohlene Browser: Chrome, Edge oder Firefox in aktueller Fassung.',
    'Benoetigt WebGL2.',
    '',
  ].join('\n');
  await fs.writeFile(path.join(releaseDir, 'LIESMICH.txt'), readme, 'utf8');

  const zipPath = path.join(releaseDir, 'Aetheria-Offline.zip');
  await fs.rm(zipPath, { force: true });
  await createZip(zipPath, [
    { name: htmlName, path: htmlPath },
    { name: 'LIESMICH.txt', path: path.join(releaseDir, 'LIESMICH.txt') },
  ]);

  const stat = await fs.stat(zipPath);
  const htmlStat = await fs.stat(htmlPath);
  const hash = createHash('sha256').update(await fs.readFile(zipPath)).digest('hex');
  console.log(`> ${htmlName}: ${(htmlStat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`> ${path.relative(root, zipPath)}: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`> SHA-256: ${hash}`);
}

/**
 * Schreibt ein ZIP-Archiv ohne zusaetzliche Abhaengigkeiten.
 * Die Dateien werden mit deflate komprimiert.
 */
async function createZip(target, entries) {
  const { deflateRawSync, crc32 } = await import('node:zlib');
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const content = await fs.readFile(entry.path);
    const compressed = deflateRawSync(content, { level: 9 });
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32 ? crc32(content) : legacyCrc32(content);

    const { time, date } = dosTimestamp(new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc >>> 0, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(content.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(target);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write(Buffer.concat(chunks));
    stream.write(centralBuffer);
    stream.end(end);
  });
}

/** Zeitstempel im DOS-Format, damit entpackte Dateien ein sinnvolles Datum tragen. */
function dosTimestamp(now) {
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
}

/** CRC-32 fuer aeltere Node-Fassungen ohne zlib.crc32. */
function legacyCrc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
