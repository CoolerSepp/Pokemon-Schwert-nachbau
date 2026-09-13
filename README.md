# Aetheria

Ein eigenstaendiges 3D-Monster-RPG fuer den Browser: eigene Region, eigene
Kreaturen, eigenes Kampfsystem. Aufbau und Spielsysteme sind an klassischen
Monster-Rollenspielen orientiert, saemtliche Inhalte, Modelle, Klaenge und
Texte sind neu erstellt. Es werden keine Originaldateien, Modelle,
Musikstuecke oder Texte aus einem anderen Spiel verwendet.

## Sofort spielen (ohne Installation)

1. `release/Aetheria-Offline.zip` herunterladen und entpacken.
2. `Aetheria.html` doppelklicken.
3. Beim ersten Klick oder Tastendruck startet der Ton.

Die HTML-Datei enthaelt das komplette Spiel - kein Server, keine
Internetverbindung, keine weiteren Dateien. Benoetigt wird ein aktueller
Browser mit WebGL2 (Chrome, Edge oder Firefox).

## Steuerung

| Taste | Wirkung |
| --- | --- |
| WASD / Pfeiltasten | Bewegen |
| Umschalt | Rennen (ab den Laufschuhen) |
| Leertaste | Springen |
| E / Enter | Interagieren, Bestaetigen |
| Esc / X | Zurueck |
| M | Menue |
| N | Karte (ab der Regionskarte) |
| F5 | Schnellspeichern |
| F1 | Entwickleransicht (Bildrate, Zeichenaufrufe, Spielzustand) |

## Entwicklung

```bash
npm install
npm run dev            # Entwicklungsserver
npm run build          # Produktionsbuild nach dist/
npm run build:offline  # Einzeldatei + ZIP nach release/
npm run test           # Unit-Tests (Vitest)
npm run test:e2e       # Browsertests (Playwright, echtes Chromium)
npm run verify         # Typpruefung, Unit-Tests, beide Builds, Browsertests
```

## Aufbau

```
src/
  core/        Spielschleife, Ereignisbus, Zufall, Konfiguration, Steuerlogik
  engine/      Renderer, Eingabe, Ressourcen
  world/       Gelaende, Kollision, Gebiete, Tageszeit, Wetterwechsel
  particles/   Wetterpartikel (Regen, Schnee, Sand, Nebel)
  creatures/   Kreaturenmodell, Werte, Entwicklung, Erfahrung
  battle/      Kampf-Engine (kopfueber testbar), Kampf-KI, Kampfbuehne
  raids/       Energiepunkte und Raid-Kaempfe
  gyms/        Ligaherausforderung
  ui/          Bildschirme, HUD, Menues
  audio/       Synthesizer, Musikstuecke, Klangeffekte
  debug/       Entwickleransicht (F1)
data/          Saemtliche Inhalte als JSON (Kreaturen, Attacken, Gebiete ...)
tools/         Python-Generatoren fuer die Inhalte
tests/         Unit-Tests und Browsertests
```

Neue Kreaturen, Attacken, Gegenstaende, Gebiete, Trainer, Dialoge, Quests,
Laeden, Raids oder Ligen entstehen ausschliesslich durch neue JSON-Dateien
unter `data/` - Systemcode muss dafuer nicht angefasst werden.

## Technik

- TypeScript (strict), Three.js, Vite, Vitest, Playwright
- Keine Bild-, Audio- oder Modelldateien: Gelaende, Kreaturen, Gebaeude,
  Musik und Klangeffekte werden zur Laufzeit erzeugt
- Kampfsystem ohne Renderer- oder DOM-Bezug: Aktionen hinein, Ereignis-
  protokoll heraus - die Darstellung spielt das Protokoll ab
- Spielstaende in IndexedDB mit localStorage als Rueckfallebene
