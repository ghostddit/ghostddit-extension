// Observe Reddit navigation and initialize the injected UI.
    const observer = new MutationObserver(() => tryInject());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    ['pushState', 'replaceState'].forEach((fn) => {
        const orig = history[fn];
        history[fn] = function (...args) {
            const ret = orig.apply(this, args);
            window.dispatchEvent(new Event('ghostddit:locationchange'));
            return ret;
        };
    });
    window.addEventListener('popstate', () =>
        window.dispatchEvent(new Event('ghostddit:locationchange'))
    );
    window.addEventListener('ghostddit:locationchange', () => {
        setTimeout(tryInject, 300);
    });

    tryInject();
    initUpdateBanner();