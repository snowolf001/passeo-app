-- ============================================================
-- MIGRATION: Remove 'admin' role, migrate all admin → host
-- ============================================================
-- SAFE during closed testing.
-- Preserves: clubs, members, memberships, sessions, attendance, credits.
-- Resets:    audit_logs only.
-- ============================================================

-- ── Step 1: Migrate admin → host ─────────────────────────────────────────────

UPDATE memberships
SET role = 'host'
WHERE role = 'admin';

-- ── Step 2: Enforce new enum constraint ──────────────────────────────────────
-- Drop the old check constraint if it exists, then add the new one.
-- Adjust the constraint name to match your schema if different.

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_role_check;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('owner', 'host', 'member'));

-- ── Step 3: Sanity checks ────────────────────────────────────────────────────

-- Verify no 'admin' rows remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM memberships WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Migration failed: admin rows still exist in memberships.';
  END IF;
END $$;

-- Verify every club has exactly one owner
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT club_id, COUNT(*) AS owner_count
    FROM memberships
    WHERE role = 'owner'
    GROUP BY club_id
    HAVING COUNT(*) <> 1
  LOOP
    RAISE WARNING 'Club % has % owners (expected exactly 1).', rec.club_id, rec.owner_count;
  END LOOP;
END $$;

-- ── Step 4: Reset audit_logs ─────────────────────────────────────────────────
-- We are in closed testing — no audit history is worth keeping.

TRUNCATE TABLE audit_logs RESTART IDENTITY;

-- ── Step 5: Recreate audit_logs with the new schema ──────────────────────────

DROP TABLE IF EXISTS audit_logs;

CREATE TABLE audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  club_id         UUID        NOT NULL,
  actor_user_id   UUID        NOT NULL,
  target_user_id  UUID,

  action          TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL,
  entity_id       UUID,

  old_value       JSONB,
  new_value       JSONB,
  delta           JSONB,

  reason          TEXT,

  created_at      TIMESTAMP   NOT NULL DEFAULT now()
);

-- Optional indexes for common query patterns
CREATE INDEX IF NOT EXISTS audit_logs_club_id_idx      ON audit_logs (club_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx        ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx   ON audit_logs (created_at DESC);

-- ── Step 6: Confirm ──────────────────────────────────────────────────────────

SELECT
  role,
  COUNT(*) AS count
FROM memberships
GROUP BY role
ORDER BY role;
-- Expected rows: owner | host | member only. No 'admin'.
