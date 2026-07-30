# Fixes — 2026-07-30

## Delete buttons broken everywhere (posts, comments, stories, photos, chat messages)
Root cause: the web client attached `Content-Type: application/json` to every
request, including DELETEs and taps with no body. Fastify rejects a JSON
content-type with an empty body as a 400, so every delete failed server-side;
the UI's optimistic removal + error-path refetch made deleted posts reappear.

- `apps/web/src/lib/api.ts` — the header is only sent when a body exists.
- `apps/api/src/server.ts` — the JSON parser now tolerates empty bodies, so
  cached copies of the old client keep working too.

The same bug silently broke likes, saves, follows, woofs, story views, chat
read receipts, daily claim — and notification mark-as-read (below). All are
fixed by the same change.

## Notification indicators never cleared
The Alerts screen already marked notifications read on open, but that call was
one of the bodyless POSTs failing above. With the transport fixed, opening
Alerts clears the badge; it only reappears for genuinely new notifications.
`Alerts.tsx` also now renders proper text for like / story-reply / message /
achievement notifications instead of raw identifiers.

## Posts only visible to the author
`GET /v1/feed` only showed public posts from people you follow. It is now a
global timeline: public posts are visible to every member; the
followers / friends / only-me compose options are enforced as written.
Stories got the same treatment (`/v1/stories` was follows-gated), honouring
each author's story-visibility setting — and `/v1/stories/author/:id`, which
previously had **no** access check, now enforces the same rules.

## Verification prompt appeared below "Delete account"
The request-verification walkthrough (and the delete-account confirm) rendered
as cards at the bottom of the Settings page, off-screen from the button just
pressed. They now open as bottom sheets over the current view.

## Profile photos too large
The full-width photo carousel is replaced by a horizontal strip of small
square thumbnails (`PhotoCarousel.tsx` + CSS). Tap a thumbnail to view it
full-screen; tap again / ✕ / Telegram back to close. Applies to your own
profile and other people's.

## "Newcomer" tier removed
The tier-name badge and the "coins to reach tier X" hint are gone from the
profile. Rank positions (#N / total, plus the per-board standings grid) stay.

## Story viewer not full screen
Story media now fills the viewport (`object-fit: cover`, `100dvh` viewer)
instead of sitting letterboxed in the middle.

## Chats: delete + pin (new)
- Migration `db/migrations/009_chat_pin_clear.sql` adds a per-member
  `cleared_at` watermark (pinning reuses the existing `is_pinned` column).
- API: `POST /v1/chats/:id/pin` toggles pin; `DELETE /v1/chats/:id` clears the
  chat *for you* (the other person keeps their copy) and removes it from your
  list until a new message arrives or you reopen it from their profile.
- UI: each chat row has a ⋯ menu with Pin/Unpin and Delete chat (with
  confirmation); pinned chats sort to the top with a 📌 marker.
- New strings added across all 10 locales.

Both apps pass `tsc --noEmit`. Deploy notes: run migrations as usual on boot
(009 applies automatically) and redeploy web + api together.

---

## Round 2

### Courting
- **30-day expiry** — a courtship now lapses 30 days after it was paid for; the "courted by" strip disappears until someone courts again. Re-courting resets the 30 days, and since cost always doubles from the current value, the price has gone up (`GET /v1/users/:id/court` in `economy.ts`).
- **Courter identity** — the strip on the courted person's profile now shows the courter's photo, a days-left countdown, and taps through to their profile.

### Everyone is tappable
- Post authors (feed, saved, single-post view), comment authors, leaderboard rows and podium, chat-list avatars, story authors, and the courted-by strip all open the person's profile. Profiles opened from a profile stack correctly.

### Chats
- **Visible pin + delete** on the right side of every chat row (pin is instant and gold when active; delete asks for confirmation). The old ⋯ menu is gone.

### Notifications (`Alerts`)
- **Every notification is a destination**: post likes/comments open the post itself (new `GET /v1/posts/:id` + full-screen `PostView` with working like/comments/menu), messages open the chat, everything else opens the actor's profile.
- **Post preview in the row** — a thumbnail of the liked/commented post, or a text excerpt when it has no media (`notifications.ts` now joins the referenced post).

### Coins
- **Exact-amount purchase** — type any amount from 10 to 100,000 coins (1 Star per coin; packs keep their bonus) via `POST /v1/wallet/topup-custom`.
- **Webhook self-registration** — on boot the API now calls `setWebhook` when `PUBLIC_API_URL` is set. A missing webhook was the single cause behind "/start does nothing" *and* "purchases hang": Telegram had nowhere to deliver `/start` messages or the pre-checkout query that Stars payments block on.
- **Admin: any amount** — a per-user amount field in the admin Users pane; the endpoint always allowed ±100,000, only the UI capped it at ±100.

### Telegram bot
- **/start** keeps the intro + "Open RIDE" button and now follows up with a one-tap **location share** keyboard. A shared location is grid-snapped to ~500 m (never stored precisely), saved to `user_locations`, and immediately powers Discover's distance labels and "nearby" sort. `/stoplocation` deletes it.

### Layout & stories
- **Menus/dialogs anchored to the top** of the screen — bottom sheets were rendering their buttons below the visible fold on some Telegram clients ("the delete menu appears way down"). All sheets are now top-anchored dialogs sized against Telegram's stable viewport.
- **Story viewer is exactly screen-sized** (`--tg-viewport-stable-height` with `100dvh` fallback) and the bottom tab bar is hidden while a story is open.
- **Own stories show a trash icon** in the header to delete.
- **Plus button aligned** with the rest of the tab bar (no longer floats above the row).
- **Removed** the red ✎ badge on the profile avatar (the avatar itself still opens photo editing).

### Removed
- **Tier system** — the Newcomer/… ladder and the numbers panel under Edit profile/Saved are gone: `/v1/standing` endpoint, tier tables, and the profile standing grid all removed.

### Config
- New optional env: `PUBLIC_API_URL` (enables webhook self-registration). See `.env.example`.

---

## Round 3

### /start dead outside the Mini App — root cause found
`PUBLIC_API_URL` was set to the **web app's** domain, so the Telegram
webhook registered against the static site and every update went into a
void. The bot transport is now misconfiguration-proof
(`lib/telegramUpdates.ts`): on boot the server fetches its own health
endpoint *through* the public URL — only if that provably routes back to
this API does it register the webhook; otherwise (wrong URL or unset) it
logs why and falls back to `getUpdates` long-polling. `/start`, location
sharing and Stars pre-checkout answers now work regardless of the env.
Webhook and polling share one update processor, so behaviour can't
drift between transports. Fix the env to the API origin for production
(see `.env.example`).

### Profiles
- **Rank badges** — new `GET /v1/users/:id/ranks` (accepts `me`); both
  profile screens show up to 4 chips (♛ #1 · 🐾 #4 …), only boards where
  the person is top-100, best first, gold for top-3, zero-score boards
  omitted.
- **Court-value block removed** from under the Chats button; **age
  removed** from beside the name (still in Details).
- **Woof / follow / gift / court tiles are smaller** — no forced square,
  tighter type.
- **Block & unblock** — a Block row (with confirmation) at the bottom of
  every profile; `/v1/users/:id` now returns `i_blocked` and still
  resolves for people *you* blocked, so the profile shows a proper
  "you blocked this person" state with an Unblock button. Settings'
  blocked list already worked and still does.

### Comments
Every comment now shows the author's profile photo and @handle; photo
and name both open the profile (`author_avatar_media_id` added to the
comments endpoint).

### Chat
- **Always current** — polling refetches the whole latest window instead
  of only messages after a cursor, so reactions, edits and deletes from
  the other person appear within ~2.5 s without leaving the chat.
- The action/emoji panel opens anchored to the top (from round 2's
  sheet change), so it can't render below the fold.

### Stories
- Uploads were never capped server-side — post as many as you like; the
  viewer already plays an author's stories in sequence with segment
  bars.
- **Tap-to-pass now works with a mouse** (Telegram Desktop): click
  right/left thirds to advance/rewind; touch devices are unaffected
  (click echoes of touches are suppressed; header/footer/viewer-sheet
  clicks don't navigate).

### Photos
- **Crop the primary photo** — ✂️ on the primary opens a drag + zoom
  editor with a circular mask previewing exactly what the avatar shows;
  saving re-uploads the cropped square, makes it primary, and removes
  the old one only after success.
- Private photos: verified end-to-end (upload → 🔒 toggle → grant via
  the chat lock → visible only to granted viewers, enforced in SQL).

### Admin
- **Reset someone's rank statistics** — `POST
  /v1/admin/users/:id/reset-stats` (manage_coins permission).
  Non-destructive: a `stats_reset_at` watermark (migration 010) makes
  every board and counter ignore earlier events, and court value
  returns to 1; nothing of other people's activity is deleted. Two-tap
  arm/confirm chip in the Users pane; action is audited.
- **Verification selfies open full-size** on tap.
- **Pane tabs centred** and evenly spread (fixes the verification tabs
  alignment).

### Navigation & layout
- The **+ tab is rebuilt with the same icon-above-label anatomy** as the
  other six tabs — all seven now sit on the same two lines; a small
  gradient pill marks it as Create.
- **Pressing + opens the composer centred** on screen (new `center`
  variant of the sheet).
