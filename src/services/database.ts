// src/services/database.ts
import RNFS from 'react-native-fs';
import SQLite, {ResultSet, SQLiteDatabase} from 'react-native-sqlite-storage';
import {APP_CONFIG} from '../config/appConfig';
import {log} from '../utils/logger';

// Enable promise-based API
SQLite.enablePromise(true);

const DATABASE_NAME = 'passeo.db';
const DATABASE_VERSION = '1.0';
const DATABASE_DISPLAY_NAME = `${APP_CONFIG.APP_NAME} Database`;

// Schema version using PRAGMA user_version
// Increment this when adding new migrations
const LATEST_SCHEMA_VERSION = 3;

let db: SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLiteDatabase> | null = null;
let txDepth = 0; // Track nested transaction depth for SAVEPOINT support

/**
 * Get current database schema version
 */
async function getUserVersion(database: SQLiteDatabase): Promise<number> {
  const [result] = await database.executeSql('PRAGMA user_version;');
  return result.rows.item(0).user_version;
}

/**
 * Set database schema version
 */
async function setUserVersion(
  database: SQLiteDatabase,
  version: number,
): Promise<void> {
  await database.executeSql(`PRAGMA user_version = ${version};`);
}

/**
 * Check if a column exists in a table
 */
async function columnExists(
  database: SQLiteDatabase,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [result] = await database.executeSql(
    `PRAGMA table_info(${tableName});`,
  );
  for (let i = 0; i < result.rows.length; i++) {
    if (result.rows.item(i).name === columnName) {
      return true;
    }
  }
  return false;
}

/**
 * Ensure a column exists (idempotent ADD COLUMN)
 */
async function ensureColumn(
  database: SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnDef: string,
): Promise<void> {
  const exists = await columnExists(database, tableName, columnName);
  if (!exists) {
    log.d(`[Migration] Adding column ${tableName}.${columnName}`);
    await database.executeSql(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`,
    );
  }
}

/**
 * Initialize and return database instance
 * Uses init gate pattern to prevent concurrent initialization and transactions during migration
 */
export async function getDatabase(): Promise<SQLiteDatabase> {
  // If already initialized, return immediately
  if (db) {
    return db;
  }

  // If initialization is in progress, wait for it
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // Start new initialization
  dbInitPromise = (async () => {
    try {
      log.d('[Database] Initializing database...');
      const opened = await SQLite.openDatabase({
        name: DATABASE_NAME,
        location: 'default',
      });

      // Enable foreign key constraints
      await opened.executeSql('PRAGMA foreign_keys = ON;');

      // Run migrations BEFORE exposing db globally
      await runMigrations(opened);

      // Only set global db after migrations succeed
      db = opened;
      log.d('[Database] Initialization complete');
      return opened;
    } catch (error) {
      log.e('[Database] Initialization failed:', error);
      // Reset promise so next call can retry
      dbInitPromise = null;
      throw error;
    }
  })();

  return dbInitPromise;
}

/**
 * Run database migrations based on PRAGMA user_version
 * Each migration is transactional and idempotent
 */
async function runMigrations(database: SQLiteDatabase): Promise<void> {
  const currentVersion = await getUserVersion(database);
  log.d(
    `[Migration] Current schema version: ${currentVersion}, Latest: ${LATEST_SCHEMA_VERSION}`,
  );

  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    log.d('[Migration] Database schema is up to date');
    return;
  }

  // Run migrations sequentially in transactions
  if (currentVersion < 1) {
    await migrationToV1(database);
  }

  if (currentVersion < 2) {
    await migrationToV2(database);
  }

  if (currentVersion < 3) {
    await migrationToV3(database);
  }

  log.d(
    `[Migration] All migrations complete. Schema version: ${LATEST_SCHEMA_VERSION}`,
  );
}

/**
 * Migration to version 1: Initial schema + all historical columns
 * This migration is idempotent and crash-safe
 */
async function migrationToV1(database: SQLiteDatabase): Promise<void> {
  log.d('[Migration] Running migration to version 1...');

  await database.executeSql('SAVEPOINT migrate_v1;');

  try {
    // 1. Create base tables if they don't exist
    await database.executeSql(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        page_count INTEGER DEFAULT 0,
        thumbnail_path TEXT,
        pdf_path TEXT,
        file_size INTEGER DEFAULT 0
      );
    `);

    await database.executeSql(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `);

    // 2. Ensure all required columns exist (idempotent)
    await ensureColumn(database, 'documents', 'cached_pdf_path', 'TEXT');
    await ensureColumn(database, 'documents', 'clean_pdf_path', 'TEXT');
    await ensureColumn(database, 'documents', 'clean_pdf_order_key', 'TEXT');
    await ensureColumn(
      database,
      'documents',
      'order_version',
      'INTEGER NOT NULL DEFAULT 0',
    );
    await ensureColumn(
      database,
      'documents',
      'pdf_cache_version',
      'INTEGER NOT NULL DEFAULT -1',
    );
    await ensureColumn(
      database,
      'documents',
      'status',
      "TEXT NOT NULL DEFAULT 'scanning'",
    );
    await ensureColumn(database, 'documents', 'processing_error', 'TEXT');
    await ensureColumn(
      database,
      'pages',
      'page_index',
      'INTEGER NOT NULL DEFAULT 0',
    );
    await ensureColumn(
      database,
      'pages',
      'rotation',
      'INTEGER NOT NULL DEFAULT 0',
    );

    // 3. Data fixups: Backfill page_index if NULL or 0 (excluding single-page docs with page_index=0)
    log.d('[Migration] Checking page_index backfill...');
    const [checkResult] = await database.executeSql(
      'SELECT COUNT(*) as count FROM pages WHERE page_index IS NULL',
    );
    const needsBackfill = checkResult.rows.item(0).count > 0;

    if (needsBackfill) {
      log.d('[Migration] Backfilling page_index from page_number...');
      // Get all distinct documents that have pages
      const [docsResult] = await database.executeSql(
        'SELECT DISTINCT document_id FROM pages ORDER BY document_id',
      );

      for (let i = 0; i < docsResult.rows.length; i++) {
        const docId = docsResult.rows.item(i).document_id;

        // Get pages for this document sorted by page_number
        const [pagesResult] = await database.executeSql(
          'SELECT id FROM pages WHERE document_id = ? ORDER BY page_number',
          [docId],
        );

        // Assign 0-based index
        for (let idx = 0; idx < pagesResult.rows.length; idx++) {
          const pageId = pagesResult.rows.item(idx).id;
          await database.executeSql(
            'UPDATE pages SET page_index = ? WHERE id = ?',
            [idx, pageId],
          );
        }
      }
      log.d(
        `[Migration] Backfilled page_index for ${docsResult.rows.length} documents`,
      );
    } else {
      log.d('[Migration] page_index is already populated, skipping backfill');
    }

    // 4. Invalidate all clean PDF caches (lazy regeneration on view)
    log.d('[Migration] Invalidating clean PDF cache...');
    await database.executeSql(
      'UPDATE documents SET clean_pdf_path = NULL, clean_pdf_order_key = NULL WHERE clean_pdf_path IS NOT NULL',
    );

    // 5. Create indexes (idempotent)
    await database.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);',
    );
    await database.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_pages_document_page ON pages(document_id, page_index);',
    );

    // 6. Add UNIQUE constraint on (document_id, page_index) if missing
    // SQLite doesn't support adding constraints, so we check if index exists
    await database.executeSql(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_doc_idx_unique ON pages(document_id, page_index);',
    );

    // 7. Update version ONLY after successful migration
    await setUserVersion(database, 1);

    await database.executeSql('RELEASE SAVEPOINT migrate_v1;');
    log.d('[Migration] Version 1 migration complete');
  } catch (error) {
    log.e('[Migration] Version 1 migration failed:', error);
    await database.executeSql('ROLLBACK TO SAVEPOINT migrate_v1;');
    await database.executeSql('RELEASE SAVEPOINT migrate_v1;');
    throw error;
  }
}

/**
 * Helper: Normalize path by stripping file:// protocol prefix
 */
function normalizePath(path: string | null): string | null {
  if (!path) {
    return null;
  }
  return path.replace(/^file:\/\//, '');
}

/**
 * Helper: Check if path is legacy iOS absolute path with old container UUID
 */
function isLegacyIOSAbsolutePath(path: string | null): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizePath(path);
  if (!normalized) {
    return false;
  }

  // Legacy absolute path patterns:
  // - /var/mobile/Containers/Data/Application/<UUID>/Documents/Passeo/...
  // - Any path containing /Documents/Passeo/ that's not in current container
  if (
    normalized.startsWith('/var/mobile/Containers/Data/Application/') ||
    normalized.startsWith('/private/var/mobile/Containers/')
  ) {
    return true;
  }

  // Check if it's an absolute path but NOT in current container
  const currentBase = RNFS.DocumentDirectoryPath;
  if (
    normalized.startsWith('/') &&
    normalized.includes('/Passeo/') &&
    !normalized.startsWith(currentBase)
  ) {
    return true;
  }

  return false;
}

/**
 * Helper: Extract basename from path
 */
function basename(path: string): string {
  const normalized = normalizePath(path) || path;
  const parts = normalized.split('/');
  return parts[parts.length - 1];
}

/**
 * Helper: Rewrite legacy absolute path to current container base
 */
function rewritePathToCurrentBase(
  oldPath: string | null,
  baseDir: string,
): string | null {
  if (!oldPath) {
    return null;
  }

  const normalized = normalizePath(oldPath);
  if (!normalized) {
    return null;
  }

  // If already pointing to current container, don't change
  if (normalized.startsWith(baseDir)) {
    return normalized;
  }

  // If it's a legacy absolute path, rewrite using basename
  if (isLegacyIOSAbsolutePath(normalized)) {
    const filename = basename(normalized);
    return `${baseDir}/${filename}`;
  }

  // Otherwise keep as-is
  return normalized;
}

/**
 * Migration to version 2: Fix legacy iOS absolute paths after container UUID change
 * This migration is idempotent and crash-safe using SAVEPOINT
 */
async function migrationToV2(database: SQLiteDatabase): Promise<void> {
  log.d('[Migration] Running migration to version 2 (iOS path repair)...');

  const appFolderName = APP_CONFIG.APP_NAME.replace(/\s+/g, ''); // 'Passeo'
  const PAGES_BASE = `${RNFS.DocumentDirectoryPath}/${appFolderName}/pages`;
  const PDFS_BASE = `${RNFS.DocumentDirectoryPath}/${appFolderName}/pdfs`;
  const THUMBS_BASE = `${RNFS.DocumentDirectoryPath}/${appFolderName}/thumbnails`;

  await database.executeSql('SAVEPOINT migrate_v2;');

  try {
    // Statistics for logging
    let pagesScanned = 0,
      pagesRewritten = 0,
      pagesExist = 0,
      pagesMissing = 0;
    let docsScanned = 0,
      pdfsRewritten = 0,
      thumbsRewritten = 0,
      cachedRewritten = 0,
      cleanRewritten = 0;

    // ========== Repair pages.image_path ==========
    log.d('[Migration V2] Repairing pages.image_path...');
    const [pagesResult] = await database.executeSql(
      'SELECT id, image_path FROM pages',
    );

    for (let i = 0; i < pagesResult.rows.length; i++) {
      const row = pagesResult.rows.item(i);
      pagesScanned++;

      const oldPath = row.image_path;
      const newPath = rewritePathToCurrentBase(oldPath, PAGES_BASE);

      if (newPath && newPath !== oldPath) {
        // Update the path
        await database.executeSql(
          'UPDATE pages SET image_path = ? WHERE id = ?',
          [newPath, row.id],
        );
        pagesRewritten++;

        // Best-effort check if file exists (don't fail migration if missing)
        try {
          const exists = await RNFS.exists(newPath);
          if (exists) {
            pagesExist++;
          } else {
            pagesMissing++;
            log.w(
              `[Migration V2] Page file not found after rewrite: ${newPath}`,
            );
          }
        } catch (err) {
          // Ignore RNFS errors during migration
        }
      }
    }

    // ========== Repair documents paths ==========
    log.d(
      '[Migration V2] Repairing documents.pdf_path, thumbnail_path, cached_pdf_path, clean_pdf_path...',
    );
    const [docsResult] = await database.executeSql(
      'SELECT id, pdf_path, thumbnail_path, cached_pdf_path, clean_pdf_path FROM documents',
    );

    for (let i = 0; i < docsResult.rows.length; i++) {
      const row = docsResult.rows.item(i);
      docsScanned++;

      const oldPdf = row.pdf_path;
      const oldThumb = row.thumbnail_path;
      const oldCached = row.cached_pdf_path;
      const oldClean = row.clean_pdf_path;

      // Rewrite each path if it's legacy
      const newPdf = rewritePathToCurrentBase(oldPdf, PDFS_BASE);
      const newThumb = rewritePathToCurrentBase(oldThumb, THUMBS_BASE);
      const newCached = rewritePathToCurrentBase(oldCached, PDFS_BASE);
      const newClean = rewritePathToCurrentBase(oldClean, PDFS_BASE);

      let needsUpdate = false;
      const updates: string[] = [];
      const params: any[] = [];

      // pdf_path: if changed, update and check if exists; if missing, set NULL
      if (newPdf !== oldPdf) {
        pdfsRewritten++;
        try {
          const exists = newPdf ? await RNFS.exists(newPdf) : false;
          if (exists) {
            updates.push('pdf_path = ?');
            params.push(newPdf);
          } else {
            // PDF missing, set NULL to force lazy regeneration
            updates.push('pdf_path = NULL');
            log.w(`[Migration V2] PDF file missing, setting NULL: ${newPdf}`);
          }
          needsUpdate = true;
        } catch {
          // On error, just update to new path
          updates.push('pdf_path = ?');
          params.push(newPdf);
          needsUpdate = true;
        }
      }

      // thumbnail_path: if changed, update; if missing, set NULL
      if (newThumb !== oldThumb) {
        thumbsRewritten++;
        try {
          const exists = newThumb ? await RNFS.exists(newThumb) : false;
          if (exists) {
            updates.push('thumbnail_path = ?');
            params.push(newThumb);
          } else {
            updates.push('thumbnail_path = NULL');
            log.w(
              `[Migration V2] Thumbnail missing, setting NULL: ${newThumb}`,
            );
          }
          needsUpdate = true;
        } catch {
          updates.push('thumbnail_path = ?');
          params.push(newThumb);
          needsUpdate = true;
        }
      }

      // cached_pdf_path: if changed, update; if missing, set NULL
      if (newCached !== oldCached) {
        cachedRewritten++;
        try {
          const exists = newCached ? await RNFS.exists(newCached) : false;
          if (exists) {
            updates.push('cached_pdf_path = ?');
            params.push(newCached);
          } else {
            updates.push('cached_pdf_path = NULL');
          }
          needsUpdate = true;
        } catch {
          updates.push('cached_pdf_path = ?');
          params.push(newCached);
          needsUpdate = true;
        }
      }

      // clean_pdf_path: if changed, invalidate (set NULL) to force regeneration
      if (newClean !== oldClean) {
        cleanRewritten++;
        updates.push('clean_pdf_path = NULL');
        updates.push('clean_pdf_order_key = NULL');
        needsUpdate = true;
      }

      // Invalidate pdf_cache_version to force regeneration for free users
      if (needsUpdate) {
        updates.push('pdf_cache_version = -1');
      }

      // Execute update if needed
      if (needsUpdate && updates.length > 0) {
        params.push(row.id);
        const sql = `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`;
        await database.executeSql(sql, params);
      }
    }

    // Update version ONLY after successful migration
    await setUserVersion(database, 2);

    await database.executeSql('RELEASE SAVEPOINT migrate_v2;');

    // Summary logging (single line in production, detailed in dev)
    log.d('[Migration V2] Path repair complete:');
    log.d(
      `  Pages: ${pagesScanned} scanned, ${pagesRewritten} rewritten (${pagesExist} exist, ${pagesMissing} missing)`,
    );
    log.d(`  Docs: ${docsScanned} scanned`);
    log.d(
      `  PDFs: ${pdfsRewritten} rewritten, Thumbs: ${thumbsRewritten}, Cached: ${cachedRewritten}, Clean: ${cleanRewritten}`,
    );
    log.d('[Migration] Version 2 migration complete');
  } catch (error) {
    log.e('[Migration] Version 2 migration failed:', error);
    await database.executeSql('ROLLBACK TO SAVEPOINT migrate_v2;');
    await database.executeSql('RELEASE SAVEPOINT migrate_v2;');
    throw error;
  }
}

/**
 * Migration to version 3: Add properties table for property-level architecture
 * This migration is idempotent and crash-safe using SAVEPOINT
 */
async function migrationToV3(database: SQLiteDatabase): Promise<void> {
  log.d(
    '[Migration] Running migration to version 3 (Properties architecture)...',
  );

  await database.executeSql('SAVEPOINT migrate_v3;');

  try {
    // 1. Create properties table if it doesn't exist
    await database.executeSql(`
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // 2. Create index on createdAt for performance
    await database.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_properties_createdAt
      ON properties(createdAt DESC);
    `);

    await database.executeSql('RELEASE SAVEPOINT migrate_v3;');
    await setUserVersion(database, 3);

    log.d('[Migration] Version 3 migration complete');
  } catch (error) {
    log.e('[Migration] Version 3 migration failed:', error);
    await database.executeSql('ROLLBACK TO SAVEPOINT migrate_v3;');
    await database.executeSql('RELEASE SAVEPOINT migrate_v3;');
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    dbInitPromise = null;
  }
}

/**
 * Execute a query and return results (db-aware, for transactions)
 * NEVER calls getDatabase() - uses passed db connection
 */
export async function executeSql(
  db: SQLiteDatabase,
  sql: string,
  params: any[] = [],
): Promise<ResultSet> {
  const [result] = await db.executeSql(sql, params);
  return result;
}

/**
 * Query rows as array (db-aware, for transactions)
 * NEVER calls getDatabase() - uses passed db connection
 */
export async function queryTx<T = any>(
  db: SQLiteDatabase,
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const [result] = await db.executeSql(sql, params);
  const rows: T[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i));
  }
  return rows;
}

/**
 * Execute a query using the default connection (convenience for non-transaction use)
 */
export async function query(
  sql: string,
  params: any[] = [],
): Promise<ResultSet> {
  const database = await getDatabase();
  return executeSql(database, sql, params);
}

/**
 * Execute multiple operations in a transaction (all-or-nothing)
 * Supports nested transactions using SAVEPOINT for inner transactions
 * @param operations - async function that receives db and performs operations
 * @returns result of the operations function
 */
export async function withTransaction<T>(
  operations: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const database = await getDatabase();

  const isNested = txDepth > 0;
  const savepointName = `sp_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  txDepth++;

  try {
    if (isNested) {
      // Nested transaction: use SAVEPOINT
      await database.executeSql(`SAVEPOINT ${savepointName};`);
    } else {
      // Top-level transaction: use BEGIN
      await database.executeSql('BEGIN TRANSACTION;');
    }

    const result = await operations(database);

    if (isNested) {
      // Release savepoint on success
      await database.executeSql(`RELEASE SAVEPOINT ${savepointName};`);
    } else {
      // Commit top-level transaction
      await database.executeSql('COMMIT;');
    }

    return result;
  } catch (error) {
    try {
      if (isNested) {
        // Rollback to savepoint and release it
        await database.executeSql(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        await database.executeSql(`RELEASE SAVEPOINT ${savepointName};`);
      } else {
        // Rollback top-level transaction
        await database.executeSql('ROLLBACK;');
      }
    } catch (rollbackErr) {
      log.w('Transaction rollback/release failed:', rollbackErr);
    }
    throw error;
  } finally {
    txDepth--;
  }
}
