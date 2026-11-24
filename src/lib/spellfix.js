// Correct words text recognition got one letter wrong in ingredient lines ("cocking oil" →
// "cooking oil", "gorlic" → "garlic"), using a built-in list of cooking words. Plain rules, no AI.
// A word is only changed when exactly one known word is that close, and short words are left alone.
import { SECTION_RULES } from './sections.js';
import { DENSITIES, UNIT_ALIASES } from './units.js';

const COOKING_WORDS = `
chopped roughly finely sliced thinly diced minced grated peeled unpeeled quartered halved crushed cooked cooking uncooked
fresh freshly ground optional large medium small whole juiced zested drained rinsed trimmed softened melted beaten toasted
roasted leftover handful handfuls bunch pinch choice homemade organic unsalted salted plain extra virgin olive sesame
vegetable canola coconut avocado sunflower cubes sections pieces slices cloves sprigs leaves stalks seeds juices tinned
packet frozen dried smoked boneless skinless thighs breast breasts fillets lightly packed heaped level divided needed taste
serving garnish about approximately white yellow brown black green sweet spicy chopped shredded crumbled firmly loosely
room temperature broth stock water couscous millet quinoa israeli swiss chard parmesan cheddar mozzarella macaroni
spaghetti penne fettuccine linguine pasta noodles basmati jasmine arborio thyme rosemary oregano parsley coriander basil
chives cinnamon nutmeg turmeric cumin paprika cayenne vanilla extract honey maple syrup caster icing cornflour baking
powder yeast butter cream yoghurt yogurt eggs zucchini zucchinis eggplant mushrooms tomatoes potatoes onions shallots
garlic ginger carrots celery capsicum spinach lettuce cucumber broccoli cauliflower pumpkin lemons limes orange oranges
apples bananas berries blueberries strawberries raspberries rolled almonds walnuts cashews peanuts sauce oyster
worcestershire mustard dijon mayonnaise ketchup vinegar balsamic mince sausages sausage bacon chicken lamb salmon prawns
chickpeas lentils beans kidney cannellini passata cheese rind feta ricotta halloumi flavour flavor sections pasture raised
seeded deseeded cored stemmed wedges strips florets segments slivered flaked desiccated toasted grilled steamed boiled
mashed pureed blanched marinated seasoned stuffed skewers tablespoons teaspoons tablespoon teaspoon cups quarts pints
ounces pounds grams kilograms millilitres litres sprinkle drizzle splash dash bought store stirred whisked sifted
pages page using until about directions column options other
`;

const VOCAB = new Set();
const add = (w) => { for (const part of w.toLowerCase().split(/[^a-z]+/)) if (part.length >= 3) VOCAB.add(part); };
COOKING_WORDS.split(/\s+/).forEach(add);
for (const [, words] of SECTION_RULES) words.forEach(add);
Object.keys(DENSITIES).forEach(add);
Object.values(UNIT_ALIASES).flat().forEach(add);
for (const w of [...VOCAB]) { if (!w.endsWith('s')) VOCAB.add(`${w}s`); }

// Optimal string alignment distance, stopping early once it passes the limit.
function close(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > limit) return false;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length] <= limit;
}

export function fixWord(word) {
  const lower = word.toLowerCase();
  if (lower.length < 5 || VOCAB.has(lower) || !/^[a-z]+$/.test(lower)) return word;
  const limit = lower.length >= 9 ? 2 : 1;
  const hits = [];
  for (const v of VOCAB) {
    // Same first letter only: misreads keep it (cocking/cooking, gorlic/garlic), and it stops "pages" → "sages".
    if (v.length >= 5 && v[0] === lower[0] && close(lower, v, limit)) { hits.push(v); if (hits.length > 1) return word; }
  }
  if (hits.length !== 1) return word;
  const fixed = hits[0];
  if (word === word.toUpperCase()) return fixed.toUpperCase();
  return word[0] === word[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
}

// "cocking oil, coconut" → "cooking oil, coconut"; "mille;" → "millet"
export function fixSpelling(line) {
  return line
    .replace(/([A-Za-z]{4,});(?=[\s,]|$)/g, '$1')
    .replace(/[A-Za-z]+/g, (w) => fixWord(w));
}
