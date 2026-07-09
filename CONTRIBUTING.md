# Contributing to Ghostddit

Start with [ARCHITECTURE](ARCHITECTURE.md) if the layout feels unfamiliar. This guide covers the practical workflow for running the extension locally and preparing a change.

## 1. Get it running locally

This repo uses a plain Manifest V3 extension with no build step.

1. Clone or fork the repository.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Enable Developer mode.
4. Click Load unpacked and select the repository root.
5. For Firefox, load manifest.firefox.json from the repo root through about:debugging.
6. Visit a Reddit profile page and confirm the Ghostddit icon appears.

## 2. The edit → reload → test loop

- After editing any file, refresh the extension from the browser's extensions page.
- If you changed the content script or styles, refresh the Reddit tab itself as well.
- If you changed the manifest, do a full extension reload rather than only reloading the tab.

A good test case is a Reddit profile whose feed shows the empty-state message that Ghostddit targets. Any public profile with hidden or limited history is useful.

## 3. Before you touch code

Skim [ARCHITECTURE](ARCHITECTURE.md) first. The split modules in content/ and background/ are intentionally organized, and the file names in that guide are the best starting point for most changes.

## 4. Making the change

- Match the existing style. The extension uses 4-space indentation, semicolons, and camelCase names.
- Keep changes focused. Avoid introducing build tooling or new dependencies unless there is a strong reason.
- Comment the non-obvious parts rather than every line. Prefer short notes that explain the reason for a decision.
- Respect the generation guard in the content-script orchestration. If you add async work, make sure it does not act on stale state after the user has navigated away.
- Keep host permissions minimal. If a change needs a new domain, call that out clearly in the PR description.

## 5. Testing your change

There is no automated test suite. Test manually in a real Reddit tab.

Before opening a PR, confirm that:

- The change works on a profile that shows the hidden-profile empty state.
- It does not break a normal profile that already renders content natively.
- Posts and comments still load and paginate correctly if you touched those flows.
- The popup still renders the cached state and can trigger a manual update check.
- There are no new errors in the extension service worker console or the page console.

## 6. Opening a PR

1. Create a branch from main with a descriptive name.
2. Keep the PR focused on one feature or fix.
3. Summarize what changed and what you tested.
4. Call out any manifest permission changes explicitly.

## 7. Reporting bugs or proposing features

Open an issue with:

- what you expected versus what happened
- the profile URL or tab/sort you were using, if relevant
- any console output from the background worker or page

## Where to go if you are stuck

Re-read the relevant part of [ARCHITECTURE](ARCHITECTURE.md). Most questions about why the code is structured a certain way are covered there.