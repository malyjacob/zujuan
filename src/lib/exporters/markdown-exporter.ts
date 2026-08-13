import * as fs from 'fs';
import * as path from 'path';
const archiver = require('archiver');
import { ScrapeResult, ScrapeMeta } from '../../types';

export class MarkdownExporter {
  /**
   * 生成单题 Markdown 文件，保存到同目录。
   * @param batchDir timestamp 目录（绝对路径）
   * @param result   单题结果
   * @param meta     抓取元信息
   */
  export(batchDir: string, result: ScrapeResult, meta: ScrapeMeta): string {
    const dir = path.join(batchDir, result.index);
    const mdPath = path.join(dir, 'index.md');
    const md = this.buildMarkdown(result, meta);
    fs.writeFileSync(mdPath, md, 'utf-8');
    return mdPath;
  }

  /**
   * 为单题打包 zip，保存到 batchDir。
   * @returns zip 文件绝对路径
   */
  async packZip(batchDir: string, result: ScrapeResult): Promise<string> {
    const dir = path.join(batchDir, result.index);
    const zipPath = path.join(batchDir, `${result.index}.zip`);
    const output = fs.createWriteStream(zipPath);

    return new Promise<string>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(zipPath));
      archive.on('error', reject);

      archive.pipe(output);

      // 打包 index.md 和同目录下所有图片
      const mdPath = path.join(dir, 'index.md');
      if (fs.existsSync(mdPath)) {
        archive.file(mdPath, { name: `${result.index}/index.md` });
      }

      for (const img of result.images) {
        const imgAbs = path.join(dir, path.basename(img));
        if (fs.existsSync(imgAbs)) {
          archive.file(imgAbs, { name: `${result.index}/${path.basename(img)}` });
        }
      }

      if (result.questionPath) {
        const qAbs = path.join(dir, path.basename(result.questionPath));
        if (fs.existsSync(qAbs)) {
          archive.file(qAbs, { name: `${result.index}/${path.basename(result.questionPath)}` });
        }
      }

      if (result.answerPath) {
        const aAbs = path.join(dir, path.basename(result.answerPath));
        if (fs.existsSync(aAbs)) {
          archive.file(aAbs, { name: `${result.index}/${path.basename(result.answerPath)}` });
        }
      }

      archive.finalize();
    });
  }

  private buildMarkdown(r: ScrapeResult, meta: ScrapeMeta): string {
    const frontmatter = [
      '---',
      `title: "第 ${r.index} 题"`,
      `knowledge: "${meta.knowledgePoint}"`,
      `grade: "${meta.grade}"`,
      r.source ? `source: "${this.escMd(r.source)}"` : null,
      r.questionType ? `type: "${this.escMd(r.questionType)}"` : null,
      r.difficulty ? `difficulty: "${this.escMd(r.difficulty)}"` : null,
      r.scoreRate !== undefined ? `scoreRate: ${r.scoreRate}` : null,
      `tags:`,
      ...r.knowledgeKeywords.map((kw: string) => `  - "${this.escMd(kw)}"`),
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const qText = r.questionText || '';

    const metaLines: string[] = [];
    if (r.questionType) metaLines.push(`- **题型:** ${r.questionType}`);
    if (r.difficulty) metaLines.push(`- **难度:** ${r.difficulty}`);
    if (r.scoreRate !== undefined) metaLines.push(`- **得分率:** ${r.scoreRate.toFixed(2)}`);

    const aText = r.answerText || '';

    const imgLines =
      r.images.length > 0
        ? r.images.map((img: string, i: number) => `![示例图${i + 1}](${path.basename(img)})`).join('\n')
        : '';

    return `${frontmatter}

## 题目

${r.source ? `> 来源：${r.source}` : ''}

${qText || '_（无题目文字，请查看下方截图）_'}

${imgLines}

${metaLines.length > 0 ? metaLines.join('\n') + '\n' : ''}
${r.knowledgeKeywords.length > 0 ? `**知识点:** ${r.knowledgeKeywords.join('、')}\n` : ''}
## 答案解析

${aText || '_（无答案解析）_'}

## 截图参考

题目截图：

${r.questionPath ? `![题目截图](${path.basename(r.questionPath)})` : '_（无题目截图）_'}

答案截图：

${r.answerPath ? `![答案截图](${path.basename(r.answerPath)})` : '_（无答案截图）_'}
`;
  }

  private escMd(str: string): string {
    return str.replace(/"/g, '\\"');
  }
}

export const markdownExporter = new MarkdownExporter();
