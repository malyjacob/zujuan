import { Command } from 'commander';
import * as path from 'path';
import { scraperEngine } from '../lib/scraper';
import { configManager } from '../lib/config';
import { logger } from '../lib/logger';
import { htmlExporter } from '../lib/exporters/html-exporter';
import { markdownExporter } from '../lib/exporters/markdown-exporter';
import {
  ScrapeOptions,
  QuestionType,
  Difficulty,
  Year,
  Grade,
  Order,
  LogLevel,
  ScrapeOutput,
  ExportTheme,
} from '../types';

export function createScrapeCommand(): Command {
  const command = new Command('scrape');

  command
    .description('抓取题目')
    .requiredOption('-k, --knowledge <id>', '知识点节点ID（必填）')
    .option('-t, --type <type>', '题型: t1=单选 t2=多选 t3=填空 t4=解答 t5=判断 t6=概念填空')
    .option('-d, --difficulty <level>', '难度: d1=容易 d2=较易 d3=适中 d4=较难 d5=困难')
    .option('-y, --year <year>', '年份: 2026/2025/2024/2023/-1（-1表示更早）')
    .option('-g, --grade <grade>', '年级: high=高中 middle=初中（默认: 配置中的 grade）')
    .option('-r, --order <order>', '排序: latest=最新 hot=最热 comprehensive=综合（默认: 配置中的 order）')
    .option('-l, --limit <number>', '最大抓取截图数量（1-10，默认10）', '10')
    .option('-mc, --multi-count <number>', '多选题答案数量: 2, 3, 4及以上')
    .option('-fc, --fill-count <number>', '填空题空数: 1, 2, 3及以上')
    .option('-p, --page <number>', '分页页码（默认1，第二页起为o2p2格式）')
    .option('-ll, --log-level <level>', '日志级别: quiet=纯净 normal=普通 verbose=详细（默认: quiet）')
    .option('-e, --export', '抓取完成后导出为 HTML 或 Markdown 文档')
    .option('--format <formats>', '导出格式: html / markdown / both（逗号分隔，默认使用配置或 headless 推导）')
    .option('--theme <theme>', '导出主题: light(白底) / dark(深色) / sepia(米黄)，默认使用配置或 light')
    .action(async (options) => {
      const limit = Math.min(10, Math.max(1, parseInt(options.limit) || 10));
      // 年级：命令行指定优先，否则使用配置默认值
      const grade = (options.grade as Grade) || configManager.get('grade');
      // 排序：命令行指定优先，否则使用配置默认值
      const order = (options.order as Order) || configManager.get('order');

      const scrapeOptions: ScrapeOptions = {
        knowledge: options.knowledge,
        type: options.type as QuestionType | undefined,
        difficulty: options.difficulty as Difficulty | undefined,
        year: options.year ? parseInt(options.year) as Year : undefined,
        grade,
        order,
        limit,
        multiCount: options.multiCount ? parseInt(options.multiCount) : undefined,
        fillCount: options.fillCount ? parseInt(options.fillCount) : undefined,
        page: options.page ? parseInt(options.page) : undefined,
        logLevel: (options.logLevel || configManager.get('logLevel')) as LogLevel,
      };

      const gradeName = grade === 'high' ? '高中' : '初中';
      const orderName = { latest: '最新', hot: '最热', comprehensive: '综合' }[order];

      const logLevel = scrapeOptions.logLevel || 'quiet';
      logger.setLevel(logLevel);

      logger.log('normal', '开始抓取题目...');
      logger.log('normal', `知识点: ${scrapeOptions.knowledge}`);
      logger.log('normal', `年级: ${gradeName}`);
      logger.log('normal', `排序: ${orderName}`);
      if (scrapeOptions.type) logger.log('normal', `题型: ${scrapeOptions.type}`);
      if (scrapeOptions.difficulty) logger.log('normal', `难度: ${scrapeOptions.difficulty}`);
      if (scrapeOptions.year) logger.log('normal', `年份: ${scrapeOptions.year}`);
      if (scrapeOptions.page) logger.log('normal', `分页: ${scrapeOptions.page}`);
      logger.log('normal', `限制数量: ${scrapeOptions.limit}`);

      try {
        const output = await scraperEngine.scrape(scrapeOptions);
        logger.log('normal', `抓取完成，共 ${output.results.length} 道题目`);

        if (options.export && output.results.length > 0) {
          await runExport(output, options);
        }

        process.exit(0);
      } catch (error) {
        logger.error('抓取失败:', error);
        process.exit(1);
      }
    });

  return command;

  /** 根据参数/配置决定导出格式和主题，并执行 */
  async function runExport(output: ScrapeOutput, opts: { format?: string; theme?: string }): Promise<void> {
    // format：命令行 > config > 默认 both
    let fmt: 'html' | 'markdown' | 'both' = 'both';
    if (opts.format) {
      const parts = (opts.format as string).split(',').map(s => s.trim());
      if (parts.includes('html') && parts.includes('markdown')) {
        fmt = 'both';
      } else if (parts.includes('markdown')) {
        fmt = 'markdown';
      } else if (parts.includes('both')) {
        fmt = 'both';
      }
    } else {
      const cfgFmt = configManager.get('exportFormat');
      if (cfgFmt) {
        fmt = cfgFmt;
      }
    }

    // theme：命令行 > 默认 light
    const theme: ExportTheme = (['dark', 'sepia'].includes(opts.theme as string) ? opts.theme : 'light') as ExportTheme;

    const batchDir = path.resolve('./zujuan-output', output.options.timestamp);
    const { options: meta, results } = output;

    let htmlCount = 0, mdCount = 0, zipCount = 0;

    // 建立索引映射，便于确定上下题
    const indexMap = results.map(r => r.index);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const prevIndex = i > 0 ? indexMap[i - 1] : undefined;
      const nextIndex = i < results.length - 1 ? indexMap[i + 1] : undefined;

      if (fmt === 'html' || fmt === 'both') {
        htmlExporter.export(batchDir, result, theme, prevIndex, nextIndex);
        logger.log('normal', `  ✓ ${result.index}/index.html`);
        htmlCount++;
      }
      if (fmt === 'markdown' || fmt === 'both') {
        markdownExporter.export(batchDir, result, meta);
        logger.log('normal', `  ✓ ${result.index}/index.md`);
        mdCount++;
        try {
          await markdownExporter.packZip(batchDir, result);
          logger.log('normal', `  ✓ ${result.index}.zip`);
          zipCount++;
        } catch (err) {
          logger.error(`  ✗ ${result.index}.zip 打包失败:`, err);
        }
      }
    }

    // 生成总览页
    if (fmt === 'html' || fmt === 'both') {
      htmlExporter.exportOverview(batchDir, results, meta, theme);
      logger.log('normal', `  ✓ index.html (总览)`);
    }

    logger.log('normal', `导出完成: ${htmlCount} HTML, ${mdCount} Markdown, ${zipCount} ZIP`);
  }
}
