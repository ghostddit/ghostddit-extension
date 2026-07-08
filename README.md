# Ghostddit Extension

Ghostddit Extension is a browser extension that reveals a Reddit user's posts & comments on their profile page, even when Reddit itself shows an empty feed "Welcome! u/USERNAME likes to keep their posts hidden, but check out their stats to learn more about them." It renders results inline as native-feeling cards, right where the empty state used to be, and auto-loads more as you scroll.

Not affiliated with Reddit, Inc. Ghostddit is not distributed through the Chrome Web Store — install it from the [Releases](https://github.com/ghostddit/ghostddit-extension/releases) page.

Ghostddit currently supports Chromium-based browsers such as Chrome, Edge, and Brave, plus Firefox.

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

- **Reveals hidden post & comment history** on `reddit.com/user/<name>` profile pages, across the Overview, Posts, and Comments tabs, using Reddit's own public search API as a fallback source.
- **Subreddit icons, galleries, videos, and self-text rendering**, formatted to match Reddit's native look and follow its light/dark theme automatically.
- **Built-in update checker** — a toolbar popup shows your installed version, checks GitHub Releases for a newer one, and lets you force a manual re-check or jump straight to the download.

## Installing from Releases

Ghostddit Extension is not published on the Chrome Web Store, so you install it manually as an unpacked extension. The built-in update checker will still notify you when a newer release is available.

### Chromium browsers

1. Go to the [Releases page](https://github.com/ghostddit/ghostddit-extension/releases) and download the latest `.zip` asset.
2. Unzip it. Make sure the folder contains `manifest.json`, `content.js`, `background.js`, `popup.html`, and so on — not a folder containing another folder.
3. Open your browser's extensions page:
   - **Chrome / Brave / other Chromium browsers:** `chrome://extensions`
   - **Edge:** `edge://extensions`
4. Enable **Developer mode** (usually a toggle in the top-right corner).
5. Click **Load unpacked** and select the unzipped folder from step 2.
6. Ghostddit's icon should appear in your toolbar. If it does not, open the browser's extension menu (puzzle-piece icon) and pin it.

### Firefox

1. Download `ghostddit-extension.zip` from the [Releases page](https://github.com/ghostddit/ghostddit-extension/releases).
2. Unzip it.
3. Open `about:debugging` and choose **This Firefox** (or go directly to `about:debugging#/runtime/this-firefox`).
4. Click **Load Temporary Add-on…**.
5. Select any file from the unzipped folder, such as `manifest.json`.
6. Reload Reddit if needed.

> Note: Firefox loads temporary add-ons only for the current browser session. If Firefox restarts, re-load the extension from `about:debugging`.

### Updating

Click the Ghostddit toolbar icon to open the popup — it shows your installed version and checks for a newer release automatically. You can also use **Check for updates** to trigger an immediate refresh, and when one is available, use **Get the update** to jump to the new release, download the new `.zip`, and repeat the install steps above (or use **Reload** on the extension's card in `chrome://extensions` after replacing the unpacked folder's contents).

## Usage

1. Open a Reddit user profile page at `https://www.reddit.com/user/<username>`.
2. Switch to the **Overview** or **Posts** or **Comments** tab.
3. If Reddit shows an empty feed, Ghostddit will load the user's public posts and comments inline using Reddit's public data sources.
4. Scroll to load more results automatically.

> Note: The extension supports Overview, Posts, and Comments views; comments load inline when Reddit exposes them through public search results.

## Permissions

| Permission                                             | Why it's needed                                                       |
|--------------------------------------------------------|-----------------------------------------------------------------------|
| `storage`                                              | Caches update-check results and the version banner's dismissal state. |
| `alarms`                                               | Schedules the twice-daily background check for new releases.          |
| `https://api.reddit.com/*`, `https://www.reddit.com/*` | Fetches posts and subreddit icons for the profile you're viewing.     |
| `https://api.github.com/*`                             | Checks the latest GitHub release to power the update checker.         |

Ghostddit Extension doesn't collect, transmit, or store any personal data of its own — all requests go straight from your browser to Reddit's and GitHub's public APIs.

## Development

This is a plain Manifest V3 extension — no build step required.

See [ARCHITECTURE](ARCHITECTURE.md) for extension design details.

1. Clone the repo.
2. Load it unpacked as described above, pointing at the repo's root folder.
3. After editing any file, click the refresh icon on the extension's card in `chrome://extensions` to pick up changes (a full page reload on Reddit is also needed for content script changes).

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for the full contribution workflow and style guidelines.

Ghostddit Extension is open source and contributions are welcome — bug fixes, new features, or just cleaning something up.

1. Fork the repo and create a branch for your change.
2. Make your changes (see [Development](#development) above for how to load and test it locally).
3. Open a pull request describing what you changed and why.

Bug reports and feature requests are just as welcome — open an [issue](https://github.com/ghostddit/ghostddit-extension/issues) if you run into something.

## Known limitations

- Works only on public Reddit user profile pages and does not bypass Reddit's access controls.
- Does not reveal private, removed, deleted, or suspended account content.
- Firefox support uses temporary add-on loading, so the extension must be reloaded after the browser restarts.

## Disclaimer

Ghostddit Extension surfaces posts that are already public but that Reddit's UI happens not to display on a given profile view. It doesn't bypass privacy settings, suspensions, or bans — if Reddit's API itself withholds a post (private, removed, or the account is suspended), Ghostddit Extension can't show it either.

## License

Ghostddit Extension is open source, licensed under the [MIT License](LICENSE) — you're free to use, modify, and distribute it, including for commercial purposes, as long as the original copyright and license notice are kept.