// src/services/pdf/sessionParticipantsPdf.ts
/**
 * Session Participants PDF export.
 *
 * Fully standalone — shares NO layout constants or drawing functions with
 * reportPdfService.ts.  The summary PDF in reportPdfService.ts is completely
 * unaffected by changes here.
 *
 * Layout:
 *   Header  (title + generated date / club + session name / session date)
 *   Hero    (Total Participation — light-blue card, large centred number)
 *   KPI row (Check-ins | Unique Members — white bordered cards)
 *   Section (Attendees (N) — light-gray strip)
 *   Table   (paged, with repeated header on overflow)
 *   Footer  (Report ID / Page X of Y / attribution — via PdfBuilder)
 */

import {PDFDocument, rgb} from 'pdf-lib';
import {Buffer} from 'buffer';
import {Alert, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';

import {BRANDING} from '../../config/branding';
import {PdfBuilder, PAGE_MARGIN, CONTENT_BOTTOM_LIMIT} from './PdfBuilder';
import type {
  SessionAttendeesResponse,
  SessionAttendeeItem,
} from '../api/reportApi';

// ─── Output directory ─────────────────────────────────────────────────────────

const REPORTS_DIR = `${RNFS.DocumentDirectoryPath}/Passeo/reports`;

async function ensureDir(): Promise<void> {
  if (!(await RNFS.exists(REPORTS_DIR))) {
    await RNFS.mkdir(REPORTS_DIR);
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmtShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function fmtGenerated(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const GAP = 28; // vertical spacing between main sections
const SEC_GAP = 14; // spacing after a section header strip

// Typography
const T_TITLE = 22;
const T_SUBTITLE = 14;
const T_META = 9;
const T_HERO_VAL = 52; // larger, more dominant
const T_HERO_LBL = 10; // slightly smaller, lighter feel
const T_METRIC_VAL = 22; // increased for readability
const T_METRIC_LBL = 9;
const T_SECTION = 11;
const T_TH = 8;
const T_BODY = 10;
const T_SMALL = 8; // bottom summary line

// Palette — independent from reportPdfService
const C_INK = rgb(0.067, 0.067, 0.067); // #111
const C_SECONDARY = rgb(0.4, 0.4, 0.4); // #666
const C_MUTED = rgb(0.6, 0.6, 0.6);
const C_DIVIDER = rgb(0.898, 0.898, 0.898); // #E5E5E5
const C_BORDER = rgb(0.8, 0.84, 0.92); // crisper card borders
const C_HERO_BG = rgb(0.933, 0.961, 1.0); // #EEF5FF — clean pale blue
const C_HERO_BDR = rgb(0.72, 0.82, 0.95); // slightly stronger hero border
const C_CARD_BG = rgb(0.988, 0.992, 1.0); // near-white with blue tint
const C_CARD_BDR = rgb(0.82, 0.86, 0.93); // card border
const C_LIGHT_BG = rgb(0.969, 0.973, 0.98); // #F7F8FA section header
const C_TABLE_SECTION_BG = rgb(0.976, 0.98, 0.988); // subtle attendees wrapper
const C_TH_BG = rgb(0.965, 0.969, 0.976); // slightly tinted TH
const C_STRIPE = rgb(0.99, 0.992, 0.996); // very subtle row stripe
const C_ROW_LINE = rgb(0.922, 0.925, 0.933); // row divider

// Sizing
const HERO_H = 100; // taller hero card — more presence
const CARD_H = 74; // taller KPI cards
const CARD_GAP = 14; // more breathing room between cards
const STRIP_H = 34; // section title strip
const TH_H = 26; // table header row
const ROW_H = 30; // taller rows — more readable

// ─── Column spec ──────────────────────────────────────────────────────────────

type Col = {
  header: string;
  widthFraction: number;
  align?: 'left' | 'right';
  bold?: boolean;
};

const ATTENDEE_COLS: Col[] = [
  {header: 'Name', widthFraction: 0.26},
  {header: 'Method', widthFraction: 0.23},
  {header: 'Credits', widthFraction: 0.33, align: 'right', bold: true},
  {header: 'Checked In', widthFraction: 0.18},
];

// ─── Low-level drawing primitive ─────────────────────────────────────────────

function fillRect(
  b: PdfBuilder,
  x: number,
  yTop: number,
  w: number,
  h: number,
  fill: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>,
  bw?: number,
) {
  b.currentPage.drawRectangle({
    x,
    y: yTop - h,
    width: w,
    height: h,
    color: fill,
    borderColor,
    borderWidth: bw ?? 0,
  });
}

// ─── Section drawing functions ────────────────────────────────────────────────

function drawHeader(
  b: PdfBuilder,
  title: string,
  subtitle: string,
  dateLine: string,
) {
  b.moveDown(8);
  const baseY = b.y;

  // Report title (left) + generated date (right) on same baseline
  b.drawTextSafe(title, {
    x: PAGE_MARGIN,
    y: baseY,
    size: T_TITLE,
    color: C_INK,
    fontType: 'bold',
    kind: 'title',
  });

  const genText = `Generated on ${fmtGenerated()}`;
  const genW = b.fontAscii.widthOfTextAtSize(genText, T_META);
  b.drawTextSafe(genText, {
    x: b.width - PAGE_MARGIN - genW,
    y: baseY,
    size: T_META,
    color: C_MUTED,
    fontType: 'regular',
    kind: 'body',
  });

  b.moveDown(26);

  // Club + session label
  b.drawTextSafe(subtitle, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SUBTITLE,
    color: C_INK,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(17);

  // Session date
  b.drawTextSafe(dateLine, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_META,
    color: C_SECONDARY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(18);

  b.drawDivider(b.y, 0.5, C_DIVIDER);
  b.moveDown(GAP);
}

function drawHero(b: PdfBuilder, value: string, label: string) {
  const cw = b.width - PAGE_MARGIN * 2;
  b.checkPageBreak(HERO_H + GAP + 8);
  const topY = b.y;

  // Clean pale-blue card with soft border
  fillRect(b, PAGE_MARGIN, topY, cw, HERO_H, C_HERO_BG, C_HERO_BDR, 1);

  // Large centred value — 52pt, dominant
  const valFont = b.pickFontForText(value, 'bold');
  const valW = valFont.widthOfTextAtSize(value, T_HERO_VAL);
  b.drawTextSafe(value, {
    x: PAGE_MARGIN + (cw - valW) / 2,
    y: topY - 50,
    size: T_HERO_VAL,
    color: C_INK,
    fontType: 'bold',
    kind: 'body',
  });

  // Smaller muted label
  const lblFont = b.pickFontForText(label, 'regular');
  const lblW = lblFont.widthOfTextAtSize(label, T_HERO_LBL);
  b.drawTextSafe(label, {
    x: PAGE_MARGIN + (cw - lblW) / 2,
    y: topY - 72,
    size: T_HERO_LBL,
    color: C_MUTED,
    fontType: 'regular',
    kind: 'body',
  });

  b.moveDown(HERO_H + GAP);
}

function drawKpiRow(
  b: PdfBuilder,
  items: Array<{value: string; label: string}>,
) {
  if (!items.length) {
    return;
  }

  const cw = b.width - PAGE_MARGIN * 2;
  const totalGaps = CARD_GAP * (items.length - 1);
  const cardW = (cw - totalGaps) / items.length;

  b.checkPageBreak(CARD_H + GAP + 4);
  const topY = b.y;

  items.forEach((item, i) => {
    const x = PAGE_MARGIN + i * (cardW + CARD_GAP);

    // Near-white tinted card with crisper border
    fillRect(b, x, topY, cardW, CARD_H, C_CARD_BG, C_CARD_BDR, 1);

    const vFont = b.pickFontForText(item.value, 'bold');
    const vW = vFont.widthOfTextAtSize(item.value, T_METRIC_VAL);
    b.drawTextSafe(item.value, {
      x: x + (cardW - vW) / 2,
      y: topY - 30,
      size: T_METRIC_VAL,
      color: C_INK,
      fontType: 'bold',
      kind: 'body',
    });

    const lFont = b.pickFontForText(item.label, 'regular');
    const lW = lFont.widthOfTextAtSize(item.label, T_METRIC_LBL);
    b.drawTextSafe(item.label, {
      x: x + (cardW - lW) / 2,
      y: topY - 52,
      size: T_METRIC_LBL,
      color: C_SECONDARY,
      fontType: 'regular',
      kind: 'body',
    });
  });

  b.moveDown(CARD_H + GAP);
}

function drawSectionHeader(b: PdfBuilder, title: string) {
  const cw = b.width - PAGE_MARGIN * 2;
  b.checkPageBreak(STRIP_H + SEC_GAP + 4);
  const topY = b.y;

  // #F7F8FA strip with 1px bottom divider
  fillRect(b, PAGE_MARGIN, topY, cw, STRIP_H, C_LIGHT_BG, C_DIVIDER, 0.5);

  b.drawTextSafe(title, {
    x: PAGE_MARGIN + 12,
    y: topY - STRIP_H + 12,
    size: T_SECTION,
    color: C_INK,
    fontType: 'bold',
    kind: 'title',
  });

  b.moveDown(STRIP_H);
  b.moveDown(SEC_GAP);
}

// ─── Table drawing ────────────────────────────────────────────────────────────

function drawTableHeader(
  b: PdfBuilder,
  tableX: number,
  yTop: number,
  tableW: number,
) {
  // Slightly tinted header background
  fillRect(b, tableX, yTop, tableW, TH_H, C_TH_BG);

  // Bottom border on the header row
  b.currentPage.drawLine({
    start: {x: tableX, y: yTop - TH_H},
    end: {x: tableX + tableW, y: yTop - TH_H},
    thickness: 0.5,
    color: C_ROW_LINE,
  });

  let cx = tableX + 10; // slightly more inner padding
  for (const col of ATTENDEE_COLS) {
    const colW = tableW * col.widthFraction;
    const txt = col.header.toUpperCase();
    const tw = b.fontAscii.widthOfTextAtSize(txt, T_TH);
    b.drawTextSafe(txt, {
      x: col.align === 'right' ? cx + colW - 14 - tw : cx,
      y: yTop - TH_H + 9,
      size: T_TH,
      color: C_SECONDARY,
      fontType: 'bold',
      kind: 'title',
    });
    cx += colW;
  }
}

function drawTableRow(
  b: PdfBuilder,
  cells: string[],
  rowIndex: number,
  tableX: number,
  yTop: number,
  tableW: number,
) {
  if (rowIndex % 2 === 0) {
    fillRect(b, tableX, yTop, tableW, ROW_H, C_STRIPE);
  }

  let cx = tableX + 10; // match header inner padding
  for (let i = 0; i < ATTENDEE_COLS.length; i++) {
    const col = ATTENDEE_COLS[i];
    const colW = tableW * col.widthFraction;
    const raw = cells[i] ?? '';
    const text = raw.length > 40 ? `${raw.slice(0, 38)}…` : raw;
    const tw = b.fontAscii.widthOfTextAtSize(text, T_BODY);
    const isBold = col.bold === true;

    b.drawTextSafe(text, {
      x: col.align === 'right' ? cx + colW - 14 - tw : cx,
      y: yTop - ROW_H + 10, // vertically centred in taller row
      size: T_BODY,
      color: isBold ? C_INK : C_SECONDARY,
      fontType: isBold ? 'bold' : 'regular',
      kind: 'body',
    });
    cx += colW;
  }

  b.currentPage.drawLine({
    start: {x: tableX, y: yTop - ROW_H},
    end: {x: tableX + tableW, y: yTop - ROW_H},
    thickness: 0.3,
    color: C_ROW_LINE,
  });
}

function drawAttendeesSection(
  b: PdfBuilder,
  attendees: SessionAttendeeItem[],
  totalParticipation: number,
) {
  const tableW = b.width - PAGE_MARGIN * 2;
  const tableX = PAGE_MARGIN;
  const thBlockH = TH_H + 2;

  // ── Wrapper border tracking ─────────────────────────────────────────────────
  // We draw a subtle border rect around the table content, but ONLY when all
  // rows land on the same page as the section header.  If a page break occurs
  // the wrapper is skipped to avoid a cross-page coordinate mismatch that
  // would produce a giant empty rectangle on the continuation page.
  const wrapStartPage = b.currentPage;
  const wrapTopY = b.y;

  // ── Header / continuation helpers ──────────────────────────────────────────
  let isFirstHeader = true;

  function renderTH() {
    if (!isFirstHeader) {
      // Subtle "continued" label at the top of the continuation page
      b.moveDown(4);
      b.drawTextSafe('Attendees (continued)', {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_SMALL,
        color: C_MUTED,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(T_SMALL + 6);
    }
    isFirstHeader = false;
    drawTableHeader(b, tableX, b.y, tableW);
    b.moveDown(thBlockH);
  }

  // Small safety margin above footer so the last row never clips the footer line
  const SAFETY = 4;
  const minY = CONTENT_BOTTOM_LIMIT + SAFETY;

  // Helper: does `neededHeight` of content still fit on the current page?
  function fits(neededHeight: number): boolean {
    return b.y - neededHeight >= minY;
  }

  // Helper: start a fresh continuation page
  function newPage() {
    b.addNewPage();
  }

  // Ensure first header + at least one row fit; if not, open a new page first
  if (!fits(thBlockH + ROW_H)) {
    newPage();
  }
  renderTH();

  attendees.forEach((att, i) => {
    // Check whether the next row still fits on the current page
    if (!fits(ROW_H)) {
      newPage();
      // After a new page the continuation header needs room too
      if (!fits(thBlockH + ROW_H)) {
        // Extremely narrow page edge case — just render where we are
      }
      renderTH();
    }

    const getCheckInTypeLabel = (type: string): string => {
      const map: Record<string, string> = {
        live: 'Self Check-in',
        manual: 'Checked in by Host',
        backfill: 'Backfilled',
      };
      return map[type] ?? 'Unknown';
    };

    drawTableRow(
      b,
      [
        att.memberName,
        getCheckInTypeLabel(att.checkInType),
        `${att.creditsUsed} credit${att.creditsUsed !== 1 ? 's' : ''}${
          att.creditsUsed > 1 ? ' (includes guests)' : ''
        }`,
        fmtShort(att.checkedInAt),
      ],
      i,
      tableX,
      b.y,
      tableW,
    );
    b.moveDown(ROW_H);
  });

  // Bottom summary line
  b.moveDown(10);
  const summaryText =
    attendees.length === 0
      ? 'No attendees'
      : `${attendees.length} attendee${
          attendees.length !== 1 ? 's' : ''
        } \u2022 ${totalParticipation} total credits`;
  const sumFont = b.pickFontForText(summaryText, 'regular');
  const sumW = sumFont.widthOfTextAtSize(summaryText, T_SMALL);
  b.drawTextSafe(summaryText, {
    x: PAGE_MARGIN + (tableW - sumW) / 2, // centred
    y: b.y,
    size: T_SMALL,
    color: C_MUTED,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(T_SMALL + 4);

  // Draw the wrapper border — only when we're still on the same page the table
  // started on.  If rows pushed us to a new page the cross-page rect is skipped.
  if (b.currentPage === wrapStartPage) {
    const wrapBottomY = b.y;
    wrapStartPage.drawRectangle({
      x: tableX,
      y: wrapBottomY,
      width: tableW,
      height: wrapTopY - wrapBottomY,
      borderColor: rgb(0.82, 0.83, 0.86),
      borderWidth: 0.75,
    });
  }

  b.moveDown(14);
}

// ─── Write & open ─────────────────────────────────────────────────────────────

async function writePdf(doc: PDFDocument, path: string): Promise<void> {
  const bytes = await doc.save();
  if (!bytes?.length) {
    throw new Error('PDF generation produced empty output.');
  }
  const b64 = Buffer.from(bytes).toString('base64');
  if (!b64) {
    throw new Error('Failed to encode PDF as base64.');
  }
  await RNFS.writeFile(path, b64, 'base64');
  if (!(await RNFS.exists(path))) {
    throw new Error(`PDF file not found after write: ${path}`);
  }
}

async function openPdf(path: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await RNBlobUtil.android.actionViewIntent(path, 'application/pdf');
    } else {
      await RNBlobUtil.ios.openDocument(path);
    }
  } catch (err: any) {
    if (err?.code === 'ENOAPP') {
      Alert.alert(
        'No PDF Viewer',
        'The PDF was saved but no app is installed to open it. Install a PDF viewer and try again.',
      );
    } else {
      throw err;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates and opens a Session Participants PDF for a single session.
 * Called from SessionDetailScreen via the "Export PDF" button.
 */
export async function exportSessionParticipantsPdf(
  data: SessionAttendeesResponse,
  clubName: string,
): Promise<void> {
  await ensureDir();

  const fileDate = data.session.startsAt.slice(0, 10);
  const outputPath = `${REPORTS_DIR}/session-participants-${fileDate}.pdf`;

  const doc = await PDFDocument.create();
  doc.setProducer(BRANDING.pdf.producer);
  doc.setCreator(BRANDING.pdf.creator);

  const b = new PdfBuilder(doc);
  b.registerFontkit();
  await b.init();

  const sessionLabel =
    data.session.title ?? data.session.locationName ?? 'Session';
  const sessionDate = fmtShort(data.session.startsAt);

  // ── Header ──────────────────────────────────────────────────────────────────
  drawHeader(
    b,
    'Session Report',
    `${clubName} \u2014 ${sessionLabel}`,
    `Date: ${sessionDate}`,
  );

  // ── Hero: Total Credits Used ──────────────────────────────────────────────────────────
  drawHero(b, String(data.summary.totalParticipation), 'Total Credits Used');

  // ── KPI row: secondary metrics ───────────────────────────────────────────────
  drawKpiRow(b, [
    {label: 'Check-ins', value: String(data.summary.totalCheckIns)},
    {label: 'Unique Members', value: String(data.summary.uniqueMembers)},
  ]);

  // ── Attendees table ──────────────────────────────────────────────────────────
  const attendeeCount = data.attendees.length;
  drawSectionHeader(
    b,
    attendeeCount > 0 ? `Attendees (${attendeeCount})` : 'Attendees',
  );
  drawAttendeesSection(b, data.attendees, data.summary.totalParticipation);

  // ── Footer (Report ID / Page X of Y / attribution) ───────────────────────────
  await b.addFooterToAllPages(`session-${data.session.id.slice(0, 8)}`);

  await writePdf(doc, outputPath);
  await openPdf(outputPath);
}
