import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { getConfigDir } from './config';
import { BrowserState } from '../types';
import { logger } from './logger';

export const STORAGE_STATE_FILE = path.join(getConfigDir(), 'storage-state.json');
export const BROWSER_STATE_FILE = path.join(getConfigDir(), '.browser-state.json');

// 浏览器状态文件管理
export class BrowserStateManager {
  static save(state: BrowserState): void {
    try {
      fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      logger.fileLog(`浏览器状态已保存: PID=${state.pid}, Port=${state.port}`);
    } catch (error) {
      logger.fileLog(`保存浏览器状态失败: ${error}`, 'ERROR');
    }
  }

  static load(): BrowserState | null {
    try {
      if (fs.existsSync(BROWSER_STATE_FILE)) {
        const data = fs.readFileSync(BROWSER_STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.fileLog(`读取浏览器状态失败: ${error}`, 'ERROR');
    }
    return null;
  }

  /**
   * 保存启动前最小状态（PID + port，wsEndpoint 尚不可用）。
   * 在 Chrome 刚 spawn 后立即调用，确保 Ctrl+C 中断后状态文件已存在，
   * 下次 start 能感知到 Chrome 在运行。
   */
  static saveStartup(pid: number, port: number): void {
    try {
      const state: BrowserState = {
        wsEndpoint: '',
        pid,
        port,
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      logger.fileLog(`Chrome 已启动，PID=${pid}，等待 CDP 端点...`);
    } catch (error) {
      logger.fileLog(`保存启动状态失败: ${error}`, 'ERROR');
    }
  }

  static clear(): void {
    try {
      if (fs.existsSync(BROWSER_STATE_FILE)) {
        fs.unlinkSync(BROWSER_STATE_FILE);
        logger.fileLog('浏览器状态已清除');
      }
    } catch (error) {
      logger.fileLog(`清除浏览器状态失败: ${error}`, 'ERROR');
    }
  }

  static isProcessRunning(pid: number): boolean {
    if (!pid || pid === 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async isBrowserRunningOnPort(port: number): Promise<boolean> {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/json/version',
            method: 'GET',
            timeout: 3000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                const version = JSON.parse(data);
                resolve(!!version.webSocketDebuggerUrl);
              } catch {
                resolve(false);
              }
            });
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
      return result;
    } catch {
      return false;
    }
  }

  static isBrowserRunning(): boolean {
    const state = this.load();
    if (!state) return false;
    if (state.pid && state.pid !== 0) {
      return this.isProcessRunning(state.pid);
    }
    if (state.wsEndpoint) {
      return true;
    }
    return false;
  }

  static killProcess(pid: number): boolean {
    if (!pid || pid === 0) {
      logger.fileLog('PID 为空或 0，跳过进程终止');
      return false;
    }
    try {
      process.kill(pid, 'SIGTERM');
      logger.fileLog(`已发送 SIGTERM 到进程 ${pid}`);
      return true;
    } catch (error) {
      logger.fileLog(`杀掉进程 ${pid} 失败: ${error}`, 'ERROR');
      return false;
    }
  }
}
