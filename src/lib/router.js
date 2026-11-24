import { useEffect, useState } from 'preact/hooks';

// Hash routes: #/week, #/shopping, #/recipes, #/settings, #/household, #/join/<token>
export function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'week', param: parts[1] || null };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (path) => { location.hash = `#/${path}`; };
