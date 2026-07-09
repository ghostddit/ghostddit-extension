// Shared state for the injected UI.
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

    let currentCommentsUsername = null;
    let currentCommentsSort = null;
    let seenCommentIds = new Set();
    let nextCommentsUrl = null;
    let commentsLoading = false;
    let commentsExhausted = false;