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

- Reveals hidden post and comment history on Reddit profile pages across Overview, Posts, and Comments views.
- Renders cards with subreddit icons, galleries, videos, and self-text using Reddit's public data sources.
- Includes a built-in update checker that shows the installed version, checks GitHub Releases, and surfaces a dismissible update banner on Reddit pages.

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

1. Open a Reddit profile page at `https://www.reddit.com/user/<username>`.
2. Switch to Overview, Posts, or Comments.
3. If Reddit shows the empty-state message, Ghostddit will load the user's public posts and comments inline.
4. Scroll to load more results automatically.

## Permissions

| Permission                                                | Why it is needed                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `storage`                                                 | Caches update-check results and the update-banner dismissal state.     |
| `alarms`                                                  | Schedules the periodic background update check.                        |
| `https://api.reddit.com/*` and `https://www.reddit.com/*` | Fetches posts, comments, subreddit icons, and the Reddit page context. |
| `https://api.github.com/*`                                | Checks the latest GitHub release.                                      |

Ghostddit does not collect or store personal data of its own; requests go directly from the browser to Reddit's and GitHub's public APIs.

## Development

This is a plain Manifest V3 extension with no build step.

See [ARCHITECTURE](ARCHITECTURE.md) for the current layout.

1. Clone the repository.
2. Load it unpacked as described above.
3. After editing any file, refresh the extension from the browser's extensions page.
4. Reload the Reddit tab as well if you changed the content script or styles.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for the full workflow and style guidance.

Contributions are welcome. If you are making a change, keep it focused and explain what you tested.

## Known limitations

- Works only on public Reddit profile pages and does not bypass Reddit access controls.
- Does not reveal private, removed, deleted, or suspended content.
- Firefox support is temporary add-on loading, so the extension must be reloaded after a restart.

## Disclaimer

Ghostddit surfaces posts and comments that are already public but not displayed by Reddit's UI on a given profile view. It does not bypass privacy settings, suspensions, or bans.

## License

Ghostddit is open source under the [MIT License](LICENSE).