# AstroBot

## Overview

AstroBot — PWA-приложение с профессиональным AI-астрологом в формате живого диалога. Личный цифровой астролог на базе GPT-5.2 с полным астрологическим движком: натальная карта, аспекты, дома, транзитные аспекты к натальным планетам, синастрия, Solar Return, прогрессии, расширенные техники.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (PWA) — `artifacts/astrobot`
- **API framework**: Express 5 — `artifacts/api-server`
- **Database**: PostgreSQL + Drizzle ORM
- **LLM**: OpenAI GPT-5.2 via Replit AI Integrations (streaming SSE)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts/
├── astrobot/         # React+Vite PWA frontend (previewPath: /)
│   ├── src/
│   │   ├── pages/    # Home, Onboarding, Chat, History
│   │   ├── hooks/    # use-chat-stream (SSE streaming, contactId support)
│   │   ├── components/
│   │   │   ├── chat/ # AstroMarkdown, PeoplePanel, AddContactModal
│   │   │   └── layout/ # AppLayout
│   │   └── lib/      # session.ts (sessionId + auth headers)
│   └── public/       # manifest.json, sw.js (PWA), images/
└── api-server/       # Express 5 API (previewPath: /api)
    └── src/
        ├── lib/astrology.ts  # Full astrology engine (v2 extended)
        └── routes/
            ├── users.ts           # GET/PUT /api/users/me
            ├── contacts.ts        # CRUD /api/contacts
            └── openai/
                └── conversations.ts  # Chat + synastry mode

lib/
├── api-spec/         # OpenAPI 3.1 spec + Orval codegen config
├── api-client-react/ # Generated React Query hooks
├── api-zod/          # Generated Zod schemas
├── db/src/schema/
│   ├── users.ts        # Users table + tone profile fields
│   ├── conversations.ts # Conversations (with sessionId)
│   ├── messages.ts     # Chat messages
│   └── contacts.ts     # Contacts table for synastry
└── integrations-openai-ai-server/ # OpenAI client + utilities
```

## Astrology Engine (artifacts/api-server/src/lib/astrology.ts)

14 points: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Chiron, Lilith, North/South Nodes

Features:
- Natal chart with houses (Placidus), planetary dignities
- 8 aspect types with orbs (conjunction, opposition, trine, square, sextile, quincunx, semi-square, sesquiquadrate)
- Aspect patterns: Grand Trine, T-Square, Grand Cross, Yod, Stellium
- Moon phase + Void of Course
- Current transits with transit-to-natal aspects
- Solar Return (current year)
- Secondary Progressions (current age)
- Synastry between two natal charts (`calcSynastry`)
- **NEW** Part of Fortune (day/night calculation)
- **NEW** Element balance (Fire/Earth/Air/Water)
- **NEW** Modal balance (Cardinal/Fixed/Mutable)
- **NEW** Mutual Reception detection
- **NEW** Critical degrees (0°, 1°, 29°)
- **NEW** Dispositor chains + Final dispositor
- **NEW** Fixed star conjunctions (15 major stars, orb ≤ 1.5°)

## Contacts & Synastry Mode

- DB table: `contacts` (sessionId, name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng)
- API: GET/POST/PUT/DELETE `/api/contacts`
- Frontend: `PeoplePanel` component (horizontal chip strip, "Я" + contacts + "+ Добавить")
- `AddContactModal`: bottom sheet with form fields + geocoding of birth place
- When a contact is selected, `contactId` is passed to the message endpoint
- Server computes synastry, adds it to the system prompt in "synastry mode"

## Chat Formatting

- `AstroMarkdown` component: wraps ReactMarkdown with custom renderers
- Planet names rendered in amber/gold (`text-amber-400 font-semibold`) with subtle glow
- Aspect names rendered in lighter amber italic (`text-amber-300/80 italic`)
- Processes: p, li, td, strong nodes

## Key Architecture Decisions

### Session-based auth (no login)
- Client generates UUID session_id on first visit, stores in localStorage
- All API requests include `x-session-id` header
- Users table keyed on session_id

### Chat flow
1. User sends message → `useChatStream` hook (with optional `contactId`)
2. Hook creates conversation if needed (first message)
3. Sends `POST /api/openai/conversations/:id/messages` with `{content, sessionId, contactId?}`
4. Server fetches user + optional contact profiles
5. Builds system prompt with natal chart, transits, solar return, progressions, optional synastry
6. Streams GPT-5.2 response via SSE
7. Client renders with AstroMarkdown (gold planet names)

### System Prompt
Built dynamically in `buildSystemPrompt(user, contact)` in conversations route:
- Includes user natal chart + ephemeris + solar return + progressions + advanced features
- In synastry mode: also includes contact natal chart + synastry aspects
- Tone/style preferences from user profile
- Hard constraint: always stays as astrologer

## PWA
- `manifest.json` — app name, icons, display: standalone
- `sw.js` — service worker (cache first, skip /api/)
- Registered in index.html
- Mobile-first responsive design (iOS Safari safe area support)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/healthz | Health check |
| GET | /api/users/me | Get user profile (x-session-id) |
| PUT | /api/users/me | Create/update user profile |
| GET | /api/contacts | List user contacts |
| POST | /api/contacts | Create contact |
| PUT | /api/contacts/:id | Update contact |
| DELETE | /api/contacts/:id | Delete contact |
| GET | /api/openai/conversations | List user conversations |
| POST | /api/openai/conversations | Create conversation |
| GET | /api/openai/conversations/:id | Get conversation + messages |
| DELETE | /api/openai/conversations/:id | Delete conversation |
| GET | /api/openai/conversations/:id/messages | List messages |
| POST | /api/openai/conversations/:id/messages | Send message (SSE stream, supports contactId) |
| GET | /api/astrology/natal | Get natal chart JSON |
| GET | /api/astrology/ephemeris | Get current ephemeris |
| POST | /api/astrology/synastry | Calculate synastry |
| GET | /api/astrology/solar-return | Get solar return chart |
| GET | /api/astrology/progressions | Get progressions |

## Development

```bash
# Run codegen after openapi.yaml changes
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes
pnpm --filter @workspace/db run push

# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/astrobot run dev
```
