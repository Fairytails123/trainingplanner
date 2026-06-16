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

**Loose end.** Two inert test tombstones (`dog_zzTEST_…`) remain in the Deletions
tab from live testing — harmless (no real dog has those ids); delete those two
rows if you want it pristine. The clasp working copy lives at the workspace-root
`.appsscript-work/` (not committed).

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
