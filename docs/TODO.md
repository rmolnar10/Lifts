# Your to-do list

Things only you can do. Claude can't action any of these — they need your
accounts, your body, or your judgement.

---

## Blocking the V6 progression engine

These four answers change what gets built. The cascade in the research doc is
tuned to assumptions I made; if any are wrong, the rules are wrong.

- [ ] **How long have you been lifting, and how long on this program?**
      Rules 03 (RIR-scaled load jumps) and 04 (stall back-off) are tuned to
      intermediate rates. A beginner should progress faster and stall later, and
      firing a back-off after 3 sessions would be actively wrong.
- [ ] **Are you eating in a surplus, at maintenance, or in a deficit?**
      Decides whether a stall means "back off the load" or "eat more". In a
      deficit, rule 04 would misdiagnose under-eating as accumulated fatigue and
      keep reducing your weights.
- [ ] **Are these three additions acceptable?** Each is one tap or one entry:
      - readiness at workout start (rough / normal / good)
      - form held vs form broke down, per exercise
      - bodyweight, weekly
- [ ] **Do you want set-count progression?** Biggest hypertrophy lever
      available, biggest change to build (schema + UI + engine). Fine to defer.

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
