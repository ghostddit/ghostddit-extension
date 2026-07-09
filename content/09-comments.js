// Render revealed comments and paginate through search results.
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

                const permalinkEl = card.querySelector('a[aria-labelledby^="comment-content-"]');
                const permalink = permalinkEl && permalinkEl.getAttribute('href');
                if (!permalink) return;
                const postPermalink = permalink.replace(/[^/]+\/$/, '');

                const contentWrap = card.querySelector('[data-testid="search-comment-content"]');
                const bodyEl = contentWrap && contentWrap.querySelector('[id^="search-comment-"][id$="-post-rtjson-content"]');
                const voteEl = contentWrap && contentWrap.querySelector('faceplate-number');
                const voteCount = voteEl ? (parseInt(voteEl.getAttribute('number'), 10) || 0) : 0;
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
            }
        });

        return comments;
    }

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