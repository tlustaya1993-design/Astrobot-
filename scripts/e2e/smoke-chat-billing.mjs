/* eslint-disable no-console */
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SESSION_ID = `e2e-${Date.now()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const headers = {
    "content-type": "application/json",
    "x-session-id": SESSION_ID,
    ...(init.headers || {}),
  };
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function scenarioChatStream() {
  console.log("1) chat flow: create conversation + stream message");
  const createRes = await request("/api/openai/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "E2E smoke dialog" }),
  });
  assert(createRes.status === 201, `Expected 201 on conversation create, got ${createRes.status}`);
  const conv = await createRes.json();
  assert(conv?.id, "Conversation id missing");

  const msgRes = await request(`/api/openai/conversations/${conv.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: "Короткий тестовый вопрос" }),
  });
  assert(msgRes.status === 200, `Expected 200 on send message, got ${msgRes.status}`);
  const contentType = msgRes.headers.get("content-type") || "";
  assert(
    contentType.includes("text/event-stream"),
    `Expected SSE content-type, got "${contentType}"`,
  );
  const body = await msgRes.text();
  assert(body.includes("data:"), "Expected SSE body to contain data events");
}

async function scenarioPaymentValidation() {
  console.log("2) payment flow: validation error for invalid package");
  const res = await request("/api/billing/payments/create", {
    method: "POST",
    body: JSON.stringify({
      packageCode: "invalid_pack",
      returnUrl: "https://example.com",
    }),
  });
  assert(res.status === 400, `Expected 400 for invalid package, got ${res.status}`);
}

async function scenarioCreditsAuthBoundary() {
  console.log("3) auth boundary: credits requires session");
  const res = await fetch(`${BASE_URL}/api/billing/credits`);
  assert(res.status === 401, `Expected 401 without session, got ${res.status}`);
}

async function main() {
  const started = Date.now();
  console.log(`Running E2E smoke against ${BASE_URL}`);
  await scenarioChatStream();
  await scenarioPaymentValidation();
  await scenarioCreditsAuthBoundary();
  console.log(`OK: all smoke scenarios passed in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error("E2E smoke failed:", err?.message || err);
  process.exitCode = 1;
});

