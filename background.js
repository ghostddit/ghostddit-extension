// Update checking
//
// Ghostddit isn't distributed through the Chrome Web Store (no auto-update),
// so we poll the GitHub Releases API ourselves and compare the latest tag
// against the version baked into manifest.json. If a newer release exists we
// stash the result in chrome.storage.local and flag the toolbar icon; the
// content script reads that same storage key to show an on-page banner.
const GITHUB_REPO = 'ghostddit/ghostddit-extension';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const UPDATE_CHECK_ALARM = 'ghostddit-update-check';
const UPDATE_CHECK_PERIOD_MINUTES = 12 * 60; // twice a day
const UPDATE_INFO_KEY = 'ghostddit_update_info';

// Basic dotted-numeric semver comparison (1.0.0 vs 1.1.0, etc.)
function isNewerVersion(latest, current) {
    const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
    const b = current.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

async function checkForUpdate() {
    try {
        const res = await fetch(GITHUB_RELEASES_URL, {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store'
        });
        if (!res.ok) {
            if (res.status === 403 || res.status === 429) throw new Error('RATE_LIMITED');
            throw new Error(`HTTP_${res.status}`);
        }

        const data = await res.json();
        const latestVersion = String(data.tag_name || '').replace(/^v/i, '').trim();
        if (!latestVersion) throw new Error('BAD_RESPONSE');

        const currentVersion = chrome.runtime.getManifest().version;
        const available = isNewerVersion(latestVersion, currentVersion);

        await chrome.storage.local.set({
            [UPDATE_INFO_KEY]: {
                available,
                latestVersion,
                currentVersion,
                releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
                checkedAt: Date.now()
            }
        });

        // Small visual nudge on the toolbar icon; the on-page banner (driven by content.js) 
        // is the primary way users will notice the update.
        if (available) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff4500' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
        return true;
    } catch (e) {
        throw e;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(UPDATE_CHECK_ALARM, { periodInMinutes: UPDATE_CHECK_PERIOD_MINUTES });
    checkForUpdate().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
    checkForUpdate().catch(() => {});
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_CHECK_ALARM) checkForUpdate().catch(() => {});
});

// ---------------------------------------------------------------------------
// Reddit API proxying
//
// These fetches run in the background service worker (not the content script)
// because api.reddit.com doesn't send CORS headers permissive enough for a
// page-context fetch on www.reddit.com — routing through the extension's own
// privileged context sidesteps that.
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Fired by popup.js when the user taps "Check for updates" — runs the
    // same check the alarm does, then hands the popup the freshly written
    // storage entry so it can re-render immediately instead of waiting for
    // the next twice-daily alarm.
    if (msg?.type === 'GHOSTDDIT_CHECK_UPDATE_NOW') {
        checkForUpdate()
            .then(() => chrome.storage.local.get([UPDATE_INFO_KEY]))
            .then((res) => sendResponse({ ok: true, info: res[UPDATE_INFO_KEY] || null }))
            .catch((err) => sendResponse({ ok: false, error: err.message || 'UNKNOWN_ERROR' }));
        return true; // keep the message channel open for the async sendResponse above
    }

    if (msg?.type === 'GHOSTDDIT_FETCH_SUBREDDIT_ICON') {
        const { subreddit } = msg;
        const url = `https://api.reddit.com/r/${encodeURIComponent(subreddit)}/about`;

        fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
            .then(async (r) => {
                const text = await r.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error('BAD_RESPONSE');
                }
                if (!r.ok) throw new Error(`HTTP_${r.status}`);

                const d = data?.data || {};
                // Reddit serves these image URLs with literal "&amp;" entities even
                // in JSON, so they need unescaping before they're usable as a src.
                let icon = d.community_icon || d.icon_img || null;
                if (icon) icon = icon.split('&amp;').join('&');
                if (!icon) icon = null;

                sendResponse({ ok: true, subreddit, icon });
            })
            .catch((err) => {
                sendResponse({ ok: false, subreddit, error: err.message || 'UNKNOWN_ERROR' });
            });

        return true; // keep the message channel open for the async sendResponse above
    }

    if (msg?.type !== 'GHOSTDDIT_FETCH_POSTS') return false;

    const { username, sort = 'new', t = null, after = null } = msg;

    // Reddit's public search endpoint, scoped to a single author, stands in for
    // the normal profile-listing endpoint (which 403s/hides results for the
    // profiles Ghostddit targets).
    const q = `author:"${username}"`;
    let url = `https://api.reddit.com/search/?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&limit=25`;
    if (sort === 'top' && t) url += `&t=${encodeURIComponent(t)}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    })
        .then(async (r) => {
            const text = await r.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error('BAD_RESPONSE');
            }

            if (!r.ok) {
                if (r.status === 404) throw new Error('USER_NOT_FOUND');
                if (r.status === 403) throw new Error('BANNED_OR_PRIVATE');
                if (r.status === 429) throw new Error('RATE_LIMITED');
                if (r.status >= 500) throw new Error('REDDIT_UNAVAILABLE');
                throw new Error(`HTTP_${r.status}`);
            }

            // Search results can include other "kinds" (e.g. t5 subreddits);
            // t3 is the "link"/post kind, which is all Ghostddit renders today.
            const posts = (data?.data?.children || [])
                .filter((item) => item.kind === 't3')
                .map((item) => item.data);

            sendResponse({
                ok: true,
                posts,
                after: data?.data?.after || null
            });
        })
        .catch((err) => {
            sendResponse({ ok: false, error: err.message || 'UNKNOWN_ERROR' });
        });
    return true; // keep the message channel open for the async sendResponse above
});