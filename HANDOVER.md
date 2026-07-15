# Fairy Tails Training Planner — Handover

Vanilla HTML/CSS/JS PWA (no build step) deployed via GitHub Pages from `master`:
https://fairytails123.github.io/trainingplanner/

Data lives in localStorage and two-way syncs with a Google Sheet through an Apps
Script endpoint (`google-apps-script.js`, `DEFAULT_SHEETS_URL` in `js/storage.js`).
The read-only TV display (sibling repo `trainingdisplay`) consumes the same Sheet.

**Deploying:** push to `master`, and bump `CACHE_NAME` in `sw.js` whenever any
asset changes — otherwise installed PWAs can serve a mixed old/new asset set.

**Data contract (do not change):** localStorage keys `ft_dogs`,
`ft_config_timeslots`, `ft_config_equipment`, `ft_sheets_api_url` (raw string,
not JSON), `ft_slots_<YYYY-MM-DD>`. Sync actions: saveDog / archiveDog /
setSlot / removeSlot / saveTimeSlots / saveEquipment / syncAll / getAll.
Merge rules: newest `updatedAt` wins for dogs and slots; Sheet wins for config.

---

## Session record — 15 July 2026

### Backend hardening — max-effort review of the server-side week-increment + write lock

A max-effort multi-agent code review (6 finder angles, 20 independent verifiers)
went over the then-uncommitted backend change that (a) serialises every `doPost`
write behind a `LockService` script lock and (b) advances each dog's `weekNumber`
once per ISO-week server-side (`autoIncrementWeekNumbers()`, run from
`handleGetAll`). 12 findings kept, 5 refuted. **Three "must-fix" defects were
fixed and deployed** to the prod deployment id (`AKfycbz…564RrR`, **@8 → @9**);
the repo mirror `google-apps-script.js` was synced, committed, and pushed to origin/master (`986ab24`) with this record. **Session paused here (2026-07-15)** — the deferred findings below are the agreed next step.

**Fixes (`.appsscript-work/Code.js` + mirror):**
1. **NaN guard** — a malformed `weekNumberSetDate` (e.g. a hand-typed `2025-12`)
   made `ymdToMs_` return `NaN`; `NaN < 1` is false, so the old clamp let it
   through and wrote `weekNumber = NaN`. Now `if (!(weeksElapsed >= 1))` catches
   NaN / 0 / negative.
2. **Per-row resilience** — each per-dog write is wrapped in `try/catch` +
   `Logger.log`; one bad/protected row is skipped, not thrown out of the loop.
   Previously one poison cell aborted the whole pass (the `weekIncDone` marker is
   set only *after* the loop), freezing **every** dog's advance and re-spinning the
   locked read-modify-write on every 30s TV poll.
3. **flush before unlock** — `SpreadsheetApp.flush()` now precedes `releaseLock()`
   at both sites (doPost + the increment) so the next holder can't read stale,
   still-buffered rows and lose an increment/save. Guarded so a flush error can't
   leak the lock.

Verified: both files `node --check` clean; live `ping` + `getAll` healthy after
redeploy. Note: mid-week deploy, so the increment early-outed — the loop body's
first *runtime* exercise is the next Monday rollover (syntax- + logic-verified).

**Deferred findings (reviewed, NOT fixed — don't re-discover):**
- **`updatedAt` widens last-write-wins loss** — `getAll` now rewrites `updatedAt`
  for every dog on the first poll each week, so a stale Sheet row can outrank an
  unsynced local edit. Candidate fix: don't touch `updatedAt` in the server
  increment (write only the two week cells).
- **Once-per-week marker is not a continuous healer** — after the first pass each
  Monday, a mid-week reversion (stale-device push / hand-edit) isn't re-advanced
  server-side until next Monday (heals on next planner open). Conscious tradeoff.
- **`wk >= 100` self-heal runs unattended 24/7** — collapses a genuine
  week-99→100 dog back to ~11. Raise/remove the server threshold if any dog is
  tracked ~2 years.
- **Client/server `weeksElapsed` floor divergence** — the server floors at 1, the
  client (`storage.js`) does not → a permanent planner-vs-TV disagreement for a
  non-Monday `weekNumberSetDate` near the boundary. Unify the two routines.
- **Lock contention on a large roster** — the best-effort no-lock timeout path
  reopens the `deleteRow` race, and a 25s-held lock can exhaust the execution
  ceiling and drop no-cors writes. Batching the per-dog writes into one `setValues`
  shortens the critical section and is the best single mitigation.
- **Cleanup** — `formatCellDate_` duplicates the Date→`YYYY-MM-DD` logic in
  `sheetToObjects`.

---

## Session record — 19 June 2026

### Training-date fields: end date + two break windows

Added three new dog date fields, end-to-end:

- **New dog fields** (camelCase, stored as `YYYY-MM-DD` strings, `''` when blank):
  `trainingEndDate`, and two break "training windows" `break1Start`/`break1End`,
  `break2Start`/`break2End`.
- **Edit/Add Dog modal** (`js/planner.js` `openDogModal`): a native date input for
  the end date and two `.date-range` rows (two date inputs + a "to" separator) for
  the breaks. Save handler writes all five; cleared fields store `''` so a blank
  overwrites on sync.
- **Expanded card** shows a `.dog-card__dates` block (only rows that have a value).
- **`js/calendar.js`** gained `formatISOShort()` ("12 Jan 25") and `formatISORange()`
  ("12 Jan 25 to 16 Jan 25") — both parse the `YYYY-MM-DD` string directly (no
  `Date` object) so a value never shifts a day across a timezone.
- **`storage.js` unchanged** — `saveDog`/merge pass the whole dog through, so the
  new fields round-trip with no data-layer change (verified by the node smoke +
  tombstone tests, still green).
- **Backend** (`google-apps-script.js` / live `.appsscript-work/Code.js`, redeployed
  to the prod deployment id → `@7`): new `ensureDogColumns_()` appends any missing
  Dogs header (idempotent) and runs before every write/read path
  (`handleGetAll`/`handleSaveDog`/`handleSyncAll`). Without it, the header-mapped
  writers would silently drop a field that has no column. Verified live: `getAll`
  auto-created the 5 columns; a save→read→delete round-trip preserved all dates
  exactly through the Sheets date-coercion.
- **Cache-bust:** `sw.js` `CACHE_NAME` → `ft-planner-v8`.
- Reviewed by an adversarial multi-agent pass (0 confirmed bugs); one free
  hardening applied on the display side (wrap, don't clip, long break ranges).

The TV display renders these **right-aligned** — see the display repo's handover.

---

## Session record — 16 June 2026

### Deletion bug — deleted dogs were restored by sync (fixed)

**Symptom.** Deleting an (archived) dog from the app didn't stick: it came back
and reappeared on the TV display.

**Cause.** `deleteDog` was local-only — it removed the dog from localStorage but
never told the Sheet, which every sync trusts. So `syncFromSheets`/`mergeDogLists`
re-added it as a "Sheet-only" dog, and a destructive `syncAll` from a stale
device could rewrite it as active. The display reads the Sheet directly, so it
never stopped showing it. (There was no UI to delete an archived dog either.)

**Fix — server-side hard delete + tombstones consulted by every sync path:**
- **Apps Script** (`google-apps-script.js`, redeployed to the prod deployment id
  `AKfycbz…564RrR`, now `@6`): new `deleteDog` action removes the Dogs row + the
  dog's Assignments and writes the id to an auto-created **Deletions** tab
  (`id | deletedAt`). `getAll` now returns `deletedIds`. `handleSaveDog` and
  `handleSyncAll` refuse to write a tombstoned id, so no push can resurrect it.
- **storage.js**: `deleteDog` records a persistent local tombstone
  (`ft_deleted_dogs`), removes the dog + its local slots, and POSTs the server
  delete. `mergeDogLists`, the slot merge and the local-only pushes all drop
  tombstoned ids; `syncFromSheets` ingests server `deletedIds` and re-sends the
  delete for any tombstoned dog still on the Sheet (self-heals the fire-and-forget
  no-cors race, and propagates deletions across devices). Added `restoreDog` +
  `getArchivedDogs`.
- **Settings → "Archived dogs"** (settings.js/styles.css): lists archived dogs
  with **Restore** and permanent **Delete** (confirm-gated). SW bumped to v7.

**Verified.** Live: `deleteDog` removes the row + tombstones it; `saveDog`/
`syncAll` can't bring it back; `getAll` returns `deletedIds`. Client logic is
covered by `.claude/redesign-smoke-test.js`-style node tests in
`.claude/tombstone-test.js` (includes the exact reported race). The Archived-dogs
UI was render-verified in headless Chrome.

**Confirmed in production.** User then deleted all archived dogs via the new UI
(27 → 10 active, 0 archived); `getAll` shows all 17 deletions correctly
tombstoned in `deletedIds` and none resurrected — the fix works end-to-end.
`deletedIds` / the Deletions tab are now load-bearing — **don't clear real
tombstones**, and always delete dogs through the app, never by editing the Sheet
(a Sheet-side delete leaves no tombstone → a stale device re-pushes the dog).

**Loose end.** Two inert test tombstones (`dog_zzTEST_…`) remain in the Deletions
tab from live testing — harmless (no real dog has those ids); delete just those
two rows if you want it pristine. The clasp working copy lives at the
workspace-root `.appsscript-work/` (not committed).

---

## Session record — 11 June 2026

### 1. Bug-fix batch (15 verified findings from a deep code review of the iOS redesign commits)

- **Add Dog repaired** — the empty-state button was never wired and wide
  screens (≥800px) had no add control at all.
- **Past days locked again** — the dropped `pointer-events` guard let staff
  edit history, which silently synced to the shared Sheet and TV.
- **Backup restore no longer kills sync** — `ft_sheets_api_url` is special-cased
  in `exportAll`/`importAll` (it round-tripped to the literal string `"null"`).
- **Stored-XSS escaping** for slot labels, dog names in bottom-sheet titles and
  pill tooltips, equipment labels/colours — shared escaper at `FT.Util.escapeHtml`
  (defined in `storage.js`, which loads first).
- **Header sync button** — re-entrancy guard, spinner, success/failure toast
  (`FT.Settings.toast` is exported for reuse).
- **Settings sync row re-renders after pull** so "Save slots" cannot revert a
  colleague's synced config or remap slot ids positionally.
- Conflict dot on collapsed cards, swipe-handler dedupe/view-guard, modal
  Escape-listener leak, honest empty-URL toast, service-worker bump to v5.

### 2. Full redesign (brief: premium UI, brand `#31add3`, operational clarity)

Built on `redesign/ui-upgrade`, multi-agent-reviewed, merged and deployed (SW v6).

- **Blue rebrand** with a token system in `css/styles.css`. Contrast rules that
  must be preserved: `#31ADD3` (`--brand-bright`) is never placed under small
  white text (2.6:1); `#0077B6` (`--brand`) carries interactive text/fills;
  text on `--brand` fills always uses `var(--on-brand)` (white in light mode,
  `#06283A` in dark mode, where `--brand` remaps to `#31ADD3`). Text sitting
  directly on `--bg` uses `--brand-dim`. PWA icons regenerated in blue
  (PowerShell System.Drawing: gradient square + white paw — both repos share
  the artwork).
- **Today snapshot bar** (dogs / training today / unassigned / conflicts / kit),
  with unassigned + conflict tiles tap-through to filters.
- **Search** (name/breed/owner) + **filter chips** (All · Unassigned ·
  Conflicts · AM · PM · Kit needed). Filtering toggles cards in place — no
  re-render, so typing keeps focus. Logic is pure functions exposed at
  `FT.Planner._test` and covered by `.claude/redesign-smoke-test.js` (node).
- **Card glance row** — today-status badge, first kit chips, notes button on
  every collapsed card. **Quick-notes bottom sheet** edits the existing
  `dog.notes` field (re-reads the dog at save so only notes change).
- **Schedule run-sheet** — day snapshot + "Kit to prepare" grouped by equipment;
  free slots styled as deliberately free.
- **GSAP core** (CDN, precached non-fatally in `sw.js`) drives bottom-sheet and
  card-expand only, with instant CSS fallback. Hard-won rules inside
  `js/planner.js`: tweens set `x: 0` alongside `xPercent` (GSAP parses CSS
  `translate(-50%)` as px and composes them — sheets went half off-screen);
  `killTweensOf` before every sheet/card tween; outgoing sheet + backdrop get
  `pointer-events: none`; notes sheet queries elements within its own sheet
  reference (duplicate ids exist while an old sheet animates out);
  `expandedCards` is the expansion source of truth, not `classList`.
- **44px tap targets** everywhere (incl. an invisible `::after` hit-area on the
  week badge); conflict counting unified — `countConflicts` ignores archived
  dogs and deleted slot ids, matching the per-dog logic, the filter, and the
  Schedule day stats, so all surfaces show the same numbers.

### 3. Known remaining items (deliberately not done)

- Pre-existing: edit-modal full-snapshot save can clobber a concurrent sync
  merge; the background-sync re-render can discard un-saved Settings typing —
  both need a diff-save design.
- `user-scalable=no` in the viewport meta (accessibility trade-off, untouched).
- `color-mix()` header/tabbar backgrounds have no fallback for pre-2023 engines.
- ~20 efficiency/dead-CSS cleanups catalogued in the review, not applied.
- Real Fairy Tails logo pending — replace the paw placeholder `#brand-logo`
  in `index.html` and regenerate the icons from it.
- Untracked stale app copy in `Dog training ops/` (April OneDrive accident) —
  gitignored; safe to delete.

### Rollback

`backup/pre-redesign-2026-06-11` pins the pre-redesign code:

    git push origin backup/pre-redesign-2026-06-11:master --force
