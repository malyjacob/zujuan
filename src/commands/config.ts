import { Command } from 'commander';
import { configManager } from '../lib/config';

export function createConfigCommand(): Command {
  const command = new Command('config');

  command
    .description('查看或更新配置')
    .option('--reset', '删除配置文件，恢复所有代码默认值')
    .option('--browser-dir <path>', '设置浏览器安装目录')
    .option('--login-qr-dir <path>', '设置登录二维码保存目录（默认: ~/.zujuan-scraper/）')
    .option('--log-dir <path>', '设置日志文件目录（默认: ~/.zujuan-scraper/）')
    .option('--tree-db <path>', '设置知识树数据库文件路径')
    .option('-g, --grade <grade>', '设置默认年级: high=高中 middle=初中')
    .option('-r, --order <order>', '设置默认排序: latest=最新 hot=最热 comprehensive=综合')
    .option('-d, --depth <n>', '设置 list 命令默认最大查询深度')
    .option('-ll, --log-level <level>', '设置日志级别: quiet=纯净 normal=普通 verbose=详细')
    .option('--vision-api-url <url>', '设置视觉模型 API 地址（如 https://api.deepseek.com/v1）')
    .option('--vision-api-key <key>', '设置视觉模型 API Key')
    .option('--vision-model <model>', '设置视觉模型名称/ID（如 deepseek-chat）')
    .option('--vision-enabled', '启用视觉 OCR')
    .option('--export-format <format>', '设置导出格式: html / markdown / both')
    .option('--output-dir <path>', '设置抓取结果输出目录（默认: ~/.zujuan-output/）')
    .action((options) => {
      // --reset：删除配置，恢复默认值
      if (options.reset) {
        configManager.reset();
        console.log('配置已重置为默认值');
        console.log(JSON.stringify(configManager.getPublicConfig(), null, 2));
        return;
      }

      // 收集所有传入的选项
      const anyOptionProvided =
        options.browserDir ||
        options.loginQrDir ||
        options.logDir ||
        options.treeDb ||
        options.grade ||
        options.order ||
        options.depth !== undefined ||
        options.logLevel ||
        options.visionApiUrl ||
        options.visionApiKey ||
        options.visionModel ||
        options.visionEnabled ||
        options.exportFormat ||
        options.outputDir;

      if (!anyOptionProvided) {
        // 无参数：显示当前配置
        const cfg = configManager.getPublicConfig();
        console.log('当前配置:');
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }

      // 有参数：逐项更新
      configManager.set({
        browserDir: options.browserDir,
        loginQrDir: options.loginQrDir,
        logDir: options.logDir,
        treeDb: options.treeDb,
        grade: options.grade as 'high' | 'middle' | undefined,
        order: options.order as 'latest' | 'hot' | 'comprehensive' | undefined,
        treeDepth: options.depth !== undefined ? parseInt(options.depth) : undefined,
        logLevel: options.logLevel as 'quiet' | 'normal' | 'verbose' | undefined,
        visionApiUrl: options.visionApiUrl,
        visionApiKey: options.visionApiKey,
        visionModel: options.visionModel,
        visionEnabled: options.visionEnabled,
        exportFormat: options.exportFormat as 'html' | 'markdown' | 'both' | undefined,
        outputDir: options.outputDir,
      });

      console.log('配置已更新');
    });

  return command;
}
