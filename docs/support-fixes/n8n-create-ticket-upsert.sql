-- Staging/ops Postgres (n8n account 2) + n8n node "Create Ticket SQL"
-- Source of truth (exported strings): artifacts/api-server/src/lib/n8n-create-ticket-upsert.ts
--
-- Why UPSERT: SELECT…WHERE NOT EXISTS then INSERT is not atomic under concurrency.
-- Unique index alone turns races into unique_violation; ON CONFLICT returns the row.

-- 1) Unique key for non-null external_ref (empty string → NULL via NULLIF in the query)
CREATE UNIQUE INDEX IF NOT EXISTS tickets_external_ref_uidx
  ON tickets (external_ref)
  WHERE external_ref IS NOT NULL;

-- 2) Replace n8n "Create Ticket SQL" query with (params $1–$7 unchanged):
WITH upserted AS (
  INSERT INTO tickets (
    description, expected_behavior, screenshot_url,
    session_id, conversation_id, source, external_ref, status
  ) VALUES (
    $1,
    NULLIF($2, ''),
    NULLIF($3, ''),
    NULLIF($4, ''),
    NULLIF($5, ''),
    $6,
    NULLIF($7, ''),
    'analyzing'
  )
  ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL
  DO UPDATE SET
    external_ref = EXCLUDED.external_ref
  RETURNING
    id,
    public_id,
    status,
    description,
    expected_behavior,
    screenshot_url,
    session_id,
    conversation_id,
    source,
    external_ref,
    (xmax = 0) AS inserted
),
hist AS (
  INSERT INTO tickets_history (ticket_id, ticket_pk, role, event_type, content, to_status)
  SELECT u.id::text, u.id, 'user', 'message', u.description, u.status
  FROM upserted u
  WHERE u.inserted IS TRUE
  RETURNING ticket_pk
)
SELECT
  u.id,
  u.public_id,
  u.status,
  u.description,
  u.expected_behavior,
  u.screenshot_url,
  u.session_id,
  u.conversation_id,
  u.source,
  u.external_ref,
  u.id AS ticket_id,
  u.inserted
FROM upserted u;

-- App sends external_ref = support_tickets.public_id (= idempotency_key).
-- Redelivery: same ticket_id/public_id, no second tickets_history row.
