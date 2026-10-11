// Bridge content-script requests to the background service worker.

const iconCache = new Map();
const iconFetchesInFlight = new Set();

function fetchSubredditIcon(subredditName) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: 'GHOSTDDIT_FETCH_SUBREDDIT_ICON', subreddit: subredditName },
            (resp) => {
                if (chrome.runtime.lastError || !resp || !resp.ok) {
                    resolve(null);
                    return;
                }
                resolve(resp.icon || null);
            }
        );
    });
}

async function loadIconsForPosts(panel, posts) {
    const uniqueSubs = [
        ...new Set(posts.map((p) => (p.subreddit || '').toLowerCase()).filter(Boolean))
    ].filter((name) => !iconCache.has(name) && !iconFetchesInFlight.has(name));

    if (!uniqueSubs.length) return;

    uniqueSubs.forEach((name) => iconFetchesInFlight.add(name));

    await Promise.all(
        uniqueSubs.map(async (name) => {
            const icon = await fetchSubredditIcon(name);
            iconCache.set(name, icon);
            iconFetchesInFlight.delete(name);
        })
    );

    applyIconsToPanel(panel);
}

async function loadIconsForComments(panel, comments) {
    const uniqueSubs = [
        ...new Set(comments.map((c) => (c.subredditName || '').toLowerCase()).filter(Boolean))
    ].filter((name) => !iconCache.has(name) && !iconFetchesInFlight.has(name));

    if (!uniqueSubs.length) return;

    uniqueSubs.forEach((name) => iconFetchesInFlight.add(name));

    await Promise.all(
        uniqueSubs.map(async (name) => {
            const icon = await fetchSubredditIcon(name);
            iconCache.set(name, icon);
            iconFetchesInFlight.delete(name);
        })
    );

    applyIconsToPanel(panel);
}

// Only allow plain https image URLs; blocks javascript:/data: and attribute break-out.
function sanitizeIconUrl(url) {
    if (typeof url !== 'string') return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' ? u.href : null;
    } catch (e) {
        return null;
    }
}

function applyIconsToPanel(panel) {
    if (!panel) return;
    panel.querySelectorAll('.ghostddit-icon-slot').forEach((slot) => {
        const name = (slot.getAttribute('data-subreddit') || '').toLowerCase();
        if (!name || slot.getAttribute('data-icon-applied') === '1') return;
        const icon = iconCache.get(name);
        const safeIcon = sanitizeIconUrl(icon);
        if (safeIcon) {
            const wrapper = document.createElement('span');
            wrapper.className = 'inline-block rounded-full relative h-full w-full';
            const img = document.createElement('img');
            img.src = safeIcon;
            img.alt = '';
            img.className = 'ghostddit-icon-img mb-0 shreddit-subreddit-icon__icon rounded-full overflow-hidden w-full h-full';
            img.width = 24;
            img.style.cssText = 'width:24px;height:24px;object-fit:cover;';
            img.loading = 'lazy';
            img.addEventListener('error', () => img.remove());
            wrapper.appendChild(img);
            slot.replaceChildren(wrapper);
            slot.setAttribute('data-icon-applied', '1');
        }
    });
}
function fetchPosts(username, sort, timeframe, after) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'GHOSTDDIT_FETCH_POSTS', username, sort, t: timeframe, after },
            (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!resp || !resp.ok) {
                    reject(new Error(resp?.error || 'UNKNOWN_ERROR'));
                    return;
                }
                resolve(resp);
            }
        );
    });
}

// Comment search lives on www.reddit.com; from old.reddit.com that's a
// cross-origin request, so the background worker fetches the HTML instead.
function fetchCommentsPageHtml(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'GHOSTDDIT_FETCH_COMMENTS_PAGE', url },
            (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!resp || !resp.ok) {
                    reject(new Error(resp?.error || 'UNKNOWN_ERROR'));
                    return;
                }
                resolve(resp.html);
            }
        );
    });
}

function getCookie(name) {
    const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

async function shredditGraphql(operation, variables) {
    const csrfToken = getCookie('csrf_token');
    if (!csrfToken) throw new Error('NOT_LOGGED_IN');

    const res = await fetch('https://www.reddit.com/svc/shreddit/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation, variables, csrf_token: csrfToken })
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch (e) {
        return {};
    }
}

// Old Reddit's CSRF token ("modhash"). It's in the logout form's hidden
// `uh` input, and also in the r.setup() config script; empty when logged out.
function getModhash() {
    const input = document.querySelector('input[name="uh"]');
    if (input && input.value) return input.value;
    const config = document.getElementById('config');
    const m = config && config.textContent.match(/"modhash":\s*"(\w+)"/);
    return m ? m[1] : null;
}

const OLD_VOTE_DIR = { UP: '1', DOWN: '-1', NONE: '0' };

// Old Reddit has no csrf_token cookie or shreddit GraphQL, so vote through
// its own /api/vote endpoint on the page's origin, with the user's session.
async function oldRedditVote(fullname, voteState) {
    const modhash = getModhash();
    if (!modhash) throw new Error('NOT_LOGGED_IN');

    const res = await fetch(`${location.origin}/api/vote`, {
        method: 'POST',
        credentials: 'include',
        body: new URLSearchParams({ id: fullname, dir: OLD_VOTE_DIR[voteState] || '0', uh: modhash })
    });

    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return {};
}

function voteOnPost(postId, voteState) {
    if (isOldReddit()) return oldRedditVote(postId, voteState);
    return shredditGraphql('UpdatePostVoteState', { input: { postId, voteState } });
}

function voteOnComment(commentId, voteState) {
    if (isOldReddit()) return oldRedditVote(commentId, voteState);
    return shredditGraphql('UpdateCommentVoteState', { input: { commentId, voteState } });
}

function toFullname(id, kindPrefix) {
    if (!id) return id;
    return id.startsWith(kindPrefix + '_') ? id : `${kindPrefix}_${id}`;
}

function setupVoteControls(cardEl, fullname, kind) {
    const controls = cardEl.querySelector('.ghostddit-vote-controls');
    if (!controls) return;

    const upBtn = controls.querySelector('.ghostddit-vote-up');
    const downBtn = controls.querySelector('.ghostddit-vote-down');
    const scoreEl = controls.querySelector('.ghostddit-vote-score');
    if (!upBtn || !downBtn || !scoreEl) return;

    const baseScore = parseInt(controls.getAttribute('data-base-score'), 10) || 0;
    let state = 'NONE';
    let pending = false;

    function render() {
        const delta = state === 'UP' ? 1 : state === 'DOWN' ? -1 : 0;
        scoreEl.textContent = formatCount(baseScore + delta);
        upBtn.classList.toggle('is-active', state === 'UP');
        downBtn.classList.toggle('is-active', state === 'DOWN');
    }

    async function castVote(nextState) {
        if (pending) return;
        const prevState = state;
        state = prevState === nextState ? 'NONE' : nextState;
        render();

        pending = true;
        upBtn.disabled = true;
        downBtn.disabled = true;

        try {
            if (kind === 'post') {
                await voteOnPost(fullname, state);
            } else {
                await voteOnComment(fullname, state);
            }
        } catch (err) {
            state = prevState;
            render();
        } finally {
            pending = false;
            upBtn.disabled = false;
            downBtn.disabled = false;
        }
    }

    upBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        castVote('UP');
    });
    downBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        castVote('DOWN');
    });
}