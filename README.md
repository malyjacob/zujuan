# 组卷网初高中数学题目抓取工具

用于从组卷网（zujuan.xkw.com）抓取初高中数学题目、答案和解析。

## 功能特性

- **科目限定**：专注初高中数学，工具自动适配高中（gzsx）和初中（czsx）两套 URL 体系
- **多维筛选**：支持按题型、难度、年份、年级、排序方式筛选题目
- **自动登录**：扫码登录，登录状态持久化
- **同步抓取**：题目截图 + 答案图片下载
- **视觉 OCR**：通过视觉大模型 API 将题目图片和答案图片转为 Markdown 文字，几何示意图自动忽略
- **示例图分离**：题目中的插图单独下载，截图时自动隐藏，保持纯文字截图
- **持久化浏览器**：浏览器一次启动、多次抓取，减少资源占用、降低反爬风险
- **并行下载**：多张答案图片、示例图同时下载，全程非阻塞
- **云端部署**：支持无头模式，可部署在服务器环境

## 安装

```bash
npm install
npm run build
```

> `npm install` 会自动将知识点树文件复制到 `~/.zujuan-scraper/` 目录。

## 快速开始

### 1. 启动浏览器并登录

```bash
zujuan start
```

首次使用会弹出二维码，用手机微信扫码登录（60秒内）。登录成功后浏览器在后台运行。

### 2. 抓取题目

```bash
zujuan scrape -k zsd28279 -l 5
```

### 3. 关闭浏览器

```bash
zujuan shutup
```

---

## 命令详解

### start 命令

启动浏览器并完成登录（阻塞模式，登录成功后自动退出）。

```bash
zujuan start [options]
```

**选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-g, --grade <grade>` | 年级：`high`=高中 `middle`=初中 | `high`（高中） |

**工作流程：**

1. 检查端口是否已有浏览器运行（通过 HTTP 请求 `/json/version`）
2. 如有已有浏览器，尝试 CDP 连接复用；否则启动新 Chromium 进程
3. 访问组卷网，检查登录状态
   - **已登录**：直接继续
   - **未登录**：显示二维码，等待手机微信扫码（60秒超时）
4. 保存登录状态（`storage-state.json`）和浏览器状态（`.browser-state.json`）
5. 退出命令，浏览器在后台保持运行

> **提示**：`start` 仅需运行一次，浏览器启动后可持续使用，可多次执行 `scrape` 命令。

---

### scrape 命令

从已启动的浏览器抓取题目。

```bash
zujuan scrape -k <knowledge_id> [options]
```

> **前提条件**：必须先运行 `start` 命令启动浏览器。

**必填选项：**

| 选项 | 说明 |
|------|------|
| `-k, --knowledge <id>` | 知识点节点 ID（从 `list` 命令获取） |

**可选选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-t, --type <type>` | 题型，详见下方题型说明 | 全部题型 |
| `-d, --difficulty <level>` | 难度，详见下方难度说明 | 全部难度 |
| `-y, --year <year>` | 年份（2026/2025/2024/2023/-1，-1表示更早） | 全部年份 |
| `-g, --grade <grade>` | 年级：`high`=高中 `middle`=初中 | 配置中的 `grade` |
| `-r, --order <order>` | 排序：`latest`=`hot`=`comprehensive` | 配置中的 `order` |
| `-l, --limit <number>` | 最大抓取数量（1-10） | `10` |
| `-mc, --multi-count <number>` | 多选题答案数量（2/3/4+） | 不限制 |
| `-fc, --fill-count <number>` | 填空题空数（1/2/3+） | 不限制 |
| `-p, --page <number>` | 分页页码（第2页起为 `o2p2` 格式） | `1` |
| `-ll, --log-level <level>` | 日志级别：`quiet`=`normal`=`verbose` | `quiet`（默认） |

**日志级别说明（`-ll`）：**

| 值 | 说明 | 典型输出 |
|----|------|---------|
| `quiet` | 纯净，仅输出目标 URL 和最终结果路径 | 仅 2 行 |
| `normal` | 普通，包含抓取进度、错误警告和最终路径 | 日常使用推荐 |
| `verbose` | 详细，包含每题处理步骤、下载进度等调试信息 | 调试用 |

> 覆盖配置中的 `logLevel`，每次抓取可单独指定。

**题型筛选（`-t`）：**

| 值 | 说明 | 高中题型码 | 初中题型码 |
|----|------|-----------|-----------|
| `t1` | 单选题 | `qt2701` | `qt1101` |
| `t2` | 多选题 | `qt2704` | `qt1104` |
| `t3` | 填空题 | `qt2702` | `qt1102` |
| `t4` | 解答题 | `qt2703` | `qt1103` |

> 注意：高中和初中的题型码不同，工具会自动根据年级选择对应的题型码。

**难度筛选（`-d`）：**

| 值 | 说明 |
|----|------|
| `d1` | 容易 |
| `d2` | 较易 |
| `d3` | 适中 |
| `d4` | 较难 |
| `d5` | 困难 |

**排序方式（`-r`）：**

| 值 | 说明 | URL 后缀 |
|----|------|--------|
| `latest` | 最新（默认） | `o2` |
| `hot` | 最热 | `o1` |
| `comprehensive` | 综合 | `o0` |

**示例：**

```bash
# 抓取高中单选题，最多5道
zujuan scrape -k zsd28279 -t t1 -l 5

# 抓取初中较难解答题，按最热排序
zujuan scrape -k zsd5391 -g middle -t t4 -d d4 -r hot -l 3

# 抓取填空题，3空题
zujuan scrape -k zsd28279 -t t3 -fc 3 -l 10

# 抓取多选题，4个答案
zujuan scrape -k zsd28279 -t t2 -mc 4 -l 5

# 抓取第2页结果
zujuan scrape -k zsd28279 -l 5 -p 2
```

---

### shutup 命令

关闭后台运行的浏览器进程。

```bash
zujuan shutup
```

会关闭 Chromium 主进程及所有子进程，并清理 `.browser-state.json` 状态文件。

---

### config 命令

查看或更新配置。

```bash
# 查看当前全部配置
zujuan config

# 设置/更新配置项
zujuan config [options]

# 重置配置（删除配置文件，恢复所有代码默认值）
zujuan config --reset
```

**可设置的配置项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--browser-dir <path>` | 设置浏览器可执行文件路径（留空则自动检测） | 自动检测 |
| `--login-qr-dir <path>` | 设置登录二维码保存目录 | `~/.zujuan-scraper/` |
| `--log-dir <path>` | 设置日志文件目录 | `~/.zujuan-scraper/` |
| `--tree-db <path>` | 设置知识树数据库文件路径 | `~/.zujuan-scraper/knowledge-tree.db` |
| `-g, --grade <grade>` | 设置默认年级：`high`=高中 `middle`=初中 | `high` |
| `-r, --order <order>` | 设置默认排序：`latest`/`hot`/`comprehensive` | `latest` |
| `-d, --depth <n>` | 设置 list 命令默认最大查询深度 | `1` |
| `-ll, --log-level <level>` | 设置日志级别：`quiet`/`normal`/`verbose` | `quiet` |

> 隐藏配置项（不暴露在帮助文本中，但可通过 `config --reset` 恢复默认值）：`cookie`、`browserPort`、`headless`、`logEnabled`

**示例：**

```bash
# 查看当前配置
zujuan config

# 设置默认年级为初中
zujuan config -g middle

# 设置默认排序为最热
zujuan config -r hot

# 同时设置年级和排序
zujuan config -g middle -r hot

# 设置日志级别为详细（调试用）
zujuan config -ll verbose

# 重置所有配置为默认值
zujuan config --reset
```

---

### list 命令

查看或搜索知识点树，获取可用知识点 ID。使用 SQLite 加速搜索。

```bash
zujuan list [options]
```

**选项：**

| 选项 | 说明 |
|------|------|
| `-s, --search <name>` | 搜索知识点名称（模糊匹配） |
| `-i, --id <id>` | 从指定知识点节点查询其子孙节点 |
| `-t, --tree` | 显示完整知识点树（默认高中） |
| `-m, --middle` | 使用初中知识点树（默认高中） |
| `--depth <n>` | 最大查询深度（-1=无限制，不指定则使用配置默认值） |
| `--refresh` | 强制从知识点树文件重建数据库 |

**示例：**

```bash
# 搜索包含"函数"的知识点
zujuan list --search 函数

# 查看高中知识点树（默认深度1）
zujuan list --tree

# 查看高中知识点树，深度2
zujuan list --tree --depth 2

# 搜索初中知识点
zujuan list --search 三角形 --middle

# 通过ID查看知识点详情及其子孙
zujuan list --id zsd28279 --depth 3

# 强制从文本文件重建数据库
zujuan list --refresh
```

---

### browse 命令

交互式知识点浏览器（TUI），在终端中通过键盘操作浏览知识点树。

```bash
zujuan browse [options]
```

**选项：**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-g, --grade <grade>` | 年级：`high`=高中 `middle`=初中 | `high` |
| `-i, --id <id>` | 从指定知识点节点开始浏览 | 根节点 |

**键盘操作：**

| 按键 | 功能 |
|------|------|
| `↑` / `k` | 上移 |
| `↓` / `j` | 下移 |
| `→` | 展开当前节点 |
| `←` | 折叠当前节点（或跳到父节点） |
| `Enter` | 切换展开/折叠 |
| `Home` / `End` | 跳到首/末节点 |
| `PageUp` / `PageDown` | 大步滚动（20项） |
| `*` | 展开全部节点 |
| `-` | 折叠全部（只留根） |
| `/` | 进入搜索模式 |
| `n` / `Shift+N` | 搜索结果下一个/上一个 |
| `Esc` | 退出搜索模式 |
| `q` / `Ctrl+C` | 退出 |

**示例：**

```bash
# 启动高中知识点浏览器
zujuan browse

# 启动初中知识点浏览器
zujuan browse -g middle

# 从指定节点开始浏览
zujuan browse -i zsd28279
```

---

## 配置

所有用户数据统一存储在 `~/.zujuan-scraper/` 目录下：

- `config.json` — 用户配置
- `storage-state.json` — 登录 Cookie 状态
- `.browser-state.json` — 浏览器 PID + WebSocket 端点
- `zujuan.log` — 运行日志
- `login-qr.png` — 二维码截图
- `knowledge-tree.db` — 知识点树 SQLite 数据库
- `KNOWLEDGE_TREE_HIGH.txt` / `KNOWLEDGE_TREE_MIDDLE.txt` — 知识点树文本文件

配置文件由 `config` 命令自动管理，`npm install` 时自动复制知识点树文件，无需手动操作。

**配置优先级：命令行参数 > 配置文件 > 代码默认值**

**可见配置项：**

| 配置项 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `browserDir` | `string` | Chrome/Chromium 路径（留空自动检测） | 自动检测 |
| `loginQrDir` | `string` | 登录二维码保存目录 | `~/.zujuan-scraper/` |
| `logDir` | `string` | 日志文件目录 | `~/.zujuan-scraper/` |
| `treeDb` | `string` | 知识树数据库路径 | `~/.zujuan-scraper/knowledge-tree.db` |
| `grade` | `"high" \| "middle"` | 默认年级 | `"high"` |
| `order` | `"latest" \| "hot" \| "comprehensive"` | 默认排序 | `"latest"` |
| `treeDepth` | `number` | list 命令默认最大查询深度 | `1` |
| `logLevel` | `"quiet" \| "normal" \| "verbose"` | 默认日志级别 | `"quiet"` |
| `visionApiUrl` | `string` | 视觉模型 API 地址（如 OpenAI 兼容端点） | `""` |
| `visionApiKey` | `string` | 视觉模型 API Key | `""` |
| `visionModel` | `string` | 视觉模型名称 | `""` |
| `visionEnabled` | `boolean` | 是否启用视觉 OCR | `false` |

**隐藏配置项**（不暴露在 `config` 命令中）：`cookie`、`browserPort`、`headless`、`logEnabled`

---

## 输出结果

抓取结果保存在配置的输出目录中，默认 `zujuan-output/`。

```
zujuan-output/
├── q_1234567890_0_question.png   # 题目截图（仅题目内容区域，示例图已隐藏）
├── q_1234567890_0_answer.png      # 答案图片（通过网络下载，非截图）
├── q_1234567890_0_img_0.png       # 示例图（如有）
├── q_1234567890_0_img_1.png       # 示例图（如有多张）
├── q_1234567890_1_question.png
├── q_1234567890_1_answer.png
├── ...
└── results_1234567890.json         # 汇总结果（含每题元数据）
```

**JSON 结果格式：**

```json
{
  "options": {
    "knowledgeId": "zsd28279",
    "knowledgePoint": "函数的基本概念",
    "grade": "高中",
    "order": "最新"
  },
  "results": [
    {
      "id": "q_1234567890_0",
      "questionPath": "zujuan-output/q_1234567890_0_question.png",
      "answerPath": "zujuan-output/q_1234567890_0_answer.png",
      "images": [
        "zujuan-output/q_1234567890_0_img_0.png",
        "zujuan-output/q_1234567890_0_img_1.png"
      ],
      "source": "2024年全国高考甲卷",
      "questionType": "解答题",
      "difficulty": "较难",
      "scoreRate": 0.45,
      "knowledgeKeywords": ["函数", "单调性", "极值"],
      "questionText": "## 题目\n设函数 $f(x) = x^3 - 3x + 1$...",
      "answerText": "【答案】\n【分析】...\n【详解】...",
      "timestamp": "2026-03-27T10:30:00.000Z"
    },
    {
      "id": "q_1234567890_1",
      "questionPath": "zujuan-output/q_1234567890_1_question.png",
      "answerPath": "zujuan-output/q_1234567890_1_answer.png",
      "images": [],
      "difficulty": "容易",
      "scoreRate": 0.88,
      "knowledgeKeywords": ["函数的奇偶性"],
      "questionText": "## 题目\n判断函数 $f(x) = x^2$ 的奇偶性...",
      "answerText": "【答案】偶函数\n【分析】...\n【详解】...",
      "timestamp": "2026-03-27T10:30:02.000Z"
    }
  ]
}
```

> `options` 为本次抓取的筛选条件，`grade` 和 `order` 始终存在，其余字段仅在命令行指定时出现。`year` 为 `-1` 时表示指定了"更早年份"选项。每题的 `source`/`questionType`/`difficulty`/`scoreRate`/`knowledgeKeywords` 为实际元数据，未获取到时不写入。

---

## 工作流程

```
┌──────────────────────────────────────────────────────────┐
│                      CLI 命令层                           │
│   start (启动+登录) │ scrape (抓取) │ shutup (关闭)      │
└──────────┬────────────────────┬──────────────────────────┘
           │                    │
           ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                  BrowserManager（单例）                   │
│  launch() — 启动浏览器（仅 start 调用一次）                │
│  connect() — 连接到已运行浏览器（每次 scrape 调用）         │
│  close()    — 关闭 CDP 连接（每次 scrape 结束时调用）      │
└──────────┬────────────────────┬──────────────────────────┘
           │                    │
           ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                 ~/.zujuan-scraper/                        │
│  config.json          用户配置                             │
│  storage-state.json   登录 Cookie 状态                    │
│  .browser-state.json  浏览器 PID / WebSocket 端点         │
│  zujuan.log           运行日志                             │
│  login-qr.png         二维码截图                           │
│  knowledge-tree.db     知识点树 SQLite 数据库              │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│                 ./zujuan-output/                          │
│  抓取结果：题目截图、答案图片、JSON 结果                    │
└──────────────────────────────────────────────────────────┘
```

**scrape 执行流程：**

1. `connect()` — 通过 CDP 连接到已运行的浏览器
2. 设置视口 1920×1080，访问目标 URL
3. 滚动加载所有题目（触发懒加载）
4. 检查登录状态（`a.login-btn` 元素是否存在），未登录则退出并提示重新 `start`
5. 逐题处理：
   - 滚动到题目位置
   - 从 `div.ques-additional` 提取每题元数据（来源/题型/难度/得分率/知识点关键词）
   - 收集 `div.exam-item__cnt > p img` 示例图 URL，设为 `hidden`（不占位）
   - 截取 `exam-item__cnt` 区域（仅题目内容，示例图已隐藏）
   - 点击触发答案图片懒加载
   - 轮询获取答案 img src
   - **并行下载**所有答案图片
   - **并行下载**所有示例图
   - **并行视觉 OCR**（`visionEnabled=true` 时）：题目图片调用 `imageToMarkdown`，答案图片调用 `answerToMarkdown`（忽略几何图）
6. 保存 JSON 结果
7. `close()` 关闭连接 + `process.exit(0)` 退出进程

---

## 重要 Q&A

### Q：运行 `scrape` 提示"未找到任何题目"？

常见原因：

1. **年级不匹配**：命令行指定的年级与知识点实际年级不一致。例如知识点是初中的，但 URL 中用了 `gzsx`（高中）。检查 `-g` 参数是否正确，或查看 `config -g` 默认值。

2. **题型码不存在**：该知识点下没有指定题型的题目。如多选题 `t2` 在某些知识点下可能不存在。

3. **难度太高/太低**：该知识点下没有对应难度的题目，可尝试去掉 `-d` 参数。

4. **URL 不可访问**：手动打开浏览器访问生成的 URL 确认页面是否有题目。

### Q：如何找到正确的知识点 ID？

使用 `list` 命令：

```bash
# 搜索
zujuan list --search 极值

# 查看知识点树
zujuan list --tree
```

ID 格式为 `zsd` 开头的一串数字，如 `zsd28279`。

### Q：scrape 命令执行完后进程不退出？

已修复。`scrape` 完成后会调用 `browserManager.close()` 关闭 CDP 连接并 `process.exit(0)` 强制退出。如果仍有残留，手动 `Ctrl+C` 或运行 `shutup` 关闭浏览器。

### Q：如何抓取多页的题目？

使用 `-p` 参数指定页码：

```bash
# 抓取第2页
zujuan scrape -k zsd28279 -l 10 -p 2

# 抓取第3页
zujuan scrape -k zsd28279 -l 10 -p 3
```

### Q：多选题和填空题有额外参数吗？

有：

- **多选题答案数量**（`-mc`）：指定多选题的选项数量
  - `-mc 2` → 2个答案的多选题
  - `-mc 3` → 3个答案的多选题
  - `-mc 4` → 4个及以上答案的多选题

- **填空题空数**（`-fc`）：指定填空题的空格数量
  - `-fc 1` → 单空填空题
  - `-fc 2` → 双空填空题
  - `-fc 3` → 多空填空题

### Q：命令行指定的参数和配置文件哪个优先？

命令行参数**优先于**配置文件。例如：

```bash
# 配置中 grade=high，但命令行指定了 middle
zujuan scrape -k zsd5391 -g middle
```

→ 实际使用初中 `czsx` 路径，而非配置文件中的高中。

### Q：浏览器启动失败，提示 `TimeoutError`？

原因：端口上已有 Chrome 在运行但状态文件丢失，导致尝试连接到一个不存在的 WebSocket 端点。

解决方法：
```bash
# 先关闭所有 Chrome 进程
zujuan shutup

# 或手动强制关闭
pkill -9 chrome

# 重新启动
zujuan start
```

工具已增加端口检测，即使状态文件丢失也会自动检测并复用已运行的浏览器。

### Q：登录状态多久过期？

取决于组卷网的 Session 有效期，通常为**数天到数周**。过期后需重新扫码登录：删除 `~/.zujuan-scraper/storage-state.json`，运行 `start` 重新扫码。

### Q：如何部署到服务器/云端？

1. 本地完成首次扫码登录（`start` 命令），`storage-state.json` 会自动保存
2. 将项目（含 `storage-state.json`）部署到服务器
3. 服务器上无需重新登录，可直接运行 `scrape` 命令
4. 建议使用全局安装后的 `zujuan` 命令运行：

```bash
zujuan scrape -k zsd28279 -l 5
```

### Q：题目截图中包含了示例图，如何分离？

工具已内置示例图分离功能。截图前自动检测 `div.exam-item__cnt > p img` 并通过 `hidden` 属性隐藏，示例图单独下载后写入 JSON 的 `images` 字段，全程自动完成，无需手动操作。

### Q：可以同时运行多个 `scrape` 吗？

不建议。`scrape` 命令会复用同一个 CDP 连接，同时运行会导致冲突。如需同时抓取多个知识点，建议分多次执行。

### Q：想修改抓取题目的数量上限？

当前硬编码上限为 `10`。如需修改，编辑源码 `src/lib/scraper.ts` 中的 `limit = Math.min(totalQuestions, limit)` 附近逻辑，或在 `scrape.ts` 的 `parseInt` 逻辑处调整。

---

## 云端部署

### 登录状态持久化

扫码登录后，`~/.zujuan-scraper/storage-state.json` 保存了登录状态。部署时将此文件一同部署，服务器即可"免登录"使用。

### 端口冲突

如需同时运行多个实例，为每个实例分配不同端口：编辑 `~/.zujuan-scraper/config.json`，将 `browserPort` 改为不同值（如 `9222`、`9223`），再分别启动浏览器。

### 无头模式

服务器建议使用无头模式：编辑 `~/.zujuan-scraper/config.json`，将 `headless` 改为 `true`。

---

## 开发

```bash
# 构建（TypeScript → JavaScript）
npm run build

# 开发模式（直接运行 ts-node）
npm run dev

# TypeScript 类型检查
npx tsc --noEmit
```

---

## 许可证

MIT
