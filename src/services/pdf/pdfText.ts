import {PDFFont} from 'pdf-lib';

const isAscii = (s: string) => /^[\x00-\x7F]*$/.test(s || '');

/**
 * Normalize Private Use Area (PUA) digits and fullwidth digits to ASCII
 * PUA: U+F6B1..U+F6BA -> ASCII 0..9
 * Fullwidth: U+FF10..U+FF19 -> ASCII 0..9
 */
export function normalizeDigitsToAscii(input: string): string {
  if (!input) {
    return '';
  }
  let result = input;

  // PUA digits U+F6B1..U+F6BA -> 0..9
  const puaDigits = [
    '\uF6B1',
    '\uF6B2',
    '\uF6B3',
    '\uF6B4',
    '\uF6B5',
    '\uF6B6',
    '\uF6B7',
    '\uF6B8',
    '\uF6B9',
    '\uF6BA',
  ];
  puaDigits.forEach((pua, idx) => {
    const regex = new RegExp(pua, 'g');
    result = result.replace(regex, String(idx));
  });

  // Fullwidth digits U+FF10..U+FF19 -> 0..9
  result = result.replace(/[\uFF10-\uFF19]/g, ch =>
    String(ch.charCodeAt(0) - 0xff10),
  );

  return result;
}

/**
 * Fix "spaced digits" and "digit punctuation spacing" issues:
 * - "2 0 2 6-0 2-1 6 1 4:2 2" -> "2026-02-16 14:22"
 * - "February 1 6 , 2 0 2 6" -> "February 16, 2026"
 * - "Version 1 . 0 . 0 ( 1 )" -> "Version 1.0.0 (1)"
 * - "SHA-2 5 6 :" -> "SHA-256:"
 */
export function normalizeDigitAndPunctuationSpacing(input: string): string {
  if (!input) {
    return '';
  }
  let s = input;

  // collapse repeated spaces/tabs (keep newlines)
  s = s.replace(/[ \t]+/g, ' ');

  // Fix spaced-out digit sequences ONLY when clearly split digits like "2 0 2 6"
  s = s.replace(/\b(?:\d\s+){3,}\d\b/g, m => m.replace(/\s+/g, ''));

  // remove spaces between digit and trailing punctuation: "16 ," -> "16,"
  s = s.replace(/(\d)\s+([.,:;)\]\}])/g, '$1$2');

  // remove spaces after opening brackets: "( 1" -> "(1"
  s = s.replace(/([([\{])\s+(\d)/g, '$1$2');

  // remove spaces around common separators used in dates/versions/times:
  s = s.replace(/([\-\/:.])\s+(\d)/g, '$1$2');
  s = s.replace(/(\d)\s+([\-\/:.])/g, '$1$2');

  // "February 16 ,2026" -> "February 16, 2026"
  s = s.replace(/([A-Za-z])(\d),(\d)/g, '$1$2, $3');

  // "SHA-2 5 6" -> "SHA-256"
  s = s.replace(/SHA-?(\d)\s+(\d)\s+(\d)/gi, 'SHA-$1$2$3');

  // Label-only: "Captured:2026..." -> "Captured: 2026..."
  // (won't touch "14:22")
  s = s.replace(/([A-Za-z]):\s*(?=\d)/g, '$1: ');

  return s;
}

/**
 * Sanitize text for PDF rendering:
 * - Normalize digits to ASCII
 * - Remove unsafe control characters
 * - Fix spaced digits/punctuation
 * - Trim
 */
export function sanitizePdfText(input: string): string {
  if (!input) {
    return '';
  }
  let text = normalizeDigitsToAscii(input);

  // Remove control chars except tab/newline
  text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Fix "2 0 2 6" and "1 . 0 . 0" style issues
  text = normalizeDigitAndPunctuationSpacing(text);

  return text.trim();
}

/**
 * Dev assertion: detect PUA characters in text
 */
export function assertNoPuaChars(text: string, context: string = ''): void {
  if (__DEV__ && text) {
    const puaMatch = text.match(/[\uF000-\uF8FF]/g);
    if (puaMatch) {
      console.error(
        `[PDF] PUA characters detected in ${context}:`,
        puaMatch,
        text.substring(0, 140),
      );
    }
  }
}

export function truncateToWidth(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
): string {
  const input = sanitizePdfText(text).replace(/\s+/g, ' ').trim();
  if (!input) {
    return '';
  }
  if (font.widthOfTextAtSize(input, fontSize) <= maxWidth) {
    return input;
  }

  const ellipsis = '...';
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);
  if (ellipsisWidth >= maxWidth) {
    return '';
  }

  let low = 0;
  let high = input.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = input.slice(0, mid);
    const width = font.widthOfTextAtSize(candidate, fontSize) + ellipsisWidth;
    if (width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${input.slice(0, low)}${ellipsis}`;
}

export function isAsciiOnly(s: string): boolean {
  return isAscii(s);
}
