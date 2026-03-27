import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ConfigOptions, LogLevel } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.zujuan-scraper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
  cookie: '',
  outputDir: './zujuan-output',
  browserPath: '/usr/bin/google-chrome',
  defaultGrade: 'high',
  defaultOrder: 'latest',
  headless: false,
  qrCodePath: './login-qrcode.png',
  browserPort: 9222,
  logEnabled: true,
  logPath: './zujuan.log',
  defaultLogLevel: 'quiet',
};

export class ConfigManager {
  private config: Config;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const loaded = JSON.parse(data);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      console.error('加载配置文件失败:', error);
    }
    return { ...DEFAULT_CONFIG };
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
    if (options.cookie !== undefined) {
      this.config.cookie = options.cookie;
    }
    if (options.output !== undefined) {
      this.config.outputDir = options.output;
    }
    if (options.browserPath !== undefined) {
      this.config.browserPath = options.browserPath;
    }
    if (options.qrCodePath !== undefined) {
      this.config.qrCodePath = options.qrCodePath;
    }
    if (options.defaultGrade !== undefined) {
      this.config.defaultGrade = options.defaultGrade;
    }
    if (options.defaultOrder !== undefined) {
      this.config.defaultOrder = options.defaultOrder;
    }
    if (options.browserPort !== undefined) {
      this.config.browserPort = options.browserPort;
    }
    if (options.headless !== undefined) {
      this.config.headless = options.headless;
    }
    if (options.logEnabled !== undefined) {
      this.config.logEnabled = options.logEnabled;
    }
    if (options.logPath !== undefined) {
      this.config.logPath = options.logPath;
    }
    if (options.defaultLogLevel !== undefined) {
      this.config.defaultLogLevel = options.defaultLogLevel;
    }
    this.saveConfig();
  }

  getAll(): Config {
    return { ...this.config };
  }

  static getConfigPath(): string {
    return CONFIG_FILE;
  }
}

export const configManager = new ConfigManager();
