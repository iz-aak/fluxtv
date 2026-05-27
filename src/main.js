import '../css/main.css';
import { TMDB_KEY, baseURL } from './config.js';
import { store } from './state.js';
import { isMobile, isIOS, fmt } from './utils/helpers.js';
import { haptic } from './utils/haptics.js';
import { initLoaderBackdrop, hideLoader, setShouldHideLoader } from './ui/loader.js';

window.store = store;
window.TMDB_KEY = TMDB_KEY;
window.baseURL = baseURL;
window.isMobile = isMobile;
window.isIOS = isIOS;
window.fmt = fmt;
window.haptic = haptic;
window.hideLoader = hideLoader;

Object.defineProperty(window, 's', { get: () => store.s });
Object.defineProperty(window, 'e', { get: () => store.e });
Object.defineProperty(window, 'id', { get: () => store.id });
Object.defineProperty(window, 'sources', { get: () => store.sources, set: (v) => store.sources = v });
Object.defineProperty(window, 'currentSourceIndex', { get: () => store.currentSourceIndex, set: (v) => store.currentSourceIndex = v });
Object.defineProperty(window, 'buildSourceList', { get: () => store.buildSourceList, set: (v) => store.buildSourceList = v });
Object.defineProperty(window, 'sourcesLoaded', { get: () => store.sourcesLoaded, set: (v) => store.sourcesLoaded = v });

async function init() {
    await Promise.all([
        import('./api/tmdb.js'),
        import('./api/subtitles.js'),
        import('./ui/toast.js'),
        import('./core/player.js'),
        import('./features/episodes.js')
    ]);

    initLoaderBackdrop();

    if (isMobile()) {
        const mainVideo = document.getElementById('v');
        if (mainVideo) mainVideo.removeAttribute('controls');
    }

    if (!store.id && location.pathname === '/') {
        location.replace('https://vyla.pages.dev');
        return;
    }

    if (store.id) {
        startSourceDiscovery();
    }
}

async function fetchAllSources() {
    const isTv = !!store.s;

    const params = new URLSearchParams({
        source: ""
    });

    if (isTv) {
        params.set("season", store.s);
        params.set("episode", store.e || "1");
    }

    const metaRes = await fetch(`${baseURL}/api?sources_meta`);
    if (!metaRes.ok) throw new Error("failed to fetch source metadata");

    const meta = await metaRes.json();
    const sources = meta.sources || [];

    return new Promise((resolve, reject) => {
        const sourcesData = [];
        let firstResolved = false;
        let completed = 0;

        for (const src of sources) {
            const controller = new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, src.timeout || 20000);

            params.set("source", src.key);

            const testURL = `${baseURL}/api/test/${store.id}?${params.toString()}`;

            fetch(testURL, {
                signal: controller.signal
            })
                .then(async (res) => {
                    clearTimeout(timeout);

                    if (!res.ok) return;

                    const data = await res.json();

                    if (!data.ok || !data.url) return;

                    const entry = {
                        label: src.label,
                        source: src.key,
                        url: data.url,
                        elapsed_ms: data.elapsed_ms
                    };

                    sourcesData.push(entry);

                    if (!firstResolved) {
                        firstResolved = true;

                        resolve({
                            first: entry,
                            aggregated: sourcesData
                        });
                    } else {
                        if (typeof store.buildSourceList === "function") {
                            store.buildSourceList();
                        }
                    }
                })
                .catch(() => { })
                .finally(() => {
                    completed++;

                    if (completed >= sources.length && !firstResolved) {
                        reject(new Error("no working sources"));
                    }
                });
        }
    });
}

function startSourceDiscovery() {
    fetchAllSources()
        .then((result) => {
            setShouldHideLoader(true);
            window.hideLoader();

            store.sources = result.aggregated.length ? result.aggregated : [result.first];
            store.sourcesLoaded = true;
            store.currentSourceIndex = 0;

            const tmdbUrl = store.s
                ? `https://api.themoviedb.org/3/tv/${store.id}?api_key=${TMDB_KEY}&append_to_response=images`
                : `https://api.themoviedb.org/3/movie/${store.id}?api_key=${TMDB_KEY}&append_to_response=images`;

            fetch(tmdbUrl)
                .then(mr => mr.json())
                .then(meta => {
                    let metaTitle = (meta.title || meta.name || 'Unknown');
                    if (store.s) metaTitle += ` \u00b7 S${store.s}E${store.e || '1'}`;
                    document.title = metaTitle;
                    window.setTitleWithTmdbImage(metaTitle, meta);

                    if (store.s) {
                        const epBadge = document.getElementById('ep-badge');
                        if (epBadge) epBadge.textContent = `S${store.s} \u00b7 E${store.e || '1'}`;
                    }

                    window.showNowPlayingToast(metaTitle);
                    window._fallbackSources = result.aggregated;
                    window.play(store.sources[0].url, store.id);
                    if (typeof store.buildSourceList === 'function') store.buildSourceList();
                })
                .catch(() => {
                    let metaTitle = 'Unknown';
                    if (store.s) metaTitle += ` \u00b7 S${store.s}E${store.e || '1'}`;
                    window.showNowPlayingToast(metaTitle);
                    window.play(store.sources[0].url, store.id);
                });
        })
        .catch(() => {
            const spinnerEl = document.getElementById('loader-spinner-wrap');
            if (spinnerEl) spinnerEl.style.display = 'none';
            const errScreen = document.getElementById('error-screen');
            if (errScreen) errScreen.classList.add('show');
        });
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const v = document.getElementById('v');
    if (!v) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (document.body.classList.contains('tv-nav-mode')) return;
        if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 10); window.showUI(); }
        if (e.key === 'ArrowRight') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); window.showUI(); }
    }
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') { e.preventDefault(); haptic(10); v.paused ? v.play() : v.pause(); }
});

init();