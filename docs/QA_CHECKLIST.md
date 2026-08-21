# Lifts QA Checklist

Run this against the deployed app, on a phone **and** a computer, before any V6
work starts.

Automated coverage already exists for progression maths, backup parsing, view
rendering and RLS (`npm test`, `./scripts/test-db.sh`). This list is for the
things only a real device and a real Supabase project can prove.

---

## Auth
- [ ] Sign up with a new email
- [ ] Confirmation email arrives (if *Confirm email* is on) and the link works
- [ ] Sign in
- [ ] Invalid password shows a clear error and does not sign you in
- [ ] Sign out returns to /login
- [ ] Reload while signed in keeps you signed in
- [ ] Close the browser, reopen it, still signed in
- [ ] Visiting / while signed out redirects to /login

## Workout entry
- [ ] Heavy Upper logs and saves
- [ ] Volume Upper logs and saves
- [ ] Legs + Abs logs and saves
- [ ] Reps save per set
- [ ] Weight saves
- [ ] RIR saves, and blank RIR stays blank rather than becoming 0
- [ ] Notes save
- [ ] Next target shown for every exercise before logging
- [ ] Double-tapping "Finish & save workout" creates only one workout

## Progression
- [ ] First workout offers a baseline from your starting weight
- [ ] Weakest set is called out by number
- [ ] Adding one rep to the weakest set moves the next target along
- [ ] Hitting the top of the range on every set increases the load
- [ ] Target resets toward the bottom of the range after a load increase
- [ ] Weighted pull-ups increase by 2.5 lb
- [ ] Bodyweight pull-ups progress on reps
- [ ] Isolation exercises progress the weakest set
- [ ] Side plank progresses on time, then suggests harder variation at 60/60
- [ ] Hanging leg raise stays quality-focused
- [ ] Close-grip push-ups have no forced target
- [ ] Reverse kegel practice has no progression

## Editing and deletion
- [ ] Edit a saved workout from History
- [ ] Change reps, save, and see it reflected
- [ ] Change weight, save, and see it reflected
- [ ] Change RIR, save, and see it reflected
- [ ] Change notes, save, and see it reflected
- [ ] Editing recalculates the next target
- [ ] Delete a workout
- [ ] Dashboard stats, History, PRs and Progress all update after a delete

## Dashboard, PRs, charts
- [ ] Workout count is right
- [ ] Logged load×reps is right
- [ ] Last workout date is right
- [ ] Recent workouts list the six most recent
- [ ] Load PRs and rep PRs appear per exercise
- [ ] Progress chart draws for an exercise with history
- [ ] Estimated 1RM looks sane

## Cross-device sync
- [ ] Log a workout on the phone → it appears on the computer
- [ ] Log a workout on the computer → it appears on the phone
- [ ] Switching back to a stale tab refreshes it
- [ ] Sign out and back in on a second device; all data is there
- [ ] A second account sees none of the first account's data

## Backup
- [ ] Export writes lift-tracker-backup.json
- [ ] Import that file restores the same data
- [ ] Importing a non-backup JSON file is rejected with a clear message
- [ ] A V4 backup file imports successfully
- [ ] If this browser has V4 localStorage data, the import banner appears and works

## Mobile
- [ ] Portrait layout is usable throughout
- [ ] Number keyboards appear for weight, reps and RIR fields
- [ ] Page scrolls without the keyboard covering the active input
- [ ] Buttons are large enough to hit mid-set
- [ ] Rest timer counts down and stays visible while scrolling
- [ ] Per-exercise rest button uses that exercise's rest default
- [ ] Nav between the six views works
- [ ] A full workout can be logged quickly without fighting the UI

## Notes while testing

Known V4 behaviours carried into V5 on purpose — these are **not** bugs to
report, they are on the post-V5 list in `docs/ROADMAP.md`:

- The weight field prefills last session's load, so after a load increase you
  type the new weight yourself.
- Rep PRs are labelled "reps" even for the timed side plank.
- Workout dates are set when you save and cannot be edited.
