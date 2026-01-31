// Captain name generators - Gap Cycle/Firefly inspired
const CAPTAIN_FIRST_NAMES = [
  'Nick',
  'Morn',
  'Malcolm',
  'Angus',
  'Warden',
  'Hashi',
  'Zoe',
  'Jayne',
  'Kaylee',
  'River',
  'Simon',
  'Inara',
  'Hoban',
  'Sorus',
  'Vector',
  'Davies',
  'Mikka',
  'Ciro',
  'Delilah',
  'Marcus',
  'Elena',
  'Jax',
  'Kira',
  'Tobias',
  'Sage',
  'Orion',
  'Luna',
  'Cassian',
  'Vera',
  'Rex',
];

const CAPTAIN_LAST_NAMES = [
  'Succorso',
  'Hyland',
  'Reynolds',
  'Thermopyle',
  'Dios',
  'Lebwohl',
  'Washburne',
  'Cobb',
  'Frye',
  'Tam',
  'Serra',
  'Chatelaine',
  'Shaheed',
  'Vasaczk',
  'Donner',
  'Erikson',
  'Vance',
  'Kell',
  'Stark',
  'Rowe',
  'Chen',
  'Graves',
  'Marsh',
  'Cross',
  'Vega',
  'Holt',
  'Drake',
  'Stone',
  'Webb',
  'Cole',
];

// Ship name components
const SHIP_NAME_SINGLE = [
  'Needle',
  'Serenity',
  'Tranquility',
  'Defiance',
  'Harbinger',
  'Nomad',
  'Vagabond',
  'Wanderer',
  'Revenant',
  'Specter',
  'Phantom',
  'Eclipse',
  'Horizon',
  'Tempest',
  'Valiant',
  'Intrepid',
  'Resolute',
  'Relentless',
  'Dauntless',
  'Indomitable',
];

const SHIP_NAME_ADJECTIVES = [
  'Bright',
  'Dark',
  'Silent',
  'Swift',
  'Iron',
  'Silver',
  'Golden',
  'Crimson',
  'Midnight',
  'Distant',
  'Eternal',
  'Fallen',
  'Rising',
  'Burning',
  'Frozen',
  'Lost',
  'Last',
  'First',
  "Starmaster's",
  "Captain's",
];

const SHIP_NAME_NOUNS = [
  'Beauty',
  'Dream',
  'Hope',
  'Fortune',
  'Destiny',
  'Legacy',
  'Venture',
  'Promise',
  'Star',
  'Sun',
  'Moon',
  'Comet',
  'Void',
  'Dawn',
  'Dusk',
  'Light',
  'Shadow',
  'Thunder',
  'Storm',
  'Wind',
];

// Crew name components
const CREW_FIRST_NAMES = [
  'Jin',
  'Yuki',
  'Omar',
  'Sven',
  'Nia',
  'Raj',
  'Zara',
  'Felix',
  'Hana',
  'Leo',
  'Mei',
  'Kai',
  'Rosa',
  'Ivan',
  'Asha',
  'Dex',
  'Lira',
  'Cole',
  'Tess',
  'Remi',
  'Sol',
  'Nix',
  'Cade',
  'Vera',
  'Enzo',
  'Mira',
  'Quinn',
  'Ash',
  'Jade',
  'Finn',
];

const CREW_LAST_NAMES = [
  'Tanaka',
  'Volkov',
  'Santos',
  'Okafor',
  'Patel',
  'Larsson',
  'Reyes',
  'Zhang',
  'Kim',
  'Müller',
  'Silva',
  'Nakamura',
  'Costa',
  'Hansen',
  'Park',
  'Fernandez',
  'Andersen',
  'Yamamoto',
  'Moreno',
  'Johansson',
  'Sato',
  'Rivera',
  'Berg',
  'Huang',
  'Torres',
  'Nguyen',
  'Petrov',
  'Garcia',
  'Li',
  'Holm',
];

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function generateCaptainName(): string {
  const first = randomElement(CAPTAIN_FIRST_NAMES);
  const last = randomElement(CAPTAIN_LAST_NAMES);
  return `${first} ${last}`;
}

export function generateShipName(): string {
  const style = Math.random();

  if (style < 0.4) {
    // Single word name (40%)
    return randomElement(SHIP_NAME_SINGLE);
  } else if (style < 0.8) {
    // Two word: Adjective + Noun (40%)
    const adj = randomElement(SHIP_NAME_ADJECTIVES);
    const noun = randomElement(SHIP_NAME_NOUNS);
    return `${adj} ${noun}`;
  } else {
    // Three word: "The Adjective Noun" (20%)
    const adj = randomElement(SHIP_NAME_ADJECTIVES);
    const noun = randomElement(SHIP_NAME_NOUNS);
    return `The ${adj} ${noun}`;
  }
}

export function generateCrewName(): string {
  const first = randomElement(CREW_FIRST_NAMES);
  const last = randomElement(CREW_LAST_NAMES);
  return `${first} ${last}`;
}

// Keep legacy function for backwards compatibility during transition
export function generateSciFiName(): string {
  return generateCaptainName();
}
