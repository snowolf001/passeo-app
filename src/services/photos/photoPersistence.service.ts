// src/services/photos/photoPersistence.service.ts
import RNFS from 'react-native-fs';
import ImageResizer from 'react-native-image-resizer';

export interface PersistPhotoParams {
  sessionId: string;
  photoId: string;
  sourceUri: string;
  maxW?: number;
  maxH?: number;
  quality?: number;
}

export interface PersistPhotoResult {
  durableUri: string;
  durablePath: string;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label} took longer than ${ms}ms`));
    }, ms);

    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function normalizePathFromUri(uriOrPath: string): string {
  if (uriOrPath.startsWith('file://')) {
    return uriOrPath.replace('file://', '');
  }
  return uriOrPath;
}

async function ensureDir(path: string): Promise<void> {
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
}

export async function persistPhotoToDocuments(
  params: PersistPhotoParams,
): Promise<PersistPhotoResult> {
  const {
    sessionId,
    photoId,
    sourceUri,
    maxW = 1600,
    maxH = 1600,
    quality = 80,
  } = params;

  try {
    const evidenceRoot = `${RNFS.DocumentDirectoryPath}/evidence`;
    const baseDir = `${evidenceRoot}/${sessionId}`;

    // Ensure dirs exist (avoid non-recursive mkdir edge cases)
    await ensureDir(evidenceRoot);
    await ensureDir(baseDir);

    const outputPath = `${baseDir}/${photoId}.jpg`;

    // Resize/compress first (resizer returns a temp file path)
    const resizedImage = await withTimeout(
      ImageResizer.createResizedImage(
        sourceUri,
        maxW,
        maxH,
        'JPEG',
        quality,
        0,
        undefined,
        true, // ✅ keepMeta = true (safer; does NOT change your capturedAt logic)
        {mode: 'contain'},
      ),
      12000,
      'ImageResizer.createResizedImage',
    );

    // Replace if exists
    if (await RNFS.exists(outputPath)) {
      await withTimeout(
        RNFS.unlink(outputPath),
        4000,
        'RNFS.unlink(outputPath)',
      );
    }

    const tempPath = normalizePathFromUri(resizedImage.path);

    // Move; fallback to copy if move fails
    try {
      await withTimeout(
        RNFS.moveFile(tempPath, outputPath),
        8000,
        'RNFS.moveFile',
      );
    } catch (moveErr) {
      await withTimeout(
        RNFS.copyFile(tempPath, outputPath),
        8000,
        'RNFS.copyFile(fallback)',
      );
      // Best-effort cleanup
      try {
        await RNFS.unlink(tempPath);
      } catch {}
    }

    const stat = await withTimeout(
      RNFS.stat(outputPath),
      4000,
      'RNFS.stat(outputPath)',
    );
    if (!stat || Number(stat.size) <= 0) {
      throw new Error('Persisted file has zero size');
    }

    return {durableUri: `file://${outputPath}`, durablePath: outputPath};
  } catch (error) {
    console.error('[PhotoPersistence] Failed to persist photo:', error);
    throw new Error(
      `Failed to persist photo: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
