// src/services/auditLogPdfService.ts
// Generates a production-grade Audit Log Report PDF.
// Isolated from existing session/summary PDF code.

import {PDFDocument, rgb} from 'pdf-lib';
import {Buffer} from 'buffer';
import {Alert, Platform} from 'react-native';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';

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
  const url = `file://${outputPath}`;
  const filename =
    outputPath
      .split('/')
      .pop()
      ?.replace(/\.pdf$/i, '') || 'audit-log';

  try {
    await Share.open({
      url,
      filename,
      type: 'application/pdf',
      title: 'Share Audit Log PDF',
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
  // ── Single-column: brand + club name + report title ───────────────────────
  // Brand (small, gray)
  b.drawTextSafe('Passeo', {
    x: PAGE_MARGIN,
    y: b.y,
    size: 10,
    color: COLOR_LIGHT_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(14);

  // Club name (bold)
  b.drawTextSafe(clubName, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_CLUB,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });
  b.moveDown(LH_CLUB - 4);

  // Main title
  b.drawTextSafe('Audit Log Report', {
    x: PAGE_MARGIN,
    y: b.y,
    size: 21,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });
  b.moveDown(22);

  // Right: generated date + summary counts
  const genText = `Generated on ${todayLabel()}`;
  const genW = b.fontAscii.widthOfTextAtSize(genText, T_SMALL);
  b.drawTextSafe(genText, {
    x: b.width - PAGE_MARGIN - genW,
    y: b.y,
    size: T_SMALL,
    color: COLOR_DARK_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LH_SMALL + 2);

  // Summary counts (right-aligned, smaller)
  const miniStats: [string, string][] = [
    ['Entries', String(summary.totalEntries)],
    ['Check-ins', String(summary.totalCheckIns)],
    ['Members', String(summary.uniqueMembers)],
  ];
  for (const [statLabel, statValue] of miniStats) {
    const statText = `${statLabel}: ${statValue}`;
    const statW = b.fontAscii.widthOfTextAtSize(statText, T_SMALL);
    b.drawTextSafe(statText, {
      x: b.width - PAGE_MARGIN - statW,
      y: b.y,
      size: T_SMALL,
      color: COLOR_DARK_GRAY,
      fontType: 'bold',
      kind: 'body',
    });
    b.moveDown(LH_SMALL - 2);
  }

  // Filters (smaller, muted, dot bullets)
  b.moveDown(2);
  const filterColor = rgb(0.42, 0.44, 0.5); // #6B7280
  const memberLabel = filters.memberName ?? 'All Members';
  const eventLabel =
    filters.eventTypeLabel && filters.eventTypeLabel !== 'All Events'
      ? filters.eventTypeLabel
      : 'All Events';
  const dateLabel =
    filters.startDate || filters.endDate
      ? [filters.startDate, filters.endDate].filter(Boolean).join(' to ')
      : 'Any';
  const filterLines = [
    `• Member: ${memberLabel}`,
    `• Event: ${eventLabel}`,
    `• Date: ${dateLabel}`,
  ];
  filterLines.forEach(line => {
    b.drawTextSafe(line, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SMALL - 1,
      color: filterColor,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(LH_SMALL - 4);
  });

  b.moveDown(10);
  b.drawDivider(b.y, 0.5, COLOR_BORDER);
  b.moveDown(14);
}

// ─── Drawing: summary section ─────────────────────────────────────────────────

function drawSummarySection(b: PdfBuilder, summary: AuditSummary) {
  // ONE primary metric: Total Credits Added (large)
  const contentWidth = b.width - PAGE_MARGIN * 2;
  const rightEdge = b.width - PAGE_MARGIN;
  const mainValue = String(summary.totalCreditsAdded);
  const mainLabel = 'Total Credits Added';
  const mainFont = b.pickFontForText(mainValue, 'bold');
  const mainW = mainFont.widthOfTextAtSize(mainValue, 30);
  b.drawTextSafe(mainValue, {
    x: PAGE_MARGIN,
    y: b.y,
    size: 30,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'body',
  });
  b.drawTextSafe(mainLabel, {
    x: PAGE_MARGIN + mainW + 12,
    y: b.y + 6,
    size: 15,
    color: COLOR_DARK_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(32);

  // Other metrics (smaller)
  const rows: [string, string][] = [
    ['Total entries', String(summary.totalEntries)],
    ['Check-ins', String(summary.totalCheckIns)],
    ['Unique members', String(summary.uniqueMembers)],
  ];
  rows.forEach(([label, value]) => {
    b.drawTextSafe(label, {
      x: PAGE_MARGIN,
      y: b.y,
      size: 14,
      color: COLOR_DARK_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    const valFont = b.pickFontForText(value, 'bold');
    const valWidth = valFont.widthOfTextAtSize(value, 14);
    b.drawTextSafe(value, {
      x: rightEdge - valWidth,
      y: b.y,
      size: 14,
      color: COLOR_BLACK,
      fontType: 'bold',
      kind: 'body',
    });
    b.moveDown(16);
  });
  b.moveDown(8);
  b.drawDivider(b.y, 0.5, COLOR_BORDER);
  b.moveDown(18);
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
  if (log.actorName || log.targetUserName) {
    leftLines += 1; // combined activity line
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

// ─── Drawing: activity line helper ───────────────────────────────────────────

function buildActivityLine(
  key: string,
  actor?: string | null,
  target?: string | null,
): string | null {
  if (!actor && !target) return null;
  // Sentence-style event text
  const verbMap: Record<string, string> = {
    credits_added: 'added credits to',
    credits_deducted: 'deducted credits from',
    check_in_manual: 'checked in',
    check_in_self: 'checked in',
    check_in_backfill: 'checked in (backfill)',
    role_changed: 'changed role of',
    session_created: 'created session',
    session_updated: 'updated session',
    session_deleted: 'deleted session',
    member_joined: 'joined',
    member_left: 'left',
  };
  const verb = verbMap[key] ?? 'acted on';
  if (actor && target && actor !== target) return `${actor} ${verb} ${target}`;
  if (actor) return `${actor} ${verb}`;
  return target ?? null;
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
  // Event type simplification
  let eventTitle = label;
  if (label === 'Credits added') eventTitle = 'Credits added';
  else if (
    label === 'Manual check-in' ||
    label === 'Self check-in' ||
    label === 'Backfill check-in'
  )
    eventTitle = 'Check-in';
  else if (label === 'Member left') eventTitle = 'Member left';
  b.drawTextSafe(eventTitle, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_BODY,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'body',
  });
  b.moveDown(LH_BODY);

  const activityLine = buildActivityLine(
    key,
    log.actorName,
    log.targetUserName,
  );
  if (activityLine) {
    b.drawTextSafe(activityLine, {
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
      const deltaStr = `${sign}${Math.abs(amount)}`;
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
      const remStr = `Balance: ${remaining}`;
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
): Promise<string | undefined> {
  if (logs.length === 0) {
    Alert.alert(
      'Nothing to Export',
      'No log entries match the current filters.',
    );
    return undefined;
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
    return outputPath;
  } catch (err: any) {
    console.error('[AuditLogPDF] Export failed:', err);
    Alert.alert(
      'Export Failed',
      err?.message ?? 'An unexpected error occurred.',
    );
    return undefined;
  }
}
