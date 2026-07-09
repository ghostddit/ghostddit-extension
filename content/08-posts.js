// Render the revealed posts panel, cards, and pagination.
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

        const sentinel = panel.querySelector('.ghostddit-sentinel');
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMore(generation);
            },
            { root: null, rootMargin: '600px 0px', threshold: 0 }
        );
        io.observe(sentinel);
        panel._ghostdditObserver = io;

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