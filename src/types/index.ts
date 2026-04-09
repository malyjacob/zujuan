// CLI配置选项（与 Config 键同名，便于直接透传）
export interface ConfigOptions {
  // 可见选项
  browserDir?: string;
  loginQrDir?: string;
  logDir?: string;
  treeDb?: string;
  grade?: 'high' | 'middle';
  order?: Order;
  treeDepth?: number;
  logLevel?: LogLevel;
  // 视觉 OCR 选项
  visionApiUrl?: string;
  visionApiKey?: string;
  visionModel?: string;
  visionEnabled?: boolean;
  // 导出格式选项
  exportFormat?: ExportFormat;
  // 输出目录选项
  outputDir?: string;
  // 二维码通知选项
  qrNotifyDiscord?: string;
  // 隐藏选项（代码内部使用，不暴露给 config 命令）
  cookie?: string;
  browserPort?: number;
  headless?: boolean;
  logEnabled?: boolean;
}

// 配置文件结构
export interface Config {
  // 可见选项
  browserDir: string;
  loginQrDir: string;
  logDir: string;
  treeDb: string;
  grade: 'high' | 'middle';
  order: Order;
  treeDepth: number;
  logLevel: LogLevel;
  // 视觉 OCR 选项
  visionApiUrl: string;
  visionApiKey: string;
  visionModel: string;
  visionEnabled: boolean;
  // 导出格式选项
  exportFormat: ExportFormat;
  // 输出目录选项
  outputDir: string;
  // 二维码通知选项
  qrNotifyDiscord: string;
  // 隐藏选项
  cookie: string;
  browserPort: number;
  headless: boolean;
  logEnabled: boolean;
}

// 日志级别
export type LogLevel = 'quiet' | 'normal' | 'verbose';

// 题目题型
export type QuestionType = 't1' | 't2' | 't3' | 't4' | 't5' | 't6';

// 题目难度
export type Difficulty = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';

// 年份
export type Year = 2023 | 2024 | 2025 | 2026 | -1;

// 年级: high=高中, middle=初中
export type Grade = 'high' | 'middle';

// 导出格式: html=HTML, markdown=Markdown, both=两者都生成
export type ExportFormat = 'html' | 'markdown' | 'both';

// 导出主题: light=白底黑字, dark=深色, sepia=护眼米黄
export type ExportTheme = 'light' | 'dark' | 'sepia';

// 排序方式: latest=最新(o2), hot=最热(o4), comprehensive=综合(o0)
export type Order = 'latest' | 'hot' | 'comprehensive';

// 来源
export type Source = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11' | 's12' | 's13';

// 地区
export interface Region {
  id: string;
  name: string;
}

// 学期
export type Semester = 'x1' | 'x2';

// 分类
export type Category = 'k1' | 'k2' | 'k3' | 'k4' | 'k5';

// Scrape命令参数
export interface ScrapeOptions {
  knowledge: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  year?: Year;
  grade?: Grade;
  order?: Order;
  limit?: number;
  multiCount?: number; // 多选题答案数: 2, 3, 4+
  fillCount?: number; // 填空题空数: 1, 2, 3+
  page?: number; // 分页页码
  logLevel?: LogLevel; // 日志级别，覆盖配置默认值
}

// 抓取结果
export interface ScrapeMeta {
  timestamp: string;        // 目录名，本次抓取的输出目录（必填）
  knowledgeId: string;      // 知识点节点ID
  knowledgePoint: string;   // 知识点名称
  grade: string;          // 年级段：高中/初中（必填）
  type?: string;         // 题型：单选题/多选题/填空题/解答题
  difficulty?: string;   // 难度：容易/较易/适中/较难/困难
  year?: number;         // 年份（含 -1 表示更早年份）
  order: string;         // 排序方式：最新/最热/综合（必填）
  multiCount?: number;   // 多选题答案数量
  fillCount?: number;    // 填空题空数
  page?: number;         // 分页页码
}

export interface ScrapeResult {
  id: string;
  index: string;            // 题目序号（补零对齐，如 "001"）
  questionPath: string;    // 相对于 {timestamp}/ 目录的路径，如 "001/question.png"
  answerPath: string;
  images: string[];
  source?: string;           // 来源
  questionType?: string;      // 题型
  difficulty?: string;        // 难度
  scoreRate?: number;         // 得分率（0~1）
  knowledgeKeywords: string[]; // 涉及到的知识点关键词列表
  questionText?: string;       // 视觉模型识别的题目文字（Markdown 格式）
  answerText?: string;         // 视觉模型识别的答案文字（Markdown 格式，忽略几何图）
  timestamp: string;
}

// 抓取结果（包含顶层筛选条件 + 结果列表）
export interface ScrapeOutput {
  options: ScrapeMeta;
  results: ScrapeResult[];
}

// 浏览器状态
export interface BrowserState {
  wsEndpoint: string;
  pid: number;
  port: number;
  startedAt: string;
}

