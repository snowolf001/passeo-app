// src/services/pdfService.ts
import fontkit from '@pdf-lib/fontkit';
import {Buffer} from 'buffer';
import {PDFDocument, rgb} from 'pdf-lib';

import RNFS from 'react-native-fs';
import {BRANDING} from '../config/appConfig';
import {WATERMARK_TEXT} from '../config/constants';
import PdfMaker from '../native/PdfMaker';
import {getFileSize, getPdfPath, readFileAsBase64} from './fileStorage';
import {
  drawFullPageImageRotated,
  getRotatedPageSize,
  normalizeRotation,
} from './pdfRotation';

// Chunk size for processing images before yielding to event loop
const CHUNK_SIZE = 4; // Process 4 images per chunk

/**
 * Yield control back to the JavaScript event loop
 * Prevents watchdog timeouts and keeps UI responsive during large batches
 */
function yieldToMainThread(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

/**
 * Convert base64 string to Uint8Array (React Native compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
}

/**
 * Convert Uint8Array to base64 string (React Native compatible)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Detect image format from file content
 */
async function detectImageFormat(imagePath: string): Promise<'png' | 'jpeg'> {
  try {
    // Read first few bytes to detect format
    const header = await RNFS.read(imagePath, 8, 0, 'base64');
    const bytes = Buffer.from(header, 'base64');

    // PNG magic bytes: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'png';
    }

    // JPEG magic bytes: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'jpeg';
    }

    // Fallback: check file extension
    if (imagePath.toLowerCase().endsWith('.png')) {
      return 'png';
    }

    // Default to JPEG
    return 'jpeg';
  } catch (error) {
    console.warn('Failed to detect image format, defaulting to JPEG:', error);
    return 'jpeg';
  }
}

/**
 * Generate a PDF from page images using Native Module
 * @param pagePaths - Array of image file paths in order
 * @param documentId - Document ID for output filename
 * @returns Object with pdfPath and fileSize
 *
 * NOTE:
 * This is a generic utility and must not read entitlement state on its own.
 * The JS fallback passes isPro=true so this helper remains watermark-free.
 * Business-layer flows that need free/pro behavior should call generatePdfToPath(...)
 * with an explicit isPro value.
 */
export async function generatePdf(
  pagePaths: string[],
  documentId: string,
  rotations?: number[], // Optional rotation angles for each page
): Promise<{pdfPath: string; fileSize: number}> {
  if (pagePaths.length === 0) {
    throw new Error('No pages to generate PDF from');
  }

  const outputPath = getPdfPath(documentId);

  // Use native PDF generation if available
  if (PdfMaker.isAvailable) {
    if (__DEV__) {
      console.log(
        `[PDF] Generating native PDF: ${documentId} (${pagePaths.length} pages)`,
      );
    }

    try {
      await PdfMaker.createPdfFromImages(
        {
          imagePaths: pagePaths,
          outputPath,
          pageSize: 'A4',
          orientation: 'auto',
          margin: 20,
          maxPixel: 2200,
          jpegQuality: 0.82,
          background: 'white',
          fit: 'contain',
          rotations: rotations,
        },
        (current, total) => {
          if (__DEV__ && current % 5 === 0) {
            console.log(`[PDF] Progress: ${current}/${total}`);
          }
        },
      );

      const fileSize = await getFileSize(outputPath);
      return {pdfPath: outputPath, fileSize};
    } catch (error) {
      console.error(
        '[PDF] Native generation failed, falling back to JS:',
        error,
      );
      // Fall through to JS implementation
    }
  } else {
    if (__DEV__) {
      console.warn('[PDF] Native PdfMaker unavailable. Using JS fallback.');
    }
  }

  // JS fallback for generic utility path remains clean/watermark-free.
  try {
    const result = await generatePdfToPath(
      pagePaths,
      outputPath,
      rotations,
      true,
      false,
    );
    return {pdfPath: outputPath, fileSize: result.fileSize};
  } catch (error) {
    console.error('[PDF] JS Generation failed:', error);
    throw error;
  }
}

/**
 * Get PDF metadata (page count, etc.)
 */
export async function getPdfInfo(
  pdfPath: string,
): Promise<{pageCount: number}> {
  const pdfBase64 = await readFileAsBase64(pdfPath);
  const pdfBytes = base64ToUint8Array(pdfBase64);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  return {
    pageCount: pdfDoc.getPageCount(),
  };
}

/**
 * Generate a PDF to a specific path (used for crash-safe processing)
 * Watermark behavior is controlled ONLY by the explicit isPro argument.
 *
 * @param pagePaths - Array of image file paths in order
 * @param outputPath - Full path to write the PDF to
 * @param rotations - Optional rotation angles for each page
 * @param isPro - Explicit entitlement state from caller (store-verified for critical flows)
 * @param forceClean - If true, never show watermark
 * @returns Object with fileSize
 */
export async function generatePdfToPath(
  pagePaths: string[],
  outputPath: string,
  rotations?: number[],
  isPro: boolean = false,
  forceClean: boolean = false,
): Promise<{fileSize: number}> {
  if (pagePaths.length === 0) {
    throw new Error('No pages to generate PDF from');
  }

  const shouldShowWatermark =
    !forceClean && BRANDING.WATERMARK_ENABLED && !isPro;

  console.log(
    'generatePdfToPath: isPro =',
    isPro,
    'forceClean =',
    forceClean,
    '→ watermark:',
    shouldShowWatermark,
  );

  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Embed font for watermark (only if needed)
  const fontBase64 = await RNFS.readFileAssets(
    'fonts/NotoSansCJKsc-Regular.otf',
    'base64',
  );
  const fontBytes = Buffer.from(fontBase64, 'base64');

  const font = await pdfDoc.embedFont(fontBytes, {subset: true});

  for (let i = 0; i < pagePaths.length; i++) {
    const imagePath = pagePaths[i];
    const rawRotation = rotations?.[i] || 0;
    const rotation = normalizeRotation(rawRotation);

    if (__DEV__ && rawRotation !== rotation) {
      console.log(
        `[generatePdfToPath] Normalized rotation ${rawRotation}° -> ${rotation}°`,
      );
    }

    // Read image as base64
    const imageBase64 = await readFileAsBase64(imagePath);
    const imageBytes = base64ToUint8Array(imageBase64);

    // Detect image format from content
    const format = await detectImageFormat(imagePath);

    // Embed image based on detected format
    let image;
    try {
      if (format === 'png') {
        image = await pdfDoc.embedPng(imageBytes);
      } else {
        image = await pdfDoc.embedJpg(imageBytes);
      }
    } catch (error) {
      // If embedding fails, try the other format
      console.warn(
        `Failed to embed as ${format}, trying alternative format:`,
        error,
      );
      try {
        if (format === 'png') {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          image = await pdfDoc.embedPng(imageBytes);
        }
      } catch (retryError) {
        throw new Error(`Failed to embed image ${imagePath}: ${error}`);
      }
    }

    // Get image dimensions
    const {width, height} = image.scale(1);

    const pageDims = getRotatedPageSize(width, height, rotation);
    const page = pdfDoc.addPage([pageDims.width, pageDims.height]);

    drawFullPageImageRotated(
      page,
      image,
      rotation,
      pageDims.width,
      pageDims.height,
    );

    if (shouldShowWatermark && font) {
      const pageWidth = pageDims.width;
      const pageHeight = pageDims.height;
      const fontSize = Math.min(pageWidth, pageHeight) * 0.04; // 4% of smaller dimension
      const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);

      // Position at bottom center with margin
      const x = (pageWidth - textWidth) / 2;
      const y = fontSize * 2;

      page.drawText(WATERMARK_TEXT, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.8,
      });
    }

    // Yield to event loop after every CHUNK_SIZE images
    if ((i + 1) % CHUNK_SIZE === 0 && i < pagePaths.length - 1) {
      if (__DEV__) {
        console.log(`[generatePdfToPath] Yielding after ${i + 1} images...`);
      }
      await yieldToMainThread();
    }
  }

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();

  // Convert to base64 for file writing
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);

  // Write to the specified path
  await RNFS.writeFile(outputPath, pdfBase64, 'base64');
  const fileSize = await getFileSize(outputPath);

  return {fileSize};
}

/**
 * Generate a clean (watermark-free) PDF for Pro users
 * Used for on-demand generation when viewing/sharing
 * @param pagePaths - Array of image file paths in order
 * @param outputPath - Full path to write the clean PDF to
 * @returns Object with fileSize
 */
export async function generateCleanPdf(
  pagePaths: string[],
  outputPath: string,
): Promise<{fileSize: number}> {
  if (pagePaths.length === 0) {
    throw new Error('No pages to generate PDF from');
  }

  // Use native PDF generation if available
  if (PdfMaker.isAvailable) {
    if (__DEV__) {
      console.log(`[PDF] Generating clean PDF (Native): ${outputPath}`);
    }

    try {
      await PdfMaker.createPdfFromImages({
        imagePaths: pagePaths,
        outputPath,
        pageSize: 'AUTO',
        orientation: 'auto',
        margin: 0,
        maxPixel: 2500,
        jpegQuality: 0.85,
        fit: 'contain',
      });

      const fileSize = await getFileSize(outputPath);
      return {fileSize};
    } catch (error) {
      console.error(
        '[PDF] Native clean PDF failed, falling back to JS:',
        error,
      );
      // Fall through
    }
  }

  // JS fallback: explicit clean generation, never watermark
  if (__DEV__) {
    console.warn('[PDF] Native clean PDF unavailable. Using JS fallback.');
  }

  return generatePdfToPath(pagePaths, outputPath, undefined, true, true);
}
