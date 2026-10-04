// Detect Reddit profile pages and the active tab.

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

function contextKey(ctx) {
    return `${ctx.username}|${ctx.tab}|${ctx.sort}|${ctx.timeframe || ''}`;
}

// Old Reddit is served on old.reddit.com, but also on www.reddit.com for
// users with the "use old Reddit" preference, so detect it from the DOM.
function isOldReddit() {
    return location.hostname === 'old.reddit.com' || !!document.getElementById('header-bottom-left');
}

function findEmptyFeedContent() {
    if (isOldReddit()) {
        // Old Reddit renders an empty listing as #siteTable > p#noresults.
        const siteTable = document.getElementById('siteTable');
        if (!siteTable) return null;
        return siteTable.querySelector('#noresults') || (siteTable.querySelector('.thing') ? null : siteTable);
    }
    return document.querySelector('shreddit-feed #empty-feed-content');
}