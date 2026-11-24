// Supermarket sections and a built-in keyword guesser. Households' own choices override it.
export const SECTIONS = [
  { id: 'fruit_veg', label: 'Fruit & veg' },
  { id: 'meat_seafood', label: 'Meat & seafood' },
  { id: 'fridge', label: 'Fridge' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'household', label: 'Household & cleaning' },
  { id: 'other', label: 'Other' }
];
export const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

// Built-in guess at where an item is in the shop. Checked in this order, first match wins:
// 1. specific items whose words would mislead ("garlic powder", "coconut milk", "peanut butter");
// 2. how it's sold (frozen, then powders, dried, tinned, sauces, stocks, oils… → pantry);
// 3. what it is (meat, fridge, bakery, drinks, household, then fruit & veg).
// Words match whole (plurals allowed), so "egg" doesn't match "eggplant". A trailing * matches the
// start of a word ("strawberr*"). Households' own choices always win over this guess.
const PHRASES = {
  fruit_veg: ['fresh ginger', 'fresh turmeric', 'fresh chilli', 'fresh chili', 'fresh herbs', 'fresh oregano', 'fresh basil', 'fresh thyme',
    'fresh rosemary', 'fresh coriander', 'fresh parsley', 'fresh mint', 'fresh dill', 'lemon juice', 'lime juice', 'lemon zest', 'lime zest',
    'orange zest', 'sweet potato', 'spring onion', 'green onion', 'red onion', 'brown onion', 'white onion', 'bell pepper', 'red pepper',
    'green pepper', 'yellow pepper', 'baby spinach', 'snow pea', 'sugar snap', 'bean sprout', 'green bean', 'broad bean', 'swiss chard',
    'bok choy', 'pak choy', 'corn cob', 'iceberg lettuce', 'cos lettuce', 'butternut pumpkin', 'kent pumpkin', 'garlic clove',
    'clove of garlic', 'cloves of garlic', 'salad mix', 'salad leaves', 'mixed leaves', 'coleslaw', 'stir fry vegetables', 'stir-fry vegetables'],
  frozen: ['ice cream', 'fish fingers', 'puff pastry', 'shortcrust pastry', 'filo pastry', 'hash brown', 'frozen'],
  pantry: ['garlic powder', 'onion powder', 'ginger powder', 'garlic salt', 'onion salt', 'celery salt', 'chilli flakes', 'chili flakes',
    'chilli powder', 'chili powder', 'curry powder', 'cocoa powder', 'baking powder', 'custard powder', 'coconut milk', 'coconut cream',
    'coconut aminos', 'peanut butter', 'almond butter', 'butter beans', 'tomato paste', 'tomato sauce', 'crushed tomatoes', 'diced tomatoes',
    'whole tomatoes', 'sun-dried tomatoes', 'sundried tomatoes', 'fish sauce', 'oyster sauce', 'soy sauce', 'hoisin', 'sweet chilli sauce',
    'stock cube', 'rice noodles', 'egg noodles', 'rice paper', 'corn chips', 'tortilla chips', 'sesame seeds', 'chia seeds', 'pine nuts',
    'black pepper', 'white pepper', 'peppercorns', 'bay leaves', 'bay leaf', 'evaporated milk', 'condensed milk', 'powdered milk', 'milk powder',
    'brown sugar', 'icing sugar', 'caster sugar', 'maple syrup', 'golden syrup', 'cornflour', 'cornstarch', 'self-raising flour',
    'plain flour', 'rolled oats', 'cooking spray', 'pizza sauce', 'pasta sauce', 'salsa', 'pesto', 'cake mix', 'pancake mix'],
  fridge: ['sour cream', 'cream cheese', 'fresh pasta', 'puff pastry sheets', 'parmesan rind', 'greek yoghurt', 'greek yogurt'],
  meat_seafood: ['ground beef', 'ground pork', 'ground chicken', 'ground lamb', 'ground turkey', 'smoked salmon'],
  drinks: ['orange juice', 'apple juice', 'soda water', 'sparkling water', 'mineral water', 'soft drink'],
  household: ['baking paper', 'paper towel', 'toilet paper', 'cling wrap', 'bin bags', 'zip lock', 'dishwashing liquid']
};
// How it's sold → pantry (after frozen). "ground" only counts when no meat word is there (ground beef is meat).
const PANTRY_FORMS = ['powder', 'powdered', 'dried', 'dehydrated', 'flakes', 'granules', 'seasoning', 'spice', 'spices', 'extract', 'essence',
  'stock', 'broth', 'bouillon', 'gravy', 'sauce', 'paste', 'passata', 'puree', 'syrup', 'oil', 'vinegar', 'tinned', 'canned', 'tin', 'can',
  'jar', 'jarred', 'pickled', 'pickle', 'breadcrumbs', 'crumbs', 'flour', 'sugar', 'salt', 'cube', 'concentrate', 'relish', 'chutney'];
const SECTION_WORDS = [
  ['meat_seafood', ['beef', 'mince', 'steak', 'chicken', 'lamb', 'pork', 'sausage', 'veal', 'turkey', 'duck', 'fish', 'salmon', 'barramundi',
    'snapper', 'flathead', 'cod', 'basa', 'prawn', 'shrimp', 'mussel', 'calamari', 'squid', 'scallop', 'crab', 'cutlet', 'chop', 'brisket',
    'rump', 'thigh', 'drumstick', 'wing', 'fillet', 'schnitzel', 'meatball', 'ribs', 'roast', 'kangaroo', 'chorizo']],
  ['pantry', ['ground']],
  ['fridge', ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'halloumi', 'bocconcini',
    'mascarpone', 'brie', 'camembert', 'yoghurt', 'yogurt', 'egg', 'margarine', 'ham', 'bacon', 'salami', 'prosciutto', 'pancetta',
    'tofu', 'tempeh', 'hummus', 'dip', 'gnocchi', 'custard', 'kimchi', 'sauerkraut', 'tortellini', 'ravioli']],
  ['pantry', ['rice', 'pasta', 'spaghetti', 'penne', 'fettuccine', 'linguine', 'macaroni', 'lasagne', 'risoni', 'noodle', 'couscous',
    'quinoa', 'millet', 'barley', 'polenta', 'lentil', 'chickpea', 'kidney bean', 'black bean', 'cannellini', 'baked beans', 'oats',
    'cereal', 'muesli', 'honey', 'jam', 'nuts', 'almond', 'cashew', 'walnut', 'pecan', 'peanut', 'pistachio', 'hazelnut', 'seeds',
    'panko', 'cocoa', 'chocolate', 'bicarb', 'yeast', 'vanilla', 'mustard', 'mayonnaise', 'mayo', 'ketchup', 'soy', 'tamari', 'miso',
    'curry', 'taco', 'tortilla', 'wrap', 'crackers', 'biscuit', 'chips', 'tea', 'coffee', 'tuna', 'sardines', 'anchovies', 'sultana',
    'raisin', 'dates', 'apricots', 'cranberries', 'coconut', 'olives', 'capers', 'cumin', 'paprika', 'cinnamon', 'nutmeg', 'turmeric',
    'oregano', 'cloves', 'cardamom', 'coriander seed', 'fennel seed', 'cayenne', 'allspice', 'pepper', 'stuffing', 'gelatine', 'popcorn']],
  ['bakery', ['bread', 'loaf', 'roll', 'bun', 'baguette', 'sourdough', 'pita', 'naan', 'crumpet', 'muffin', 'croissant', 'pizza base',
    'bagel', 'brioche', 'focaccia']],
  ['drinks', ['juice', 'soda', 'cola', 'cordial', 'beer', 'wine', 'kombucha']],
  ['household', ['dishwashing', 'detergent', 'tissues', 'foil', 'sponge', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'nappies',
    'cleaner', 'laundry', 'batteries', 'bleach', 'wipes']],
  ['fruit_veg', ['onion', 'garlic', 'ginger', 'potato', 'pumpkin', 'carrot', 'celery', 'capsicum', 'chilli', 'chili', 'tomato', 'lettuce',
    'spinach', 'rocket', 'kale', 'chard', 'silverbeet', 'cabbage', 'broccoli', 'broccolini', 'cauliflower', 'zucchini', 'eggplant',
    'mushroom', 'corn', 'peas', 'bean', 'cucumber', 'avocado', 'leek', 'shallot', 'fennel', 'herb', 'parsley', 'coriander', 'basil',
    'mint', 'thyme', 'rosemary', 'dill', 'chive', 'sage', 'lemongrass', 'lemon', 'lime', 'orange', 'mandarin', 'apple', 'banana', 'pear',
    'berries', 'strawberr*', 'blueberr*', 'raspberr*', 'grape', 'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'peach', 'plum',
    'nectarine', 'cherr*', 'beetroot', 'radish', 'asparagus', 'salad', 'sprouts', 'turnip', 'parsnip', 'squash', 'okra', 'edamame']]
];

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = (w) => (w.endsWith('*')
  ? new RegExp(`(^|[^a-z])${esc(w.slice(0, -1))}`)
  : new RegExp(`(^|[^a-z])${esc(w)}(s|es)?($|[^a-z])`));
const compile = (words) => words.map(pattern);
const PHRASE_RULES = Object.entries(PHRASES).map(([section, words]) => [section, compile(words)]);
const FORM_RULES = compile(PANTRY_FORMS);
const WORD_RULES = SECTION_WORDS.map(([section, words]) => [section, compile(words)]);
const MEAT = WORD_RULES[0][1];

// Kept for the spelling check's word list.
export const SECTION_RULES = [...Object.entries(PHRASES), ['pantry', PANTRY_FORMS], ...SECTION_WORDS];

export function guessSection(name) {
  const n = (name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').trim();
  if (!n) return 'other';
  const hit = (rules) => rules.some((re) => re.test(n));
  // Frozen beats everything ("frozen peas", "frozen chicken").
  if (/(^|[^a-z])frozen([^a-z]|$)/.test(n)) return 'frozen';
  for (const [section, rules] of PHRASE_RULES) if (hit(rules)) return section;
  if (hit(FORM_RULES) && !(hit(MEAT) && !/(stock|broth|sauce|bouillon|gravy|salt|seasoning|powder)/.test(n))) return 'pantry';
  for (const [section, rules] of WORD_RULES) if (hit(rules)) return section;
  return 'other';
}

// remembered: { 'item name': { section, organic, buy_note } } — the household's memory per item.
export function memoryFor(name, remembered = {}) {
  const m = remembered[(name || '').toLowerCase().trim()];
  return typeof m === 'string' ? { section: m, organic: false, buy_note: null } : m || null;
}

export function sectionFor(name, remembered = {}) {
  return memoryFor(name, remembered)?.section || guessSection((name || '').toLowerCase().trim());
}
