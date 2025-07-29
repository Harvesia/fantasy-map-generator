/*Contains all the static configuration and constants for the map generator
This includes biome definitions, color palettes, and generation parameters*/

export const TILE_SIZE = 4;
export const GRID_WIDTH = 300;
export const GRID_HEIGHT = 300;

// Political division parameters
export const MIN_NATIONS = 15;
export const MAX_NATIONS = 25;
export const MIN_PROVINCES_PER_NATION = 3;
export const MAX_PROVINCES_PER_NATION = 6;
export const MIN_COUNTIES_PER_PROVINCE = 4;
export const MAX_COUNTIES_PER_PROVINCE = 7;

// Biome definitions with color, movement cost, and development modifier
export const BIOMES = {
    DEEP_OCEAN: { name: "Deep Ocean", color: "#002244", cost: 1000, dev: 0 },
    OCEAN: { name: "Ocean", color: "#003366", cost: 1000, dev: 0 },
    RIVER: { name: "River", color: "#3498db", cost: 10, dev: 2 },
    WETLAND: { name: "Wetland", color: "#2e8b57", cost: 15, dev: -0.5 },
    BEACH: { name: "Beach", color: "#d9c28d", cost: 2, dev: 3 },
    GRASSLAND: { name: "Grassland", color: "#55aa55", cost: 1, dev: 1 },
    SAVANNA: { name: "Savanna", color: "#bda55d", cost: 2, dev: 0.5 },
    FOREST: { name: "Forest", color: "#228833", cost: 5, dev: 1 },
    JUNGLE: { name: "Jungle", color: "#1e5631", cost: 8, dev: 0.5 },
    TAIGA: { name: "Taiga", color: "#006464", cost: 7, dev: 0.5 },
    TUNDRA: { name: "Tundra", color: "#96a1a1", cost: 10, dev: -1 },
    DESERT: { name: "Desert", color: "#c2b280", cost: 3, dev: 0 },
    MOUNTAIN: { name: "Mountain", color: "#888888", cost: 20, dev: -1 },
    SNOW: { name: "Snowy Peak", color: "#ffffff", cost: 30, dev: -2 }
};

// Name generation components
export const nameParts = {
    prefixes: ["Al", "Am", "Ar", "As", "At", "Bal", "Bel", "Bor", "Cal", "Cel", "Cor", "Cy", "Dal", "Dor", "El", "Er", "Fal", "Fen", "Gor", "Gry", "Hal", "Har", "Ill", "Ist", "Jar", "Jor", "Kal", "Kar", "Kor", "Kyr", "Lar", "Lor", "Mar", "Mor", "Nar", "Nor", "Ol", "Or", "Par", "Per", "Qual", "Quor", "Ral", "Ren", "Ror", "Sar", "Sel", "Sor", "Tal", "Tor", "Ul", "Um", "Val", "Vor", "Wil", "Wy", "Yar", "Yor", "Zal", "Zor"],
    middles: ["a", "e", "i", "o", "u", "ae", "ai", "au", "ei", "ia", "io", "ua", "ue", "en", "an", "er", "in", "on", "or", "un", "and", "ess", "ist", "yst"],
    suffixes: ["an", "ar", "en", "ia", "is", "on", "or", "os", "us", "yr", "wood", "dell", "gard", "fall", "crest", "ford", "land", "vale", "wick", "shire", "dor", "mar", "nar", "sor", "thor"]
};
