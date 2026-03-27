// CLI配置选项
export interface ConfigOptions {
  cookie?: string;
  output?: string;
  browserPath?: string;
  qrCodePath?: string;
  defaultGrade?: 'high' | 'middle';
  defaultOrder?: Order;
  browserPort?: number;
  headless?: boolean;
  logEnabled?: boolean;
  logPath?: string;
  defaultLogLevel?: LogLevel;
}

// 配置文件结构
export interface Config {
  cookie: string;
  outputDir: string;
  browserPath: string;
  defaultGrade: 'high' | 'middle';
  defaultOrder: Order;
  headless: boolean;
  qrCodePath: string;
  browserPort: number;
  logEnabled: boolean;
  logPath: string;
  defaultLogLevel: LogLevel;
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
  output?: string;
  multiCount?: number; // 多选题答案数: 2, 3, 4+
  fillCount?: number; // 填空题空数: 1, 2, 3+
  page?: number; // 分页页码
  logLevel?: LogLevel; // 日志级别，覆盖配置默认值
}

// 抓取结果
export interface ScrapeMeta {
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
  questionPath: string;
  answerPath: string;
  images: string[];
  timestamp: string;
  options?: ScrapeMeta;
}

// 浏览器状态
export interface BrowserState {
  wsEndpoint: string;
  pid: number;
  port: number;
  startedAt: string;
}
