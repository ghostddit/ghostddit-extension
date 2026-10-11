// Overview tab: merge revealed posts and comments into one feed, the way
// Reddit's own overview interleaves them.

// Both searches return results in the profile's sort order, so they're
// merged on the same key: score for "top", otherwise creation time (the
// two searches share no comparable key for hot/controversial).
function overviewPostKey(p) {
    return Number(currentSort === 'top' ? p.score : p.created_utc) || 0;
}

function overviewCommentKey(c) {
    if (currentSort === 'top') return Number(c.voteCount) || 0;
    // An undated comment is placed right away rather than holding back the merge.
    return c.createdUnix ?? Infinity;
}

// Take items in merged order while both buffer heads can be compared. Stop
// as soon as a buffer runs dry while its source still has more, since its
// next page could hold an item that belongs before the other buffer's head.
function takeMergedOverviewItems() {
    const items = [];
    while (overviewPostBuffer.length || overviewCommentBuffer.length) {
        if (!overviewPostBuffer.length && !overviewPostsDone) break;
        if (!overviewCommentBuffer.length && !overviewCommentsDone) break;
        const takePost = !overviewCommentBuffer.length ||
            (overviewPostBuffer.length &&
                overviewPostKey(overviewPostBuffer[0]) >= overviewCommentKey(overviewCommentBuffer[0]));
        items.push(takePost
            ? { kind: 'post', data: overviewPostBuffer.shift() }
            : { kind: 'comment', data: overviewCommentBuffer.shift() });
    }
    return items;
}

// Render runs of consecutive posts or comments with the existing renderers,
// which append to the list in order.
function renderOverviewItems(panel, items) {
    let run = [];
    let runKind = null;
    const flush = () => {
        if (!run.length) return;
        if (runKind === 'post') renderPosts(panel, run);
        else renderComments(panel, run);
        run = [];
    };
    items.forEach((item) => {
        if (item.kind !== runKind) {
            flush();
            runKind = item.kind;
        }
        run.push(item.data);
    });
    flush();
}

// The observer only fires when the sentinel's visibility changes. A short
// batch may not push it out of range, so re-observe to get a fresh reading.
function rearmSentinel(panel) {
    const io = panel._ghostdditObserver;
    const sentinel = panel.querySelector('.ghostddit-sentinel');
    if (!io || !sentinel) return;
    io.unobserve(sentinel);
    io.observe(sentinel);
}

async function loadOverview(myGeneration, panel) {
    if (myGeneration !== generation) return;
    if (overviewLoading || !currentUsername) return;
    if (overviewPostsDone && overviewCommentsDone && !overviewPostBuffer.length && !overviewCommentBuffer.length) return;
    overviewLoading = true;

    setStatus(panel, 'Fetching posts and comments…');
    try {
        // Refill whichever buffer ran dry so the merge can compare both heads.
        const needPosts = !overviewPostBuffer.length && !overviewPostsDone;
        const needComments = !overviewCommentBuffer.length && !overviewCommentsDone;
        const [postsResp, commentsResp] = await Promise.all([
            needPosts ? fetchPosts(currentUsername, currentSort, currentTimeframe, afterToken) : null,
            needComments
                ? fetchCommentsPage(nextCommentsUrl || commentSearchUrl(currentCommentsUsername, currentCommentsSort))
                : null
        ]);
        if (myGeneration !== generation) return;

        if (postsResp) {
            afterToken = postsResp.after;
            const newPosts = postsResp.posts.filter((p) => p && p.id && !seenPostIds.has(p.id));
            newPosts.forEach((p) => seenPostIds.add(p.id));
            overviewPostBuffer.push(...newPosts);
            if (!afterToken || !newPosts.length) overviewPostsDone = true;
        }
        if (commentsResp) {
            nextCommentsUrl = commentsResp.nextUrl;
            const newComments = commentsResp.comments.filter((c) => c.id && !seenCommentIds.has(c.id));
            newComments.forEach((c) => seenCommentIds.add(c.id));
            overviewCommentBuffer.push(...newComments);
            // A page with nothing new means the search is repeating itself.
            if (!nextCommentsUrl || !newComments.length) overviewCommentsDone = true;
        }

        const items = takeMergedOverviewItems();
        if (items.length) {
            renderOverviewItems(panel, items);
            overviewRenderedCount += items.length;
            loadIconsForPosts(panel, items.filter((i) => i.kind === 'post').map((i) => i.data));
            loadIconsForComments(panel, items.filter((i) => i.kind === 'comment').map((i) => i.data));
        }

        if (overviewPostsDone && overviewCommentsDone && !overviewPostBuffer.length && !overviewCommentBuffer.length) {
            setStatus(panel, overviewRenderedCount
                ? 'No more posts or comments.'
                : 'No public posts or comments found via search.');
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        } else {
            setStatus(panel, '');
            rearmSentinel(panel);
        }
    } catch (err) {
        if (myGeneration !== generation) return;
        if (!isExtensionContextValid() || /extension context invalidated/i.test(err.message || '')) {
            handleInvalidContext();
        } else {
            setStatus(panel, `Couldn't load posts and comments (${err.message}). Scroll to retry.`);
            setTimeout(() => {
                if (myGeneration === generation) loadOverview(myGeneration, panel);
            }, 4000);
        }
    } finally {
        if (myGeneration === generation) {
            overviewLoading = false;
        }
    }
}

function setupOverviewSentinel(panel, myGeneration) {
    const sentinel = panel.querySelector('.ghostddit-sentinel');
    if (!sentinel) return;
    const io = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) loadOverview(myGeneration, panel);
        },
        { root: null, rootMargin: '600px 0px', threshold: 0 }
    );
    io.observe(sentinel);
    panel._ghostdditObserver = io;
}
