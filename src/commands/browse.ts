import { Command } from 'commander';
import { startInteractive } from '../ui';

export function createBrowseCommand(): Command {
  const command = new Command('browse');

  command
    .description('交互式知识点浏览器（终端 TUI）')
    .option('-g, --grade <grade>', '年级: high=高中 middle=初中', 'high')
    .option('-i, --id <id>', '从指定知识点节点开始浏览')
    .action(async (options) => {
      const grade = (options.grade as 'high' | 'middle') || 'high';

      try {
        await startInteractive(grade, options.id);
      } catch (error) {
        console.error('启动交互式浏览器失败:', error);
        process.exit(1);
      }
    });

  return command;
}
