// Pre-ascension land expansion requirements + node gains — extracted VERBATIM
// from the game source (sunflower-land@main src/features/game/types/expansions.ts)
// on 2026-07-19: EXPANSION_REQUIREMENTS for costs, and per-expansion node deltas
// computed by running the game's own deriveExpansionNodes over the island
// layouts (TOTAL_EXPANSION_NODES[e] − [e−1]). bumpkinLevel {ascension,level}
// objects are flattened to the plain level number (all pre-ascension rows have
// ascension: 0). Legacy refund rows past each island's upgrade gate (basic
// 10-23) are omitted; caps and the progression chain come from the game's
// upgradeFarm.ts ISLAND_UPGRADE / ISLAND_SETUP tables.
export const PRE_EXPANSION_REQUIREMENTS = {
  "basic": {
    "4": {
      "resources": {
        "Wood": 3
      },
      "coins": 0,
      "sfl": 0,
      "seconds": 5,
      "level": 1,
      "nodes": {
        "Crop Plot": 9,
        "Tree": 2,
        "Stone Rock": 1,
        "Iron Rock": 1
      }
    },
    "5": {
      "resources": {
        "Wood": 5
      },
      "coins": 0.25,
      "sfl": 0,
      "seconds": 5,
      "level": 1,
      "nodes": {
        "Crop Plot": 8,
        "Tree": 1,
        "Stone Rock": 1,
        "Iron Rock": 1,
        "Gold Rock": 1
      }
    },
    "6": {
      "resources": {
        "Stone": 1
      },
      "coins": 60,
      "sfl": 0,
      "seconds": 60,
      "level": 2,
      "nodes": {
        "Crop Plot": 8,
        "Tree": 1,
        "Stone Rock": 1
      }
    },
    "7": {
      "resources": {
        "Stone": 5,
        "Iron": 1
      },
      "coins": 100,
      "sfl": 0,
      "seconds": 1800,
      "level": 5,
      "nodes": {
        "Crop Plot": 2,
        "Tree": 1,
        "Stone Rock": 1,
        "Iron Rock": 1
      }
    },
    "8": {
      "resources": {
        "Iron": 3,
        "Gold": 1
      },
      "coins": 200,
      "sfl": 0,
      "seconds": 14400,
      "level": 8,
      "nodes": {
        "Crop Plot": 2,
        "Tree": 1,
        "Stone Rock": 1,
        "Gold Rock": 1
      }
    },
    "9": {
      "resources": {
        "Wood": 100,
        "Stone": 40,
        "Iron": 5
      },
      "coins": 300,
      "sfl": 0,
      "seconds": 43200,
      "level": 11,
      "nodes": {
        "Crop Plot": 2,
        "Iron Rock": 1
      }
    }
  },
  "spring": {
    "5": {
      "resources": {
        "Wood": 20
      },
      "coins": 100,
      "sfl": 0,
      "seconds": 60,
      "level": 11,
      "nodes": {
        "Crop Plot": 2,
        "Fruit Patch": 1,
        "Tree": 2,
        "Stone Rock": 2,
        "Iron Rock": 1,
        "Gold Rock": 1
      }
    },
    "6": {
      "resources": {
        "Wood": 10,
        "Stone": 5,
        "Gold": 2
      },
      "coins": 200,
      "sfl": 0,
      "seconds": 300,
      "level": 13,
      "nodes": {
        "Fruit Patch": 1,
        "Tree": 1,
        "Stone Rock": 1,
        "Beehive": 1,
        "Flower Bed": 1
      }
    },
    "7": {
      "resources": {
        "Wood": 30,
        "Stone": 20,
        "Iron": 5,
        "Gem": 15
      },
      "coins": 300,
      "sfl": 0,
      "seconds": 1800,
      "level": 16,
      "nodes": {
        "Crop Plot": 2,
        "Tree": 1,
        "Stone Rock": 1,
        "Crimstone Rock": 1
      }
    },
    "8": {
      "resources": {
        "Wood": 20,
        "Crimstone": 1,
        "Gem": 15
      },
      "coins": 400,
      "sfl": 0,
      "seconds": 7200,
      "level": 20,
      "nodes": {
        "Crop Plot": 2,
        "Fruit Patch": 1,
        "Stone Rock": 1,
        "Iron Rock": 1,
        "Gold Rock": 1
      }
    },
    "9": {
      "resources": {
        "Wood": 50,
        "Gold": 5,
        "Gem": 15
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 7200,
      "level": 23,
      "nodes": {
        "Fruit Patch": 1,
        "Tree": 1,
        "Sunstone Rock": 1
      }
    },
    "10": {
      "resources": {
        "Stone": 10,
        "Crimstone": 3,
        "Gem": 15
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 14400,
      "level": 25,
      "nodes": {
        "Fruit Patch": 1,
        "Iron Rock": 1,
        "Gold Rock": 1,
        "Beehive": 1,
        "Flower Bed": 1
      }
    },
    "11": {
      "resources": {
        "Wood": 100,
        "Stone": 25,
        "Gold": 5,
        "Crimstone": 1,
        "Gem": 15
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 28800,
      "level": 27,
      "nodes": {
        "Crop Plot": 2,
        "Fruit Patch": 1,
        "Tree": 1,
        "Stone Rock": 1
      }
    },
    "12": {
      "resources": {
        "Wood": 50,
        "Iron": 5,
        "Crimstone": 3,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 43200,
      "level": 29,
      "nodes": {
        "Crop Plot": 2
      }
    },
    "13": {
      "resources": {
        "Wood": 50,
        "Stone": 25,
        "Iron": 10,
        "Gold": 10,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 43200,
      "level": 32,
      "nodes": {
        "Fruit Patch": 1,
        "Tree": 1,
        "Stone Rock": 1,
        "Iron Rock": 1,
        "Sunstone Rock": 1
      }
    },
    "14": {
      "resources": {
        "Wood": 100,
        "Stone": 10,
        "Crimstone": 5,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 86400,
      "level": 36,
      "nodes": {
        "Crop Plot": 2,
        "Fruit Patch": 1
      }
    },
    "15": {
      "resources": {
        "Wood": 150,
        "Stone": 10,
        "Iron": 10,
        "Gold": 5,
        "Crimstone": 5,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 86400,
      "level": 40,
      "nodes": {
        "Crop Plot": 1,
        "Fruit Patch": 1,
        "Tree": 1,
        "Stone Rock": 1,
        "Iron Rock": 1,
        "Crimstone Rock": 1
      }
    },
    "16": {
      "resources": {
        "Wood": 100,
        "Stone": 10,
        "Gold": 5,
        "Crimstone": 8,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 86400,
      "level": 43,
      "nodes": {
        "Crop Plot": 1,
        "Tree": 1,
        "Gold Rock": 1,
        "Beehive": 1,
        "Flower Bed": 1
      }
    }
  },
  "desert": {
    "5": {
      "resources": {
        "Wood": 50,
        "Stone": 10,
        "Iron": 5,
        "Gold": 5
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 60,
      "level": 40,
      "nodes": {
        "Crop Plot": 1,
        "Stone Rock": 1,
        "Iron Rock": 1,
        "Oil Reserve": 1
      }
    },
    "6": {
      "resources": {
        "Wood": 100,
        "Stone": 20,
        "Iron": 10,
        "Gold": 5
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 300,
      "level": 40,
      "nodes": {
        "Fruit Patch": 1,
        "Sunstone Rock": 1
      }
    },
    "7": {
      "resources": {
        "Wood": 150,
        "Stone": 20,
        "Iron": 10,
        "Gold": 5,
        "Gem": 15
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 1800,
      "level": 41,
      "nodes": {
        "Crop Plot": 2,
        "Crimstone Rock": 1
      }
    },
    "8": {
      "resources": {
        "Wood": 150,
        "Stone": 10,
        "Iron": 5,
        "Gold": 5,
        "Crimstone": 3,
        "Oil": 5,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 7200,
      "level": 42,
      "nodes": {
        "Crop Plot": 2,
        "Sunstone Rock": 1
      }
    },
    "9": {
      "resources": {
        "Wood": 50,
        "Stone": 5,
        "Iron": 5,
        "Gold": 5,
        "Crimstone": 6,
        "Oil": 5,
        "Gem": 30
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 7200,
      "level": 43,
      "nodes": {
        "Tree": 1,
        "Stone Rock": 1
      }
    },
    "10": {
      "resources": {
        "Wood": 100,
        "Stone": 50,
        "Iron": 10,
        "Gold": 5,
        "Crimstone": 12,
        "Oil": 10,
        "Gem": 45
      },
      "coins": 384,
      "sfl": 0,
      "seconds": 28800,
      "level": 44,
      "nodes": {
        "Crop Plot": 1,
        "Iron Rock": 1
      }
    },
    "11": {
      "resources": {
        "Wood": 150,
        "Stone": 75,
        "Iron": 10,
        "Gold": 5,
        "Crimstone": 15,
        "Oil": 30,
        "Gem": 45
      },
      "coins": 768,
      "sfl": 0,
      "seconds": 43200,
      "level": 45,
      "nodes": {
        "Crop Plot": 1,
        "Fruit Patch": 1
      }
    },
    "12": {
      "resources": {
        "Wood": 100,
        "Stone": 100,
        "Iron": 5,
        "Gold": 10,
        "Crimstone": 18,
        "Oil": 30,
        "Gem": 45
      },
      "coins": 1536,
      "sfl": 0,
      "seconds": 43200,
      "level": 47,
      "nodes": {
        "Crop Plot": 2
      }
    },
    "13": {
      "resources": {
        "Wood": 200,
        "Stone": 50,
        "Iron": 15,
        "Gold": 10,
        "Crimstone": 21,
        "Oil": 40,
        "Gem": 45
      },
      "coins": 3072,
      "sfl": 0,
      "seconds": 86400,
      "level": 50,
      "nodes": {
        "Tree": 1
      }
    },
    "14": {
      "resources": {
        "Wood": 200,
        "Stone": 100,
        "Iron": 15,
        "Gold": 10,
        "Crimstone": 24,
        "Oil": 50,
        "Gem": 45
      },
      "coins": 3840,
      "sfl": 0,
      "seconds": 86400,
      "level": 53,
      "nodes": {
        "Crop Plot": 1,
        "Stone Rock": 1
      }
    },
    "15": {
      "resources": {
        "Wood": 300,
        "Stone": 50,
        "Iron": 20,
        "Gold": 10,
        "Crimstone": 27,
        "Oil": 75,
        "Gem": 45
      },
      "coins": 3840,
      "sfl": 0,
      "seconds": 86400,
      "level": 56,
      "nodes": {
        "Crop Plot": 1,
        "Oil Reserve": 1
      }
    },
    "16": {
      "resources": {
        "Wood": 250,
        "Stone": 125,
        "Iron": 15,
        "Gold": 15,
        "Crimstone": 30,
        "Oil": 100,
        "Gem": 60
      },
      "coins": 3840,
      "sfl": 0,
      "seconds": 129600,
      "level": 58,
      "nodes": {
        "Crop Plot": 1,
        "Tree": 1
      }
    },
    "17": {
      "resources": {
        "Wood": 350,
        "Stone": 75,
        "Iron": 20,
        "Gold": 10,
        "Crimstone": 33,
        "Oil": 125,
        "Gem": 60
      },
      "coins": 5760,
      "sfl": 0,
      "seconds": 129600,
      "level": 60,
      "nodes": {
        "Crop Plot": 2
      }
    },
    "18": {
      "resources": {
        "Wood": 400,
        "Stone": 125,
        "Iron": 25,
        "Gold": 15,
        "Crimstone": 36,
        "Oil": 150,
        "Gem": 75
      },
      "coins": 5760,
      "sfl": 0,
      "seconds": 129600,
      "level": 63,
      "nodes": {
        "Crop Plot": 1,
        "Gold Rock": 1
      }
    },
    "19": {
      "resources": {
        "Wood": 450,
        "Stone": 150,
        "Iron": 30,
        "Gold": 20,
        "Crimstone": 39,
        "Oil": 200,
        "Gem": 60
      },
      "coins": 7680,
      "sfl": 0,
      "seconds": 129600,
      "level": 65,
      "nodes": {
        "Crop Plot": 1,
        "Fruit Patch": 1
      }
    },
    "20": {
      "resources": {
        "Wood": 525,
        "Stone": 200,
        "Iron": 35,
        "Gold": 30,
        "Crimstone": 42,
        "Oil": 250,
        "Gem": 60
      },
      "coins": 7680,
      "sfl": 0,
      "seconds": 172800,
      "level": 68,
      "nodes": {
        "Tree": 1,
        "Stone Rock": 1,
        "Oil Reserve": 1
      }
    },
    "21": {
      "resources": {
        "Wood": 550,
        "Stone": 150,
        "Iron": 30,
        "Gold": 25,
        "Crimstone": 45,
        "Oil": 350,
        "Gem": 60
      },
      "coins": 9600,
      "sfl": 0,
      "seconds": 172800,
      "level": 70,
      "nodes": {
        "Crop Plot": 1,
        "Iron Rock": 1,
        "Sunstone Rock": 1
      }
    },
    "22": {
      "resources": {
        "Wood": 600,
        "Stone": 200,
        "Iron": 35,
        "Gold": 30,
        "Crimstone": 48,
        "Oil": 450,
        "Gem": 75
      },
      "coins": 9600,
      "sfl": 0,
      "seconds": 172800,
      "level": 72,
      "nodes": {
        "Fruit Patch": 1,
        "Tree": 1
      }
    },
    "23": {
      "resources": {
        "Wood": 650,
        "Stone": 250,
        "Iron": 40,
        "Gold": 35,
        "Crimstone": 51,
        "Oil": 500,
        "Gem": 75
      },
      "coins": 9600,
      "sfl": 0,
      "seconds": 216000,
      "level": 73,
      "nodes": {
        "Crop Plot": 1,
        "Crimstone Rock": 1
      }
    },
    "24": {
      "resources": {
        "Wood": 700,
        "Stone": 300,
        "Iron": 50,
        "Gold": 45,
        "Crimstone": 54,
        "Oil": 550,
        "Gem": 75
      },
      "coins": 11520,
      "sfl": 0,
      "seconds": 216000,
      "level": 74,
      "nodes": {
        "Crop Plot": 1,
        "Sunstone Rock": 1
      }
    },
    "25": {
      "resources": {
        "Wood": 750,
        "Stone": 350,
        "Iron": 50,
        "Gold": 50,
        "Crimstone": 60,
        "Oil": 650,
        "Gem": 75
      },
      "coins": 13440,
      "sfl": 0,
      "seconds": 216000,
      "level": 75,
      "nodes": {
        "Crop Plot": 1,
        "Stone Rock": 1
      }
    }
  },
  "volcano": {
    "6": {
      "resources": {
        "Wood": 100,
        "Stone": 50,
        "Iron": 30,
        "Gold": 10
      },
      "coins": 500,
      "sfl": 0,
      "seconds": 10,
      "level": 70,
      "nodes": {}
    },
    "7": {
      "resources": {
        "Wood": 200,
        "Stone": 75,
        "Iron": 25,
        "Gold": 15,
        "Crimstone": 4,
        "Oil": 30,
        "Gem": 30
      },
      "coins": 384,
      "sfl": 0,
      "seconds": 300,
      "level": 72,
      "nodes": {
        "Lava Pit": 1
      }
    },
    "8": {
      "resources": {
        "Wood": 300,
        "Stone": 100,
        "Iron": 40,
        "Gold": 20,
        "Crimstone": 8,
        "Oil": 60,
        "Gem": 30
      },
      "coins": 768,
      "sfl": 0,
      "seconds": 1800,
      "level": 74,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "9": {
      "resources": {
        "Wood": 400,
        "Stone": 150,
        "Iron": 35,
        "Gold": 25,
        "Crimstone": 12,
        "Oil": 90,
        "Gem": 60
      },
      "coins": 1152,
      "sfl": 0,
      "seconds": 3600,
      "level": 76,
      "nodes": {}
    },
    "10": {
      "resources": {
        "Wood": 450,
        "Stone": 200,
        "Iron": 30,
        "Gold": 20,
        "Crimstone": 16,
        "Oil": 120,
        "Obsidian": 1,
        "Gem": 60
      },
      "coins": 1920,
      "sfl": 0,
      "seconds": 7200,
      "level": 78,
      "nodes": {
        "Gold Rock": 1
      }
    },
    "11": {
      "resources": {
        "Wood": 500,
        "Stone": 175,
        "Iron": 30,
        "Gold": 30,
        "Crimstone": 20,
        "Oil": 100,
        "Gem": 90
      },
      "coins": 3000,
      "sfl": 0,
      "seconds": 14400,
      "level": 80,
      "nodes": {}
    },
    "12": {
      "resources": {
        "Wood": 650,
        "Stone": 225,
        "Iron": 25,
        "Gold": 25,
        "Crimstone": 24,
        "Oil": 100,
        "Obsidian": 2,
        "Gem": 150
      },
      "coins": 3840,
      "sfl": 0,
      "seconds": 28800,
      "level": 82,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "13": {
      "resources": {
        "Wood": 550,
        "Stone": 200,
        "Iron": 40,
        "Gold": 30,
        "Crimstone": 28,
        "Oil": 100,
        "Gem": 150
      },
      "coins": 4800,
      "sfl": 0,
      "seconds": 43200,
      "level": 84,
      "nodes": {}
    },
    "14": {
      "resources": {
        "Wood": 700,
        "Stone": 250,
        "Iron": 35,
        "Gold": 35,
        "Crimstone": 32,
        "Oil": 100,
        "Obsidian": 1,
        "Gem": 150
      },
      "coins": 5760,
      "sfl": 0,
      "seconds": 43200,
      "level": 86,
      "nodes": {}
    },
    "15": {
      "resources": {
        "Wood": 650,
        "Stone": 200,
        "Iron": 30,
        "Gold": 40,
        "Crimstone": 36,
        "Oil": 200,
        "Obsidian": 2,
        "Gem": 150
      },
      "coins": 6720,
      "sfl": 0,
      "seconds": 86400,
      "level": 88,
      "nodes": {
        "Lava Pit": 1
      }
    },
    "16": {
      "resources": {
        "Wood": 750,
        "Stone": 250,
        "Iron": 40,
        "Gold": 30,
        "Crimstone": 40,
        "Oil": 200,
        "Obsidian": 4,
        "Gem": 150
      },
      "coins": 7680,
      "sfl": 0,
      "seconds": 86400,
      "level": 90,
      "nodes": {
        "Oil Reserve": 1
      }
    },
    "17": {
      "resources": {
        "Wood": 700,
        "Stone": 200,
        "Iron": 35,
        "Gold": 35,
        "Crimstone": 44,
        "Oil": 200,
        "Obsidian": 4,
        "Gem": 150
      },
      "coins": 9600,
      "sfl": 0,
      "seconds": 86400,
      "level": 92,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "18": {
      "resources": {
        "Wood": 800,
        "Stone": 300,
        "Iron": 45,
        "Gold": 45,
        "Crimstone": 48,
        "Oil": 200,
        "Obsidian": 6,
        "Gem": 180
      },
      "coins": 12000,
      "sfl": 0,
      "seconds": 129600,
      "level": 94,
      "nodes": {}
    },
    "19": {
      "resources": {
        "Wood": 750,
        "Stone": 250,
        "Iron": 40,
        "Gold": 40,
        "Crimstone": 52,
        "Oil": 200,
        "Obsidian": 6,
        "Gem": 180
      },
      "coins": 15360,
      "sfl": 0,
      "seconds": 129600,
      "level": 96,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "20": {
      "resources": {
        "Wood": 850,
        "Stone": 300,
        "Iron": 45,
        "Gold": 30,
        "Crimstone": 56,
        "Oil": 200,
        "Obsidian": 8,
        "Gem": 180
      },
      "coins": 18000,
      "sfl": 0,
      "seconds": 172800,
      "level": 98,
      "nodes": {}
    },
    "21": {
      "resources": {
        "Wood": 900,
        "Stone": 325,
        "Iron": 50,
        "Gold": 35,
        "Crimstone": 60,
        "Oil": 200,
        "Obsidian": 8,
        "Gem": 180
      },
      "coins": 21600,
      "sfl": 0,
      "seconds": 172800,
      "level": 100,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "22": {
      "resources": {
        "Wood": 800,
        "Stone": 300,
        "Iron": 45,
        "Gold": 30,
        "Crimstone": 64,
        "Oil": 200,
        "Obsidian": 10,
        "Gem": 180
      },
      "coins": 25200,
      "sfl": 0,
      "seconds": 172800,
      "level": 102,
      "nodes": {}
    },
    "23": {
      "resources": {
        "Wood": 950,
        "Stone": 350,
        "Iron": 50,
        "Gold": 35,
        "Crimstone": 68,
        "Oil": 200,
        "Obsidian": 10,
        "Gem": 180
      },
      "coins": 30000,
      "sfl": 0,
      "seconds": 172800,
      "level": 104,
      "nodes": {
        "Iron Rock": 1
      }
    },
    "24": {
      "resources": {
        "Wood": 1000,
        "Stone": 400,
        "Iron": 55,
        "Gold": 40,
        "Crimstone": 72,
        "Oil": 300,
        "Obsidian": 12,
        "Gem": 180
      },
      "coins": 33600,
      "sfl": 0,
      "seconds": 172800,
      "level": 106,
      "nodes": {
        "Lava Pit": 1
      }
    },
    "25": {
      "resources": {
        "Wood": 1100,
        "Stone": 450,
        "Iron": 60,
        "Gold": 35,
        "Crimstone": 80,
        "Oil": 300,
        "Obsidian": 12,
        "Gem": 180
      },
      "coins": 38400,
      "sfl": 0,
      "seconds": 216000,
      "level": 108,
      "nodes": {
        "Crimstone Rock": 1
      }
    },
    "26": {
      "resources": {
        "Wood": 1200,
        "Stone": 350,
        "Iron": 65,
        "Gold": 30,
        "Crimstone": 85,
        "Oil": 300,
        "Obsidian": 18,
        "Gem": 180
      },
      "coins": 42000,
      "sfl": 0,
      "seconds": 216000,
      "level": 110,
      "nodes": {}
    },
    "27": {
      "resources": {
        "Wood": 1250,
        "Stone": 450,
        "Iron": 70,
        "Gold": 40,
        "Crimstone": 95,
        "Oil": 300,
        "Obsidian": 24,
        "Gem": 225
      },
      "coins": 45600,
      "sfl": 0,
      "seconds": 216000,
      "level": 112,
      "nodes": {}
    },
    "28": {
      "resources": {
        "Wood": 1150,
        "Stone": 500,
        "Iron": 60,
        "Gold": 45,
        "Crimstone": 100,
        "Oil": 300,
        "Obsidian": 30,
        "Gem": 225
      },
      "coins": 50400,
      "sfl": 0,
      "seconds": 216000,
      "level": 114,
      "nodes": {
        "Sunstone Rock": 1
      }
    },
    "29": {
      "resources": {
        "Wood": 1350,
        "Stone": 550,
        "Iron": 65,
        "Gold": 40,
        "Crimstone": 105,
        "Oil": 300,
        "Obsidian": 36,
        "Gem": 225
      },
      "coins": 54000,
      "sfl": 0,
      "seconds": 259200,
      "level": 116,
      "nodes": {}
    },
    "30": {
      "resources": {
        "Wood": 1500,
        "Stone": 600,
        "Iron": 70,
        "Gold": 50,
        "Crimstone": 125,
        "Oil": 300,
        "Obsidian": 42,
        "Gem": 225
      },
      "coins": 60000,
      "sfl": 0,
      "seconds": 259200,
      "level": 120,
      "nodes": {
        "Sunstone Rock": 1
      }
    }
  }
};

// island chain to ascension: expand to .max, pay .upgradeItems, next island
// starts at .nextStart Basic Land (upgradeFarm.ts).
export const ISLAND_PROGRESSION = [
  { island: "basic", max: 9, upgradeItems: { Gold: 10 }, next: "spring", nextStart: 4 },
  { island: "spring", max: 16, upgradeItems: { Crimstone: 20 }, next: "desert", nextStart: 4 },
  { island: "desert", max: 25, upgradeItems: { Oil: 200 }, next: "volcano", nextStart: 5 },
  { island: "volcano", max: 30, upgradeItems: {}, next: null, nextStart: null },
];
