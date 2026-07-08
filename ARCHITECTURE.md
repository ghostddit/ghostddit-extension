# Ghostddit architecture

This doc explains how the extension is put together, so you can find your way
around before making a change. It assumes you've read the README but haven't
necessarily read the code yet.

## The big idea in one paragraph

Ghostddit runs a content script on every `reddit.com` profile page. When it
spots Reddit's "this user likes to keep their posts hidden" empty state, it
asks the background service worker to fetch that user's posts from Reddit's
public search API instead, then injects the results as native-looking cards
right where the empty state was. A separate, unrelated feature — checking
GitHub Releases for a newer version, since this extension isn't on the Chrome
Web Store — lives in the same background worker and reports into both the
toolbar popup and an on-page banner.

Two mostly-independent features, one file layout. Keep that separation in
mind: "reveal hidden posts & comments" and "check for updates" barely touch each other.

## The files, and what each one owns

```
manifest.json     Wiring: permissions, which script runs where
background.js     Service worker — the only code allowed to call Reddit/GitHub APIs
content.js        Runs on reddit.com — detects the empty state, renders cards
content.css       Styles for the injected panel + update banner
popup.html/js/css The toolbar popup — shows version + update status
```

Nothing else has moving parts. `LICENSE` and `README.md` are exactly what
they sound like.

## Why background.js exists (and why content.js can't just fetch directly)

`api.reddit.com` doesn't send CORS headers permissive enough for a
page-context `fetch()` running on `www.reddit.com`. The background service
worker runs in a privileged extension context that isn't subject to the same
CORS restriction, so it does the actual network calls and hands the result
back to the content script over `chrome.runtime.sendMessage`. This is the
single biggest reason the codebase is split the way it is — if you're ever
wondering "why doesn't content.js just fetch this itself", this is why.

The same pattern is reused for the GitHub Releases check, for consistency,
even though GitHub's CORS is less strict.

## Message passing: the contract between content.js and background.js

`content.js` never touches the network. It sends one of these messages and
waits for a response:

| Message type                         | Sent by      | Background does                                   | Response shape                           |
|--------------------------------------|--------------|---------------------------------------------------|------------------------------------------|
| `GHOSTDDIT_FETCH_POSTS`              | content.js   | `GET /search?q=author:"<user>"` on api.reddit.com | `{ ok, posts, after }`                   |
| `GHOSTDDIT_FETCH_SUBREDDIT_ICON`     | content.js   | `GET /r/<sub>/about` on api.reddit.com            | `{ ok, subreddit, icon }`                |
| `GHOSTDDIT_CHECK_UPDATE_NOW`         | popup.js     | Re-runs the GitHub release check immediately      | `{ ok, info }`                           |

All three handlers in `background.js` return `true` from the
`onMessage` listener to keep the message channel open for the async
`sendResponse` — that's a Chrome extension requirement, not a stylistic
choice. If you add a new message type, don't forget that `return true`.

## content.js: the part that does the most

This is the file most contributions will touch. Read it in this order rather
than top to bottom:

1. **Context detection** — `parseProfileContext()` reads the URL
   (`/user/<name>/submitted`, `?sort=top&t=week`, etc.) into a plain object.
   `contextKey()` turns that into a string so the code can tell "same profile
   view as before" apart from "user navigated somewhere new."

2. **The trigger** — `findEmptyFeedContent()` looks for
   `shreddit-feed #empty-feed-content` in the DOM. That element existing is
   the *only* signal Ghostddit acts on. If Reddit ever renames it, this is
   the line that breaks.

3. **`tryInject()`** — the orchestrator. Called on every relevant DOM
   mutation and every SPA navigation (see below). It decides: is this a
   Reddit profile page? Is the empty state showing? Is it the *same* context
   we already handled, or a new one that needs a fresh fetch? It's
   deliberately defensive because it gets called constantly.

4. **`loadMore()` / `loadComments()`** — fetches one page of posts or
   comments and appends them. Guards against races with a `generation`
   counter: every time `tryInject()` starts tracking a new profile/tab/sort,
   it bumps `generation`. Any in-flight fetch checks its captured generation
   against the current one before touching the DOM, so a slow response for a
   profile you've since navigated away from can't render into the wrong panel.
   The Comments tab uses a separate cursor-based flow via
   `setupCommentsSentinel()` and `loadComments()`.

5. **Rendering** — `postCardHtml()`, `renderPosts()`, the gallery carousel
   (`setupGalleryCard`), and the tiny hand-rolled Markdown renderer
   (`mdToHtml`/`inlineMd`) for post selftext. This is the least architecturally
   interesting part — it's mostly string templating and DOM wiring — but it's
   where most "make X look right" contributions will land.

6. **SPA navigation plumbing** — Reddit never does a full page load when you
   click between profiles, so there's no native event for "the user
   navigated." The code patches `history.pushState`/`replaceState` to fire a
   custom `ghostddit:locationchange` event, and also runs a `MutationObserver`
   on `document.documentElement` as a catch-all, since Reddit's own re-renders
   can make/remove the empty-state element without a navigation ever
   happening. Both paths funnel back into `tryInject()`.

7. **Extension lifecycle** — `isExtensionContextValid()` /
   `handleInvalidContext()`. If the extension is reloaded while a Reddit tab
   is still open, `chrome.runtime.id` disappears and any further
   `sendMessage` call throws. Rather than let that throw uncaught, the code
   checks for it up front and shows a "refresh this page" notice instead.

## background.js: two unrelated jobs sharing a file

**Job 1 — post/icon fetching.** Stateless request/response, described in the
message table above.

**Job 2 — update checking.** On install and on a twice-daily `chrome.alarms`
alarm, `checkForUpdate()` hits the GitHub Releases API, compares the latest
tag against `chrome.runtime.getManifest().version` with a small hand-rolled
semver comparator (`isNewerVersion`), and writes the result to
`chrome.storage.local` under `ghostddit_update_info`. It also sets a toolbar
badge. Nothing else in the extension calls the GitHub API directly — this is
the one place that happens.

Two consumers read that same storage key independently:

- **popup.js** reads it once on open, then calls
  `GHOSTDDIT_CHECK_UPDATE_NOW` to force a fresh check.
- **content.js**'s `initUpdateBanner()` reads it once and also subscribes to
  `chrome.storage.onChanged`, so a long-lived pinned tab picks up a result
  that finishes after the page already loaded.

If you're adding a new piece of state that both the popup and the page need
to see, this storage-key + `onChanged` pattern is the one to copy.

## popup.js: the simplest file

Pure UI glue: read `chrome.runtime.getManifest().version`, read the cached
`ghostddit_update_info`, render one of four states (`checking` /
`up-to-date` / `update-available` / `error`) via the `data-state` attribute
that `popup.css` styles. The one bit of nuance is the `silent` flag on
`recheck()` — on open, it shows cached data immediately (so the popup is
never blank) and only swaps to the "checking…" UI if there's nothing cached
yet; a manual button click always shows "checking…" since the user is
watching for it.

## Where to make common changes

| I want to...                                              | Look at                                                                                                                     |
|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Change how a post card looks                              | `postCardHtml()` in content.js, `.ghostddit-card` in content.css                                                            |
| Adjust the Comments tab experience                        | The `ctx.tab === 'comments'` branch in `tryInject()`, plus `loadComments()` and `setupCommentsSentinel()` in content.js     |
| Change what counts as "the empty state"                   | `findEmptyFeedContent()` — careful, this is the one Reddit-DOM-shape dependency in the whole extension                      |
| Add a new field from Reddit's post data to the card       | `postCardHtml()` — the post object is Reddit's raw API shape, nothing is pre-processed                                      |
| Change the update-check frequency                         | `UPDATE_CHECK_PERIOD_MINUTES` in background.js                                                                              |
| Add a new background API call                             | Add a message type to the `onMessage` listener in background.js, mirror an existing handler's shape, remember `return true` |
| Change the popup's visual states                          | `render()`/`renderError()` in popup.js, `.status-card[data-state=...]` in popup.css                                         |
| Fix a race/stale-data bug                                 | Check `generation` handling in content.js first — most "wrong post shows up" bugs are a missing generation check            |

## Things that look like bugs but are deliberate

- **The extra `iconFetchesInFlight` set** in content.js exists so that five
  posts from the same subreddit in one batch only trigger one icon fetch, not
  five. Don't "simplify" this away.
- **`generation` is bumped even when tearing down a panel that's about to be
  immediately rebuilt.** That's intentional — it invalidates any fetch that
  was in flight for the old context.
- **The Markdown renderer in content.js is not a full CommonMark
  implementation.** It only covers what Reddit's own selftext markdown
  actually uses. Don't pull in a Markdown library for this — it's
  intentionally small and dependency-free (see "no build step" below).
- **`background.js` catches and silently swallows network errors in
  `checkForUpdate()`.** That's deliberate — a failed update check shouldn't
  ever surface as a user-facing error; it just tries again on the next alarm.

## Constraints worth knowing before you start

- **No build step.** This is a plain Manifest V3 extension — no bundler, no
  TypeScript, no npm dependencies. Keep it that way; a PR that introduces a
  build step is a bigger conversation than a normal contribution.
- **Not on the Chrome Web Store**, which is *why* the update-checker feature
  exists at all. Keep that context in mind if you're touching background.js's
  update logic.
- **Reddit's DOM and API shapes are external and can change without notice.**
  Anything reading `p.<field>` in content.js is trusting Reddit's public API
  response shape as-is; anything querying the page DOM
  (`shreddit-feed #empty-feed-content`, the `--color-neutral-*` CSS vars) is
  trusting Reddit's current frontend markup. Both are the most likely things
  to silently break over time, and not something a contribution needs to
  "fix" preemptively — just be aware when debugging something that used to
  work.