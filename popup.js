// Ghostddit popup
//
// Shows the installed version and whatever background.js last found when it
// polled GitHub Releases (see UPDATE_INFO_KEY in background.js), and lets the
// user force an immediate re-check instead of waiting for the twice-daily
// alarm.
(function () {
    const UPDATE_INFO_KEY = 'ghostddit_update_info';

    const currentVersionEl = document.getElementById('current-version');
    const statusCard = document.getElementById('status-card');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusDetail = document.getElementById('status-detail');
    const updateLink = document.getElementById('update-link');
    const recheckBtn = document.getElementById('recheck-btn');

    const currentVersion = chrome.runtime.getManifest().version;
    currentVersionEl.textContent = `v${currentVersion}`;

    function timeAgo(ms) {
        const diff = Math.max(0, Date.now() - ms) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
        return `${Math.floor(diff / 86400)} d ago`;
    }

    function render(info) {
        if (!info) {
            statusCard.dataset.state = 'checking';
            statusIcon.textContent = '⟳';
            statusTitle.textContent = 'Checking for updates…';
            statusDetail.textContent = '';
            updateLink.classList.toggle('hidden', true);
            return;
        }

        if (info.available) {
            statusCard.dataset.state = 'update-available';
            statusIcon.textContent = '↑';
            statusTitle.textContent = `Version ${info.latestVersion} is available`;
            statusDetail.textContent = `You're on v${info.currentVersion}. Checked ${timeAgo(info.checkedAt)}.`;
            updateLink.href = info.releaseUrl;
            updateLink.classList.toggle('hidden', false);
        } else {
            statusCard.dataset.state = 'up-to-date';
            statusIcon.textContent = '✓';
            statusTitle.textContent = "You're up to date";
            statusDetail.textContent = `Checked ${timeAgo(info.checkedAt)}.`;
            updateLink.classList.toggle('hidden', true);
        }
    }

    function friendlyError(code) {
        if (code === 'RATE_LIMITED') return "GitHub's rate limit was hit. Try again in a bit.";
        return 'Check your connection and try again.';
    }

    function renderError(message) {
        statusCard.dataset.state = 'error';
        statusIcon.textContent = '!';
        statusTitle.textContent = "Couldn't check for updates";
        statusDetail.textContent = friendlyError(message);
        updateLink.classList.toggle('hidden', true);
    }

    // `silent` is used for the automatic on-open check: if we already have
    // cached info, keep showing it (just re-labeled the button) rather than
    // flashing the "checking" state, and only replace the view once a fresh
    // result actually arrives. A manual button click always shows the
    // checking state immediately, since the user is watching for it.
    function recheck(silent) {
        recheckBtn.disabled = true;
        recheckBtn.textContent = 'Checking…';
        if (!silent) {
            statusCard.dataset.state = 'checking';
            statusIcon.textContent = '⟳';
            statusTitle.textContent = 'Checking for updates…';
            statusDetail.textContent = '';
            updateLink.classList.toggle('hidden', true);
        }

        chrome.runtime.sendMessage({ type: 'GHOSTDDIT_CHECK_UPDATE_NOW' }, (resp) => {
            recheckBtn.disabled = false;
            recheckBtn.textContent = 'Check for updates';

            if (chrome.runtime.lastError || !resp || !resp.ok) {
                renderError(resp && resp.error);
                return;
            }
            render(resp.info);
        });
    }

    recheckBtn.addEventListener('click', () => recheck(false));

    // Show whatever's already cached immediately so the popup never opens
    // blank, then kick off a fresh check so the info is never more than a
    // popup-open away from current.
    chrome.storage.local.get([UPDATE_INFO_KEY], (res) => {
        const cached = res[UPDATE_INFO_KEY] || null;
        render(cached);
        recheck(!!cached);
    });
})();