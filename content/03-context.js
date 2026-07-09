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
    function findEmptyFeedContent() {
        return document.querySelector('shreddit-feed #empty-feed-content');
    }