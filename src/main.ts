import './style.css';
import './ui/ui.css';
import { GameData } from '@/data/GameData';
import { Logger } from '@/core/Logger';
import { Game } from '@/core/Game';

const log = Logger.scope('Boot');

const bootScreen = document.getElementById('boot-screen');
const bootStatus = document.getElementById('boot-status');
const bootProgress = document.getElementById('boot-progress');

function setProgress(percent: number, text: string): void {
  if (bootProgress) bootProgress.style.width = `${Math.round(percent)}%`;
  if (bootStatus) bootStatus.textContent = text;
}

function showError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  log.error('Start fehlgeschlagen', error);
  setProgress(100, 'Start fehlgeschlagen');
  const box = document.createElement('div');
  box.className = 'boot-error';
  box.textContent = message;
  document.querySelector('.boot-inner')?.appendChild(box);
}

async function boot(): Promise<void> {
  setProgress(8, 'Inhalte werden geladen ...');
  GameData.load();
  setProgress(38, `${GameData.species.size} Kreaturen, ${GameData.moves.size} Attacken geladen`);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) throw new Error('Canvas oder UI-Wurzel nicht gefunden');

  setProgress(56, 'Grafik wird vorbereitet ...');
  const game = new Game({ canvas, uiRoot });

  // Debug-Handle: wird vom End-zu-End-Test und vom Entwickler-Overlay benutzt.
  (window as unknown as { __GAME__: Game }).__GAME__ = game;

  setProgress(78, 'Welt wird aufgebaut ...');
  game.start('home_bedroom', 'default');

  setProgress(100, 'Bereit');
  window.setTimeout(() => {
    bootScreen?.classList.add('hidden');
    canvas.focus();
  }, 320);
}

boot().catch(showError);

window.addEventListener('error', (e) => log.error(`Unbehandelter Fehler: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  log.error(`Unbehandelte Ablehnung: ${String(e.reason)}`));
