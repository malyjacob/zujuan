import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
      path.join(
        process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
        'Google\\Chrome\\Application\\chrome.exe'
      ),
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
