import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ConfigOptions } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.zujuan-scraper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/** 获取配置目录（用于其他模块共享路径） */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

// ─────────────────────────────────────────────
// 平台检测 & 浏览器路径自动查找
// ─────────────────────────────────────────────

function isLinux(): boolean {
  return os.platform() === 'linux';
}

function isMac(): boolean {
  return os.platform() === 'darwin';
}

function isWindows(): boolean {
  return os.platform() === 'win32';
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 收集 Playwright 安装目录下的 chrome 可执行文件 */
function findPlaywrightChrome(patterns: string[]): string | null {
  const playwrightDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!dirExists(playwrightDir)) return null;
  try {
    const chromiumDirs = fs.readdirSync(playwrightDir);
    for (const dir of chromiumDirs) {
      for (const pattern of patterns) {
        const resolved = pattern.replace('*', dir);
        const candidate = path.join(playwrightDir, resolved);
        if (fileExists(candidate)) return candidate;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** 自动检测系统中 Chrome/Chromium 的安装路径 */
export function autoDetectBrowser(): string | null {
  if (isLinux()) {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
    ];
    for (const c of candidates) {
      if (fileExists(c)) return c;
    }
    const playwright = findPlaywrightChrome(['*/chrome-linux/chrome']);
    if (playwright) return playwright;
  }

  if (isWindows()) {
    // 尝试 Windows PATH 中的 chrome.exe（无错误输出）
    try {
      const { execSync } = require('child_process');
      const out = execSync('where chrome 2>NUL', { encoding: 'utf8', timeout: 3000, windowsHide: true });
      const firstPath = out.split('\n')[0].trim();
      if (firstPath && fileExists(firstPath)) return firstPath;
    } catch {
      // where 未找到，继续尝试其他路径
    }

    const winCandidates = [
      path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const c of winCandidates) {
      if (fileExists(c)) return c;
    }
    const playwright = findPlaywrightChrome(['*/chrome-win/chrome.exe']);
    if (playwright) return playwright;
  }

  if (isMac()) {
    const macCandidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      path.join(os.homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium'),
    ];
    for (const c of macCandidates) {
      if (fileExists(c)) return c;
    }
    const playwright = findPlaywrightChrome(['*/chrome-mac/Chromium.app/Contents/MacOS/Chromium']);
    if (playwright) return playwright;
  }

  return null;
}

/** 获取代码层默认配置（每次调用时动态计算） */
function buildDefaultConfig(): Config {
  const browserDir = autoDetectBrowser() || '';
  return {
    browserDir,
    loginQrDir: CONFIG_DIR,
    logDir: CONFIG_DIR,
    treeDb: path.join(CONFIG_DIR, 'knowledge-tree.db'),
    grade: 'high',
    order: 'latest',
    treeDepth: 1,
    logLevel: 'quiet',
    visionApiUrl: '',
    visionApiKey: '',
    visionModel: '',
    visionEnabled: false,
    exportFormat: 'both',
    cookie: '',
    browserPort: 9222,
    headless: false,
    logEnabled: true,
  };
}

// ─────────────────────────────────────────────
// ConfigManager
// ─────────────────────────────────────────────

export class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const defaults = buildDefaultConfig();
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(data) as Partial<Config>;
        // 只保留当前 Config 接口中定义的键，旧键（已废弃）自动忽略
        const validKeys: (keyof Config)[] = [
          'browserDir', 'loginQrDir', 'logDir', 'treeDb',
          'grade', 'order', 'treeDepth', 'logLevel',
          'visionApiUrl', 'visionApiKey', 'visionModel', 'visionEnabled',
          'exportFormat',
          'cookie', 'browserPort', 'headless', 'logEnabled',
        ];
        const merged = { ...defaults };
        for (const key of validKeys) {
          if ((loaded as any)[key] !== undefined) {
            (merged as any)[key] = (loaded as any)[key];
          }
        }

        // 如果配置文件中 browserDir 为空但 autoDetect 找到了，静默写入配置文件
        const shouldAutoPersistBrowser = !(loaded as any).browserDir && autoDetectBrowser();
        if (shouldAutoPersistBrowser) {
          merged.browserDir = autoDetectBrowser()!;
          this.config = merged;
          this.saveConfigSilently(merged);
        }

        return merged;
      }
    } catch (error) {
      console.error('加载配置文件失败:', error);
    }
    return { ...defaults };
  }

  /** 静默保存（不打印错误，供 loadConfig 内部调用） */
  private saveConfigSilently(cfg: Config): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch {
      // 静默忽略
    }
  }

  private saveConfig(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存配置文件失败:', error);
    }
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  set(options: ConfigOptions): void {
    // 逐项更新，只处理 defined 的值
    if (options.browserDir !== undefined) this.config.browserDir = options.browserDir;
    if (options.loginQrDir !== undefined) this.config.loginQrDir = options.loginQrDir;
    if (options.logDir !== undefined) this.config.logDir = options.logDir;
    if (options.treeDb !== undefined) this.config.treeDb = options.treeDb;
    if (options.grade !== undefined) this.config.grade = options.grade;
    if (options.order !== undefined) this.config.order = options.order;
    if (options.treeDepth !== undefined) this.config.treeDepth = options.treeDepth;
    if (options.logLevel !== undefined) this.config.logLevel = options.logLevel;
    if (options.visionApiUrl !== undefined) this.config.visionApiUrl = options.visionApiUrl;
    if (options.visionApiKey !== undefined) this.config.visionApiKey = options.visionApiKey;
    if (options.visionModel !== undefined) this.config.visionModel = options.visionModel;
    if (options.visionEnabled !== undefined) this.config.visionEnabled = options.visionEnabled;
    if (options.exportFormat !== undefined) this.config.exportFormat = options.exportFormat;
    if (options.cookie !== undefined) this.config.cookie = options.cookie;
    if (options.browserPort !== undefined) this.config.browserPort = options.browserPort;
    if (options.headless !== undefined) this.config.headless = options.headless;
    if (options.logEnabled !== undefined) this.config.logEnabled = options.logEnabled;
    this.saveConfig();
  }

  /** 重置配置文件，删除文件并恢复所有代码默认值 */
  reset(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
    } catch (error) {
      console.error('删除配置文件失败:', error);
    }
    this.config = buildDefaultConfig();
  }

  getAll(): Config {
    return { ...this.config };
  }

  /** 返回用户可见的配置项（不含隐藏项） */
  getPublicConfig(): Omit<Config, 'cookie' | 'browserPort' | 'headless' | 'logEnabled'> {
    const { cookie, browserPort, headless, logEnabled, ...pub } = this.config;
    return pub;
  }

  static getConfigPath(): string {
    return CONFIG_FILE;
  }
}

export const configManager = new ConfigManager();
