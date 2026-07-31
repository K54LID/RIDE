import Page from '../components/Page';
import { useT } from '../i18n';

/**
 * Terms of service and privacy policy.
 *
 * Both links used to point at ridethatbot.fun/terms and /privacy, which
 * are not pages that exist — so the app shipped with two dead links
 * where the legal basis for running it should be. These render in-app
 * instead: no network, no 404, readable offline.
 *
 * English only, deliberately. Machine-translating a document people are
 * held to is worse than presenting one language and meaning it. The
 * rest of the app is localised; this is not.
 *
 * This is a plain-language starting point written to match what the app
 * actually does — it is not legal advice, and anyone operating this at
 * scale should have a lawyer read it against the jurisdictions they
 * serve (GDPR/UK GDPR in particular, given an EU-facing audience).
 */

const UPDATED = '31 July 2026';

const TERMS: Array<[string, string[]]> = [
  ['1. Who this agreement is between', [
    'RIDE is a Telegram Mini App ("RIDE", "we", "us"). By opening RIDE and creating a profile you agree to these terms. If you do not agree, do not use the app.',
    'RIDE is operated independently. It is not affiliated with, endorsed by, or sponsored by Telegram.',
  ]],
  ['2. You must be 18 or over', [
    'RIDE is strictly for adults. You confirm you are at least 18 years old when you enter your date of birth during registration, and the app enforces this. Accounts found to belong to minors are removed without notice and without appeal.',
    'Do not use RIDE to contact, solicit, or share content involving anyone under 18. This is the one rule with no discretion behind it: suspected child sexual abuse material is removed, the account is banned permanently, and the matter is reported to the relevant authorities.',
  ]],
  ['3. Your account', [
    'Your account is tied to your Telegram account. You are responsible for what happens on it. Your handle is unique across RIDE and is how other people address you; we may reclaim handles that impersonate someone else.',
    'You may delete your account at any time from Settings. Deletion removes your profile, photos, location and Telegram link. Messages you already sent to other people remain in their conversations, and moderation records are kept as long as we need them.',
  ]],
  ['4. What you may not do', [
    'No content involving minors, sexual or otherwise, of any kind.',
    'No harassment, threats, hate speech, or targeting people for who they are. RIDE serves a community that receives plenty of that elsewhere.',
    'No impersonation, no photos of other people presented as your own, no catfishing.',
    'No sex work advertising, drug sales, weapons, scams, phishing, malware, or spam.',
    'No sharing of another person\u2019s private information, photos, or messages without their consent \u2014 including screenshots of chats and anything from someone\u2019s private album.',
    'No automated access, scraping, or attempts to bypass the app\u2019s limits, rate limits, or moderation.',
    'No non-consensual intimate imagery, and no recording or redistributing content from RIDE anywhere else.',
  ]],
  ['5. Content you post', [
    'You keep ownership of your photos, videos, and text. You grant RIDE a limited licence to store, process, resize, and display them inside the app so that it can function \u2014 nothing more. We do not sell your content and we do not use it in advertising.',
    'You are responsible for having the right to post what you post.',
    'Private albums are visible only to people you unlock them for. We enforce that in the app, but we cannot stop a person you unlocked from taking a screenshot. Share accordingly.',
  ]],
  ['6. Coins, Stars, and purchases', [
    'Coins are an in-app balance with no cash value. They are bought with Telegram Stars and are not redeemable, transferable outside RIDE, or refundable in money.',
    'Coins are spent on gifts, courting, featured slots and similar features. Once spent, they are gone \u2014 a court that was paid for is not refunded because the outcome disappointed you.',
    'Being courted credits you half of what the courter paid. Prices, rewards and the split may change; changes apply going forward, never retroactively to coins already spent.',
    'Star payments are processed by Telegram under Telegram\u2019s terms. Refund requests for Star purchases go through Telegram.',
  ]],
  ['7. Moderation', [
    'We may remove content, restrict features, suspend, or ban an account that breaks these terms. Serious violations are actioned immediately and without warning.',
    'Reports and support messages are read by staff. Sending deliberately false reports is itself a violation.',
  ]],
  ['8. Availability and liability', [
    'RIDE is provided as-is. We do not guarantee it will be available, uninterrupted, or free of errors, and we may change or discontinue features.',
    'We are not responsible for what other users do. Meeting people from the internet carries risk: meet in public first, tell someone where you are going, and trust your judgement over anyone\u2019s profile.',
    'To the extent the law allows, our liability to you is limited to the amount you spent in the app in the three months before the claim.',
  ]],
  ['9. Changes', [
    `These terms may change. The date at the top is the version in force. Continuing to use RIDE after a change means you accept it. Last updated: ${UPDATED}.`,
  ]],
];

const PRIVACY: Array<[string, string[]]> = [
  ['What we collect', [
    'Profile information you enter: display name, handle, date of birth, and anything optional you choose to add \u2014 bio, gender, pronouns, orientation, relationship status, what you are looking for, languages, interests, tribes, height and weight.',
    'Content you create: posts, stories, comments, photos, videos, and chat messages.',
    'Activity needed to run the app: woofs, follows, likes, gifts, courts, coin ledger entries, blocks, reports, and when you were last active.',
    'A Telegram identifier and language code, so the app knows which account is which and the bot can send you notifications.',
    'An approximate location, only if you share one.',
  ]],
  ['What we deliberately do not collect', [
    'We do not store your Telegram username or phone number.',
    'We do not store exact coordinates. A shared location is snapped to a grid of roughly 500 metres before it is written down, and other people are only ever shown a distance range \u2014 never a number of metres, never a point on a map.',
    'We do not collect health data, and nothing in your profile is treated as such.',
    'We do not run third-party advertising or analytics trackers inside the app.',
  ]],
  ['Who can see what', [
    'Your profile, public photos, and public posts are visible to other signed-in members, subject to your visibility settings.',
    'Private album photos are visible only to people you have unlocked them for in chat.',
    'Ghost mode keeps you off the leaderboards and out of discovery.',
    'Blocking is mutual and immediate: a blocked person cannot message you, cannot see what you post, and disappears from your feed and discovery as you do from theirs.',
    'Chat messages are visible to you and the person you are talking to. They are stored on our server so they can be delivered; they are not end-to-end encrypted, and staff can access them when investigating a report.',
  ]],
  ['Why we are allowed to hold it', [
    'To provide the app you asked to use (contract), to keep it safe and lawful (legitimate interests and legal obligation), and \u2014 for the optional things like location and sensitive profile fields \u2014 because you chose to give them to us (consent). You can withdraw that consent by removing the information or by sending /stoplocation to the bot.',
  ]],
  ['How long we keep it', [
    'Profile and content: until you delete them or delete your account.',
    'Location: until you replace it or send /stoplocation to the bot, which deletes it.',
    'Coin ledger entries: retained after account deletion, without your profile attached, because a financial record has to balance.',
    'Moderation records and bans: retained as long as needed to keep the app safe.',
  ]],
  ['Your rights', [
    'You can see and edit your profile data in the app at any time, and delete your account from Settings.',
    'Depending on where you live you may also have the right to a copy of your data, to correct it, to have it erased, to restrict or object to processing, and to complain to your local data protection authority.',
    'To make any of these requests, use Contact support in Settings.',
  ]],
  ['Where it lives', [
    'Data is stored on servers in Europe. Uploaded media is held in Telegram\u2019s own infrastructure through the bot, and push notifications are delivered by Telegram, which processes them under its own privacy policy.',
  ]],
  ['Security', [
    'Traffic is encrypted in transit. Every request is authenticated against Telegram\u2019s signed launch data, so there is no password to steal. Access to production data is limited to people who need it. No system is perfectly secure, and we will tell affected users about a breach that puts them at risk.',
  ]],
  ['Contact', [
    `Questions about any of this go through Contact support in Settings. Last updated: ${UPDATED}.`,
  ]],
];

export default function Legal({ kind, onClose }: {
  kind: 'terms' | 'privacy';
  onClose: () => void;
}) {
  const t = useT();
  const sections = kind === 'terms' ? TERMS : PRIVACY;

  return (
    <Page title={t(kind === 'terms' ? 'settings.terms' : 'settings.privacyPolicy')}
          onClose={onClose}>
      <p className="hint" style={{ marginBottom: 18 }}>Last updated {UPDATED}</p>
      {sections.map(([heading, paragraphs]) => (
        <section key={heading} style={{ marginBottom: 22 }}>
          <h2 style={{ marginBottom: 8, fontSize: '1rem' }}>{heading}</h2>
          {paragraphs.map((text) => (
            <p key={text.slice(0, 40)} style={{ marginBottom: 8, fontSize: '0.87rem' }}>
              {text}
            </p>
          ))}
        </section>
      ))}
    </Page>
  );
}
