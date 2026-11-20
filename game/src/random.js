// A small seeded generator (mulberry32) so the city, traffic and every screenshot
// scene are the same for the same seed, and a shuffle helper for spawn lists.

export function createRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the seeded random. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** Fisher-Yates shuffle, in place, with the seeded random. */
export function shuffle(random, array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const temp = array[index];
    array[index] = array[other];
    array[other] = temp;
  }
  return array;
}
