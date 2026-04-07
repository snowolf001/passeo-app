import fontkit from '@pdf-lib/fontkit';
import {Buffer} from 'buffer';
import {
  degrees,
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {PDF_FEATURES} from '../../config/appConfig';
import {BRANDING} from '../../config/branding';
import {assertNoPuaChars, sanitizePdfText} from './pdfText';

// ----------------------------------------------------------------------
// CONFIGURATION & THEME (shared)
// ----------------------------------------------------------------------

export const PAGE_MARGIN = 48;

// Footer safe area
const FOOTER_HEIGHT = 24;
export const CONTENT_BOTTOM_LIMIT = PAGE_MARGIN + FOOTER_HEIGHT;

// Colors - Strictly Monochrome
export const COLOR_BLACK = rgb(0.07, 0.07, 0.07);
export const COLOR_DARK_GRAY = rgb(0.33, 0.33, 0.33);
export const COLOR_GRAY = rgb(0.4, 0.4, 0.4);
export const COLOR_LIGHT_GRAY = rgb(0.75, 0.75, 0.75);
export const COLOR_EXTRA_LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
export const COLOR_BORDER = rgb(0.87, 0.87, 0.87);

export const FONT_SIZE_TITLE = 14;
export const FONT_SIZE_H2 = 12;
export const FONT_SIZE_TH = 9;
export const FONT_SIZE_BODY = 10;
export const FONT_SIZE_SMALL = 8;
export const FONT_SIZE_FOOTER = 8;

const CJK_FONT_ASSET_PATH = 'fonts/NotoSansCJKsc-Regular.otf';
const CJK_SUBSET = true;

function normalizeCommonPunctToAscii(s: string): string {
  if (!s) {
    return s;
  }
  return s
    .replace(/\u2014/g, '-') // em dash → hyphen
    .replace(/\u2013/g, '-') // en dash → hyphen
    .replace(/\u2212/g, '-') // minus sign → hyphen
    .replace(/\u00A0/g, ' '); // nbsp → space
}

function hasNonAsciiPrintable(s: string): boolean {
  return /[^\x20-\x7E]/.test(s);
}

function hasTrulyNonLatin(s: string): boolean {
  const normalized = normalizeCommonPunctToAscii(s);
  return hasNonAsciiPrintable(normalized);
}

function hasNonLatin(s: string): boolean {
  return hasNonAsciiPrintable(s);
}

function sanitizeTitleText(s: string): string {
  if (!s) {
    return s;
  }
  const normalized = normalizeCommonPunctToAscii(s);
  if (hasTrulyNonLatin(normalized)) {
    return '[Non-Latin title omitted]';
  }
  return normalized;
}

function sanitizeBodyText(s: string): string {
  if (!s) {
    return s;
  }
  const normalized = normalizeCommonPunctToAscii(s);
  if (hasTrulyNonLatin(normalized)) {
    return '[Non-Latin text omitted]';
  }
  return normalized;
}

export class PdfBuilder {
  doc: PDFDocument;
  fontCjk: PDFFont | null = null;
  fontAscii!: PDFFont;
  fontAsciiBold!: PDFFont;
  fontMono!: PDFFont;

  fontRegular!: PDFFont;
  fontBold!: PDFFont;
  private nonLatinOmitted = false;
  private widthCache = new Map<string, number>();
  private wrapCache = new Map<string, string[]>();
  private fontIdentity = new WeakMap<PDFFont, number>();
  private nextFontIdentity = 1;
  private widthCallCount = 0;
  private widthCacheHitCount = 0;
  private wrapCacheHitCount = 0;
  private wrapTimeMs = 0;

  currentPage!: PDFPage;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  pageCount: number = 0;

  constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  registerFontkit() {
    this.doc.registerFontkit(fontkit);
  }

  private getFontIdentity(font: PDFFont): number {
    const existing = this.fontIdentity.get(font);
    if (existing) {
      return existing;
    }
    const next = this.nextFontIdentity++;
    this.fontIdentity.set(font, next);
    return next;
  }

  private getTextWidth(font: PDFFont, size: number, text: string): number {
    this.widthCallCount++;
    const fontId = this.getFontIdentity(font);
    const key = `${fontId}|${size}|${text}`;
    const cached = this.widthCache.get(key);
    if (cached !== undefined) {
      this.widthCacheHitCount++;
      return cached;
    }
    const width = font.widthOfTextAtSize(text, size);
    this.widthCache.set(key, width);
    return width;
  }

  pickFontForText(
    text: string,
    preferredType: 'regular' | 'bold' | 'mono' = 'regular',
  ): PDFFont {
    const t = text || '';
    const hasNonAsciiPrintable = hasNonLatin(t);
    if (!hasNonAsciiPrintable || !PDF_FEATURES.ENABLE_CJK || !this.fontCjk) {
      if (preferredType === 'mono') {
        return this.fontMono;
      }
      if (preferredType === 'bold') {
        return this.fontAsciiBold;
      }
      return this.fontAscii;
    }
    if (preferredType === 'mono') {
      return this.fontMono;
    }
    if (preferredType === 'bold') {
      return this.fontBold || this.fontCjk;
    }
    return this.fontRegular || this.fontCjk;
  }

  private sanitizeForKind(text: string, kind: 'title' | 'body' | 'code') {
    const value = text || '';
    if (PDF_FEATURES.ENABLE_CJK) {
      return value;
    }
    if (hasNonLatin(value)) {
      this.nonLatinOmitted = true;
    }
    if (kind === 'title') {
      return sanitizeTitleText(value);
    }
    return sanitizeBodyText(value);
  }

  private drawTextSafeOnPage(
    page: PDFPage,
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      color: any;
      font?: PDFFont;
      kind: 'title' | 'body' | 'code';
      bold?: boolean;
      maxWidth?: number;
      lineHeight?: number;
      rotate?: any;
      opacity?: number;
    },
  ) {
    const source = this.sanitizeForKind(text, options.kind);
    const sanitized = sanitizePdfText(source);
    assertNoPuaChars(sanitized, 'drawTextSafe');

    const fontType =
      options.kind === 'code' ? 'mono' : options.bold ? 'bold' : 'regular';
    const usedFont = options.font || this.pickFontForText(sanitized, fontType);

    page.drawText(sanitized, {
      x: options.x,
      y: options.y,
      size: options.size,
      font: usedFont,
      color: options.color,
      rotate: options.rotate,
      opacity: options.opacity,
    });
  }

  drawTextSafe(
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      color: any;
      font?: PDFFont;
      fontType?: 'regular' | 'bold' | 'mono';
      kind?: 'title' | 'body' | 'code';
    },
  ) {
    const kind =
      options.kind ||
      (options.fontType === 'mono'
        ? 'code'
        : options.fontType === 'bold'
        ? 'title'
        : 'body');
    this.drawTextSafeOnPage(this.currentPage, text, {
      x: options.x,
      y: options.y,
      size: options.size,
      color: options.color,
      font: options.font,
      kind,
      bold: options.fontType === 'bold',
    });
  }

  wrapLines(font: PDFFont, text: string, fontSize: number, maxWidth: number) {
    const start = Date.now();
    const sanitized = sanitizePdfText(text);
    const input = sanitized.replace(/\r\n/g, '\n');
    const sections = input.split('\n');
    const resultLines: string[] = [];
    const spaceWidth = this.getTextWidth(font, fontSize, ' ');

    try {
      for (const section of sections) {
        if (!section) {
          resultLines.push('');
          continue;
        }

        const isCjkSection =
          /[^\x00-\x7F]/.test(section) && !/\s/.test(section);
        if (isCjkSection) {
          const chars = Array.from(section);
          let currentLine = chars[0] || '';
          let currentLineWidth = currentLine
            ? this.getTextWidth(font, fontSize, currentLine)
            : 0;

          for (let i = 1; i < chars.length; i++) {
            const char = chars[i];
            const charWidth = this.getTextWidth(font, fontSize, char);
            const nextWidth = currentLineWidth + charWidth;
            if (nextWidth < maxWidth) {
              currentLine += char;
              currentLineWidth = nextWidth;
            } else {
              resultLines.push(currentLine);
              currentLine = char;
              currentLineWidth = charWidth;
            }
          }
          resultLines.push(currentLine);
          continue;
        }

        const words = section.split(' ');
        let currentLine = words[0];
        let currentLineWidth = this.getTextWidth(font, fontSize, currentLine);

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const wordWidth = this.getTextWidth(font, fontSize, word);
          const nextWidth = currentLineWidth + spaceWidth + wordWidth;
          if (nextWidth < maxWidth) {
            currentLine += ` ${word}`;
            currentLineWidth = nextWidth;
          } else {
            resultLines.push(currentLine);
            currentLine = word;
            currentLineWidth = wordWidth;
          }
        }
        resultLines.push(currentLine);
      }
    } finally {
      this.wrapTimeMs += Date.now() - start;
    }
    return resultLines;
  }

  private getWrappedLines(
    font: PDFFont,
    text: string,
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const fontId = this.getFontIdentity(font);
    const key = `${fontId}|${fontSize}|${maxWidth}|${text}`;
    const cached = this.wrapCache.get(key);
    if (cached) {
      this.wrapCacheHitCount++;
      return cached;
    }
    const lines = this.wrapLines(font, text, fontSize, maxWidth);
    this.wrapCache.set(key, lines);
    return lines;
  }

  measureWrappedHeight(
    text: string,
    options: {
      font: PDFFont;
      size: number;
      maxWidth: number;
      lineHeight?: number;
      kind?: 'title' | 'body' | 'code';
    },
  ) {
    const sanitizedForKind = this.sanitizeForKind(text, options.kind || 'body');
    const lines = this.getWrappedLines(
      options.font || this.fontRegular,
      sanitizedForKind,
      options.size,
      options.maxWidth,
    );
    const lh = options.lineHeight || options.size * 1.2;
    return lines.length * lh;
  }

  drawWrappedText(
    text: string,
    options: {
      x: number;
      y: number;
      font?: PDFFont;
      size: number;
      color: any;
      maxWidth: number;
      lineHeight?: number;
      fontType?: 'regular' | 'bold' | 'mono';
      kind?: 'title' | 'body' | 'code';
    },
  ): {heightUsed: number} {
    const kind =
      options.kind ||
      (options.fontType === 'mono'
        ? 'code'
        : options.fontType === 'bold'
        ? 'title'
        : 'body');
    const kindSanitized = this.sanitizeForKind(text, kind);
    const sanitizedAll = sanitizePdfText(kindSanitized);
    const wrapFont =
      options.font ||
      this.pickFontForText(sanitizedAll, options.fontType || 'regular');

    const lines = this.getWrappedLines(
      wrapFont,
      sanitizedAll,
      options.size,
      options.maxWidth,
    );
    const lh = options.lineHeight || options.size * 1.2;

    lines.forEach((line, i) => {
      this.drawTextSafe(line, {
        x: options.x,
        y: options.y - i * lh,
        size: options.size,
        color: options.color,
        fontType: options.fontType,
        kind,
      });
    });

    return {heightUsed: lines.length * lh};
  }

  async init() {
    this.fontAscii = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontAsciiBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.fontMono = await this.doc.embedFont(StandardFonts.Courier);
    this.fontCjk = null;

    if (PDF_FEATURES.ENABLE_CJK) {
      let fontBase64: string;
      if (Platform.OS === 'android') {
        fontBase64 = await RNFS.readFileAssets(CJK_FONT_ASSET_PATH, 'base64');
      } else {
        const fileName = CJK_FONT_ASSET_PATH.split('/').pop()!;
        const flatPath = `${RNFS.MainBundlePath}/${fileName}`;
        if (await RNFS.exists(flatPath)) {
          fontBase64 = await RNFS.readFile(flatPath, 'base64');
        } else {
          const strictPath = `${RNFS.MainBundlePath}/${CJK_FONT_ASSET_PATH}`;
          fontBase64 = await RNFS.readFile(strictPath, 'base64');
        }
      }
      const fontBytes = Buffer.from(fontBase64, 'base64');
      this.fontCjk = await this.doc.embedFont(fontBytes, {subset: CJK_SUBSET});
    }

    this.fontRegular = this.fontCjk || this.fontAscii;
    this.fontBold = this.fontCjk || this.fontAsciiBold;

    this.addNewPage();
  }

  addNewPage() {
    this.currentPage = this.doc.addPage();
    const {width, height} = this.currentPage.getSize();
    this.width = width;
    this.height = height;
    this.y = height - PAGE_MARGIN;
    this.pageCount++;
  }

  checkPageBreak(neededHeight: number) {
    const MIN_ROWS_BUFFER = 2; // 🔥 关键

    if (this.y - neededHeight * MIN_ROWS_BUFFER < CONTENT_BOTTOM_LIMIT) {
      this.addNewPage();
      return true;
    }
    return false;
  }

  moveDown(amount: number) {
    this.y -= amount;
  }

  drawDivider(
    y: number = this.y,
    thickness: number = 0.5,
    color: any = COLOR_BORDER,
  ) {
    this.currentPage.drawLine({
      start: {x: PAGE_MARGIN, y},
      end: {x: this.width - PAGE_MARGIN, y},
      thickness,
      color,
    });
  }

  /**
   * Free watermark (方案 A): 斜向居中大水印
   * - 每页绘制
   * - 默认 -30°，低透明度
   * - 使用现有字体选择逻辑（支持 CJK）
   * - 不参与布局，不影响分页/光标，不影响 hash（由调用方控制时机）
   */
  addWatermarkToAllPages(opts?: {
    line1?: string;
    line2?: string;
    rotationDegrees?: number; // -30 or 45
    opacity?: number; // 0.12 - 0.18
    color?: {r: number; g: number; b: number}; // 0..1
  }) {
    const line1 = sanitizePdfText(opts?.line1 ?? 'Passeo');
    const line2 = sanitizePdfText(opts?.line2 ?? 'FREE VERSION');

    const rotation =
      typeof opts?.rotationDegrees === 'number' ? opts.rotationDegrees : -30;

    const opacity =
      typeof opts?.opacity === 'number'
        ? Math.max(0, Math.min(1, opts.opacity))
        : 0.15;

    console.log('[PDF] watermark called', {rotation, opacity});

    const color = opts?.color
      ? rgb(opts.color.r, opts.color.g, opts.color.b)
      : rgb(0.6, 0.6, 0.6);

    // NOTE: do NOT cache pages at constructor time; use doc.getPages() here.
    const pages = this.doc.getPages();

    for (const page of pages) {
      const {width, height} = page.getSize();

      // Big, but safe across different page sizes.
      // 0.12 * minDim ~= 71 for A4/Letter (~595x842 / 612x792)
      const minDim = Math.min(width, height);
      const fontSize = Math.max(56, Math.min(84, Math.floor(minDim * 0.12)));
      const lineGap = Math.max(14, Math.floor(fontSize * 0.32));

      // Place slightly above vertical center to further avoid footer
      const centerX = width / 2;
      const centerY = height / 2 + FOOTER_HEIGHT * 0.35;

      const rotate = degrees(rotation);

      // Pick font for each line (CJK supported)
      const font1 = this.pickFontForText(line1, 'bold');
      const font2 = this.pickFontForText(line2, 'bold');

      const w1 = this.getTextWidth(font1, fontSize, line1);
      const w2 = this.getTextWidth(font2, fontSize, line2);

      const x1 = centerX - w1 / 2;
      const x2 = centerX - w2 / 2;

      // --- spacing (avoid overlap) ---
      const gap = Math.max(18, Math.floor(fontSize * 0.35)); // gap between lines
      const totalH = fontSize * 2 + gap;

      // PDF y is baseline-bottom, so compute bottom baselines explicitly
      const y2 = centerY - totalH / 2; // bottom line baseline
      const y1 = y2 + fontSize + gap; // top line baseline

      // Use drawTextSafeOnPage so we keep sanitize/assert logic consistent
      this.drawTextSafeOnPage(page, line1, {
        x: x1,
        y: y1,
        size: fontSize,
        color,
        kind: 'title',
        bold: true,
        rotate,
        opacity,
      });

      this.drawTextSafeOnPage(page, line2, {
        x: x2,
        y: y2,
        size: fontSize,
        color,
        kind: 'title',
        bold: true,
        rotate,
        opacity,
      });
    }
  }

  async addFooterToAllPages(reportId: string, isPro = false, shortHash = '') {
    const pages = this.doc.getPages();
    const totalPages = pages.length;
    const row1Y = PAGE_MARGIN - 14;
    const row2Y = PAGE_MARGIN - 22;
    const row1Size = 7;
    const row2Size = 6.5;

    const reportIdDisplay = sanitizePdfText(reportId);
    assertNoPuaChars(reportIdDisplay, 'footer reportId');

    pages.forEach((page, idx) => {
      const {width} = page.getSize();
      const pageNum = sanitizePdfText(`Page ${idx + 1} of ${totalPages}`);

      const idText = sanitizePdfText(`Report ID: ${reportIdDisplay}`);
      this.drawTextSafeOnPage(page, idText, {
        x: PAGE_MARGIN,
        y: row1Y,
        size: row1Size,
        color: COLOR_GRAY,
        kind: 'title',
      });

      const numFont = this.pickFontForText(pageNum, 'regular');
      const numWidth = this.getTextWidth(numFont, row1Size, pageNum);
      this.drawTextSafeOnPage(page, pageNum, {
        x: (width - numWidth) / 2,
        y: row1Y,
        size: row1Size,
        color: COLOR_GRAY,
        kind: 'body',
      });

      const brandText = BRANDING.pdf.footerBrandText;
      const brandFont = this.pickFontForText(brandText, 'regular');
      const brandWidth = this.getTextWidth(brandFont, row1Size, brandText);
      this.drawTextSafeOnPage(page, brandText, {
        x: width - PAGE_MARGIN - brandWidth,
        y: row1Y,
        size: row1Size,
        color: COLOR_LIGHT_GRAY,
        kind: 'body',
      });

      if (isPro && shortHash) {
        const hashText = sanitizePdfText(`Verification: ${shortHash}`);
        assertNoPuaChars(hashText, 'footer verification');
        const hashFont = this.pickFontForText(hashText, 'mono');
        const hashWidth = this.getTextWidth(hashFont, row2Size, hashText);
        this.drawTextSafeOnPage(page, hashText, {
          x: width - PAGE_MARGIN - hashWidth,
          y: row2Y,
          size: row2Size,
          color: COLOR_LIGHT_GRAY,
          kind: 'code',
        });
      }
    });
  }

  logPerfStats(): void {
    console.log(
      `[PDF PERF] widthOfTextAtSize calls=${this.widthCallCount} cacheHits=${this.widthCacheHitCount}`,
    );
    console.log(
      `[PDF PERF] wrapCacheHits=${this.wrapCacheHitCount} wrapTimeMs=${this.wrapTimeMs}`,
    );
  }

  hadNonLatinOmission(): boolean {
    return this.nonLatinOmitted;
  }
}
