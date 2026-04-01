package com.cleanutilityapps.passeo

import com.facebook.react.bridge.*
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

class ExifModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ExifReader"

  @ReactMethod
  fun getCapturedAtMs(filePath: String, promise: Promise) {
    try {
      val path = if (filePath.startsWith("file://")) filePath.substring(7) else filePath
      val f = File(path)
      if (!f.exists()) {
        promise.resolve(null)
        return
      }

      val exif = ExifInterface(path)

      // Prefer real capture time
      val raw =
        exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
          ?: exif.getAttribute(ExifInterface.TAG_DATETIME_DIGITIZED)
          ?: exif.getAttribute(ExifInterface.TAG_DATETIME)

      if (raw.isNullOrBlank()) {
        promise.resolve(null)
        return
      }

      // EXIF format: "yyyy:MM:dd HH:mm:ss"
      val sdf = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
      // EXIF time is "local" (no timezone). Use device timezone.
      sdf.timeZone = TimeZone.getDefault()

      val dt = sdf.parse(raw)
      if (dt == null) {
        promise.resolve(null)
        return
      }

      promise.resolve(dt.time)
    } catch (e: Exception) {
      // Don't crash evidence flow; just return null
      promise.resolve(null)
    }
  }
}
