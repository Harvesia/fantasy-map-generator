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

/**
 * Finds the "pole of inaccessibility" for a set of tiles using a distance transform (BFS).
 * This finds the point within a territory that is furthest from its border.
 * @param {Set<number>} tileIndices - A set of tile indices belonging to the territory.
 * @param {number} gridWidth - The width of the world grid.
 * @param {number} gridHeight - The height of the world grid.
 * @returns {{x: number, y: number}} The coordinates for the best label position.
 */
export function findPoleOfInaccessibility(tileIndices, gridWidth, gridHeight) {
    if (!tileIndices || tileIndices.size === 0) {
        return { x: 0, y: 0 }; // Fallback
    }

    const distances = new Map();
    const queue = [];

    // 1. Identify all border tiles and initialize the queue
    tileIndices.forEach(idx => {
        const x = idx % gridWidth;
        const y = Math.floor(idx / gridWidth);
        let isBorder = false;
        
        // Check neighbors
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                const nIdx = ny * gridWidth + nx;

                if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight || !tileIndices.has(nIdx)) {
                    isBorder = true;
                    break;
                }
            }
            if (isBorder) break;
        }

        if (isBorder) {
            distances.set(idx, 0);
            queue.push(idx);
        } else {
            distances.set(idx, Infinity);
        }
    });

    // 2. Perform Breadth-First Search (BFS) to calculate distance from the border
    let head = 0;
    while (head < queue.length) {
        const currentIdx = queue[head++];
        const x = currentIdx % gridWidth;
        const y = Math.floor(currentIdx / gridWidth);
        const currentDist = distances.get(currentIdx);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                const nIdx = ny * gridWidth + nx;

                if (distances.has(nIdx) && distances.get(nIdx) === Infinity) {
                    distances.set(nIdx, currentDist + 1);
                    queue.push(nIdx);
                }
            }
        }
    }

    // 3. Find the tile with the maximum distance
    let maxDist = -1;
    let bestIdx = queue[0] || tileIndices.values().next().value; // Fallback to first tile

    distances.forEach((dist, idx) => {
        if (dist > maxDist) {
            maxDist = dist;
            bestIdx = idx;
        }
    });

    return {
        x: bestIdx % gridWidth,
        y: Math.floor(bestIdx / gridWidth)
    };
}
