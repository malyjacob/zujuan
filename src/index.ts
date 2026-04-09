#!/usr/bin/env node

import { Command } from 'commander';
import { createConfigCommand } from './commands/config';
import { createStartCommand } from './commands/start';
import { createShutupCommand } from './commands/shutup';
import { createScrapeCommand } from './commands/scrape';
import { createListCommand } from './commands/list';
import { createBrowseCommand } from './commands/browse';
import { createExportCommand } from './commands/export';
import { createServeCommand } from './commands/serve';

const program = new Command();

program
  .name('zujuan')
  .description('组卷网爬虫工具 - 从zujuan.xkw.com爬取数学题目')
  .version('1.0.0');

// 注册子命令
program.addCommand(createConfigCommand());
program.addCommand(createStartCommand());
program.addCommand(createShutupCommand());
program.addCommand(createScrapeCommand());
program.addCommand(createListCommand());
program.addCommand(createBrowseCommand());
program.addCommand(createExportCommand());
program.addCommand(createServeCommand());

program.parse(process.argv);
