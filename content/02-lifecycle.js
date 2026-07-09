// Guard against extension context invalidation.
    function isExtensionContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function handleInvalidContext() {
        if (contextInvalidatedNoticeShown) return;
        contextInvalidatedNoticeShown = true;
        try { observer.disconnect(); } catch (e) {}
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
            setStatus(panel, 'Ghostddit was updated — refresh this page to keep using it.');
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        }
    }