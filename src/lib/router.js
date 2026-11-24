import { useEffect, useState } from 'preact/hooks';

// Hash routes: #/week, #/shopping, #/recipes, #/recipe/<id>, #/recipe/<id>/edit, #/recipe/new,
// #/build, #/settings, #/household, #/join/<token>
export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return { name: parts[0] || 'week', param: parts[1] || null, sub: parts[2] || null };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (path) => { location.hash = `#/${path}`; };
export const back = (fallback) => { if (history.length > 1) history.back(); else go(fallback); };
