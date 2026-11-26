// Every food a pet can ask for, by difficulty — the game's own pool (sunflower-land
// src/features/game/types/pets.ts PET_REQUESTS). Each day a pet asks for one of each difficulty
// it has unlocked; the pool itself does not change.
export const PET_REQUEST_FOODS = {
  easy: ["Mashed Potato", "Rhubarb Tart", "Pumpkin Soup", "Reindeer Carrot", "Bumpkin Broth", "Popcorn", "Sunflower Crunch",
    "Roast Veggies", "Club Sandwich", "Fruit Salad", "Cheese", "Quick Juice", "Carrot Juice", "Purple Smoothie"],
  medium: ["Boiled Eggs", "Cabbers n Mash", "Fried Tofu", "Kale Stew", "Cauliflower Burger", "Bumpkin Salad", "Goblin's Treat",
    "Pancakes", "Bumpkin ganoush", "Tofu Scramble", "Sunflower Cake", "Cornbread", "Pumpkin Cake", "Potato Cake", "Apple Pie",
    "Orange Cake", "Carrot Cake", "Fermented Carrots", "Blueberry Jam", "Sauerkraut", "Fancy Fries", "Orange Juice", "Apple Juice",
    "Power Smoothie", "Bumpkin Detox", "Sour Shake"],
  hard: ["Kale Omelette", "Rice Bun", "Antipasto", "Pizza Margherita", "Bumpkin Roast", "Goblin Brunch", "Steamed Red Rice",
    "Caprese Salad", "Spaghetti al Limone", "Cabbage Cake", "Wheat Cake", "Cauliflower Cake", "Radish Cake", "Beetroot Cake",
    "Parsnip Cake", "Eggplant Cake", "Honey Cake", "Lemon Cheesecake", "Blue Cheese", "Honey Cheddar", "Banana Blast", "Grape Juice",
    "Slow Juice", "The Lot"],
};
