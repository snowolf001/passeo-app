package com.cleanutilityapps.passeo

import com.facebook.react.bridge.*
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class CryptoHashModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CryptoHash"

  @ReactMethod
  fun sha256File(filePath: String, promise: Promise) {
    try {
      val path = normalizePath(filePath)
      val file = File(path)
      if (!file.exists()) {
        promise.reject("ENOENT", "File not found: $path")
        return
      }
      if (!file.isFile) {
        promise.reject("EINVAL", "Not a file: $path")
        return
      }

      // Run hashing on a background thread
      Thread {
        try {
          val md = MessageDigest.getInstance("SHA-256")
          FileInputStream(file).use { fis ->
            val buf = ByteArray(1024 * 1024) // 1MB buffer
            while (true) {
              val n = fis.read(buf)
              if (n <= 0) break
              md.update(buf, 0, n)
            }
          }
          val hex = md.digest().joinToString("") { b -> "%02x".format(b) }
          promise.resolve(hex)
        } catch (e: Exception) {
          promise.reject("E_HASH", "sha256 failed: ${e.message}", e)
        }
      }.start()

    } catch (e: Exception) {
      promise.reject("E_BAD_PATH", "Invalid path: ${e.message}", e)
    }
  }

  private fun normalizePath(input: String): String {
    return if (input.startsWith("file://")) input.removePrefix("file://") else input
  }
}
