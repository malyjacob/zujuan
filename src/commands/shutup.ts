import { Command } from 'commander';
import { browserManager } from '../lib/browser';
import { BrowserStateManager } from '../lib/browser';

export function createShutupCommand(): Command {
  const command = new Command('shutup');

  command
    .description('关闭后台运行的浏览器实例')
    .action(async () => {
      try {
        // 检查是否在运行
        if (!browserManager.isRunning()) {
          const state = BrowserStateManager.load();
          if (state) {
            // 状态文件存在但进程不存在，清理残留
            BrowserStateManager.clear();
            console.log('浏览器未在运行，已清理残留状态文件');
          } else {
            console.log('浏览器未在运行');
          }
          return;
        }

        const state = BrowserStateManager.load();
        console.log(`正在关闭浏览器 (PID: ${state?.pid})...`);

        // 关闭浏览器
        await browserManager.shutdown();

        console.log('\n========================================');
        console.log('浏览器已关闭！');
        console.log('如需再次使用，请运行 start 命令');
        console.log('========================================');

      } catch (error) {
        console.error('关闭浏览器失败:', error);
        process.exit(1);
      }
    });

  return command;
}
