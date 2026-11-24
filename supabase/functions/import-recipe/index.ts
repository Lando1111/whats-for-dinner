// Reads the recipe data that most recipe websites embed (schema.org Recipe in JSON-LD).
// Plain parsing only, no AI. Requires a signed-in user (verify_jwt) so it can't be used as an open proxy.
const ALLOWED_ORIGINS = ['https://lando1111.github.io', 'http://localhost:5173', 'http://localhost:4173'];

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    const h = u.hostname;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null;
    return u;
  } catch { return null; }
}

function findRecipe(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  if (typeof node !== 'object') return null;
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipe(node['@graph']);
  if (node.mainEntity) return findRecipe(node.mainEntity);
  return null;
}

const decode = (s: string) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

function steps(ins: any): string[] {
  if (!ins) return [];
  if (typeof ins === 'string') return ins.split(/\n+|(?<=\.)\s+(?=\d+\.)/).map(decode).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(steps);
  if (ins['@type'] === 'HowToSection') return steps(ins.itemListElement);
  if (ins.text) return [decode(ins.text)];
  if (ins.name) return [decode(ins.name)];
  return [];
}

function imageUrl(img: any): string | null {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return imageUrl(img[0]);
  return img.url || img.contentUrl || null;
}

function servings(y: any): number | null {
  const s = Array.isArray(y) ? y.join(' ') : String(y ?? '');
  const m = s.match(/\d+/);
  return m ? Math.min(50, Math.max(1, Number(m[0]))) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Use POST' }, 405);

  // The platform has already checked the token's signature; also require a signed-in person, not the public key.
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role !== 'authenticated' || !claims.sub) return json(req, { error: 'Please sign in first.' }, 401);
  } catch { return json(req, { error: 'Please sign in first.' }, 401); }

  let url: URL | null = null;
  try { url = safeUrl((await req.json()).url); } catch { /* bad body */ }
  if (!url) return json(req, { error: "That doesn't look like a website link." }, 400);

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AU,en;q=0.9' };
  let html = '';
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return json(req, { error: `The website said no (error ${res.status}). Try pasting the recipe text instead.` }, 422);
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return json(req, { error: "Couldn't reach that website. Try again, or paste the recipe text instead." }, 422);
  }

  let recipe: any = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { recipe = findRecipe(JSON.parse(m[1].trim())); } catch { /* skip broken blocks */ }
    if (recipe) break;
  }
  if (!recipe) {
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    return json(req, { error: "This page doesn't share its recipe in a standard way. Copy the recipe text and use Paste a list.", title }, 422);
  }

  const result: Record<string, unknown> = {
    title: decode(recipe.name || ''),
    servings: servings(recipe.recipeYield),
    ingredients: (recipe.recipeIngredient || recipe.ingredients || []).map((s: string) => decode(String(s))).filter(Boolean),
    method: steps(recipe.recipeInstructions),
    source_url: url.toString(),
    site: url.hostname.replace(/^www\./, '')
  };

  // Bring the photo along (small enough to send back), so the app can save it with the recipe.
  const img = imageUrl(recipe.image);
  if (img) {
    try {
      const imgUrl = safeUrl(new URL(img, url).toString());
      if (imgUrl) {
        const r = await fetch(imgUrl, { headers: { 'User-Agent': headers['User-Agent'] }, signal: AbortSignal.timeout(10000) });
        const type = r.headers.get('content-type') || '';
        const buf = new Uint8Array(await r.arrayBuffer());
        if (r.ok && type.startsWith('image/') && buf.length < 4_000_000) {
          let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          result.image = { type, data: btoa(bin) };
        }
      }
    } catch { /* photo is optional */ }
  }
  return json(req, result);
});
