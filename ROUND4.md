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
