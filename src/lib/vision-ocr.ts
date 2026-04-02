import * as fs from 'fs';
import { OpenAI } from 'openai';
import { configManager } from './config';
import { logger } from './logger';

export class VisionOCRProcessor {
  /** 将图片文件转为 base64 */
  private imageToBase64(imagePath: string): string {
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString('base64');
  }

  /** 去掉 Markdown 代码块包裹符号 */
  private stripCodeBlocks(content: string): string {
    return content.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  }

  /** 从文件路径判断 MIME 类型 */
  private getMimeType(imagePath: string): string {
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    return map[ext || ''] || 'image/png';
  }

  /**
   * 调用视觉模型识别图片中的文字，返回 Markdown 格式内容。
   * 数学公式使用 LaTeX 语法输出。
   */
  async imageToMarkdown(imagePath: string): Promise<string> {
    const apiUrl = configManager.get('visionApiUrl');
    const apiKey = configManager.get('visionApiKey');
    const model = configManager.get('visionModel');

    if (!apiUrl || !apiKey || !model) {
      throw new Error('视觉 OCR 配置不完整（visionApiUrl/visionApiKey/visionModel 必填）');
    }

    const base64Data = this.imageToBase64(imagePath);
    const mimeType = this.getMimeType(imagePath);

    const client = new OpenAI({ apiKey, baseURL: apiUrl });

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别这张数学题目图片中的所有文字内容，并使用 Markdown 格式输出。数学公式请使用 LaTeX 语法（用 $ 或 $$ 包裹）。只输出题目本身，不要输出答案。',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('视觉模型返回内容为空');
    }

    logger.log('verbose', '视觉 OCR 成功');
    return this.stripCodeBlocks(content.trim());
  }

  /**
   * 识别答案图片中的文字，忽略几何示意图、函数图像、坐标系图等。
   * 只转写选项、解析、点评等纯文字内容。
   */
  async answerToMarkdown(imagePath: string): Promise<string> {
    const apiUrl = configManager.get('visionApiUrl');
    const apiKey = configManager.get('visionApiKey');
    const model = configManager.get('visionModel');

    if (!apiUrl || !apiKey || !model) {
      throw new Error('视觉 OCR 配置不完整（visionApiUrl/visionApiKey/visionModel 必填）');
    }

    const base64Data = this.imageToBase64(imagePath);
    const mimeType = this.getMimeType(imagePath);

    const client = new OpenAI({ apiKey, baseURL: apiUrl });

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别这张图片中的所有文字内容，**忽略**所有几何示意图、函数图像、坐标系图、填充区域图等图形内容，只转写纯文字（如选项、答案编号、解析步骤、点评等）。使用 Markdown 格式输出。',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('视觉模型返回内容为空');
    }

    logger.log('verbose', '视觉 OCR（答案）成功');
    return this.stripCodeBlocks(content.trim());
  }
}

export const visionOCRProcessor = new VisionOCRProcessor();
