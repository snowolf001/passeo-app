// src/services/reportPdfService.ts
// Generates session and summary report PDFs using the existing PdfBuilder infrastructure.

import {PDFDocument, rgb} from 'pdf-lib';
import {Buffer} from 'buffer';
import {Alert, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';

import {BRANDING} from '../config/branding';
import {PdfBuilder, PAGE_MARGIN} from './pdf/PdfBuilder';
import type {
  SessionAttendeesResponse,
  SessionAttendeeItem,
  SessionsBreakdownResponse,
  SessionBreakdownItem,
} from './api/reportApi';

// ─── helpers ─────────────────────────────────────────────────────────────────

const REPORTS_DIR = `${RNFS.DocumentDirectoryPath}/Passeo/reports`;

async function ensureReportsDir(): Promise<void> {
  const exists = await RNFS.exists(REPORTS_DIR);
  if (!exists) {
    await RNFS.mkdir(REPORTS_DIR);
  }
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateLong(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function shortDateLabel(isoDate: string): string {
  try {
    const [yr, mo, dy] = isoDate.split('-').map(Number);
    return new Date(yr, mo - 1, dy).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate.slice(5);
  }
}

// ─── Layout constants ────────────────────────────────────────────────────────

const REPORT_GAP = 22;
const SECTION_GAP = 12;

// Typography
const T_TITLE = 22;
const T_SUBTITLE = 13;
const T_META = 9;
const T_HERO_VALUE = 54;
const T_HERO_LABEL = 11;
const T_TREND = 9;
const T_METRIC_VAL = 22;
const T_METRIC_LBL = 9;
const T_SECTION = 11;
const T_TH = 8;
const T_BODY = 10;
const T_SMALL = 8;

// Palette
const C_INK = rgb(0.067, 0.067, 0.067); // #111111
const C_SECONDARY = rgb(0.4, 0.4, 0.4); // #666666
const C_MUTED = rgb(0.6, 0.6, 0.6); // #999999
const C_DIVIDER = rgb(0.898, 0.898, 0.898); // #E5E5E5
const C_BORDER = rgb(0.85, 0.88, 0.92); // crisper than before
const C_LIGHT_BG = rgb(0.973, 0.98, 0.988); // #F8FAFC
const C_SECTION_BG = rgb(0.982, 0.986, 0.991);
const C_SECTION_HEADER_BG = rgb(0.94, 0.96, 0.98);
const C_TH_BG = rgb(0.98, 0.98, 0.98); // #FAFAFA
const C_STRIPE = rgb(0.992, 0.992, 0.992);
const C_ROW_LINE = rgb(0.933, 0.933, 0.933);
const C_HERO_BG = rgb(0.9, 0.94, 0.99);
const C_HERO_BORDER = rgb(0.76, 0.84, 0.95);
const C_CARD_BG = rgb(1, 1, 1);
const C_CHART_LINE = rgb(0.231, 0.51, 0.965); // #3B82F6
const C_AXIS = rgb(0.78, 0.78, 0.78);
const C_WHITE = rgb(1, 1, 1);

// Table
const TABLE_TH_H = 24;
const TABLE_ROW_H = 26;

// Chart
const CHART_HEIGHT = 108;
const CHART_HPAD = 10;
const CHART_Y_AXIS_W = 26;
const CHART_X_AXIS_H = 20;
const CHART_DOT_R = 3.8;

// Section shell
const SECTION_TITLE_H = 24;
const SECTION_INNER_PAD_X = 10;
const SECTION_INNER_PAD_BOTTOM = 10;

// Pagination tuning
const TABLE_CONTINUATION_TOP_PADDING = 2;
const TABLE_FIRST_HEADER_BUFFER = 4;
const TABLE_ROW_BUFFER = 0;
const TABLE_NEW_PAGE_HEADER_BUFFER = 2;

// ─── types ───────────────────────────────────────────────────────────────────

type SummaryItem = {
  label: string;
  value: string;
  trend?: string;
};

type Col = {
  header: string;
  widthFraction: number;
  align?: 'left' | 'right';
  bold?: boolean;
};

type TrendPoint = {
  date: string;
  participation: number;
};

// ─── PDF drawing helpers ─────────────────────────────────────────────────────

function drawBox(
  b: PdfBuilder,
  x: number,
  yTop: number,
  width: number,
  height: number,
  options: {
    background: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
  },
) {
  b.currentPage.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: options.background,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth ?? 0,
  });
}

function drawHeader(
  b: PdfBuilder,
  title: string,
  subtitle: string,
  meta: string,
) {
  b.moveDown(8);

  const titleY = b.y;
  b.drawTextSafe(title, {
    x: PAGE_MARGIN,
    y: titleY,
    size: T_TITLE,
    color: C_INK,
    fontType: 'bold',
    kind: 'title',
  });

  const genText = `Generated on ${formatDateLong()}`;
  const genW = b.fontAscii.widthOfTextAtSize(genText, T_META);
  b.drawTextSafe(genText, {
    x: b.width - PAGE_MARGIN - genW,
    y: titleY,
    size: T_META,
    color: C_SECONDARY,
    fontType: 'regular',
    kind: 'body',
  });

  b.moveDown(24);

  if (subtitle) {
    b.drawTextSafe(subtitle, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SUBTITLE,
      color: C_INK,
      fontType: 'bold',
      kind: 'body',
    });
    b.moveDown(14);
  }

  if (meta) {
    b.drawTextSafe(meta, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_META,
      color: C_SECONDARY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(16);
  }

  b.drawDivider(b.y, 0.5, C_DIVIDER);
  b.moveDown(REPORT_GAP);
}

function drawHeroMetric(b: PdfBuilder, item: SummaryItem) {
  const contentWidth = b.width - PAGE_MARGIN * 2;
  const cardH = item.trend ? 100 : 86;

  b.checkPageBreak(cardH + 12);

  const topY = b.y;

  drawBox(b, PAGE_MARGIN, topY, contentWidth, cardH, {
    background: C_HERO_BG,
    borderColor: C_HERO_BORDER,
    borderWidth: 0.9,
  });

  const valFont = b.pickFontForText(item.value, 'bold');
  const valW = valFont.widthOfTextAtSize(item.value, T_HERO_VALUE);
  b.drawTextSafe(item.value, {
    x: PAGE_MARGIN + (contentWidth - valW) / 2,
    y: topY - 49,
    size: T_HERO_VALUE,
    color: C_INK,
    fontType: 'bold',
    kind: 'body',
  });

  const labelFont = b.pickFontForText(item.label, 'regular');
  const labelW = labelFont.widthOfTextAtSize(item.label, T_HERO_LABEL);
  b.drawTextSafe(item.label, {
    x: PAGE_MARGIN + (contentWidth - labelW) / 2,
    y: topY - 69,
    size: T_HERO_LABEL,
    color: C_SECONDARY,
    fontType: 'regular',
    kind: 'body',
  });

  if (item.trend) {
    const trendFont = b.pickFontForText(item.trend, 'regular');
    const trendW = trendFont.widthOfTextAtSize(item.trend, T_TREND);
    b.drawTextSafe(item.trend, {
      x: PAGE_MARGIN + (contentWidth - trendW) / 2,
      y: topY - 79,
      size: T_TREND,
      color: C_SECONDARY,
      fontType: 'regular',
      kind: 'body',
    });
  }

  b.moveDown(cardH + 14);
}

function drawSummaryMetricsRow(b: PdfBuilder, items: SummaryItem[]) {
  if (!items.length) {
    return;
  }

  const contentWidth = b.width - PAGE_MARGIN * 2;
  const gap = 10;
  const cardH = 68;
  const totalGaps = gap * (items.length - 1);
  const cardW = (contentWidth - totalGaps) / items.length;

  b.checkPageBreak(cardH + 12);

  const topY = b.y;

  items.forEach((item, i) => {
    const x = PAGE_MARGIN + i * (cardW + gap);

    drawBox(b, x, topY, cardW, cardH, {
      background: C_CARD_BG,
      borderColor: C_BORDER,
      borderWidth: 1,
    });

    const valueFont = b.pickFontForText(item.value, 'bold');
    const valueW = valueFont.widthOfTextAtSize(item.value, T_METRIC_VAL);
    b.drawTextSafe(item.value, {
      x: x + (cardW - valueW) / 2,
      y: topY - 30,
      size: T_METRIC_VAL,
      color: C_INK,
      fontType: 'bold',
      kind: 'body',
    });

    const labelFont = b.pickFontForText(item.label, 'regular');
    const labelW = labelFont.widthOfTextAtSize(item.label, T_METRIC_LBL);
    b.drawTextSafe(item.label, {
      x: x + (cardW - labelW) / 2,
      y: topY - 49,
      size: T_METRIC_LBL,
      color: C_SECONDARY,
      fontType: 'regular',
      kind: 'body',
    });
  });

  b.moveDown(cardH + 18);
}

function drawSectionHeaderOnly(b: PdfBuilder, title: string) {
  const sectionX = PAGE_MARGIN;
  const sectionW = b.width - PAGE_MARGIN * 2;
  const shellH = SECTION_TITLE_H + 10;

  b.checkPageBreak(shellH + 8);

  const topY = b.y;

  drawBox(b, sectionX, topY, sectionW, shellH, {
    background: C_SECTION_BG,
    borderColor: C_BORDER,
    borderWidth: 0.6,
  });

  b.currentPage.drawRectangle({
    x: sectionX,
    y: topY - SECTION_TITLE_H,
    width: sectionW,
    height: SECTION_TITLE_H,
    color: C_SECTION_HEADER_BG,
    borderWidth: 0,
  });

  b.drawTextSafe(title, {
    x: sectionX + 12,
    y: topY - 16,
    size: T_SECTION,
    color: C_INK,
    fontType: 'bold',
    kind: 'title',
  });

  b.drawDivider(topY - SECTION_TITLE_H, 0.35, C_DIVIDER);
  b.moveDown(shellH + SECTION_GAP);
}

function drawTableHeader(
  b: PdfBuilder,
  cols: Col[],
  x: number,
  yTop: number,
  width: number,
) {
  b.currentPage.drawRectangle({
    x,
    y: yTop - TABLE_TH_H,
    width,
    height: TABLE_TH_H,
    color: C_TH_BG,
    borderWidth: 0,
  });

  let colX = x + 8;
  for (const col of cols) {
    const colW = width * col.widthFraction;
    const headerText = col.header.toUpperCase();
    const textW = b.fontAscii.widthOfTextAtSize(headerText, T_TH);

    b.drawTextSafe(headerText, {
      x: col.align === 'right' ? colX + colW - 12 - textW : colX,
      y: yTop - TABLE_TH_H + 8,
      size: T_TH,
      color: C_SECONDARY,
      fontType: 'bold',
      kind: 'title',
    });

    colX += colW;
  }
}

function drawTableRowAt(
  b: PdfBuilder,
  cols: Col[],
  cells: string[],
  rowIndex: number,
  x: number,
  yTop: number,
  width: number,
) {
  if (rowIndex % 2 === 0) {
    b.currentPage.drawRectangle({
      x,
      y: yTop - TABLE_ROW_H,
      width,
      height: TABLE_ROW_H,
      color: C_STRIPE,
      borderWidth: 0,
    });
  }

  let colX = x + 8;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const colW = width * col.widthFraction;
    const text = cells[i] ?? '';
    const truncated = text.length > 40 ? `${text.slice(0, 38)}…` : text;
    const textW = b.fontAscii.widthOfTextAtSize(truncated, T_BODY);
    const isBold = col.bold === true;

    b.drawTextSafe(truncated, {
      x: col.align === 'right' ? colX + colW - 12 - textW : colX,
      y: yTop - TABLE_ROW_H + 8,
      size: T_BODY,
      color: isBold ? C_INK : C_SECONDARY,
      fontType: isBold ? 'bold' : 'regular',
      kind: 'body',
    });

    colX += colW;
  }

  b.currentPage.drawLine({
    start: {x, y: yTop - TABLE_ROW_H},
    end: {x: x + width, y: yTop - TABLE_ROW_H},
    thickness: 0.3,
    color: C_ROW_LINE,
  });
}

function buildTrendData(sessions: SessionBreakdownItem[]): TrendPoint[] {
  const map = new Map<string, number>();

  for (const s of sessions) {
    const d = s.startsAt.slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + s.totalParticipation);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, participation]) => ({date, participation}));
}

function drawTrendChartSection(b: PdfBuilder, trendData: TrendPoint[]) {
  if (!trendData.length) {
    return;
  }

  const contentWidth = b.width - PAGE_MARGIN * 2;
  const chartShellH =
    SECTION_TITLE_H +
    10 +
    8 +
    (CHART_HEIGHT + 22 + CHART_X_AXIS_H) +
    SECTION_INNER_PAD_BOTTOM;

  b.checkPageBreak(chartShellH + 12);

  const shellX = PAGE_MARGIN;
  const shellW = contentWidth;
  const topY = b.y;

  drawBox(b, shellX, topY, shellW, chartShellH, {
    background: C_SECTION_BG,
    borderColor: C_BORDER,
    borderWidth: 0.6,
  });

  b.currentPage.drawRectangle({
    x: shellX,
    y: topY - SECTION_TITLE_H,
    width: shellW,
    height: SECTION_TITLE_H,
    color: C_SECTION_HEADER_BG,
    borderWidth: 0,
  });

  b.drawTextSafe('Credits Trend', {
    x: shellX + 12,
    y: topY - 16,
    size: T_SECTION,
    color: C_INK,
    fontType: 'bold',
    kind: 'title',
  });

  b.drawDivider(topY - SECTION_TITLE_H, 0.35, C_DIVIDER);

  const chartX = shellX + SECTION_INNER_PAD_X;
  const chartYTop = topY - SECTION_TITLE_H - 8;
  const chartW = shellW - SECTION_INNER_PAD_X * 2;
  const chartH = CHART_HEIGHT + 22 + CHART_X_AXIS_H;

  b.currentPage.drawRectangle({
    x: chartX,
    y: chartYTop - chartH,
    width: chartW,
    height: chartH,
    color: C_WHITE,
    borderColor: C_DIVIDER,
    borderWidth: 0.35,
  });

  const outerX = chartX + CHART_HPAD;
  const outerW = chartW - CHART_HPAD * 2;
  const plotLeft = outerX + CHART_Y_AXIS_W;
  const plotRight = outerX + outerW - 4;
  const plotTop = chartYTop - 14;
  const plotBottom = plotTop - CHART_HEIGHT;
  const plotW = plotRight - plotLeft;
  const plotH = plotTop - plotBottom;

  const maxVal = Math.max(...trendData.map(p => p.participation), 1);

  [0.25, 0.5, 0.75, 1].forEach(frac => {
    const gy = plotBottom + frac * plotH;
    b.currentPage.drawLine({
      start: {x: plotLeft, y: gy},
      end: {x: plotRight, y: gy},
      thickness: 0.3,
      color: C_DIVIDER,
    });

    const labelVal = Math.round(frac * maxVal);
    const label = String(labelVal);
    const lw = b.fontAscii.widthOfTextAtSize(label, 7);

    b.drawTextSafe(label, {
      x: plotLeft - lw - 6,
      y: gy - 3,
      size: 7,
      color: C_MUTED,
      fontType: 'regular',
      kind: 'body',
    });
  });

  b.currentPage.drawLine({
    start: {x: plotLeft, y: plotBottom},
    end: {x: plotLeft, y: plotTop},
    thickness: 0.5,
    color: C_AXIS,
  });

  b.currentPage.drawLine({
    start: {x: plotLeft, y: plotBottom},
    end: {x: plotRight, y: plotBottom},
    thickness: 0.5,
    color: C_AXIS,
  });

  const n = trendData.length;
  const pts = trendData.map((p, i) => ({
    x: n === 1 ? plotLeft + plotW / 2 : plotLeft + (i / (n - 1)) * plotW,
    y: plotBottom + (maxVal === 0 ? 0 : (p.participation / maxVal) * plotH),
  }));

  if (pts.length >= 2) {
    for (let i = 1; i < pts.length; i++) {
      b.currentPage.drawLine({
        start: {x: pts[i - 1].x, y: pts[i - 1].y},
        end: {x: pts[i].x, y: pts[i].y},
        thickness: 3,
        color: C_CHART_LINE,
      });
    }
  }

  const peakIdx = trendData.reduce(
    (mi, p, i, arr) => (p.participation > arr[mi].participation ? i : mi),
    0,
  );

  pts.forEach((pt, i) => {
    const isPeak = i === peakIdx;
    const r = isPeak ? CHART_DOT_R + 1.8 : CHART_DOT_R;

    if (isPeak) {
      b.currentPage.drawEllipse({
        x: pt.x,
        y: pt.y,
        xScale: r,
        yScale: r,
        color: C_CHART_LINE,
        borderWidth: 0,
      });

      const peakLabel = String(trendData[i].participation);
      const plw = b.fontAscii.widthOfTextAtSize(peakLabel, 7);
      b.drawTextSafe(peakLabel, {
        x: pt.x - plw / 2,
        y: pt.y + r + 5,
        size: 7,
        color: C_CHART_LINE,
        fontType: 'bold',
        kind: 'body',
      });
    } else {
      b.currentPage.drawEllipse({
        x: pt.x,
        y: pt.y,
        xScale: r,
        yScale: r,
        color: C_WHITE,
        borderColor: C_CHART_LINE,
        borderWidth: 1.3,
      });
    }
  });

  const maxLabels = 8;
  const step = n <= maxLabels ? 1 : Math.ceil(n / maxLabels);

  trendData.forEach((p, i) => {
    if (i % step !== 0 && i !== n - 1) {
      return;
    }

    const label = shortDateLabel(p.date);
    const lw = b.fontAscii.widthOfTextAtSize(label, 7);
    b.drawTextSafe(label, {
      x: pts[i].x - lw / 2,
      y: plotBottom - CHART_X_AXIS_H + 6,
      size: 7,
      color: C_MUTED,
      fontType: 'regular',
      kind: 'body',
    });

    b.currentPage.drawLine({
      start: {x: pts[i].x, y: plotBottom},
      end: {x: pts[i].x, y: plotBottom - 3},
      thickness: 0.4,
      color: C_AXIS,
    });
  });

  b.moveDown(chartShellH + 18);
}

function ensureSpaceOrNewPage(b: PdfBuilder, neededHeight: number): boolean {
  const beforeY = b.y;
  b.checkPageBreak(neededHeight);
  return b.y > beforeY;
}

function drawPagedTableSection<T>(
  b: PdfBuilder,
  title: string,
  rows: T[],
  cols: Col[],
  mapRow: (row: T) => string[],
) {
  const contentWidth = b.width - PAGE_MARGIN * 2;
  const tableX = PAGE_MARGIN;
  const tableW = contentWidth;
  const headerBlockH = TABLE_TH_H + 2;
  const rowBlockH = TABLE_ROW_H;

  drawSectionHeaderOnly(b, title);

  let rowIndex = 0;

  const drawRepeatedTableHeader = () => {
    drawTableHeader(b, cols, tableX, b.y, tableW);
    b.moveDown(headerBlockH);
  };

  ensureSpaceOrNewPage(b, headerBlockH + rowBlockH + TABLE_FIRST_HEADER_BUFFER);
  drawRepeatedTableHeader();

  for (const row of rows) {
    const movedToNewPage = ensureSpaceOrNewPage(
      b,
      rowBlockH + TABLE_ROW_BUFFER,
    );

    if (movedToNewPage) {
      b.moveDown(TABLE_CONTINUATION_TOP_PADDING);
      ensureSpaceOrNewPage(
        b,
        headerBlockH + rowBlockH + TABLE_NEW_PAGE_HEADER_BUFFER,
      );
      drawRepeatedTableHeader();
    }

    drawTableRowAt(b, cols, mapRow(row), rowIndex, tableX, b.y, tableW);
    b.moveDown(rowBlockH);
    rowIndex += 1;
  }

  b.moveDown(14);
}

function drawGeneratedLine(b: PdfBuilder) {
  const text = 'Generated by Passeo App';
  const font = b.pickFontForText(text, 'regular');
  const textW = font.widthOfTextAtSize(text, T_SMALL);

  b.checkPageBreak(24);
  b.drawTextSafe(text, {
    x: b.width - PAGE_MARGIN - textW,
    y: b.y,
    size: T_SMALL,
    color: C_MUTED,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(16);
}

// ─── Write & open helpers ─────────────────────────────────────────────────────

async function writePdf(
  doc: PDFDocument,
  outputPath: string,
  label: string,
): Promise<void> {
  const pdfBytes = await doc.save();
  if (!pdfBytes || pdfBytes.length === 0) {
    throw new Error('PDF generation produced empty output.');
  }

  const base64 = Buffer.from(pdfBytes).toString('base64');
  if (!base64) {
    throw new Error('Failed to encode PDF as base64.');
  }

  await RNFS.writeFile(outputPath, base64, 'base64');

  console.log(`[PDF Export] ${label} written to:`, outputPath);

  const exists = await RNFS.exists(outputPath);
  console.log(`[PDF Export] ${label} file exists:`, exists);

  if (!exists) {
    throw new Error(`PDF file was not found after write: ${outputPath}`);
  }
}

async function openPdf(outputPath: string): Promise<void> {
  const url = `file://${outputPath}`;
  const filename =
    outputPath
      .split('/')
      .pop()
      ?.replace(/\.pdf$/i, '') || 'report';

  try {
    await Share.open({
      url,
      filename,
      type: 'application/pdf',
      title: 'Share PDF',
      failOnCancel: false,
    });
  } catch (err: any) {
    const isCancel =
      err?.message === 'User did not share' ||
      err?.message === 'User canceled' ||
      err?.message === 'CANCELLED';

    if (isCancel) {
      return;
    }
    Alert.alert(
      'Sharing Failed',
      err?.message ?? 'An unknown error occurred while sharing the PDF.',
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportSessionReportPdf(
  data: SessionAttendeesResponse,
  clubName: string,
): Promise<string> {
  await ensureReportsDir();

  const sessionDate = formatDateShort(data.session.startsAt);
  const fileDate = data.session.startsAt.slice(0, 10);
  const fileName = `session-report-${fileDate}.pdf`;
  const outputPath = `${REPORTS_DIR}/${fileName}`;

  const doc = await PDFDocument.create();
  doc.setProducer(BRANDING.pdf.producer);
  doc.setCreator(BRANDING.pdf.creator);

  const b = new PdfBuilder(doc);
  b.registerFontkit();
  await b.init();

  const sessionLabel =
    data.session.title ?? data.session.locationName ?? 'Session';

  drawHeader(
    b,
    'Session Report',
    `${clubName} — ${sessionLabel}`,
    `Date: ${sessionDate}`,
  );

  drawHeroMetric(b, {
    label: 'Total Credits Used',
    value: String(data.summary.totalParticipation),
  });

  drawSummaryMetricsRow(b, [
    {label: 'Check-ins', value: String(data.summary.totalCheckIns)},
    {label: 'Unique Members', value: String(data.summary.uniqueMembers)},
  ]);

  drawPagedTableSection<SessionAttendeeItem>(
    b,
    'Attendees',
    data.attendees,
    [
      {header: 'Name', widthFraction: 0.26},
      {header: 'Method', widthFraction: 0.23},
      {header: 'Credits', widthFraction: 0.33, align: 'right'},
      {header: 'Checked In', widthFraction: 0.18},
    ],
    att => {
      const getCheckInTypeLabel = (type: string): string => {
        const map: Record<string, string> = {
          live: 'Self Check-in',
          manual: 'Checked in by Host',
          backfill: 'Backfilled',
        };
        return map[type] ?? 'Unknown';
      };

      return [
        att.memberName,
        getCheckInTypeLabel(att.checkInType),
        `${att.creditsUsed} credit${att.creditsUsed !== 1 ? 's' : ''}${
          att.creditsUsed > 1 ? ' (includes guests)' : ''
        }`,
        formatDateShort(att.checkedInAt),
      ];
    },
  );

  await b.addFooterToAllPages(`session-${data.session.id.slice(0, 8)}`);

  await writePdf(doc, outputPath, 'session report');
  return outputPath;
}

export async function exportSummaryReportPdf(
  data: SessionsBreakdownResponse,
  clubName: string,
  startDate: string,
  endDate: string,
  trend?: string,
): Promise<string> {
  await ensureReportsDir();

  const fileName = `attendance-summary-${startDate}_to_${endDate}.pdf`;
  const outputPath = `${REPORTS_DIR}/${fileName}`;

  const doc = await PDFDocument.create();
  doc.setProducer(BRANDING.pdf.producer);
  doc.setCreator(BRANDING.pdf.creator);

  const b = new PdfBuilder(doc);
  b.registerFontkit();
  await b.init();

  drawHeader(
    b,
    'Attendance Summary',
    clubName,
    `Period: ${startDate} to ${endDate}`,
  );

  drawHeroMetric(b, {
    label: 'Total Credits Used',
    value: String(data.summary.totalParticipation),
    trend,
  });

  drawSummaryMetricsRow(b, [
    {label: 'Unique Members', value: String(data.summary.uniqueMembers)},
    {label: 'Check-ins', value: String(data.summary.totalCheckIns)},
    {label: 'Sessions', value: String(data.summary.totalSessions)},
  ]);

  const trendData = buildTrendData(data.sessions);
  drawTrendChartSection(b, trendData);

  drawPagedTableSection<SessionBreakdownItem>(
    b,
    'Session Breakdown',
    data.sessions,
    [
      {header: 'Session', widthFraction: 0.4},
      {header: 'Date', widthFraction: 0.22},
      {header: 'Check-ins', widthFraction: 0.16, align: 'right'},
      {
        header: 'Credits',
        widthFraction: 0.22,
        align: 'right',
        bold: true,
      },
    ],
    s => [
      s.title ?? s.locationName ?? 'Session',
      formatDateShort(s.startsAt),
      String(s.totalCheckIns),
      String(s.totalParticipation),
    ],
  );

  drawGeneratedLine(b);

  await b.addFooterToAllPages(`summary-${startDate}-${endDate}`);

  await writePdf(doc, outputPath, 'summary report');
  return outputPath;
}
