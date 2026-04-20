# Astrobot — User Research Study Plan

## Research Objectives

1. Understand what motivates Russian-speaking users to seek astrological guidance via a conversational AI
2. Identify friction points in the onboarding flow (birth data entry, location search, tone selection)
3. Evaluate comprehension of astrological output — do users understand the natal chart/transit interpretations?
4. Assess the value perception of paid features (extended synastry, solar returns, progressions) relative to the free tier
5. Measure satisfaction with the streaming chat experience and memory/context persistence across conversations

## Research Questions

- **Primary**: Do users feel the AI responses are meaningfully personalized to their birth data, or do they perceive generic astrology content?
- **Secondary**: What triggers users to add contacts for synastry analysis versus using the single-user mode?
- **Secondary**: At what point in the funnel do free-tier users hit the request limit, and how does the paywall experience affect retention?
- **Secondary**: How do users navigate the chat history drawer, and do they return to past conversations?

## Methodology

| Method | Purpose | Sample Size | Timeline |
|--------|---------|-------------|----------|
| Semi-structured interviews | Motivations, mental models, emotional relationship with astrology | n=12 | Weeks 1–2 |
| Usability testing (moderated, remote) | Onboarding flow, core chat loop, contact/synastry feature | n=8 | Weeks 3–4 |
| Diary study (5-day) | Real-world usage patterns, re-engagement habits, billing trigger moments | n=6 | Weeks 3–5 |
| Post-session surveys (SUS + custom) | Usability score baseline, perceived AI accuracy, willingness to pay | n=40+ | Ongoing |

## Participant Criteria

### Screener Criteria (All Studies)

- **Language**: Russian as primary language (the app UI and AI responses are in Russian)
- **Age**: 18–55
- **Astrology familiarity**: Mix — 40% casual ("I read horoscopes occasionally"), 40% engaged ("I know my sun/moon/rising"), 20% enthusiast ("I study birth charts")
- **Device**: Smartphone as primary device (PWA use case); iOS or Android

### Exclusion Criteria

- Professional astrologers (would skew toward expert-user bias)
- Employees of astrology app competitors
- Participants who have already used Astrobot for more than 3 conversations

### Recruitment Channels

- Russian-language social media communities (VK groups, Telegram channels focused on astrology)
- Targeted ads on mobile targeting interests: astrology, personal growth, spirituality
- Existing waitlist / beta sign-up emails

## Study Designs

### Study 1 — Motivational Interviews (Weeks 1–2)

**Format**: 45-minute video call, semi-structured  
**Facilitator guide topics**:
1. Tell me about the last time you looked up something astrology-related. What were you looking for?
2. Have you ever used a chatbot or AI for personal advice? Walk me through that.
3. What would make you trust an AI astrologer more — or less?
4. If a friend told you about Astrobot, what would make you want to try it?

**Analysis**: Affinity mapping → distill into user archetypes feeding persona development

### Study 2 — Moderated Usability Tests (Weeks 3–4)

**Format**: 60-minute remote session (screen share + think-aloud)  
**Tasks**: See [Usability Testing Protocol](./usability-testing-protocol.md)  
**Metrics**: Task completion rate, time on task, error rate, SUS score

### Study 3 — Diary Study (Weeks 3–5, concurrent)

**Format**: Participants use the app naturally for 5 days; submit daily 3-minute voice/text log  
**Prompts**:
- Day 1: "What brought you to open the app today?"
- Day 3: "Has anything surprised you about the AI's responses?"
- Day 5: "Would you pay for more conversations? Why or why not?"

**Analysis**: Identify usage triggers, session frequency, drop-off moments

### Study 4 — Post-Session Surveys (Ongoing)

**Triggered**: After conversation ends (in-app survey prompt)  
**Instrument**:
- SUS (10 items, standard)
- 3 custom items:
  1. "The response felt tailored to my personal birth chart." (1–5 Likert)
  2. "I understood the astrological terms used." (1–5 Likert)
  3. "I would recommend Astrobot to a friend." (NPS 0–10)

## Analysis Plan

- **Qualitative**: Thematic analysis of interview transcripts and diary entries; affinity diagrams for pattern clustering
- **Quantitative**: SUS scoring (target ≥ 70), NPS tracking, funnel analysis (onboarding completion rate, first-chat rate, paid conversion rate)
- **Triangulation**: Cross-reference diary study triggers with billing event timestamps to identify conversion moments

## Deliverables

1. [User Personas](./user-personas.md) — 3 primary personas based on interview archetypes
2. [Usability Testing Protocol](./usability-testing-protocol.md) — Task scripts, facilitator guide, metrics
3. [Research Findings Report](./research-findings-report.md) — Synthesized insights with prioritized recommendations

## Success Metrics

| Metric | Baseline Target | Improvement Goal |
|--------|----------------|-----------------|
| SUS score | ≥ 68 (industry average) | ≥ 78 |
| Onboarding completion rate | Measure in Week 1 | Increase by 15% |
| Free→Paid conversion | Measure in Week 1 | Increase by 10% |
| "Felt personalized" Likert | Measure in Week 1 | ≥ 4.0/5.0 average |
| NPS | Measure in Week 1 | ≥ 30 |

## Timeline

| Week | Activity |
|------|---------|
| 1 | Screener launch, participant recruitment, interview guide finalization |
| 2 | Motivational interviews (n=12) |
| 3 | Usability test recruitment + pilot session; diary study launch |
| 4 | Usability tests (n=8); diary study ongoing |
| 5 | Diary study closes; survey data collection ongoing |
| 6 | Analysis, synthesis, persona development |
| 7 | Report writing, stakeholder readout |
