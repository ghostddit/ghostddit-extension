// Render a small subset of Reddit markdown for post self text.
    function inlineMd(str) {
        let out = str;
        out = out.replace(/`([^`]+)`/g,
            '<code style="background:var(--color-neutral-background-weak,#f0f0f0); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:0.9em;">$1</code>');
        out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener" style="color:#0079d3; text-decoration:underline;">$1</a>');
        out = out.replace(/(\*\*\*|___)([^\n]+?)\1/g, '<strong><em>$2</em></strong>');
        out = out.replace(/(\*\*|__)([^\n]+?)\1/g, '<strong>$2</strong>');
        out = out.replace(/(\*|_)([^\n]+?)\1/g, '<em>$2</em>');
        out = out.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
        out = out.replace(/\^\(([^)]+)\)/g, '<sup>$1</sup>');
        out = out.replace(/\^(\S+)/g, '<sup>$1</sup>');
        return out;
    }

    function mdToHtml(raw) {
        const text = (raw || '').trim();
        if (!text) return '';

        let escaped = esc(text).replace(/\r\n?/g, '\n');

        escaped = escaped.replace(/&gt;!([^!]+)!&lt;/g,
            '<span class="ghostddit-spoiler" style="background:#373c3f; color:transparent; border-radius:3px; cursor:pointer;" onclick="this.style.background=\'none\';this.style.color=\'inherit\';">$1</span>');

        escaped = escaped.replace(/```([\s\S]*?)```/g, (m, code) =>
            `<pre style="background:var(--color-neutral-background-weak,#f0f0f0); padding:8px 10px; border-radius:6px; overflow-x:auto; font-family:monospace; font-size:0.85em; margin:4px 0;"><code>${code.trim()}</code></pre>`
        );

        const lines = escaped.split('\n');
        const out = [];
        let listType = null; // 'ul' | 'ol' | null
        let inQuote = false;

        const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
        const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };

        for (const line of lines) {
            if (/^<pre /.test(line)) { closeList(); closeQuote(); out.push(line); continue; }

            const header = line.match(/^(#{1,6})\s+(.*)$/);
            if (header) {
                closeList(); closeQuote();
                const lvl = header[1].length;
                out.push(`<div style="font-size:${17 - lvl}px; font-weight:700; margin:6px 0 3px;">${inlineMd(header[2])}</div>`);
                continue;
            }

            const rule = line.trim().match(/^([-*_])\1{2,}$/);
            if (rule) {
                closeList(); closeQuote();
                out.push('<hr style="border:none; border-top:1px solid var(--color-neutral-border-weak,#e5e5e5); margin:8px 0;">');
                continue;
            }

            const quote = line.match(/^&gt;\s?(.*)$/);
            if (quote) {
                closeList();
                if (!inQuote) {
                    out.push('<blockquote style="border-left:3px solid var(--color-neutral-border-weak,#ccc); margin:4px 0; padding-left:10px; color:var(--color-neutral-content-weak,#666);">');
                    inQuote = true;
                }
                out.push(`<div>${inlineMd(quote[1])}</div>`);
                continue;
            }
            closeQuote();

            const ul = line.match(/^\s*[-*+]\s+(.*)$/);
            if (ul) {
                if (listType !== 'ul') { closeList(); out.push('<ul style="margin:4px 0; padding-left:20px;">'); listType = 'ul'; }
                out.push(`<li>${inlineMd(ul[1])}</li>`);
                continue;
            }

            const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ol) {
                if (listType !== 'ol') { closeList(); out.push('<ol style="margin:4px 0; padding-left:20px;">'); listType = 'ol'; }
                out.push(`<li>${inlineMd(ol[1])}</li>`);
                continue;
            }

            closeList();
            if (line.trim() === '') {
                out.push('<div style="height:8px;"></div>');
            } else {
                out.push(`<div style="margin:0 0 4px;">${inlineMd(line)}</div>`);
            }
        }
        closeList();
        closeQuote();
        return out.join('');
    }

    function selftextHtml(p) {
        const html = mdToHtml(p.selftext);
        if (!html) return '';
        return `
        <div class="ghostddit-selftext-wrap relative z-10 mb-xs" style="position:relative;">
            <div class="ghostddit-selftext text-14 text-neutral-content" style="word-break:break-word; overflow:hidden; max-height:110px;">${html}</div>
            <div class="ghostddit-selftext-fade" style="display:none; position:absolute; left:0; right:0; bottom:22px; height:26px; background:linear-gradient(to bottom, transparent, var(--color-neutral-background,#fff)); pointer-events:none;"></div>
            <button type="button" class="ghostddit-selftext-toggle text-12 font-semibold text-neutral-content-weak hover:underline" style="background:none;border:none;padding:0;margin-top:4px;cursor:pointer;display:none;position:relative;z-index:1;">Show more</button>
        </div>
        `;
    }