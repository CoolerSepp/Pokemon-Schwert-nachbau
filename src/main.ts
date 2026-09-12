import './style.css';
import './ui/ui.css';
import { GameData } from '@/data/GameData';
import { Logger } from '@/core/Logger';
import { GameController } from '@/core/GameController';

const log = Logger.scope('Boot');

const bootScreen = document.getElementById('boot-screen');
const bootStatus = document.getElementById('boot-status');
const bootProgress = document.getElementById('boot-progress');

function setProgress(percent: number, text: string): void {
  if (bootProgress) bootProgress.style.width = `${Math.round(percent)}%`;
  if (bootStatus) bootStatus.textContent = text;
}

function showError(error: unknown): void {
  const message = error instanceof Error
    ? `${error.message}\n\n${error.stack ?? ''}`
    : String(error);
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
  setProgress(34, `${GameData.species.size} Kreaturen, ${GameData.moves.size} Attacken`);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) throw new Error('Canvas oder UI-Wurzel nicht gefunden');

  setProgress(52, 'Grafik wird vorbereitet ...');
  const controller = new GameController(canvas, uiRoot);

  // Debug-Zugriff fuer das Entwickler-Overlay und die End-zu-End-Tests.
  (window as unknown as { __GAME__: unknown }).__GAME__ = controller.game;
  (window as unknown as { __CONTROLLER__: unknown }).__CONTROLLER__ = controller;

  setProgress(76, 'Welt wird aufgebaut ...');
  await controller.start();

  setProgress(100, 'Bereit');
  window.setTimeout(() => {
    bootScreen?.classList.add('hidden');
    canvas.focus();
  }, 300);
}

boot().catch(showError);

window.addEventListener('error', (e) => log.error(`Unbehandelter Fehler: ${e.message}`));
window.addEventListener('unhandledrejection', (e) =>
  log.error(`Unbehandelte Ablehnung: ${String(e.reason)}`));
