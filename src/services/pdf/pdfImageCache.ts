import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';

// PDF image cache:
// - Generates resized JPEGs for embedding into PDF
// - Caches on disk (CachesDirectoryPath) and in-memory map
//
// Hardening:
// - Precheck file existence (for file:// inputs)
// - Add timeouts around ImageResizer and file moves
// - Use stable, short, collision-resistant cache keys

const memCache = new Map<string, string>(); // cacheKey -> resizedUri

function toFileUri(uriOrPath: string): string {
  if (!uriOrPath) {
    return '';
  }
  if (uriOrPath.startsWith('file://')) {
    return uriOrPath;
  }
  return `file://${uriOrPath}`;
}

function stripFileScheme(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

function isUnsupportedScheme(uri: string): boolean {
  return (
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  );
}

// Simple non-crypto hash to keep key short & stable without extra deps
function hash32(input: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  // base36 keeps it short
  return h.toString(36);
}

function safeKey(input: string): string {
  // Keep a short readable prefix plus hash
  const normalized = input.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = normalized.slice(0, 40);
  const h = hash32(input);
  return `${prefix}_${h}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function ensureInputExists(fileUri: string) {
  // Only meaningful for file:// URIs. For content/ph schemes we let caller handle.
  if (!fileUri || !fileUri.startsWith('file://')) {
    return;
  }

  const path = stripFileScheme(fileUri);
  try {
    const exists = await RNFS.exists(path);
    if (!exists) {
      throw new Error('Source image file is missing.');
    }
  } catch (e: any) {
    // Normalize to a clear error message
    throw new Error(e?.message || 'Source image file is missing.');
  }
}

export async function getPdfImageUri(
  originalUriOrPath: string,
  opts?: {maxW?: number; maxH?: number; quality?: number},
): Promise<string> {
  const maxW = opts?.maxW ?? 1600;
  const maxH = opts?.maxH ?? 1600;
  const quality = opts?.quality ?? 80;

  const input = toFileUri(originalUriOrPath);
  if (!input) {
    throw new Error('getPdfImageUri: missing input uri');
  }

  // If caller accidentally passes unsupported scheme, fail fast (renderEvidencePhotos already skips these)
  if (isUnsupportedScheme(input)) {
    throw new Error(`getPdfImageUri: unsupported uri scheme: ${input}`);
  }

  // Important: include transform params in the cache key
  const cacheKey = `${input}|${maxW}x${maxH}|q${quality}`;

  const cached = memCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Precheck: if input is a file:// uri, make sure it still exists
  await ensureInputExists(input);

  const key = safeKey(input);
  const outPath = `${RNFS.CachesDirectoryPath}/pdfimg_${key}_${maxW}x${maxH}_q${quality}.jpg`;
  const outUri = toFileUri(outPath);

  // Disk cache hit
  try {
    if (await RNFS.exists(outPath)) {
      memCache.set(cacheKey, outUri);
      return outUri;
    }
  } catch {
    // ignore and continue
  }

  // Create resized image with timeout to prevent hangs on some devices / missing inputs
  const resized = await withTimeout(
    ImageResizer.createResizedImage(
      input,
      maxW,
      maxH,
      'JPEG',
      quality,
      0,
      undefined,
      false,
      {mode: 'contain'},
    ),
    12000,
    'ImageResizer.createResizedImage',
  );

  const resizedUri = toFileUri(resized.uri);
  const resizedPath = stripFileScheme(resizedUri);

  // Best-effort: move to deterministic cache path if needed
  try {
    if (resizedPath && resizedPath !== outPath) {
      const tmpExists = await RNFS.exists(resizedPath);
      if (tmpExists) {
        // move can occasionally hang; protect with timeout
        await withTimeout(
          RNFS.moveFile(resizedPath, outPath),
          8000,
          'RNFS.moveFile',
        );
      }
    }
  } catch {
    // ignore move failures
  }

  // Prefer deterministic cached file if present, else return resized uri
  let finalUri = resizedUri;
  try {
    const exists = await RNFS.exists(outPath);
    finalUri = exists ? outUri : resizedUri;
  } catch {
    finalUri = resizedUri;
  }

  memCache.set(cacheKey, finalUri);
  return finalUri;
}
