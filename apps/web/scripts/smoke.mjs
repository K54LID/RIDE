/**
 * Mounts the real production bundle in jsdom with a stubbed API and
 * asserts the app actually renders something.
 *
 * This exists because "typecheck passes" and "vite build succeeds" both
 * held true for a build that rendered nothing but its background
 * colour. A Rules-of-Hooks violation is invisible to both. The only
 * check that would have caught it is running the thing.
 *
 * Needs jsdom, which is deliberately NOT a dependency of this
 * workspace: it must never be able to affect the Docker image build.
 * CI installs it with `npm i --no-save jsdom` and runs this against the
 * built dist. Locally:
 *
 *   npm run build --workspace @ride/web
 *   npm i --no-save jsdom
 *   node apps/web/scripts/smoke.mjs apps/web/dist
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2];
const assets = join(DIST, 'assets');
const jsFile = readdirSync(assets).find((f) => f.endsWith('.js'));
const bundle = readFileSync(join(assets, jsFile), 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push(e.message + '\n' + (e.stack ?? '')));
virtualConsole.on('error', (...a) => errors.push(a.map(String).join(' ')));

const ME = {
  account_id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Khalid', handle: 'k54lid', bio: null, court_value: 2,
  gender: null, pronouns: null, orientation: null, relationship_status: null,
  body_type: null, looking_for: null, interests: null, languages: null,
  tribes: null, height_cm: null, weight_kg: null, birth_date: '1998-01-01',
  verification: 'approved', vip_until: null, coin_balance: 0,
  woofs_received: 1, followers: 1, following: 0, gifts_received: 1,
  avatar_media_id: null,
};

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole, url: 'https://app.ridethatbot.fun/' },
);

const { window } = dom;

// Every endpoint the first paint touches. Anything unlisted returns an
// empty object, which is enough to get past the initial render.
window.fetch = async (url) => {
  const u = String(url);
  const body =
    u.includes('/v1/me') ? ME
    : u.includes('/v1/feed') ? { posts: [], next_cursor: null }
    : u.includes('/v1/stories') ? { authors: [] }
    : u.includes('/v1/notifications') ? { unread: 0, items: [] }
    : {};
  return {
    ok: true, status: 200,
    json: async () => body,
    blob: async () => ({}),
    headers: { get: () => null },
  };
};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

try {
  window.eval(bundle);
} catch (err) {
  errors.push('THREW while evaluating bundle: ' + (err.stack ?? err.message));
}

// Let React flush effects and the state transition that follows the
// stubbed /v1/me — the blank-screen bug fired on exactly that second render.
await new Promise((r) => setTimeout(r, 700));

const root = window.document.getElementById('root');
const html = root ? root.innerHTML : '';
const text = root ? root.textContent.trim() : '';

console.log('root children :', root ? root.childElementCount : 'NO ROOT');
console.log('innerHTML len :', html.length);
console.log('visible text  :', JSON.stringify(text.slice(0, 120)));

const hookError = errors.find((e) => /Rendered (more|fewer) hooks|Should have a queue/i.test(e));
if (hookError) {
  console.error('\nHOOK ORDER ERROR:\n' + hookError.slice(0, 600));
  process.exit(1);
}
if (errors.length) {
  console.error('\nConsole errors captured:\n' + errors.join('\n---\n').slice(0, 1500));
}
if (!root || root.childElementCount === 0) {
  console.error('\nFAIL: #root is empty — this is the blank screen.');
  process.exit(1);
}

console.log('\nPASS: the app mounted and rendered content.');
