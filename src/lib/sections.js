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

// Order matters: earlier rules win ("frozen peas" → frozen before "peas" → fruit & veg).
const RULES = [
  ['fruit_veg', ['eggplant', 'butternut', 'spring onion', 'sweet potato', 'baby spinach', 'snow pea', 'fresh herbs']],
  ['frozen', ['frozen', 'ice cream', 'fish fingers', 'puff pastry', 'shortcrust pastry', 'filo']],
  ['pantry', ['tinned', 'canned', 'tin ', 'can ', 'stock', 'broth', 'passata', 'paste', 'sauce', 'oil', 'vinegar', 'flour', 'sugar', 'salt', 'pepper', 'spice', 'cumin', 'paprika', 'chilli powder', 'chili powder', 'cinnamon', 'oregano', 'dried', 'rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'couscous', 'quinoa', 'lentil', 'chickpea', 'kidney bean', 'black bean', 'cannellini', 'baked beans', 'oats', 'cereal', 'honey', 'syrup', 'jam', 'peanut butter', 'nuts', 'almond', 'cashew', 'walnut', 'seeds', 'breadcrumb', 'panko', 'coconut milk', 'coconut cream', 'cocoa', 'chocolate', 'baking powder', 'bicarb', 'yeast', 'vanilla', 'stock cube', 'gravy', 'mustard', 'mayonnaise', 'ketchup', 'tomato sauce', 'soy', 'curry', 'taco', 'tortilla', 'wrap', 'crackers', 'biscuit', 'chips', 'tea', 'coffee', 'tuna', 'salmon tin', 'sultana', 'raisin', 'coconut']],
  ['fridge', ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'halloumi', 'yoghurt', 'yogurt', 'egg', 'margarine', 'ham', 'bacon', 'salami', 'prosciutto', 'chorizo', 'tofu', 'hummus', 'dip', 'fresh pasta', 'gnocchi', 'custard']],
  ['meat_seafood', ['beef', 'mince', 'steak', 'chicken', 'lamb', 'pork', 'sausage', 'veal', 'turkey', 'fish', 'salmon', 'barramundi', 'snapper', 'prawn', 'shrimp', 'mussel', 'calamari', 'squid', 'scallop', 'crab', 'cutlet', 'chop', 'brisket', 'rump', 'thigh', 'drumstick', 'fillet']],
  ['bakery', ['bread', 'loaf', 'roll', 'bun', 'baguette', 'sourdough', 'pita', 'naan', 'crumpet', 'muffin', 'croissant', 'pizza base']],
  ['drinks', ['juice', 'soft drink', 'soda', 'cola', 'mineral water', 'sparkling water', 'cordial', 'beer', 'wine', 'kombucha']],
  ['household', ['dishwashing', 'detergent', 'toilet paper', 'paper towel', 'tissues', 'cling wrap', 'foil', 'baking paper', 'bin bags', 'sponge', 'soap', 'shampoo', 'toothpaste', 'nappies', 'cleaner', 'laundry', 'batteries']],
  ['fruit_veg', ['onion', 'garlic', 'ginger', 'potato', 'sweet potato', 'pumpkin', 'carrot', 'celery', 'capsicum', 'pepper', 'chilli', 'tomato', 'lettuce', 'spinach', 'rocket', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'zucchini', 'eggplant', 'mushroom', 'corn', 'peas', 'bean', 'snow pea', 'cucumber', 'avocado', 'leek', 'spring onion', 'shallot', 'herb', 'parsley', 'coriander', 'basil', 'mint', 'thyme', 'rosemary', 'dill', 'chive', 'lemon', 'lime', 'orange', 'apple', 'banana', 'pear', 'berries', 'strawberr', 'blueberr', 'grape', 'mango', 'pineapple', 'melon', 'kiwi', 'peach', 'plum', 'beetroot', 'radish', 'asparagus', 'bok choy', 'salad']]
];

export function guessSection(name) {
  const n = ` ${(name || '').toLowerCase()} `;
  for (const [section, words] of RULES) {
    // Match at the start of a word, so "unsalted" doesn't match "salt".
    if (words.some((w) => new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n))) return section;
  }
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
