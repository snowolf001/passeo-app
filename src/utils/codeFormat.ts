export function normalizeCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// 用于 Recovery code（XXXX-XXXX）
export function formatRecoveryCode(input: string): string {
  const raw = normalizeCode(input);

  if (raw.length <= 4) return raw;
  return raw.slice(0, 4) + '-' + raw.slice(4, 8);
}

// Join code（不加 -）
export function formatJoinCode(input: string): string {
  return normalizeCode(input);
}

// 校验（你可以按需要调整）
export function isValidJoinCode(code: string): boolean {
  return code.length >= 6;
}

export function isValidRecoveryCode(code: string): boolean {
  return code.length === 9; // XXXX-XXXX
}
