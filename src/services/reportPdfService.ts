// src/services/reportPdfService.ts
// Generates text-based report PDFs using the existing PdfBuilder infrastructure.

import {PDFDocument, rgb} from 'pdf-lib';
import {Buffer} from 'buffer';
import {Alert, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';

import {BRANDING} from '../config/branding';
import {
  PdfBuilder,
  PAGE_MARGIN,
  COLOR_BLACK,
  COLOR_DARK_GRAY,
  COLOR_GRAY,
  FONT_SIZE_BODY,
} from './pdf/PdfBuilder';
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

// ─── Layout constants — Pro Report ─────────────────────────────────────────────

const REPORT_GAP = 26; // spacing between major sections

// Header typography
const HEADER_BRAND_SIZE = 8; // brand label (small, muted)
const HEADER_TITLE_SIZE = 24; // report title — primary document identity
const HEADER_SUBTITLE_SIZE = 15; // club name — medium emphasis
const HEADER_META_SIZE = 11; // period range — smaller, muted

// Hero KPI card — Total Participation (primary business metric)
const HERO_CARD_H = 100;
const HERO_VALUE_SIZE = 38;
const HERO_LABEL_SIZE = 12;
const HERO_BG = rgb(0.08, 0.08, 0.1); // near-black — premium, print-safe
const HERO_VALUE_COLOR = rgb(1, 1, 1); // white
const HERO_LABEL_COLOR = rgb(0.72, 0.72, 0.74); // muted silver

// Secondary KPI cards — Sessions / Check-ins / Unique Members
const SEC_CARD_H = 74;
const SEC_CARD_GAP = 10;
const SEC_VALUE_SIZE = 22;
const SEC_LABEL_SIZE = 9;
const SEC_BG = rgb(0.96, 0.96, 0.96);
const SEC_BORDER_COLOR = rgb(0.82, 0.82, 0.82);
const SEC_BORDER_W = 0.6;

// Section title strip
const SECTION_TITLE_SIZE = 13;
const SECTION_STRIP_H = 30;
const SECTION_STRIP_BG = rgb(0.94, 0.94, 0.94);

// Table
const TABLE_TH_H = 28;
const TABLE_TH_SIZE = 9;
const TABLE_TH_BG = rgb(0.1, 0.1, 0.12);
const TABLE_ROW_H = 23;
const TABLE_ROW_STRIPE = rgb(0.965, 0.965, 0.97);
const TABLE_ROW_DIVIDER = rgb(0.9, 0.9, 0.9);

// Generated-on footer line
const GENERATED_SIZE = 8;

// ─── PDF drawing helpers ──────────────────────────────────────────────────────

function drawHeader(
  b: PdfBuilder,
  title: string,
  subtitle: string,
  meta: string,
) {
  // Thin top accent rule — anchors the content block at the page top
  b.drawDivider(b.y + 2, 2.5, COLOR_BLACK);
  b.moveDown(18);

  // Brand label — small, muted, presented in uppercase for visual distinction
  b.drawTextSafe(BRANDING.appDisplayName.toUpperCase(), {
    x: PAGE_MARGIN,
    y: b.y,
    size: HEADER_BRAND_SIZE,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(18);

  // Report title — the document's primary identity, large and bold
  b.drawTextSafe(title, {
    x: PAGE_MARGIN,
    y: b.y,
    size: HEADER_TITLE_SIZE,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });
  b.moveDown(26);

  // Club name — medium emphasis, bold to distinguish from meta below
  if (subtitle) {
    b.drawTextSafe(subtitle, {
      x: PAGE_MARGIN,
      y: b.y,
      size: HEADER_SUBTITLE_SIZE,
      color: COLOR_DARK_GRAY,
      fontType: 'bold',
      kind: 'body',
    });
    b.moveDown(16);
  }

  // Period / date range — smaller and muted
  if (meta) {
    b.drawTextSafe(meta, {
      x: PAGE_MARGIN,
      y: b.y,
      size: HEADER_META_SIZE,
      color: COLOR_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(20);
  }

  // Strong divider — visual break between header identity and KPI section
  b.drawDivider(b.y, 1.8, COLOR_BLACK);
  b.moveDown(REPORT_GAP);
}

type SummaryItem = {label: string; value: string};

/**
 * Draws the Pro KPI section in a two-tier hero layout:
 *
 *   ┌──────────────────────────────────────┐
 *   │         6  ← large bold white        │  hero card — dark, full width
 *   │   Total Participation                │
 *   └──────────────────────────────────────┘
 *   ┌──────────┐  ┌──────────┐  ┌──────────┐
 *   │    11    │  │    5     │  │    3     │  secondary cards — light, bordered
 *   │ Sessions │  │Check-ins │  │ Unique   │
 *   └──────────┘  └──────────┘  └──────────┘
 *
 * heroItem      — Total Participation: the primary business KPI.
 *                 Full-width near-black card, white bold value, max visual weight.
 * secondaryItems — supporting KPIs: equal-width bordered cards, lighter styling.
 */
function drawHeroKpiSection(
  b: PdfBuilder,
  heroItem: SummaryItem,
  secondaryItems: SummaryItem[],
) {
  const contentWidth = b.width - PAGE_MARGIN * 2;

  // ── Hero card ──────────────────────────────────────────────────────────────
  b.checkPageBreak(HERO_CARD_H + 16);
  const heroTopY = b.y;

  b.currentPage.drawRectangle({
    x: PAGE_MARGIN,
    y: heroTopY - HERO_CARD_H,
    width: contentWidth,
    height: HERO_CARD_H,
    color: HERO_BG,
    borderWidth: 0,
  });

  // Large value — horizontally centred; baseline at ~44pt from card top
  const heroValFont = b.pickFontForText(heroItem.value, 'bold');
  const heroValW = heroValFont.widthOfTextAtSize(
    heroItem.value,
    HERO_VALUE_SIZE,
  );
  b.drawTextSafe(heroItem.value, {
    x: PAGE_MARGIN + (contentWidth - heroValW) / 2,
    y: heroTopY - 44,
    size: HERO_VALUE_SIZE,
    color: HERO_VALUE_COLOR,
    fontType: 'bold',
    kind: 'body',
  });

  // Label — centred below value; baseline at ~72pt from card top
  const heroLblFont = b.pickFontForText(heroItem.label, 'bold');
  const heroLblW = heroLblFont.widthOfTextAtSize(
    heroItem.label,
    HERO_LABEL_SIZE,
  );
  b.drawTextSafe(heroItem.label, {
    x: PAGE_MARGIN + (contentWidth - heroLblW) / 2,
    y: heroTopY - 72,
    size: HERO_LABEL_SIZE,
    color: HERO_LABEL_COLOR,
    fontType: 'bold',
    kind: 'body',
  });

  b.moveDown(HERO_CARD_H + 10);

  // ── Secondary cards ────────────────────────────────────────────────────────
  if (!secondaryItems.length) {
    b.moveDown(REPORT_GAP);
    return;
  }

  const count = secondaryItems.length;
  const colW = (contentWidth - (count - 1) * SEC_CARD_GAP) / count;
  b.checkPageBreak(SEC_CARD_H + 16);
  const secTopY = b.y;

  secondaryItems.forEach((item, i) => {
    const cardX = PAGE_MARGIN + i * (colW + SEC_CARD_GAP);

    // Light fill + thin border — clean, print-safe premium look
    b.currentPage.drawRectangle({
      x: cardX,
      y: secTopY - SEC_CARD_H,
      width: colW,
      height: SEC_CARD_H,
      color: SEC_BG,
      borderColor: SEC_BORDER_COLOR,
      borderWidth: SEC_BORDER_W,
    });

    // Value — horizontally centred; baseline at ~28pt from card top
    const valFont = b.pickFontForText(item.value, 'bold');
    const valW = valFont.widthOfTextAtSize(item.value, SEC_VALUE_SIZE);
    b.drawTextSafe(item.value, {
      x: cardX + (colW - valW) / 2,
      y: secTopY - 28,
      size: SEC_VALUE_SIZE,
      color: COLOR_BLACK,
      fontType: 'bold',
      kind: 'body',
    });

    // Label — centred below value; baseline at ~54pt from card top
    const lblFont = b.pickFontForText(item.label, 'regular');
    const lblW = lblFont.widthOfTextAtSize(item.label, SEC_LABEL_SIZE);
    b.drawTextSafe(item.label, {
      x: cardX + (colW - lblW) / 2,
      y: secTopY - 54,
      size: SEC_LABEL_SIZE,
      color: COLOR_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
  });

  b.moveDown(SEC_CARD_H + REPORT_GAP);
}

/**
 * Draws a section title inside a light background strip.
 * Creates a clear visual band that separates the KPI area from the data table.
 */
function drawSectionTitle(b: PdfBuilder, title: string) {
  b.checkPageBreak(SECTION_STRIP_H + 10);
  const contentWidth = b.width - PAGE_MARGIN * 2;

  b.currentPage.drawRectangle({
    x: PAGE_MARGIN,
    y: b.y - SECTION_STRIP_H,
    width: contentWidth,
    height: SECTION_STRIP_H,
    color: SECTION_STRIP_BG,
    borderWidth: 0,
  });

  // Text vertically centred in strip — baseline ~10pt from strip top
  b.drawTextSafe(title, {
    x: PAGE_MARGIN + 8,
    y: b.y - 10,
    size: SECTION_TITLE_SIZE,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });

  b.moveDown(SECTION_STRIP_H + 8);
}

type Col = {header: string; widthFraction: number; align?: 'left' | 'right'};

function drawTableHeader(b: PdfBuilder, cols: Col[]) {
  b.checkPageBreak(TABLE_TH_H + 4);
  const contentWidth = b.width - PAGE_MARGIN * 2;

  // Near-black header — high contrast, white text for premium table look
  b.currentPage.drawRectangle({
    x: PAGE_MARGIN,
    y: b.y - TABLE_TH_H + 4,
    width: contentWidth,
    height: TABLE_TH_H,
    color: TABLE_TH_BG,
    borderWidth: 0,
  });

  let x = PAGE_MARGIN + 8;
  for (const col of cols) {
    const colW = contentWidth * col.widthFraction;
    const headerText = col.header.toUpperCase();
    b.drawTextSafe(headerText, {
      x:
        col.align === 'right'
          ? x +
            colW -
            12 -
            b.fontAscii.widthOfTextAtSize(headerText, TABLE_TH_SIZE)
          : x,
      y: b.y - TABLE_TH_H + 10,
      size: TABLE_TH_SIZE,
      color: rgb(1, 1, 1),
      fontType: 'bold',
      kind: 'title',
    });
    x += colW;
  }
  b.moveDown(TABLE_TH_H + 2);
}

function drawTableRow(
  b: PdfBuilder,
  cols: Col[],
  cells: string[],
  rowIndex: number,
) {
  const contentWidth = b.width - PAGE_MARGIN * 2;
  const neededH = TABLE_ROW_H + 4;
  b.checkPageBreak(neededH);

  // Stripe even rows (0, 2, 4…) — very subtle, doesn't overpower content
  if (rowIndex % 2 === 0) {
    b.currentPage.drawRectangle({
      x: PAGE_MARGIN,
      y: b.y - neededH + 4,
      width: contentWidth,
      height: neededH,
      color: TABLE_ROW_STRIPE,
      borderWidth: 0,
    });
  }

  let x = PAGE_MARGIN + 8;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const colW = contentWidth * col.widthFraction;
    const text = cells[i] ?? '';
    const truncated = text.length > 40 ? text.slice(0, 38) + '…' : text;
    b.drawTextSafe(truncated, {
      x:
        col.align === 'right'
          ? x +
            colW -
            12 -
            b.fontAscii.widthOfTextAtSize(truncated, FONT_SIZE_BODY)
          : x,
      y: b.y - TABLE_ROW_H + 3,
      size: FONT_SIZE_BODY,
      color: COLOR_DARK_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    x += colW;
  }

  b.drawDivider(b.y - neededH + 4, 0.3, TABLE_ROW_DIVIDER);
  b.moveDown(neededH);
}

/** Appends a right-aligned "Generated on: ..." timestamp line. */
function drawGeneratedLine(b: PdfBuilder) {
  const text = `Generated on: ${new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;
  b.checkPageBreak(32);
  b.moveDown(REPORT_GAP);
  const font = b.pickFontForText(text, 'regular');
  const textW = font.widthOfTextAtSize(text, GENERATED_SIZE);
  b.drawTextSafe(text, {
    x: b.width - PAGE_MARGIN - textW,
    y: b.y,
    size: GENERATED_SIZE,
    color: COLOR_GRAY,
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
  try {
    if (Platform.OS === 'android') {
      console.log('[PDF Export] opening via actionViewIntent (android)');
      // Do NOT pass chooserTitle: Intent.createChooser() wraps the intent in a
      // new Intent object that loses FLAG_ACTIVITY_NEW_TASK, which crashes when
      // startActivity() is called from ReactApplicationContext.
      await RNBlobUtil.android.actionViewIntent(outputPath, 'application/pdf');
    } else {
      console.log('[PDF Export] opening via openDocument (ios)');
      await RNBlobUtil.ios.openDocument(outputPath);
    }
  } catch (openErr: any) {
    console.warn('[PDF Export] open failed:', openErr?.message ?? openErr);
    if (openErr?.code === 'ENOAPP') {
      Alert.alert(
        'No PDF Viewer',
        'The PDF was saved but no app is installed to open it. Install a PDF viewer and try again.',
      );
    } else {
      throw openErr;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate and share a Session Attendee Report PDF.
 */
export async function exportSessionReportPdf(
  data: SessionAttendeesResponse,
  clubName: string,
): Promise<void> {
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

  // Header
  drawHeader(
    b,
    'Session Report',
    `${clubName} — ${sessionLabel}`,
    `Date: ${sessionDate}`,
  );

  // Hero KPI (Total Participation) + 2 secondary cards
  drawHeroKpiSection(
    b,
    {
      label: 'Total Participation',
      value: String(data.summary.totalParticipation),
    },
    [
      {label: 'Check-ins', value: String(data.summary.totalCheckIns)},
      {label: 'Unique Members', value: String(data.summary.uniqueMembers)},
    ],
  );

  // Attendees table
  drawSectionTitle(b, 'Attendees');

  const attendeeCols: Col[] = [
    {header: 'Name', widthFraction: 0.4},
    {header: 'Type', widthFraction: 0.15},
    {header: 'Participation', widthFraction: 0.15, align: 'right'},
    {header: 'Checked In', widthFraction: 0.3},
  ];
  drawTableHeader(b, attendeeCols);

  data.attendees.forEach((att: SessionAttendeeItem, i: number) => {
    drawTableRow(
      b,
      attendeeCols,
      [
        att.memberName,
        att.checkInType,
        String(att.creditsUsed),
        formatDateShort(att.checkedInAt),
      ],
      i,
    );
  });

  drawGeneratedLine(b);
  await b.addFooterToAllPages(`session-${data.session.id.slice(0, 8)}`);

  await writePdf(doc, outputPath, 'session report');
  await openPdf(outputPath);
}

/**
 * Generate and share a Summary (date-range) Report PDF.
 */
export async function exportSummaryReportPdf(
  data: SessionsBreakdownResponse,
  clubName: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await ensureReportsDir();

  const fileName = `attendance-summary-${startDate}_to_${endDate}.pdf`;
  const outputPath = `${REPORTS_DIR}/${fileName}`;

  const doc = await PDFDocument.create();
  doc.setProducer(BRANDING.pdf.producer);
  doc.setCreator(BRANDING.pdf.creator);

  const b = new PdfBuilder(doc);
  b.registerFontkit();
  await b.init();

  // Header
  drawHeader(
    b,
    'Attendance Summary',
    clubName,
    `Period: ${startDate} to ${endDate}`,
  );

  // Hero KPI (Total Participation) + 3 secondary cards
  drawHeroKpiSection(
    b,
    {
      label: 'Total Participation',
      value: String(data.summary.totalParticipation),
    },
    [
      {label: 'Sessions', value: String(data.summary.totalSessions)},
      {label: 'Check-ins', value: String(data.summary.totalCheckIns)},
      {label: 'Unique Members', value: String(data.summary.uniqueMembers)},
    ],
  );

  // Session breakdown table
  drawSectionTitle(b, 'Session Breakdown');

  const sessionCols: Col[] = [
    {header: 'Session', widthFraction: 0.4},
    {header: 'Date', widthFraction: 0.25},
    {header: 'Check-ins', widthFraction: 0.15, align: 'right'},
    {header: 'Participation', widthFraction: 0.2, align: 'right'},
  ];
  drawTableHeader(b, sessionCols);

  data.sessions.forEach((s: SessionBreakdownItem, i: number) => {
    drawTableRow(
      b,
      sessionCols,
      [
        s.title ?? s.locationName ?? 'Session',
        formatDateShort(s.startsAt),
        String(s.totalCheckIns),
        String(s.totalParticipation),
      ],
      i,
    );
  });

  drawGeneratedLine(b);
  await b.addFooterToAllPages(`summary-${startDate}-${endDate}`);

  await writePdf(doc, outputPath, 'summary report');
  await openPdf(outputPath);
}
