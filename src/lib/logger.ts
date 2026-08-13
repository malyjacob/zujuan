import { LogLevel } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { configManager } from './config';

const LEVEL_ORDER: Record<LogLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
};

export type FileLogLevel = 'INFO' | 'WARN' | 'ERROR';

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

  /**
   * 追加写入 zujuan.log 文件（与 console 输出分离，避免刷屏）。
   * 受 logEnabled / logDir 配置控制；写入失败静默忽略，不影响主流程。
   * 签名与原 browser.ts 的 writeLog(message, level) 保持一致，便于逐处替换。
   */
  fileLog(message: string, level: FileLogLevel = 'INFO'): void {
    try {
      if (!configManager.get('logEnabled')) return;
      const logDir = configManager.get('logDir');
      if (!logDir) return;
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'zujuan.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `[${timestamp}] [${level}] ${message}\n`, 'utf-8');
    } catch {
      // 日志写入失败不影响主流程
    }
  }
}

export const logger = new Logger();
