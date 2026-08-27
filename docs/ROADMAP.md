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
