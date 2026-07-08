// Ghostddit content script
//
// Runs on www.reddit.com profile pages. Detects Reddit's "empty feed" state
// and injects posts/comments fetched via the background service worker and
// (for comments) direct same-origin requests. Also patches SPA navigation
// so it re-runs on in-app profile switches.
(function () {
    const PANEL_ID = 'ghostddit-revealed-posts';

    let currentUsername = null;
    let currentSort = null;
    let currentTimeframe = null;
    let afterToken = null;
    let loading = false;
    let exhausted = false;
    let seenPostIds = new Set();
    let lastContextKey = null;
    let generation = 0;
    let contextInvalidatedNoticeShown = false;

    // Comments state, kept separate from posts state above — different
    // endpoint and pagination mechanism (a chained cursor URL, not an
    // `after` token).
    let currentCommentsUsername = null;
    let currentCommentsSort = null;
    let seenCommentIds = new Set();
    let nextCommentsUrl = null;
    let commentsLoading = false;
    let commentsExhausted = false;

    // chrome.runtime.id disappears once the extension context is invalidated
    // (e.g. reloaded while this tab is still open).
    function isExtensionContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function handleInvalidContext() {
        if (contextInvalidatedNoticeShown) return;
        contextInvalidatedNoticeShown = true;
        try { observer.disconnect(); } catch (e) {}
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
            setStatus(panel, 'Ghostddit was updated — refresh this page to keep using it.');
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        }
    }

    // Matches /user/<name>/, /u/<name>/, /user/<name>/submitted/, and
    // /user/<name>/comments/. A missing group 2 means the "Overview" tab.
    function parseProfileContext() {
        const m = location.pathname.match(/^\/(?:user|u)\/([^/]+)\/(submitted|comments)?\/?/i);
        if (!m) return null;

        const params = new URLSearchParams(location.search);
        const sort = params.get('sort') || 'new';
        const timeframe = sort === 'top' ? (params.get('t') || 'all') : null;

        return {
            username: m[1],
            tab: m[2] || 'overview',
            sort,
            timeframe
        };
    }

    // Identifies "the same view" across re-renders so we don't wipe and
    // refetch the panel just because Reddit re-rendered the DOM around it.
    function contextKey(ctx) {
        return `${ctx.username}|${ctx.tab}|${ctx.sort}|${ctx.timeframe || ''}`;
    }

    // Module-wide subreddit icon cache, shared across all panels/tabs.
    // iconFetchesInFlight dedupes concurrent requests for the same subreddit.
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

    // Same as loadIconsForPosts(), reading subredditName off comment objects.
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

    // Presence of this element is the signal that Reddit is hiding a
    // profile's post history and Ghostddit should inject.
    function findEmptyFeedContent() {
        return document.querySelector('shreddit-feed #empty-feed-content');
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

    // ---------------------------------------------------------------------
    // Comments
    //
    // Fetched and parsed directly from www.reddit.com (same-origin, cookies
    // included) rather than through background.js, since this data only
    // exists as rendered HTML from a "type=comments" search, not JSON.
    //
    // Pagination follows a server-issued cursor URL embedded in each
    // response's <faceplate-partial loading="lazy" src="..."> tag. Its
    // absence means the last page has been reached.
    function commentSearchUrl(username, sort) {
        const q = `author:"${username}"`;
        // No `t` (timeframe) param — comment search doesn't support one.
        return `https://www.reddit.com/svc/shreddit/search/?q=${encodeURIComponent(q)}&type=comments&sort=${encodeURIComponent(sort || 'new')}`;
    }

    function commentBodyHtml(bodyEl) {
        if (!bodyEl) return '';
        const paragraphs = Array.from(bodyEl.querySelectorAll('p'));
        const source = paragraphs.length ? paragraphs.map((p) => p.textContent) : [bodyEl.textContent];
        return source
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => `<p class="m-0 mb-2xs">${esc(t)}</p>`)
            .join('');
    }

    function parseCommentCards(doc) {
        const cards = doc.querySelectorAll('[data-testid="search-sdui-comment-unit"]');
        const comments = [];

        cards.forEach((card) => {
            try {
                const tracker = card.closest('search-telemetry-tracker');
                const ctxRaw = tracker && tracker.getAttribute('data-faceplate-tracking-context');
                if (!ctxRaw) return;
                const ctx = JSON.parse(ctxRaw);
                const commentId = ctx && ctx.comment && ctx.comment.id;
                if (!commentId) return;

                // Permalink to this specific comment.
                const permalinkEl = card.querySelector('a[aria-labelledby^="comment-content-"]');
                const permalink = permalinkEl && permalinkEl.getAttribute('href');
                if (!permalink) return;
                // Parent post's permalink: same path minus the comment-id segment.
                const postPermalink = permalink.replace(/[^/]+\/$/, '');

                const contentWrap = card.querySelector('[data-testid="search-comment-content"]');
                const bodyEl = contentWrap && contentWrap.querySelector('[id^="search-comment-"][id$="-post-rtjson-content"]');
                // Scoped to contentWrap so this reads the comment's own score,
                // not the post's upvote/comment-count numbers elsewhere on the card.
                const voteEl = contentWrap && contentWrap.querySelector('faceplate-number');
                const voteCount = voteEl ? (parseInt(voteEl.getAttribute('number'), 10) || 0) : 0;
                // Scoped to contentWrap for the same reason — the post's own
                // timestamp appears elsewhere on the card.
                const timeEl = contentWrap && contentWrap.querySelector('faceplate-timeago');
                const ts = timeEl && timeEl.getAttribute('ts');
                const createdUnix = ts ? Math.floor(new Date(ts).getTime() / 1000) : null;

                comments.push({
                    id: commentId,
                    postTitle: (ctx.post && ctx.post.title) || '',
                    subredditName: (ctx.subreddit && ctx.subreddit.name) || '',
                    permalink,
                    postPermalink,
                    bodyHtml: commentBodyHtml(bodyEl),
                    voteCount,
                    createdUnix
                });
            } catch (e) {
                // Skip malformed cards without failing the whole batch.
            }
        });

        return comments;
    }

    // loading="lazy" distinguishes the pagination partial from hover-card
    // partials elsewhere on the page (those use loading="programmatic").
    function findNextCommentsUrl(doc) {
        const el = doc.querySelector('faceplate-partial[loading="lazy"]');
        const src = el && el.getAttribute('src');
        if (!src) return null;
        try {
            return new URL(src, 'https://www.reddit.com').toString();
        } catch (e) {
            return null;
        }
    }

    async function fetchCommentsPage(url) {
        const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9' }
        });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return {
            comments: parseCommentCards(doc),
            nextUrl: findNextCommentsUrl(doc)
        };
    }

    // Renders a comment card using Reddit's native utility classes, mirroring
    // <shreddit-profile-comment>'s layout (header, timestamp, body, actions).
    function commentCardHtml(c) {
        const permalink = `https://www.reddit.com${esc(c.permalink)}`;
        const postUrl = `https://www.reddit.com${esc(c.postPermalink)}`;
        const subUrl = `https://www.reddit.com/r/${esc(c.subredditName)}/`;
        const subLower = (c.subredditName || '').toLowerCase();
        const cachedIcon = iconCache.get(subLower);

        return `
        <div class="ghostddit-card block relative bg-neutral-background hover:bg-neutral-background-hover xs:rounded-4 px-md py-sm my-2xs">
            <a class="absolute inset-0" href="${permalink}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"></a>

            <div class="text-12 relative w-fit z-10">
                <div class="flex items-center flex-wrap">
                    <span class="ghostddit-icon-slot inline-flex items-center justify-center w-lg h-lg relative me-xs" data-subreddit="${esc(subLower)}" ${cachedIcon ? 'data-icon-applied="1"' : ''}>
                        ${cachedIcon ? `<span class="inline-block rounded-full relative h-full w-full"><img src="${esc(cachedIcon)}" alt="" class="ghostddit-icon-img mb-0 rounded-full overflow-hidden w-full h-full" width="24" style="width:24px;height:24px;object-fit:cover;" loading="lazy" onerror="this.remove();"></span>` : ''}
                    </span>
                    <a class="text-neutral-content-strong font-semibold no-visited no-underline hover:underline relative z-10" href="${subUrl}" target="_blank" rel="noopener">r/${esc(c.subredditName)}</a>
                    <span class="px-2xs text-neutral-content-weak" aria-hidden="true">&bull;</span>
                    <a class="text-neutral-content-strong font-normal no-visited hover:underline relative z-10" href="${postUrl}" target="_blank" rel="noopener">${esc(c.postTitle)}</a>
                </div>
            </div>

            <div class="text-neutral-content-weak text-12 ms-xl mt-2xs relative z-10">
                <span class="font-bold text-neutral-content-strong">${esc(currentCommentsUsername || '')}</span>
                commented
                ${c.createdUnix ? `<span>${timeAgo(c.createdUnix)}</span>` : ''}
            </div>

            <div class="ms-[22px] mt-2xs ps-[10px] text-neutral-content-strong overflow-hidden relative z-10" style="word-break:break-word;">
                ${c.bodyHtml}
            </div>

            <div class="ms-lg mt-2xs relative z-10">
                <div class="flex items-center gap-md text-12 text-neutral-content-weak">
                    <span class="flex items-center gap-2xs">
                        <span style="display:inline-flex; color:inherit;">
                        <svg rpl="" fill="currentColor" height="16" icon-name="upvote" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10zM2.989 9.179H7.84v5.731c0 1.13.81 2.163 1.934 2.278a2.163 2.163 0 002.386-2.15V9.179h4.851L10 2.163 2.989 9.179z"/></svg>
                        </span>
                        <span>${formatCount(c.voteCount)}</span>
                        <span style="display:inline-flex; color:inherit;">
                        <svg rpl="" fill="currentColor" height="16" icon-name="downvote" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 1a3.966 3.966 0 013.96 3.962V9.02h3.202c.706 0 1.335.42 1.605 1.073.27.652.122 1.396-.377 1.895l-7.754 7.759a.925.925 0 01-1.272 0l-7.754-7.76a1.734 1.734 0 01-.376-1.894c.27-.652.9-1.073 1.605-1.073h3.202V4.962A3.965 3.965 0 0110 1zm7.01 9.82h-4.85V5.09c0-1.13-.81-2.163-1.934-2.278a2.163 2.163 0 00-2.386 2.15v5.859H2.989l7.01 7.016 7.012-7.016z"/></svg>
                        </span>
                    </span>
                    <a class="flex items-center gap-2xs hover:underline relative z-10" href="${permalink}" target="_blank" rel="noopener">
                        <span style="display:inline-flex; color:inherit;">
                        <svg rpl="" fill="currentColor" height="16" icon-name="comment" viewBox="0 0 20 20" width="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 1a9 9 0 00-9 9c0 1.947.79 3.58 1.935 4.957L.231 17.661A.784.784 0 00.785 19H10a9 9 0 009-9 9 9 0 00-9-9zm0 16.2H6.162c-.994.004-1.907.053-3.045.144l-.076-.188a36.981 36.981 0 002.328-2.087l-1.05-1.263C3.297 12.576 2.8 11.331 2.8 10c0-3.97 3.23-7.2 7.2-7.2s7.2 3.23 7.2 7.2-3.23 7.2-7.2 7.2z"/></svg>
                        </span>
                        <span>Reply</span>
                    </a>
                </div>
            </div>
        </div>
        `;
    }

    function renderComments(panel, comments) {
        const list = panel.querySelector('.ghostddit-list');
        const frag = document.createDocumentFragment();
        comments.forEach((c) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = commentCardHtml(c);
            frag.appendChild(wrapper.firstElementChild);
        });
        list.appendChild(frag);
    }

    // Mirrors loadMore()'s guard/generation/status pattern against comments'
    // own state.
    async function loadComments(myGeneration, panel) {
        if (myGeneration !== generation) return;
        if (commentsLoading || commentsExhausted || !currentCommentsUsername) return;
        commentsLoading = true;

        function disconnectCommentsSentinel() {
            try { panel?._ghostdditObserver?.disconnect(); } catch (e) {}
        }

        setStatus(panel, 'Fetching comments…');
        try {
            const url = nextCommentsUrl || commentSearchUrl(currentCommentsUsername, currentCommentsSort);
            const { comments, nextUrl } = await fetchCommentsPage(url);
            if (myGeneration !== generation) return;

            nextCommentsUrl = nextUrl;

            const newComments = comments.filter((c) => c.id && !seenCommentIds.has(c.id));
            newComments.forEach((c) => seenCommentIds.add(c.id));
            if (newComments.length) {
                renderComments(panel, newComments);
                loadIconsForComments(panel, newComments);
            }

            if (!nextUrl) {
                commentsExhausted = true;
                setStatus(panel, seenCommentIds.size
                    ? 'No more comments.'
                    : 'No public comments found via search.');
                disconnectCommentsSentinel();
            } else {
                setStatus(panel, '');
            }
        } catch (err) {
            if (myGeneration !== generation) return;
            if (!isExtensionContextValid() || /extension context invalidated/i.test(err.message || '')) {
                handleInvalidContext();
            } else {
                setStatus(panel, `Couldn't load comments (${err.message}). Scroll to retry.`);
                setTimeout(() => {
                    if (myGeneration === generation) loadComments(myGeneration, panel);
                }, 4000);
            }
        } finally {
            if (myGeneration === generation) {
                commentsLoading = false;
            }
        }
    }

    // Infinite-scroll sentinel for the comments tab, calling loadComments()
    // instead of the posts-only observer ensurePanel() wires up by default.
    function setupCommentsSentinel(panel, myGeneration) {
        const sentinel = panel.querySelector('.ghostddit-sentinel');
        if (!sentinel) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadComments(myGeneration, panel);
            },
            { root: null, rootMargin: '600px 0px', threshold: 0 }
        );
        io.observe(sentinel);
        panel._ghostdditObserver = io;
    }

    function timeAgo(unixSeconds) {
        const diff = Date.now() / 1000 - unixSeconds;
        const units = [
            ['yr.', 31536000],
            ['mo.', 2592000],
            ['d.', 86400],
            ['hr.', 3600],
            ['min.', 60]
        ];
        for (const [label, secs] of units) {
            const v = Math.floor(diff / secs);
            if (v >= 1) return `${v} ${label} ago`;
        }
        return 'just now';
    }

    function formatCount(n) {
        n = Number(n) || 0;
        const sign = n < 0 ? '-' : '';
        n = Math.abs(n);
        if (n < 1000) return sign + String(n);
        if (n < 100000) {
            const v = n / 1000;
            return sign + (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)) + 'k';
        }
        if (n < 1000000) return sign + Math.round(n / 1000) + 'k';
        const m = n / 1000000;
        return sign + (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)) + 'm';
    }

    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function decodeUrlEntities(str) {
        if (typeof str !== 'string') return str;
        return str
            .split('&amp;').join('&')
            .split('&quot;').join('"')
            .split('&#39;').join("'");
    }

    function getRedditVideo(p) {
        const rv = (p && (p.secure_media || p.media) || {}).reddit_video;
        if (!rv || !rv.fallback_url) return null;
        return {
            url: decodeUrlEntities(rv.fallback_url),
            width: rv.width || 16,
            height: rv.height || 9
        };
    }

    function getBestImage(p) {
        const src = p && p.preview && p.preview.images && p.preview.images[0] && p.preview.images[0].source;
        if (src && src.url) {
            return { url: decodeUrlEntities(src.url), width: src.width || 1, height: src.height || 1 };
        }
        if (p.thumbnail && /^https?:\/\//.test(p.thumbnail)) {
            return { url: decodeUrlEntities(p.thumbnail), width: p.thumbnail_width || 1, height: p.thumbnail_height || 1 };
        }
        return null;
    }

    function getGalleryImages(p) {
        if (!p.is_gallery || !p.gallery_data || !Array.isArray(p.gallery_data.items) || !p.media_metadata) {
            return null;
        }
        const imgs = p.gallery_data.items
            .map((item) => {
                const meta = p.media_metadata[item.media_id];
                if (!meta || meta.status !== 'valid' || !meta.s || !meta.s.u) return null;
                return { url: decodeUrlEntities(meta.s.u), width: meta.s.x || 1, height: meta.s.y || 1 };
            })
            .filter(Boolean);
        return imgs.length ? imgs : null;
    }

    // Inline Markdown -> HTML for post selftext: bold/italic, strikethrough,
    // superscript, inline code, links. Covers Reddit's markdown subset only.
    function inlineMd(str) {
        let out = str;
        out = out.replace(/`([^`]+)`/g,
            '<code style="background:var(--color-neutral-background-weak,#f0f0f0); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:0.9em;">$1</code>');
        out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener" style="color:#0079d3; text-decoration:underline;">$1</a>');
        out = out.replace(/(\*\*\*|___)([^\n]+?)\1/g, '<strong><em>$2</em></strong>');
        out = out.replace(/(\*\*|__)([^\n]+?)\1/g, '<strong>$2</strong>');
        out = out.replace(/(\*|_)([^\n]+?)\1/g, '<em>$2</em>');
        out = out.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
        out = out.replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>');
        out = out.replace(/\^(\S+)/g, '<sup>$1</sup>');
        return out;
    }

    // Block-level Markdown pass (headers, quotes, lists, rules, code fences).
    // listType/inQuote track open <ul>/<ol>/<blockquote> tags so consecutive
    // matching lines merge into one list/quote.
    function mdToHtml(raw) {
        const text = (raw || '').trim();
        if (!text) return '';

        let escaped = esc(text).replace(/\r\n?/g, '\n');

        escaped = escaped.replace(/&gt;!([^!]+)!&lt;/g,
            '<span class="ghostddit-spoiler" style="background:#373c3f; color:transparent; border-radius:3px; cursor:pointer;" onclick="this.style.background=\'none\';this.style.color=\'inherit\';">$1</span>');

        escaped = escaped.replace(/```([\s\S]*?)```/g, (m, code) =>
            `<pre style="background:var(--color-neutral-background-weak,#f0f0f0); padding:8px 10px; border-radius:6px; overflow-x:auto; font-family:monospace; font-size:0.85em; margin:4px 0;"><code>${code.trim()}</code></pre>`
        );

        const lines = escaped.split('\n');
        const out = [];
        let listType = null; // 'ul' | 'ol' | null
        let inQuote = false;

        const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
        const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

        for (const line of lines) {
            if (/^<pre /.test(line)) { closeList(); closeQuote(); out.push(line); continue; }

            const header = line.match(/^(#{1,6})\s+(.*)$/);
            if (header) {
                closeList(); closeQuote();
                const lvl = header[1].length;
                out.push(`<div style="font-size:${17 - lvl}px; font-weight:700; margin:6px 0 3px;">${inlineMd(header[2])}</div>`);
                continue;
            }

            const rule = line.trim().match(/^([-*_])\1{2,}$/);
            if (rule) {
                closeList(); closeQuote();
                out.push('<hr style="border:none; border-top:1px solid var(--color-neutral-border-weak,#e5e5e5); margin:8px 0;">');
                continue;
            }

            const quote = line.match(/^&gt;\s?(.*)$/);
            if (quote) {
                closeList();
                if (!inQuote) {
                    out.push('<blockquote style="border-left:3px solid var(--color-neutral-border-weak,#ccc); margin:4px 0; padding-left:10px; color:var(--color-neutral-content-weak,#666);">');
                    inQuote = true;
                }
                out.push(`<div>${inlineMd(quote[1])}</div>`);
                continue;
            }
            closeQuote();

            const ul = line.match(/^\s*[-*+]\s+(.*)$/);
            if (ul) {
                if (listType !== 'ul') { closeList(); out.push('<ul style="margin:4px 0; padding-left:20px;">'); listType = 'ul'; }
                out.push(`<li>${inlineMd(ul[1])}</li>`);
                continue;
            }

            const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ol) {
                if (listType !== 'ol') { closeList(); out.push('<ol style="margin:4px 0; padding-left:20px;">'); listType = 'ol'; }
                out.push(`<li>${inlineMd(ol[1])}</li>`);
                continue;
            }

            closeList();
            if (line.trim() === '') {
                out.push('<div style="height:8px;"></div>');
            } else {
                out.push(`<div style="margin:0 0 4px;">${inlineMd(line)}</div>`);
            }
        }
        closeList();
        closeQuote();
        return out.join('');
    }

    function selftextHtml(p) {
        const html = mdToHtml(p.selftext);
        if (!html) return '';
        return `
        <div class="ghostddit-selftext-wrap relative z-10 mb-xs" style="position:relative;">
            <div class="ghostddit-selftext text-14 text-neutral-content" style="word-break:break-word; overflow:hidden; max-height:110px;">${html}</div>
            <div class="ghostddit-selftext-fade" style="display:none; position:absolute; left:0; right:0; bottom:22px; height:26px; background:linear-gradient(to bottom, transparent, var(--color-neutral-background,#fff)); pointer-events:none;"></div>
            <button type="button" class="ghostddit-selftext-toggle text-12 font-semibold text-neutral-content-weak hover:underline" style="background:none;border:none;padding:0;margin-top:4px;cursor:pointer;display:none;position:relative;z-index:1;">Show more</button>
        </div>
        `;
    }

    function postCardHtml(p) {
        const image = getBestImage(p);
        const gallery = getGalleryImages(p);
        const thumbFallback =
            p.thumbnail && /^https?:\/\//.test(p.thumbnail) ? decodeUrlEntities(p.thumbnail) : null;
        const video = p.is_video ? getRedditVideo(p) : null;
        const subLower = (p.subreddit || '').toLowerCase();
        const cachedIcon = iconCache.get(subLower);
        const permalink = `https://www.reddit.com${esc(p.permalink)}`;
        const subUrl = `https://www.reddit.com/r/${esc(p.subreddit)}/`;

        return `
        <div class="ghostddit-card block relative bg-neutral-background hover:bg-neutral-background-hover xs:rounded-4 px-md py-2xs my-2xs">
            <!-- Full-card link; interactive elements sit above it via z-10/relative. -->
            <a class="absolute inset-0" href="${permalink}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"></a>

            <span class="flex justify-between text-12 min-h-[32px] mb-2xs -mt-2xs relative z-10">
            <span class="flex flex-wrap text-12 gap-2xs items-center min-w-0 relative">
                <span class="flex items-center gap-2xs">
                <a class="text-neutral-content whitespace-nowrap flex items-center h-xl text-label-2 no-visited no-underline hover:no-underline cursor-pointer relative z-10"
                    href="${subUrl}" target="_blank" rel="noopener">
                    <div class="pe-[6px] flex">
                    <span class="ghostddit-icon-slot inline-flex items-center justify-center w-lg h-lg relative" data-subreddit="${esc(subLower)}" ${cachedIcon ? 'data-icon-applied="1"' : ''}>
                        ${cachedIcon ? `<span class="inline-block rounded-full relative h-full w-full"><img src="${esc(cachedIcon)}" alt="" class="ghostddit-icon-img mb-0 shreddit-subreddit-icon__icon rounded-full overflow-hidden w-full h-full" width="24" style="width:24px;height:24px;object-fit:cover;" loading="lazy" onerror="this.remove();"></span>` : ''}
                    </span>
                    </div>
                    <span>r/${esc(p.subreddit)}</span>
                </a>
                </span>
                <span class="inline-block my-0 created-separator text-neutral-content-weak" aria-hidden="true">•</span>
                <span class="whitespace-nowrap text-neutral-content-weak">${timeAgo(p.created_utc)}</span>
            </span>
            </span>

            <a href="${permalink}" target="_blank" rel="noopener" class="block relative z-10 text-neutral-content-strong m-0 visited:text-neutral-content-weak font-semibold text-16-scalable xs:text-18-scalable mb-2xs xs:mb-xs overflow-hidden" dir="auto">${esc(p.title)}</a>

            ${p.is_self ? selftextHtml(p) : ''}
            ${video
                ? `<div class="relative z-10 overflow-hidden mb-xs bg-black rounded-4 mx-auto" style="height:min(420px,60vh); max-width:100%; aspect-ratio:${video.width}/${video.height};"><video src="${esc(video.url)}" poster="${thumbFallback ? esc(thumbFallback) : ''}" controls preload="metadata" playsinline style="display:block;width:100%;height:100%;object-fit:contain;background:#000;" onerror="this.parentElement.style.display='none'"></video></div>`
                : (gallery
                    ? `<div class="ghostddit-gallery relative z-10 overflow-hidden mb-xs rounded-4 bg-black" style="height:min(420px,60vh); width:100%;">
                    <img class="ghostddit-gallery-bg" src="${esc(gallery[0].url)}" alt="" aria-hidden="true" style="position:absolute; inset:-24px; width:calc(100% + 48px); height:calc(100% + 48px); object-fit:cover; filter:blur(28px) brightness(0.55); transform:scale(1.1); z-index:0; pointer-events:none;">
                    <img class="ghostddit-gallery-img" src="${esc(gallery[0].url)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'" style="position:relative; z-index:1; display:block; width:100%; height:100%; object-fit:contain; object-position:center;">
                    ${gallery.length > 1 ? `
                    <button type="button" class="ghostddit-gallery-prev" aria-label="Previous image" style="position:absolute; z-index:2; left:8px; top:50%; transform:translateY(-50%); width:32px; height:32px; border-radius:9999px; background:rgba(0,0,0,0.6); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;">
                        <svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" style="display:block"><path d="M6.3 10c0-.23.088-.46.264-.636l4.6-4.6a.9.9 0 111.273 1.272L8.474 10l3.963 3.964a.9.9 0 01-1.273 1.272l-4.6-4.6A.897.897 0 016.3 10z"/></svg>
                    </button>
                    <button type="button" class="ghostddit-gallery-next" aria-label="Next image" style="position:absolute; z-index:2; right:8px; top:50%; transform:translateY(-50%); width:32px; height:32px; border-radius:9999px; background:rgba(0,0,0,0.6); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;">
                        <svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" style="display:block"><path d="M13.7 10c0 .23-.088.46-.264.636l-4.6 4.6a.9.9 0 11-1.273-1.272L11.526 10 7.563 6.036a.9.9 0 011.273-1.272l4.6 4.6A.897.897 0 0113.7 10z"/></svg>
                    </button>
                    <span class="ghostddit-gallery-counter" style="position:absolute; z-index:2; top:8px; right:8px; background:rgba(0,0,0,0.6); color:#fff; font-size:11px; padding:2px 8px; border-radius:9999px;">1 / ${gallery.length}</span>
                    <div class="ghostddit-gallery-loader" style="display:none; position:absolute; inset:0; z-index:3; align-items:center; justify-content:center; pointer-events:none;">
                        <div class="ghostddit-gallery-spinner"></div>
                    </div>
                    ` : ''}
                    </div>`
                    : (image ? `<div class="relative z-10 overflow-hidden mb-xs rounded-4 bg-black" style="height:min(420px,60vh); width:100%;">
                    <img aria-hidden="true" src="${esc(image.url)}" alt="" style="position:absolute; inset:-24px; width:calc(100% + 48px); height:calc(100% + 48px); object-fit:cover; filter:blur(28px) brightness(0.55); transform:scale(1.1); z-index:0; pointer-events:none;">
                    <img src="${esc(image.url)}" alt="" loading="lazy" ${thumbFallback && thumbFallback !== image.url ? `onerror="if(this.src!=='${esc(thumbFallback)}'){this.src='${esc(thumbFallback)}';}else{this.parentElement.style.display='none';}"` : `onerror="this.parentElement.style.display='none'"`} style="position:relative; z-index:1; display:block; width:100%; height:100%; object-fit:contain; object-position:center;">
                    </div>` : ''))
            }

            <span class="flex items-center text-12 text-neutral-content-weak relative z-10" style="margin-top:8px; gap:16px;">
            <span class="ghostddit-vote flex items-center" style="gap:6px;">
                <span style="display:inline-flex; color:inherit;">
                <svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" style="display:block"><path d="M10 19a3.966 3.966 0 01-3.96-3.962V10.98H2.838a1.731 1.731 0 01-1.605-1.073 1.734 1.734 0 01.377-1.895L9.364.254a.925.925 0 011.272 0l7.754 7.759c.498.499.646 1.242.376 1.894-.27.652-.9 1.073-1.605 1.073h-3.202v4.058A3.965 3.965 0 019.999 19H10zM2.989 9.179H7.84v5.731c0 1.13.81 2.163 1.934 2.278a2.163 2.163 0 002.386-2.15V9.179h4.851L10 2.163 2.989 9.179z"/></svg>
                </span>
                <span class="font-semibold text-neutral-content-strong">${formatCount(p.score)}</span>
                <span style="display:inline-flex; color:inherit;">
                <svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" style="display:block"><path d="M10 1a3.966 3.966 0 013.96 3.962V9.02h3.202c.706 0 1.335.42 1.605 1.073.27.652.122 1.396-.377 1.895l-7.754 7.759a.925.925 0 01-1.272 0l-7.754-7.76a1.734 1.734 0 01-.376-1.894c.27-.652.9-1.073 1.605-1.073h3.202V4.962A3.965 3.965 0 0110 1zm7.01 9.82h-4.85V5.09c0-1.13-.81-2.163-1.934-2.278a2.163 2.163 0 00-2.386 2.15v5.859H2.989l7.01 7.016 7.012-7.016z"/></svg>
                </span>
            </span>
            <a class="flex items-center relative z-10 hover:underline" href="${permalink}" target="_blank" rel="noopener" style="gap:6px;">
                <span style="display:inline-flex; color:inherit;">
                <svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" style="display:block"><path d="M10 1a9 9 0 00-9 9c0 1.947.79 3.58 1.935 4.957L.231 17.661A.784.784 0 00.785 19H10a9 9 0 009-9 9 9 0 00-9-9zm0 16.2H6.162c-.994.004-1.907.053-3.045.144l-.076-.188a36.981 36.981 0 002.328-2.087l-1.05-1.263C3.297 12.576 2.8 11.331 2.8 10c0-3.97 3.23-7.2 7.2-7.2s7.2 3.23 7.2 7.2-3.23 7.2-7.2 7.2z"/></svg>
                </span>
                <span>${formatCount(p.num_comments)}</span>
            </a>
            </span>
        </div>
        `;
    }

    function ensurePanel(emptyFeedEl, options) {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;

        const opts = options || {};
        const headerText = opts.headerText || 'Revealed Posts';

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
        <div class="ghostddit-header">
            <span class="ghostddit-badge">Ghostddit</span>
            <span class="ghostddit-header-text">${headerText}</span>
        </div>
        <div class="ghostddit-list"></div>
        <div class="ghostddit-status"></div>
        <div class="ghostddit-sentinel" aria-hidden="true"></div>
        `;

        emptyFeedEl.insertAdjacentElement('afterend', panel);

        // Infinite scroll: fetches the next page when the sentinel nears
        // the viewport. Stashed on the panel so it can be disconnected when
        // the panel is torn down.
        const sentinel = panel.querySelector('.ghostddit-sentinel');
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMore(generation);
            },
            { root: null, rootMargin: '600px 0px', threshold: 0 }
        );
        io.observe(sentinel);
        panel._ghostdditObserver = io;

        // Stop these from bubbling to Reddit's own components, which would
        // otherwise trigger their hover/focus UI on unrelated elements.
        ['mouseover', 'mouseout', 'focusin', 'focusout', 'pointerover', 'pointerout']
            .forEach((evt) => panel.addEventListener(evt, (e) => e.stopPropagation()));

        return panel;
    }

    function setStatus(panel, text) {
        panel.querySelector('.ghostddit-status').textContent = text || '';
    }

    function setupGalleryCard(cardEl, gallery) {
        const imgEl = cardEl.querySelector('.ghostddit-gallery-img');
        const bgEl = cardEl.querySelector('.ghostddit-gallery-bg');
        const prevBtn = cardEl.querySelector('.ghostddit-gallery-prev');
        const nextBtn = cardEl.querySelector('.ghostddit-gallery-next');
        const counterEl = cardEl.querySelector('.ghostddit-gallery-counter');
        const loaderEl = cardEl.querySelector('.ghostddit-gallery-loader');
        if (!imgEl || !gallery || gallery.length < 2) return;

        let index = 0;
        // Bumped on every navigation; a stale load/error event is ignored
        // if it doesn't match the current token.
        let loadToken = 0;

        function updateChrome() {
            if (counterEl) counterEl.textContent = `${index + 1} / ${gallery.length}`;
            if (prevBtn) {
                prevBtn.style.opacity = index === 0 ? '0.4' : '1';
                prevBtn.style.cursor = index === 0 ? 'default' : 'pointer';
            }
            if (nextBtn) {
                nextBtn.style.opacity = index === gallery.length - 1 ? '0.4' : '1';
                nextBtn.style.cursor = index === gallery.length - 1 ? 'default' : 'pointer';
            }
        }

        function goTo(newIndex) {
            index = newIndex;
            const targetUrl = gallery[index].url;
            const myToken = ++loadToken;

            // Show a spinner until the new image is ready.
            if (loaderEl) loaderEl.style.display = 'flex';
            imgEl.style.opacity = '0';

            imgEl.onload = () => {
                if (myToken !== loadToken) return; // superseded by a later click
                if (loaderEl) loaderEl.style.display = 'none';
                imgEl.style.opacity = '1';
            };
            imgEl.onerror = () => {
                if (myToken !== loadToken) return;
                if (loaderEl) loaderEl.style.display = 'none';
                imgEl.style.opacity = '1';
                const container = cardEl.querySelector('.ghostddit-gallery');
                if (container) container.style.display = 'none';
            };

            imgEl.src = targetUrl;
            if (bgEl) bgEl.src = targetUrl;
            updateChrome();
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (index > 0) goTo(index - 1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (index < gallery.length - 1) goTo(index + 1);
            });
        }

        updateChrome();
    }

    function setupSelftextCard(cardEl) {
        const textEl = cardEl.querySelector('.ghostddit-selftext');
        const toggleBtn = cardEl.querySelector('.ghostddit-selftext-toggle');
        const fadeEl = cardEl.querySelector('.ghostddit-selftext-fade');
        if (!textEl || !toggleBtn) return;

        const isOverflowing = textEl.scrollHeight > textEl.clientHeight + 1;
        if (!isOverflowing) return;

        toggleBtn.style.display = 'inline-block';
        if (fadeEl) fadeEl.style.display = 'block';

        let expanded = false;
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            expanded = !expanded;
            textEl.style.maxHeight = expanded ? 'none' : '110px';
            if (fadeEl) fadeEl.style.display = expanded ? 'none' : 'block';
            toggleBtn.textContent = expanded ? 'Show less' : 'Show more';
        });
    }

    function renderPosts(panel, posts) {
        const list = panel.querySelector('.ghostddit-list');
        const frag = document.createDocumentFragment();
        const cardEls = [];
        posts.forEach((p) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = postCardHtml(p);
            const cardEl = wrapper.firstElementChild;
            const gallery = getGalleryImages(p);
            if (gallery) setupGalleryCard(cardEl, gallery);
            cardEls.push(cardEl);
            frag.appendChild(cardEl);
        });
        list.appendChild(frag);
        cardEls.forEach((cardEl) => setupSelftextCard(cardEl));
    }

    // `myGeneration` is the generation captured when this fetch started;
    // if it no longer matches the current `generation`, the user has
    // navigated away and the result is discarded.
    async function loadMore(myGeneration) {
        if (myGeneration !== generation) return;
        if (loading || exhausted || !currentUsername) return;
        loading = true;

        const panel = document.getElementById(PANEL_ID);
        setStatus(panel, 'Fetching posts…');

        function disconnectSentinel() {
            try { panel?._ghostdditObserver?.disconnect(); } catch (e) {}
        }

        try {
            const { posts, after } = await fetchPosts(currentUsername, currentSort, currentTimeframe, afterToken);
            if (myGeneration !== generation) return;

            afterToken = after;

            const newPosts = posts.filter((post) => post && post.id && !seenPostIds.has(post.id));

            if (!newPosts.length) {
                exhausted = true;
                setStatus(panel, panel.querySelector('.ghostddit-card')
                    ? 'No more posts.'
                    : 'No public posts found via search.');
                disconnectSentinel();
            } else {
                newPosts.forEach((post) => seenPostIds.add(post.id));
                renderPosts(panel, newPosts);
                setStatus(panel, '');
                if (!afterToken) {
                    exhausted = true;
                    disconnectSentinel();
                }
                loadIconsForPosts(panel, newPosts);
            }
        } catch (err) {
            if (myGeneration !== generation) return;
            if (!isExtensionContextValid() || /extension context invalidated/i.test(err.message || '')) {
                handleInvalidContext();
            } else {
                setStatus(panel, `Couldn't load posts (${err.message}). Scroll to retry.`);
                // Also retry automatically in case the user is already
                // parked at the bottom and won't trigger the sentinel again.
                setTimeout(() => {
                    if (myGeneration === generation) loadMore(myGeneration);
                }, 4000);
            }
        } finally {
            if (myGeneration === generation) {
                loading = false;
            }
        }
    }

    function tryInject() {
        if (!isExtensionContextValid()) {
            handleInvalidContext();
            return;
        }

        const ctx = parseProfileContext();
        if (!ctx) return;

        const emptyFeedEl = findEmptyFeedContent();
        if (!emptyFeedEl) return;

        const key = contextKey(ctx);

        if (key === lastContextKey) {
            // Same view: reattach a detached panel without refetching, or
            // rebuild from scratch if it's gone entirely.
            const panel = document.getElementById(PANEL_ID);
            if (panel && !panel.isConnected) {
                emptyFeedEl.insertAdjacentElement('afterend', panel);
            } else if (!panel) {
                lastContextKey = null;
                tryInject();
            }
            return;
        }

        lastContextKey = key;
        generation += 1;
        const myGeneration = generation;

        const oldPanel = document.getElementById(PANEL_ID);
        if (oldPanel) {
            try { oldPanel._ghostdditObserver?.disconnect(); } catch (e) {}
            oldPanel.remove();
        }

        if (ctx.tab === 'comments') {
            currentCommentsUsername = ctx.username;
            currentCommentsSort = ctx.sort;
            seenCommentIds = new Set();
            nextCommentsUrl = null;
            commentsLoading = false;
            commentsExhausted = false;

            const panel = ensurePanel(emptyFeedEl, { headerText: 'Revealed Comments' });
            // Replace ensurePanel()'s default posts-pagination observer.
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
            setupCommentsSentinel(panel, myGeneration);
            loadComments(myGeneration, panel);
            return;
        }

        currentUsername = ctx.username;
        currentSort = ctx.sort;
        currentTimeframe = ctx.timeframe;
        afterToken = null;
        exhausted = false;
        loading = false;
        seenPostIds = new Set();

        const panel = ensurePanel(emptyFeedEl, { headerText: 'Revealed Posts' });
        loadMore(myGeneration);
    }

    // ---------------------------------------------------------------------
    // Update banner
    //
    // Reads the release info background.js stores in chrome.storage.local
    // and shows a dismissible banner when a newer version is available.
    // Dismissal is remembered per-version.
    // ---------------------------------------------------------------------
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
            if (res[UPDATE_DISMISSED_KEY] === info.latestVersion) return; // already dismissed this version
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

        // Picks up a check that finishes after this page already loaded.
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[UPDATE_INFO_KEY]) {
                renderUpdateBanner(changes[UPDATE_INFO_KEY].newValue);
            }
        });
    }

    // Broad subtree observer catches #empty-feed-content appearing/disappearing
    // as Reddit re-renders its feed component in place.
    const observer = new MutationObserver(() => tryInject());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Patches history.pushState/replaceState to fire a custom event, since
    // Reddit's SPA navigation doesn't trigger a real page load or popstate.
    // The 300ms delay lets Reddit's router swap in the new page first.
    ['pushState', 'replaceState'].forEach((fn) => {
        const orig = history[fn];
        history[fn] = function (...args) {
            const ret = orig.apply(this, args);
            window.dispatchEvent(new Event('ghostddit:locationchange'));
            return ret;
        };
    });
    window.addEventListener('popstate', () =>
        window.dispatchEvent(new Event('ghostddit:locationchange'))
    );
    window.addEventListener('ghostddit:locationchange', () => {
        setTimeout(tryInject, 300);
    });

    tryInject();
    initUpdateBanner();
})();