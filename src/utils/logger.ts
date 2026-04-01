/**
 * Production-safe logger utility
 *
 * Usage:
 *   log.d('debug info', data)  - Only in __DEV__ builds
 *   log.w('warning', data)     - Always logged (use sparingly)
 *   log.e('error', err)        - Always logged
 */

class Logger {
  /**
   * Debug logs - only visible in development builds
   * Use for verbose/detailed logging during development
   */
  d(message: string, ...args: any[]): void {
    if (__DEV__) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Warning logs - visible in all builds
   * Use sparingly for important operational warnings
   */
  w(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  /**
   * Error logs - visible in all builds
   * Use for errors that should always be logged
   */
  e(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  /**
   * Info logs - only visible in development builds
   * Alias for .d() to match common logging patterns
   */
  i(message: string, ...args: any[]): void {
    this.d(message, ...args);
  }
}

export const log = new Logger();
