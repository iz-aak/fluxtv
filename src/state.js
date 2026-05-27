const p = new URLSearchParams(location.search);

export const store = {
    id: p.get('id'),
    s: p.get('season'),
    e: p.get('episode'),
    ap: p.get('ap'),
    sources: [],
    currentSourceIndex: 0,
    sourcesLoaded: false,
    buildSourceList: null
};