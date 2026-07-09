// Show a dismissible update banner when a newer release is available.
    const UPDATE_INFO_KEY = 'ghostddit_update_info';
    const UPDATE_DISMISSED_KEY = 'ghostddit_update_dismissed_version';
    const BANNER_ID = 'ghostddit-update-banner';

    function renderUpdateBanner(info) {
        const existing = document.getElementById(BANNER_ID);
        if (!info || !info.available) {
            if (existing) existing.remove();
            return;
        }

        chrome.storage.local.get([UPDATE_DISMISSED_KEY], (res) => {
            if (res[UPDATE_DISMISSED_KEY] === info.latestVersion) return;
            if (document.getElementById(BANNER_ID)) return;

            const banner = document.createElement('div');
            banner.id = BANNER_ID;
            banner.innerHTML = `
                <span class="ghostddit-update-text">A new version of Ghostddit (v${esc(info.latestVersion)}) is available.</span>
                <a class="ghostddit-update-link" href="${esc(info.releaseUrl)}" target="_blank" rel="noopener">Download update</a>
                <button type="button" class="ghostddit-update-dismiss" aria-label="Dismiss">&times;</button>
            `;
            banner.querySelector('.ghostddit-update-dismiss').addEventListener('click', () => {
                chrome.storage.local.set({ [UPDATE_DISMISSED_KEY]: info.latestVersion });
                banner.remove();
            });
            document.documentElement.appendChild(banner);
        });
    }

    function initUpdateBanner() {
        if (!isExtensionContextValid()) return;

        chrome.storage.local.get([UPDATE_INFO_KEY], (res) => {
            renderUpdateBanner(res[UPDATE_INFO_KEY]);
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[UPDATE_INFO_KEY]) {
                renderUpdateBanner(changes[UPDATE_INFO_KEY].newValue);
            }
        });
    }