import {sanitizePdfText} from './pdfText';

export function toIsoWithOffset(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offHour = pad(Math.floor(absMin / 60));
  const offMin = pad(absMin % 60);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offHour}:${offMin}`;
}

export function getTimeZoneLabel(date: Date): string {
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tzName) {
    return tzName;
  }
  const iso = toIsoWithOffset(date);
  return `UTC${iso.slice(-6)}`;
}

export function formatCapturedFromIso(capturedAt?: string): string {
  if (!capturedAt) {
    return 'N/A';
  }
  const dt = new Date(capturedAt);
  if (isNaN(dt.getTime())) {
    return 'N/A';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const result = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate(),
  )} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  return sanitizePdfText(result);
}

export function formatCapturedFromMs(capturedAtMs?: number): string {
  if (!capturedAtMs || !Number.isFinite(capturedAtMs)) {
    return 'N/A';
  }
  return formatCapturedFromIso(new Date(capturedAtMs).toISOString());
}
