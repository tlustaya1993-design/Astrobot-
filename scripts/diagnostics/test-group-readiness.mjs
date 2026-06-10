/**
 * Pre-launch checks for test group (~100 users).
 * Usage: E2E_BASE_URL=https://dev.example.com node scripts/diagnostics/test-group-readiness.mjs
 *
 * Requires a running API with OPENAI/SWE available for full chat scenarios.
 */
/* eslint-disable no-console */
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const USER_COUNT = Number(process.env.READINESS_USERS || 10);
const PARALLEL_PER_USER = Number(process.env.READINESS_PARALLEL || 2);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, sessionId, init = {}) {
  const headers = {
    "content-type": "application/json",
    "x-session-id": sessionId,
    ...(init.headers || {}),
  };
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function getCredits(sessionId) {
  const res = await request("/api/billing/credits", sessionId);
  if (res.status !== 200) return null;
  return res.json();
}

async function createConversation(sessionId) {
  const res = await request("/api/openai/conversations", sessionId, {
    method: "POST",
    body: JSON.stringify({ title: "Readiness test" }),
  });
  assert(res.status === 201, `create conversation: ${res.status}`);
  const conv = await res.json();
  assert(conv?.id, "missing conversation id");
  return conv.id;
}

async function sendMessage(sessionId, conversationId, content) {
  const res = await request(`/api/openai/conversations/${conversationId}/messages`, sessionId, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return { status: res.status, body: await res.text() };
}

async function scenarioConcurrentSessions() {
  console.log(`1) ${USER_COUNT} sessions, ${PARALLEL_PER_USER} parallel sends each`);
  const sessions = Array.from({ length: USER_COUNT }, (_, i) => `readiness-${Date.now()}-${i}`);

  const results = await Promise.all(
    sessions.map(async (sessionId) => {
      const convId = await createConversation(sessionId);
      const before = await getCredits(sessionId);
      const sends = Array.from({ length: PARALLEL_PER_USER }, (_, j) =>
        sendMessage(sessionId, convId, `Тест ${j}: короткий вопрос`),
      );
      const responses = await Promise.all(sends);
      const after = await getCredits(sessionId);
      const okCount = responses.filter((r) => r.status === 200).length;
      const blockedCount = responses.filter((r) => r.status === 429).length;
      const paywallCount = responses.filter((r) => r.status === 402).length;
      return { sessionId, okCount, blockedCount, paywallCount, before, after };
    }),
  );

  for (const r of results) {
    if (r.before && r.after) {
      const balanceDrop = (r.before.balance ?? 0) - (r.after.balance ?? 0);
      assert(
        (r.after.balance ?? 0) >= 0,
        `negative balance for ${r.sessionId}: ${r.after.balance}`,
      );
      assert(
        balanceDrop >= 0,
        `balance increased unexpectedly for ${r.sessionId}`,
      );
    }
  }

  const totalOk = results.reduce((s, r) => s + r.okCount, 0);
  const total429 = results.reduce((s, r) => s + r.blockedCount, 0);
  console.log(`   streams ok=${totalOk}, in-flight 429=${total429}`);
}

async function scenarioDoubleCreditsEndpoint() {
  console.log("2) credits endpoint idempotent (no session duplication)");
  const sessionId = `readiness-idem-${Date.now()}`;
  const a = await getCredits(sessionId);
  const b = await getCredits(sessionId);
  assert(a && b, "credits should resolve for new session");
  assert(
    (a.balance ?? 0) === (b.balance ?? 0),
    "balance changed between identical credits reads",
  );
}

async function main() {
  const started = Date.now();
  console.log(`Readiness checks against ${BASE_URL}`);
  await scenarioDoubleCreditsEndpoint();
  await scenarioConcurrentSessions();
  console.log(`OK: readiness checks passed in ${Date.now() - started}ms`);
  console.log(
    "Manual: verify Railway Postgres backup + restore on staging; replay YooKassa webhook twice for same payment.",
  );
}

main().catch((err) => {
  console.error("Readiness check failed:", err?.message || err);
  process.exitCode = 1;
});
