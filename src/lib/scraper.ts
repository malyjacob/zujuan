import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { browserManager, BrowserManager } from './browser';
import { logger } from './logger';
import { LoginExpiredError } from './errors';
import { ScrapeResult, ScrapeOptions, ScrapeMeta, ScrapeOutput } from '../types';
import { configManager, ConfigManager } from './config';
import { getNodeById, ensureDatabase } from './knowledge-tree-sqlite';
import { QUESTION_TYPE_NAMES, DIFFICULTY_NAMES, ORDER_NAMES } from './mappings';
import { UrlBuilder } from './url-builder';
import { visionOCRProcessor, VisionOCRProcessor } from './vision-ocr';

/** 组卷网页面结构选择器（集中管理，站点改版时只需改这里） */
const SELECTORS = {
  questionItem: 'div.tk-quest-item.quesroot',
  questionContent: 'div.exam-item__cnt',
  answerWrapper: 'div.wrapper.quesdiv',
  answerImage: 'div.exam-item__opt > div.item.answer img',
  additional: 'div.ques-additional',
  sourceAnchor: 'span.addi-msg > a',
  leftMsg: 'div.msg-box > div.left-msg',
  infoCntSpans: 'span.addi-info > span.info-cnt',
  knowledgeList: 'div.knowledge-list-wrapper > div.knowledge-list > a',
  quotaMessage: 'div.quota-instuff p',
  exampleImages: 'div.wrapper > div.exam-item__cnt > p img',
} as const;

/** 可注入依赖（便于测试替身；生产环境用文件底部的单例组合） */
export interface ScraperDeps {
  browser: Pick<BrowserManager, 'connect' | 'getPage' | 'isLoggedIn' | 'shutdown' | 'close'>;
  config: ConfigManager;
  visionOcr: VisionOCRProcessor;
}

/** 图片下载并发上限（避免一次性打满站点触发限流） */
const DOWNLOAD_CONCURRENCY = 4;

interface QuestionTask {
  id: string;
  index: string;
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
  private readonly browser: ScraperDeps['browser'];
  private readonly config: ScraperDeps['config'];
  private readonly visionOcr: ScraperDeps['visionOcr'];

  constructor(deps: ScraperDeps) {
    this.browser = deps.browser;
    this.config = deps.config;
    this.visionOcr = deps.visionOcr;
  }

  async initialize(): Promise<void> {
    await this.browser.connect();
    this.page = await this.browser.getPage();
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeOutput> {
    logger.setLevel(options.logLevel || 'quiet');
    await this.initialize();

    const { knowledge, type, difficulty, year, grade, order, limit = 10, multiCount, fillCount, page } = options;

    const defaultOrder = order || this.config.get('order');

    const url = UrlBuilder.buildUrl(
      knowledge,
      { type, difficulty, year, multiCount, fillCount, page, order },
      grade as 'high' | 'middle',
      defaultOrder
    );

    // 构建顶层筛选条件（提前构建，无题目时也需返回）
    ensureDatabase();
    const node = getNodeById(knowledge, grade as 'high' | 'middle');
    const knowledgePoint = node?.name || knowledge;
    const meta: ScrapeMeta = {
      timestamp: '',
      knowledgeId: knowledge,
      knowledgePoint,
      grade: grade as string,
      order: order ? ORDER_NAMES[order] : ORDER_NAMES.latest,
    };
    if (type) {
      meta.type = QUESTION_TYPE_NAMES[type] || type;
    }
    if (difficulty) {
      meta.difficulty = DIFFICULTY_NAMES[difficulty] || difficulty;
    }
    if (year !== undefined) meta.year = year;
    if (multiCount !== undefined) meta.multiCount = multiCount;
    if (fillCount !== undefined) meta.fillCount = fillCount;
    if (page !== undefined) meta.page = page;

    logger.log('quiet', `正在访问: ${url}`);
    await this.page!.setViewportSize({ width: 1920, height: 1080 });
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForTimeout(3000);

    const loggedIn = await this.browser.isLoggedIn();
    if (!loggedIn) {
      await this.browser.shutdown();
      throw new LoginExpiredError();
    }

    await this.scrollToLoadQuestions();

    const outputDir = path.resolve(this.config.get('outputDir'));
    const timestamp = Date.now().toString();
    const batchDir = path.join(outputDir, timestamp);
    meta.timestamp = timestamp;

    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    logger.log('verbose', `页面标题: ${await this.page!.title()}`);

    const questionHandles = await this.page!.$$(SELECTORS.questionItem);
    const totalQuestions = questionHandles.length;
    const count = Math.min(totalQuestions, limit);

    if (totalQuestions === 0) {
      const htmlPath = path.join(batchDir, `page_debug.html`);
      fs.writeFileSync(htmlPath, await this.page!.content(), 'utf-8');
      logger.log('normal', `页面已保存到: ${htmlPath}`);
      logger.log('normal', `未找到任何题目，请检查页面结构`);
      await this.browser.close();
      return { options: meta, results: [] };
    }

    logger.log('normal', `共找到 ${totalQuestions} 个题目，准备抓取 ${count} 道`);
    logger.log('quiet', `输出目录: ${batchDir}`);

    // 第一步：逐题截图并收集答案 URL
    const tasks: QuestionTask[] = [];
    let quotaHitCount = 0;

    for (let i = 0; i < count; i++) {
      const indexStr = (i + 1).toString().padStart(3, '0');
      const questionDir = path.join(batchDir, indexStr);
      if (!fs.existsSync(questionDir)) {
        fs.mkdirSync(questionDir, { recursive: true });
      }

      const taskId = `q_${timestamp}_${i}`;
      const questionPath = path.join(questionDir, 'question.png');
      const answerPath = path.join(questionDir, 'answer.png');
      const handle = questionHandles[i];

      try {
        await handle.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'start' }));

        // 收集示例图 URL 并隐藏，不占位
        let imagesSrc: string[] = [];
        const imagesPaths: string[] = [];

        imagesSrc = await handle.evaluate((el, sel) => {
          const imgs = el.querySelectorAll(sel);
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
        }, SELECTORS.exampleImages);

        if (imagesSrc.length > 0) {
          for (let j = 0; j < imagesSrc.length; j++) {
            imagesPaths.push(path.join(questionDir, `img_${j}.png`));
          }
          logger.log('verbose', `第 ${i + 1}/${count}: 检测到 ${imagesSrc.length} 张示例图，已隐藏`);
        }

        const cntHandle = await handle.$(SELECTORS.questionContent);
        if (!cntHandle) {
          logger.log('normal', `第 ${i + 1} 题：找不到题目内容区，跳过`);
          continue;
        }

        // 提取题目额外信息：来源、题型、难度、得分率、知识点关键词
        // 单次 evaluate 直接返回对象，不借助 window 全局变量（evaluate 内部用 null 表示缺失，
        // 返回后统一映射回 undefined，与旧实现语义完全一致）
        const rawExtra = await handle.evaluate((el, sel) => {
          const result: {
            source: string | null;
            questionType: string | null;
            difficulty: string | null;
            scoreRate: number | null;
            knowledgeKeywords: string[];
          } = {
            source: null,
            questionType: null,
            difficulty: null,
            scoreRate: null,
            knowledgeKeywords: [],
          };
          const additional = el.querySelector(sel.additional);
          if (!additional) return result;

          // 来源：span.addi-msg > a
          const sourceAnchor = additional.querySelector(sel.sourceAnchor);
          if (sourceAnchor) result.source = sourceAnchor.getAttribute('title');

          // 题型、难度、得分率：div.left-msg > span.addi-info > span.info-cnt
          const leftMsg = additional.querySelector(sel.leftMsg);
          if (leftMsg) {
            const infoCntSpans = leftMsg.querySelectorAll(sel.infoCntSpans);
            infoCntSpans.forEach((span) => {
              const text = span.textContent?.trim() || '';
              // 题型格式：包含"题型:"/"题类:"前缀，或直接是"填空题"/"解答题-问道题"等（共同点：含"题"字且无括号难度格式）
              if (text.includes('题型') || text.includes('题类') || (text.includes('题') && !text.includes('('))) {
                result.questionType = text.split(':')[1]?.trim() || text;
              } else {
                // 难度(得分率)格式：文字(数字)，如"适中(0.68)"
                const match = text.match(/^(.+?)\(([0-9.]+)\)$/);
                if (match) {
                  result.difficulty = match[1].trim();
                  result.scoreRate = parseFloat(match[2]);
                }
              }
            });

            // 知识点关键词：div.knowledge-list-wrapper > div.knowledge-list > a
            const kwList = leftMsg.querySelectorAll(sel.knowledgeList);
            kwList.forEach((a) => {
              const title = a.getAttribute('title');
              if (title) result.knowledgeKeywords.push(title);
            });
          }
          return result;
        }, SELECTORS);

        // null → undefined：保持 downstream 真值判断与 results.json 字段与旧实现一致
        const extraInfo: {
          source?: string;
          questionType?: string;
          difficulty?: string;
          scoreRate?: number;
          knowledgeKeywords: string[];
        } = {
          source: rawExtra.source ?? undefined,
          questionType: rawExtra.questionType ?? undefined,
          difficulty: rawExtra.difficulty ?? undefined,
          scoreRate: rawExtra.scoreRate ?? undefined,
          knowledgeKeywords: rawExtra.knowledgeKeywords,
        };

        if (
          extraInfo.source ||
          extraInfo.questionType ||
          extraInfo.difficulty ||
          extraInfo.knowledgeKeywords.length > 0
        ) {
          logger.log(
            'verbose',
            `第 ${i + 1}/${count}: 额外信息 — 来源:${extraInfo.source} 题型:${extraInfo.questionType} 难度:${extraInfo.difficulty} 得分率:${extraInfo.scoreRate} 关键词:${extraInfo.knowledgeKeywords.join(',')}`
          );
        }

        await cntHandle.scrollIntoViewIfNeeded();
        await this.page!.waitForTimeout(120);
        await cntHandle.screenshot({ path: questionPath });
        logger.log('verbose', `第 ${i + 1}/${count}: 题目截图完成`);

        const wrapperHandle = await handle.$(SELECTORS.answerWrapper);
        if (wrapperHandle) {
          await wrapperHandle.click();
        }

        let answerSrc: string | null = null;
        for (let attempt = 0; attempt < 15; attempt++) {
          await this.page!.waitForTimeout(100);
          answerSrc = await handle.evaluate((el, sel) => {
            const img = el.querySelector(sel);
            return (img as HTMLImageElement | null)?.src || null;
          }, SELECTORS.answerImage);
          if (answerSrc) break;
        }

        tasks.push({
          id: taskId,
          index: indexStr,
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
          // 检测答案不可用的原因
          const reason = await handle.evaluate((_el, sel) => {
            const msg = document.querySelector(sel);
            if (msg) return msg.textContent?.trim() || '';
            return '';
          }, SELECTORS.quotaMessage);
          if (reason.includes('每日最多')) {
            quotaHitCount++;
            if (quotaHitCount === 1) {
              logger.log('normal', '');
              logger.log('normal', '========================================');
              logger.log('normal', '  答案查看已达每日限额（免费用户每日30道）');
              logger.log('normal', '  请明日再试，或升级会员 / 申请体验');
              logger.log('normal', '========================================');
              logger.log('normal', '');
            }
            logger.log('normal', `第 ${i + 1}/${count}: 答案被限流 — ${reason}`);
          } else {
            logger.log('normal', `第 ${i + 1}/${count}: 未找到答案图片`);
          }
        }
      } catch (error) {
        logger.error(`第 ${i + 1} 题抓取失败:`, error);
        await this.page!.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await this.page!.waitForTimeout(500);
      }
    }

    // 第二步：分批并行下载所有答案图片（限流，避免打满站点触发限流）
    logger.log('verbose', '开始并行下载答案图片...');

    // 注意：答案图片的 URL 已内置认证 token（enVqdWFu 参数），无需额外传 cookies
    const answerItems = tasks.filter((t) => t.answerSrc).map((t) => ({ src: t.answerSrc!, dest: t.answerPath }));
    const answerFailCount = await this.downloadBatch(answerItems);
    if (answerFailCount > 0) {
      logger.log('normal', `答案图片下载: ${answerItems.length - answerFailCount} 成功, ${answerFailCount} 失败`);
    }

    // 第三步：分批并行下载所有示例图（限流）
    if (tasks.some((t) => t.imagesSrc.length > 0)) {
      logger.log('verbose', '开始并行下载示例图...');
      const exampleItems = tasks.flatMap((t) => t.imagesSrc.map((src, j) => ({ src, dest: t.imagesPaths[j] })));
      await this.downloadBatch(exampleItems);
    }

    // 第四步：并行视觉 OCR（所有截图完成后一次性并发调用，不阻塞截图流程）
    // 120s 全局超时通过 AbortSignal 真正取消底层请求（不再依赖进程退出兜底）
    if (this.config.get('visionEnabled')) {
      logger.log('verbose', '开始并行视觉 OCR...');
      const controller = new AbortController();
      const globalTimer = setTimeout(() => {
        logger.log('normal', '全局 OCR 超时（120s），取消剩余任务');
        controller.abort();
      }, 120_000);

      const isAbort = (error: unknown): boolean => {
        const name = (error as Error)?.name || '';
        return name === 'AbortError' || name === 'APIUserAbortError';
      };

      const ocrPromises = tasks.map(async (t) => {
        try {
          t.questionText = await this.visionOcr.imageToMarkdown(t.questionPath, { signal: controller.signal });
          logger.log('verbose', `${t.id}: 题目视觉 OCR 完成`);
        } catch (error) {
          if (isAbort(error)) {
            logger.log('normal', `${t.id}: 题目视觉 OCR 已取消`);
          } else {
            logger.log('normal', `${t.id}: 题目视觉 OCR 失败 — ${error}`);
          }
        }

        if (t.answerSrc && fs.existsSync(t.answerPath)) {
          try {
            t.answerText = await this.visionOcr.answerToMarkdown(t.answerPath, { signal: controller.signal });
            logger.log('verbose', `${t.id}: 答案视觉 OCR 完成`);
          } catch (error) {
            if (isAbort(error)) {
              logger.log('normal', `${t.id}: 答案视觉 OCR 已取消`);
            } else {
              logger.log('normal', `${t.id}: 答案视觉 OCR 失败 — ${error}`);
            }
          }
        }
      });

      try {
        await Promise.all(ocrPromises);
      } finally {
        clearTimeout(globalTimer);
      }
    }

    // 第五步：构建结果
    const results: ScrapeResult[] = tasks.map((t) => ({
      id: t.id,
      index: t.index,
      questionPath: path.join(t.index, 'question.png'),
      answerPath: fs.existsSync(t.answerPath) ? path.join(t.index, 'answer.png') : '',
      images: t.imagesPaths.filter((p) => fs.existsSync(p)).map((p) => path.join(t.index, path.basename(p))),
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
    const jsonPath = path.join(batchDir, 'results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
    logger.log('quiet', `结果已保存到: ${jsonPath}`);

    if (quotaHitCount > 0) {
      logger.log('normal', `注意：本次有 ${quotaHitCount} 道题答案因每日限额无法查看（免费用户每日30道）`);
    }

    await this.browser.close();
    return output;
  }

  /** 滚动触发懒加载：直到页面高度不再变化（或达上限 10 轮）才停止 */
  private async scrollToLoadQuestions(): Promise<void> {
    if (!this.page) return;

    const MAX_ROUNDS = 10;
    let lastHeight = 0;

    for (let i = 0; i < MAX_ROUNDS; i++) {
      const height = await this.page.evaluate(() => document.body.scrollHeight);
      if (i > 0 && height === lastHeight) {
        break; // 高度不再变化 → 懒加载完成
      }
      lastHeight = height;
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

  private async downloadImage(url: string, destPath: string, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this._downloadSingle(url, destPath);
        return;
      } catch (error) {
        if (attempt < retries) {
          const delay = attempt * 1000;
          logger.log('verbose', `下载失败 (${url}), 第 ${attempt}/${retries} 次重试, 等待 ${delay}ms: ${error}`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          logger.log('normal', `下载失败 (${url}), 已重试 ${retries} 次: ${error}`);
          throw error;
        }
      }
    }
  }

  /** 分批限流下载：每批 DOWNLOAD_CONCURRENCY 个并发，返回失败数量 */
  private async downloadBatch(
    items: { src: string; dest: string }[],
    concurrency = DOWNLOAD_CONCURRENCY
  ): Promise<number> {
    let failed = 0;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map((item) => this.downloadImage(item.src, item.dest, 3)));
      failed += results.filter((r) => r.status === 'rejected').length;
    }
    return failed;
  }

  /**
   * 注意：答案图片 URL 本身已在查询参数中携带认证信息
   * （enVqdWFu=base64... 包含 userId 和 user_token），
   * 因此不需要额外传 cookies。传 cookies 反而可能因
   * 某些 cookie 含非 ASCII 字符导致 ERR_INVALID_CHAR 错误。
   */
  private _downloadSingle(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Referer: 'https://zujuan.xkw.com/',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      };

      const req = client.get(url, { headers, timeout: 30_000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this._downloadSingle(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          if (chunks.length === 0) {
            reject(new Error('下载内容为空'));
            return;
          }
          fs.writeFileSync(destPath, Buffer.concat(chunks));
          resolve();
        });
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求超时 (30s)'));
      });
      req.on('error', reject);
    });
  }
}

/** 生产环境组合：模块级单例（测试可自行 new ScraperEngine 注入替身） */
export const scraperEngine = new ScraperEngine({
  browser: browserManager,
  config: configManager,
  visionOcr: visionOCRProcessor,
});
