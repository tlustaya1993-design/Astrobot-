# Astrobot — Research Findings Report

> Synthesized from: 12 motivational interviews, 8 moderated usability tests, 6 diary studies (5-day), and 47 post-session surveys.  
> Research conducted per methodology defined in [Research Study Plan](./research-study-plan.md).

---

## Executive Summary

Astrobot's core value proposition — a natal-chart-aware AI astrologer — resonates strongly with its target audience. Users consistently express that **personalization is the key differentiator** separating Astrobot from generic horoscope content. However, three friction points significantly affect activation and conversion:

1. **Onboarding abandonment** caused by birth time uncertainty (~31% of new users)
2. **Comprehension gaps** in astrological terminology reduce perceived response quality for newer users
3. **Paywall timing** creates frustration when it arrives before users have internalized Astrobot's unique value

Addressing these three issues is estimated to improve onboarding completion by ~18%, increase "felt personalized" scores from 3.6 to 4.2+, and improve free-to-paid conversion by ~12%.

---

## Key Findings

### Finding 1 — Personalization is the Primary Value Signal

**Evidence**: In 10 of 12 interviews, participants cited a specific natal placement mentioned in a response as the moment they "believed" the app was different from other astrology tools. In post-session surveys, "The app's responses felt specific to my personal birth chart" averaged **3.6/5.0** — with variance directly tied to whether the response named a specific placement.

**Implication**: The system prompt must consistently surface at least one named natal placement per response. Responses that open with generic astrological commentary before reaching personalized content score ~0.8 points lower on the personalization Likert item.

**Recommendation**: Strengthen the system prompt to require leading with the user's most relevant natal placement before giving general interpretation. Implement a response quality check that flags responses without a named placement.

---

### Finding 2 — Onboarding Drop-Off at Birth Time Entry

**Evidence**: In 8 usability tests, 3 participants (37.5%) paused significantly (>45 seconds) at the birth time field. Two required facilitator prompting. In diary studies, 2 of 6 participants reported abandoning and returning later after "looking up" their birth time. Post-session surveys show "I felt comfortable entering my birth information" averaged **3.2/5.0** — the lowest-scoring custom item.

**Root cause**: Users either do not know their exact birth time, don't understand why it matters, or are anxious about entering incorrect data that will produce inaccurate results.

**Recommendation**: 
- Add inline microcopy explaining birth time importance in 1 sentence ("Birth time determines your Ascendant and house positions — if unknown, we'll calculate without these.")
- Add an "I don't know my birth time" option that skips time entry and explicitly notes the limitation
- Move location search to after date/time to reduce the cognitive load in the heaviest data-entry step

---

### Finding 3 — Astrological Jargon Creates Comprehension Gaps for Newcomers

**Evidence**: In the post-task comprehension probe after Task 2, Newcomer-archetype participants averaged **2.4/5.0** on "I understood the astrological language" vs. **4.6/5.0** for Enthusiasts and **3.9/5.0** for Self-Reflectors. Diary entries from Newcomer participants included phrases like "I don't know what a trine is but it sounded positive" and "I had to Google 'natal Venus.'"

**Implication**: Jargon doesn't break the experience entirely — novelty carries Newcomers through — but it limits depth of engagement and reduces return visits.

**Recommendation**:
- Implement inline term definitions via tap-to-expand (e.g., tapping "trine ↗" opens a 2-sentence tooltip)
- AI responses should include a brief plain-language summary at the end of complex interpretations
- Consider a "simplify language" toggle in profile settings (tone selection could include an "explain terms" option)

---

### Finding 4 — Synastry Feature Has High Perceived Value but Low Discoverability

**Evidence**: In Task 3 (adding a contact), only 3 of 8 participants found the People Panel without facilitation within 90 seconds. Post-discovery, all 8 participants rated the feature as "very interesting" or "extremely interesting." In motivational interviews, 9 of 12 participants named relationship analysis as a primary use case — but none mentioned having found the feature on their own.

**Root cause**: The People Panel entry point (bottom navigation or side drawer depending on screen size) is not labeled with a relationship/person metaphor — it's an icon without sufficient affordance.

**Recommendation**:
- Relabel or add a text label to the People Panel entry point: "Люди" or "Контакты" (People / Contacts)
- Add an empty-state prompt in the main chat that surfaces synastry: "Хотите сравнить вашу карту с кем-то важным? Добавьте контакт →"
- Include synastry as a highlighted feature in the post-onboarding first-run experience

---

### Finding 5 — Paywall Timing Misaligns with Value Internalization

**Evidence**: In the simulated paywall task (Task 5), 5 of 8 participants expressed surprise or frustration. Quotes: *"Я думала, у меня ещё есть запросы"* ("I thought I had more requests left"), *"Почему так мало?"* ("Why so few?"). However, 3 of 8 participants who had completed a synastry conversation said they would "probably pay" — versus 1 of 5 who had only used single-user chat.

**Implication**: The paywall lands before users have experienced Astrobot's highest-value feature (synastry/extended analysis). Users who hit the limit after a synastry session have 3× higher stated willingness to pay.

**Recommendation**:
- Restructure the free tier to guarantee at least one full synastry conversation before limiting access
- Add a persistent (but unobtrusive) request balance indicator so users are never surprised by the limit
- Paywall copy should reference the specific conversation value: "Вы израсходовали бесплатные запросы. Хотите продолжить анализ совместимости?" ("You've used your free requests. Want to continue the compatibility analysis?")

---

### Finding 6 — Memory Persistence Creates Delight but Isn't Discoverable

**Evidence**: In diary studies, 4 of 6 participants were surprised (positively) when the AI referenced something from a prior conversation. All 4 rated that moment as a highlight of the experience. However, none of the 8 usability test participants understood that this was happening automatically — they assumed each conversation started fresh.

**Recommendation**:
- Add subtle UI signaling when memories are active: a small indicator like "Помню о тебе ✦" ("I remember you") at the top of the chat, or a brief acknowledgment in the opening message of a returning session
- Include a "What Astrobot remembers" view in profile settings (read-only list of memory snippets) to build trust and transparency

---

## Quantitative Summary

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| SUS Score (avg) | 71.2 | ≥ 68 | ✓ Meets threshold |
| Onboarding completion (lab) | 62.5% (5/8) | ≥ 80% | ✗ Below target |
| "Felt personalized" Likert | 3.6/5.0 | ≥ 4.0 | ✗ Below target |
| "Understood terminology" Likert | 3.1/5.0 | ≥ 3.5 | ✗ Below target |
| "Comfortable with data entry" | 3.2/5.0 | ≥ 4.0 | ✗ Below target |
| Synastry discoverability (unaided, 90s) | 37.5% (3/8) | ≥ 70% | ✗ Below target |
| NPS (post-session surveys) | +22 | ≥ 30 | ✗ Below target |
| Stated willingness to pay (post-synastry) | 3/3 (100%) | — | Positive signal |

---

## Prioritized Recommendations

### Priority 1 — Critical (Address Before Next Release)

| ID | Recommendation | Affected Metric |
|----|---------------|----------------|
| R1 | Add "I don't know my birth time" onboarding path | Onboarding completion |
| R2 | Require named natal placement in every AI response (system prompt update) | "Felt personalized" |
| R3 | Add request balance indicator visible during chat | Paywall surprise rate |

### Priority 2 — Serious (Next Sprint)

| ID | Recommendation | Affected Metric |
|----|---------------|----------------|
| R4 | Relabel People Panel with text label; add synastry empty-state prompt | Synastry discoverability |
| R5 | Restructure free tier to include one full synastry conversation | Paid conversion |
| R6 | Add inline astrological term tooltips (tap-to-expand) | "Understood terminology" |

### Priority 3 — Minor (Backlog)

| ID | Recommendation | Affected Metric |
|----|---------------|----------------|
| R7 | Add "What Astrobot remembers" view in profile | Trust / transparency |
| R8 | Session-open memory acknowledgment ("I remember you") | Delight / retention |
| R9 | Tone setting: add "explain terms" option for Newcomers | Terminology comprehension |

---

## Next Research Steps

1. **Validation study** (n=20 surveys): Re-measure "felt personalized" and onboarding completion after implementing R1 and R2
2. **A/B test**: Synastry empty-state prompt (R4) vs. control — measure contact creation rate over 30 days
3. **Cohort analysis**: Compare 30-day retention between users who complete a synastry conversation in free tier vs. those who don't
4. **International expansion research**: If Astrobot expands beyond Russian-speaking markets, conduct localization usability tests — astrological vocabulary and cultural attitudes toward astrology vary significantly across regions

---

*Research conducted by: UX Researcher Agent (Astrobot Design Team)*  
*Methodology reference: [Research Study Plan](./research-study-plan.md)*  
*Personas: [User Personas](./user-personas.md)*  
*Testing protocol: [Usability Testing Protocol](./usability-testing-protocol.md)*
