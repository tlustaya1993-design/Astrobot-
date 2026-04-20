/**
 * QA Simulator Agent
 *
 * Имитирует разные пользовательские пути в Astrobot,
 * ловит баги и выдаёт отчёт.
 *
 * Запуск:
 *   ANTHROPIC_API_KEY=sk-... BASE_URL=http://localhost:3000 npx tsx index.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || "";

// ─── Типы ────────────────────────────────────────────────────────────────────

type Bug = {
  severity: "critical" | "major" | "minor";
  path: string;
  scenario: string;
  expected: string;
  actual: string;
};

type RequestResult = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs: number;
  error?: string;
};

// ─── HTTP-инструмент ─────────────────────────────────────────────────────────
// Это тот самый "инструмент" агента — Claude вызывает его, чтобы ходить по API

async function makeRequest(
  sessionId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<RequestResult> {
  const start = Date.now();
  try {
    // Если Claude передал полный URL — используем как есть, иначе добавляем BASE_URL
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-session-id": sessionId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = res.headers.get("content-type") || "";
    let responseBody: unknown;

    if (contentType.includes("text/event-stream")) {
      // SSE — читаем первые 2000 символов потока
      const text = await res.text();
      responseBody = { type: "sse_stream", preview: text.slice(0, 2000), length: text.length };
    } else if (contentType.includes("application/json")) {
      responseBody = await res.json();
    } else {
      responseBody = { type: "text", content: await res.text() };
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    return { status: res.status, body: responseBody, headers, durationMs: Date.now() - start };
  } catch (err) {
    return {
      status: 0,
      body: null,
      headers: {},
      durationMs: Date.now() - start,
      error: String(err),
    };
  }
}

// ─── Системный промпт агента ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert QA engineer testing the Astrobot API — a Russian-language AI astrology chatbot.

Your job: simulate realistic user journeys, try edge cases, and find bugs.

## API Base URL
${BASE_URL}

## Authentication
Every request needs header: x-session-id: <unique_string>
Use different session IDs for different user personas.

## Available API Endpoints

**Profile:**
- PUT /api/users/me — upsert user profile (birthDate, birthTime, birthPlace, birthLat, birthLng, name, tone)

**Chat:**
- POST /api/openai/conversations — create conversation {title}
- GET /api/openai/conversations — list all conversations
- GET /api/openai/conversations/:id — get conversation with messages
- POST /api/openai/conversations/:id/messages — send message {content, contactId?, contactExtendedMode?} → SSE stream
- PUT /api/openai/conversations/:id — update {title?, contactExtendedMode?}
- DELETE /api/openai/conversations/:id — delete

**Contacts (synastry):**
- POST /api/contacts — add contact {name, birthDate, birthTime?, birthLat?, birthLng?, relation?}
- GET /api/contacts — list contacts
- PUT /api/contacts/:id — update
- DELETE /api/contacts/:id — delete

**Billing:**
- GET /api/billing/credits — check balance (needs session)
- POST /api/billing/payments/create — {packageCode, returnUrl}

**Public:**
- GET /healthz — health check

## User Personas to Simulate

1. **Newcomer (Алина)** — первый раз, не знает время рождения, простые вопросы
2. **Self-Reflector (Мария)** — знает карту, хочет синастрию с партнёром
3. **Enthusiast (Дмитрий)** — power user, расширенный режим, много запросов
4. **Attacker** — пытается сломать: SQL-инъекции, XSS, пустые поля, огромные строки, чужой contactId

## What to Look For

- HTTP 500 errors (always critical)
- Wrong status codes (e.g., should be 404 but returns 500)
- Missing required fields in responses
- Auth bypasses (accessing other users' data)
- Crashes on edge case input (empty strings, null, 99999-char strings)
- SSE stream that never sends data
- Billing: can you go below zero balance?
- Inconsistent behavior between similar endpoints

## Tool Usage

Use the make_request tool to call the API. Run through ALL personas and edge cases systematically.

## Output Format

After ALL testing, output a structured bug report:

# 🐛 Bug Report — Astrobot QA Simulation

## Summary
X bugs found: Y critical, Z major, W minor

## Bugs Found
[for each bug:]
### BUG-N: [title]
- **Severity**: critical/major/minor
- **Path**: METHOD /api/...
- **Scenario**: what user action triggered it
- **Expected**: what should happen
- **Actual**: what actually happened
- **Reproduce**: exact steps

## Tested Scenarios (no bugs)
[list of paths that worked correctly]`;

// ─── Определение инструмента для Claude ─────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "make_request",
    description: "Make an HTTP request to the Astrobot API and get the response",
    input_schema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID to use as x-session-id header. Use different IDs for different personas.",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "HTTP method",
        },
        path: {
          type: "string",
          description: "API path, e.g. /api/openai/conversations",
        },
        body: {
          type: "object",
          description: "Request body (for POST/PUT)",
        },
      },
      required: ["sessionId", "method", "path"],
    },
  },
];

// ─── Агентный цикл ───────────────────────────────────────────────────────────
// Вот где "чудо" — Claude сам решает что вызывать, в каком порядке, и анализирует результаты

async function runAgent(): Promise<void> {
  if (!API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: API_KEY });

  console.log(`🤖 QA Simulator Agent запущен`);
  console.log(`🎯 Цель: ${BASE_URL}`);
  console.log(`⏳ Агент тестирует пути пользователей...\n`);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Start QA testing of the Astrobot API at ${BASE_URL}.

Go through ALL 4 personas and edge cases. Be thorough — at least 20-30 API calls total.
After all testing, output the complete bug report.`,
    },
  ];

  let iterations = 0;
  const maxIterations = 50; // защита от бесконечного цикла

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Добавляем ответ ассистента в историю
    messages.push({ role: "assistant", content: response.content });

    // Агент закончил — выводим финальный отчёт
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        console.log(textBlock.text);
      }
      break;
    }

    // Агент хочет вызвать инструменты — выполняем все вызовы
    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        if (toolUse.type !== "tool_use") continue;

        const input = toolUse.input as {
          sessionId: string;
          method: string;
          path: string;
          body?: unknown;
        };

        console.log(`  → ${input.method} ${input.path} [session: ${input.sessionId.slice(0, 8)}...]`);

        const result = await makeRequest(
          input.sessionId,
          input.method,
          input.path,
          input.body,
        );

        // Показываем статус в терминале
        const statusIcon = result.status >= 500 ? "❌" : result.status >= 400 ? "⚠️" : result.error ? "💥" : "✅";
        console.log(`     ${statusIcon} ${result.error ? `ERROR: ${result.error}` : result.status} (${result.durationMs}ms)`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Возвращаем результаты агенту
      messages.push({ role: "user", content: toolResults });
    }
  }

  if (iterations >= maxIterations) {
    console.log("\n⚠️  Достигнут лимит итераций.");
  }
}

// ─── Запуск ──────────────────────────────────────────────────────────────────

runAgent().catch((err) => {
  console.error("Agent error:", err);
  process.exit(1);
});
