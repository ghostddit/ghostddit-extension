# Ghostddit architecture

This document explains how the extension is organized today so it is easier to
find the right place to change something.

## The big idea

Ghostddit injects a small UI into Reddit profile pages when Reddit shows its
empty-state message for a hidden or limited profile feed. The content script
reads the profile context, detects that empty state, and renders revealed posts
and comments inline. It uses the background service worker for the Reddit and
GitHub API calls because those requests need the extension's privileged context.

The code is split into two mostly independent parts:

- reveal hidden posts and comments
- check GitHub releases for newer versions and surface that in the popup and banner

## Repository layout

- manifest.chrome.json — Chromium-compatible manifest
- manifest.firefox.json — Firefox manifest with background scripts instead of a service worker
- background/index.js — Chrome-only entry point that loads the split background modules
- background/reddit-api.js — Reddit API proxying for posts, comments, and subreddit icons
- background/update-checker.js — GitHub release polling and cached update state
- content/01-state.js through content/12-bootstrap.js — the content-script pipeline
- content.css — styles for the injected UI and update banner
- popup.html, popup.css, popup.js — toolbar popup UI

## Content-script pipeline

The content script is split into numbered modules so each one has a narrow job.

1. state — shared variables and panel state
2. lifecycle — extension-context validation and recovery
3. context — parse the profile URL and detect the active tab/sort
4. messaging — bridge requests to the background worker and cache subreddit icons
5. format-utils — small helpers for counts, dates, escaping, and URL decoding
6. media — extract images, galleries, and videos from Reddit post data
7. markdown — render a small subset of Reddit markdown for self-text
8. posts — render the posts panel and pagination
9. comments — render the comments panel and pagination
10. orchestrator — decide when to inject or re-use the panel
11. update-banner — show the dismissible update banner
12. bootstrap — watch DOM and SPA navigation changes and start the flow

The main entry point is the orchestrator in content/10-orchestrator.js. It runs
whenever the DOM changes or Reddit navigates to a new view.

## Background worker layout

The background worker is also split into focused modules.

- background/index.js loads the other two background files in Chrome via importScripts()
- background/reddit-api.js listens for message types such as
  GHOSTDDIT_FETCH_POSTS and GHOSTDDIT_FETCH_SUBREDDIT_ICON
- background/update-checker.js polls GitHub Releases, stores the result in
  chrome.storage.local, and exposes GHOSTDDIT_CHECK_UPDATE_NOW for the popup

## Why the background worker exists

Reddit's API responses are not available to a page-context fetch on reddit.com
without running into CORS restrictions. The background service worker is the
privileged context that can perform those requests and return the result to the
content script through chrome.runtime.sendMessage.

The same pattern is used for GitHub release checks for consistency.

## Message contract

The content script never calls the network directly. It sends messages to the
background worker and waits for a response.

| Message type                     | Sender           | Background handler             | Response shape            |
| -------------------------------- | ---------------- | ------------------------------ | ------------------------- |
| `GHOSTDDIT_FETCH_POSTS`          | `content script` | `background/reddit-api.js`     | `{ ok, posts, after }`    |
| `GHOSTDDIT_FETCH_SUBREDDIT_ICON` | `content script` | `background/reddit-api.js`     | `{ ok, subreddit, icon }` |
| `GHOSTDDIT_CHECK_UPDATE_NOW`     | `popup.js`       | `background/update-checker.js` | `{ ok, info }`            |

Each handler keeps the message channel open with return true when it needs to
send a delayed response.

## Popup flow

The popup is intentionally simple. It reads the installed version, reads the
cached update info from chrome.storage.local, and renders one of a few UI
states for checking, up to date, update available, or error. If the user clicks
Check for updates, it asks the background worker to run a fresh check right away.

## Manifest split

- manifest.json and manifest.chrome.json target Chromium-based browsers
- manifest.firefox.json targets Firefox and uses background.scripts instead of a service worker

The content-script list is the same across the manifests, but the background
entry point differs by browser.

## Good places to edit

| I want to...                                   | Look here                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| Change the injected post card UI               | content/08-posts.js and content.css                   |
| Change comment rendering or pagination         | content/09-comments.js and content/10-orchestrator.js |
| Adjust how the extension detects profile pages | content/03-context.js                                 |
| Add or change a Reddit API request             | background/reddit-api.js                              |
| Change update-check timing or storage          | background/update-checker.js                          |
| Change popup UI states                         | popup.js and popup.css                                |
| Adjust the DOM/SPA trigger logic               | content/12-bootstrap.js                               |

## Constraints worth knowing

- There is no build step. This is a plain Manifest V3 extension.
- The content script depends on Reddit's current DOM structure, especially the
  empty-state selector used in content/03-context.js and content/12-bootstrap.js.
- The markdown rendering in content/07-markdown.js is intentionally small and
  only covers the subset that Reddit uses in self-text.
