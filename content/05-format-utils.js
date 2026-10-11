// Small helpers for rendering post metadata.

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

// Build links against the page's own origin so old.reddit.com stays on old Reddit.
function redditOrigin() {
    return location.origin;
}

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function decodeUrlEntities(str) {
    if (typeof str !== 'string') return str;
    return str
        .split('&amp;').join('&')
        .split('&quot;').join('"')
        .split('&#39;').join("'");
}