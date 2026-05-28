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

let _playerPlay = null;
Object.defineProperty(window, 'play', {
    get: () => {
        return async function(raw, videoId, isFallback) {
            if (!raw) {
                const source = store.sources[store.currentSourceIndex];
                if (source && !source.url) {
                    try {
                        const url = await testSource(source.key);
                        source.url = url;
                        if (typeof window.buildSourceList === 'function') window.buildSourceList();
                        if (_playerPlay) return _playerPlay(url, videoId, isFallback);
                    } catch (e) {
                        if (store.currentSourceIndex < store.sources.length - 1) {
                            store.currentSourceIndex++;
                            return window.play(store.sources[store.currentSourceIndex].url, videoId, isFallback);
                        } else {
                            showErrorScreen();
                            return;
                        }
                    }
                } else if (!source) {
                    showErrorScreen();
                    return;
                }
            }
            if (_playerPlay) return _playerPlay(raw, videoId, isFallback);
        };
    },
    set: (fn) => {
        _playerPlay = fn;
    }
});

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

async function testSource(sourceKey) {
    const isTv = !!store.s;
    const params = new URLSearchParams({ source: sourceKey });
    if (isTv) {
        params.set("season", store.s);
        params.set("episode", store.e || "1");
    }
    const testURL = `${baseURL}/api/test/${store.id}?${params.toString()}`;
    
    const res = await fetch(testURL);
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    if (!data.ok || !data.url) throw new Error("Source failed");
    return data.url;
}

function showErrorScreen() {
    const spinnerEl = document.getElementById('loader-spinner-wrap');
    if (spinnerEl) spinnerEl.style.display = 'none';
    const errScreen = document.getElementById('error-screen');
    if (errScreen) errScreen.classList.add('show');
}

async function startSourceDiscovery() {
    const tmdbUrl = store.s
        ? `https://api.themoviedb.org/3/tv/${store.id}?api_key=${TMDB_KEY}&append_to_response=images`
        : `https://api.themoviedb.org/3/movie/${store.id}?api_key=${TMDB_KEY}&append_to_response=images`;

    fetch(tmdbUrl)
        .then(mr => mr.json())
        .then(meta => {
            let metaTitle = (meta.title || meta.name || 'Unknown');
            if (store.s) metaTitle += ` \u00b7 S${store.s}E${store.e || '1'}`;
            
            document.title = metaTitle;
            
            if (typeof window.setTitleWithTmdbImage === 'function') {
                window.setTitleWithTmdbImage(metaTitle, meta);
            }
            
            if (store.s) {
                const epBadge = document.getElementById('ep-badge');
                if (epBadge) epBadge.textContent = `S${store.s} \u00b7 E${store.e || '1'}`;
            }
            
            if (typeof window.showNowPlayingToast === 'function') {
                window.showNowPlayingToast(metaTitle);
            }
        })
        .catch(() => {
            let metaTitle = 'Unknown';
            if (store.s) metaTitle += ` \u00b7 S${store.s}E${store.e || '1'}`;
            if (typeof window.showNowPlayingToast === 'function') {
                window.showNowPlayingToast(metaTitle);
            }
        });

    try {
        const metaRes = await fetch(`${baseURL}/api?sources_meta`);
        const metaData = await metaRes.json();
        const rawSources = metaData.sources || [];
        
        store.sources = rawSources.map(s => ({
            key: s.key,
            source: s.key,
            label: s.label,
            url: null
        }));
        
        store.sourcesLoaded = true;
        window._fallbackSources = store.sources;
        
        let ticks = 0;
        const tryBuild = setInterval(() => {
            ticks++;
            if (typeof window.buildSourceList === 'function') {
                window.buildSourceList();
                clearInterval(tryBuild);
            } else if (ticks > 100) {
                clearInterval(tryBuild);
            }
        }, 50);

        let foundWorking = false;
        for (let i = 0; i < store.sources.length; i++) {
            store.currentSourceIndex = i;
            try {
                const url = await testSource(store.sources[i].key);
                store.sources[i].url = url;
                
                setShouldHideLoader(true);
                window.hideLoader();
                
                window.play(url, store.id);
                foundWorking = true;
                
                if (typeof window.buildSourceList === 'function') {
                    window.buildSourceList();
                }
                break;
            } catch(e) {
                continue;
            }
        }
        
        if (!foundWorking) {
            showErrorScreen();
        }
    } catch (e) {
        showErrorScreen();
    }
}

document.addEventListener('click', async (e) => {
    const sourcesOpts = document.getElementById('sources-opts');
    if (sourcesOpts && sourcesOpts.contains(e.target)) {
        const item = e.target.closest('#sources-opts > div');
        if (item) {
            const idx = Array.from(sourcesOpts.children).indexOf(item);
            if (idx !== -1 && idx !== store.currentSourceIndex) {
                const source = store.sources[idx];
                if (!source.url) {
                    e.stopPropagation(); 
                    e.preventDefault();
                    
                    if (item.dataset.fetching) return;
                    item.dataset.fetching = "1";
                    
                    const oldHtml = item.innerHTML;
                    item.innerHTML = `<span style="flex:1;font-size:15px;font-weight:500;color:rgba(255,255,255,0.8);">Testing ${source.label}...</span><span style="width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;animation:_vyla_spin 0.8s linear infinite;"></span>`;
                    
                    try {
                        const url = await testSource(source.key);
                        source.url = url;
                        item.removeAttribute('data-fetching');
                        item.innerHTML = oldHtml;
                        item.click(); 
                    } catch (err) {
                        item.removeAttribute('data-fetching');
                        item.innerHTML = oldHtml;
                        if (typeof window.showNowPlayingToast === 'function') {
                            window.showNowPlayingToast(`${source.label} failed`);
                        }
                    }
                }
            }
        }
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'TEXTAREA'
    ) return;

    const v = document.getElementById('v');
    if (!v) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (document.body.classList.contains('tv-nav-mode')) return;

        if (e.key === 'ArrowLeft') {
            v.currentTime = Math.max(0, v.currentTime - 10);
            window.showUI();
        }

        if (e.key === 'ArrowRight') {
            v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
            window.showUI();
        }
    }

    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        haptic(10);
        v.paused ? v.play() : v.pause();
    }
});

init();