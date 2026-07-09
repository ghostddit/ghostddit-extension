// Inject the panel when the profile view is detected.
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