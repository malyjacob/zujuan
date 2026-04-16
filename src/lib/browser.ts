import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import { configManager, getConfigDir, autoDetectBrowser } from './config';
import { BrowserState } from '../types';
import { sendQrCodeToDiscord } from './discord-notifier';

const STORAGE_STATE_FILE = path.join(getConfigDir(), 'storage-state.json');
const BROWSER_STATE_FILE = path.join(getConfigDir(), '.browser-state.json');

// 日志写入函数
function writeLog(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
  if (!configManager.get('logEnabled')) return;

  const logDir = configManager.get('logDir');
  const logPath = path.join(logDir, 'zujuan.log');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logPath, logMessage, 'utf-8');
  } catch (error) {
    console.error('写入日志失败:', error);
  }
}

// 浏览器状态文件管理
export class BrowserStateManager {
  static save(state: BrowserState): void {
    try {
      fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      writeLog(`浏览器状态已保存: PID=${state.pid}, Port=${state.port}`);
    } catch (error) {
      writeLog(`保存浏览器状态失败: ${error}`, 'ERROR');
    }
  }

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
      writeLog(`Chrome 已启动，PID=${pid}，等待 CDP 端点...`);
    } catch (error) {
      writeLog(`保存启动状态失败: ${error}`, 'ERROR');
    }
  }

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

// 辅助函数：通过 HTTP 获取 WebSocket URL
async function getWsEndpoint(port: number, retries = 15, delayMs = 2000): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await new Promise<string>((resolve, reject) => {
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
                reject(new Error('解析版本信息失败: ' + data));
              }
            });
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('HTTP 请求超时'));
        });
        req.end();
      });
      return result;
    } catch (error) {
      // 静默忽略，等待下一次重试
    }
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`在 ${retries} 次尝试后仍无法获取 WebSocket 端点`);
}

export class BrowserManager {
  private static instance: BrowserManager | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private chromeProcess: ChildProcess | null = null;
  private wsEndpoint: string | null = null;
  private pid: number | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  // 启动浏览器（使用 child_process）
  async launch(): Promise<void> {
    writeLog('开始启动浏览器...');

    const browserDir = configManager.get('browserDir');
    const headless = configManager.get('headless');
    const port = configManager.get('browserPort');

    // 检查端口上是否已有浏览器运行（即使状态文件丢失）
    if (await BrowserStateManager.isBrowserRunningOnPort(port)) {
      console.log(`检测到端口 ${port} 上已有浏览器运行，尝试连接到现有浏览器...`);
      writeLog(`检测到端口 ${port} 上已有浏览器运行`);
      try {
        await this.connect();
        console.log('成功连接到已运行的浏览器！');
        return;
      } catch (connectError) {
        writeLog(`连接现有浏览器失败: ${connectError}，将尝试重新启动`);
        console.log('连接失败，将重新启动浏览器...');
      }
    }

    if (BrowserStateManager.isBrowserRunning()) {
      const state = BrowserStateManager.load();
      console.log(`浏览器已在运行 (PID: ${state?.pid})，请先使用 shutup 命令关闭`);
      writeLog('启动失败：浏览器已在运行');
      throw new Error('浏览器已在运行');
    }

    // 找到 chromium 可执行文件（优先用配置的，兜底自动检测）
    let chromiumPath = browserDir;
    if (!chromiumPath || !fs.existsSync(chromiumPath)) {
      const detected = autoDetectBrowser();
      if (detected) {
        chromiumPath = detected;
      }
    }

    if (!chromiumPath || !fs.existsSync(chromiumPath)) {
      throw new Error(
        `未找到浏览器可执行文件，请通过 config --browser-dir 指定 Chrome/Chromium 安装路径`
      );
    }

    const isWin = os.platform() === 'win32';
    const args = [
      headless ? '--headless' : '',
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      isWin ? '' : '--disable-dev-shm-usage',
      '--no-sandbox',
      `--user-data-dir=${path.join(os.tmpdir(), `zujuan-chrome-${port}`)}`
    ].filter(Boolean);

    writeLog(`启动 Chromium: ${chromiumPath}`);
    writeLog(`参数: ${args.join(' ')}`);

    try {
      // 使用 child_process 启动浏览器（detached 模式）
      this.chromeProcess = spawn(chromiumPath, args, {
        detached: true,
        stdio: 'ignore',
      });

      this.pid = this.chromeProcess.pid || null;
      this.chromeProcess.unref(); // 让进程独立于父进程

      if (this.pid) {
        writeLog(`Chromium 进程已启动，PID: ${this.pid}`);
      }

      // 尽早保存最小状态，这样 Ctrl+C 在 getWsEndpoint 轮询阶段中断时，
      // 下次 start 仍能感知到 Chrome 在运行
      if (this.pid) {
        BrowserStateManager.saveStartup(this.pid, port);
      }

      // 获取 WebSocket 端点
      this.wsEndpoint = await getWsEndpoint(port);
      writeLog(`WebSocket 端点: ${this.wsEndpoint}`);

      // 连接成功后将完整状态（包含 wsEndpoint）覆盖写入
      BrowserStateManager.save({
        wsEndpoint: this.wsEndpoint,
        pid: this.pid!,
        port,
        startedAt: new Date().toISOString(),
      });
      writeLog('浏览器状态已保存（启动阶段）');

      // 通过 CDP 连接到浏览器
      this.browser = await chromium.connectOverCDP(this.wsEndpoint);
      writeLog('已连接到浏览器');

      // 获取页面
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
        }
      }

      if (!this.page) {
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
      }
      // 访问初始页面前先应用 Cookie
      await this.applyConfigCookies();
      await this.page.goto('https://zujuan.xkw.com', { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);

      // 移除覆盖层
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

      // 保存浏览器状态
      if (this.wsEndpoint && this.pid) {
        BrowserStateManager.save({
          wsEndpoint: this.wsEndpoint,
          pid: this.pid,
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
      if (this.chromeProcess) {
        try {
          process.kill(this.pid!, 'SIGTERM');
        } catch {}
      }
      this.browser = null;
      this.chromeProcess = null;
      BrowserStateManager.clear();
      throw error;
    }
  }

  // 连接到已运行的浏览器
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
      // 如果 wsEndpoint 为空（上次 launch 在 getWsEndpoint 轮询阶段被 Ctrl+C 中断），
      // 重新从端口获取 WebSocket 端点
      const endpoint = state.wsEndpoint || await getWsEndpoint(state.port);
      this.browser = await chromium.connectOverCDP(endpoint);
      this.wsEndpoint = endpoint;
      this.pid = state.pid;

      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
        }
      }

      if (!this.page) {
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
      }

      writeLog('成功连接到浏览器');

    } catch (error) {
      writeLog(`连接浏览器失败: ${error}`, 'ERROR');
      BrowserStateManager.clear();
      throw new Error(`连接浏览器失败，请重新运行 start 命令`);
    }
  }

  private async applyConfigCookies(): Promise<void> {
    try {
      const rawCookie = configManager.get('cookie');
      if (!rawCookie) return;

      const cookies = rawCookie.split(';').map(c => {
        const [name, ...valueParts] = c.trim().split('=');
        return {
          name: name.trim(),
          value: decodeURIComponent(valueParts.join('=')),
          domain: 'zujuan.xkw.com',
          path: '/',
        };
      }).filter(c => c.name);

      if (cookies.length > 0) {
        await this.context!.addCookies(cookies);
        writeLog(`已应用 ${cookies.length} 个配置 Cookie`);
      }
    } catch (error) {
      writeLog(`应用配置 Cookie 失败: ${error}`, 'WARN');
    }
  }

  private async removeOverlay(): Promise<void> {
    try {
      const overlay = await this.page!.$('div.ai-search-guide-panel');
      if (overlay) {
        writeLog('移除覆盖层...');
        await this.page!.evaluate(() => {
          const el = document.querySelector('div.ai-search-guide-panel') as HTMLElement | null;
          if (el) el.style.display = 'none';
        });
        await this.page!.waitForTimeout(500);
      }
    } catch (error) {
      writeLog(`移除覆盖层失败: ${error}`, 'WARN');
    }
  }

  private async checkLoginStatus(): Promise<boolean> {
    try {
      // a.login-btn 存在表示未登录，不存在表示已登录
      const loginBtn = await this.page!.$('a.login-btn');
      return loginBtn === null;
    } catch {
      return false;
    }
  }

  private async doQRCodeLogin(): Promise<void> {
    try {
      // 直接通过 JS 调用登录函数
      console.log('正在触发登录函数...');
      await this.page!.evaluate(() => {
        const overlay = document.querySelector('div.ai-search-guide-panel') as HTMLElement | null;
        if (overlay) overlay.style.display = 'none';
        const win = window as any;
        if (typeof win.logindiv === 'function') {
          win.logindiv();
        }
      });

      // 等待跳转到 CAS 登录页并等待页面加载
      console.log('正在等待登录页加载...');
      await this.page!.waitForLoadState('load');
      await this.page!.waitForTimeout(3000);

      // 等待二维码加载（支持 canvas 或 img 两种渲染方式）
      console.log('正在获取二维码...');
      const currentUrl = this.page!.url();
      writeLog(`当前页面 URL: ${currentUrl}`);
      // 尝试多种方式等待二维码
      try {
        await this.page!.waitForSelector('#qrcode canvas', { timeout: 10000 });
      } catch {
        // canvas 不存在则尝试 img
        const img = await this.page!.$('#qrcode img');
        if (!img) {
          throw new Error('未找到二维码元素（#qrcode canvas 或 #qrcode img）');
        }
        writeLog('二维码通过 img 标签渲染');
      }

      const loginQrDir = configManager.get('loginQrDir');
      const qrCodePath = path.join(loginQrDir, 'login-qr.png');
      const qrcode = await this.page!.$('#qrcode');
      if (qrcode) {
        if (!fs.existsSync(loginQrDir)) {
          fs.mkdirSync(loginQrDir, { recursive: true });
        }
        await qrcode.screenshot({ path: qrCodePath });
        console.log(`\n二维码已保存到: ${qrCodePath}\n`);

        // 发送 Discord 通知（静默失败，不阻塞流程）
        sendQrCodeToDiscord(qrCodePath);
      }

      console.log('请打开手机微信扫码登录（60秒内）...');

      let loginSuccess = false;
      const startTime = Date.now();

      while (Date.now() - startTime < 60000) {
        await this.page!.waitForTimeout(2000);
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
        throw new Error('扫码登录超时（60秒）');
      }

      await this.page!.waitForTimeout(2000);

    } catch (error) {
      writeLog(`扫码登录异常: ${error}`, 'ERROR');
      await this.shutdown();
      throw error;
    }
  }

  private async saveLoginState(): Promise<void> {
    if (this.context) {
      await this.context.storageState({ path: STORAGE_STATE_FILE });
      writeLog(`登录状态已保存到: ${STORAGE_STATE_FILE}`);
    }
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      await this.connect();
    }
    return this.page!;
  }

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

  async shutdown(): Promise<void> {
    writeLog('执行 shutdown，关闭浏览器进程');

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    if (this.chromeProcess && this.pid) {
      try {
        process.kill(this.pid, 'SIGTERM');
      } catch {}
      this.chromeProcess = null;
    }

    const state = BrowserStateManager.load();
    if (state) {
      BrowserStateManager.killProcess(state.pid);
    }

    this.context = null;
    this.page = null;
    this.wsEndpoint = null;
    this.pid = null;
    BrowserStateManager.clear();

    console.log('浏览器已关闭');
    writeLog('浏览器已完全关闭');
  }

  isConnected(): boolean {
    return this.browser !== null;
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const loginBtn = await this.page.$('a.login-btn');
      return loginBtn === null;
    } catch {
      return false;
    }
  }

  isRunning(): boolean {
    return BrowserStateManager.isBrowserRunning();
  }
}

export const browserManager = BrowserManager.getInstance();
