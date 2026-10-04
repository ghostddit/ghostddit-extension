# Ghostddit Extension

Ghostddit reveals a Reddit user's public posts and comments directly on their profile page when Reddit shows its hidden-profile empty state. It injects native-feeling cards inline and keeps loading more as you scroll.

Not affiliated with Reddit, Inc. Ghostddit is not distributed through the Chrome Web Store; it is installed as an unpacked extension from the releases page.

## Table of contents

- [Features](#features)
- [Installing from Releases](#installing-from-releases)
- [Usage](#usage)
- [Permissions](#permissions)
- [Development](#development)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)
- [License](#license)

## Features

- Reveals hidden post and comment history on Reddit profile pages across Overview, Posts, and Comments views. Overview interleaves posts and comments, newest first, like Reddit's own overview.
- Works on old Reddit too, both on `old.reddit.com` and on `www.reddit.com` with the "use old Reddit" preference, rendering revealed items as native-looking old Reddit rows.
- Renders cards with subreddit icons, galleries, videos, and self-text using Reddit's public data sources.
- Lets you upvote and downvote revealed posts and comments inline, using your existing logged-in Reddit session.
- Force-reveal mode (Ctrl+G) is a global toggle that shows the Ghostddit panel on any profile, even one Reddit is already rendering normally, and stays on across every profile you visit until you turn it off.
- Includes a built-in update checker that shows the installed version, checks GitHub Releases, and surfaces a dismissible update banner on Reddit pages.
- Shows a one-time "what's new" panel on the first Reddit page you load after installing or updating Ghostddit, listing what changed in that release.

## Installing from Releases

Ghostddit is not published on the Chrome Web Store, so installation is manual.

### Chromium browsers

1. Download the latest release zip from the [Releases](https://github.com/ghostddit/ghostddit-extension/releases) page.
2. Unzip it. The folder should contain files such as manifest.json, background/, content/, popup.html, and content.css.
3. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
4. Enable Developer mode.
5. Click Load unpacked and select the unzipped folder.

### Firefox

1. Download the latest release zip.
2. Unzip it.
3. Open about:debugging and choose This Firefox.
4. Click Load Temporary Add-on….
5. Select manifest.firefox.json from the unzipped folder.

> Firefox temporary add-ons must be reloaded after a browser restart.

### Updating

Open the Ghostddit popup to see the installed version and the latest cached update state. Click Check for updates to trigger a fresh check, or use Get the update to jump to the release page.

## Usage

1. Open a Reddit profile page at `https://www.reddit.com/user/<username>` (or `https://old.reddit.com/user/<username>`).
2. Switch to Overview, Posts, or Comments (Overview, Submitted, or Comments on old Reddit).
3. If Reddit shows the empty-state message, Ghostddit will load the user's public posts and comments inline.
4. Scroll to load more results automatically.
5. Use the arrows next to a revealed post or comment's score to upvote or downvote it. This requires you to be logged in to Reddit in that browser tab; voting uses your own Reddit account exactly as it would from Reddit's normal UI.
6. Press Ctrl+G (or Cmd+G on Mac) to turn on force-reveal globally: it hides Reddit's native feed and mounts Ghostddit's cards in its place, and keeps doing that automatically as you browse from profile to profile, in new tabs, and even after a page reload — you don't need to press it again. The data shown is still the same public search results Ghostddit always uses. Press Ctrl+G again to turn it back off everywhere and restore Reddit's native feed.

## Permissions

| Permission                                                | Why it is needed                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `storage`                                                 | Caches update-check results and the update-banner dismissal state.                               |
| `alarms`                                                  | Schedules the periodic background update check.                                                  |
| `https://api.reddit.com/*` and `https://www.reddit.com/*` | Fetches posts, comments, subreddit icons, the Reddit page context, and submits vote requests.    |
| `https://old.reddit.com/*`                                | Runs on old Reddit profile pages and submits old Reddit vote requests.                           |
| `https://api.github.com/*`                                | Checks the latest GitHub release.                                                                |

Ghostddit does not collect or store personal data of its own; requests go directly from the browser to Reddit's and GitHub's public APIs. Voting requests are sent directly to Reddit using your browser's existing Reddit session/cookies — Ghostddit never reads, stores, or transmits your session or login credentials itself, only the same `csrf_token` cookie Reddit's own front end uses (on old Reddit, the page's `uh` modhash, which old Reddit's own forms submit).

## Development

This is a plain Manifest V3 extension with no build step.

See [ARCHITECTURE](ARCHITECTURE.md) for the current layout.

1. Clone the repository.
2. Create a `manifest.json` in the repo root (it is gitignored). Both browsers load the folder's `manifest.json`, so either copy the manifest for your browser, or combine them so one folder loads in both: start from `manifest.chrome.json`, add the Firefox `background.scripts` list next to `service_worker`, and add Firefox's `browser_specific_settings`.
3. Load it unpacked as described above.
4. After editing any file, refresh the extension from the browser's extensions page.
5. Reload the Reddit tab as well if you changed the content script or styles.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for the full workflow and style guidance.

Contributions are welcome. If you are making a change, keep it focused and explain what you tested.

## Known limitations

- Works only on public Reddit profile pages and does not bypass Reddit access controls.
- Does not reveal private, removed, deleted, or suspended content.
- Force-reveal mode (Ctrl+G) fetches the same public search results as the automatic empty-state flow; it does not surface anything that wasn't already accessible without it. It's a global toggle stored in a `ghostddit_force_mode` cookie on reddit.com, so it stays on across profiles, tabs, and page reloads until you press Ctrl+G again to turn it off.
- Firefox support is temporary add-on loading, so the extension must be reloaded after a restart.

## Disclaimer

Ghostddit surfaces posts and comments that are already public but not displayed by Reddit's UI on a given profile view. It does not bypass privacy settings, suspensions, or bans.

## License

Ghostddit is open source under the [MIT License](LICENSE).