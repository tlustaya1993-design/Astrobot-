# Astrobot — Usability Testing Protocol

## Overview

**Study type**: Moderated remote usability test  
**Format**: 60-minute sessions via video call with screen share  
**Participants**: n=8 (3 Self-Reflectors, 2 Enthusiasts, 3 Newcomers per persona definition)  
**Platform tested**: Astrobot PWA on participant's own mobile device  
**Data collected**: Screen recording, think-aloud audio, facilitator observation notes, post-session SUS survey

---

## Session Structure

| Time | Activity |
|------|---------|
| 0:00–0:05 | Welcome, consent, study explanation |
| 0:05–0:10 | Background warm-up questions |
| 0:10–0:50 | Task scenarios (think-aloud) |
| 0:50–0:58 | Post-session survey (SUS + custom items) |
| 0:58–1:00 | Debrief and close |

---

## Facilitator Script

### Opening (verbatim)

> "Thank you for joining today. We're testing an astrology app called Astrobot to understand how easy it is to use — we're not testing you, we're testing the app. There are no right or wrong answers. Please think out loud as much as you can: tell me what you're seeing, what you're thinking, and what you expect to happen. Feel free to be honest — positive or negative feedback is equally helpful."

> "I may not answer questions during the tasks — that's intentional, because we want to see how you'd navigate on your own. After we're done with the tasks I'll answer any questions you have."

### Warm-Up Questions (5 min)

1. How often do you engage with astrology content — apps, websites, social media?
2. Have you used a chatbot or AI assistant before? For what kinds of things?
3. What do you typically want to find out from astrology?

---

## Task Scenarios

### Task 1 — First Launch & Onboarding

**Scenario prompt**:
> "You've just heard about Astrobot from a friend. Open the app for the first time and get set up so you can start asking it questions."

**Success criteria**:
- Completes birth date, time, and location entry
- Reaches the main chat screen

**Metrics**:
- Task completion rate (binary: complete / incomplete)
- Time on task
- Number of errors (wrong input, back navigation, confusion moments)
- Specific observation: does the participant struggle with birth time entry or location search?

**Facilitator probes** (if participant stalls > 30 seconds):
- "What are you looking for right now?"
- "What would you expect to happen here?"

**Failure definition**: Participant abandons onboarding or requires facilitator assistance to proceed.

---

### Task 2 — First Conversation

**Scenario prompt**:
> "You're going through a stressful period at work and wondering if something in your chart explains why this month feels particularly difficult. Ask Astrobot about it."

**Success criteria**:
- Sends at least one message and receives a complete response
- Is able to ask a follow-up question without prompting

**Metrics**:
- Task completion rate
- Time to first message sent
- Comprehension probe score (see below)
- Observation: does participant read the full response or scroll past?

**Comprehension probe** (post-task, not during):
> "On a scale of 1–5, how much did you understand the astrological terms in that response?"  
> "Was there anything in that response that surprised you — good or bad?"

---

### Task 3 — Adding a Contact for Synastry

**Scenario prompt**:
> "You have a close friend whose relationship with you has been complicated lately. You've heard the app can compare two people's charts. Try to add your friend and start a conversation about your compatibility."

**Success criteria**:
- Navigates to contact/people panel
- Creates a new contact with birth data
- Starts a conversation with the contact selected

**Metrics**:
- Task completion rate
- Discoverability of the People Panel (was it found without guidance?)
- Number of steps taken vs. minimum possible steps
- Observation: does the participant understand what "contact mode" does?

**Facilitator probe** (if contact panel not found in 90 seconds):
- "Is there anything in the interface that suggests you can add another person?"

---

### Task 4 — Navigating Chat History

**Scenario prompt**:
> "Imagine you had a really insightful conversation with Astrobot a few days ago about your career. Try to find it again."

**Success criteria**:
- Opens the history drawer
- Locates and opens a previous conversation

**Metrics**:
- Task completion rate
- Time to locate history drawer
- Observation: does participant notice conversation titles? Are they meaningful?

---

### Task 5 — Hitting the Request Limit (Simulated)

*Note: Facilitate with a test account pre-configured to have 1 request remaining.*

**Scenario prompt**:
> "Keep chatting with Astrobot — ask it a few more questions about whatever's on your mind."

**Success criteria** (qualitative): Observe and record participant reaction when the paywall appears.

**Metrics**:
- Emotional response (note: surprise, frustration, acceptance, curiosity)
- Does the participant understand why access stopped?
- Does the participant read the payment options?
- Would they pay? (Post-task verbal probe)

**Facilitator probe** (after paywall appears):
- "What just happened, from your perspective?"
- "What would you do next?"
- "If you were going to pay, what would make you feel confident doing so?"

---

## Post-Session Survey

### System Usability Scale (SUS) — Standard 10 Items

Administered via form link immediately after tasks, before debrief.

### Custom Items (5-point Likert: Strongly Disagree → Strongly Agree)

1. "The app's responses felt specific to my personal birth chart."
2. "I understood the astrological language used in the responses."
3. "I felt comfortable entering my birth information into the app."

### Open-Ended

4. "What was the most valuable part of the experience?"
5. "What was the most frustrating part?"
6. NPS: "On a scale of 0–10, how likely are you to recommend Astrobot to a friend?"

---

## Facilitator Observation Sheet

For each task, note:

| Field | Notes |
|-------|-------|
| Task # | |
| Participant ID | |
| Completion | Yes / No / Partial |
| Time on task (seconds) | |
| Errors / confusion moments | |
| Think-aloud quotes (verbatim) | |
| Emotional signals | |
| Unexpected behaviors | |

---

## Analysis Plan

1. **Per-task completion rates**: Calculate across all 8 participants; flag any task below 75% completion as critical issue
2. **SUS scoring**: Average across participants; segment by persona type
3. **Affinity mapping**: Cluster think-aloud quotes and observation notes by theme
4. **Severity rating** for each identified issue:
   - **Critical** (3): Prevents task completion — fix before launch
   - **Serious** (2): Creates significant friction — fix in next sprint
   - **Minor** (1): Cosmetic or low-impact — address in backlog

## Reporting

Findings feed directly into [Research Findings Report](./research-findings-report.md).
