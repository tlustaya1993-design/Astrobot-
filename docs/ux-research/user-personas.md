# Astrobot — User Personas

> Developed from thematic analysis of 12 motivational interviews and affinity mapping sessions.  
> Three primary archetypes emerged, covering ~85% of identified user motivations.

---

## Persona 1 — "The Self-Reflector"

**Name**: Мария, 29  
**Location**: Moscow  
**Occupation**: Marketing manager  
**Devices**: iPhone 14, MacBook (work)

### Demographics & Context

Мария works a demanding job and uses astrology as a personal reflection tool — not because she believes planets cause events, but because the framework helps her articulate feelings and patterns she's already sensing. She opens astrology apps in quiet moments: Sunday mornings, commute, before big decisions.

### Goals

- Get a personalized "lens" to examine current life events (career pressure, relationship tension)
- Feel heard and understood — she wants responses that reference *her* chart specifically
- Explore the synastry feature for a new relationship she's navigating

### Pain Points

- Generic horoscope content frustrates her — she's seen it all before
- Astrological jargon without explanation breaks the flow ("What does sesquiquadrate mean?")
- Losing conversation context after closing the app is annoying — she wants to pick up where she left off

### Usage Pattern

- Sessions: 2–3 per week, 5–15 minutes each
- Primarily uses mobile, evening or weekend
- Likely to add a romantic partner as a contact within the first week
- Will hit the free-tier limit within 5–7 days and is receptive to paying if the value is clear

### Attitude Toward AI

Pragmatic acceptance — "It's a tool. If it gives me something to think about, that's enough."

### Quote

*"Когда ответ упоминает именно мою луну в Скорпионе — я чувствую, что это про меня. Если это просто общие слова — закрываю."*  
("When the response mentions my Moon in Scorpio specifically — I feel like it's actually about me. If it's just generic words, I close the app.")

---

## Persona 2 — "The Enthusiast"

**Name**: Дмитрий, 38  
**Location**: Санкт-Петербург  
**Occupation**: Freelance web developer  
**Devices**: Android flagship, desktop

### Demographics & Context

Дмитрий has studied astrology for 6 years. He can read a natal chart himself but uses Astrobot for the computational heavy lifting (transits, progressions, solar returns) and to get a "second opinion" framing of what he already sees. He's technically literate and interested in the accuracy of ephemeris calculations.

### Goals

- Run extended analysis modes (solar returns, secondary progressions) without doing math manually
- Cross-check his interpretations against the AI's reading
- Track multiple contacts — family members, business partners

### Pain Points

- Wants raw chart data alongside AI interpretation (access to planetary degrees, not just narrative)
- The free tier runs out too fast for his usage volume
- Frustrated when the AI gives shallow interpretations of complex aspects

### Usage Pattern

- Sessions: daily, 10–30 minutes
- Heavy use of extended analysis and contact features
- Power user — likely to exhaust even mid-tier paid plans
- Vocal in communities; will recommend or criticize publicly based on accuracy

### Attitude Toward AI

Skeptical-but-engaged — "I'll test it against what I know. If it passes, I'll trust it more."

### Quote

*"Мне интересно, как модель интерпретирует транзитный Сатурн к моему асценданту. Если она пишет банальщину — это провал."*  
("I'm curious how the model interprets transit Saturn to my ascendant. If it writes something trite — that's a fail.")

---

## Persona 3 — "The Curious Newcomer"

**Name**: Алина, 22  
**Location**: Екатеринбург  
**Occupation**: University student (psychology)  
**Devices**: Budget Android, primarily mobile

### Demographics & Context

Алина discovered astrology through social media — reels about Mercury retrograde, TikTok-style sun sign content. She knows her sun sign and vaguely her rising. She downloaded Astrobot after seeing it mentioned in a Telegram chat. This is her first "serious" astrology tool.

### Goals

- Understand what a natal chart actually is, in plain language
- Get quick, relatable insights about her current situation (exam stress, friendships)
- Have fun exploring — low commitment, curious mindset

### Pain Points

- Overwhelmed by the amount of birth data required during onboarding (exact time, precise location)
- Doesn't know what "birth time" means for astrological purposes — needs guidance
- Confused by terms like "Ascendant," "Pluto in 8th house" without accessible explanations

### Usage Pattern

- Sessions: sporadic, 1–2 per week
- Short sessions (under 5 minutes), quick questions
- Very likely to share interesting responses on social media
- Will not pay on the first encounter; needs to experience clear value in free tier first
- High referral potential if the experience is positive

### Attitude Toward AI

Enthusiastic and trusting — "It's astrology by AI? That sounds cool. Let me try."

### Quote

*"Я не понимаю половину того, что написано, но мне нравится, что это именно моя карта, а не общий гороскоп."*  
("I don't understand half of what's written, but I like that it's specifically my chart, not a generic horoscope.")

---

## Persona Comparison Summary

| Attribute | Мария (Self-Reflector) | Дмитрий (Enthusiast) | Алина (Newcomer) |
|-----------|----------------------|---------------------|-----------------|
| Astrology knowledge | Intermediate | Advanced | Beginner |
| Session frequency | 2–3/week | Daily | 1–2/week |
| Primary device | iPhone | Android/Desktop | Budget Android |
| Key feature | Synastry/contacts | Extended analysis | Core chat |
| Pain point | Generic responses | Shallow depth | Onboarding complexity |
| Paid conversion likelihood | High (week 1–2) | Immediate | Low (week 3+) |
| NPS driver | Personalization | Accuracy | Novelty + shareability |

---

## Design Implications

1. **Personalization signals**: Every response should reference at least one specific natal placement by name. This is the primary trust signal for all three personas.

2. **Glossary/tooltips**: Inline explanations of astrological terms serve Алина without slowing down Мария or Дмитрий (progressive disclosure pattern).

3. **Onboarding flexibility**: Allow approximate birth time entry with uncertainty acknowledgment ("If you don't know your exact birth time, we'll calculate without an Ascendant"). Reduces Алина's drop-off.

4. **Extended mode discoverability**: Дмитрий needs clear access to raw data; surface a "View chart data" expansion alongside AI narrative.

5. **Free-tier pacing**: Мария hits the limit in 5–7 days — the paywall experience must arrive at a moment of demonstrated value, not arbitrary cutoff.
