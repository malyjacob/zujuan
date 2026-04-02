import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { ScrapeOutput, ExportTheme } from '../types';
import { configManager } from '../lib/config';
import { htmlExporter } from '../lib/exporters/html-exporter';
import { markdownExporter } from '../lib/exporters/markdown-exporter';

function resolveBatchDir(target?: string): string | null {
  const outputDir = path.resolve('./zujuan-output');

  if (target) {
    const abs = path.isAbsolute(target) ? target : path.resolve(target);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      if (fs.existsSync(path.join(abs, 'results.json'))) return abs;
    }
    const candidate = path.join(outputDir, target);
    if (fs.existsSync(candidate)) return candidate;
    return null;
  }

  if (!fs.existsSync(outputDir)) return null;
  const entries = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, mtime: fs.statSync(path.join(outputDir, e.name)).mtimeMs }))
    .filter(e => !isNaN(parseInt(e.name)))
    .sort((a, b) => b.mtime - a.mtime);

  if (entries.length === 0) return null;
  return path.join(outputDir, entries[0].name);
}

function loadOutput(batchDir: string): ScrapeOutput | null {
  const jsonPath = path.join(batchDir, 'results.json');
  if (!fs.existsSync(jsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ScrapeOutput;
  } catch {
    return null;
  }
}

export function createExportCommand(): Command {
  const command = new Command('export');

  command
    .description('将抓取结果导出为 HTML 或 Markdown 文档')
    .argument('[timestamp]', '抓取结果目录（timestamp），省略时自动查找最新的目录')
    .option('--format <formats>', '导出格式: html / markdown / both（逗号分隔，默认使用配置或 headless 推导）')
    .option('--theme <theme>', '导出主题: light(白底) / dark(深色) / sepia(米黄)，默认使用配置或 light')
    .action(async (timestamp: string | undefined, options: { format?: string; theme?: string }) => {
      const batchDir = resolveBatchDir(timestamp);
      if (!batchDir) {
        console.error('未找到抓取结果目录，请先运行 scrape 命令');
        process.exit(1);
      }

      const output = loadOutput(batchDir);
      if (!output) {
        console.error(`目录 ${batchDir} 中没有找到 results.json`);
        process.exit(1);
      }

      // 解析 format：命令行 > config > 默认 both
      let fmt: 'html' | 'markdown' | 'both' = 'both';
      if (options.format) {
        const parts = (options.format as string).split(',').map(s => s.trim());
        if (parts.includes('html') && parts.includes('markdown')) {
          fmt = 'both';
        } else if (parts.includes('markdown')) {
          fmt = 'markdown';
        } else if (parts.includes('both')) {
          fmt = 'both';
        } else if (parts.includes('html')) {
          fmt = 'html';
        }
      } else {
        const cfgFmt = configManager.get('exportFormat');
        if (cfgFmt) {
          fmt = cfgFmt;
        }
      }

      // 解析 theme：命令行 > 默认 light
      const theme: ExportTheme = (['dark', 'sepia'].includes(options.theme as string) ? options.theme : 'light') as ExportTheme;

      console.log(`输出目录: ${batchDir}`);
      console.log(`导出格式: ${fmt}`);
      console.log(`导出主题: ${theme}`);
      console.log(`题目数量: ${output.results.length}`);

      const { options: meta, results } = output;
      let htmlCount = 0, mdCount = 0, zipCount = 0;

      for (const result of results) {
        if (fmt === 'html' || fmt === 'both') {
          htmlExporter.export(batchDir, result, theme);
          console.log(`  ✓ ${result.index}/index.html`);
          htmlCount++;
        }

        if (fmt === 'markdown' || fmt === 'both') {
          markdownExporter.export(batchDir, result, meta);
          console.log(`  ✓ ${result.index}/index.md`);
          try {
            await markdownExporter.packZip(batchDir, result);
            console.log(`  ✓ ${result.index}.zip`);
            zipCount++;
          } catch (err) {
            console.error(`  ✗ ${result.index}.zip 打包失败: ${err}`);
          }
          mdCount++;
        }
      }

      console.log(`\n完成: 生成 ${htmlCount} 个 HTML，${mdCount} 个 Markdown，${zipCount} 个 ZIP`);
    });

  return command;
}
