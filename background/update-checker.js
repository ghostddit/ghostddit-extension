// Poll GitHub releases and cache the latest update info.
const GITHUB_REPO = 'ghostddit/ghostddit-extension';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const UPDATE_CHECK_ALARM = 'ghostddit-update-check';
const UPDATE_CHECK_PERIOD_MINUTES = 12 * 60; // twice a day
const UPDATE_INFO_KEY = 'ghostddit_update_info';

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== 'GHOSTDDIT_CHECK_UPDATE_NOW') return false;

    checkForUpdate()
        .then(() => chrome.storage.local.get([UPDATE_INFO_KEY]))
        .then((res) => sendResponse({ ok: true, info: res[UPDATE_INFO_KEY] || null }))
        .catch((err) => sendResponse({ ok: false, error: err.message || 'UNKNOWN_ERROR' }));
    return true; // keep the message channel open for the async sendResponse above
});