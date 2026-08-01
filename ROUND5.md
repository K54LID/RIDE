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

---

## Verification pass (separate session, same day)

ROUND5 shipped with the note that **the Vite production build could not
be run** in the sandbox that wrote it. That is the exact failure mode
that silently broke two earlier deploys — a build error means Coolify
publishes nothing and keeps serving the old image, which looks
identical to a deploy that changed nothing. So it was run here.

All green, on this tree, unmodified:

| check | result |
|---|---|
| `npm ci` from the committed lockfile | clean |
| hook-order guard | passed |
| `tsc --noEmit`, both workspaces | no errors |
| `vite build` | 76 modules, 488 kB / 140 kB gzip |
| jsdom smoke test against that `dist` | mounts and renders |
| `apps/web/Dockerfile` replayed line for line | build succeeds |
| `apps/api` build + migrations bundled into image | present |
| all 14 migrations on Postgres 16 + PostGIS | apply in order |

**Migration 014 was re-tested the way it actually runs.** `psql -f` is
autocommit, but `migrate.ts` wraps each file in one transaction, and
`ALTER TYPE ... ADD VALUE` is precisely the statement that behaves
differently there. Re-run inside an explicit `BEGIN`/`COMMIT` against a
database already migrated through 013: `CREATE TABLE`, `CREATE INDEX`,
`ALTER TYPE`, `COMMIT` — and `court_payout` is present in `pg_enum`
afterwards. The reasoning in the migration header holds.

Every item on the list was spot-checked in source, not assumed from the
changelog. All twenty present.

### Two notes, neither blocking

- `RankChips.tsx` and `CourtCrest.tsx` are back in the tree. Both were
  deleted earlier — the rank-chip strip because it duplicated the
  written standings, the court-value panel because it was asked to go.
  **Neither is imported by anything**; `RankStandings` is still what
  both profiles render. They are orphan files, so nothing regressed, but
  they will confuse the next person to read the directory.
- `GET /v1/handles/available` is unauthenticated in the usual sense —
  correctly, since a person onboarding has no account yet — but it does
  call `app.verifyTma(req)`, so it is gated behind a valid Telegram
  signature rather than open to the internet. That is the right call:
  without it the endpoint would let anyone enumerate which handles exist.

---

# Round 6 — courting lifecycle, deletion, FAQ, Farsi

## Courting now expires

Court value was permanent: pay once, sit at the top forever. It is a
standing you keep now.

- Migration `015_court_expiry.sql` adds `courtships.expires_at`.
- Every court sets `expires_at = now() + 30 days`, so courting again
  genuinely resets the clock rather than extending from the first court.
- `lib/courtExpiry.ts` sweeps every 5 minutes and once at boot. Lapsed
  courtships zero the person's court value and are deleted.

**A bug this caught before shipping.** The first version logged expiries
into `court_events`. That table has `courter_id NOT NULL` and
`CHECK (courter_id <> target_id)` — it models "X courted Y", and an
expiry has no X. Every sweep would have thrown and rolled back, so court
value would never have decayed at all. Expiries now go to their own
`court_expiries` table.

Verified against Postgres: a 31-day-old courtship zeroes and logs its
old value of 64; one with 12 days left is untouched at 8.

Court value is also **All time only** on the leaderboard now — periods
make no sense for a live standing that expires — and your own profile
shows who is courting you and how many days remain before it hits zero.

## Account deletion actually deletes

It was a soft delete: status flipped, display name overwritten, and the
profile, photos, posts, comments and messages all stayed. That is
hiding, not deleting.

Now a hard delete. Four tables (`moderation_actions`,
`moderator_permissions`, `verification_requests`, `reports`) have
`NO ACTION` foreign keys and would have aborted the whole transaction,
so they are cleared first; everything else cascades from `accounts`.
Verified with a fully populated account: profile, posts, follows, coins,
blocks and reports all return zero rows.

## FAQ and a courting explainer

`Settings → How RIDE works`: 17 entries covering what RIDE is, username
vs display name, woofs, courting, cost and payout, coins, gifts, the
boards, Grid vs Global, location and the 500 m grid-snap, private
albums, stories, verification, ghost mode, blocking, reporting and
deletion. Accordion, because 17 answers in a column is something people
scroll past.

Courting also has its own "How courting works" tap under the action
tiles — it costs real coins and is the least self-explanatory thing on
the screen.

## Video posters

Two independent causes, both fixed:

- Bot API 7.0 renamed `thumb` to `thumbnail`. The code read only the new
  name, so depending on which Telegram server answered, the thumbnail
  was silently dropped. Both are read now.
- Telegram does not always return one at all. The client now captures
  its own frame (~1 s in, to avoid the black first frame of a phone
  recording), sends it with the upload, and the server uses it **only**
  if Telegram returned nothing.

## Everything else

- **Display name above the bio** on both profiles. It had been removed
  from your own as a "duplicate" of the username — it is not: `@k54lid`
  is how people address you, "Khalid" is what you are called.
- **"Handle" → "Username"** in every locale and the onboarding form.
- **Farsi**, registered and marked RTL alongside Arabic. Cloned from
  English with the high-traffic strings translated, so a missing key is
  impossible; the long-tail falls back to readable English rather than a
  blank. Worth a native pass before leaning on it.
- **Alerts lead with the sender's photo**, kind-glyph as a badge.
- **Grid with no location is now the whole tab** rather than a banner
  above an empty grid, and says the 📍 button next to Filters updates it
  later.
- **Private album verified end to end** — no grant: 1 photo; unlocked
  in chat: 2; locked again: 1.
- **Block/unblock failures now surface an error.** Silent failure was
  indistinguishable from a dead button.
- **Photo tools centred** over the image instead of overlapping in the
  corner.
- **Share text** is now `Check out @user 's post on <bot link>` with a
  real `?start=` link.

## Verified before packaging

typecheck · hook guard · web build · **web Dockerfile replayed line for
line** · API build · jsdom smoke test (mounts and renders) · all 15
migrations on Postgres 16 + PostGIS · court expiry, hard delete and
album grant/revoke each exercised against a real database.

---

# Round 7

## Two bugs that made buttons look dead

**Block did nothing.** Both `Sheet` and `Page` portal to `document.body`,
so a confirm sheet is a *sibling* of a full-screen page, not a child.
`.page` is z-index 150 and `.sheet` was 101 — every confirm opened from
a profile, the follow list or a settings page rendered **behind** the
page that opened it. The endpoint was always fine. Sheets are 300/301
now; the lightbox and crop editor moved to 310/320 so the private album
(which opens inside a sheet) can still open a photo above it.

**Daily streak never counted.** `last_claim_on` is a Postgres `date`,
and postgres.js decodes dates as JavaScript `Date` objects — never
strings. Every comparison was `row.last_claim_on === '2026-08-01'`,
a Date-vs-string test that is always false. So "claimed today" never
registered and the streak reset to 1 every day. Dates are normalised
through one helper now.

## Court value floors at 2

Lapsing to 0 would have broken the economy: a court costs double the
current value, so 0 makes every future court free. Lapsed values now
return to 2, the starting value, and the leaderboard lists
`court_value > 2` so anyone lapsed drops off it. Verified: a 31-day-old
courtship falls to 2 and leaves the board while a live one at 8 stays.

The FAQ, the leaderboard explainer and the court explainer all say "back
to 2" rather than "to zero".

## Followers count vs list

"3 followers" opening onto one person: the count counted every `follows`
row while the list filtered to active, non-ghosted, non-blocked people.
Both use the same rules now.

## Video

**Telegram was re-encoding every upload.** `sendVideo` hands the file to
Telegram's transcoder, which re-encodes and may rescale — the changed
sizes in the storage channel. Video now goes through `sendDocument`,
which stores bytes exactly as given, with the client-captured frame
attached as the document thumbnail. Photos still use `sendPhoto`
deliberately: its size ladder is what the avatars and grid tiles rely on.

**Playback failed on anything over 20 MB.** The upload cap was 45 MB but
the Bot API refuses to *download* files above 20 MB, so a 30 MB clip
uploaded fine, appeared in the channel, and could never be played back.
The cap is 19 MB now, rejected at upload with a clear reason, and a
failed load says "Video unavailable" instead of spinning. Clips already
uploaded above that size cannot be recovered — they must be re-uploaded.

## Layout

- The location note was printed twice; the duplicate under the button is
  gone.
- "How courting works" moved under the courted-by panel on both
  profiles, and courted-by is now tappable on your own profile too.
- Block matches the Chat button exactly — same padding, radius, size and
  weight, differing only in colour.
- Photo tools moved from floating discs over the image to a row beneath
  it. Overlaid, they covered the subject's face, so you could not see
  what you were about to crop or delete.
