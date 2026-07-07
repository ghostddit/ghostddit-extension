# Ghostddit

Ghostddit is a browser extension that reveals a Reddit user's posts & comments on their profile page, even when Reddit itself shows an empty feed `"Welcome! u/USERNAME likes to keep their posts hidden, but check out their stats to learn more about them."`. It renders results inline as native-feeling cards, right where the empty state used to be, and auto-loads more as you scroll.

Not affiliated with Reddit, Inc. Ghostddit is not distributed through the Chrome Web Store — install it from the [Releases](https://github.com/ghostddit/ghostddit-extension/releases) page.

## Features

- **Reveals hidden post & comment history** on `reddit.com/user/<name>` profile pages, across the Overview, Posts, and (soon) Comments tabs, using Reddit's own public search API as a fallback source.
- **Subreddit icons, galleries, videos, and self-text rendering**, formatted to match Reddit's native look and follow its light/dark theme automatically.
- **Built-in update checker** — a toolbar popup shows your installed version, checks GitHub Releases for a newer one, and lets you jump straight to the download.

## Installing from Releases

Since Ghostddit isn't published on the Chrome Web Store, browsers won't auto-update it — you install it manually as an unpacked extension, and the built-in update checker will let you know when a new version is out.

1. Go to the [Releases page](https://github.com/ghostddit/ghostddit-extension/releases) and download the `.zip` asset attached to the latest release.
2. Unzip it. You should get a folder containing `manifest.json`, `content.js`, `background.js`, `popup.html`, and so on — not a folder containing another folder.
3. Open your browser's extensions page:
   - **Chrome / Brave / Edge / other Chromium browsers:** go to `chrome://extensions` (or `brave://extensions`).
4. Turn on **Developer mode** (top-right toggle on Chrome/Edge).
5. Click **Load unpacked**, then select the unzipped folder from step 2.
6. Ghostddit's icon should appear in your toolbar. Pin it for easy access via the puzzle-piece menu if you don't see it right away.

### Updating

Click the Ghostddit toolbar icon to open the popup — it shows your installed version and checks for a newer release automatically. When one's available, use **Get the update** to jump to the new release, download the new `.zip`, and repeat the install steps above (or use **Reload** on the extension's card in `chrome://extensions` after replacing the unpacked folder's contents).

## Permissions

| Permission                                             | Why it's needed                                                       |
|--------------------------------------------------------|-----------------------------------------------------------------------|
| `storage`                                              | Caches update-check results and the version banner's dismissal state. |
| `alarms`                                               | Schedules the twice-daily background check for new releases.          |
| `https://api.reddit.com/*`, `https://www.reddit.com/*` | Fetches posts and subreddit icons for the profile you're viewing.     |
| `https://api.github.com/*`                             | Checks the latest GitHub release to power the update checker.         |

Ghostddit doesn't collect, transmit, or store any personal data of its own — all requests go straight from your browser to Reddit's and GitHub's public APIs.

## Development

This is a plain Manifest V3 extension — no build step required.

1. Clone the repo.
2. Load it unpacked as described above, pointing at the repo's root folder.
3. After editing any file, click the refresh icon on the extension's card in `chrome://extensions` to pick up changes (a full page reload on Reddit is also needed for content script changes).

## Contributing

Ghostddit is open source and contributions are welcome — bug fixes, new features, or just cleaning something up.

1. Fork the repo and create a branch for your change.
2. Make your changes (see [Development](#development) above for how to load and test it locally).
3. Open a pull request describing what you changed and why.

Bug reports and feature requests are just as welcome — open an [issue](https://github.com/ghostddit/ghostddit-extension/issues) if you run into something.

## Disclaimer

Ghostddit surfaces posts that are already public but that Reddit's UI happens not to display on a given profile view. It doesn't bypass privacy settings, suspensions, or bans — if Reddit's API itself withholds a post (private, removed, or the account is suspended), Ghostddit can't show it either.

## License

Ghostddit is open source, licensed under the [MIT License](LICENSE) — you're free to use, modify, and distribute it, including for commercial purposes, as long as the original copyright and license notice are kept.