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
