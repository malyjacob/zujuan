# Claude Code 使用指南 — 组卷网题目抓取工具

这是一个为 Claude Code 等 AI Agent 编写的项目上下文文件，帮助 agent 理解项目结构并正确执行命令。

## 项目概述

**用途**：从组卷网（zujuan.xkw.com）抓取初高中数学题目截图、答案图片和视觉模型 OCR 识别文字。

**语言**：TypeScript + Node.js，依赖 Playwright（浏览器自动化）和 OpenAI 兼容视觉模型（OCR）。

## 核心命令

### 1. 启动浏览器并登录

```bash
zujuan start
```

首次使用需要手机微信扫码登录（60秒内）。成功后浏览器在后台运行。

### 2. 抓取题目

```bash
zujuan scrape -k <知识点ID> [options]
```

**必填参数：**
- `-k <id>` — 知识点节点 ID（从 `list` 命令获取，如 `zsd28279`）

**常用参数：**
- `-g <grade>` — 年级：`high`=高中（默认）`middle`=初中
- `-t <type>` — 题型：`t1`=单选 `t2`=多选 `t3`=填空 `t4`=解答
- `-d <level>` — 难度：`d1`~`d5`
- `-r <order>` — 排序：`latest`=最新 `hot`=最热 `comprehensive`=综合
- `-l <n>` — 抓取数量（1-10）
- `-mc <n>` — 多选题答案数量（2/3/4+）
- `-fc <n>` — 填空题空数（1/2/3+）
- `-p <n>` — 分页页码
- `-e, --export` — 抓取完成后自动导出为 HTML 或 Markdown 文档
- `--format <formats>` — 导出格式：`html` / `markdown` / `both`（逗号分隔）
- `--theme <theme>` — 导出主题：`light`（白底）/ `dark`（深色）/ `sepia`（米黄）

**示例：**
```bash
zujuan scrape -k zsd28279 -t t1 -g high -l 5
zujuan scrape -k zsd5391 -g middle -t t4 -d d4 -l 3
zujuan scrape -k zsd27933 -e --format both --theme light
```

### 3. 导出抓取结果

```bash
zujuan export [timestamp] [options]
```

将 `./zujuan-output/{timestamp}/` 中的抓取结果导出为 HTML 或 Markdown 文档。

- `[timestamp]` — 抓取结果目录（时间戳），省略时自动查找最新目录
- `--format <formats>` — 导出格式：`html` / `markdown` / `both`
- `--theme <theme>` — 导出主题：`light` / `dark` / `sepia`

**示例：**
```bash
zujuan export                          # 导出最新抓取结果
zujuan export 1775124770132           # 导出指定目录
zujuan export --format markdown        # 只导出 Markdown
zujuan export --theme dark             # 深色主题
```

### 4. 关闭浏览器

```bash
zujuan shutup
```

### 5. 查看/修改配置

```bash
# 查看配置
zujuan config

# 修改配置
zujuan config -g middle      # 默认年级改为初中
zujuan config -r hot         # 默认排序改为最热
zujuan config -ll verbose    # 日志级别改为详细
zujuan config --export-format both  # 默认导出格式（html/markdown/both）

# 重置配置（删除配置文件，恢复代码默认值）
zujuan config --reset
```

### 6. 搜索知识点（SQLite 加速）

```bash
# 搜索知识点（模糊匹配）
zujuan list --search 函数

# 查看完整知识点树
zujuan list --tree

# 查看指定深度树（默认: 配置中的 treeDepth）
zujuan list --depth 2

# 通过ID查看知识点详情及其子孙
zujuan list --id zsd28279 --depth 3

# 强制从文本文件重建数据库
zujuan list --refresh
```

### 7. 交互式知识点浏览器（TUI）

```bash
zujuan browse                  # 启动高中知识点浏览器
zujuan browse -g middle       # 初中知识点浏览器
zujuan browse -i zsd28279    # 从指定节点开始浏览
```

键盘操作：`↑↓` 移动 `←→` 展开/折叠 `/` 搜索 `n` 下一匹配 `q` 退出

### 8. 静态服务器（浏览历史结果）

```bash
zujuan serve                  # 启动服务器（默认端口 30888）
zujuan serve --port 3000      # 指定端口
```

启动后访问 http://localhost:30888 可浏览所有历史抓取结果，按时间倒序展示，点击卡片跳转到对应总览页。总览页左上角有「← 返回目录」链接。按 `Ctrl+C` 关闭服务。

## 项目结构

```
src/
├── index.ts                    # CLI 入口，注册所有子命令
├── commands/
│   ├── start.ts              # start 命令：启动浏览器 + 扫码登录
│   ├── scrape.ts             # scrape 命令：抓取题目
│   ├── export.ts             # export 命令：导出抓取结果为 HTML/Markdown
│   ├── serve.ts              # serve 命令：静态服务器，展示历史抓取结果
│   ├── shutup.ts             # shutup 命令：关闭浏览器
│   ├── config.ts             # config 命令：查看/修改配置
│   ├── list.ts               # list 命令：搜索/查看知识点（SQLite）
│   └── browse.ts              # browse 命令：交互式 TUI 知识点浏览器
├── lib/
│   ├── browser.ts            # BrowserManager：Playwright 浏览器生命周期管理
│   ├── scraper.ts            # ScraperEngine：题目抓取核心逻辑
│   ├── vision-ocr.ts         # 视觉大模型 OCR 识别封装（题目+答案，30s 单次超时）
│   ├── url-builder.ts        # URL 构建，按年级/题型/难度等生成目标 URL
│   ├── config.ts             # ConfigManager：配置文件读写
│   ├── discord-notifier.ts   # Discord Webhook 通知：扫码登录时发送二维码
│   ├── knowledge-tree.ts     # 旧版树解析（保留）
│   ├── knowledge-tree-sqlite.ts # SQLite 版树存储（list/browse/serve 使用）
│   └── exporters/
│       ├── html-exporter.ts   # HTML 导出（三种主题 + MathJax + 主题切换按钮）
│       └── markdown-exporter.ts # Markdown 导出（YAML frontmatter + zip 打包）
├── ui/
│   ├── index.ts              # TUI 主入口（blessed 事件循环）
│   ├── tree.ts               # TreeState：树状态管理（展开/折叠/搜索）
│   └── widgets.ts            # blessed 组件创建和渲染函数
└── types/
    └── index.ts              # TypeScript 类型定义
```

## 关键逻辑说明

### 抓取流程（scrape 内部）

1. **连接浏览器** — `browserManager.connect()` 通过 CDP 连接到已运行的 Chrome
2. **访问 URL** — 视口设为 1920×1080，访问 `UrlBuilder` 生成的目标 URL
3. **登录检测** — 检查页面顶栏 `a.login-btn` 是否存在，存在则说明未登录/登录已过期，退出并提示重新 `start`
4. **滚动加载** — 滚动到底部触发懒加载，等待题目列表完整渲染
5. **批量截图** — 用 `$$` 获取所有 `div.tk-quest-item.quesroot` 句柄，逐题处理：
   - 滚动到题目位置
   - 截取 `div.exam-item__cnt`（仅题目内容区域）
   - 点击 `div.wrapper.quesdiv` 触发答案图片懒加载
   - 轮询等待答案 `img` 的 `src` 出现
6. **并行下载** — 收集完所有答案 URL 后，用 Node.js 原生 `http`/`https` 并行下载（不通过 Playwright，避免页面导航）
7. **并行视觉 OCR** — `visionEnabled=true` 时并行调用视觉模型：
   - 题目图片 → `VisionOCRProcessor.imageToMarkdown()`（Markdown 输出，LaTeX 公式）
   - 答案图片 → `VisionOCRProcessor.answerToMarkdown()`（忽略几何图，Markdown 输出）
   - 单次请求 30 秒超时，120 秒全局超时兜底（超时后跳过剩余 OCR 任务）
8. **保存结果** — 输出 JSON 到 `{timestamp}/results.json`，每题图片存入 `{timestamp}/{index}/`

### 输出目录结构

抓取结果输出到 `outputDir/{timestamp}/`（可通过 `config --output-dir` 修改，默认 `~/.zujuan-output/`）：

```
~/.zujuan-output/
└── 1775124770132/               # 时间戳目录（每次抓取自动生成）
    ├── results.json             # 完整抓取结果（含 metadata + 每题数据）
    ├── index.html               # 总览导航页（HTML 导出时生成，含所有题目入口）
    ├── 001/                     # 第 1 题独立目录
    │   ├── question.png         # 题目截图
    │   ├── answer.png           # 答案图片
    │   └── index.html           # HTML 展示（含三种主题切换 + 上下题导航）
    ├── 002/
    │   ├── question.png
    │   └── index.html
    ├── 001.zip                  # Markdown 打包文件（可选）
    └── 002.zip
```

results.json 中图片路径均为相对于时间戳目录的相对路径（如 `"001/question.png"`），确保 HTML/Markdown 移动后仍可正常引用。

### URL 规则

- **高中**：`https://zujuan.xkw.com/gzsx/zsd{id}/qt{题型码}[d{难度}][y{年份}][o{排序}p{页码}]/`
- **初中**：`https://zujuan.xkw.com/czsx/zsd{id}/qt{题型码}[d{难度}][y{年份}][o{排序}p{页码}]/`

题型码映射：
| | 高中 | 初中 |
|--|------|------|
| 单选 t1 | 2701 | 1101 |
| 多选 t2 | 2704 | 1104 |
| 填空 t3 | 2702 | 1102 |
| 解答 t4 | 2703 | 1103 |

排序码：最新=`o2`，最热=`o1`，综合=`o0`

### 文件持久化

所有用户数据统一存储在 `~/.zujuan-scraper/` 目录下：

- `~/.zujuan-scraper/config.json` — 用户配置
- `~/.zujuan-scraper/storage-state.json` — 登录 Cookie 状态（扫码登录后生成）
- `~/.zujuan-scraper/.browser-state.json` — 浏览器 PID + WebSocket 端点
- `~/.zujuan-scraper/zujuan.log` — 运行日志
- `~/.zujuan-scraper/login-qr.png` — 二维码截图
- `~/.zujuan-scraper/knowledge-tree.db` — 知识点树 SQLite 数据库
- `~/.zujuan-scraper/KNOWLEDGE_TREE_HIGH.txt` — 高中知识点树文本（npm install/postinstall 时自动复制）
- `~/.zujuan-scraper/KNOWLEDGE_TREE_MIDDLE.txt` — 初中知识点树文本

### HTML 导出主题

导出的 HTML 文件内置三种主题（light / dark / sepia），通过右上角三个按钮切换，主题选择保存到 `localStorage`，刷新后保持。

| 主题 | 背景色 | 适用场景 |
|------|--------|----------|
| light | `#ffffff` 白底 | 默认，打印/投影 |
| dark | `#0f0f0f` 深色 | 夜间查看 |
| sepia | `#f5f0e8` 米黄 | 护眼阅读 |

HTML 内嵌 MathJax 3 CDN，自动渲染 LaTeX 公式（`$...$`）。

**总览导航页**：`{timestamp}/index.html` 为总览导航页，展示所有题目的序号、难度、得分率、知识点关键词列表，点击跳转到对应单题页。左上角有「← 返回目录」链接，可跳转回 `serve` 的列表页。

**上下题导航**：每道题 HTML 页面底部有「← 上一题 | 目录 | 下一题 →」导航栏，首尾题对应按钮为禁用状态。

## 调试建议

- 关闭无头模式查看浏览器：编辑 `~/.zujuan-scraper/config.json` 将 `headless` 改为 `false`（然后重启 start）
- 查看日志：`tail -f ~/.zujuan-scraper/zujuan.log`
- 页面结构异常时抓取结果会包含 `page_debug_*.html` 供调试
- 浏览器崩溃后运行 `shutup` 再 `start` 重启
- 知识点数据库损坏：运行 `list --refresh` 强制重建

## 配置说明

配置优先级：**命令行参数** > **配置文件** > **代码默认值**

可见配置项（`config` 命令可查看/修改）：
| 键 | 说明 | 默认值 |
|---|---|---|
| `browserDir` | Chrome/Chromium 路径 | 自动检测 |
| `loginQrDir` | 登录二维码目录 | `~/.zujuan-scraper/` |
| `logDir` | 日志文件目录 | `~/.zujuan-scraper/` |
| `treeDb` | 知识树数据库路径 | `~/.zujuan-scraper/knowledge-tree.db` |
| `grade` | 默认年级 | `high` |
| `order` | 默认排序 | `latest` |
| `treeDepth` | list 默认查询深度 | `1` |
| `logLevel` | 日志级别 | `quiet` |
| `exportFormat` | 默认导出格式 | `both` |
| `outputDir` | 抓取结果输出目录 | `~/.zujuan-output/` |
| `qrNotifyDiscord` | Discord Webhook URL，扫码登录时发送二维码 | `""` |
| `visionApiUrl` | 视觉模型 API 地址 | `""` |
| `visionApiKey` | 视觉模型 API Key | `""` |
| `visionModel` | 视觉模型名称 | `""` |
| `visionEnabled` | 是否启用视觉 OCR | `false` |

隐藏配置项（不暴露在 `config` 命令中）：`cookie`、`browserPort`、`headless`、`logEnabled`
