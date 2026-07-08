# Contributing to Ghostddit

New here and the code feels like a lot at once? Start with `ARCHITECTURE.md`
in this repo — it explains how the pieces fit together. This doc is the
practical side: how to get it running locally and how to submit a change.

## 1. Get it running locally

No build step — this is a plain Manifest V3 extension.

1. Clone (or fork, then clone your fork) of the repo.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**, and select the repo's root folder (the one with
   `manifest.json` in it).
5. Visit any `reddit.com/user/<name>` profile — you should see Ghostddit's
   icon in the toolbar.

## 2. The edit → reload → test loop

- After editing **any** file, go to `chrome://extensions` and click the
  refresh icon on Ghostddit's card. This reloads `background.js` and
  `popup.js`/`popup.html`/`popup.css`.
- If you edited `content.js` or `content.css`, you also need to **refresh the
  Reddit tab itself** — content scripts only re-inject on page load, the
  extension reload alone won't touch an already-open tab.
- If you edited `manifest.json`, always do a full reload from
  `chrome://extensions`, not just a tab refresh.

A good way to find a test case: search Reddit for a profile whose feed shows
*"Welcome! u/USERNAME likes to keep their posts hidden, but check out their
stats to learn more about them."* — that empty state is what Ghostddit
targets. Any account with post history and a hidden/limited profile view
works.

## 3. Before you touch code

Skim `ARCHITECTURE.md`'s "Where to make common changes" table — there's a
decent chance the file/function you need is already listed there. It also
has a "things that look like bugs but are deliberate" section worth checking
before "fixing" something that's actually intentional (e.g. the icon
in-flight dedup, the generation-counter races).

## 4. Making the change

- **Match the existing style.** This codebase doesn't use a linter or
  formatter — consistency comes from reading the surrounding code. 4-space
  indent, semicolons, `camelCase` functions, comments that explain *why* over
  *what* (see the top of each file for the pattern).
- **No new dependencies without discussion.** No npm packages, no bundler.
  If a change genuinely needs one, open an issue to discuss it first rather
  than including it in a feature PR.
- **Comment the non-obvious, not the obvious.** The existing code tends to
  leave a short comment wherever the *reason* for a decision isn't visible
  from the code itself (e.g. why background.js does the fetching instead of
  content.js). Follow that pattern rather than commenting every line.
- **Respect `generation`.** If you add anything asynchronous in content.js
  (a fetch, a `setTimeout`, a `Promise`), make sure it checks its captured
  `generation` against the current one before touching the DOM. This is the
  single most common source of subtle bugs in this file — a slow response
  landing after the user has navigated away.
- **Keep host permissions minimal.** If your change needs a new domain in
  `host_permissions`, call that out explicitly in your PR description — it's
  a real trust boundary, not just a config line.

## 5. Testing your change

There's no automated test suite — testing is manual, in a real Reddit tab.
Before opening a PR, check:

- The change works on a profile with the hidden-post empty state.
- It doesn't break a *normal* profile (one that shows posts natively) —
  Ghostddit should stay completely inert there.
- Scrolling still loads more posts (if you touched anything in
  `loadMore`/pagination).
- The Comments tab still loads and paginates correctly if you changed
  comment parsing, `loadComments`, or the comments sentinel.
- Navigating between two different profiles without a full page reload still
  works correctly (Reddit is an SPA — this exercises the
  `pushState`/`replaceState` patch and the `generation` guard).
- No new errors in the background service worker's console
  (`chrome://extensions` → Ghostddit → "service worker" link) or the page
  console.
- The popup still shows the cached state correctly and can trigger a manual
  update check without breaking the background flow.

## 6. Opening a PR

1. Fork the repo and branch off `main` with a descriptive name.
2. Keep the PR focused — one feature or fix per PR is much easier to review
   than a bundle of unrelated changes.
3. In the description, say what you tested and how (see section 5). A
   before/after screenshot or short clip is genuinely useful for anything
   visual, since there's no automated UI test to point to instead.
4. If your change touches `manifest.json` permissions, call that out
   explicitly and explain why it's needed.

## 7. Reporting bugs / proposing features (without a PR)

Just as welcome as code. Open an issue and include:

- What you expected vs. what happened.
- The profile URL/tab/sort you were on, if relevant (no need to link a real
  profile if it's sensitive — describing the state, e.g. "Posts tab, sorted
  by Top → This Year," is usually enough).
- Anything from the background service worker's console if it looks
  relevant.

## Where to go if you're stuck

Re-read the relevant section of `ARCHITECTURE.md` first — most "why does
this code do it this way" questions are answered there. If it's genuinely
not covered, open an issue with your question; a gap in that doc is itself
useful to know about.