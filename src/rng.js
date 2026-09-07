export class Rng {
  constructor(seed = Date.now()) {
    this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick(items) {
    return items[this.int(0, items.length - 1)];
  }
}

