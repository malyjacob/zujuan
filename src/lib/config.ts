import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ConfigOptions } from '../types';
import { autoDetectBrowser } from './browser-detect';

const CONFIG_DIR = path.join(os.homedir(), '.zujuan-scraper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/** 获取配置目录（用于其他模块共享路径） */
export function getConfigDir(): string {
  return CONFIG_DIR;
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
    outputDir: path.join(os.homedir(), 'zujuan-output'),
    qrNotifyDiscord: '',
    cookie: '',
    browserPort: 9222,
    headless: false,
    logEnabled: true,
  };
}

// ─────────────────────────────────────────────
// ConfigManager
// ─────────────────────────────────────────────

/** 全部合法配置键（load/set 共用；新增配置项只需在此追加） */
const CONFIG_KEYS: (keyof Config)[] = [
  'browserDir',
  'loginQrDir',
  'logDir',
  'treeDb',
  'grade',
  'order',
  'treeDepth',
  'logLevel',
  'visionApiUrl',
  'visionApiKey',
  'visionModel',
  'visionEnabled',
  'exportFormat',
  'outputDir',
  'qrNotifyDiscord',
  'cookie',
  'browserPort',
  'headless',
  'logEnabled',
];

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
        const merged = { ...defaults };
        for (const key of CONFIG_KEYS) {
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
    // 只处理 defined 的值
    for (const key of CONFIG_KEYS) {
      const value = (options as Record<string, unknown>)[key];
      if (value !== undefined) {
        (this.config as unknown as Record<string, unknown>)[key] = value;
      }
    }
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
