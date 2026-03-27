import { Command } from 'commander';
import { configManager } from '../lib/config';

export function createConfigCommand(): Command {
  const command = new Command('config');

  command
    .description('查看或更新配置')
    .action(() => {
      const config = configManager.getAll();
      console.log('当前配置:');
      console.log(JSON.stringify(config, null, 2));
    });

  command
    .option('-c, --cookie <cookie>', '设置 cookie')
    .option('-o, --output <path>', '设置输出路径')
    .option('-b, --browser-path <path>', '设置浏览器路径（默认: /usr/bin/google-chrome）')
    .option('-q, --qr-code-path <path>', '设置二维码图片保存路径')
    .option('-g, --default-grade <grade>', '设置默认年级: high=高中 middle=初中')
    .option('-r, --default-order <order>', '设置默认排序: latest=最新 hot=最热 comprehensive=综合')
    .option('-p, --browser-port <port>', '设置浏览器调试端口（默认: 9222）')
    .option('-h, --headless <enabled>', '设置无头模式: true/false（默认: true）')
    .option('-l, --log-enabled <enabled>', '是否启用日志（true/false）')
    .option('--log-path <path>', '设置日志文件路径（默认: ./zujuan.log）')
    .option('-ll, --log-level <level>', '设置默认日志级别: quiet=纯净 normal=普通 verbose=详细')
    .action((options) => {
      if (options.cookie || options.output || options.browserPath ||
          options.qrCodePath || options.defaultGrade || options.defaultOrder ||
          options.browserPort || options.headless !== undefined ||
          options.logEnabled !== undefined || options.logPath ||
          options.logLevel) {

        configManager.set({
          cookie: options.cookie,
          output: options.output,
          browserPath: options.browserPath,
          qrCodePath: options.qrCodePath,
          defaultGrade: options.defaultGrade as 'high' | 'middle' | undefined,
          defaultOrder: options.defaultOrder as 'latest' | 'hot' | 'comprehensive' | undefined,
          browserPort: options.browserPort ? parseInt(options.browserPort) : undefined,
          headless: options.headless !== undefined ? options.headless === 'true' : undefined,
          logEnabled: options.logEnabled !== undefined ? options.logEnabled === 'true' : undefined,
          logPath: options.logPath,
          defaultLogLevel: options.logLevel as 'quiet' | 'normal' | 'verbose' | undefined,
        });
        console.log('配置已更新');
      } else {
        const config = configManager.getAll();
        console.log('当前配置:');
        console.log(JSON.stringify(config, null, 2));
      }
    });

  return command;
}
