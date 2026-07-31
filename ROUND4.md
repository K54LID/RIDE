# Round 4 — 2026-07-31

Everything below came from `UPDATE.docx`. Both apps pass `tsc --noEmit`
and the web app builds clean under Vite.

## Discover

### Map removed, Global added
The map was a `ComingSoon` placeholder behind a toggle — it never showed
anyone. The toggle is now **Grid / Global**:

- **Grid** — the people the filters match, sorted as you choose.
- **Global** — random online people, anywhere. `sort=global` on
  `/v1/discover` skips the distance join and the `max_km` filter
  entirely, forces online-only, and orders by `random()`. Distance
  labels are suppressed in this mode, so a global result can't leak an
  approximate position through the bucket label.

### People are photos now, not rows
`PersonCard` was a full-width row: initial-letter avatar, name, and a
`24 · Man · 3 km` subtitle. It's now a square-ish tile (3:4) in a
two-column grid, filled edge to edge with the person's own primary
photo. Name, age and the verified badge sit in a gradient strip across
the bottom; the online dot and the distance bucket are corner chips. No
photo falls back to the initial letter on a plain tile rather than
leaving a hole in the grid.

`/v1/discover` now returns `avatar_media_id` (the public primary photo,
`position = 0` and not private) to make this possible.

### Filters panel centred
`.page-head` was a flex row with the title at `flex: 1`, so the title
left-aligned inside whatever space the back arrow and the action button
left over — and drifted visibly off-centre whenever those two differed
in width, which is exactly the case on Filters ("Clear" vs. a back
arrow). It's a three-column grid now: back / title / action, title
centred and truncating at 62vw.

### Court value sort removed
The "Court value" option is gone from the sort chips, per "remove the
court value tab from everywhere". Court itself is untouched on profiles
— the ♛ action tile, the cost, and the courted-by strip all stay.

## Profile photos everywhere

Real profile photos now render in **Discover**, **Home** (post authors)
and **Ranks** (podium and list rows), replacing initial-letter
placeholders. Three API queries grew a primary-photo subselect:

- `/v1/feed`, `/v1/posts/:id`, `/v1/saved` → `author_avatar_media_id`
- `/v1/leaderboard` (all five boards) → `avatar_media_id`
- `/v1/discover` → `avatar_media_id`

Each uses the same rule as the existing chat/story avatars: position 0,
not private, media present. Private photos can never become someone's
public avatar by accident.

## Private album on the profile

Private photos already uploaded and enforced correctly in SQL, but they
were mixed into one strip with the public ones. Both profile screens now
render two clearly separated sections: **Photos** (public) and **🔒
Private album**. On someone else's profile the album shows only what
they've unlocked for you in chat, plus a locked count and hint for the
rest. On your own it shows all of yours with a reminder of who can see
them. The access rules themselves are unchanged — they were already
right, and they're enforced server-side.

## Rank positions written out on profiles

New `RankStandings` component under the existing chips: every board —
court value, woofs, likes, gifts, followers — with the person's score
and their position on that board. `/v1/users/:id/ranks` no longer drops
zero-score boards, so the list is complete; `RankChips` still filters to
top-100 boards itself, so the badges above are unchanged.

## Home

- **Save is a real button.** It sits with like and comment in the post's
  action row (right-aligned, gold when saved) instead of being one tap
  deeper in the ⋯ menu. Saved posts land in **You → Saved** exactly as
  before; the menu entry stays for anyone used to it. In Saved, the same
  button unsaves and drops the post from the list.
- **The ⋯ button got a tap target** — 30×30 with a pressed state,
  instead of bare text floating at the edge of the card.

## Ranks

Opens on **court value, today** rather than all-time. All-time barely
moves day to day; today's climb is the thing people open this screen
for. Every other board and period still one tap away.

## Action tiles

Woof / follow / gift / court are smaller again — tighter padding, 0.58rem
labels, 0.9rem glyphs.

## New strings

`discover.global`, `profile.standing`, `profile.privateAlbum`,
`album.ownerHint` — added across all ten locales.

## Not done

The "+ button to upload photos should be fixed in the same line as the
buttons next to it" note didn't match anything I could find. The photo
manager's add cell is already a normal grid cell, the same size as the
photos around it, and the composer's + tab was aligned in round 3. A
screenshot of the screen in question would settle it.

---

# Round 5 — screenshot fixes

Note on the screenshots: they show the **currently deployed** build,
which predates the round 4 zip. The map toggle, the `COURT VALUE`
panel, and the row-style discover list were all already removed in
round 4 — deploying it clears those three without any further work.
`CourtCrest.tsx` is now deleted outright so the panel cannot come back.

## Blocking actually blocks now

The API routes were fine and the buttons existed. The hole was that
`POST /v1/chats/:id/messages` never checked blocks — only
`/v1/chats/open` did. So any conversation that already existed when the
block landed kept working in both directions, which is what "blocking
is not working" looks like from the outside. Membership in a thread is
not consent; the block is re-checked on every send.

The chat list also filters blocked people out, so their thread stops
sitting in your list waiting to be tapped. Both directions: if either
of you blocked the other, the thread disappears for both.

Block/unblock from a profile and unblock from Settings both work
against this; nothing changed in the UI because nothing needed to.

## Photo quality — root cause found

Not a CSS or client bug. On upload (`lib/telegramStorage.ts`) we kept
Telegram's **smallest** returned photo size as `thumb_ref` — about 90px
on the long edge. Every avatar, discover tile and photo-strip cell
requests `?thumb=1`, so a 90px image was being upscaled into a 56–64px
slot on a 3x display. That is the softness in every screenshot.

- New uploads store the smallest variant that is still ≥ 640px, falling
  back to the largest available rather than the tiny one.
- Migration `011_sharp_thumbnails.sql` clears `thumb_ref` for existing
  images so they fall through to the full file immediately — the old
  bytes can't be re-derived without re-uploading. Videos keep theirs: a
  poster frame has no full-size equivalent, and falling through would
  make every video row download the whole file.

## Your own avatar in the stories rail

The "Your story" tile passed no media at all, so your own face was an
initial letter on your own feed until you happened to post a story.
`/v1/me` now returns `avatar_media_id` and it's threaded App → Home →
StoriesRail. Post authors in the feed and everyone in Ranks were
already fixed in round 4.

## Gifts moved into the counts row

The loose `GIFTS` showcase (the cake) is gone from both profiles.
Gifts is now the third tab beside Followers and Woofs, and tapping it
opens the collection in a sheet. Disabled when there's nothing to show.

## Rank positions moved

`RankStandings` now sits directly above `DETAILS` on both profiles —
where the "Ranks" arrow in the screenshot points — instead of up under
the action buttons. All five boards with score and position.

## The + tab

`.nav-7 .nav-create` carried `margin-top: -18px`, lifting the + clear
out of the bar while its six siblings sat on the icon line below. It's
an ordinary tab now: same `align-self`, same `padding-top`, no offset.
Only the gradient pill marks it as Create.

## Discover: update my location

New 📍 button beside Filters. Telegram clients don't reliably give a
Mini App GPS access, but the bot chat does, so the button calls
`POST /v1/discover/request-location`, which sends the same
`request_location` keyboard `/start` uses. Coordinates are still
grid-snapped to ~500m before they touch the database — unchanged.

The app **stays open** and shows a dismissible note telling you to tap
the share button in the chat and come back. It does not close itself:
Telegram has no minimise for Mini Apps, only `close()`, so dismissing
would have meant a full relaunch just to return to the screen you were
already on. (`tg.close()` was added for that and has been removed
again — nothing uses it.)

Because the share lands while Discover is backgrounded, the screen
refetches on `visibilitychange` while a request is outstanding, so
distances and "nearby" sort update on the way back instead of showing
stale results until the next filter change.

That endpoint reads `telegram_identities`, which the invariants forbid
joining into a *public* response. Nothing telegram-derived is returned:
the caller only learns whether their own prompt was sent, and the chat
id never leaves the server.

## New strings

`discover.updateLocation`, `discover.locationFailed` — all ten locales.

---

# Round 6 — partial

**This round is incomplete.** Nine of the thirteen items are done and
build clean; four are not started and are listed at the bottom with why.

## Done

### Bot: "Open RIDE" after saving a location
The location-saved confirmation now sends a second message carrying the
same inline `web_app` button `/start` uses. New exported helper
`sendOpenApp()` in `lib/botCommands.ts`, reusable anywhere the bot
should offer a way back into the app.

### Sheets are stable in the middle — verification, chat actions, all of them
Root cause for both "verification request UI is not fixed" and "editing
/ deleting / reacting to a message is not possible". `.sheet` positioned
itself with `top: 50%` + `translateY(-50%)`, which resolves against the
**layout** viewport. On several Telegram clients that runs taller than
what's actually on screen, so a "centred" sheet sat low and a menu
opened from near the bottom of a chat put its buttons off the fold
entirely — the buttons existed and were simply unreachable.

The panel now lives inside a fixed `.sheet-wrap` sized to
`--tg-viewport-stable-height` and centres with flexbox, which cannot
drift. Message actions, edit, verification intro/sent, delete-account,
post menus, gifts and block confirms all pass `center`.

### Reports reach the admin panel
`GET /v1/admin/reports` returned bare ids, so the only possible action
was "resolve" with nothing to look at. It now resolves the responsible
account for every subject type, the post excerpt, whether the post is
already deleted, and the reporter's handle.

New **Reports** pane in the admin panel with **Delete post**, **Ban**
and **Dismiss**. Acting and closing the report is one gesture — split
apart, a moderator could delete a post and leave the report open, so
the same thing got handled twice.

### Reporters are told what happened
The old flow flashed a ✓ inside the menu for 900ms. Reporting now opens
a confirmation sheet saying it has gone to the admins to review, in
both the feed and the full-screen post view. It also states that the
outcome won't be reported back, which is true and better said upfront.

### Stories don't close themselves
Images had a 5s timer and videos advanced on `ended`, so a story could
vanish mid-read and the only defence was holding a finger down. All
auto-advance is removed: tap the right third to go forward, the left
third to go back, and videos loop. The progress bars mark position
rather than animating a fill that no longer corresponds to anything.

### Story author's photo
The story header showed a bare name. It now shows the author's avatar
beside their **handle**, and the whole thing still opens their profile.

### Blocked users live in Settings
The blocked list used to spill out underneath the "Blocked" row, so the
row's own "›" pointed at nothing. It opens a proper page now, listing
people by handle with Unblock.

### Smaller things
- Location button is `icon-btn`, the same size as Filters.
- **Chats → Chat** (singular) in the nav and screen title, all ten locales.
- The `♛ #1 · 🐾 #4` chip strip is gone from both profiles, and
  `RankChips.tsx` with it. The written standings list below is now the
  only place a profile states rank. **Confirmed against the screenshot:**
  the circled row was the chip strip, and the `YOUR STANDING` block
  below it is what stays.
- Two things the screenshot itself surfaced, now fixed: the standings
  heading said `YOUR STANDING` on *other people's* profiles (new
  `profile.standingOther` → "Standing"), and the courted-by strip
  printed the courter's display name and handle together — it shows the
  handle alone now, consistent with handles being the identifier
  everywhere outside grid/global and the profile header.

## Not done

- **Handles everywhere / force a username.** Touches onboarding, the
  profile PATCH schema, a migration to backfill and make `handle`
  non-null, a gate for existing accounts without one, and every screen
  that renders a name. Half-done here would leave accounts that can't
  be addressed.
- **Clickable handles and photos everywhere.** Depends on the above —
  worth doing in the same pass, since both edit the same call sites.
- **Followers list with follow/unfollow.** Needs a new paginated
  endpoint plus a screen; not started.
- **Story reply → private chat, marked as a reply to the story.** Needs
  a message kind that references a story, schema included; not started.

---

# Round 7 — the four remaining items

All four are done. Both apps pass `tsc --noEmit`; the web app builds.

**Two new migrations, and 012 is not reversible casually — read it
before running.**

## Handles are the identity

Confirmed rule: **display name on the profile header and the Discover
grid/global tiles; handle everywhere else.**

`profiles.handle` is now `NOT NULL` (migration `012_handles_required`).
Existing rows are backfilled deterministically: slugify the display
name where that yields something legal and unclaimed, otherwise
`user_<first 8 of account_id>`, which is unique by construction. The
partial unique index is replaced with a plain one now the predicate is
redundant.

The client types changed from `handle: string | null` to `handle:
string`, which turned every "no handle, fall back to the name" branch
into a compile error — that was the point, and it is how the call sites
below were found rather than guessed:

- comments, post authors in the feed / saved / post view
- chat list rows, chat thread header, quoted reply authors
- ranks podium and rows, stories rail, story viewer header
- alerts, blocked list, courted-by strip, profile page titles

Onboarding and Edit profile now require a handle instead of offering it
as optional, and `ProfileCoreSchema.handle` is no longer `.optional()`.
The PATCH path uses `COALESCE`, so a handle can be changed but never
cleared.

## Followers and following

New `GET /v1/users/:id/followers` and `/following` (both accept `me`),
paginated, each row carrying `i_follow` so the button is right on first
paint instead of needing a request per row. Blocked people are omitted
both directions.

New `FollowList` screen, reached by tapping the Followers count on
either profile. Follow/unfollow inline, optimistic with revert on
failure. Rows stay put when you unfollow — a list that removed people
as you tapped would move the next row under your finger.

It stacks above the profile overlay, so opening someone from the list
puts their profile on top and closing returns you to the list.

## Story replies go to the chat

A reply used to write `story_replies` and fire a notification, and that
was all — the author had no thread to answer in, and the reply was
visible only in their viewer panel.

`POST /v1/stories/:id/reply` now also inserts a real message into the
private conversation, reusing the existing 1:1 thread if there is one
(same lookup `/v1/chats/open` uses) so a reply can't fork a second
thread with the same person. It returns `conversation_id`. Blocks are
checked. The reply resurfaces a thread either side had cleared.

Migration `013_story_reply_messages` adds `messages.story_id`.
`ON DELETE SET NULL`, not cascade: stories expire within 24h and losing
the conversation with them would be worse than losing the thumbnail —
the bubble degrades to "Replied to a story (expired)".

## Clickable everywhere

Handles and photos already opened profiles in the feed, comments, chat
list, chat header, ranks, stories rail, story header and courted-by.
Added: follow-list rows, and alerts now name people by handle.

## Deployment

Run migrations in order. **012 makes `handle` NOT NULL** — take a
backup first. The backfill is written to be safe on re-run, but the
`ALTER COLUMN ... SET NOT NULL` is not something to discover a problem
with on a live database.

---

# Round 8 — hotfix: blank Mini App

## What broke

Rules of Hooks violation in `App.tsx`, introduced by me in round 7.

`const [followList, setFollowList] = useState(...)` was declared beside
the JSX it feeds — which sits **below three conditional early returns**
(`loading`, `error`, `onboarding`).

React counts hooks per render. On the first render `phase` is
`'loading'`, the component returns early, and that hook is never
reached. When `/v1/me` resolves and `phase` flips to `'ready'`, the
component runs past the returns and calls a tenth hook where there were
nine. React sees the count change, throws, and with no error boundary
above it unmounts the whole tree — leaving the page rendering nothing
but its background colour. Exactly the reported symptom.

Fixed by moving the declaration up with the other hooks, above every
conditional return.

## Why the build didn't catch it

TypeScript cannot see this. The code is perfectly well-typed; the bug
is in *when* a call happens, not in any type. Both `tsc --noEmit` and
`vite build` passed on the broken code, which is why I shipped it with
a clean build and said so.

There is no linter in this repo — no ESLint, so no
`eslint-plugin-react-hooks`, which is the tool that exists precisely
for this.

`scripts/check-hooks.mjs` is a dependency-free stand-in, wired into
`npm run typecheck` and `npm run build` for the web app (so CI covers
it too, unchanged). It fails the build when a hook appears after a
conditional early return. Verified both ways: it passes on the fixed
tree, and re-introducing the original bug makes it exit non-zero with
the file, line, and the return that shadowed it.

The proper fix is still ESLint with `eslint-plugin-react-hooks`. That
means new devDependencies and a regenerated lockfile, which is not
something to do inside a hotfix.

## Migrations were not the cause — verified against a real database

Because the symptoms looked like a dead API, I tested the migration
chain rather than assuming. Postgres 16 + PostGIS, all 13 migrations
applied in order on an empty database, then `012` re-run against seeded
profiles chosen to break it:

| case | result |
|---|---|
| two accounts, same display name, both handle-less | `khalid`, `user_22222222` |
| display name whose slug is already taken | `user_33333333` |
| unslugifiable name (`!!`) | `user_55555555` |
| non-Latin name (strips to empty) | `user_66666666` |

`handle` ends `is_nullable = NO`, the unique index is rebuilt without
its old partial predicate, and a subsequent `INSERT ... handle NULL` is
correctly rejected. `013` applies on the seeded database too.

So the API was up throughout — which is itself the proof that the blank
screen was client-side: had the API been down, `phase` would have gone
to `'error'` and shown the offline card, and the bad hook would never
have been reached.

---

# Round 9 — the round-8 fix never reached production

## What actually happened

Round 8 fixed the hooks bug correctly, and then stopped that fix from
ever shipping.

I added `scripts/check-hooks.mjs` at the **repo root** and wired it into
`apps/web`'s `build` script. But `apps/web/Dockerfile` copies only
`package.json`, the three workspace manifests, and `apps/web`. It never
copied `scripts/`. So inside the image, `npm run build` immediately ran
`node ../../scripts/check-hooks.mjs` against a file that did not exist,
exited 1, and failed the image build.

A failed build means Coolify publishes nothing and keeps serving the
previous image — the round-7 one, with the blank screen. Which is why
redeploying changed nothing.

Reproduced by staging a directory containing exactly what the
Dockerfile copies and running the same command: `npm error command sh
-c node ../../scripts/check-hooks.mjs`.

**Fix:** the guard moved to `apps/web/scripts/check-hooks.mjs`, inside
the workspace it checks, so it travels with `COPY apps/web apps/web`.
The Dockerfile needs no special case, which is the point — a build-time
file outside the copied tree is the failure mode, not a thing to
remember to copy.

## The blank screen is now proven, not inferred

`apps/web/scripts/smoke.mjs` mounts the real production bundle in jsdom
with a stubbed API and asserts `#root` has content.

- fixed build → `root children: 2`, renders the feed, **PASS**
- bug re-introduced → `root children: 0`, `innerHTML len: 0`, and
  **React error #310** — "Rendered more hooks than during the previous
  render" — **FAIL**

React #310 with an empty root is precisely "only the background colour
is visible". The diagnosis is now confirmed by reproduction rather than
reasoning.

## Why the pipeline let this through twice

- `tsc` cannot see hook ordering; the code is well-typed.
- `vite build` succeeds; the bug is at runtime, on the second render.
- No ESLint, so no `eslint-plugin-react-hooks`.
- And nothing ever *ran* the built artefact.

Now in place:

1. **`apps/web/scripts/check-hooks.mjs`** — zero-dependency, runs in
   `typecheck` and `build`, fails on a hook below a conditional return.
   Verified in both directions.
2. **`apps/web/scripts/smoke.mjs`** in CI — installs jsdom with
   `npm i --no-save` so it can never enter `package-lock.json` and
   therefore can never affect the Docker image build. Deliberate, given
   what a build-time dependency just cost.

## Verified before shipping

- `package-lock.json` unchanged; `jsdom` absent from it.
- Web build succeeds in a staged copy of the exact Docker context.
- Smoke test passes against the dist produced by that staged build.

---

# Round 10

## Panels appearing "down" — the actual cause

Round 6 sized the sheet wrapper to the visible viewport, which was
necessary but not sufficient. `position: fixed` is only relative to the
viewport when **no ancestor establishes a containing block** — and
`transform`, `filter`, `backdrop-filter`, `perspective`, `contain` and
`will-change` all do. Screens here animate in with a transform and the
nav uses `backdrop-filter`, so a sheet rendered inline was positioning
itself against whichever ancestor happened to qualify.

`Sheet` now renders through `createPortal(..., document.body)`. With no
ancestor at all, "fixed" means fixed. Every sheet also centres now —
top-anchored still reads as misplaced on a tall phone.

This is the same fix for the three-dot post menu, edit, delete,
verification, gifts, block confirm and the album.

## Delete account was unreachable — and would have failed anyway

Two separate bugs.

**Unreachable:** the density pass set `.screen { padding-bottom: 96px }`,
a flat value that does not clear `--nav-h` plus the home-indicator
inset. The last row of any screen sat behind the nav bar, and Delete
account is the last row in Settings. Now
`calc(var(--nav-h) + 28px + env(safe-area-inset-bottom))`.

**Broken:** `delete-account` ran `SET handle = NULL`, which migration
012 forbids. Deleting an account would have aborted the transaction and
failed outright. It now writes `deleted_<12 hex of account_id>` —
unique, obviously dead, releases the old handle for reuse. Verified
against the real schema.

## Private posts and the locked album

Compose offers **Everyone / Followers / Private**. "Friends" and "Only
me" are gone; the API still accepts `friends` so existing posts keep
rendering, but nothing produces it.

Private is not "nobody sees it" — a private post's **images** are also
inserted into `profile_photos` with `is_private = true`, so they land
in the locked album on the profile. Gating is unchanged: only people
granted a key in chat can open it. Videos are skipped; the strip is
built for photos.

The album is now a **tile at the end of the photo strip** with a lock
and a count, on both profiles, rather than a separate section further
down. On someone else's profile the count is what is behind the lock.

## Everything else

- **Grid vs Global.** Grid sorts by distance and requires a computable
  one on both sides, so it is strictly people nearby. Global stays
  random online people with location ignored entirely.
- **Profile counts.** Two of the three are buttons now, and a button is
  not a `div` — `.pro-counts div` never applied to them, so they sat at
  a different height and weight. All three share one rule set.
- **Story viewers and repliers** show avatar + `@handle` and open the
  profile on tap. Both queries gained the avatar subselect.
- **Unread messages left Alerts.** `kind = 'message'` is excluded from
  the notifications list *and* its unread count; the Chat tab carries a
  badge fed by `/v1/chats.total_unread`, polled every 20s. Alerts is for
  things that happened to you; a waiting message is a place to go.
- **Blocked list** shows avatar and handle. The settings query gained
  the avatar subselect.
- **Autosave in Edit profile.** Writes one second after you stop typing
  and again on back — back is a save, not a discard. A payload snapshot
  prevents duplicate PATCHes, an invalid handle defers the write rather
  than nagging per keystroke, and a failed save stays dirty so the next
  tick retries. The Save button remains as a status line.

## Verified

- Typecheck, hook-order guard, production build, jsdom smoke test — the
  app mounts and renders.
- All 14 migrations apply in order on a real Postgres 16 + PostGIS.
- The corrected delete-account statement runs against the live NOT NULL
  constraint.

---

# Round 11

## Panels open in the thumb zone now

Round 10 portalled sheets to `document.body`, which fixed *where they
were measured from*. This fixes *where they sit*: `.sheet-wrap` anchors
to the bottom instead of centring.

Centre and top both mean the same thing on a long feed — you tap ⋯ on a
post near the bottom of the screen and the action jumps to the far end
of the phone, away from your hand. Bottom is where every mobile action
sheet lives, and the wrapper is still sized to the visible viewport, so
it cannot fall below the fold — which was the original reason it was
moved to the top in round 3.

Applies to the post menu, delete, edit, verification, gifts, block
confirm and the album, since they all share `Sheet`.

## Discover no longer picks a filter for you

Round 10 defaulted the sort chip to "Nearby" to make Grid behave. That
was the wrong lever — it silently changed a control the person owns.

The two concerns are separated now: the **tab** decides who you see
(Grid sends `nearby_only=1`, Global ignores location entirely) and the
**sort chip** decides the order within that, defaulting back to Active
and never changing on its own.

## Photos delete from where you are looking at them

`PhotoCarousel` takes an optional `onDeleted`. Given it — own profile
only — the lightbox grows a Delete with an inline confirm. Going to
Edit profile to remove a photo already open on screen was a detour with
no purpose. The endpoint already existed.

## Video previews play

Feed video was `controls preload="metadata"` — a poster frame that
needed a tap to reveal whether it was worth watching, which is a
decision with no information behind it. Now `autoPlay muted loop
playsInline`. Muted is not a preference: it is the only autoplay mobile
browsers allow without a gesture. Controls stay for sound and scrubbing.

## Followers → profile opens on top

`{followOverlay}` was rendered after `{userOverlay}`, and later
siblings paint above earlier ones. Opening someone from the follow list
put their profile *behind* the list, so it looked like nothing happened
until you pressed back. Order swapped: the profile is last, so it
lands on top and back returns you to the list.

## Every leaderboard explains itself

A "How this leaderboard works" toggle on Ranks, with text per board:
what is counted, and the one thing that moves it — court value only
moves with coins; woofs count distinct people, not repeat taps; likes
are summed across all your posts; gifts count per gift, not by price;
followers count only new follows inside the period. Plus what the
period selector actually means, and that ghost mode removes you from
every board while blocking changes visibility but not scores.

A board that ranks people owes them the rule it ranks by.

English and a shorter shared version for the other nine locales.

## Verified

Typecheck, hook guard, production build, jsdom smoke test — mounts and
renders.
