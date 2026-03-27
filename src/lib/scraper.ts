import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { browserManager } from './browser';
import { logger } from './logger';
import { ScrapeResult, ScrapeOptions } from '../types';
import { configManager } from './config';

interface QuestionTask {
  id: string;
  questionPath: string;
  answerSrc: string | null;
  answerPath: string;
  imagesSrc: string[];
  imagesPaths: string[];
}

export class ScraperEngine {
  private page: Page | null = null;

  async initialize(): Promise<void> {
    await browserManager.connect();
    this.page = await browserManager.getPage();
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeResult[]> {
    logger.setLevel(options.logLevel || 'quiet');
    await this.initialize();

    const {
      knowledge,
      type,
      difficulty,
      year,
      grade,
      order,
      limit = 10,
      multiCount,
      fillCount,
      page,
    } = options;

    const { UrlBuilder } = await import('./url-builder');
    const defaultOrder = order || configManager.get('defaultOrder');

    const url = UrlBuilder.buildUrl(
      knowledge,
      { type, difficulty, year, multiCount, fillCount, page, order },
      grade as 'high' | 'middle',
      defaultOrder
    );

    logger.log('quiet', `正在访问: ${url}`);
    await this.page!.setViewportSize({ width: 1920, height: 1080 });
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForTimeout(3000);

    await this.scrollToLoadQuestions();

    const outputDir = path.resolve(options.output || configManager.get('outputDir'));

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    logger.log('verbose', `页面标题: ${await this.page!.title()}`);

    const questionHandles = await this.page!.$$('div.tk-quest-item.quesroot');
    const totalQuestions = questionHandles.length;
    const count = Math.min(totalQuestions, limit);

    if (totalQuestions === 0) {
      const htmlPath = path.join(outputDir, `page_debug_${Date.now()}.html`);
      fs.writeFileSync(htmlPath, await this.page!.content(), 'utf-8');
      logger.log('normal', `页面已保存到: ${htmlPath}`);
      logger.log('normal', `未找到任何题目，请检查页面结构`);
      await browserManager.close();
      return [];
    }

    logger.log('normal', `共找到 ${totalQuestions} 个题目，准备抓取 ${count} 道`);

    // 第一步：逐题截图并收集答案 URL
    const tasks: QuestionTask[] = [];

    for (let i = 0; i < count; i++) {
      const taskId = `q_${Date.now()}_${i}`;
      const questionPath = path.join(outputDir, `${taskId}_question.png`);
      const answerPath = path.join(outputDir, `${taskId}_answer.png`);
      const handle = questionHandles[i];

      try {
        await handle.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));

        // 收集示例图 URL 并隐藏，不占位
        const imagesSrc: string[] = [];
        const imagesPaths: string[] = [];
        await handle.evaluate((el, _imagesSrc: string[]) => {
          const imgs = el.querySelectorAll('div.exam-item__cnt > p img');
          imgs.forEach((img) => {
            const src = (img as HTMLImageElement).src;
            if (src) {
              _imagesSrc.push(src);
              (img as HTMLImageElement).setAttribute('hidden', '');
            }
          });
        }, imagesSrc);
        if (imagesSrc.length > 0) {
          for (let j = 0; j < imagesSrc.length; j++) {
            imagesPaths.push(path.join(outputDir, `${taskId}_img_${j}.png`));
          }
          logger.log('verbose', `第 ${i + 1}/${count}: 检测到 ${imagesSrc.length} 张示例图，已隐藏`);
        }

        const cntHandle = await handle.$('div.exam-item__cnt');
        if (!cntHandle) {
          logger.log('normal', `第 ${i + 1} 题：找不到题目内容区，跳过`);
          continue;
        }
        await cntHandle.screenshot({ path: questionPath });
        logger.log('verbose', `第 ${i + 1}/${count}: 题目截图完成`);

        const wrapperHandle = await handle.$('div.wrapper.quesdiv');
        if (wrapperHandle) {
          await wrapperHandle.click();
        }

        let answerSrc: string | null = null;
        for (let attempt = 0; attempt < 15; attempt++) {
          await this.page!.waitForTimeout(100);
          answerSrc = await handle.evaluate((el) => {
            const img = el.querySelector('div.exam-item__opt > div.item.answer img');
            return (img as HTMLImageElement | null)?.src || null;
          });
          if (answerSrc) break;
        }

        tasks.push({ id: taskId, questionPath, answerSrc, answerPath, imagesSrc, imagesPaths });

        if (answerSrc) {
          logger.log('verbose', `第 ${i + 1}/${count}: 答案 URL 已收集`);
        } else {
          logger.log('normal', `第 ${i + 1}/${count}: 未找到答案图片`);
        }

      } catch (error) {
        logger.error(`第 ${i + 1} 题抓取失败:`, error);
        await this.page!.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await this.page!.waitForTimeout(500);
      }
    }

    // 第二步：并行下载所有答案图片
    logger.log('verbose', '开始并行下载答案图片...');
    await Promise.all(
      tasks
        .filter(t => t.answerSrc)
        .map(t => this.downloadImage(t.answerSrc!, t.answerPath))
    );

    // 第三步：并行下载所有示例图
    logger.log('verbose', '开始并行下载示例图...');
    const imageDownloadPromises: Promise<void>[] = [];
    for (const t of tasks) {
      for (let j = 0; j < t.imagesSrc.length; j++) {
        imageDownloadPromises.push(this.downloadImage(t.imagesSrc[j], t.imagesPaths[j]));
      }
    }
    await Promise.all(imageDownloadPromises);

    // 第四步：构建结果
    const results: ScrapeResult[] = tasks.map((t) => ({
      id: t.id,
      questionPath: t.questionPath,
      answerPath: fs.existsSync(t.answerPath) ? t.answerPath : '',
      images: t.imagesPaths.filter(p => fs.existsSync(p)),
      timestamp: new Date().toISOString(),
    }));

    const jsonPath = path.join(outputDir, `results_${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
    logger.log('quiet', `结果已保存到: ${jsonPath}`);

    await browserManager.close();
    process.exit(0);
  }

  private async scrollToLoadQuestions(): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.page.waitForTimeout(1000);
    }

    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await this.page.waitForTimeout(500);
  }

  private async downloadImage(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.downloadImage(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          fs.writeFileSync(destPath, Buffer.concat(chunks));
          resolve();
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}

export const scraperEngine = new ScraperEngine();
