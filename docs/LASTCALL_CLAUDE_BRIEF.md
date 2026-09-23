# LASTCALL — Product & Engineering Brief
## Quit-Smoking PWA / Web App
**Repository:** `mlateffitazri-debug/lastcall`  
**Current stack:** Vanilla HTML/CSS/JavaScript PWA, `localStorage`, Service Worker  
**Language:** Bahasa Malaysia (primary), English-ready architecture  
**Target:** Mobile-first PWA for smokers who want to quit  
**Status:** MVP exists; this document defines the next development pass.

---

# 1. PRODUCT VISION

LASTCALL is a quit-smoking companion, not merely a cigarette counter.

### Brand
**LASTCALL**

### Suggested tagline
**Make It Your Last.**

### Product principle
The app should help a smoker:

1. Start a quit journey.
2. Track time since the last cigarette.
3. Handle cravings.
4. Understand withdrawal and health milestones.
5. See money and cigarettes avoided.
6. Recover constructively after a relapse.
7. Build a longer smoke-free streak.
8. Get appropriate professional support when needed.

The experience should feel supportive, modern, private, fast and non-judgmental.

---

# 2. CRITICAL BUG — TIMER ACCIDENTALLY RESETS

## Existing problem

The current implementation calculates the hero timer from the most recent cigarette log.

Conceptually:

```js
getReferenceTime()
    -> latest log
    -> Date.now() - latest log
```

The cigarette button previously did this immediately:

```js
logs.push(Date.now());
saveLogs(logs);
refreshAll();
```

Therefore, a single accidental tap on the cigarette button immediately reset the timer.

This is dangerous UX because the central progress metric changes without deliberate confirmation.

## Required behaviour

The cigarette button must NEVER create a log immediately.

New flow:

```text
User taps cigarette button
        ↓
Confirmation modal
        ↓
"Anda baru merokok?"
        ↓
[Batal]     [Ya, rekodkan]
                ↓
          create timestamp
                ↓
          refresh timer
```

### Confirmation copy

**Title:**
> Anda baru merokok?

**Description:**
> Tekan sahkan hanya jika anda benar-benar baru menghisap rokok. Ini akan menetapkan semula kiraan masa.

Buttons:

- `Batal`
- `Ya, rekodkan`

## Anti-double-tap

After confirmation:

- lock logging action briefly
- prevent duplicate timestamps from rapid taps
- recommended lock: ~800 ms

## Important

Do NOT introduce any automatic timer reset from:

- page refresh
- tab switching
- app reopening
- service worker update
- background/foreground transition
- browser visibility change

The timer must always derive from persisted data.

---

# 3. TIMER ARCHITECTURE

## Current concept

The current timer represents:

> Time since the most recent cigarette.

This is valid, but the product should distinguish this from historical achievement.

## Add two metrics

### Current streak

Example:

```text
CURRENT STREAK
3 hari 14 jam 22 minit
```

Definition:

```text
now - most recent cigarette timestamp
```

If no cigarette has ever been logged, use the user's quit-start timestamp.

### Best streak

Example:

```text
BEST STREAK
12 hari 06 jam
```

Definition:

The longest interval between consecutive cigarette logs, including the current interval.

Do NOT erase the best streak after relapse.

---

# 4. RELAPSE MODEL

Do not treat a cigarette after a quit attempt as deletion of the entire journey.

If the user smokes:

```text
Current streak → resets
Best streak → remains
Historical logs → remain
Total cigarettes → increases
Quit attempts → increases when appropriate
```

Example:

```text
CURRENT STREAK
0 hari 02 jam

BEST STREAK
17 hari 08 jam

TOTAL CIGARETTES LOGGED
248
```

Tone:

> Anda tidak kehilangan perjalanan yang telah dibuat. Anda baru memulakan streak seterusnya.

Avoid shame-based messaging.

---

# 5. ONBOARDING

The existing MVP has minimal settings. Expand onboarding.

## Step 1 — Quit date

Question:

> Bila anda mahu berhenti?

Options:

- `Hari ini`
- `Pilih tarikh`

For an immediate quit journey, save an exact timestamp, not just a date.

### Important

Do not use:

```js
new Date("YYYY-MM-DDT00:00:00")
```

as the only representation of a quit start.

This creates midnight-based timing and can cause timezone/date confusion.

Prefer storing an ISO timestamp with timezone context or a UTC timestamp.

Example:

```js
quitStartAt: new Date().toISOString()
```

If the user selects a future date, store the planned quit date separately.

---

## Step 2 — Cigarettes per day

Ask:

> Berapa batang rokok anda biasa merokok sehari?

Example:

```text
20
```

Save:

```js
cigarettesPerDay
```

---

## Step 3 — Price

Ask:

> Berapa anggaran kos satu batang?

Example:

```text
RM 0.60
```

Save:

```js
pricePerCig
```

---

## Step 4 — Main reason

Ask:

> Mengapa anda mahu berhenti?

Options:

- Kesihatan
- Keluarga
- Jimat duit
- Prestasi fizikal
- Diri sendiri
- Lain-lain

Save:

```js
quitReason
```

This can later be shown during craving intervention.

---

# 6. HOME DASHBOARD

Recommended hierarchy:

## Primary

```text
🚭 SMOKE-FREE

3 hari 14:22:18

Sejak rokok terakhir
```

## Secondary metrics

```text
ROKOK DIELAKKAN
248

WANG DIJIMATKAN
RM148.80

BEST STREAK
17 hari
```

Do not make the dashboard feel like a punishment counter.

---

# 7. CIGARETTES AVOIDED

This should become a major positive metric.

Approximation:

```text
expected cigarettes =
cigarettesPerDay × smoke-free duration in days
```

Then:

```text
cigarettesAvoided =
max(0, expected cigarettes - actual cigarettes logged during journey)
```

Clearly label it as an estimate.

Do not imply medical precision.

Example:

> Anggaran rokok dielakkan

---

# 8. MONEY SAVED

Current implementation calculates money spent from logged cigarettes.

Add:

```text
Money spent
Money avoided/saved
```

Example:

```text
Harga sebatang: RM0.60
Biasa: 20 batang/hari
Smoke-free: 7 hari

Anggaran dijimatkan:
RM84.00
```

Formula:

```js
moneySaved =
cigarettesPerDay *
smokeFreeDays *
pricePerCig
```

If relapse occurs, calculate based on actual journey rather than pretending the relapse never happened.

---

# 9. REMOVE / REWORK "MINUTES OF LIFE LOST"

Current code contains:

```js
const MINUTES_LOST_PER_CIG = 11;
```

and displays:

> Anggaran minit hayat hilang

This should not be presented as an individualized medical calculation.

Options:

### Preferred
Remove the metric.

Replace with:

- cigarettes avoided
- smoke-free days
- money saved
- cravings survived
- best streak

If retained, label it very clearly as a population-level statistical estimate, not an individual prediction.

---

# 10. MEDICAL CONTENT — HIGH PRIORITY

The current `MILESTONES` and `DAMAGE_FACTS` contain several very specific medical claims.

Examples currently present include claims involving:

- 93% nicotine reduction
- nicotine being 100% gone after 3 days
- lung function increasing up to 30%
- cilia fully recovering
- specific cancer-risk reductions
- 11 minutes of life lost per cigarette

These claims must be reviewed before public launch.

## Requirement

Use authoritative sources.

Primary sources should include:

- CDC
- WHO
- Ministry of Health Malaysia / KKM
- NHS where useful
- peer-reviewed evidence where necessary

Do not copy random health infographics.

## Content rules

For every medical milestone:

1. State the approximate timeframe.
2. Avoid false precision.
3. Explain that individual recovery varies.
4. Avoid implying guaranteed outcomes.
5. Include source attribution.
6. Avoid diagnosing the user.

Example style:

> **Selepas kira-kira 20 minit**
>
> Denyutan jantung mula menurun selepas berhenti merokok.

Then:

> Source: CDC

---

# 11. MEDICAL TIMELINE

Build a clean evidence-based timeline.

Suggested structure:

```text
20 minit
↓
Heart rate begins to fall

12–24 jam
↓
Carbon monoxide levels fall substantially

1–3 hari
↓
Nicotine is eliminated from the body; withdrawal symptoms may become noticeable

2–12 minggu
↓
Circulation and lung function improve

1–12 bulan
↓
Coughing and shortness of breath can decrease

1–2 tahun
↓
Cardiovascular risk continues to decline

5–10+ tahun
↓
Risk of several smoking-related diseases continues to fall

15 tahun
↓
Cardiovascular disease risk approaches that of a non-smoker for many people
```

Exact wording and timings must be verified against current official sources before implementation.

Do not present these as guaranteed personal medical outcomes.

---

# 12. CRAVING MODE — MAJOR FEATURE

Add a prominent button:

> 🔥 AKU TENGAH CRAVING

This is one of the most important product features.

## Flow

```text
CRAVING MODE
     ↓
60-second breathing
     ↓
Delay timer
     ↓
Drink water
     ↓
Move / walk
     ↓
Show personal reason
     ↓
"Craving passed?"
     ↓
YES / STILL CRAVING
```

## Suggested UI

```text
🔥 CRAVING MODE

Keinginan ini akan berlalu.

Tunggu 3 minit bersama kami.

[ MULA 3 MINIT ]
```

Then an interactive intervention.

---

# 13. CRAVING TRACKING

After intervention:

> Berjaya lalui craving?

Buttons:

- `Ya`
- `Masih teringin`

If yes:

```text
cravingsSurvived += 1
```

Show:

> 🎉 Craving berjaya dilalui

Example:

```text
CRAVINGS SURVIVED
17
```

This creates a positive gamification loop.

---

# 14. TRIGGER TRACKING

After a craving, optionally ask:

> Apa yang mencetuskan keinginan tadi?

Options:

```text
☐ Stress
☐ Kopi
☐ Selepas makan
☐ Memandu
☐ Kawan merokok
☐ Alkohol
☐ Kerja
☐ Bosan
☐ Emosi
☐ Lain-lain
```

Store:

```js
cravingEvents: [
  {
    timestamp,
    trigger,
    survived
  }
]
```

Later show:

```text
TOP TRIGGERS

Stress       38%
Kopi         31%
Selepas makan 18%
Memandu      13%
```

This is a useful personalized feature.

---

# 15. DAILY CHECK-IN

Add optional daily check-in.

Questions:

### How was today?

```text
😊 Mudah
😐 Biasa
😣 Susah
```

### Cravings today?

```text
0
1–2
3–5
6+
```

### Did you smoke?

```text
Tidak
Ya
```

Store a lightweight daily record.

Do not make the check-in burdensome.

---

# 16. QUIT ATTEMPTS

Track attempts without shame.

Example:

```text
QUIT ATTEMPTS
3

CURRENT STREAK
4 days

BEST STREAK
21 days
```

A new attempt should not delete old attempts.

Possible data:

```js
quitAttempts: [
  {
    startedAt,
    endedAt,
    cigarettesLogged,
    durationMs
  }
]
```

Do not automatically infer a new attempt from every cigarette unless the logic is carefully defined.

---

# 17. DATA MODEL

Current MVP uses `localStorage`.

Keep it for MVP, but make the data structure robust.

Recommended:

```js
{
  version: 2,

  profile: {
    cigarettesPerDay: 20,
    pricePerCig: 0.60,
    quitReason: "Kesihatan"
  },

  quit: {
    plannedQuitAt: null,
    currentAttemptStartedAt: "...",
    bestStreakMs: 0
  },

  cigaretteLogs: [
    1758624000000
  ],

  cravingEvents: [
    {
      timestamp: 1758624000000,
      trigger: "Stress",
      survived: true
    }
  ],

  dailyCheckins: [
    {
      date: "2026-09-23",
      mood: "hard",
      cravings: 3,
      smoked: false
    }
  ]
}
```

Use schema versioning:

```js
const DATA_VERSION = 2;
```

Implement migration when changing data structures.

---

# 18. DATA BACKUP

Because `localStorage` is device/browser-specific, add:

## Export

```text
Settings
↓
Data Saya
↓
Export My Data
```

Generate:

```text
lastcall-backup-YYYY-MM-DD.json
```

## Import

Allow user to restore backup.

Before import:

> Import akan menggantikan data semasa. Teruskan?

Provide:

- Cancel
- Import

Never silently overwrite.

---

# 19. RESET DATA

Current reset function deletes:

```js
localStorage.removeItem(LOGS_KEY);
localStorage.removeItem(SETTINGS_KEY);
```

Keep reset, but make it safer.

Flow:

```text
Reset Semua Data
       ↓
Warning
       ↓
Export backup first?
       ↓
Type "RESET"
       ↓
Confirm
```

For mobile UX, at minimum require a confirmation modal.

---

# 20. UNDO LOG

Current undo functionality is useful.

Keep:

```text
Log dipadam
[Buat asal]
```

But ensure:

- only the intended timestamp is restored
- duplicate timestamps are handled safely
- logs remain chronologically sorted

Prefer:

```js
logs.sort((a,b) => a-b)
```

after modifications.

---

# 21. TIMESTAMP ROBUSTNESS

All cigarette logs should be stored as exact timestamps.

Avoid storing only:

```text
YYYY-MM-DD
```

for cigarette logs.

Use:

```js
Date.now()
```

or ISO timestamps.

When displaying dates:

- use local device timezone
- preserve exact timestamp internally

Be careful with midnight/timezone conversions.

---

# 22. LOG BUTTON UX

The central bottom navigation button currently means:

> Saya Baru Isap Rokok

Keep the icon, but add explicit confirmation.

Potential accessibility label:

```text
Saya baru merokok — rekod rokok
```

Do not call it simply "Reset".

It is a logging action.

---

# 23. HEALTH + SUPPORT SECTION

Add:

> Perlukan bantuan?

Provide official Malaysian quit-smoking support.

Use current KKM information and verify contact details before release.

Include:

- Quit-smoking clinic information
- official KKM resources
- emergency advice when appropriate
- professional support disclaimer

Do not present LASTCALL as a substitute for a doctor or cessation professional.

---

# 24. SAFETY / MEDICAL DISCLAIMER

Use concise language.

Example:

> LASTCALL ialah alat sokongan dan penjejakan, bukan diagnosis atau pengganti nasihat profesional kesihatan. Maklumat kesihatan dalam aplikasi adalah untuk tujuan pendidikan umum. Jika anda mempunyai kebimbangan kesihatan atau simptom serius, dapatkan nasihat profesional kesihatan.

Avoid excessive disclaimer text on every screen.

---

# 25. GAMIFICATION

After the core health functionality is stable, add:

## XP

Examples:

```text
+10 XP
Craving survived

+25 XP
24 hours smoke-free

+50 XP
7 days smoke-free

+100 XP
30 days smoke-free
```

## Badges

Examples:

```text
FIRST STEP
24 HOURS
3 DAYS
7 DAYS
30 DAYS
90 DAYS
CRAVING SLAYER
RM100 SAVED
100 CIGARETTES AVOIDED
```

Gamification must reward progress, not shame relapse.

---

# 26. STREAK MILESTONES

Suggested milestones:

```text
20 minit
1 hari
3 hari
7 hari
14 hari
30 hari
60 hari
90 hari
180 hari
365 hari
```

Each milestone should unlock:

- badge
- short explanation
- motivational message

---

# 27. HOME SCREEN INFORMATION ARCHITECTURE

Recommended order:

```text
LASTCALL
Make It Your Last.

CURRENT STREAK
3d 14h 22m

Since your last cigarette

--------------------------------

🔥 AKU TENGAH CRAVING

--------------------------------

ROKOK DIELAKKAN
248

WANG DIJIMATKAN
RM148.80

BEST STREAK
17 hari

--------------------------------

NEXT MILESTONE
7 days
Progress 64%

--------------------------------

TODAY
Cravings: 2
Cigarettes: 0

--------------------------------

Health Timeline
```

Do not overcrowd the first screen.

---

# 28. NAVIGATION

Current navigation:

```text
Home
Timeline
Log cigarette
Stats
Settings
```

Potential next version:

```text
Home
Journey
Craving
Stats
Settings
```

The cigarette logging button remains central.

---

# 29. STATS SCREEN

Add:

```text
Current streak
Best streak
Total quit attempts
Cigarettes avoided
Cigarettes logged
Money saved
Cravings survived
```

Charts:

- cigarettes/day
- craving frequency
- money saved
- smoke-free streaks

Do not overload with medical metrics.

---

# 30. PRIVACY

For MVP:

- no account required
- local-first
- no cigarette data sent to server
- no analytics unless explicitly implemented
- no unnecessary personal information

Clearly communicate:

> Data anda disimpan pada peranti ini.

If cloud sync is added later, ask for explicit consent.

---

# 31. PWA REQUIREMENTS

Maintain:

- manifest
- service worker
- offline functionality
- install prompt
- iOS Add to Home Screen instructions
- Android installation
- app icon
- splash/startup behaviour

After every JS/CSS/HTML release:

- bump service-worker cache version
- ensure old cache is removed
- verify new assets are loaded

---

# 32. SERVICE WORKER CACHE

Current implementation uses a versioned cache.

Every production asset change should increment:

```js
CACHE_NAME
```

Example:

```js
lastcall-v14
```

Avoid stale JS being served after deployment.

---

# 33. RESPONSIVE DESIGN

Primary target:

```text
390 × 844
```

Must work correctly on:

- iPhone Safari
- Android Chrome
- desktop browser

Test:

- safe area bottom
- dynamic viewport
- keyboard opening
- landscape
- very small screens
- large text / accessibility settings

---

# 34. ACCESSIBILITY

Add:

- proper button labels
- visible focus states
- keyboard support
- sufficient contrast
- semantic headings
- `aria-label`
- `aria-live` for changing timer where appropriate
- avoid color-only status indicators

Do not make the timer announce every second to screen readers.

---

# 35. PERFORMANCE

The current architecture is lightweight.

Keep it that way.

Avoid:

- large frameworks for simple interactions
- unnecessary dependencies
- remote APIs for basic timer calculations
- blocking startup scripts

The app should work offline.

---

# 36. ERROR HANDLING

Handle:

- malformed localStorage
- missing settings
- invalid dates
- corrupted imported backup
- duplicate logs
- invalid price
- negative values
- future cigarette timestamp
- browser storage unavailable

Never let a corrupted localStorage value crash the entire app.

Use safe parsing.

Example:

```js
function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
```

---

# 37. FUTURE BACKEND

Do NOT add Supabase/auth yet unless necessary.

First prove:

1. retention
2. quit journey usage
3. craving mode usage
4. daily check-in usage
5. streak engagement

Possible V2 backend:

```text
Supabase
├── profiles
├── quit_attempts
├── cigarette_logs
├── craving_events
├── daily_checkins
├── achievements
└── sync_devices
```

Cloud sync should be optional.

---

# 38. CURRENT MVP AUDIT — KNOWN ISSUES

## P1

### Timer accidental reset
**Status:** FIXED

A confirmation modal was added before cigarette logging.

Also added anti-double-tap protection.

### Medical claims
**Status:** NEEDS REVIEW

Rewrite evidence-based timeline before public launch.

### Timer/quit-date architecture
**Status:** NEEDS IMPROVEMENT

Current Settings uses a date-only quit field:

```js
new Date(settings.quitDate + "T00:00:00")
```

Move toward exact timestamps for active quit attempts.

---

# 39. CURRENT CODE STRUCTURE

Current primary files:

```text
index.html
app.js
style.css
manifest.json
sw.js
icons/
```

Core JavaScript responsibilities:

```text
app.js
├── data storage
├── settings
├── timer
├── cigarette logging
├── stats
├── history
├── timeline
├── tips
├── install prompt
└── service worker registration
```

Do not rewrite everything unnecessarily.

Prefer incremental refactoring.

---

# 40. REFACTORING RECOMMENDATION

As the app grows, split `app.js`.

Potential structure:

```text
js/
├── app.js
├── storage.js
├── timer.js
├── cigarettes.js
├── cravings.js
├── stats.js
├── streaks.js
├── health.js
├── onboarding.js
├── ui.js
└── utils.js
```

Only do this once functionality is stable.

---

# 41. TEST CASES — MUST PASS

## Timer

### Test 1
Open app with no logs.

Expected:

```text
00:00:00
Belum ada log
```

### Test 2
Log cigarette.

Expected:

- confirmation appears
- timer does NOT reset until confirmation
- timestamp saved after confirmation

### Test 3
Tap cigarette button accidentally.

Expected:

- modal appears
- no timestamp created
- timer continues

### Test 4
Double-tap confirm.

Expected:

- only one cigarette log

### Test 5
Reload page.

Expected:

- timer continues from persisted timestamp

### Test 6
Close browser and reopen.

Expected:

- timer continues

### Test 7
Switch tabs/views.

Expected:

- timer continues

### Test 8
Cancel confirmation.

Expected:

- timer unchanged
- no new log

### Test 9
Undo last log.

Expected:

- previous timestamp restored
- timer updates correctly

### Test 10
Reset data.

Expected:

- explicit confirmation
- all relevant data cleared
- timer returns to initial state

---

# 42. BEST STREAK TESTS

Example logs:

```text
Day 0
Day 2
Day 5
```

Intervals:

```text
2 days
3 days
current interval
```

Best streak should be the largest completed/current interval.

After another cigarette:

```text
Day 6
```

best streak remains the previous maximum if the new interval is shorter.

---

# 43. CRAVING TESTS

When user starts craving:

```text
event created
```

When completed successfully:

```text
survived = true
```

When abandoned:

```text
survived = false
```

Stats should update.

---

# 44. DATA MIGRATION

Existing users already have data.

Do NOT simply change keys and lose old data.

Implement migration:

```js
if (!data.version) {
   migrateLegacyData();
}
```

Preserve existing:

- cigarette logs
- price
- quit date

Then transform into the new schema.

---

# 45. UI TONE

Use Bahasa Malaysia that feels natural.

Avoid:

> Anda telah gagal.

Prefer:

> Anda merokok semula. Mari lihat semula apa yang mencetuskan keadaan tadi.

Avoid:

> Kerosakan anda.

Prefer:

> Apa yang berlaku pada badan selepas rokok terakhir.

The product should be supportive rather than judgmental.

---

# 46. BRAND DIRECTION

Brand:

# LASTCALL

Tagline:

> **Make It Your Last.**

Visual identity:

- dark charcoal
- off-white
- red accent for smoking/log action
- green/lime for positive progress
- bold condensed display type
- modern sans-serif body type

Logo should remain simple and recognizable at:

- 16px favicon
- 48px PWA icon
- 96px app icon
- splash screen
- desktop header

---

# 47. SECURITY / PRIVACY

Never store:

- passwords
- unnecessary identity data
- medical records
- sensitive personal information

If account functionality is later introduced:

- use secure authentication
- encrypt transport
- enforce row-level security
- provide data deletion/export
- clearly explain cloud storage

---

# 48. ANALYTICS — FUTURE

If analytics are eventually added, focus on product behaviour, not unnecessary personal data.

Useful anonymous events:

```text
app_open
onboarding_complete
cigarette_logged
craving_started
craving_survived
craving_failed
milestone_reached
export_data
```

Avoid collecting the actual health details unless necessary and consented.

---

# 49. RELEASE CHECKLIST

Before public launch:

## Functionality

- [ ] Timer persists
- [ ] Accidental taps cannot reset timer
- [ ] Double-tap cannot duplicate logs
- [ ] Undo works
- [ ] Reset works
- [ ] Import/export works
- [ ] Best streak works
- [ ] Craving mode works

## Medical

- [ ] All medical claims reviewed
- [ ] Official sources linked
- [ ] No false precision
- [ ] No individualized medical prediction
- [ ] Professional support information verified

## PWA

- [ ] Service worker updated
- [ ] Cache version bumped
- [ ] iOS tested
- [ ] Android tested
- [ ] Offline tested
- [ ] Install flow tested

## UX

- [ ] Mobile 390×844 tested
- [ ] Buttons easy to tap
- [ ] Confirmation is clear
- [ ] Relapse messaging is supportive
- [ ] No accidental destructive action

---

# 50. DEVELOPMENT PRIORITY

Implement in this order.

## PHASE 1 — STABILITY

1. Verify timer fix.
2. Verify persistence.
3. Fix exact timestamp architecture.
4. Add current streak.
5. Add best streak.
6. Fix data migration.
7. Add export/import.
8. Improve reset confirmation.

## PHASE 2 — HEALTH CONTENT

1. Audit every medical claim.
2. Replace questionable claims.
3. Use official sources.
4. Add source attribution.
5. Improve medical timeline.

## PHASE 3 — QUIT COACH

1. Craving Mode.
2. Craving timer.
3. Trigger tracking.
4. Cravings survived.
5. Personal reason.
6. Daily check-in.

## PHASE 4 — GAMIFICATION

1. XP.
2. Badges.
3. Milestones.
4. Best streak.
5. Cigarettes avoided.
6. Money saved.

## PHASE 5 — CLOUD

Only after the local-first product is proven:

1. Authentication.
2. Cloud sync.
3. Cross-device recovery.
4. Optional profile.
5. Privacy controls.

---

# 51. IMPORTANT INSTRUCTION TO CLAUDE

Work directly with the existing LASTCALL repository.

Do NOT blindly rewrite the whole application.

Before changing code:

1. Inspect current files.
2. Understand existing localStorage keys.
3. Understand current timer logic.
4. Preserve existing user data.
5. Make incremental changes.
6. Test each change.
7. Update Service Worker cache version when required.
8. Keep the app lightweight and dependency-free where possible.

For health content, do not invent medical facts.

Verify medical claims against current authoritative sources before committing them.

For the timer, the single most important rule is:

> **A user's timer must NEVER reset because of an accidental tap, refresh, navigation, background/foreground transition, or app reopening.**

Only a deliberate, confirmed cigarette log or explicit quit-attempt action may change the active timer.

---

# 52. SUCCESS CRITERIA

LASTCALL should feel like:

> "This app helps me quit."

Not:

> "This app counts how many times I smoked."

The core emotional loop is:

```text
CRAVING
   ↓
RESIST
   ↓
SURVIVE
   ↓
REWARD
   ↓
LONGER STREAK
   ↓
MORE CONFIDENCE
```

The product should turn the user's attention from:

```text
"What did I do wrong?"
```

toward:

```text
"How long can I continue?"
```

---

# END OF BRIEF
