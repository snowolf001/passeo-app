// android/app/src/main/java/com/cleanutilityapps/passeo/PdfMakerModule.kt
package com.cleanutilityapps.passeo


import android.graphics.*
import android.graphics.pdf.PdfDocument
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class PdfMakerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()
    private val activeJobs = ConcurrentHashMap<String, Boolean>()

    override fun getName(): String = "PdfMaker"

    @ReactMethod
    fun startJob(options: ReadableMap, promise: Promise) {
        val imagePaths = options.getArray("imagePaths")?.toArrayList()?.map { it.toString() }
        val outputPath = options.getString("outputPath")

        if (imagePaths == null || imagePaths.isEmpty() || outputPath == null) {
            promise.reject("INVALID_PARAMS", "Missing or invalid imagePaths/outputPath")
            return
        }

        val jobId = UUID.randomUUID().toString()
        val pageSize = options.getString("pageSize") ?: "A4"
        val orientation = options.getString("orientation") ?: "portrait"
        val margin = if (options.hasKey("margin")) options.getDouble("margin").toFloat() else 20f
        val maxPixel = if (options.hasKey("maxPixel")) options.getInt("maxPixel") else 2200
        val jpegQuality = if (options.hasKey("jpegQuality")) options.getDouble("jpegQuality").toFloat() else 0.82f
        val background = options.getString("background") ?: "white"
        val fit = options.getString("fit") ?: "contain"
        val rotations = options.getArray("rotations")?.toArrayList()?.map {
            (it as? Double)?.toInt() ?: 0
        } ?: emptyList()

        activeJobs[jobId] = true

        val result = Arguments.createMap().apply {
            putString("jobId", jobId)
            putString("outputPath", outputPath)
        }
        promise.resolve(result)

        executor.execute {
            executeJob(
                jobId = jobId,
                imagePaths = imagePaths,
                outputPath = outputPath,
                pageSize = pageSize,
                orientation = orientation,
                margin = margin,
                maxPixel = maxPixel,
                jpegQuality = jpegQuality,
                background = background,
                fit = fit,
                rotations = rotations
            )
        }
    }

    @ReactMethod
    fun cancelJob(jobId: String, promise: Promise) {
        if (activeJobs.containsKey(jobId)) {
            activeJobs[jobId] = false
            promise.resolve(true)
        } else {
            promise.reject("JOB_NOT_FOUND", "Job $jobId not found")
        }
    }

    private fun isJobCancelled(jobId: String): Boolean {
        return activeJobs[jobId] == false
    }

    private fun executeJob(
        jobId: String,
        imagePaths: List<String>,
        outputPath: String,
        pageSize: String,
        orientation: String,
        margin: Float,
        maxPixel: Int,
        jpegQuality: Float,
        background: String,
        fit: String,
        rotations: List<Int>
    ) {
        val pdfDocument = PdfDocument()

        try {
            // Ensure output directory exists
            val outputFile = File(outputPath)
            outputFile.parentFile?.mkdirs()

            // Delete existing file
            if (outputFile.exists()) {
                outputFile.delete()
            }

            val total = imagePaths.size

            for ((index, imagePath) in imagePaths.withIndex()) {
                // Check cancellation
                if (isJobCancelled(jobId)) {
                    sendError(jobId, "Job cancelled", index, imagePath)
                    pdfDocument.close()
                    cleanupJob(jobId)
                    return
                }

                try {
                    // Load and downsample bitmap
                    val bitmap = loadDownsampledBitmap(imagePath, maxPixel)
                        ?: throw Exception("Failed to load bitmap")

                    try {
                        // Calculate page dimensions
                        val pageDimensions = calculatePageDimensions(
                            pageSize = pageSize,
                            orientation = orientation,
                            imageWidth = bitmap.width,
                            imageHeight = bitmap.height
                        )

                        // Create page
                        val pageInfo = PdfDocument.PageInfo.Builder(
                            pageDimensions.width.toInt(),
                            pageDimensions.height.toInt(),
                            index + 1
                        ).create()

                        val page = pdfDocument.startPage(pageInfo)
                        val canvas = page.canvas

                        // Draw background
                        val bgColor = if (background == "black") Color.BLACK else Color.WHITE
                        canvas.drawColor(bgColor)

                        // Get rotation for this page
                        val rotation = if (index < rotations.size) rotations[index] else 0
                        val normalizedRotation = normalizeRotation(rotation)

                        // Calculate draw rect
                        val drawRect = calculateDrawRect(
                            bitmap = bitmap,
                            pageWidth = pageDimensions.width,
                            pageHeight = pageDimensions.height,
                            margin = margin,
                            fit = fit
                        )

                        // Apply rotation and draw bitmap
                        canvas.save()
                        applyRotation(canvas, normalizedRotation, drawRect)

                        val paint = Paint().apply {
                            isAntiAlias = true
                            isFilterBitmap = true
                        }
                        canvas.drawBitmap(bitmap, null, drawRect, paint)
                        canvas.restore()

                        pdfDocument.finishPage(page)

                        // Send progress
                        sendProgress(jobId, index + 1, total)

                    } finally {
                        bitmap.recycle()
                    }

                } catch (e: Exception) {
                    sendError(jobId, e.message ?: "Failed to process image", index, imagePath)
                    pdfDocument.close()
                    cleanupJob(jobId)
                    return
                }
            }

            // Write PDF to file
            FileOutputStream(outputFile).use { outputStream ->
                pdfDocument.writeTo(outputStream)
            }

            pdfDocument.close()

            // Send done event
            sendDone(jobId, outputPath, total)

        } catch (e: Exception) {
            try {
                pdfDocument.close()
            } catch (_: Exception) {}
            sendError(jobId, e.message ?: "PDF generation failed", -1, outputPath)
        } finally {
            cleanupJob(jobId)
        }
    }

    private fun loadDownsampledBitmap(path: String, maxPixel: Int): Bitmap? {
        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }

        BitmapFactory.decodeFile(path, options)

        val imageWidth = options.outWidth
        val imageHeight = options.outHeight

        if (imageWidth <= 0 || imageHeight <= 0) {
            return null
        }

        // Calculate inSampleSize
        var inSampleSize = 1
        val maxDimension = maxOf(imageWidth, imageHeight)

        if (maxDimension > maxPixel) {
            inSampleSize = (maxDimension / maxPixel).toInt()
            if (inSampleSize < 1) inSampleSize = 1
        }

        options.inJustDecodeBounds = false
        options.inSampleSize = inSampleSize
        options.inPreferredConfig = Bitmap.Config.ARGB_8888

        return BitmapFactory.decodeFile(path, options)
    }

    private data class PageDimensions(val width: Float, val height: Float)

    private fun calculatePageDimensions(
        pageSize: String,
        orientation: String,
        imageWidth: Int,
        imageHeight: Int
    ): PageDimensions {
        // Convert mm to points (1 point = 1/72 inch, 1 inch = 25.4mm)
        val mmToPoints = 72f / 25.4f

        var width: Float
        var height: Float

        when (pageSize.uppercase()) {
            "LETTER" -> {
                width = 612f  // 8.5 inches
                height = 792f // 11 inches
            }
            "A4" -> {
                width = 595f  // 210mm
                height = 842f // 297mm
            }
            "AUTO" -> {
                val aspectRatio = imageWidth.toFloat() / imageHeight.toFloat()
                if (aspectRatio > 1) {
                    width = 842f
                    height = 595f
                } else {
                    width = 595f
                    height = 842f
                }
            }
            else -> {
                width = 595f
                height = 842f
            }
        }

        // Apply orientation
        val finalOrientation = if (orientation == "auto") {
            if (imageWidth > imageHeight) "landscape" else "portrait"
        } else {
            orientation
        }

        if (finalOrientation == "landscape") {
            val temp = width
            width = height
            height = temp
        }

        return PageDimensions(width, height)
    }

    private fun calculateDrawRect(
        bitmap: Bitmap,
        pageWidth: Float,
        pageHeight: Float,
        margin: Float,
        fit: String
    ): RectF {
        val contentWidth = pageWidth - 2 * margin
        val contentHeight = pageHeight - 2 * margin

        val imageAspect = bitmap.width.toFloat() / bitmap.height.toFloat()
        val contentAspect = contentWidth / contentHeight

        return if (fit == "cover") {
            // Cover: fill entire content area, may crop
            if (imageAspect > contentAspect) {
                // Image wider, fit height
                val drawHeight = contentHeight
                val drawWidth = drawHeight * imageAspect
                val offsetX = (contentWidth - drawWidth) / 2
                RectF(
                    margin + offsetX,
                    margin,
                    margin + offsetX + drawWidth,
                    margin + drawHeight
                )
            } else {
                // Image taller, fit width
                val drawWidth = contentWidth
                val drawHeight = drawWidth / imageAspect
                val offsetY = (contentHeight - drawHeight) / 2
                RectF(
                    margin,
                    margin + offsetY,
                    margin + drawWidth,
                    margin + offsetY + drawHeight
                )
            }
        } else {
            // Contain: fit entire image, may have letterbox
            if (imageAspect > contentAspect) {
                // Image wider, fit width
                val drawWidth = contentWidth
                val drawHeight = drawWidth / imageAspect
                val offsetY = (contentHeight - drawHeight) / 2
                RectF(
                    margin,
                    margin + offsetY,
                    margin + drawWidth,
                    margin + offsetY + drawHeight
                )
            } else {
                // Image taller, fit height
                val drawHeight = contentHeight
                val drawWidth = drawHeight * imageAspect
                val offsetX = (contentWidth - drawWidth) / 2
                RectF(
                    margin + offsetX,
                    margin,
                    margin + offsetX + drawWidth,
                    margin + drawHeight
                )
            }
        }
    }

    private fun sendProgress(jobId: String, current: Int, total: Int) {
        val params = Arguments.createMap().apply {
            putString("jobId", jobId)
            putInt("current", current)
            putInt("total", total)
        }
        sendEvent("PdfMakerProgress", params)
    }

    private fun sendDone(jobId: String, outputPath: String, pageCount: Int) {
        val params = Arguments.createMap().apply {
            putString("jobId", jobId)
            putString("outputPath", outputPath)
            putInt("pageCount", pageCount)
        }
        sendEvent("PdfMakerDone", params)
    }

    private fun sendError(jobId: String, message: String, index: Int, path: String) {
        val params = Arguments.createMap().apply {
            putString("jobId", jobId)
            putString("message", message)
            putInt("failedIndex", index)
            putString("failedPath", path)
        }
        sendEvent("PdfMakerError", params)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun cleanupJob(jobId: String) {
        activeJobs.remove(jobId)
    }

    // MARK: - Rotation Helpers

    /**
     * Normalize rotation to 0, 90, 180, or 270
     */
    private fun normalizeRotation(rotation: Int): Int {
        val normalized = rotation % 360
        val positive = if (normalized < 0) normalized + 360 else normalized

        // Snap to nearest 90-degree increment
        return (positive / 90) * 90
    }

    /**
     * Apply rotation transform to canvas for drawing
     */
    private fun applyRotation(canvas: Canvas, rotation: Int, rect: RectF) {
        val centerX = rect.centerX()
        val centerY = rect.centerY()

        // Move origin to center of rect
        canvas.translate(centerX, centerY)

        // Apply rotation (Android uses degrees)
        canvas.rotate(rotation.toFloat())

        // Move origin back
        canvas.translate(-centerX, -centerY)
    }
}
