import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { browserManager } from './browser';
import { logger } from './logger';
import { ScrapeResult, ScrapeOptions, ScrapeMeta, ScrapeOutput } from '../types';
import { configManager } from './config';
import { findNodeById, loadKnowledgeTree } from './knowledge-tree';

interface QuestionTask {
  id: string;
  questionPath: string;
  answerSrc: string | null;
  answerPath: string;
  imagesSrc: string[];
  imagesPaths: string[];
  source?: string;
  questionType?: string;
  difficulty?: string;
  scoreRate?: number;
  knowledgeKeywords: string[];
  questionText?: string;
  answerText?: string;
}

export class ScraperEngine {
  private page: Page | null = null;

  async initialize(): Promise<void> {
    await browserManager.connect();
    this.page = await browserManager.getPage();
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeOutput> {
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
    const defaultOrder = order || configManager.get('order');

    const url = UrlBuilder.buildUrl(
      knowledge,
      { type, difficulty, year, multiCount, fillCount, page, order },
      grade as 'high' | 'middle',
      defaultOrder
    );

    // 构建顶层筛选条件（提前构建，无题目时也需返回）
    const gradeLabel = grade === 'high' ? '高中' : '初中';
    const tree = loadKnowledgeTree(gradeLabel);
    const node = findNodeById(tree, knowledge);
    const knowledgePoint = node?.name || knowledge;
    const meta: ScrapeMeta = {
      knowledgeId: knowledge,
      knowledgePoint,
      grade: gradeLabel,
      order: (order ? { latest: '最新', hot: '最热', comprehensive: '综合' }[order] : '最新') as string,
    };
    if (type) {
      const typeMap: Record<string, string> = { t1: '单选题', t2: '多选题', t3: '填空题', t4: '解答题', t5: '判断题', t6: '概念填空' };
      meta.type = typeMap[type] || type;
    }
    if (difficulty) {
      const diffMap: Record<string, string> = { d1: '容易', d2: '较易', d3: '适中', d4: '较难', d5: '困难' };
      meta.difficulty = diffMap[difficulty] || difficulty;
    }
    if (year !== undefined) meta.year = year;
    if (multiCount !== undefined) meta.multiCount = multiCount;
    if (fillCount !== undefined) meta.fillCount = fillCount;
    if (page !== undefined) meta.page = page;

    logger.log('quiet', `正在访问: ${url}`);
    await this.page!.setViewportSize({ width: 1920, height: 1080 });
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForTimeout(3000);

    const loggedIn = await browserManager.isLoggedIn();
    if (!loggedIn) {
      console.error('登录状态已失效，请重新运行 start 命令登录');
      await browserManager.shutdown();
      process.exit(1);
    }

    await this.scrollToLoadQuestions();

    const outputDir = path.resolve('./zujuan-output');

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
      return { options: meta, results: [] };
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
        let imagesSrc: string[] = [];
        const imagesPaths: string[] = [];
        
        imagesSrc = await handle.evaluate((el) => {
          const imgs = el.querySelectorAll('div.wrapper > div.exam-item__cnt > p img');
          const srcs: string[] = [];
        
          imgs.forEach((img) => {
            const imgEl = img as HTMLImageElement;
            const { src } = imgEl;
            if (src) {
              srcs.push(src);
              imgEl.setAttribute('hidden', '');
            }
          });
        
          return srcs;
        });
        
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

        // 提取题目额外信息：来源、题型、难度、得分率、知识点关键词
        const extraInfo: {
          source?: string;
          questionType?: string;
          difficulty?: string;
          scoreRate?: number;
          knowledgeKeywords: string[];
        } = { knowledgeKeywords: [] };
        await handle.evaluate((el) => {
          const additional = el.querySelector('div.ques-additional');
          if (!additional) return;

          // 来源：span.addi-msg > a
          const sourceAnchor = additional.querySelector('span.addi-msg > a');
          if (sourceAnchor) (window as any).__extra_source = sourceAnchor.getAttribute('title');

          // 题型、难度、得分率：div.left-msg > span.addi-info > span.info-cnt
          const leftMsg = additional.querySelector('div.msg-box > div.left-msg');
          if (leftMsg) {
            const infoCntSpans = leftMsg.querySelectorAll('span.addi-info > span.info-cnt');
            infoCntSpans.forEach((span) => {
              const text = span.textContent?.trim() || '';
              // 题型格式：包含"题型:"/"题类:"前缀，或直接是"填空题"/"解答题-问道题"等（共同点：含"题"字且无括号难度格式）
              if (text.includes('题型') || text.includes('题类') || (text.includes('题') && !text.includes('('))) {
                (window as any).__extra_qtype = text.split(':')[1]?.trim() || text;
              } else {
                // 难度(得分率)格式：文字(数字)，如"适中(0.68)"
                const match = text.match(/^(.+?)\(([0-9.]+)\)$/);
                if (match) {
                  (window as any).__extra_diff = match[1].trim();
                  (window as any).__extra_score = parseFloat(match[2]);
                }
              }
            });

            // 知识点关键词：div.knowledge-list-wrapper > div.knowledge-list > a
            const kwList = leftMsg.querySelectorAll('div.knowledge-list-wrapper > div.knowledge-list > a');
            const kw: string[] = [];
            kwList.forEach((a) => {
              const title = a.getAttribute('title');
              if (title) kw.push(title);
            });
            if (kw.length > 0) (window as any).__extra_kw = kw;
          }
        });
        extraInfo.source = await handle.evaluate(() => (window as any).__extra_source);
        extraInfo.questionType = await handle.evaluate(() => (window as any).__extra_qtype);
        extraInfo.difficulty = await handle.evaluate(() => (window as any).__extra_diff);
        extraInfo.scoreRate = await handle.evaluate(() => (window as any).__extra_score);
        extraInfo.knowledgeKeywords = await handle.evaluate(() => (window as any).__extra_kw || []);

        await handle.evaluate(() => {
          delete (window as any).__extra_source;
          delete (window as any).__extra_qtype;
          delete (window as any).__extra_diff;
          delete (window as any).__extra_score;
          delete (window as any).__extra_kw;
        });

        if (extraInfo.source || extraInfo.questionType || extraInfo.difficulty || extraInfo.knowledgeKeywords.length > 0) {
          logger.log('verbose', `第 ${i + 1}/${count}: 额外信息 — 来源:${extraInfo.source} 题型:${extraInfo.questionType} 难度:${extraInfo.difficulty} 得分率:${extraInfo.scoreRate} 关键词:${extraInfo.knowledgeKeywords.join(',')}`);
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

        tasks.push({
          id: taskId,
          questionPath,
          answerSrc,
          answerPath,
          imagesSrc,
          imagesPaths,
          source: extraInfo.source,
          questionType: extraInfo.questionType,
          difficulty: extraInfo.difficulty,
          scoreRate: extraInfo.scoreRate,
          knowledgeKeywords: extraInfo.knowledgeKeywords,
        });

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

    // 第四步：并行视觉 OCR（所有截图完成后一次性并发调用，不阻塞截图流程）
    if (configManager.get('visionEnabled')) {
      logger.log('verbose', '开始并行视觉 OCR...');
      const { visionOCRProcessor } = await import('./vision-ocr');
      const ocrPromises = tasks.map(async (t) => {
        try {
          t.questionText = await visionOCRProcessor.imageToMarkdown(t.questionPath);
          logger.log('verbose', `${t.id}: 题目视觉 OCR 完成`);
        } catch (error) {
          logger.log('normal', `${t.id}: 题目视觉 OCR 失败 — ${error}`);
        }

        if (t.answerSrc && fs.existsSync(t.answerPath)) {
          try {
            t.answerText = await visionOCRProcessor.answerToMarkdown(t.answerPath);
            logger.log('verbose', `${t.id}: 答案视觉 OCR 完成`);
          } catch (error) {
            logger.log('normal', `${t.id}: 答案视觉 OCR 失败 — ${error}`);
          }
        }
      });
      await Promise.all(ocrPromises);
    }

    // 第五步：构建结果
    const results: ScrapeResult[] = tasks.map((t) => ({
      id: t.id,
      questionPath: t.questionPath,
      answerPath: fs.existsSync(t.answerPath) ? t.answerPath : '',
      images: t.imagesPaths.filter(p => fs.existsSync(p)),
      ...(t.source ? { source: t.source } : {}),
      ...(t.questionType ? { questionType: t.questionType } : {}),
      ...(t.difficulty ? { difficulty: t.difficulty } : {}),
      ...(t.scoreRate !== undefined ? { scoreRate: t.scoreRate } : {}),
      ...(t.questionText ? { questionText: t.questionText } : {}),
      ...(t.answerText ? { answerText: t.answerText } : {}),
      knowledgeKeywords: t.knowledgeKeywords,
      timestamp: new Date().toISOString(),
    }));

    const output: ScrapeOutput = { options: meta, results };
    const jsonPath = path.join(outputDir, `results_${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
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
