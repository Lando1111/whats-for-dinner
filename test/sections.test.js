// Where items go in the shop. A wide cross-check of common Australian shopping and recipe items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessSection, sectionFor } from '../src/lib/sections.js';

const EXPECT = {
  fruit_veg: ['garlic', 'garlic cloves', 'brown onion', 'red onion', 'spring onions', 'fresh ginger', 'fresh turmeric', 'lemon', 'lemon juice',
    'lime zest', 'zucchini', 'eggplant', 'mushrooms', 'cherry tomatoes', 'tomatoes', 'baby spinach', 'Swiss chard', 'red capsicum',
    'red pepper', 'sweet potato', 'potatoes', 'carrots', 'broccoli', 'coriander', 'fresh coriander', 'thyme', 'avocado', 'bananas',
    'strawberries', 'blueberries', 'salad mix', 'snow peas', 'green beans', 'corn', 'bok choy', 'chilli', 'leek'],
  pantry: ['garlic powder', 'onion powder', 'ground ginger', 'ground cumin', 'smoked paprika', 'chilli flakes', 'chilli powder',
    'dried oregano', 'cinnamon', 'turmeric', 'sea salt', 'salt', 'black pepper', 'pepper', 'olive oil', 'sesame oil', 'coconut oil',
    'balsamic vinegar', 'soy sauce', 'fish sauce', 'tomato paste', 'tomato sauce', 'tinned tomatoes', 'crushed tomatoes', 'passata',
    'chicken stock', 'vegetable stock cubes', 'beef broth', 'coconut milk', 'coconut cream', 'coconut aminos', 'peanut butter',
    'butter beans', 'chickpeas', 'kidney beans', 'red lentils', 'rice', 'jasmine rice', 'rice noodles', 'macaroni pasta', 'spaghetti',
    'Israeli couscous', 'millet', 'rolled oats', 'plain flour', 'self-raising flour', 'cornflour', 'caster sugar', 'brown sugar',
    'honey', 'maple syrup', 'vanilla extract', 'baking powder', 'bicarb soda', 'cocoa powder', 'dark chocolate', 'sesame seeds',
    'almonds', 'tuna', 'breadcrumbs', 'mustard', 'mayonnaise', 'lemon pepper', 'chicken salt', 'garlic salt', 'curry powder', 'olives'],
  fridge: ['milk', 'butter', 'unsalted butter', 'cream', 'sour cream', 'cream cheese', 'eggs', 'pasture-raised eggs', 'cheddar',
    'parmesan', 'Parmesan cheese rind', 'feta', 'greek yoghurt', 'bacon', 'ham', 'tofu', 'hummus', 'gnocchi', 'fresh pasta'],
  meat_seafood: ['beef mince', 'chicken thigh', 'chicken thighs', 'chicken breast', 'lamb chops', 'pork belly', 'sausages', 'salmon',
    'prawns', 'ground beef', 'steak', 'chorizo', 'barramundi fillets'],
  frozen: ['frozen peas', 'frozen corn', 'ice cream', 'puff pastry', 'frozen berries', 'fish fingers'],
  bakery: ['bread', 'sourdough loaf', 'hamburger buns', 'pita bread', 'tortillas wraps'.replace('tortillas wraps', 'naan')],
  drinks: ['orange juice', 'soda water', 'beer'],
  household: ['baking paper', 'paper towel', 'dishwashing liquid', 'cling wrap']
};

test('items go to the right part of the shop', () => {
  const wrong = [];
  for (const [section, names] of Object.entries(EXPECT)) {
    for (const n of names) { const got = guessSection(n); if (got !== section) wrong.push(`${n}: ${got} (expected ${section})`); }
  }
  assert.deepEqual(wrong, []);
});

test("the household's own choice wins", () => {
  assert.equal(sectionFor('Garlic powder', { 'garlic powder': { section: 'other' } }), 'other');
  assert.equal(sectionFor('garlic powder', {}), 'pantry');
});
