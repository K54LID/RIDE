#!/usr/bin/env node
/**
 * Fails the build when a React hook is declared below a conditional
 * early return inside a component.
 *
 * Why this exists: App.tsx once had `useState` for the follow-list
 * overlay declared beside the JSX it fed, which was below three early
 * returns (loading / error / onboarding). React counts hooks per
 * render. On the first render the component returned at `loading` and
 * the hook was never reached; when phase flipped to `ready` the hook
 * ran, the count changed, and React tore the whole tree down. The app
 * rendered nothing but its background colour.
 *
 * TypeScript cannot see this — the code is perfectly well-typed — and
 * both `tsc --noEmit` and `vite build` passed while shipping it. So it
 * needs its own check.
 *
 * Lives inside apps/web deliberately: it is referenced by this
 * workspace's build script, and anything the build touches must be
 * inside the directory the Dockerfile copies. A previous version sat at
 * the repo root, was not copied into the web image, and failed the
 * Docker build — which meant no new image was published and the old
 * broken one kept being served.
 *
 * The real tool for this is eslint-plugin-react-hooks. This is a
 * dependency-free stand-in that catches the specific shape that broke
 * us, and it deliberately errs toward silence: it only flags a hook
 * that appears after a `return` which is itself inside an `if` block at
 * component-body indentation. Nested helper components and callbacks
 * are ignored.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

const HOOK = /^\s{2}(?:const\s+\[?[\w\s,{}]*\]?\s*=\s*)?(useState|useEffect|useCallback|useMemo|useRef|useReducer|useContext|useLayoutEffect)\s*[(<]/;
const IF_OPEN = /^\s{2}if\s*\(.*\)\s*\{\s*$/;
const RETURN_AT_BODY = /^\s{4}return\b/;
const CLOSE = /^\s{2}\}\s*$/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) yield path;
  }
}

const problems = [];

for await (const file of walk(ROOT)) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  let earlyReturn = null;
  let inIf = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (IF_OPEN.test(line)) inIf = true;
    else if (CLOSE.test(line)) inIf = false;

    if (inIf && RETURN_AT_BODY.test(line) && earlyReturn === null) {
      earlyReturn = i + 1;
    }

    if (earlyReturn !== null && HOOK.test(line)) {
      problems.push(
        `${relative(process.cwd(), file)}:${i + 1}\n` +
        `    ${line.trim()}\n` +
        `  is a hook declared after the early return on line ${earlyReturn}.\n` +
        `  Move it up with the other hooks, above every conditional return.`,
      );
      break;
    }
  }
}

if (problems.length > 0) {
  console.error('\nHook-order check failed:\n');
  console.error(problems.join('\n\n'));
  console.error(
    '\nReact counts hooks per render. A hook below a conditional return is\n' +
    'skipped on some renders and called on others; when the count changes\n' +
    'React unmounts the tree and the screen goes blank.\n',
  );
  process.exit(1);
}

console.log('Hook-order check passed.');
