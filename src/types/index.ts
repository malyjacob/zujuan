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
}

// 题目题型
export type QuestionType = 't1' | 't2' | 't3' | 't4' | 't5' | 't6';

// 题目难度
export type Difficulty = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';

// 年份
export type Year = 2023 | 2024 | 2025 | 2026;

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
}

// 抓取结果
export interface ScrapeResult {
  id: string;
  questionPath: string;
  answerPath: string;
  timestamp: string;
}

// 浏览器状态
export interface BrowserState {
  wsEndpoint: string;
  pid: number;
  port: number;
  startedAt: string;
}
