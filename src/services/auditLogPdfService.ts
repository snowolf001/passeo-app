// src/services/auditLogPdfService.ts
// Generates an Audit Log PDF export. Isolated from existing session/summary PDF code.

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
} from './pdf/PdfBuilder';
import type {AuditLogItem} from './api/reportApi';

// ─── Layout constants ─────────────────────────────────────────────────────────

const T_TITLE = FONT_SIZE_TITLE;
const T_SECTION = FONT_SIZE_H2;
const T_BODY = FONT_SIZE_BODY;
const T_SMALL = FONT_SIZE_SMALL;

const LINE_HEIGHT_BODY = 14;
const LINE_HEIGHT_SMALL = 12;
const CARD_PADDING_TOP = 8;
const CARD_PADDING_BOTTOM = 10;

// ─── File helpers ─────────────────────────────────────────────────────────────

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

// ─── Action mapping (mirrors AuditLogScreen) ─────────────────────────────────

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

function formatDelta(amount: number): string {
  const abs = Math.abs(amount);
  const word = abs === 1 ? 'credit' : 'credits';
  return `${amount > 0 ? '+' : ''}${amount} ${word}`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const s = new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    // Replace narrow no-break space (U+202F) and non-breaking space (U+00A0)
    // that toLocaleString injects before AM/PM — WinAnsi cannot encode them.
    return s.replace(/[\u202F\u00A0]/g, ' ');
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
  const date = new Date().toISOString().slice(0, 10);
  return `audit-log-${date}.pdf`;
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────

function drawHeaderBlock(b: PdfBuilder, clubName: string, subtitle: string) {
  // Club name (title)
  b.drawTextSafe(clubName, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_TITLE,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'title',
  });
  b.moveDown(T_TITLE + 6);

  // "Audit Log" label
  b.drawTextSafe('Audit Log', {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SECTION,
    color: COLOR_DARK_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(T_SECTION + 4);

  // Subtitle line (filters summary or "All events")
  if (subtitle) {
    b.drawTextSafe(subtitle, {
      x: PAGE_MARGIN,
      y: b.y,
      size: T_SMALL,
      color: COLOR_GRAY,
      fontType: 'regular',
      kind: 'body',
    });
    b.moveDown(T_SMALL + 4);
  }

  // Export date
  b.drawTextSafe(`Exported: ${todayLabel()}`, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(T_SMALL + 12);

  b.drawDivider();
  b.moveDown(12);
}

function drawEntryCount(b: PdfBuilder, count: number) {
  const text = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  b.drawTextSafe(text, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(T_SMALL + 10);
}

/**
 * Estimates the height needed to render one audit log entry.
 * Each text line is LINE_HEIGHT_BODY; we add top+bottom card padding.
 */
function estimateEntryHeight(item: AuditLogItem): number {
  const meta = item.metadata ?? {};
  const checkInType = meta.checkInType as string | undefined;
  const resolvedKey = resolveActionKey(item.action, checkInType);

  const isCheckIn =
    resolvedKey === 'check_in_manual' ||
    resolvedKey === 'check_in_self' ||
    resolvedKey === 'check_in_backfill';
  const isCreditsAdjust =
    resolvedKey === 'credits_added' || resolvedKey === 'credits_deducted';

  // badge row + timestamp row
  let lines = 2;

  if (isCreditsAdjust) {
    if (item.actorName) lines += 1;
    if (item.targetUserName) lines += 1;
    if (meta.amount != null) lines += 1; // delta line (slightly taller)
    if (meta.newCredits != null) lines += 1;
  } else if (isCheckIn) {
    if (resolvedKey === 'check_in_manual' && item.actorName) lines += 1;
    if (item.targetUserName) lines += 1;
    const sessionTitle = meta.sessionTitle as string | undefined;
    const locationName = meta.locationName as string | undefined;
    if (sessionTitle || locationName) lines += 1;
    if (meta.creditsUsed != null) lines += 1;
  } else {
    if (item.actorName) lines += 1;
    if (item.targetUserName) lines += 1;
  }

  return CARD_PADDING_TOP + lines * LINE_HEIGHT_BODY + CARD_PADDING_BOTTOM;
}

function drawEntry(b: PdfBuilder, item: AuditLogItem, contentWidth: number) {
  const meta = item.metadata ?? {};
  const checkInType = meta.checkInType as string | undefined;
  const resolvedKey = resolveActionKey(item.action, checkInType);
  const label = ACTION_LABELS[resolvedKey] ?? item.action;

  const isCheckIn =
    resolvedKey === 'check_in_manual' ||
    resolvedKey === 'check_in_self' ||
    resolvedKey === 'check_in_backfill';
  const isCreditsAdjust =
    resolvedKey === 'credits_added' || resolvedKey === 'credits_deducted';

  b.moveDown(CARD_PADDING_TOP);

  // Top row: badge label (bold) + timestamp (right-aligned)
  const timestamp = formatTimestamp(item.createdAt);
  const timestampFont = b.pickFontForText(timestamp, 'regular');
  const timestampW = timestampFont.widthOfTextAtSize(timestamp, T_SMALL);

  b.drawTextSafe(label, {
    x: PAGE_MARGIN,
    y: b.y,
    size: T_BODY,
    color: COLOR_BLACK,
    fontType: 'bold',
    kind: 'body',
  });
  b.drawTextSafe(timestamp, {
    x: PAGE_MARGIN + contentWidth - timestampW,
    y: b.y,
    size: T_SMALL,
    color: COLOR_GRAY,
    fontType: 'regular',
    kind: 'body',
  });
  b.moveDown(LINE_HEIGHT_BODY);

  if (isCreditsAdjust) {
    const amount = meta.amount as number | undefined;
    const newCredits = meta.newCredits as number | undefined;

    if (item.actorName) {
      b.drawTextSafe(`Adjusted by: ${item.actorName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (item.targetUserName) {
      b.drawTextSafe(`Member: ${item.targetUserName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (amount != null) {
      b.drawTextSafe(formatDelta(amount), {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_SECTION,
        color: COLOR_BLACK,
        fontType: 'bold',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (newCredits != null) {
      b.drawTextSafe(`New balance: ${newCredits}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_SMALL,
        color: COLOR_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_SMALL);
    }
  } else if (isCheckIn) {
    const creditsUsed = meta.creditsUsed as number | undefined;
    const remainingCredits = meta.remainingCredits as number | undefined;
    const sessionTitle = meta.sessionTitle as string | undefined;
    const locationName = meta.locationName as string | undefined;
    const sessionDisplay = sessionTitle || locationName;

    if (resolvedKey === 'check_in_manual' && item.actorName) {
      b.drawTextSafe(`Checked in by: ${item.actorName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (item.targetUserName) {
      b.drawTextSafe(`Member: ${item.targetUserName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (sessionDisplay) {
      b.drawTextSafe(`Session: ${sessionDisplay}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (creditsUsed != null) {
      const creditsLine = [
        `Credits used: ${creditsUsed}`,
        remainingCredits != null ? `Remaining: ${remainingCredits}` : null,
      ]
        .filter(Boolean)
        .join('   ');
      b.drawTextSafe(creditsLine, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_SMALL,
        color: COLOR_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_SMALL);
    }
  } else {
    if (item.actorName) {
      b.drawTextSafe(`By: ${item.actorName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
    if (item.targetUserName) {
      b.drawTextSafe(`Member: ${item.targetUserName}`, {
        x: PAGE_MARGIN,
        y: b.y,
        size: T_BODY,
        color: COLOR_DARK_GRAY,
        fontType: 'regular',
        kind: 'body',
      });
      b.moveDown(LINE_HEIGHT_BODY);
    }
  }

  b.moveDown(CARD_PADDING_BOTTOM);

  // Light divider between entries
  b.drawDivider(b.y, 0.5, COLOR_LIGHT_GRAY);
}

// ─── Build filters subtitle ───────────────────────────────────────────────────

function buildSubtitle(filters: {
  memberName?: string;
  eventTypeLabel?: string;
  startDate?: string;
  endDate?: string;
}): string {
  const parts: string[] = [];
  if (filters.memberName) parts.push(`Member: ${filters.memberName}`);
  if (filters.eventTypeLabel && filters.eventTypeLabel !== 'All Events') {
    parts.push(`Event: ${filters.eventTypeLabel}`);
  }
  if (filters.startDate) parts.push(`From: ${filters.startDate}`);
  if (filters.endDate) parts.push(`To: ${filters.endDate}`);
  return parts.length > 0 ? parts.join('  ·  ') : 'All events';
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
  await ensureReportsDir();

  const fileName = buildFilename();
  const outputPath = `${REPORTS_DIR}/${fileName}`;

  const doc = await PDFDocument.create();
  doc.setProducer(BRANDING.pdf.producer);
  doc.setCreator(BRANDING.pdf.creator);

  const b = new PdfBuilder(doc);
  b.registerFontkit();
  await b.init();

  const contentWidth = b.width - PAGE_MARGIN * 2;
  const subtitle = buildSubtitle(filters);

  drawHeaderBlock(b, clubName, subtitle);
  drawEntryCount(b, logs.length);

  for (const item of logs) {
    const neededHeight = estimateEntryHeight(item) + 4; // 4px buffer
    b.checkPageBreak(neededHeight);
    drawEntry(b, item, contentWidth);
  }

  const reportId = `audit-${new Date().toISOString().slice(0, 10)}`;
  await b.addFooterToAllPages(reportId, false);

  await writePdf(doc, outputPath, 'Audit Log');
  await openPdf(outputPath);
}
