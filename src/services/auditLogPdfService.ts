// src/services/auditLogPdfService.ts
// Generates a production-grade Audit Log Report PDF.
// Isolated from existing session/summary PDF code.

import {PDFDocument} from 'pdf-lib';
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
  COLOR_LIGHT_GRAY,
  COLOR_BORDER,
  FONT_SIZE_TITLE,
  FONT_SIZE_H2,
  FONT_SIZE_BODY,
  FONT_SIZE_SMALL,
  CONTENT_BOTTOM_LIMIT,
} from './pdf/PdfBuilder';
import type {AuditLogItem} from './api/reportApi';

// â”€â”€â”€ Layout constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const T_CLUB = 18; // club name â€” uppercase large
const T_REPORT = FONT_SIZE_TITLE; // 14 â€” "Audit Log Report"
const T_SECTION = FONT_SIZE_H2; // 12 â€” section headings
const T_BODY = FONT_SIZE_BODY; // 10
const T_SMALL = FONT_SIZE_SMALL; // 8

const LH_CLUB = 26; // after club name
const LH_REPORT = 22; // after report title
const LH_SECTION = 18; // after section heading
const LH_BODY = 14; // normal body line
const LH_SMALL = 12; // small text line
const LH_BLANK = 8; // intentional gap between content groups

const ENTRY_PAD_TOP = 10; // space before first line of each entry
const ENTRY_PAD_BOTTOM = 6; // space after last line, before divider
const ENTRY_GAP = 16; // total vertical gap between entries

const SUMMARY_ROW_H = 14;

// Two-column entry layout
const COL_LEFT_FRAC = 0.56; // left column takes 56% of content width
const COL_GUTTER = 14; // gap between columns

// â”€â”€â”€ File helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const REPORTS_DIR = `${RNFS.DocumentDirectoryPath}/Passeo/reports`;

async function ensureReportsDir(): Promise<void> {
  const exists = await RNFS.exists(REPORTS_DIR);
  if (!exists) {
    await RNFS.mkdir(REPORTS_DIR);
  }
}

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
  const exists = await RNFS.exists(outputPath);
  if (!exists) {
    throw new Error(`PDF file was not found after write: ${outputPath}`);
  }
  console.log(`[AuditLogPDF] ${label} written to:`, outputPath);
}

async function openPdf(outputPath: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await RNBlobUtil.android.actionViewIntent(outputPath, 'application/pdf');
    } else {
      await RNBlobUtil.ios.openDocument(outputPath);
    }
  } catch (openErr: any) {
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

// â”€â”€â”€ Action mapping (mirrors AuditLogScreen) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ACTION_LABELS: Record<string, string> = {
  check_in_manual: 'Manual check-in',
  check_in_self: 'Self check-in',
  check_in_backfill: 'Backfill check-in',
  credits_added: 'Credits added',
  credits_deducted: 'Credits deducted',
  role_changed: 'Role changed',
  session_created: 'Session created',
  session_updated: 'Session updated',
  session_deleted: 'Session deleted',
  member_joined: 'Member joined',
  member_left: 'Member left',
};

function resolveActionKey(action: string, checkInType?: string): string {
  if (action === 'member_checked_in' || action === 'check_in') {
    if (checkInType === 'manual') return 'check_in_manual';
    if (checkInType === 'backfill') return 'check_in_backfill';
    return 'check_in_self';
  }
  if (action === 'check_in_backfill') return 'check_in_backfill';
  if (action === 'credits_removed') return 'credits_deducted';
  return action;
}

// â”€â”€â”€ Date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function sanitizeLocale(s: string): string {
  // Remove narrow no-break space (U+202F) and non-breaking space (U+00A0)
  // injected by toLocaleString before AM/PM â€” WinAnsi cannot encode them.
  return s.replace(/[\u202F\u00A0]/g, ' ');
}

function formatTimestamp(iso: string): string {
  try {
    return sanitizeLocale(
      new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
  } catch {
    return iso;
  }
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildFilename(): string {
  return `audit-log-${new Date().toISOString().slice(0, 10)}.pdf`;
}

// â”€â”€â”€ Summary computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type AuditSummary = {
  totalEntries: number;
  totalCreditsAdded: number;
  totalCreditsDeducted: number;
  totalCheckIns: number;
  uniqueMembers: number;
};

function computeSummary(logs: AuditLogItem[]): AuditSummary {
  let totalCreditsAdded = 0;
  let totalCreditsDeducted = 0;
  let totalCheckIns = 0;
  const memberIds = new Set<string>();

  for (const item of logs) {
    const meta = item.metadata ?? {};
    const checkInType = meta.checkInType as string | undefined;
    const key = resolveActionKey(item.action, checkInType);
    const amount = meta.amount as number | undefined;

    if (key === 'credits_added' && amount != null && amount > 0) {
      totalCreditsAdded += amount;
    }
    if (key === 'credits_deducted' && amount != null) {
      totalCreditsDeducted += Math.abs(amount);
    }
    if (key.startsWith('check_in_')) {
      totalCheckIns += 1;
    }
    const memberId = item.targetUserId || item.actorUserId;
    if (memberId) {
      memberIds.add(memberId);
    }
  }

  return {
    totalEntries: logs.length,
    totalCreditsAdded,
    totalCreditsDeducted,
    totalCheckIns,
    uniqueMembers: memberIds.size,
  };
}

// â”€â”€â”€ Drawing: main header (page 1 only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function drawMainHeader(
  b: PdfBuilder,
  clubName: string,
  filters: {
    memberName?: string;
    eventTypeLabel?: string;
    startDate?: string;
    endDate?: string;
  },
  summary: AuditSummary,
) {
  const rightEdge = b.width - PAGE_MARGIN;
  const headerStartY = b.y;

  // ── Left column: club name, report title, filters ─────────────────────────

  b.drawTextSafe(clubName.toUpperCase(), {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_CLUB,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });
  b.moveDown(LH_CLUB);

  b.drawTextSafe('Audit Log Report', {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_REPORT,
    color: COLOR_DARK_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_REPORT);

  b.drawTextSafe('Filters', {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(LH_SMALL);

  const memberLabel = filters.memberName ?? 'All Members';
  b.drawTextSafe(`Member: ${memberLabel}`, {
    x: PAGE_MARGIN + 8,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_SMALL);

  const eventLabel =
    filters.eventTypeLabel && filters.eventTypeLabel !== 'All Events'
      ? filters.eventTypeLabel
      : 'All Events';
  b.drawTextSafe(`Event Type: ${eventLabel}`, {
    x: PAGE_MARGIN + 8,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_SMALL);

  const dateRange =
    filters.startDate || filters.endDate
      ? [filters.startDate, filters.endDate].filter(Boolean).join(' to ')
      : 'Any';
  b.drawTextSafe(`Date Range: ${dateRange}`, {
    x: PAGE_MARGIN + 8,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_SMALL);

  const leftBottomY = b.y;

  // ── Right column: export date + mini summary ───────────────────────────────
  b.y = headerStartY;

  // Exported: date (single line)
  drawRightAligned(
    b,
    `Exported: ${todayLabel()}`,
    b.y,
    T_SMALL,
    COLOR_DARK_GRAY,
    'regular',
  );
  b.moveDown(LH_SMALL + 6);

  // Mini summary: 3 key stats, each label+value on one line
  const miniStats: [string, string][] = [
    ['Entries', String(summary.totalEntries)],
    ['Check-ins', String(summary.totalCheckIns)],
    ['Members', String(summary.uniqueMembers)],
  ];
  for (const [statLabel, statValue] of miniStats) {
    drawRightAligned(
      b,
      `${statLabel}: ${statValue}`,
      b.y,
      T_SMALL,
      COLOR_DARK_GRAY,
      'bold',
    );
    b.moveDown(LH_SMALL + 1);
  }

  const rightBottomY = b.y;

  // Cursor at bottom of whichever column is taller
  b.y = Math.min(leftBottomY, rightBottomY);
  b.moveDown(12);

  // Strong divider under header
  b.drawDivider(b.y, 1, COLOR_DARK_GRAY);
  b.moveDown(16);
}

// ─── Drawing: summary section ─────────────────────────────────────────────────

function drawSummarySection(b: PdfBuilder, summary: AuditSummary) {
  const contentWidth = b.width - PAGE_MARGIN * 2;
  const rightEdge = b.width - PAGE_MARGIN;

  b.drawTextSafe('Summary', {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SECTION,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(LH_SECTION);

  const rows: [string, string][] = [
    ['Total entries', String(summary.totalEntries)],
    ['Total credits added', String(summary.totalCreditsAdded)],
    ['Total credits deducted', String(summary.totalCreditsDeducted)],
    ['Total check-ins', String(summary.totalCheckIns)],
    ['Unique members affected', String(summary.uniqueMembers)],
  ];

  for (const [label, value] of rows) {
    b.drawTextSafe(label, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_BODY,
      color: COLOR_DARK_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    const valFont = b.pickFontForText(value, 'bold');
    const valWidth = valFont.widthOfTextAtSize(value, T_BODY);
    b.drawTextSafe(value, {
      x: rightEdge - valWidth,
      y: b.y,
      size: T_BODY,
      color: COLOR_BLACK,
      fontType: 'bold',
      kind: 'body',
    });
    b.moveDown(SUMMARY_ROW_H);
  }

  b.moveDown(8);
  b.drawDivider(b.y, 0.5, COLOR_BORDER);
  b.moveDown(20);
}

// ─── Drawing: continuation page header ───────────────────────────────────────

function drawContinuationHeader(b: PdfBuilder, clubName: string) {
  const rightEdge = b.width - PAGE_MARGIN;
  b.drawTextSafe(clubName.toUpperCase(), {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_BODY,
    color: COLOR_DARK_GRAY,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(LH_BODY);

  b.drawTextSafe('Audit Log Report (continued)', {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_SMALL + 6);

  b.drawDivider(b.y, 0.5, COLOR_BORDER);
  b.moveDown(14);
}

// ─── Drawing: entry height estimation ────────────────────────────────────────

function estimateEntryHeight(log: AuditLogItem): number {
  const meta = log.metadata ?? {};
  const checkInType = meta.checkInType as string | undefined;
  const key = resolveActionKey(log.action, checkInType);

  let leftLines = 1; // label
  if (log.actorName) {
    leftLines += 1;
  }
  if (log.targetUserName) {
    leftLines += 1;
  }
  const sessionTitle = meta.sessionTitle as string | undefined;
  const locationName = meta.locationName as string | undefined;
  if (sessionTitle || locationName) {
    leftLines += 1;
  }

  let rightLines = 1; // timestamp
  if (key === 'credits_added' || key === 'credits_deducted') {
    const amount = meta.amount as number | undefined;
    const newCredits = meta.newCredits as number | undefined;
    if (amount != null) {
      rightLines += 1;
    }
    if (newCredits != null) {
      rightLines += 1;
    }
  } else if (key.startsWith('check_in_')) {
    const remaining = meta.remainingCredits as number | undefined;
    if (remaining != null) {
      rightLines += 1;
    }
  }

  const leftH = leftLines * LH_BODY;
  const rightH = rightLines * LH_BODY;
  return ENTRY_PAD_TOP + Math.max(leftH, rightH) + ENTRY_PAD_BOTTOM;
}

// ─── Drawing: right-aligned text helper ──────────────────────────────────────

function drawRightAligned(
  b: PdfBuilder,
  text: string,
  yPos: number,
  size: number,
  color: typeof COLOR_BLACK,
  fontType: 'regular' | 'bold',
): void {
  const rightEdge = b.width - PAGE_MARGIN;
  const font = b.pickFontForText(text, fontType);
  const w = font.widthOfTextAtSize(text, size);
  b.drawTextSafe(text, {
    x: rightEdge - w,
    y: yPos,
    size,
    color,
    fontType,
    kind: 'body',
  });
}

// ─── Drawing: single audit log entry ─────────────────────────────────────────

function drawEntry(b: PdfBuilder, log: AuditLogItem): void {
  const meta = log.metadata ?? {};
  const checkInType = meta.checkInType as string | undefined;
  const key = resolveActionKey(log.action, checkInType);
  const label = ACTION_LABELS[key] ?? log.action;

  b.moveDown(ENTRY_PAD_TOP);
  const leftStartY = b.y;

  // ── Left column ───────────────────────────────────────────────────────────
  b.drawTextSafe(label, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_BODY,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(LH_BODY);

  if (log.actorName) {
    b.drawTextSafe(`By: ${log.actorName}`, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SMALL,
      color: COLOR_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(LH_SMALL);
  }

  if (log.targetUserName) {
    b.drawTextSafe(`Member: ${log.targetUserName}`, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SMALL,
      color: COLOR_DARK_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(LH_SMALL);
  }

  const sessionTitle = meta.sessionTitle as string | undefined;
  const locationName = meta.locationName as string | undefined;
  const sessionDisplay = sessionTitle || locationName;
  if (sessionDisplay) {
    b.drawTextSafe(`Session: ${sessionDisplay}`, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SMALL,
      color: COLOR_DARK_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(LH_SMALL);
  }

  const leftBottomY = b.y;

  // ── Right column (reset b.y to entry start) ───────────────────────────────
  b.y = leftStartY;

  const ts = formatTimestamp(log.createdAt);
  drawRightAligned(b, ts, b.y, T_SMALL, COLOR_GRAY, 'regular');
  b.moveDown(LH_SMALL + 2);

  if (key === 'credits_added' || key === 'credits_deducted') {
    const amount = meta.amount as number | undefined;
    const newCredits = meta.newCredits as number | undefined;
    if (amount != null) {
      const sign = key === 'credits_added' ? '+' : '-';
      const deltaStr = `${sign}${Math.abs(amount)} credits`;
      // Primary: bold, slightly larger, black
      drawRightAligned(b, deltaStr, b.y, T_BODY + 1, COLOR_BLACK, 'bold');
      b.moveDown(LH_BODY + 1);
    }
    if (newCredits != null) {
      const balStr = `Balance: ${newCredits}`;
      drawRightAligned(b, balStr, b.y, T_SMALL, COLOR_GRAY, 'regular');
      b.moveDown(LH_SMALL);
    }
  } else if (key.startsWith('check_in_')) {
    const remaining = meta.remainingCredits as number | undefined;
    if (remaining != null) {
      const remStr = `${remaining} credits left`;
      drawRightAligned(b, remStr, b.y, T_SMALL, COLOR_GRAY, 'regular');
      b.moveDown(LH_SMALL);
    }
  }

  const rightBottomY = b.y;

  b.y = Math.min(leftBottomY, rightBottomY);
  b.moveDown(ENTRY_PAD_BOTTOM);

  b.drawDivider(b.y, 0.3, COLOR_BORDER);
  b.moveDown(ENTRY_GAP - ENTRY_PAD_BOTTOM);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function exportAuditLogPdf(
  logs: AuditLogItem[],
  clubName: string,
  filters: {
    memberName?: string;
    eventTypeLabel?: string;
    startDate?: string;
    endDate?: string;
  } = {},
): Promise<void> {
  if (logs.length === 0) {
    Alert.alert(
      'Nothing to Export',
      'No log entries match the current filters.',
    );
    return;
  }

  try {
    await ensureReportsDir();
    const outputPath = `${REPORTS_DIR}/${buildFilename()}`;

    const pdfDoc = await PDFDocument.create();
    const b = new PdfBuilder(pdfDoc);
    await b.init();

    const summary = computeSummary(logs);

    drawMainHeader(b, clubName, filters, summary);
    drawSummarySection(b, summary);

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const neededH = estimateEntryHeight(log);
      if (b.y - neededH < CONTENT_BOTTOM_LIMIT) {
        b.addNewPage();
        drawContinuationHeader(b, clubName);
      }
      drawEntry(b, log);
    }

    await b.addFooterToAllPages('audit-log');

    await writePdf(pdfDoc, outputPath, 'AuditLog');
    await openPdf(outputPath);
  } catch (err: any) {
    console.error('[AuditLogPDF] Export failed:', err);
    Alert.alert(
      'Export Failed',
      err?.message ?? 'An unexpected error occurred.',
    );
  }
}
