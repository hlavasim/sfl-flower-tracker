// Fetch resources per species/type: { res, level, energy }
// Energy: Acorn=100, Moonfur=1000, Fossil Shell=300, all others=200
export const PET_FETCH_DATA = {
  // Common species (4 resources, Lv 1/3/7/20)
  "Dog":     [{res:"Acorn",level:1,energy:100},{res:"Chewed Bone",level:3,energy:200},{res:"Ribbon",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Cat":     [{res:"Acorn",level:1,energy:100},{res:"Ribbon",level:3,energy:200},{res:"Heart Leaf",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Owl":     [{res:"Acorn",level:1,energy:100},{res:"Heart Leaf",level:3,energy:200},{res:"Dewberry",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Horse":   [{res:"Acorn",level:1,energy:100},{res:"Ruffroot",level:3,energy:200},{res:"Wild Grass",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Bull":    [{res:"Acorn",level:1,energy:100},{res:"Wild Grass",level:3,energy:200},{res:"Frost Pebble",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Hamster": [{res:"Acorn",level:1,energy:100},{res:"Dewberry",level:3,energy:200},{res:"Chewed Bone",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  "Penguin": [{res:"Acorn",level:1,energy:100},{res:"Frost Pebble",level:3,energy:200},{res:"Ruffroot",level:7,energy:200},{res:"Fossil Shell",level:20,energy:300}],
  // NFT types (6 resources, Lv 1/3/7/12/20/25)
  "Dragon":  [{res:"Acorn",level:1,energy:100},{res:"Frost Pebble",level:3,energy:200},{res:"Chewed Bone",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Ruffroot",level:25,energy:200}],
  "Phoenix": [{res:"Acorn",level:1,energy:100},{res:"Heart Leaf",level:3,energy:200},{res:"Wild Grass",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Chewed Bone",level:25,energy:200}],
  "Griffin": [{res:"Acorn",level:1,energy:100},{res:"Ruffroot",level:3,energy:200},{res:"Dewberry",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Wild Grass",level:25,energy:200}],
  "Ram":     [{res:"Acorn",level:1,energy:100},{res:"Ribbon",level:3,energy:200},{res:"Ruffroot",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Heart Leaf",level:25,energy:200}],
  "Warthog": [{res:"Acorn",level:1,energy:100},{res:"Wild Grass",level:3,energy:200},{res:"Frost Pebble",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Ribbon",level:25,energy:200}],
  "Wolf":    [{res:"Acorn",level:1,energy:100},{res:"Chewed Bone",level:3,energy:200},{res:"Ribbon",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Dewberry",level:25,energy:200}],
  "Bear":    [{res:"Acorn",level:1,energy:100},{res:"Dewberry",level:3,energy:200},{res:"Heart Leaf",level:7,energy:200},{res:"Moonfur",level:12,energy:1000},{res:"Fossil Shell",level:20,energy:300},{res:"Frost Pebble",level:25,energy:200}],
};

// The pool a pet's daily food requests are drawn from, one per difficulty —
// verbatim from the game's PET_REQUESTS (src/features/game/types/pets.ts).
// flowers.html carries the same lists as PET_FOOD_CATEGORIES for the Power page's
// Paw Aura estimate; this is the copy the feeding table computes from.
export const PET_REQUESTS = {
  easy: [
    "Mashed Potato", "Rhubarb Tart", "Pumpkin Soup", "Reindeer Carrot", "Bumpkin Broth",
    "Popcorn", "Sunflower Crunch", "Roast Veggies", "Club Sandwich", "Fruit Salad",
    "Cheese", "Quick Juice", "Carrot Juice", "Purple Smoothie",
  ],
  medium: [
    "Boiled Eggs", "Cabbers n Mash", "Fried Tofu", "Kale Stew", "Cauliflower Burger",
    "Bumpkin Salad", "Goblin's Treat", "Pancakes", "Bumpkin ganoush", "Tofu Scramble",
    "Sunflower Cake", "Cornbread", "Pumpkin Cake", "Potato Cake", "Apple Pie",
    "Orange Cake", "Carrot Cake", "Fermented Carrots", "Blueberry Jam", "Sauerkraut",
    "Fancy Fries", "Orange Juice", "Apple Juice", "Power Smoothie", "Bumpkin Detox", "Sour Shake",
  ],
  hard: [
    "Kale Omelette", "Rice Bun", "Antipasto", "Pizza Margherita", "Bumpkin Roast",
    "Goblin Brunch", "Steamed Red Rice", "Caprese Salad", "Spaghetti al Limone",
    "Cabbage Cake", "Wheat Cake", "Cauliflower Cake", "Radish Cake", "Beetroot Cake",
    "Parsnip Cake", "Eggplant Cake", "Honey Cake", "Lemon Cheesecake", "Blue Cheese",
    "Honey Cheddar", "Banana Blast", "Grape Juice", "Slow Juice", "The Lot",
  ],
};

// Base XP per fulfilled request (game: PET_REQUEST_XP). feedPet.ts passes this same
// number in as basePetEnergy, so base energy == base XP — energy is a property of the
// request's difficulty, never of the dish.
export const PET_REQUEST_XP = { easy: 20, medium: 100, hard: 300 };
