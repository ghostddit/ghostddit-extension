// Extract the richest media preview from Reddit post data.
    function getRedditVideo(p) {
        const rv = (p && (p.secure_media || p.media) || {}).reddit_video;
        if (!rv || !rv.fallback_url) return null;
        return {
            url: decodeUrlEntities(rv.fallback_url),
            width: rv.width || 16,
            height: rv.height || 9
        };
    }

    function getBestImage(p) {
        const src = p && p.preview && p.preview.images && p.preview.images[0] && p.preview.images[0].source;
        if (src && src.url) {
            return { url: decodeUrlEntities(src.url), width: src.width || 1, height: src.height || 1 };
        }
        if (p.thumbnail && /^https?:\/\//.test(p.thumbnail)) {
            return { url: decodeUrlEntities(p.thumbnail), width: p.thumbnail_width || 1, height: p.thumbnail_height || 1 };
        }
        return null;
    }

    function getGalleryImages(p) {
        if (!p.is_gallery || !p.gallery_data || !Array.isArray(p.gallery_data.items) || !p.media_metadata) {
            return null;
        }
        const imgs = p.gallery_data.items
            .map((item) => {
                const meta = p.media_metadata[item.media_id];
                if (!meta || meta.status !== 'valid' || !meta.s || !meta.s.u) return null;
                return { url: decodeUrlEntities(meta.s.u), width: meta.s.x || 1, height: meta.s.y || 1 };
            })
            .filter(Boolean);
        return imgs.length ? imgs : null;
    }