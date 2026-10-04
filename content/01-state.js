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

// Overview merges both feeds; it reuses the cursors and seen-sets above and
// buffers fetched items until they can be placed in order.
let overviewPostBuffer = [];
let overviewCommentBuffer = [];
let overviewPostsDone = false;
let overviewCommentsDone = false;
let overviewLoading = false;
let overviewRenderedCount = 0;

const FORCE_MODE_COOKIE = 'ghostddit_force_mode';

function readForceModeCookie() {
    try {
        const match = document.cookie.match(/(?:^|;\s*)ghostddit_force_mode=(true|false)(?:;|$)/);
        return !!match && match[1] === 'true';
    } catch (e) {
        return false;
    }
}

function writeForceModeCookie(value) {
    try {
        document.cookie = `${FORCE_MODE_COOKIE}=${value ? 'true' : 'false'}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}
}

let forceMode = readForceModeCookie();
let forceHiddenEl = null;
let forceStyleObserver = null;
let forceStyleObserverEl = null;
let autoHiddenEl = null;
let autoStyleObserver = null;
let autoStyleObserverEl = null;
let injectCheckTimer = null;