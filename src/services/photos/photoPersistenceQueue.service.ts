/**
 * src/services/photos/photoPersistenceQueue.service.ts
 */
import {persistPhotoToDocuments} from './photoPersistence.service';

export interface PersistenceTask {
  sessionId: string;
  photoId: string;
  sourceUri: string;
  onComplete?: (result: {photoId: string; durableUri: string}) => void;
  onError?: (err: Error) => void;
  cancelled: boolean;
}

export interface PersistenceProgress {
  total: number;
  done: number;
  pending: number;
  inFlight: number;
  failed: number;
  percent: number;
}

const CONCURRENCY = 2;

let pendingTasks: PersistenceTask[] = [];
let inFlightCount = 0;

// Track in-flight tasks so cancel can suppress callbacks.
const inFlightTasks = new Map<string, PersistenceTask>();

// Per-session batch counters (reset when that session drains)
type Counters = {total: number; done: number; failed: number};
const sessionCounters = new Map<string, Counters>();

// Global (back-compat aggregate)
let batchTotal = 0;
let batchDone = 0;
let batchFailed = 0;

const listeners = new Set<() => void>();

function keyOf(sessionId: string, photoId: string) {
  return `${sessionId}:${photoId}`;
}

function getCounters(sessionId: string): Counters {
  const existing = sessionCounters.get(sessionId);
  if (existing) {
    return existing;
  }
  const init = {total: 0, done: 0, failed: 0};
  sessionCounters.set(sessionId, init);
  return init;
}

function isIdle(): boolean {
  return pendingTasks.length === 0 && inFlightCount === 0;
}

function notifyListeners(): void {
  listeners.forEach(l => {
    try {
      l();
    } catch (err) {
      console.warn('[PersistQueue] listener threw', err);
    }
  });
}

function getPendingCountForSession(sessionId: string): number {
  return pendingTasks.filter(t => t.sessionId === sessionId).length;
}

function getInFlightCountForSession(sessionId: string): number {
  return Array.from(inFlightTasks.values()).filter(
    t => t.sessionId === sessionId,
  ).length;
}

function sessionHasQueuedWork(sessionId: string): boolean {
  return (
    getPendingCountForSession(sessionId) > 0 ||
    getInFlightCountForSession(sessionId) > 0
  );
}

function computeProgress(
  c: Counters,
  pending: number,
  inFlight: number,
): PersistenceProgress {
  const total = c.total;
  const done = c.done;

  return {
    total,
    done,
    pending,
    inFlight,
    failed: c.failed,
    percent: total > 0 ? Math.floor((done / total) * 100) : 0,
  };
}

function sessionIsIdle(sessionId: string): boolean {
  return !sessionHasQueuedWork(sessionId);
}

function maybeResetSessionCounters(sessionId: string) {
  if (sessionIsIdle(sessionId)) {
    sessionCounters.set(sessionId, {total: 0, done: 0, failed: 0});
  }
}

function drainQueue(): void {
  while (inFlightCount < CONCURRENCY && pendingTasks.length > 0) {
    const task = pendingTasks.shift()!;

    if (task.cancelled) {
      // Count as done so progress advances
      batchDone++;
      const sc = getCounters(task.sessionId);
      sc.done++;
      notifyListeners();
      maybeResetSessionCounters(task.sessionId);
      continue;
    }

    inFlightCount++;
    inFlightTasks.set(keyOf(task.sessionId, task.photoId), task);
    notifyListeners();
    void runTask(task);
  }

  // If global queue drained, reset global counters (back-compat)
  if (isIdle()) {
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
    // Do not wipe sessionCounters here; sessions are reset individually.
    notifyListeners();
  }
}

async function runTask(task: PersistenceTask): Promise<void> {
  try {
    const {durableUri} = await persistPhotoToDocuments({
      sessionId: task.sessionId,
      photoId: task.photoId,
      sourceUri: task.sourceUri,
    });

    if (!task.cancelled) {
      task.onComplete?.({photoId: task.photoId, durableUri});
    }

    batchDone++;
    const sc = getCounters(task.sessionId);
    sc.done++;
  } catch (err) {
    batchFailed++;
    batchDone++;

    const sc = getCounters(task.sessionId);
    sc.failed++;
    sc.done++;

    if (!task.cancelled) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[PersistQueue] Task failed: session=${task.sessionId} photo=${task.photoId}`,
        error,
      );
      task.onError?.(error);
    }
  } finally {
    inFlightCount--;
    inFlightTasks.delete(keyOf(task.sessionId, task.photoId));
    notifyListeners();
    maybeResetSessionCounters(task.sessionId);
    drainQueue();
  }
}

export function subscribePhotoPersistence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Back-compat: global aggregate progress
export function getPhotoPersistenceProgress(): PersistenceProgress {
  const total = batchTotal;
  const done = batchDone;
  const pending = pendingTasks.length;

  return {
    total,
    done,
    pending,
    inFlight: inFlightCount,
    failed: batchFailed,
    percent: total > 0 ? Math.floor((done / total) * 100) : 0,
  };
}

// ✅ Per-session progress (recommended for UI)
export function getPhotoPersistenceProgressForSession(
  sessionId: string,
): PersistenceProgress {
  const c = getCounters(sessionId);
  const pending = getPendingCountForSession(sessionId);
  const inFlight = getInFlightCountForSession(sessionId);
  return computeProgress(c, pending, inFlight);
}

export function enqueuePhotoPersistence(task: {
  sessionId: string;
  photoId: string;
  sourceUri: string;
  onComplete?: (result: {photoId: string; durableUri: string}) => void;
  onError?: (err: Error) => void;
}): void {
  // Global counters (for old UI)
  if (isIdle()) {
    batchTotal = 0;
    batchDone = 0;
    batchFailed = 0;
  }
  batchTotal++;

  // Session counters
  const sc = getCounters(task.sessionId);
  if (sessionIsIdle(task.sessionId)) {
    // reset on first enqueue after idle
    sc.total = 0;
    sc.done = 0;
    sc.failed = 0;
  }
  sc.total++;

  pendingTasks.push({...task, cancelled: false});
  notifyListeners();
  drainQueue();
}

export function cancelPhotoPersistence(
  sessionId: string,
  photoId?: string,
): void {
  if (photoId) {
    // Cancel pending
    const idx = pendingTasks.findIndex(
      t => t.sessionId === sessionId && t.photoId === photoId,
    );
    if (idx !== -1) {
      pendingTasks.splice(idx, 1);
      batchDone++;
      const sc = getCounters(sessionId);
      sc.done++;
      notifyListeners();
      drainQueue();
      maybeResetSessionCounters(sessionId);
      return;
    }

    // Cancel in-flight (suppress callbacks)
    const inFlight = inFlightTasks.get(keyOf(sessionId, photoId));
    if (inFlight) {
      inFlight.cancelled = true;
      notifyListeners();
    }
    return;
  }

  // Cancel all pending for session
  const removed = pendingTasks.filter(t => t.sessionId === sessionId);
  if (removed.length > 0) {
    pendingTasks = pendingTasks.filter(t => t.sessionId !== sessionId);
    batchDone += removed.length;

    const sc = getCounters(sessionId);
    sc.done += removed.length;

    notifyListeners();
    drainQueue();
    maybeResetSessionCounters(sessionId);
  }

  // Also suppress callbacks for in-flight tasks of this session
  for (const t of inFlightTasks.values()) {
    if (t.sessionId === sessionId) {
      t.cancelled = true;
    }
  }
  notifyListeners();
}

export async function waitForPhotoPersistenceDrain(
  sessionId: string,
  opts?: {timeoutMs?: number},
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const hasQueuedWork = sessionHasQueuedWork(sessionId);
      const prog = getPhotoPersistenceProgressForSession(sessionId);

      // Only resolve when there is truly no pending/in-flight work left
      // for this session.
      if (!hasQueuedWork) {
        // Either fully completed/cancelled, or nothing was scheduled.
        if (prog.total === 0 || prog.done >= prog.total) {
          unsub();
          resolve();
          return;
        }
      }

      if (Date.now() - start > timeoutMs) {
        unsub();
        reject(
          new Error(
            `Timeout waiting for photo persistence drain (${timeoutMs}ms)`,
          ),
        );
      }
    };

    const unsub = subscribePhotoPersistence(check);
    check();
  });
}
