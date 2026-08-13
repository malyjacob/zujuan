import { QuestionType, Difficulty, Year, Grade, Order, Source, Semester, Category } from '../types';
import { QUESTION_TYPE_CODES, ORDER_CODES } from './mappings';

const BASE_URL = 'https://zujuan.xkw.com';

export class UrlBuilder {
  private knowledgeId: string;
  private grade: string;
  private typePart: string = '';
  private difficultyPart: string = '';
  private yearPart: string = '';
  private gradePart: string = '';
  private orderPart: string = 'o2';
  private pageNum: number = 0;

  constructor(knowledgeId: string, grade: 'high' | 'middle' = 'high') {
    this.knowledgeId = knowledgeId;
    this.grade = grade;
  }

  private getGradePrefix(): string {
    return this.grade === 'high' ? 'gzsx' : 'czsx';
  }

  private validateType(type: QuestionType): boolean {
    const validTypes: QuestionType[] = ['t1', 't2', 't3', 't4', 't5', 't6'];
    return validTypes.includes(type);
  }

  private validateDifficulty(difficulty: Difficulty): boolean {
    const validDifficulties: Difficulty[] = ['d1', 'd2', 'd3', 'd4', 'd5'];
    return validDifficulties.includes(difficulty);
  }

  private validateYear(year: Year): boolean {
    // -1 = 更早年份；其余要求在合理年份范围内
    return year === -1 || (Number.isInteger(year) && year >= 2000 && year <= 2100);
  }

  private validateGrade(grade: Grade): boolean {
    const validGrades: Grade[] = ['high', 'middle'];
    return validGrades.includes(grade);
  }

  setType(type: QuestionType, multiCount?: number, fillCount?: number): this {
    if (!this.validateType(type)) return this;

    const typeMap = QUESTION_TYPE_CODES[this.grade as Grade];

    const baseType = typeMap[type];
    if (!baseType) return this;

    if (type === 't2' && multiCount !== undefined) {
      // 多选题: qt{baseType} + 01(2个)/02(3个)/03(4个及以上)
      const suffix = multiCount >= 4 ? '03' : `0${multiCount}`;
      this.typePart = `qt${baseType}${suffix}`;
    } else if (type === 't3' && fillCount !== undefined) {
      // 填空题: qt{baseType} + 01(单空)/02(双空)/03(多空)
      const suffix = fillCount >= 3 ? '03' : `0${fillCount}`;
      this.typePart = `qt${baseType}${suffix}`;
    } else {
      this.typePart = `qt${baseType}`;
    }

    return this;
  }

  setDifficulty(difficulty: Difficulty): this {
    if (this.validateDifficulty(difficulty)) {
      this.difficultyPart = `d${difficulty.slice(1)}`;
    }
    return this;
  }

  setYear(year: Year): this {
    if (this.validateYear(year)) {
      this.yearPart = year === -1 ? 'y-1' : `y${year}`;
    }
    return this;
  }

  setGrade(grade: Grade): this {
    if (this.validateGrade(grade)) {
      this.gradePart = `g${grade.slice(1)}`;
    }
    return this;
  }

  setSource(_source: Source): this {
    // Not used in new URL format
    return this;
  }

  setRegion(_regionId: string): this {
    // Not used in new URL format
    return this;
  }

  setSemester(_semester: Semester): this {
    // Not used in new URL format
    return this;
  }

  setCategory(_category: Category): this {
    // Not used in new URL format
    return this;
  }

  setOrder(order: Order): this {
    this.orderPart = ORDER_CODES[order] || 'o2';
    return this;
  }

  setPage(page: number): this {
    this.pageNum = page;
    return this;
  }

  build(): string {
    const gradePrefix = this.getGradePrefix();
    const parts: string[] = [];

    // Order: 题型 → 难度 → 年份 → 排序/分页 (直接拼接，无分隔符)
    if (this.typePart) parts.push(this.typePart);
    if (this.difficultyPart) parts.push(this.difficultyPart);
    if (this.yearPart) parts.push(this.yearPart);

    const pagePart = this.pageNum > 1 ? `${this.orderPart}p${this.pageNum}` : this.orderPart;
    parts.push(pagePart);

    // Strip 'zsd' prefix if present to avoid duplication
    const knowledgeId = this.knowledgeId.replace(/^zsd/, '');
    let url = `${BASE_URL}/${gradePrefix}/zsd${knowledgeId}/`;
    if (parts.length > 0) {
      url += parts.join('') + '/';
    }

    return url;
  }

  static buildUrl(
    knowledgeId: string,
    options: {
      type?: QuestionType;
      difficulty?: Difficulty;
      year?: Year;
      grade?: Grade;
      order?: Order;
      source?: Source;
      region?: string;
      semester?: Semester;
      category?: Category;
      page?: number;
      multiCount?: number;
      fillCount?: number;
    },
    grade: 'high' | 'middle' = 'high',
    defaultOrder: Order = 'latest'
  ): string {
    const builder = new UrlBuilder(knowledgeId, grade);

    if (options.type) builder.setType(options.type, options.multiCount, options.fillCount);
    if (options.difficulty) builder.setDifficulty(options.difficulty);
    if (options.year) builder.setYear(options.year);
    if (options.grade) builder.setGrade(options.grade);
    builder.setOrder(options.order || defaultOrder);
    if (options.page) builder.setPage(options.page);

    return builder.build();
  }
}
