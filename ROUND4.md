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
