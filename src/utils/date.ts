export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
