export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Formats a session time range compactly, e.g.:
 *   "Wed, Apr 22 · 7–8 AM"
 *   "Wed, Apr 22 · 11:30 AM–1:00 PM"
 * Falls back gracefully if endISO is missing.
 */
export const formatTimeRange = (
  startISO: string,
  endISO?: string | null,
): string => {
  const start = new Date(startISO);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const datePart = `${weekdays[start.getDay()]}, ${months[start.getMonth()]} ${start.getDate()}`;

  const fmtTime = (d: Date): {label: string; ampm: string} => {
    let h = d.getHours();
    const min = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const label = min === 0 ? `${h}` : `${h}:${min.toString().padStart(2, '0')}`;
    return {label, ampm};
  };

  const s = fmtTime(start);

  if (!endISO) {
    return `${datePart} · ${s.label} ${s.ampm}`;
  }

  const e = fmtTime(new Date(endISO));

  if (s.ampm === e.ampm) {
    return `${datePart} · ${s.label}–${e.label} ${e.ampm}`;
  }
  return `${datePart} · ${s.label} ${s.ampm}–${e.label} ${e.ampm}`;
};

export const formatTime = (isoString: string): string => {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const isToday = (isoString: string): boolean => {
  const date = new Date(isoString);
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatUiDateTime = (
  date: Date | string | number | undefined | null,
  opts?: {withTimeZone?: boolean; timeZoneName?: string},
): string => {
  if (!date) {
    return 'N/A';
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'N/A';
  }

  // Format: "Feb 11, 2026, 12:25 PM" -> "Feb 11, 2026 \u00B7 12:25 PM"
  // Manual formatting to ensure consistency across JS engines

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const m = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  let hour = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12; // the hour '0' should be '12'

  let result = `${m} ${day}, ${year} \u00B7 ${hour}:${min} ${ampm}`;

  if (opts?.withTimeZone && opts?.timeZoneName) {
    result += ` (${opts.timeZoneName})`;
  }

  return result;
};

export const getCurrentIsoDate = (): string => {
  return new Date().toISOString();
};
