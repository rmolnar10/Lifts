# Your to-do list

Things only you can do. Claude can't action any of these — they need your
accounts, your body, or your judgement.

---

## Switch on V6

- [ ] **Apply the V6 database update.** In the Supabase SQL editor, paste and
      run, in order: `0004_program_rpcs.sql`, `0005_scoped_reset.sql`,
      `0006_v6_inputs.sql` (all in `supabase/migrations`). The app works before
      this, but readiness, form and bodyweight will not save until 0006 is in.
      0006 refuses to run until 0004 is applied.
- [ ] **Weigh in once a week** from the Dashboard, same time of day.

## V6 progression engine: answered 2026-10-15

All four blockers are answered, and V6 is built on these answers
(`src/lib/athlete.ts`; rules in `docs/PROGRESSION_RULES.md`).

- [x] **Training age:** about 6 months of consistent lifting, 1.5 to 2 months
      on this program. Treat as a late novice, not an intermediate: rules 03
      (RIR-scaled load jumps) and 04 (stall back-off) need faster progression
      and a later, more conservative stall trigger than the intermediate tuning.
- [x] **Energy balance:** eating in a **deficit**. A stall must not be read as
      accumulated fatigue by default; rule 04 should hold the load (and flag
      intake) before it ever reduces weights.
- [x] **New inputs:** yes to all three.
      - readiness at workout start (rough / normal / good)
      - form held vs form broke down, per exercise
      - bodyweight, weekly
- [x] **Set-count progression:** yes, build it in V6 (schema + UI + engine).

## Housekeeping

- [ ] **Delete the stale `claude/lifts-v5-supabase-vercel-3iwa63` branch.**
      github.com/rmolnar10/Lifts/branches → trash icon. The session's GitHub
      proxy refuses branch deletions, so Claude cannot do this. Until it's gone,
      every push builds twice.
- [ ] **Confirm the QA-suite deploy landed** — check that "Start fresh" on the
      Workout tab now actually clears the inputs.

## QA that automation can't cover

`npm run qa` covers 30 checks in a real browser. These are what's left, and they
need you on your actual phone. Full list in `docs/QA_CHECKLIST.md`.

- [ ] **Real Safari.** The QA suite runs Chromium emulating an iPhone. WebKit
      quirks are invisible to it.
- [ ] **Cross-device sync.** Log on the phone, confirm it appears on the laptop,
      and the reverse.
- [ ] **Speed between sets.** Can you actually log a set quickly while catching
      your breath, or does the UI fight you? Only you can answer this, and it
      matters more than most of the automated checks.
- [ ] **Backup round trip** on the real project: export, re-import, verify.
