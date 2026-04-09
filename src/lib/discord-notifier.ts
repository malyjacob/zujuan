import * as fs from 'fs';
import { configManager } from './config';

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  footer?: { text: string };
}

interface DiscordPayload {
  username?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

/** 发送二维码到 Discord Webhook（静默失败，不阻塞主流程） */
export async function sendQrCodeToDiscord(qrCodePath: string): Promise<void> {
  const webhookUrl = configManager.get('qrNotifyDiscord');
  if (!webhookUrl) return;

  // 读取图片
  let imageBuffer: Buffer;
  try {
    imageBuffer = fs.readFileSync(qrCodePath);
  } catch {
    console.warn('[warn] Discord 通知：读取二维码图片失败，已保存到本地');
    return;
  }

  const payload: DiscordPayload = {
    username: '组卷网登录',
    content: '请使用微信扫码登录（60秒内有效）',
  };

  const boundary = 'AaB03x';
  const CRLF = '\r\n';

  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="payload_json"`,
    `Content-Type: application/json`,
    '',
    JSON.stringify(payload),
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="login-qr.png"`,
    `Content-Type: image/png`,
    '',
    '',
  ].join(CRLF);

  const body = Buffer.concat([
    Buffer.from(header, 'utf8'),
    imageBuffer,
    Buffer.from(CRLF + `--${boundary}--${CRLF}`, 'utf8'),
  ]);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok && response.status !== 204) {
      const body2 = await response.text().catch(() => '');
      throw new Error(`Discord 返回 ${response.status}: ${body2}`);
    }

    console.log('[info] Discord 通知已发送');
  } catch (error) {
    console.warn('[warn] Discord 通知发送失败，已保存二维码到本地:', error instanceof Error ? error.message : error);
  }
}
