// Handle Reddit API requests from the content script.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

    if (msg?.type === 'GHOSTDDIT_FETCH_COMMENTS_PAGE') {
        // Only fetch comment-search pages, so this can't be used as a general
        // proxy. Parsing first normalizes any "../" segments before the check.
        let target;
        try {
            target = new URL(msg.url);
        } catch (e) {
            target = null;
        }
        if (!target || target.origin !== 'https://www.reddit.com' || !target.pathname.startsWith('/svc/shreddit/search/')) {
            sendResponse({ ok: false, error: 'BAD_URL' });
            return false;
        }

        fetch(target.href, {
            credentials: 'include',
            headers: { Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9' },
            cache: 'no-store'
        })
            .then(async (r) => {
                if (!r.ok) {
                    if (r.status === 429) throw new Error('RATE_LIMITED');
                    throw new Error(`HTTP_${r.status}`);
                }
                sendResponse({ ok: true, html: await r.text() });
            })
            .catch((err) => {
                sendResponse({ ok: false, error: err.message || 'UNKNOWN_ERROR' });
            });

        return true; // keep the message channel open for the async sendResponse above
    }

    if (msg?.type !== 'GHOSTDDIT_FETCH_POSTS') return false;

    const { username, sort = 'new', t = null, after = null } = msg;

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