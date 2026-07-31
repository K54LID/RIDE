# Round 5 — 2026-07-31

Everything below came from `UPDATE.docx`. All twenty items are addressed.
Both apps pass `tsc --noEmit`; the web app also passes the hook-order
check. **The Vite production build could not be run here** — this
sandbox has no network and the uploaded `node_modules` is missing
rollup's native binary, so `vite build` dies before it starts. Nothing
in this round touches the build config, but run `npm run build` once
before pushing.

---

## The three bugs behind six of the complaints

Several items on the list were one fault wearing different clothes.

### 1. `document.body.style.overflow` — "the screen freezes until I refresh"

`Sheet` and `Page` each did this:

```js
const prev = document.body.style.overflow;
document.body.style.overflow = 'hidden';
return () => { document.body.style.overflow = prev; };
```

Correct for one overlay. Wrong for two. When a sheet opened over a page,
the inner one captured `prev = 'hidden'` and restored *that* on the way
out — so the body stayed locked with every overlay closed. Taps landed,
nothing scrolled, and only a reload cleared it.

`lib/scrollLock.ts` replaces it with a counter: the first lock records
the real value, the last release restores it, double-release is a no-op.
No ordering of overlays can leave the app stuck.

### 2. `tg.backButton` — the vanishing back arrow, and the navigation dead end

Telegram's `BackButton.onClick` is *additive*: every registered callback
fires on one press. Every overlay registered its own and every cleanup
called `hide()` unconditionally. Two consequences:

- With a profile over a follower list over a profile, one back press
  closed all three.
- Closing an inner overlay hid the button for the screen still
  underneath — which is exactly why **the back button disappeared from
  Settings** after opening and closing the blocked list.

`tg.ts` now keeps a handler stack and binds a single dispatcher to
Telegram for the life of the app. Only the top handler runs; visibility
follows the stack.

### 3. Single-slot overlays — "it should take the user to any profile, no restrictions"

`App` held `viewingUser`, `viewingPost` and `followList` as one slot
each. Opening someone from a follower list *replaced* the person already
there, and tapping their followers replaced the list rendered
underneath — so the second list opened *behind* the profile covering it,
and the app looked like it refused to go deeper.

Overlays are a stack now. Followers → profile → followers → profile
works to any depth; each frame closes back to exactly what was beneath
it, keeping its scroll position and loaded data.

### 1b. No timeout on the upload — the other half of the freeze

`uploadToTelegram` called `fetch` with no deadline, and the client's
upload XHR had no `timeout` either. `fetch` does not time out on its
own, so a stalled connection to Telegram left the request open
indefinitely: the XHR never completed, `media.uploading` stayed true,
Publish stayed disabled, and the compose sheet sat there looking frozen
with no error and no way out but reloading the app. That it only ever
happened when posting a photo or video is exactly what you'd expect —
it is the only path with an upload in it.

The server now aborts at 60s (15s for `getFile`) and returns a 502 the
client can show. The client aborts at 90s and surfaces "Upload timed
out. Check your connection and try again." Both ends fail loudly instead
of hanging.

Also added: an `ErrorBoundary` at the root. A render that throws used to
unmount the whole tree, leaving a black webview with no address bar and
no pull-to-refresh — indistinguishable from a freeze. Now it shows a
Reload button. This is a safety net, not a fix for any specific crash.

---

## Photos and albums

**Delete moved to the top, beside the exit** — the story viewer's
pattern, which is what you asked it to match. `lightbox-bar` at the
bottom of the screen is gone; `lightbox-top` holds a trash icon and the
✕ together, with the confirm step expanding in place.

**The private album is now a cell of the photo strip.** It was a
separate `.album-tile` in a flex wrapper beside the strip, and it never
lined up: `.pstrip` carries a 12px top margin and the tile did not, and
the wrapper's `> .photos { flex: 1 }` targeted a class the carousel
never rendered. Same square, same radius, same baseline now, on both
your own profile and everyone else's.

**The duplicate lock is gone.** Inside the album sheet the heading
already says 🔒 Private album, so a lock badge on every thumbnail said
it twice. `hideLocks` suppresses them there and keeps them on mixed
strips where they still mean something.

---

## Registration

- **Back and Skip** under every optional step. Skip submits what exists
  and lets them finish from Edit profile later — it is not offered on
  step 1, because a name, an age and a handle are the minimum an account
  can exist with.
- **Username checked against the database as they type**, in
  registration *and* in Edit profile — changing your handle later hit
  the same wall from the other side, learning it was taken only after
  pressing Save. Your own current handle always reads as free, so
  editing your bio doesn't flag your own name. New endpoint
  `GET /v1/handles/available`, debounced 400ms, guarded by a sequence
  number so a slow response for an old handle can't overwrite a newer
  verdict. The field says *"That username is not available — try another
  one"* while they are still on the field, instead of after four steps
  and a bounce back to step 1. The unique index remains the guarantee;
  this is the courtesy. Note the check is case-insensitive while the
  index is not — deliberate, since two handles differing only in case
  are a phishing surface.
- **Already-selected chips deselect.** `ChipPick` had radio semantics
  with no way back to "no answer", in registration *and* in filters.
  Tapping the active chip now clears it. The sort chip opts out via
  `required` — it must always hold a value.

---

## Support, bugs, and the legal pages

Both support buttons opened `https://t.me/` — Telegram's home page.
Whatever anyone typed went nowhere, so the app has been shipping with no
way to reach its operator.

- `db/migrations/014_support_messages.sql` — a table, separate from
  `reports` (a report is about a subject and carries moderation
  semantics; this is a person writing a sentence).
- `POST /v1/support` stores the message **and** pushes it to every staff
  account through the existing notification outbox, carrying the
  sender's handle and the text — so an admin can read it without opening
  the panel. Three open messages per kind per person, so a stuck send
  button can't bury the queue.
- Support messages and verification requests **ignore the recipient's
  notification toggles**. They only ever go to staff, and a moderator
  who muted "woofs" would otherwise silently stop receiving them with
  nobody finding out until a queue had sat unread for a week.
- **Admin panel** has a Support pane listing open messages with sender,
  kind, timestamp and full text, and a Mark handled button.
- **Terms and privacy policy** render in-app (`screens/Legal.tsx`).
  Both links previously pointed at `ridethatbot.fun/terms` and
  `/privacy`, which do not exist. Written to match what the app actually
  does — the 500m location grid, what is never collected, what block and
  ghost mode really do, coins having no cash value, the 18+ rule. English
  only and deliberately so: machine-translating a document people are
  held to is worse than presenting one language and meaning it.
  **Have a lawyer read it against your jurisdictions before launch** —
  it is a plain-language starting point, not legal advice.

---

## Ranks

The periods were rolling windows (`now() - 7 days`), so a countdown to a
reset would have been a lie — nothing ever hit zero, a woof from last
Tuesday just quietly stopped counting this Tuesday.

Boards are **calendar buckets in UTC** now: today starts at midnight,
the week on Monday, the month on the 1st. `/v1/leaderboard` returns
`resets_at`, and Ranks shows a countdown that ticks once a minute and
reloads the board when it crosses. All time says *"All-time standings
never reset"*, because an absent timer otherwise reads as a bug.

---

## Courting

- **The courted person keeps half.** `Math.floor(cost / 2)` credited in
  the same transaction as the debit, with a new `court_payout` ledger
  reason (enum value added in migration 014). Being courted was the one
  thing that happened *to* you rather than because you spent anything,
  and it paid nothing — which made the mechanic read as a tax on being
  popular.
- **"your value is now undefined" can't happen again.** The payload has
  carried `value_after` since courting shipped, so what you saw came
  from an older deploy — but the message is now built so a missing
  number produces a *shorter sentence* rather than the word `undefined`:
  "♛ Khalid courted you — your value is now 8 coins and 4 coins went to
  your balance", degrading to "♛ Khalid courted you" if either number is
  absent.

---

## Everything else

- **Block is red.** New `--danger` token (`#F4453D`) — `--pulse` is the
  brand pink and reads as an accent, not a warning. After blocking, a
  sheet says they were added to your blocked list, that they can't
  message you or see what you post, and where to undo it. The server
  already enforced all of that across feed, chat, discover, stories,
  posts and albums; it just never said so.
- **Wallet button carries the balance** and opens the wallet page. An
  icon alone gave no reason to tap it.
- **Sharing sends the bot link — from all four places it happens.**
  `lib/botIdentity.ts` asks Telegram `getMe` once and caches the
  username, rather than adding another env var to keep in step with the
  token. Sharing exists in the feed, in a single post, in the saved list
  and in the wallet, at three different depths and two of them inside
  the overlay stack, so the link is read from a module (`lib/appInfo`)
  set when `/v1/me` lands rather than threaded as a prop through every
  component in between. Post shares send `https://t.me/<bot>`; referral
  shares send it with the code in the `/start` payload, so an invite
  arrives with the code attached instead of asking someone to retype
  seven characters. Falls back to `MINI_APP_URL` if `getMe` fails.
- **No location, no empty grid.** `/v1/discover` returns `has_location`.
  Without a fix the Grid tab explains that it is sorted by distance,
  offers a Share my location button inline, and points at the 📍 button
  next to Filters for next time. Before, it just came back empty, which
  reads as "nobody is near you".

---

## Not done, deliberately

**The referral `/start` payload is carried but not yet claimed.** The
link now arrives at the bot with the code attached, but nothing reads it
on arrival: `referrals` is keyed by invitee account id and the account
does not exist at `/start` time, so honouring it needs a pending-invite
table keyed by Telegram id and a claim on first onboarding. That is its
own piece of work with its own abuse questions (self-referral across two
Telegram accounts, expiry). `POST /v1/referral/claim` still exists and
still has no UI calling it.

## Worth knowing

- Migration **014** must run before the first support message or court
  payout. `ALTER TYPE ... ADD VALUE` is fine inside a transaction on
  PG12+ as long as the value isn't used in the same transaction, and it
  isn't.
- `getMe` is called lazily on the first `/v1/me` after a restart. If the
  bot token is wrong, share links silently fall back to `MINI_APP_URL`
  rather than erroring — check a share link after deploying.
