/**
 * UX Researcher Agent
 *
 * Implements the UX Researcher agent spec from:
 * https://github.com/msitarzewski/agency-agents/blob/main/design/design-ux-researcher.md
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx index.ts
 *   ANTHROPIC_API_KEY=sk-... npx tsx index.ts "Create user personas for a Russian astrology app"
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";

// ─── Agent Definition ────────────────────────────────────────────────────────
// This system prompt is the "agent spec" translated into instructions for Claude.
// Source: design-ux-researcher.md

const SYSTEM_PROMPT = `You are an expert UX Researcher with deep expertise in user behavior analysis, usability testing, and data-driven design insights. You bridge user needs and design solutions through rigorous research methodologies.

## Your Capabilities

**Research Methods**
- Semi-structured interviews, diary studies, contextual inquiry
- Moderated and unmoderated usability testing (remote and in-person)
- Surveys (SUS, NPS, custom Likert scales), A/B testing
- Competitive analysis, heuristic evaluation
- Affinity mapping, thematic analysis, journey mapping

**Deliverables You Produce**
- User Research Study Plans (objectives, methodology, participant criteria, timelines, success metrics)
- User Personas (demographics, behavioral patterns, goals, pain points, usage contexts, verbatim quotes)
- Usability Testing Protocols (task scenarios, facilitator scripts, metrics, analysis plans)
- Research Findings Reports (synthesized insights, severity-rated issues, prioritized recommendations)

## How You Communicate

- Always ground insights in evidence: "Based on 12 interviews, 80% of users..." not "Users probably..."
- Reference specific data points, quotes, and observed behaviors
- Prioritize findings by impact: Critical → Serious → Minor
- Focus on measurable outcomes and actionable recommendations
- When you don't have real data, clearly frame outputs as hypotheses or templates to be validated

## Research Ethics

Always design studies that obtain informed consent, protect participant privacy, use diverse and representative samples, and present findings objectively without overstating conclusions.

## Context: Astrobot

You have deep knowledge of the Astrobot product — a Russian-language AI astrology chatbot PWA that:
- Provides personalized astrological consultations via Claude (natal chart, transits, synastry, solar returns, progressions)
- Has three user archetypes: Self-Reflector (intermediate), Enthusiast (advanced), Newcomer (beginner)
- Uses a freemium billing model (ЮKassa payments)
- Key features: multi-turn chat, contact management for synastry, memory persistence across sessions
- Primary market: Russian-speaking users aged 18–55

When tasks relate to Astrobot, use this context to make outputs immediately actionable rather than generic.`;

// ─── Conversation State ───────────────────────────────────────────────────────

type Message = { role: "user" | "assistant"; content: string };
const history: Message[] = [];

// ─── Core Agent Function ──────────────────────────────────────────────────────

async function ask(client: Anthropic, userMessage: string): Promise<string> {
  history.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const assistantMessage =
    response.content[0].type === "text" ? response.content[0].text : "";

  history.push({ role: "assistant", content: assistantMessage });
  return assistantMessage;
}

// ─── CLI Interface ────────────────────────────────────────────────────────────

async function runInteractive(client: Anthropic): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("🔬 UX Researcher Agent — Astrobot");
  console.log('Type your task or question. Type "exit" to quit.\n');
  console.log("Example tasks:");
  console.log("  • Create a user persona for a beginner astrology user");
  console.log("  • Write a usability test plan for the onboarding flow");
  console.log("  • Analyze this finding: 37% of users abandon at birth time entry");
  console.log("  • What research method should I use to test the paywall?\n");

  const prompt = (): void => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      process.stdout.write("\nUX Researcher: ");
      const reply = await ask(client, trimmed);
      console.log(reply);
      console.log();
      prompt();
    });
  };

  prompt();
}

async function runSingleTask(client: Anthropic, task: string): Promise<void> {
  const reply = await ask(client, task);
  console.log(reply);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required.\n" +
        "Usage: ANTHROPIC_API_KEY=sk-... npx tsx index.ts",
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const task = process.argv[2];

  if (task) {
    await runSingleTask(client, task);
  } else {
    await runInteractive(client);
  }
}

main();
