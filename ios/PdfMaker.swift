// ios/Passeo/PdfMaker.swift
import Foundation
import UIKit
import CoreGraphics
import ImageIO
import React

@objc(PdfMaker)
class PdfMaker: RCTEventEmitter {

  private var jobQueue = DispatchQueue(label: "com.passeo.pdfmaker", qos: .userInitiated)
  private var activeJobs: [String: Bool] = [:]
  private var jobsLock = NSLock()

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return ["PdfMakerProgress", "PdfMakerDone", "PdfMakerError"]
  }

  // MARK: - React Native Exports (MUST match PdfMaker.m selectors)

  @objc(startJob:resolver:rejecter:)
  func startJob(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let imagePaths = options["imagePaths"] as? [String],
          let outputPath = options["outputPath"] as? String,
          !imagePaths.isEmpty else {
      reject("INVALID_PARAMS", "Missing or invalid imagePaths/outputPath", nil)
      return
    }

    let jobId = UUID().uuidString
    let pageSize = options["pageSize"] as? String ?? "A4"
    let orientation = options["orientation"] as? String ?? "portrait"
    let margin = CGFloat((options["margin"] as? NSNumber)?.doubleValue ?? 20.0)
    let maxPixel = (options["maxPixel"] as? NSNumber)?.intValue ?? 2200
    let jpegQuality = CGFloat((options["jpegQuality"] as? NSNumber)?.doubleValue ?? 0.82)
    let background = options["background"] as? String ?? "white"
    let fit = options["fit"] as? String ?? "contain"
    let rotations = options["rotations"] as? [Int] ?? []

    jobsLock.lock()
    activeJobs[jobId] = true
    jobsLock.unlock()

    resolve([
      "jobId": jobId,
      "outputPath": outputPath
    ])

    jobQueue.async { [weak self] in
      self?.executeJob(
        jobId: jobId,
        imagePaths: imagePaths,
        outputPath: outputPath,
        pageSize: pageSize,
        orientation: orientation,
        margin: margin,
        maxPixel: maxPixel,
        jpegQuality: jpegQuality,
        rotations: rotations,
        background: background,
        fit: fit
      )
    }
  }

  @objc(cancelJob:resolver:rejecter:)
  func cancelJob(
    _ jobId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    jobsLock.lock()
    if activeJobs[jobId] != nil {
      activeJobs[jobId] = false
      jobsLock.unlock()
      resolve(true)
    } else {
      jobsLock.unlock()
      reject("JOB_NOT_FOUND", "Job \(jobId) not found", nil)
    }
  }

  // MARK: - Job Execution

  private func isJobCancelled(_ jobId: String) -> Bool {
    jobsLock.lock()
    defer { jobsLock.unlock() }
    return activeJobs[jobId] == false
  }

  private func executeJob(
    jobId: String,
    imagePaths: [String],
    outputPath: String,
    pageSize: String,
    orientation: String,
    margin: Double,
    maxPixel: Int,
    jpegQuality: Double,
    rotations: [Int],
    background: String,
    fit: String
  ) {
    let outputURL = URL(fileURLWithPath: outputPath)

    // Ensure output directory exists
    let outputDir = outputURL.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

    // Delete existing file if present
    try? FileManager.default.removeItem(at: outputURL)

    guard UIGraphicsBeginPDFContextToFile(outputPath, .zero, nil) else {
      sendError(jobId: jobId, message: "Failed to create PDF context", index: -1, path: outputPath)
      cleanupJob(jobId)
      return
    }

    defer {
      UIGraphicsEndPDFContext()
      cleanupJob(jobId)
    }

    let total = imagePaths.count

    for (index, imagePath) in imagePaths.enumerated() {
      autoreleasepool {
        // Check cancellation
        if isJobCancelled(jobId) {
          sendError(jobId: jobId, message: "Job cancelled", index: index, path: imagePath)
          return
        }

        // Load and downsample image
        guard let cgImg = loadImageSource(path: imagePath, maxPixel: maxPixel) else {
          sendError(jobId: jobId, message: "Failed to load image", index: index, path: imagePath)
          return
        }

        let image = UIImage(cgImage: cgImg)

        // Calculate page rect
        let pageRect = calculatePageRect(
          pageSize: pageSize,
          orientation: orientation,
          imageSize: image.size
        )

        // Begin PDF page
        UIGraphicsBeginPDFPageWithInfo(pageRect, nil)

        guard let context = UIGraphicsGetCurrentContext() else {
          sendError(jobId: jobId, message: "Failed to get PDF context", index: index, path: imagePath)
          return
        }

        // Draw background
        context.setFillColor(background == "black" ? UIColor.black.cgColor : UIColor.white.cgColor)
        context.fill(pageRect)

        // Get rotation for this page
        let rotation = index < rotations.count ? rotations[index] : 0
        let normalizedRotation = normalizeRotation(rotation)

        // Calculate draw rect with margin
        let drawRect = calculateDrawRect(
          image: image,
          pageRect: pageRect,
          margin: margin,
          fit: fit
        )

        // Apply rotation and draw image
        context.saveGState()
        applyRotation(context: context, rotation: normalizedRotation, rect: drawRect)
        image.draw(in: drawRect)
        context.restoreGState()

        // Send progress
        sendProgress(jobId: jobId, current: index + 1, total: total)
      }
    }

    // Send done event
    sendDone(jobId: jobId, outputPath: outputPath, pageCount: total)
  }

  // MARK: - Image Loading

  private func loadImageSource(path: String, maxPixel: Int) -> CGImage? {
    let url = URL(fileURLWithPath: path)

    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      return nil
    }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixel
    ]

    return CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary)
  }

  // MARK: - Layout

  private func calculatePageRect(pageSize: String, orientation: String, imageSize: CGSize) -> CGRect {
    var width: CGFloat
    var height: CGFloat

    // Standard page sizes in points (1 point = 1/72 inch)
    switch pageSize.uppercased() {
    case "LETTER":
      width = 612  // 8.5 inches
      height = 792 // 11 inches
    case "A4":
      width = 595  // 210mm
      height = 842 // 297mm
    case "AUTO":
      // Use image aspect ratio
      let aspectRatio = imageSize.width / imageSize.height
      if aspectRatio > 1 {
        // Landscape-ish
        width = 842
        height = 595
      } else {
        // Portrait-ish
        width = 595
        height = 842
      }
    default:
      width = 595
      height = 842
    }

    // Apply orientation
    let finalOrientation = orientation == "auto"
      ? (imageSize.width > imageSize.height ? "landscape" : "portrait")
      : orientation

    if finalOrientation == "landscape" {
      swap(&width, &height)
    }

    return CGRect(x: 0, y: 0, width: width, height: height)
  }

  private func calculateDrawRect(image: UIImage, pageRect: CGRect, margin: CGFloat, fit: String) -> CGRect {
    let imageSize = image.size
    let contentRect = pageRect.insetBy(dx: margin, dy: margin)

    let imageAspect = imageSize.width / imageSize.height
    let contentAspect = contentRect.width / contentRect.height

    var drawRect: CGRect

    if fit == "cover" {
      // Cover: fill entire content area, may crop
      if imageAspect > contentAspect {
        // Image wider, fit height
        let drawHeight = contentRect.height
        let drawWidth = drawHeight * imageAspect
        let offsetX = (contentRect.width - drawWidth) / 2
        drawRect = CGRect(
          x: contentRect.minX + offsetX,
          y: contentRect.minY,
          width: drawWidth,
          height: drawHeight
        )
      } else {
        // Image taller, fit width
        let drawWidth = contentRect.width
        let drawHeight = drawWidth / imageAspect
        let offsetY = (contentRect.height - drawHeight) / 2
        drawRect = CGRect(
          x: contentRect.minX,
          y: contentRect.minY + offsetY,
          width: drawWidth,
          height: drawHeight
        )
      }
    } else {
      // Contain: fit entire image, may have letterbox
      if imageAspect > contentAspect {
        // Image wider, fit width
        let drawWidth = contentRect.width
        let drawHeight = drawWidth / imageAspect
        let offsetY = (contentRect.height - drawHeight) / 2
        drawRect = CGRect(
          x: contentRect.minX,
          y: contentRect.minY + offsetY,
          width: drawWidth,
          height: drawHeight
        )
      } else {
        // Image taller, fit height
        let drawHeight = contentRect.height
        let drawWidth = drawHeight * imageAspect
        let offsetX = (contentRect.width - drawWidth) / 2
        drawRect = CGRect(
          x: contentRect.minX + offsetX,
          y: contentRect.minY,
          width: drawWidth,
          height: drawHeight
        )
      }
    }

    return drawRect
  }

  // MARK: - Events

  private func sendProgress(jobId: String, current: Int, total: Int) {
    sendEvent(withName: "PdfMakerProgress", body: [
      "jobId": jobId,
      "current": current,
      "total": total
    ])
  }

  private func sendDone(jobId: String, outputPath: String, pageCount: Int) {
    sendEvent(withName: "PdfMakerDone", body: [
      "jobId": jobId,
      "outputPath": outputPath,
      "pageCount": pageCount
    ])
  }

  private func sendError(jobId: String, message: String, index: Int, path: String) {
    sendEvent(withName: "PdfMakerError", body: [
      "jobId": jobId,
      "message": message,
      "failedIndex": index,
      "failedPath": path
    ])
  }

  // MARK: - Rotation Helpers

  /// Normalize rotation to 0, 90, 180, or 270 (nearest 90)
  private func normalizeRotation(_ rotation: Int) -> Int {
    var normalized = rotation % 360
    if normalized < 0 { normalized += 360 }
    let snapped = Int(round(Double(normalized) / 90.0)) * 90
    return snapped % 360
  }

  /// Apply rotation transform to context for drawing
  private func applyRotation(context: CGContext, rotation: Int, rect: CGRect) {
    let centerX = rect.midX
    let centerY = rect.midY

    context.translateBy(x: centerX, y: centerY)
    let radians = CGFloat(rotation) * .pi / 180.0
    context.rotate(by: radians)
    context.translateBy(x: -centerX, y: -centerY)
  }

  // MARK: - Cleanup

  private func cleanupJob(_ jobId: String) {
    jobsLock.lock()
    activeJobs.removeValue(forKey: jobId)
    jobsLock.unlock()
  }
}
