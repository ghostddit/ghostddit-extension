// Inject the panel when the profile view is detected.

function injectAt(ctx, anchorEl, keySuffix, headerPrefix) {
    const key = contextKey(ctx) + (keySuffix || '');
    const isForce = keySuffix === '|force';
    const hintText = isForce ? 'Ctrl+G / Cmd+G to turn off' : '';

    if (key === lastContextKey) {
        const panel = document.getElementById(PANEL_ID);
        if (panel && !panel.isConnected) {
            anchorEl.insertAdjacentElement('afterend', panel);
        } else if (!panel) {
            lastContextKey = null;
            injectAt(ctx, anchorEl, keySuffix, headerPrefix);
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

        const panel = ensurePanel(anchorEl, { headerText: `${headerPrefix || ''}Revealed Comments`, hintText });
        try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        setupCommentsSentinel(panel, myGeneration);
        loadComments(myGeneration, panel);
        return;
    }

    if (ctx.tab === 'overview') {
        currentUsername = ctx.username;
        currentSort = ctx.sort;
        currentTimeframe = ctx.timeframe;
        afterToken = null;
        seenPostIds = new Set();
        currentCommentsUsername = ctx.username;
        currentCommentsSort = ctx.sort;
        nextCommentsUrl = null;
        seenCommentIds = new Set();
        overviewPostBuffer = [];
        overviewCommentBuffer = [];
        overviewPostsDone = false;
        overviewCommentsDone = false;
        overviewLoading = false;
        overviewRenderedCount = 0;

        const panel = ensurePanel(anchorEl, { headerText: `${headerPrefix || ''}Revealed Posts & Comments`, hintText });
        try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        setupOverviewSentinel(panel, myGeneration);
        loadOverview(myGeneration, panel);
        return;
    }

    currentUsername = ctx.username;
    currentSort = ctx.sort;
    currentTimeframe = ctx.timeframe;
    afterToken = null;
    exhausted = false;
    loading = false;
    seenPostIds = new Set();

    ensurePanel(anchorEl, { headerText: `${headerPrefix || ''}Revealed Posts`, hintText });
    loadMore(myGeneration);
}

function removeStalePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
        try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        panel.remove();
    }
    lastContextKey = null;
    unhideAutoFeed();
}

function tryInject() {
    if (!isExtensionContextValid()) {
        handleInvalidContext();
        return;
    }

    if (forceMode) {
        const forceCtx = parseProfileContext();
        if (forceCtx) forceInject(forceCtx);
        return;
    }

    const ctx = parseProfileContext();
    if (!ctx) {
        if (lastContextKey) removeStalePanel();
        return;
    }

    const key = contextKey(ctx);

    if (key === lastContextKey) {
        if (document.getElementById(PANEL_ID)) return;
        lastContextKey = null;
    }

    clearTimeout(injectCheckTimer);
    injectCheckTimer = setTimeout(() => {
        if (forceMode) return;

        const stillCtx = parseProfileContext();
        if (!stillCtx || contextKey(stillCtx) !== key) return;

        if (!findEmptyFeedContent()) {
            removeStalePanel();
            return;
        }

        const feedEl = findFeedElement();
        if (!feedEl) return;

        if (autoHiddenEl && autoHiddenEl !== feedEl) unhideAutoFeed();
        autoHiddenEl = feedEl;
        hideFeedElement(feedEl);
        watchAutoHiddenFeed(feedEl);

        injectAt(stillCtx, feedEl, '', '');
    }, 400);
}