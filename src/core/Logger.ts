export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogRecord {
  level: LogLevel;
  scope: string;
  message: string;
  time: number;
}

/**
 * Schlanker Logger mit Ringpuffer.
 *
 * Der Puffer wird vom Debug-Overlay (F1) angezeigt und vom E2E-Smoketest
 * ausgewertet - deshalb werden Fehler auch dann gespeichert, wenn die Konsole
 * stummgeschaltet ist.
 */
class LoggerImpl {
  private minLevel: LogLevel = 'info';
  private readonly buffer: LogRecord[] = [];
  private readonly maxBuffer = 400;
  private errorCount = 0;

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getRecords(): readonly LogRecord[] {
    return this.buffer;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  scope(scope: string) {
    return {
      debug: (msg: string, ...rest: unknown[]) => this.log('debug', scope, msg, rest),
      info: (msg: string, ...rest: unknown[]) => this.log('info', scope, msg, rest),
      warn: (msg: string, ...rest: unknown[]) => this.log('warn', scope, msg, rest),
      error: (msg: string, ...rest: unknown[]) => this.log('error', scope, msg, rest),
    };
  }

  private log(level: LogLevel, scope: string, message: string, rest: unknown[]): void {
    if (level === 'error') this.errorCount++;
    this.buffer.push({ level, scope, message, time: Date.now() });
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const prefix = `[${scope}]`;
    if (level === 'error') console.error(prefix, message, ...rest);
    else if (level === 'warn') console.warn(prefix, message, ...rest);
    else if (level === 'debug') console.debug(prefix, message, ...rest);
    else console.info(prefix, message, ...rest);
  }
}

export const Logger = new LoggerImpl();
export type ScopedLogger = ReturnType<LoggerImpl['scope']>;
