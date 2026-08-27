# Lifts Roadmap

## V5 — Cloud ✅ complete
- [x] Repo contains V4 implementation (`v4/index.html`, kept as the reference)
- [x] Production project structure (Next.js App Router + TypeScript)
- [x] Supabase Auth (email + password, persistent sessions)
- [x] Supabase PostgreSQL (normalised workout schema)
- [x] RLS on every user-owned table, verified by automated tests
- [x] Cloud workouts
- [x] Cloud starting weights
- [x] Cloud history
- [x] Cloud progress/PRs
- [x] JSON import/export (V4-compatible) + one-click localStorage migration
- [x] Vercel deployment (see docs/DEPLOYMENT.md)
- [x] Local QA (40 app tests, 13 database tests, typecheck, lint, build)

## QA — in progress
`npm run qa` automates the browser-testable parts (30 checks, mobile + desktop).
The rest needs a human on a real device. See docs/QA_CHECKLIST.md.

- [x] Authentication (automated)
- [x] Workout entry (automated)
- [x] Progression (automated)
- [x] Edit/delete (automated)
- [x] Dashboard, PRs, charts (automated)
- [x] User isolation (automated)
- [ ] Real Safari on the actual phone
- [ ] Cross-device sync
- [ ] Feel: keyboard, scrolling, speed between sets

- [ ] Backup/import round trip on the real project

## Post-V5 — small improvements
Candidates already identified, none implemented yet (see docs/V5_NOTES.md):

- [ ] Prefill the weight field with the *suggested* load after a load increase,
      instead of last session's load
- [ ] Label rep PRs with the exercise's own unit (side plank reads "60 reps")
- [ ] Faster rep entry (auto-advance between set inputs)
- [ ] Better charts
- [ ] Better rest timer (background/audio cue)
- [ ] Editable workout date
- [ ] Dark mode

## V6 — Progression Engine
Only after V5 is stable in real use. Do not start before QA is done.

- [ ] Use RIR intelligently
- [ ] Detect fatigue/performance trends
- [ ] Exercise-specific load jumps
- [ ] Better post-load reset targets
- [ ] More coach-like recommendations

---

## Beyond V6 — the longer arc

Direction, not commitments. Each stage only makes sense once the one before it
is genuinely in daily use.

### V7 — Whole-day inputs
Lifting is one input into body composition; on its own it explains little.

- [ ] Daily bodyweight (also unblocks pull-up load maths and stall diagnosis)
- [ ] Daily macros — protein first, since it is the one that moves the outcome
- [ ] Cardio sessions (the Zone 2 walks and step count currently kept outside the app)
- [ ] A single trend view: load, bodyweight and intake on one timeline

The payoff is diagnostic. Today a stall looks identical whether it is fatigue,
under-eating, or poor sleep — and V6 will guess wrong. With intake and
bodyweight in the same database, the engine can say "your loads stalled while
bodyweight fell for three weeks" instead of quietly reducing your weights.

### V8 — Goal-aware coaching
The engine stops assuming the goal is always hypertrophy-first.

- [ ] Explicit goal setting (gain muscle / get stronger / lean out / maintain)
- [ ] Targets derived from the goal — intake, rate of weight change, load bias
- [ ] Recommendations that reconcile training and nutrition rather than treating
      them as separate apps that happen to share a login

### V9 — Beyond one user
Everything up to here is purpose-built around one person's program. Generalising
is a genuinely different product, not a bigger version of this one.

- [ ] Programs as data rather than a TypeScript constant (starts in V6 if
      set-count progression lands)
- [ ] Onboarding: goals, experience, available equipment, days per week
- [ ] Generated programs, with the progression engine driving them
- [ ] Multi-user concerns the current design defers: sharing, coaching, exports

**The honest risk:** each stage adds daily logging burden, and adherence is the
thing that actually decides whether any of it works. A workout tracker you use
every session beats a health platform you abandon in three weeks. Add an input
only when the previous one has survived a month of real use.
