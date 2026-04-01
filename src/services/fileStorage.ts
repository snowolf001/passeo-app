// src/services/fileStorage.ts
import RNFS from 'react-native-fs';

/**
 * Wait for a file to exist and have a stable size
 * Useful for large files being written by another process
 * @param filePath - Path to the file
 * @param options - Configuration options
 * @returns True when file is stable
 * @throws Error if timeout or file never stabilizes
 */
export async function waitForStableFile(
  filePath: string,
  options: {
    totalTimeoutMs?: number;
    pollIntervalMs?: number;
    requiredStablePolls?: number;
  } = {},
): Promise<void> {
  const {
    totalTimeoutMs = 30000, // 30 seconds total
    pollIntervalMs = 200, // Check every 200ms
    requiredStablePolls = 3, // Size must be stable for 3 polls
  } = options;

  const startTime = Date.now();
  let lastSize = -1;
  let stableCount = 0;

  if (__DEV__) {
    console.log('[waitForStableFile] Waiting for file to stabilize:', filePath);
  }

  while (Date.now() - startTime < totalTimeoutMs) {
    try {
      const exists = await RNFS.exists(filePath);

      if (!exists) {
        // Reset stability counter if file doesn't exist
        lastSize = -1;
        stableCount = 0;
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      const stat = await RNFS.stat(filePath);
      const currentSize = Number(stat.size);

      if (currentSize === 0) {
        // File exists but empty, keep waiting
        lastSize = 0;
        stableCount = 0;
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      // Check if size is stable
      if (currentSize === lastSize && currentSize > 0) {
        stableCount++;
        if (stableCount >= requiredStablePolls) {
          const elapsed = Date.now() - startTime;
          if (__DEV__) {
            console.log('[waitForStableFile] File stable:', {
              path: filePath,
              size: currentSize,
              elapsedMs: elapsed,
            });
          }
          return; // Success!
        }
      } else {
        // Size changed, reset counter
        stableCount = 0;
      }

      lastSize = currentSize;
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.error('[waitForStableFile] Error checking file:', error);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  let errorMsg = `File did not stabilize within ${totalTimeoutMs}ms: ${filePath}`;

  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      const stat = await RNFS.stat(filePath);
      errorMsg += ` (exists: true, size: ${stat.size} bytes, elapsed: ${elapsed}ms)`;
    } else {
      errorMsg += ` (exists: false, elapsed: ${elapsed}ms)`;
    }
  } catch {
    errorMsg += ` (could not stat, elapsed: ${elapsed}ms)`;
  }

  console.error('[waitForStableFile] Timeout:', errorMsg);
  throw new Error(errorMsg);
}

/**
 * Get adaptive timeout for a file based on its size
 * @param filePath - Path to check
 * @returns Timeout in milliseconds
 */
export async function getAdaptiveTimeout(filePath: string): Promise<number> {
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return 10000; // 10 seconds for non-existent files
    }

    const stat = await RNFS.stat(filePath);
    const sizeBytes = Number(stat.size);
    const sizeMB = sizeBytes / (1024 * 1024);

    if (sizeMB > 5) {
      return 30000; // 30 seconds for large files (>5MB)
    } else if (sizeMB > 2) {
      return 20000; // 20 seconds for medium files (2-5MB)
    } else {
      return 10000; // 10 seconds for small files (<2MB)
    }
  } catch (error) {
    console.warn('[getAdaptiveTimeout] Error checking file size:', error);
    return 10000; // Default 10 seconds
  }
}

/**
 * Base directory for all app documents
 * - Android: /data/data/<pkg>/files/Passeo/
 * - iOS: Documents/Passeo/
 */
const APP_STORAGE_SLUG = 'Passeo'; // Used in directory names, can be customized but keep consistent with app identity

const BASE_DIR = `${RNFS.DocumentDirectoryPath}/${APP_STORAGE_SLUG}`;
const PAGES_DIR = `${BASE_DIR}/pages`;
const PDFS_DIR = `${BASE_DIR}/pdfs`;
const THUMBNAILS_DIR = `${BASE_DIR}/thumbnails`;

/**
 * Ensure all storage directories exist
 */
export async function initStorage(): Promise<void> {
  const dirs = [BASE_DIR, PAGES_DIR, PDFS_DIR, THUMBNAILS_DIR];
  for (const dir of dirs) {
    const exists = await RNFS.exists(dir);
    if (!exists) {
      await RNFS.mkdir(dir);
    }
  }
}

/**
 * Get the path for a page image
 * @param documentId - Document ID
 * @param pageNumber - Page number (1-based)
 * @returns Full path to the page image
 */
export function getPagePath(documentId: string, pageNumber: number): string {
  return `${PAGES_DIR}/${documentId}_page_${pageNumber}.jpg`;
}

/**
 * Get the path for a document's PDF
 * @param documentId - Document ID
 * @returns Full path to the PDF
 */
export function getPdfPath(documentId: string): string {
  return `${PDFS_DIR}/${documentId}.pdf`;
}

/**
 * Get a versioned PDF path to avoid platform-level caching (e.g., iOS file handles)
 */
export function getPdfVersionedPath(
  documentId: string,
  version: number,
): string {
  return `${PDFS_DIR}/${documentId}_v${version}.pdf`;
}

/**
 * Get temporary path for PDF (used during processing)
 */
export function getTempPdfPath(documentId: string): string {
  return `${PDFS_DIR}/${documentId}.pdf.tmp`;
}

/**
 * Get the path for a document's thumbnail
 * @param documentId - Document ID
 * @returns Full path to the thumbnail
 */
export function getThumbnailPath(documentId: string): string {
  return `${THUMBNAILS_DIR}/${documentId}_thumb.jpg`;
}

/**
 * Get temporary path for thumbnail (used during processing)
 */
export function getTempThumbnailPath(documentId: string): string {
  return `${THUMBNAILS_DIR}/${documentId}_thumb.jpg.tmp`;
}

/**
 * Move temp file to final path (atomic on most filesystems)
 */
export async function moveTempToFinal(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  // Delete final if it exists (to allow overwrite)
  const finalExists = await RNFS.exists(finalPath);
  if (finalExists) {
    await RNFS.unlink(finalPath);
  }
  await RNFS.moveFile(tempPath, finalPath);
}

/**
 * Cleanup temp files for a document
 */
export async function cleanupTempFiles(documentId: string): Promise<void> {
  const tempPaths = [
    getTempPdfPath(documentId),
    getTempThumbnailPath(documentId),
  ];

  for (const tempPath of tempPaths) {
    try {
      const exists = await RNFS.exists(tempPath);
      if (exists) {
        await RNFS.unlink(tempPath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${tempPath}:`, error);
    }
  }
}

/**
 * Check if a file exists and is non-empty
 */
export async function fileExistsAndValid(
  filePath: string | null,
): Promise<boolean> {
  if (!filePath) {
    return false;
  }
  try {
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      return false;
    }
    const stat = await RNFS.stat(filePath);
    return stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Save a scanned page image
 *
 * IMPORTANT: This function optimizes images at INGESTION time (when first added).
 * Images are resized and compressed HERE, not during PDF generation.
 * This ensures one-time processing and faster PDF exports.
 *
 * @param sourcePath - Temporary path from scanner/library
 * @param documentId - Document ID
 * @param pageNumber - Page number (1-based)
 * @returns Final path where optimized image is stored
 */
export async function savePageImage(
  sourcePath: string,
  documentId: string,
  pageNumber: number,
): Promise<string> {
  const destPath = getPagePath(documentId, pageNumber);

  // Ensure source exists
  const exists = await RNFS.exists(sourcePath);
  if (!exists) {
    throw new Error(`Source image not found: ${sourcePath}`);
  }

  if (__DEV__) {
    console.log('[savePageImage] Processing image:', {
      source: sourcePath,
      destination: destPath,
      documentId,
      pageNumber,
    });
  }

  // OPTIMIZE IMAGE AT INGESTION TIME (skip until native module is loaded)
  // For now, just copy the original image directly
  // TODO: Re-enable after proper rebuild
  const optimizedPath = sourcePath;

  if (__DEV__) {
    console.log(
      '[savePageImage] Using original image (optimization disabled):',
      {
        source: sourcePath,
        destination: destPath,
      },
    );
  }

  // If destination already exists, delete it first
  const destExists = await RNFS.exists(destPath);
  if (destExists) {
    await RNFS.unlink(destPath);
  }

  // Copy source to destination
  try {
    await RNFS.copyFile(sourcePath, destPath);

    if (__DEV__) {
      console.log('[savePageImage] Image saved successfully:', destPath);
    }

    return destPath;
  } catch (error) {
    console.error('[savePageImage] Failed to save image:', {
      source: sourcePath,
      destination: destPath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Copy first page as thumbnail (simple approach)
 * @param documentId - Document ID
 * @returns Thumbnail path
 */
export async function createThumbnail(documentId: string): Promise<string> {
  const firstPagePath = getPagePath(documentId, 1);
  const thumbPath = getThumbnailPath(documentId);

  const exists = await RNFS.exists(firstPagePath);
  if (!exists) {
    throw new Error(`First page not found: ${firstPagePath}`);
  }

  // For MVP, just copy the first page as thumbnail
  // Future: resize to smaller dimensions
  await RNFS.copyFile(firstPagePath, thumbPath);
  return thumbPath;
}

/**
 * Save PDF file
 * @param pdfBytes - PDF content as base64 string
 * @param documentId - Document ID
 * @returns PDF path
 */
export async function savePdf(
  pdfBase64: string,
  documentId: string,
): Promise<string> {
  const pdfPath = getPdfPath(documentId);
  await RNFS.writeFile(pdfPath, pdfBase64, 'base64');
  return pdfPath;
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stat = await RNFS.stat(filePath);
  return stat.size;
}

/**
 * Delete all files for a document (pages, PDF, thumbnail)
 * @param documentId - Document ID
 * @param pageCount - Number of pages to delete
 */
export async function deleteDocumentFiles(
  documentId: string,
  pageCount: number,
): Promise<void> {
  const filesToDelete: string[] = [];

  // Add page files
  for (let i = 1; i <= pageCount; i++) {
    filesToDelete.push(getPagePath(documentId, i));
  }

  // Add PDF and thumbnail
  filesToDelete.push(getPdfPath(documentId));
  filesToDelete.push(getThumbnailPath(documentId));

  // Delete each file if it exists
  for (const filePath of filesToDelete) {
    try {
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await RNFS.unlink(filePath);
      }
    } catch (error) {
      console.warn(`Failed to delete ${filePath}:`, error);
    }
  }
}

/**
 * Read file as base64
 */
export async function readFileAsBase64(filePath: string): Promise<string> {
  return RNFS.readFile(filePath, 'base64');
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  return RNFS.exists(filePath);
}

/**
 * Get the base directories (for debugging)
 */
export function getStorageDirectories() {
  return {
    base: BASE_DIR,
    pages: PAGES_DIR,
    pdfs: PDFS_DIR,
    thumbnails: THUMBNAILS_DIR,
  };
}

/**
 * Delete a single file safely (best-effort, logs errors)
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to delete file: ${filePath}`, error);
    return false;
  }
}

/**
 * Replace a page image - copies new image to a unique path
 * @param sourcePath - Path to new image (from scanner)
 * @param documentId - Document ID
 * @param pageId - Page ID (used to create unique filename)
 * @returns New permanent path for the image
 */
export async function replacePageImage(
  sourcePath: string,
  documentId: string,
  pageId: string,
): Promise<string> {
  // Use pageId in filename to ensure uniqueness (avoids conflicts with page_number based naming)
  const destPath = `${PAGES_DIR}/${documentId}_${pageId}.jpg`;

  const exists = await RNFS.exists(sourcePath);
  if (!exists) {
    throw new Error(`Source image not found: ${sourcePath}`);
  }

  // Delete the destination file if it exists (to avoid "item already exists" error)
  try {
    const destExists = await RNFS.exists(destPath);
    if (destExists) {
      await RNFS.unlink(destPath);
    }
  } catch (error) {
    console.warn('Failed to delete old image, will try to overwrite:', error);
  }

  // Copy (not move) so we can handle cleanup separately
  await RNFS.copyFile(sourcePath, destPath);

  // Delete the temp source file
  try {
    await RNFS.unlink(sourcePath);
  } catch {
    // Ignore temp file cleanup errors
  }

  return destPath;
}

/**
 * Get pages directory path (for external use)
 */
export function getPagesDir(): string {
  return PAGES_DIR;
}

/**
 * Normalize a file path for the current app container (iOS specific)
 * Fixes broken paths after app updates/sim restarts where UUID changes
 */
export function normalizePath(path: string): string;
export function normalizePath(path: string | null | undefined): string | null;
export function normalizePath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') {
    return null;
  }

  // Only process if it contains our app slug
  // This detects if the path includes "/Passeo/"
  if (path.includes(`/${APP_STORAGE_SLUG}/`)) {
    const parts = path.split(`/${APP_STORAGE_SLUG}/`);
    // If we have parts, the file is inside our app's storage structure
    if (parts.length >= 2) {
      // Reconstruct using the *current* BASE_DIR (which has the correct UUID)
      // We take the part after the slug (e.g., "pages/page1.jpg")
      const relativePart = parts.slice(1).join(`/${APP_STORAGE_SLUG}/`);
      return `${BASE_DIR}/${relativePart}`;
    }
  }
  return path;
}
