import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { browserManager } from './browser';
import { ocrProcessor } from './ocr';
import { ScrapeResult, ScrapeOptions } from '../types';
import { configManager } from './config';

export class ScraperEngine {
  private page: Page | null = null;

  async initialize(): Promise<void> {
    // 使用连接模式连接到已运行的浏览器
    await browserManager.connect();
    this.page = await browserManager.getPage();
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeResult[]> {
    await this.initialize();

    const {
      knowledge,
      type,
      difficulty,
      year,
      grade,
      limit = 10,
      multiCount,
      fillCount,
      page,
    } = options;

    // 导入 UrlBuilder
    const { UrlBuilder } = await import('./url-builder');
    // 从配置获取年级类型
    const gradeType = configManager.get('defaultGrade') || 'high';

    const url = UrlBuilder.buildUrl(
      knowledge,
      { type, difficulty, year, grade, multiCount, fillCount, page },
      gradeType as 'high' | 'middle'
    );

    console.log(`正在访问: ${url}`);
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });

    // 等待页面加载
    await this.page!.waitForTimeout(3000);

    // 滚动加载更多题目
    await this.scrollToLoadQuestions();

    // 获取题目列表
    const questions = await this.getQuestionSelectors();

    const results: ScrapeResult[] = [];
    const outputDir = path.resolve(options.output || configManager.get('outputDir'));

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`页面标题: ${await this.page!.title()}`);
    console.log(`找到 ${questions.length} 个题目元素`);

    if (questions.length === 0) {
      // 保存页面源码用于调试
      const htmlPath = path.join(outputDir, `page_debug_${Date.now()}.html`);
      const content = await this.page!.content();
      fs.writeFileSync(htmlPath, content, 'utf-8');
      console.log(`页面已保存到: ${htmlPath}`);
      console.log(`请检查页面结构，更新选择器`);
    }

    const count = Math.min(questions.length, limit);

    for (let i = 0; i < count; i++) {
      const questionId = `q_${Date.now()}_${i}`;
      const questionPath = path.join(outputDir, `${questionId}_question.png`);
      const answerPath = path.join(outputDir, `${questionId}_answer.png`);

      try {
        // 点击展开答案
        await questions[i].click();
        await this.page!.waitForTimeout(500);

        // 截图题目
        await questions[i].screenshot({
          path: questionPath,
        });

        // 查找对应的答案元素 (exam-item__opt)
        const questItem = await questions[i].$('..'); // 父元素
        const answerElement = questItem ? await questItem.$('div.exam-item__opt') : null;

        if (answerElement) {
          // 截图答案
          await answerElement.screenshot({
            path: answerPath,
          });
          console.log(`已抓取 ${i + 1}/${count}: ${questionId} (题目+答案)`);
        } else {
          console.log(`已抓取 ${i + 1}/${count}: ${questionId} (仅题目，未找到答案)`);
        }

        // OCR 识别题目
        const questionText = await ocrProcessor.screenshotToTextFromBuffer(
          fs.readFileSync(questionPath)
        );

        // OCR 识别答案（如果有）
        let answerText = '';
        if (answerElement && fs.existsSync(answerPath)) {
          answerText = await ocrProcessor.screenshotToTextFromBuffer(
            fs.readFileSync(answerPath)
          );
        }

        results.push({
          id: questionId,
          questionPath,
          answerPath,
          questionText,
          answerText,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error(`抓取题目 ${i + 1} 失败:`, error);
      }
    }

    // 保存结果到 JSON
    const jsonPath = path.join(outputDir, `results_${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`结果已保存到: ${jsonPath}`);

    // 关闭连接（不关闭浏览器进程）
    await browserManager.close();

    return results;
  }

  private async scrollToLoadQuestions(): Promise<void> {
    if (!this.page) return;

    // 滚动到底部加载更多
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await this.page.waitForTimeout(1000);

    // 多次滚动以确保所有题目加载
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await this.page.waitForTimeout(800);
    }
  }

  private async getQuestionSelectors(): Promise<any[]> {
    if (!this.page) return [];

    // 组卷网的题目选择器
    // 题目列表: section.test-list
    // 每道题: div.quest-item > div.wrapper.quesdiv > div.exam-item__cnt
    const selectors = [
      'div.exam-item__cnt',
      'section.test-list div.quest-item div.exam-item__cnt',
      'section.test-list div.quest-item',
    ];

    for (const selector of selectors) {
      const elements = await this.page.$$(selector);
      if (elements.length > 0) {
        console.log(`找到 ${elements.length} 个题目 (${selector})`);
        return elements;
      }
    }

    // 默认返回空数组
    return [];
  }
}

export const scraperEngine = new ScraperEngine();
