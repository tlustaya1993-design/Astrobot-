import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  N8N_CREATE_TICKET_UPSERT_SQL,
  N8N_TICKETS_EXTERNAL_REF_INDEX_SQL,
} from "../n8n-create-ticket-upsert.js";

const SCHEMA_SQL = `
CREATE TABLE tickets (
  id bigserial PRIMARY KEY,
  public_id uuid NOT NULL DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid),
  description text NOT NULL,
  expected_behavior text,
  screenshot_url text,
  session_id text,
  conversation_id text,
  source text NOT NULL,
  external_ref text,
  status text NOT NULL DEFAULT 'open',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tickets_history (
  id bigserial PRIMARY KEY,
  ticket_id text NOT NULL,
  ticket_pk bigint NOT NULL,
  role text NOT NULL,
  event_type text NOT NULL,
  content text,
  to_status text
);
`;

type UpsertRow = {
  id: number;
  public_id: string;
  ticket_id: number;
  external_ref: string;
  inserted: boolean;
};

async function upsert(
  db: PGlite,
  externalRef: string,
  description = "problem",
): Promise<UpsertRow> {
  const result = await db.query<UpsertRow>(N8N_CREATE_TICKET_UPSERT_SQL, [
    description,
    "expected",
    "",
    "sess-1",
    "42",
    "astrobot_app",
    externalRef,
  ]);
  expect(result.rows.length).toBe(1);
  return result.rows[0]!;
}

describe("n8n Create Ticket UPSERT", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(SCHEMA_SQL);
    await db.exec(N8N_TICKETS_EXTERNAL_REF_INDEX_SQL);
  });

  afterEach(async () => {
    await db.close();
  });

  it("returns the same ticket on repeated delivery with the same external_ref", async () => {
    const ref = "11111111-1111-1111-1111-111111111111";

    const first = await upsert(db, ref, "first");
    expect(first.inserted).toBe(true);

    const second = await upsert(db, ref, "retry payload");
    expect(second.inserted).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.ticket_id).toBe(first.ticket_id);
    expect(second.public_id).toBe(first.public_id);
    expect(second.external_ref).toBe(ref);

    const tickets = await db.query<{ c: number }>("SELECT count(*)::int AS c FROM tickets");
    const history = await db.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM tickets_history",
    );
    expect(tickets.rows[0]?.c).toBe(1);
    expect(history.rows[0]?.c).toBe(1);
  });

  it("handles concurrent delivery with the same external_ref without duplicates", async () => {
    const ref = "22222222-2222-2222-2222-222222222222";

    const [a, b] = await Promise.all([
      upsert(db, ref, "concurrent-a"),
      upsert(db, ref, "concurrent-b"),
    ]);

    expect(a.id).toBe(b.id);
    expect(a.ticket_id).toBe(b.ticket_id);
    expect([a.inserted, b.inserted].filter(Boolean).length).toBe(1);

    const tickets = await db.query<{ c: number }>("SELECT count(*)::int AS c FROM tickets");
    const history = await db.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM tickets_history",
    );
    expect(tickets.rows[0]?.c).toBe(1);
    expect(history.rows[0]?.c).toBe(1);
  });

  it("still creates separate tickets for different external_ref values", async () => {
    const one = await upsert(db, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const two = await upsert(db, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(one.id).not.toBe(two.id);

    const tickets = await db.query<{ c: number }>("SELECT count(*)::int AS c FROM tickets");
    const history = await db.query<{ c: number }>(
      "SELECT count(*)::int AS c FROM tickets_history",
    );
    expect(tickets.rows[0]?.c).toBe(2);
    expect(history.rows[0]?.c).toBe(2);
  });
});
