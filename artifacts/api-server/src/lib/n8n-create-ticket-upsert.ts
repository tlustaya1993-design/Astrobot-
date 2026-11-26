/**
 * Canonical SQL for staging n8n node "Create Ticket SQL".
 * Idempotent on external_ref (= app support_tickets.public_id / idempotency_key).
 *
 * Params $1–$7 (unchanged):
 * 1 description
 * 2 expected_behavior
 * 3 screenshot_url
 * 4 session_id
 * 5 conversation_id
 * 6 source
 * 7 external_ref
 */

/** Partial unique index — required for ON CONFLICT inference. */
export const N8N_TICKETS_EXTERNAL_REF_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS tickets_external_ref_uidx
  ON tickets (external_ref)
  WHERE external_ref IS NOT NULL
`.trim();

/**
 * Atomic UPSERT: concurrent retries with the same external_ref cannot create
 * two tickets. History row is written only when the ticket was newly inserted
 * (xmax = 0), not on conflict redelivery.
 */
export const N8N_CREATE_TICKET_UPSERT_SQL = `
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
FROM upserted u
`.trim();
