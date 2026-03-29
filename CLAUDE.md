# Claude Code 使用指南 — 组卷网题目抓取工具

这是一个为 Claude Code 等 AI Agent 编写的项目上下文文件，帮助 agent 理解项目结构并正确执行命令。

## 项目概述

**用途**：从组卷网（zujuan.xkw.com）抓取初高中数学题目截图、答案图片和 OCR 识别文字。

**语言**：TypeScript + Node.js，依赖 Playwright（浏览器自动化）和 Tesseract.js（OCR）。

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

**示例：**
```bash
zujuan scrape -k zsd28279 -t t1 -g high -l 5
zujuan scrape -k zsd5391 -g middle -t t4 -d d4 -l 3
```

### 3. 关闭浏览器

```bash
zujuan shutup
```

### 4. 查看/修改配置

```bash
# 查看配置
zujuan config

# 修改配置
zujuan config -g middle      # 默认年级改为初中
zujuan config -r hot         # 默认排序改为最热
zujuan config -ll verbose    # 日志级别改为详细

# 重置配置（删除配置文件，恢复代码默认值）
zujuan config --reset
```

### 5. 搜索知识点（SQLite 加速）

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

## 项目结构

```
src/
├── index.ts                    # CLI 入口，注册所有子命令
├── commands/
│   ├── start.ts              # start 命令：启动浏览器 + 扫码登录
│   ├── scrape.ts             # scrape 命令：抓取题目
│   ├── shutup.ts             # shutup 命令：关闭浏览器
│   ├── config.ts             # config 命令：查看/修改配置
│   └── list.ts               # list 命令：搜索/查看知识点（SQLite）
├── lib/
│   ├── browser.ts            # BrowserManager：Playwright 浏览器生命周期管理
│   ├── scraper.ts            # ScraperEngine：题目抓取核心逻辑
│   ├── ocr.ts                # Tesseract.js OCR 识别封装
│   ├── url-builder.ts        # URL 构建，按年级/题型/难度等生成目标 URL
│   ├── config.ts             # ConfigManager：配置文件读写
│   ├── knowledge-tree.ts     # 旧版树解析（scraper 还在用）
│   └── knowledge-tree-sqlite.ts # SQLite 版树存储（list 命令使用）
└── types/
    └── index.ts              # TypeScript 类型定义
```

## 关键逻辑说明

### 抓取流程（scrape 内部）

1. **连接浏览器** — `browserManager.connect()` 通过 CDP 连接到已运行的 Chrome
2. **访问 URL** — 视口设为 1920×1080，访问 `UrlBuilder` 生成的目标 URL
3. **滚动加载** — 滚动到底部触发懒加载，等待题目列表完整渲染
4. **批量截图** — 用 `$$` 获取所有 `div.tk-quest-item.quesroot` 句柄，逐题处理：
   - 滚动到题目位置
   - 截取 `div.exam-item__cnt`（仅题目内容区域）
   - 点击 `div.wrapper.quesdiv` 触发答案图片懒加载
   - 轮询等待答案 `img` 的 `src` 出现
5. **并行下载** — 收集完所有答案 URL 后，用 Node.js 原生 `http`/`https` 并行下载（不通过 Playwright，避免页面导航）
6. **并行 OCR** — 并行调用 Tesseract.js 识别题目和答案图片
7. **退出** — `browserManager.close()` + `process.exit(0)`

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

抓取结果输出到 `./zujuan-output/`（项目目录下）。

### 注意事项

- `scrape` 必须在 `start` 之后执行，浏览器必须处于运行状态
- 高中（`gzsx`）和初中（`czsx`）的 URL 前缀不同，题型码也不同
- 答案图片通过 `src` 属性下载，不经过 Playwright，避免页面导航
- OCR 识别使用 Tesseract.js，本地执行，无需 API Key

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

隐藏配置项（不暴露在 `config` 命令中）：`cookie`、`browserPort`、`headless`、`logEnabled`
