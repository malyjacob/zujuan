import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import terminalImage from 'terminal-image';
import { configManager } from './config';
import { BrowserState } from '../types';

const STORAGE_STATE_FILE = path.join(process.cwd(), 'storage-state.json');
const BROWSER_STATE_FILE = path.join(process.cwd(), '.browser-state.json');

// 日志写入函数
function writeLog(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
  if (!configManager.get('logEnabled')) return;

  const logPath = configManager.get('logPath');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  try {
    fs.appendFileSync(logPath, logMessage, 'utf-8');
  } catch (error) {
    console.error('写入日志失败:', error);
  }
}

// 浏览器状态文件管理
export class BrowserStateManager {
  // 保存浏览器状态
  static save(state: BrowserState): void {
    try {
      fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      writeLog(`浏览器状态已保存: PID=${state.pid}, Port=${state.port}`);
    } catch (error) {
      writeLog(`保存浏览器状态失败: ${error}`, 'ERROR');
    }
  }

  // 读取浏览器状态
  static load(): BrowserState | null {
    try {
      if (fs.existsSync(BROWSER_STATE_FILE)) {
        const data = fs.readFileSync(BROWSER_STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      writeLog(`读取浏览器状态失败: ${error}`, 'ERROR');
    }
    return null;
  }

  // 删除浏览器状态
  static clear(): void {
    try {
      if (fs.existsSync(BROWSER_STATE_FILE)) {
        fs.unlinkSync(BROWSER_STATE_FILE);
        writeLog('浏览器状态已清除');
      }
    } catch (error) {
      writeLog(`清除浏览器状态失败: ${error}`, 'ERROR');
    }
  }

  // 检查进程是否存活
  static isProcessRunning(pid: number): boolean {
    if (!pid || pid === 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  // 检查浏览器是否在运行
  static isBrowserRunning(): boolean {
    const state = this.load();
    if (!state) return false;

    // 如果 PID 有效，检查进程是否存活
    if (state.pid && state.pid !== 0) {
      return this.isProcessRunning(state.pid);
    }

    // 如果 PID 无效或为 0，检查 WebSocket 端点是否可连接
    if (state.wsEndpoint) {
      return true; // 假设可连接
    }

    return false;
  }

  // 杀掉进程
  static killProcess(pid: number): boolean {
    if (!pid || pid === 0) {
      writeLog('PID 为空或 0，跳过进程终止');
      return false;
    }
    try {
      process.kill(pid, 'SIGTERM');
      writeLog(`已发送 SIGTERM 到进程 ${pid}`);
      return true;
    } catch (error) {
      writeLog(`杀掉进程 ${pid} 失败: ${error}`, 'ERROR');
      return false;
    }
  }
}

export class BrowserManager {
  private static instance: BrowserManager | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private wsEndpoint: string | null = null;
  private pid: number | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  // 启动浏览器（start 命令使用）
  async launch(): Promise<void> {
    writeLog('开始启动浏览器...');

    // 检查是否已在运行
    if (BrowserStateManager.isBrowserRunning()) {
      const state = BrowserStateManager.load();
      console.log(`浏览器已在运行 (PID: ${state?.pid})，请先使用 shutup 命令关闭`);
      writeLog('启动失败：浏览器已在运行');
      throw new Error('浏览器已在运行');
    }

    const browserPath = configManager.get('browserPath');
    const headless = configManager.get('headless');
    const port = configManager.get('browserPort');

    const options: any = {
      headless,
      args: [
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    };

    if (browserPath && fs.existsSync(browserPath)) {
      options.executablePath = browserPath;
    } else if (browserPath) {
      writeLog(`浏览器路径不存在: ${browserPath}`, 'WARN');
    }

    writeLog(`启动 Chromium，端口: ${port}`);

    try {
      // 启动浏览器
      this.browser = await chromium.launch(options);

      // 通过 HTTP API 获取 WebSocket 端点
      this.wsEndpoint = await this.getWsEndpointFromHttp(port);
      writeLog(`WebSocket 端点: ${this.wsEndpoint}`);

      // 通过 CDP 获取 PID
      this.pid = await this.getBrowserPid(port);
      if (this.pid) {
        writeLog(`Chromium 进程已启动，PID: ${this.pid}`);
      } else {
        writeLog('无法获取 PID，将通过进程列表查找', 'WARN');
      }

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      // 访问初始页面
      await this.page.goto('https://zujuan.xkw.com', { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);

      // 移除页面覆盖层元素（如引导面板）
      await this.removeOverlay();

      // 检查登录状态
      const isLoggedIn = await this.checkLoginStatus();

      if (!isLoggedIn) {
        console.log('未登录，开始扫码登录流程...');
        writeLog('检测到未登录，开始扫码登录');
        await this.doQRCodeLogin();
      } else {
        console.log('已登录');
        writeLog('检测到已登录状态');
      }

      // 保存登录状态
      await this.saveLoginState();

      // 如果 PID 为 null，尝试通过进程查找
      if (!this.pid) {
        this.pid = await this.findBrowserPid();
      }

      // 保存浏览器状态（wsEndpoint 是必须的，pid 可以是 null）
      if (this.wsEndpoint) {
        BrowserStateManager.save({
          wsEndpoint: this.wsEndpoint,
          pid: this.pid || 0,
          port,
          startedAt: new Date().toISOString(),
        });
        console.log('浏览器状态已保存');
      }

      console.log('浏览器启动成功！');
      writeLog('浏览器启动完成');

    } catch (error) {
      writeLog(`浏览器启动失败: ${error}`, 'ERROR');
      // 清理
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      BrowserStateManager.clear();
      throw error;
    }
  }

  // 通过 HTTP API 获取 WebSocket 端点（带重试机制）
  private async getWsEndpointFromHttp(port: number, retries = 5, delayMs = 1000): Promise<string> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.wait(delayMs);
        const result = await this.httpRequest(port);
        if (result) return result;
      } catch (error) {
        writeLog(`获取 WebSocket 端点尝试 ${i + 1}/${retries} 失败: ${error}`, 'WARN');
      }
    }
    throw new Error(`在 ${retries} 次尝试后仍无法获取 WebSocket 端点`);
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private httpRequest(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
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
              if (version.webSocketDebuggerUrl) {
                resolve(version.webSocketDebuggerUrl);
              } else {
                reject(new Error('未找到 webSocketDebuggerUrl'));
              }
            } catch (e) {
              reject(new Error(`解析版本信息失败: ${data}`));
            }
          });
        }
      );

      req.on('error', (e) => reject(new Error(`HTTP 请求失败: ${e.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HTTP 请求超时'));
      });
    });
  }

  // 通过 CDP 获取浏览器 PID
  private async getBrowserPid(port: number): Promise<number | null> {

    try {
      const CDP = require('playwright-core').CDP;
      const cdp = await CDP({ port });
      // 使用 Browser.getBrowserProcessId 获取 PID
      const result = await cdp.send('Browser.getBrowserProcessId');
      cdp.detach();
      return result.pid;
    } catch (error) {
      writeLog(`获取浏览器 PID 失败: ${error}`, 'WARN');
      return null;
    }
  }

  // 通过进程列表查找浏览器 PID
  private async findBrowserPid(): Promise<number | null> {
    const browserPath = configManager.get('browserPath');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // 查找 Chrome 进程
      if (process.platform === 'linux') {
        const { stdout } = await execAsync(`pgrep -f "chrome.*--remote-debugging-port=${configManager.get('browserPort')}" | head -1`);
        const pid = parseInt(stdout.trim());
        if (pid && !isNaN(pid)) {
          writeLog(`通过进程列表找到 PID: ${pid}`);
          return pid;
        }
      }
    } catch (error) {
      writeLog(`查找浏览器 PID 失败: ${error}`, 'WARN');
    }
    return null;
  }

  // 移除页面覆盖层元素（如引导面板）
  private async removeOverlay(): Promise<void> {
    try {
      const overlaySelector = 'div.ai-search-guide-panel';
      const overlay = await this.page!.$(overlaySelector);

      if (overlay) {
        writeLog(`检测到覆盖层元素 ${overlaySelector}，正在移除...`);
        // 隐藏或删除该元素
        await this.page!.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) {
            el.style.display = 'none';
            // 或者使用 remove() 完全删除
            // el.remove();
          }
        }, overlaySelector);
        console.log('已移除页面覆盖层');
        writeLog('覆盖层元素已移除');
        // 等待一小段时间让页面稳定
        await this.page!.waitForTimeout(500);
      }
    } catch (error) {
      writeLog(`移除覆盖层失败: ${error}`, 'WARN');
    }
  }

  // 连接到已运行的浏览器（scrape 命令使用）
  async connect(): Promise<void> {
    writeLog('尝试连接到已运行的浏览器...');

    const state = BrowserStateManager.load();

    if (!state) {
      writeLog('未找到浏览器状态文件，请先运行 start 命令', 'ERROR');
      throw new Error('未找到浏览器状态文件，请先运行 start 命令');
    }

    if (!BrowserStateManager.isProcessRunning(state.pid)) {
      writeLog(`浏览器进程 ${state.pid} 不存在或已崩溃`, 'ERROR');
      BrowserStateManager.clear();
      throw new Error(`浏览器进程不存在或已崩溃，请重新运行 start 命令`);
    }

    writeLog(`连接到浏览器，PID: ${state.pid}`);

    try {
      // 使用 wsEndpoint 连接
      const { chromium } = require('playwright');
      this.browser = await chromium.connectOverCDP(state.wsEndpoint);
      this.wsEndpoint = state.wsEndpoint;
      this.pid = state.pid;

      // 获取现有上下文
      const contexts = this.browser!.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
        }
      }

      if (!this.page) {
        this.context = await this.browser!.newContext();
        this.page = await this.context.newPage();
      }

      writeLog('成功连接到浏览器');

    } catch (error) {
      writeLog(`连接浏览器失败: ${error}`, 'ERROR');
      BrowserStateManager.clear();
      throw new Error(`连接浏览器失败: ${error}，请重新运行 start 命令`);
    }
  }

  // 检查登录状态
  private async checkLoginStatus(): Promise<boolean> {
    try {
      const avatar = await this.page!.$('div.avatar img');
      return avatar !== null;
    } catch {
      return false;
    }
  }

  // 扫码登录流程
  private async doQRCodeLogin(): Promise<void> {
    try {
      // 直接通过 JavaScript 调用登录函数，跳过 DOM 点击
      console.log('正在触发登录函数...');
      await this.page!.evaluate(() => {
        // 移除可能存在的覆盖层
        const overlay = document.querySelector('div.ai-search-guide-panel');
        if (overlay) {
          (overlay as HTMLElement).style.display = 'none';
        }
        // 调用登录函数 - 使用 any 类型绕过 TypeScript 检查
        const win = window as any;
        if (typeof win.logindiv === 'function') {
          win.logindiv();
        } else {
          // 尝试通过 href 触发
          const loginLink = document.querySelector('a.login-btn[href^="javascript:"]');
          if (loginLink) {
            const href = loginLink.getAttribute('href');
            if (href) {
              const fnMatch = href.match(/javascript:(\w+)\(/);
              if (fnMatch && fnMatch[1] && typeof win[fnMatch[1]] === 'function') {
                win[fnMatch[1]]();
              }
            }
          }
        }
      });
      await this.page!.waitForTimeout(2000);
      console.log('已触发登录函数');

      // 等待二维码加载
      console.log('正在获取二维码...');
      await this.page!.waitForSelector('#qrcode canvas', { timeout: 5000 });

      const qrCodePath = configManager.get('qrCodePath');

      // 截图二维码
      const qrcode = await this.page!.$('#qrcode');
      if (qrcode) {
        await qrcode.screenshot({ path: qrCodePath });

        try {
          console.log('\n' + await terminalImage.file(qrCodePath, { width: 30 }) + '\n');
        } catch {
          console.log(`\n二维码已保存到: ${qrCodePath}\n`);
        }
      }

      console.log('请打开手机微信扫码登录（30秒内）...');

      // 等待扫码成功
      let loginSuccess = false;
      const startTime = Date.now();

      while (Date.now() - startTime < 30000) {
        await this.page!.waitForTimeout(2000);

        await this.page!.waitForTimeout(1000);

        const isLoggedIn = await this.checkLoginStatus();
        if (isLoggedIn) {
          loginSuccess = true;
          console.log('扫码成功！');
          writeLog('扫码登录成功');
          break;
        }

        const qrcodeStillExists = await this.page!.$('#qrcode canvas');
        if (!qrcodeStillExists) {
          loginSuccess = true;
          console.log('扫码成功！');
          writeLog('扫码登录成功');
          break;
        }
      }

      if (!loginSuccess) {
        writeLog('扫码登录超时', 'ERROR');
        await this.shutdown();
        throw new Error('扫码登录超时（30秒）');
      }

      await this.page!.waitForTimeout(2000);

    } catch (error) {
      writeLog(`扫码登录异常: ${error}`, 'ERROR');
      await this.shutdown();
      throw error;
    }
  }

  // 保存登录状态
  private async saveLoginState(): Promise<void> {
    if (this.context) {
      await this.context.storageState({ path: STORAGE_STATE_FILE });
      writeLog(`登录状态已保存到: ${STORAGE_STATE_FILE}`);
    }
  }

  // 获取页面
  async getPage(): Promise<Page> {
    if (!this.page) {
      // 如果没有页面，尝试连接
      await this.connect();
    }
    return this.page!;
  }

  // 关闭连接（不关闭浏览器进程）
  async close(): Promise<void> {
    writeLog('关闭浏览器连接');
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.wsEndpoint = null;
    }
  }

  // 完全关闭浏览器进程（shutup 命令使用）
  async shutdown(): Promise<void> {
    writeLog('执行 shutdown，关闭浏览器进程');

    // 先关闭连接
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    // 从状态文件读取 PID 并杀掉
    const state = BrowserStateManager.load();
    if (state) {
      BrowserStateManager.killProcess(state.pid);
    }

    // 清理状态
    this.context = null;
    this.page = null;
    this.wsEndpoint = null;
    this.pid = null;
    BrowserStateManager.clear();

    console.log('浏览器已关闭');
    writeLog('浏览器已完全关闭');
  }

  // 截图
  async screenshot(name: string, options?: any): Promise<Buffer> {
    const page = await this.getPage();
    const outputDir = configManager.get('outputDir');
    const screenshotPath = path.join(outputDir, `${name}.png`);

    await page.screenshot({
      path: screenshotPath,
      ...options,
    });

    return fs.readFileSync(screenshotPath);
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.browser !== null;
  }

  // 检查浏览器是否在运行
  isRunning(): boolean {
    return BrowserStateManager.isBrowserRunning();
  }
}

export const browserManager = BrowserManager.getInstance();
