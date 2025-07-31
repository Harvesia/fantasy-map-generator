/*Contains all the static configuration and constants for the map generator
This includes biome definitions, color palettes, and generation parameters*/

// Grid & Tile Settings
export const TILE_SIZE = 4;
export const GRID_WIDTH = 300;
export const GRID_HEIGHT = 300;

// Political Generation
export const MIN_NATIONS = 15;
export const MAX_NATIONS = 25;
export const MIN_PROVINCES_PER_NATION = 3;
export const MAX_PROVINCES_PER_NATION = 6;
export const MIN_COUNTIES_PER_PROVINCE = 4;
export const MAX_COUNTIES_PER_PROVINCE = 7;
// How many development "hotspots" to generate on the map
export const DEVELOPMENT_CORES = Math.floor((GRID_WIDTH * GRID_HEIGHT) / 10000);
// The base development level for every county
export const BASE_DEVELOPMENT = 3;

// Terrain Generation
export const TERRAIN_OCTAVES = 6;
export const TERRAIN_PERSISTENCE = 0.5;
export const TERRAIN_LACUNARITY = 2.0;
export const TERRAIN_INITIAL_FREQUENCY = 2.0;
// Exponent applied to the landmass shape to control island vs continent feel
export const LANDMASS_EXPONENT = 1.2;
// How many hydraulic erosion particles to simulate
export const EROSION_ITERATIONS = 75000;
// How many rivers to attempt to generate
export const RIVER_COUNT = Math.floor(GRID_WIDTH * GRID_HEIGHT / 500);
// Elevation threshold for a tile to be a potential river source
export const RIVER_SOURCE_ELEVATION = 0.65;

// Sociology Generation 
// Target number of cultures is based on the number of land counties
export const COUNTIES_PER_CULTURE = 70;
// Minimum distance between culture hearths, relative to map width
export const CULTURE_HEARTH_MIN_DISTANCE_FACTOR = 8;
// Chance for a highly developed culture to found its own "cultural" religion
export const CULTURAL_RELIGION_SPAWN_CHANCE = 0.4; // (1 - 0.6)
// Number of universalist religions to spawn, based on total county count
export const COUNTIES_PER_UNIVERSALIST_RELIGION = 180;
// Base resistance to religious conversion
export const BASE_RELIGIOUS_RESISTANCE = 70;
// Bonus resistance for "fringe" religions like cults or heresies
export const FRINGE_RELIGION_RESISTANCE_BONUS = 30;
// Resistance reduction for mainstream "universalist" religions
export const UNIVERSALIST_RELIGION_RESISTANCE_REDUCTION = 25;

// Diplomacy Generation
// Number of most powerful nations considered "Great Powers"
export const GREAT_POWER_COUNT = 3;
// Base chance for a great power to attempt to vassalize weaker neighbors
export const VASSALIZATION_CHANCE = 0.1;
// Increased chance if the target is adjacent
export const ADJACENT_VASSALIZATION_CHANCE = 0.7;
// Chance for two major alliances to start in a "Great War"
export const GREAT_WAR_CHANCE = 0.4; // (1 - 0.6)
// Chance for any two neighboring, un-allied nations to start a random border war
export const BORDER_WAR_CHANCE = 0.1; // (1 - 0.9)


// Biome Definitions
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
