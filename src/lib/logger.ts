import { LogLevel } from '../types';

const LEVEL_ORDER: Record<LogLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
};

class Logger {
  private level: LogLevel = 'quiet';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[this.level];
  }

  log(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;
    if (level === 'verbose') {
      console.log('[VERBOSE]', ...args);
    } else {
      console.log(...args);
    }
  }

  error(...args: unknown[]): void {
    // error 级别始终输出
    console.error(...args);
  }
}

export const logger = new Logger();
