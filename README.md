# 组卷网题目抓取工具

用于从组卷网（zujuan.xkw.com）抓取数学题目、答案和解析。

## 功能特性

- 支持单选题、多选题、填空题、解答题等题型筛选
- 支持按难度、年份、年级等维度筛选
- 自动登录（扫码登录）
- 同时抓取题目和答案解析
- OCR文字识别
- 分页抓取
- **持久化浏览器实例**（减少资源占用，避免频繁触发反爬）
- 云端部署支持

## 安装

```bash
npm install
npm run build
```

## 快速开始

### 1. 启动浏览器并登录

```bash
node ./dist/index.js start
```

首次使用会显示二维码，用手机微信扫码登录（60秒内）。登录成功后浏览器将在后台运行。

### 2. 抓取题目

```bash
node ./dist/index.js scrape --knowledge zsd27927 --limit 5
```

### 3. 关闭浏览器（用完后）

```bash
node ./dist/index.js shutup
```

## 命令详解

### start 命令

启动浏览器并登录（阻塞模式）。

```bash
node ./dist/index.js start [options]
```

选项：
- `-g, --grade <grade>` - 年级: 高中 或 初中（默认: 高中）

**工作流程：**
1. 检查是否已有浏览器在运行
2. 启动 Chromium 浏览器（后台运行）
3. 访问组卷网
4. 检查登录状态
   - 已登录：直接继续
   - 未登录：显示二维码等待扫码（60秒超时）
5. 保存登录状态和浏览器状态
6. 命令退出，浏览器在后台继续运行

**提示：** 浏览器会保持运行，可以多次运行 `scrape` 命令。

### scrape 命令

从已启动的浏览器抓取题目。

```bash
node ./dist/index.js scrape --knowledge <id> [options]
```

**重要：** 必须先运行 `start` 命令启动浏览器！

### shutup 命令

关闭后台运行的浏览器实例。

```bash
node ./dist/index.js shutup
```

### config 命令

查看或更新配置。

```bash
# 查看当前配置
node ./dist/index.js config

# 设置输出目录
node ./dist/index.js config --output ./my-output

# 设置浏览器路径
node ./dist/index.js config --browser-path "/usr/bin/google-chrome"

# 设置调试端口
node ./dist/index.js config --browser-port 9222

# 启用/禁用日志
node ./dist/index.js config --log-enabled true
```

### list 命令

列出/搜索知识点。

```bash
# 查看高中知识点树
node ./dist/index.js list --tree

# 查看初中知识点树
node ./dist/index.js list --tree --middle

# 搜索知识点
node ./dist/index.js list --search 函数

# 通过ID查找知识点
node ./dist/index.js list --id zsd27927
```

## 配置

配置文件位置：`~/.zujuan-scraper/config.json`

```json
{
  "cookie": "",
  "outputDir": "./zujuan-output",
  "browserPath": null,
  "defaultGrade": "high",
  "headless": true,
  "qrCodePath": "./login-qrcode.png",
  "browserPort": 9222,
  "logEnabled": true,
  "logPath": "./zujuan.log"
}
```

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `outputDir` | 输出目录 | `./zujuan-output` |
| `browserPath` | 浏览器可执行文件路径 | `null`（自动查找） |
| `defaultGrade` | 默认年级 | `high` |
| `headless` | 无头模式 | `true` |
| `qrCodePath` | 二维码图片保存路径 | `./login-qrcode.png` |
| `browserPort` | 浏览器调试端口 | `9222` |
| `logEnabled` | 是否启用日志 | `true` |
| `logPath` | 日志文件路径 | `./zujuan.log` |

**年级设置：**
- `high` → 高中：`gzsx`
- `middle` → 初中：`czsx`

## scrape 命令参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-k, --knowledge <id>` | 知识点节点ID（必填） | - |
| `-t, --type <type>` | 题型: t1/t2/t3/t4 | - |
| `-d, --difficulty <level>` | 难度: d1/d2/d3/d4/d5 | - |
| `-y, --year <year>` | 年份: 2023/2024/2025/2026 | - |
| `-g, --grade <grade>` | 年级: high/middle | - |
| `-l, --limit <number>` | 最大抓取数量 | 10 (1-10) |
| `-mc, --multi-count <number>` | 多选题答案数量: 2/3/4+ | - |
| `-fc, --fill-count <number>` | 填空题空数: 1/2/3+ | - |
| `-p, --page <number>` | 分页页码 | 1 |
| `-o, --output <path>` | 输出目录 | - |

**题型筛选：**
| 参数 | 说明 |
|------|------|
| `t1` | 单选题 |
| `t2` | 多选题 |
| `t3` | 填空题 |
| `t4` | 解答题 |

**难度筛选：**
| 参数 | 说明 |
|------|------|
| `d1` | 容易 |
| `d2` | 较易 |
| `d3` | 适中 |
| `d4` | 较难 |
| `d5` | 困难 |

**示例：**
```bash
# 2026年高三单选题，适中难度
node ./dist/index.js scrape -k zsd27927 -t t1 -d d3 -y 2026 -l 10

# 2025年高二多选题，较难
node ./dist/index.js scrape -k zsd27927 -t t2 -d d4 -y 2025 -l 10
```

## 输出结果

抓取结果保存在配置的输出目录中，默认 `zujuan-output/`

```
zujuan-output/
├── q_1234567890_question.png   # 题目截图
├── q_1234567890_answer.png      # 答案截图
├── results_1234567890.json     # JSON 结果
└── ...
```

JSON 结果格式：
```json
[
  {
    "id": "q_1234567890_0",
    "questionPath": "q_1234567890_question.png",
    "answerPath": "q_1234567890_answer.png",
    "questionText": "题目文字...",
    "answerText": "答案文字...",
    "timestamp": "2026-03-26T00:00:00.000Z"
  }
]
```

## 日志

日志文件默认保存在 `./zujuan.log`，可通过配置修改。

日志内容包含：
- 浏览器启动/连接/关闭信息
- 登录状态
- 错误信息

禁用日志：
```bash
node ./dist/index.js config --log-enabled false
```

## 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI 命令层                              │
├──────────────┬─────────────────┬───────────────────────────┤
│  start       │  scrape         │  shutup                    │
│  (阻塞模式)  │  (连接模式)      │  (关闭浏览器)               │
└──────┬───────┴────────┬────────┴────────┬────────────────────┘
       │                │                 │
       ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    BrowserManager                            │
│  ┌─────────────────┐    ┌────────────────────────────────┐ │
│  │ launch()        │    │ connect()                      │ │
│  │ (启动浏览器)     │    │ (连接到已运行浏览器)              │ │
│  └─────────────────┘    └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
       │                │                 │
       ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                       文件层                                 │
│  ┌─────────────────┐    ┌────────────────────────────────┐ │
│  │ .browser-state.json │  │ storage-state.json            │ │
│  │ (浏览器状态)       │  │ (登录状态)                       │ │
│  └─────────────────┘    └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 云端部署

### 登录状态

1. 在本地完成首次登录（运行 `start` 命令）
2. 将项目部署到云端时，包含 `storage-state.json` 文件
3. 云端运行时无需重新登录

### 端口配置

如果调试端口被占用，可通过配置修改：
```bash
node ./dist/index.js config --browser-port 9223
```

### 无头模式

默认使用无头模式，适合服务器环境：
```bash
node ./dist/index.js config --headless true
```

## 常见问题

### Q: 提示"浏览器未在运行"怎么办？
A: 需要先运行 `start` 命令启动浏览器。

### Q: 扫码登录超时怎么办？
A: 确保60秒内完成扫码，如果网络较慢可以稍后重试。删除 `storage-state.json` 后重新运行 `start`。

### Q: 浏览器崩溃了怎么办？
A: 运行 `start` 命令重新启动即可。

### Q: 登录状态多久过期？
A: 取决于组卷网设置，通常数天到数周不等。

### Q: 可以不用登录抓取吗？
A: 可以，但只能抓取题目，无法获取答案解析。

### Q: 如何抓取多页？
A: 使用 `--page` 参数指定页码。

### Q: 浏览器启动失败？
A: 检查：
- 端口是否被占用：`lsof -i :9222`
- 浏览器路径是否正确：`node ./dist/index.js config --browser-path "/path/to/chrome"`
- 日志文件查看详细信息：`cat ./zujuan.log`

## 开发

### 构建
```bash
npm run build
```

### 开发模式
```bash
npm run dev
```

### TypeScript 检查
```bash
npx tsc --noEmit
```

## 许可证

MIT
