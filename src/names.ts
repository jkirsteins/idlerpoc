const PREFIXES = ['Zar', 'Kex', 'Vyn', 'Drax', 'Nexu', 'Cyro', 'Quin', 'Xel'];
const SUFFIXES = ['ion', 'ax', 'era', 'is', 'on', 'ix', 'ara', 'us'];

export function generateSciFiName(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return prefix + suffix;
}
