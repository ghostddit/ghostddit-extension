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

    function applyIconsToPanel(panel) {
        if (!panel) return;
        panel.querySelectorAll('.ghostddit-icon-slot').forEach((slot) => {
            const name = (slot.getAttribute('data-subreddit') || '').toLowerCase();
            if (!name || slot.getAttribute('data-icon-applied') === '1') return;
            const icon = iconCache.get(name);
            if (icon) {
                slot.innerHTML = `<span class="inline-block rounded-full relative h-full w-full"><img src="${icon}" alt="" class="ghostddit-icon-img mb-0 shreddit-subreddit-icon__icon rounded-full overflow-hidden w-full h-full" width="24" style="width:24px;height:24px;object-fit:cover;" loading="lazy" onerror="this.remove();"></span>`;
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