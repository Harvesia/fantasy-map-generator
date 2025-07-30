/* Contains shared utility functions used across the application,
such as noise generation and procedural name creation.*/

import { nameParts } from './config.js';

/**Creates a seeded random number generator
@param {string} seed - The seed string
@returns {function(): number} A function that returns a random number between 0 and 1*/

export function createSeededRandom(seed) {
    // Create a hash from the seed string.
    let h = 1779033703, i = 0, ch;
    for (i = 0; i < seed.length; i++) {
        ch = seed.charCodeAt(i);
        h = Math.imul(h ^ ch, 2654435761);
    }
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    let a = (h ^= h >>> 16) >>> 0;

    // Mulberry32 algorithm
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**A simple Perlin/Simplex-like noise generator.
@param {function(): number} rand - The seeded random function.
@returns {function(number, number): number} A 2D noise function.*/

export function SimpleNoise(rand) {
    const p = Array.from({length: 256}, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = p.concat(p);
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (t, a, b) => a + t * (b - a);
    const grad = (hash, x, y) => {
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    };
    return function(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const aa = perm[X] + Y, ab = perm[X] + Y + 1, ba = perm[X + 1] + Y, bb = perm[X + 1] + Y + 1;
        return lerp(v, lerp(u, grad(perm[aa], x, y), grad(perm[ba], x - 1, y)), lerp(u, grad(perm[ab], x, y - 1), grad(perm[bb], x - 1, y - 1)));
    };
}

/**Generates a random procedural name.
@param {function(): number} rand The seeded random function
@param {Set<string>} usedNames A set of already used names to ensure uniqueness
@returns {string} A unique, procedurally generated name*/

export function randomName(rand, usedNames) {
    let name;
    let attempts = 0;
    do {
        const hasMiddle = rand() > 0.4;
        const prefix = nameParts.prefixes[Math.floor(rand() * nameParts.prefixes.length)];
        const suffix = nameParts.suffixes[Math.floor(rand() * nameParts.suffixes.length)];
        
        if (hasMiddle) {
            const middle = nameParts.middles[Math.floor(rand() * nameParts.middles.length)];
            name = prefix + middle + suffix;
        } else {
            name = prefix + suffix;
        }

        if (prefix.slice(-2).toLowerCase() === suffix.slice(0, 2).toLowerCase() || prefix.slice(-1) === suffix.slice(0,1)) {
            attempts++;
            continue;
        }

        attempts++;
        if (attempts > 100 && usedNames.has(name)) { 
            name += " " + (attempts - 99);
        }

    } while (usedNames.has(name) && attempts < 200);
    usedNames.add(name);
    return name;
}
