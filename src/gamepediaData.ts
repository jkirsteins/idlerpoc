/**
 * Gamepedia article data — an in-game encyclopedia explaining mechanics.
 *
 * Articles are pure static data. The UI renders them from this structure.
 * Cross-references use article IDs and the UI creates clickable links.
 */

export interface ArticleSection {
  heading?: string;
  paragraphs: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface GamepediaArticle {
  id: string;
  title: string;
  category: GamepediaCategory;
  summary: string;
  sections: ArticleSection[];
  relatedArticles: string[];
}

export type GamepediaCategory =
  | 'Core Systems'
  | 'Crew'
  | 'Ship Systems'
  | 'Space'
  | 'Health & Environment'
  | 'Mining & Resources';

export const GAMEPEDIA_CATEGORIES: GamepediaCategory[] = [
  'Core Systems',
  'Crew',
  'Ship Systems',
  'Space',
  'Health & Environment',
  'Mining & Resources',
];

export const GAMEPEDIA_ARTICLES: GamepediaArticle[] = [
  // ═══════════════════════════════════════════════════════════
  // CORE SYSTEMS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'time-system',
    title: 'Time System',
    category: 'Core Systems',
    summary: 'How game time advances, idle catch-up, and day progression.',
    sections: [
      {
        paragraphs: [
          'The game runs on a tick-based simulation where each real-time second equals 3 game minutes (180 game seconds). A full game day takes about 8 real minutes to pass.',
          'The game auto-pauses on arrival at a destination (configurable in Settings). While docked, you can manually advance to the next day to refresh available [[contracts|quests]] and trigger [[zero-g-exposure|recovery]] mechanics. Salaries still accrue during manual day advancement.',
        ],
      },
      {
        heading: 'Idle Catch-Up',
        paragraphs: [
          'The game is idle-friendly: closing the browser or backgrounding the tab does not lose progress. When you return, the game computes all elapsed time and processes pending updates in batches.',
          'If you were away for more than 5 real minutes, a catch-up report shows what happened while you were gone, including per-ship [[contracts|contract]] progress (ongoing, completed, expired, or abandoned), [[encounters|encounters]], [[credits-economy|credit]] changes, and any [[crew-death|crew deaths]].',
          'Offline progress is never hard-capped — you will always make progress no matter how long you are away. The first 4 real-world hours accrue at full rate. Beyond that, progress continues at a logarithmically diminishing rate, so active play remains more rewarding than very long absences. During fast-forward, [[encounters|encounter]] severity is capped (boardings downgraded to harassment) to prevent unfair losses while away.',
          'The event log keeps the most recent 200 entries. Older events are automatically pruned to keep save data compact.',
        ],
      },
      {
        heading: 'Time Scale',
        paragraphs: [
          'The time system is designed with idle-game pacing in mind, offering layered clocks for different play styles.',
        ],
        table: {
          headers: ['Route Type', 'Game Duration', 'Real Duration'],
          rows: [
            ['Short (e.g. Earth to Meridian)', '~1-2 days', '~5-8 minutes'],
            ['Medium (e.g. Earth to Forge)', '~10-20 days', '~1.5-2.5 hours'],
            ['Long (e.g. Earth to Mars)', '~weeks', 'Several hours'],
          ],
        },
      },
      {
        heading: 'Speed Controls',
        paragraphs: [
          'You can adjust game speed (1x, 2x, 5x) to speed up routine operations. The game can also be paused manually, and auto-pause settings trigger pauses on arrival, contract completion, or critical alerts.',
        ],
      },
    ],
    relatedArticles: [
      'contracts',
      'flight-physics',
      'orbital-mechanics',
      'encounters',
    ],
  },

  {
    id: 'credits-economy',
    title: 'Credits & Economy',
    category: 'Core Systems',
    summary: 'Earning credits, managing expenses, and economic pressure.',
    sections: [
      {
        paragraphs: [
          'Credits are the universal currency. You earn them by completing [[contracts|contracts and trade routes]], selling [[ore-types|mined ore]], and spend them on fuel, [[crew-salaries|crew salaries]], [[crew-hiring|hiring]], and [[ship-equipment|equipment]].',
          'Economic pressure is constant: your crew costs money every day, and fuel is expensive. Accepting profitable [[contracts|contracts]], [[mining-system|mining]] valuable ores, and planning efficient routes is essential to stay solvent.',
        ],
      },
      {
        heading: 'Income Sources',
        paragraphs: [
          '[[contracts|Contracts]]: Delivery, passenger, and freight contracts pay upon completion or per trip. Active contracts with deadlines pay significantly more than passive trade routes.',
          '[[contracts|Trade routes]] provide reliable recurring income between trading stations. Lower pay per trip but permanent and fully automatable. Trade profit margins shrink with distance — short cislunar routes offer 30-100% margins, while deep-space routes beyond 100M km offer only 5-15%. At extreme range, [[mining-system|mining]] becomes the primary income source.',
          '[[mining-system|Mining]]: Extract ore at mining locations and sell at stations with trade services.',
          '[[encounters|Combat]] victories occasionally yield bounty payments.',
        ],
      },
      {
        heading: 'Expenses',
        paragraphs: [
          '[[crew-salaries|Crew salaries]] are deducted every day, including during manual day advancement while docked. A typical crew of 1 pilot + 1 miner + 1 trader costs 144 credits per day.',
          "Fuel must be purchased at stations with refueling services. Fuel pricing varies by location and [[engines|engine type]] — a Leviathan's D-He3 fusion fuel costs 30x more per kg than a Station Keeper's chemical propellant. Managing fuel costs is critical for higher-tier [[ship-classes|ships]].",
          '[[ship-equipment|Equipment]] can be bought at stations with trade services. Selling equipment returns 50% of the retail value.',
          '[[provisions|Provisions]] (food and water) are auto-purchased when docked at trade stations. Crew eat station-side at trade stations, so ship provisions are only consumed during flight and at remote locations without trade services. Base consumption is 15 kg per crew per day, but [[life-support|life support]] recycling reduces this to ~5 kg effective.',
          'If credits reach zero, crew become unpaid. Unpaid crew will leave the ship at the next port. The captain (you) never leaves.',
        ],
      },
      {
        heading: 'Captain Command Bonus',
        paragraphs: [
          "The captain provides a [[captain-command|Command Bonus]] to the ship they are aboard — a continuous multiplier to income, [[mining-system|mining]] yield, and encounter evasion derived from their [[skill-system|skills]]. The better the captain's skills, the bigger the bonus.",
          'Ships without the captain use an acting captain (highest [[commerce-skill|Commerce]] crew member) who provides only 25% of the commerce bonus. Placing the captain on your most productive ship maximizes fleet income.',
        ],
      },
      {
        heading: 'Daily Ledger',
        paragraphs: [
          'The Daily Ledger shows your fleet-wide financial health at a glance. It appears in the left sidebar, the header status bar, and the Fleet Performance Dashboard.',
          'Income is calculated as a rolling average over the past 7 game days. This smooths out the lumpy nature of contract payments and ore sales into a meaningful daily rate. The average begins populating after your first full day of play.',
          'Expenses are projected deterministically from your current fleet configuration: [[crew-salaries|crew salaries]] (fixed daily cost based on crew composition) and estimated fuel costs (based on active [[contracts|trade routes]], [[mining-system|mining routes]], and contracts).',
          'Net rate is income minus expenses. A positive net rate means your credits are growing; a negative rate means you are losing money. If your net rate is negative, the Runway indicator shows how many days your current credits will last at the current burn rate. Use this to plan ahead — accept new contracts, adjust routes, or cut crew before funds run out.',
        ],
      },
    ],
    relatedArticles: [
      'contracts',
      'crew-salaries',
      'commerce-skill',
      'captain-command',
      'crew-hiring',
      'mining-system',
      'station-services',
      'provisions',
    ],
  },

  {
    id: 'station-services',
    title: 'Station Services',
    category: 'Core Systems',
    summary:
      'What you can do when docked — fuel, trade, hiring, and equipment.',
    sections: [
      {
        paragraphs: [
          'When your ship is docked at a location, the Station tab provides access to all services available at that port. Which sections appear depends on the services the location offers.',
        ],
      },
      {
        heading: 'Fuel Depot',
        paragraphs: [
          'Locations with the refuel service let you purchase fuel. Price per kilogram varies by location and by [[engines|engine type]] — fusion propellant costs far more than chemical fuel. See [[engines|Engines]] for fuel cost tiers and [[credits-economy|Credits & Economy]] for how the [[commerce-skill|Commerce]] skill reduces fuel costs.',
        ],
      },
      {
        heading: 'Ore Exchange',
        paragraphs: [
          'At locations with trade services, you can sell [[ore-types|mined ore]] from your cargo hold. Prices depend on ore rarity, location type, and your [[commerce-skill|Commerce]] skill. Sell individual ore types or use Sell All for a quick offload.',
        ],
      },
      {
        heading: 'Station Store',
        paragraphs: [
          'The store has three sub-tabs: Buy Crew Gear (personal [[crew-equipment|crew equipment]]), Sell (offload items at 50% value), and Ship Equipment ([[ship-equipment|ship-mounted gear]] like mining rigs). Upgrading ship equipment gives trade-in credit for the old item.',
        ],
      },
      {
        heading: 'Hiring Office',
        paragraphs: [
          'Locations with hiring services present a roster of [[crew-hiring|available crew candidates]]. Each candidate shows their role, skill levels, hire cost, and ongoing salary.',
        ],
      },
      {
        heading: 'Provisions Resupply',
        paragraphs: [
          'When docked at a location with trade services, your ship automatically purchases [[provisions|provisions]] (food and water) up to 30 days of supply. Crew eat station-side at trade stations, so ship provisions are not consumed until departure. At mining-only locations without trade services, provisions are still consumed. Pricing varies by region — outer-system stations charge up to 2.5x the base rate.',
        ],
      },
      {
        heading: 'Flavor Text',
        paragraphs: [
          'Each time you dock, the Station tab shows an atmospheric description of the port — the sights, sounds, and smells of each location type. The text rotates daily so repeat visits feel varied.',
        ],
      },
    ],
    relatedArticles: [
      'credits-economy',
      'crew-hiring',
      'crew-equipment',
      'ship-equipment',
      'mining-system',
      'ore-types',
      'commerce-skill',
      'provisions',
    ],
  },

  {
    id: 'contracts',
    title: 'Contracts & Trade Routes',
    category: 'Core Systems',
    summary:
      'Quest types, trade routes, deadlines, payment structure, and contract management.',
    sections: [
      {
        paragraphs: [
          'Contracts are your primary source of [[credits-economy|income]]. Available contracts refresh each day and are generated based on your [[navigation|location]], ship capabilities, and local conditions.',
        ],
      },
      {
        heading: 'Active Contracts (High Pay)',
        paragraphs: [
          "Finite contracts pay significantly more than automated trade routes — the reward for paying attention. Each accepted contract has a deadline: if you don't complete it in time, it expires and you lose the remaining payout (but keep any per-trip credits earned).",
          'Passenger: Ferry passengers between locations. Highest pay of any contract type but tightest deadline (3 days). Requires crew quarters.',
          'Delivery: Transport specific cargo to a destination. High one-time payment on completion. 7-day deadline.',
          'Freight: Haul bulk goods over multiple trips (2-7 round trips). Good per-trip pay with a 14-day deadline. Credits earned from completed trips are kept even if the contract expires.',
        ],
      },
      {
        heading: 'Passive Routes (Steady Pay)',
        paragraphs: [
          'Trade routes are permanent routes between all trading partners at every trade hub. They never expire, have no deadline, and can be fully automated — set a ship on a route and forget about it. The trade-off is lower cr/hr compared to active contracts.',
          'Trade goods are determined by [[navigation|location]] type: planets export manufactured goods, stations export tech components, asteroid belts export raw ore.',
          'Trade route payment scales with distance, route danger, and location economic power. [[commerce-skill|Commerce skill]] bonuses apply to all contract types but yield the biggest absolute gains on high-paying active contracts.',
        ],
      },
      {
        heading: 'Cargo Scaling & Ship Progression',
        paragraphs: [
          "All cargo-hauling contracts scale the load with your [[ship-classes|ship's]] available cargo hold. Bigger ships fill their holds more per trip, earning proportionally more through cargo premiums. Upgrading to a larger ship class immediately increases income on all contracts and trade routes.",
          'All quest cards show costs, payment, and profit as credits per in-game hour (cr/hr). This lets you compare profitability across contracts of different distances at a glance — a short trip and a long trip are equally easy to evaluate.',
        ],
      },
      {
        heading: 'Contract Management',
        paragraphs: [
          'You can only have one active contract per ship at a time. While in flight you can choose to continue, pause and dock on arrival, or abandon the contract.',
          'Pausing a contract preserves all progress — resume anytime from the docked state. Abandoning a contract ends it permanently, but you keep credits earned from completed trips, including the trip in progress if you are already on the return leg.',
          'Quest cards show estimated fuel cost, trip time (with real-time equivalent), [[crew-salaries|crew salary]] cost, and projected profit/loss as cr/hr based on your current [[flight-physics|flight profile]].',
          'Accepting a contract requires the [[job-slots|helm]] to be manned — make sure you have crew assigned to the helm before browsing the job board.',
        ],
      },
    ],
    relatedArticles: [
      'credits-economy',
      'flight-physics',
      'launch-windows',
      'navigation',
      'commerce-skill',
    ],
  },

  {
    id: 'mastery-system',
    title: 'Mastery System',
    category: 'Core Systems',
    summary:
      'Three-layer skill progression: skill level, item mastery, and mastery pool.',
    sections: [
      {
        paragraphs: [
          'Every [[skill-system|skill]] uses a three-layer progression system that rewards both breadth and depth. Understanding these layers is key to efficient crew development.',
        ],
      },
      {
        heading: 'Layer 1: Skill Level (0-99)',
        paragraphs: [
          'The base skill level determines what you can do. Higher levels unlock new capabilities: better [[ship-classes|ship classes]] for piloting, rarer [[ore-types|ores]] for mining, larger trade bonuses for [[commerce-skill|commerce]], and faster repair speed for repairs.',
          'Skill level trains passively through [[job-slots|job slot]] assignment during flight and orbiting. Training uses diminishing returns — fast progress early, slow progress at high levels. Some skills require specific conditions — [[mining-system|mining]] only trains while orbiting a mine-enabled location.',
        ],
      },
      {
        heading: 'Layer 2: Item Mastery (0-99 per item)',
        paragraphs: [
          "Each skill has specific items that can be mastered individually. Mastery builds through repeated use and provides familiarity bonuses. Piloting route mastery XP is awarded to the helm crew on every flight arrival. Commerce trade route mastery XP is awarded to the ship's commanding officer on every completed trip. Repairs equipment mastery XP is earned by repairing specific equipment types.",
        ],
        table: {
          headers: ['Skill', 'Mastery Type', 'Effect'],
          rows: [
            [
              '[[skill-system|Piloting]]',
              'Route mastery',
              'Faster travel and better fuel efficiency on familiar routes',
            ],
            [
              '[[skill-system|Mining]]',
              'Ore mastery',
              'Faster extraction and better yields for mastered ore types',
            ],
            [
              '[[skill-system|Commerce]]',
              'Trade route mastery',
              'Better prices and payment bonuses on familiar trade routes',
            ],
            [
              '[[skill-system|Repairs]]',
              'Equipment mastery',
              'Faster repair speed for mastered [[ship-equipment|equipment]] types',
            ],
          ],
        },
      },
      {
        heading: 'Layer 3: Mastery Pool (0-100%)',
        paragraphs: [
          'As you earn item mastery XP, 25% of that XP flows into a per-skill mastery pool. Once your [[skill-system|skill level]] reaches 99, the flow rate increases to 50%. The pool percentage represents your overall mastery of the skill domain.',
          'The mastery pool provides skill-wide bonuses at key checkpoints. Bonuses are specific to each skill:',
        ],
        table: {
          headers: ['Checkpoint', 'Piloting', 'Mining', 'Commerce', 'Repairs'],
          rows: [
            [
              '10%',
              '+5% mastery XP',
              '+5% mastery XP',
              '+5% mastery XP',
              '+5% mastery XP',
            ],
            [
              '25%',
              '-0.1s engine warmup',
              '+5% ore yield',
              '-5% crew salary',
              '+5% repair speed',
            ],
            [
              '50%',
              '+5% fuel efficiency',
              '-10% equipment degradation',
              '+5% sell price',
              '-10% air filter degradation',
            ],
            [
              '95%',
              '+10% evasion chance',
              '+10% double ore chance',
              '+10% contract payment',
              '+10% bonus repair points',
            ],
          ],
        },
      },
      {
        heading: 'Spending Pool XP',
        paragraphs: [
          'You can spend accumulated pool XP to boost lagging item masteries — for example, spending pool XP to quickly level up mastery of a new ore type you just unlocked.',
          'However, spending pool XP reduces your pool percentage, which may drop you below a checkpoint and lose its bonus. This creates a strategic tension: do you maintain your pool percentage for the passive bonuses, or spend it to accelerate mastery of new items?',
          'Rebuilding pool percentage after spending requires earning more item mastery XP across all items in that skill domain.',
        ],
      },
    ],
    relatedArticles: ['skill-system', 'mining-system', 'commerce-skill'],
  },

  // ═══════════════════════════════════════════════════════════
  // CREW
  // ═══════════════════════════════════════════════════════════
  {
    id: 'skill-system',
    title: 'Skill System',
    category: 'Crew',
    summary:
      'Four core skills with mastery layers, trained passively via job slot assignment.',
    sections: [
      {
        paragraphs: [
          'Every crew member has 4 skills on a 0-99 scale. Skills train passively through [[job-slots|job slot]] assignment during flight and orbiting. Each skill feeds into the [[mastery-system|three-layer mastery system]] for deeper progression.',
        ],
      },
      {
        heading: 'Core Skills',
        paragraphs: [
          'Each skill is linked to a [[crew-roles|crew role]] and determines what that crew member excels at.',
        ],
        table: {
          headers: ['Skill', 'Role', 'Used For'],
          rows: [
            [
              'Piloting',
              '[[crew-roles|Pilot]]',
              'Ship handling, navigation, [[encounters|combat]] defense, [[ship-classes|ship class]] access',
            ],
            [
              'Mining',
              '[[crew-roles|Miner]]',
              '[[mining-system|Resource extraction]], [[ore-types|ore]] processing, equipment operation',
            ],
            [
              '[[commerce-skill|Commerce]]',
              '[[crew-roles|Trader]]',
              'Trade negotiations, route optimization, economic bonuses',
            ],
            [
              'Repairs',
              '[[crew-roles|Engineer]]',
              '[[ship-equipment|Equipment]] maintenance, repair speed, mastery of specific equipment types',
            ],
          ],
        },
      },
      {
        heading: 'Training Mechanics',
        paragraphs: [
          'Skills train passively when crew are assigned to [[job-slots|job slots]] that use that skill. Training speed uses diminishing returns — fast progress early, slow progress at high levels.',
          'When a crew member is assigned to a job that matches their primary [[crew-roles|role]] skill, they receive a 1.5x training bonus.',
          'Training occurs during flight and orbiting. Docked time does not advance skill training. Activity-gated skills like [[mining-system|mining]] require the ship to be orbiting a location with the relevant service — mining crew will not train during transit.',
        ],
      },
      {
        heading: 'Mastery Layers',
        paragraphs: [
          'Beyond the base skill level, each skill has [[mastery-system|item mastery]] and a mastery pool that provide additional bonuses. Route mastery for piloting, ore mastery for mining, trade route mastery for commerce, and equipment mastery for repairs all reward repeated engagement with specific content.',
        ],
      },
      {
        heading: 'Skill Ranks',
        paragraphs: [
          'Skills progress through 10 named ranks with non-linear distribution. Early ranks come quickly; high ranks require sustained play.',
        ],
        table: {
          headers: ['Rank', 'Min Level', 'Design Intent'],
          rows: [
            ['Untrained', '0', 'Starting state'],
            ['Green', '5', 'First steps'],
            ['Novice', '12', 'Learning basics'],
            ['Apprentice', '20', 'Developing competence'],
            ['Competent', '30', 'Functional crew member'],
            ['Able', '40', 'Reliable performer'],
            ['Proficient', '55', 'Above average'],
            ['Skilled', '70', 'High capability'],
            ['Expert', '83', 'Top tier'],
            ['Master', '95', 'Pinnacle of mastery'],
          ],
        },
      },
    ],
    relatedArticles: [
      'mastery-system',
      'commerce-skill',
      'crew-roles',
      'job-slots',
    ],
  },

  {
    id: 'specialization',
    title: 'Specialization',
    category: 'Crew',
    summary:
      'One-time skill focus at level 50 for faster mastery at the cost of versatility.',
    sections: [
      {
        paragraphs: [
          'When any [[skill-system|skill]] reaches level 50 (Able rank), you can choose to specialize that crew member in that skill.',
        ],
      },
      {
        heading: 'Effects',
        paragraphs: [
          '+50% training speed for the specialized skill.',
          '-25% training speed for all other skills.',
          'This is a one-time, irreversible choice — choose carefully.',
        ],
      },
      {
        heading: 'Strategy',
        paragraphs: [
          'Specialize early (at 50) if you want faster progression to Expert and Master [[skill-system|ranks]] in one skill.',
          'Wait and keep training broadly if you want a versatile crew member who can fill multiple [[crew-roles|roles]].',
          'Over time, specialization creates roster differentiation — your crew becomes uniquely yours.',
        ],
      },
    ],
    relatedArticles: ['skill-system', 'crew-roles', 'job-slots'],
  },

  {
    id: 'commerce-skill',
    title: 'Commerce Skill',
    category: 'Crew',
    summary:
      'A core skill focused on trade mastery, providing financial bonuses through experience.',
    sections: [
      {
        paragraphs: [
          'Commerce is one of the three core [[skill-system|skills]], focused on trade and economic mastery. Crew assigned to trader [[job-slots|job slots]] train commerce passively during flight.',
          "The ship's commanding officer and first officer (next-best commerce crew member) earn additional commerce XP when [[contracts|contracts]] complete, creating a feedback loop where trade experience improves future profitability.",
        ],
      },
      {
        heading: 'Training',
        paragraphs: [
          'Commerce trains through trader job slot assignment like other skills. Additionally, completing [[contracts|trade route contracts]] provides bonus commerce XP.',
          'Ship commander earns: 1.0 + 0.5 per trip completed in the contract.',
          "First officer earns half the commander's amount.",
          'Trade route [[mastery-system|mastery]] develops separately through repeated runs on the same routes, providing familiarity bonuses.',
        ],
      },
      {
        heading: 'Captain Command Bonus',
        paragraphs: [
          "When the captain is aboard a ship, their commerce skill provides a continuous [[captain-command|Command Bonus]] to income: +1% per skill point (e.g. skill 50 = +50% income). This replaces the tiered bracket system for the captain's ship.",
          'Ships without the captain use an acting captain who provides 25% of the equivalent bonus.',
        ],
      },
      {
        heading: 'Fuel Discount',
        paragraphs: ['Commerce skill also provides fuel purchase discounts:'],
        table: {
          headers: ['Commerce Level', 'Fuel Discount'],
          rows: [
            ['0-24', '0%'],
            ['25-49', '-5%'],
            ['50-74', '-10%'],
            ['75-94', '-15%'],
            ['95-99', '-20%'],
          ],
        },
      },
    ],
    relatedArticles: [
      'skill-system',
      'contracts',
      'credits-economy',
      'captain-command',
      'mastery-system',
    ],
  },

  {
    id: 'crew-roles',
    title: 'Crew Roles',
    category: 'Crew',
    summary: 'How roles are derived from skills, not assigned directly.',
    sections: [
      {
        paragraphs: [
          "A crew member's role is determined by their highest [[skill-system|skill]], representing their primary expertise. Roles are not manually assigned — they shift dynamically if skill distribution changes.",
          'The captain is always the player character regardless of skills. The captain can be transferred between ships you own — when absent from a ship, the crew member with the highest commerce skill acts as commanding officer for trade bonuses.',
        ],
      },
      {
        heading: 'Role Mapping',
        paragraphs: [''],
        table: {
          headers: ['Highest Skill', 'Role', 'Specialty'],
          rows: [
            [
              '[[skill-system|Piloting]]',
              'Pilot',
              'Ship handling, navigation, and [[encounters|combat]] defense',
            ],
            [
              '[[skill-system|Mining]]',
              'Miner',
              '[[mining-system|Resource extraction]] and [[ore-types|ore]] processing',
            ],
            [
              '[[skill-system|Commerce]]',
              'Trader',
              'Trade negotiations and route optimization',
            ],
            [
              '[[skill-system|Repairs]]',
              'Engineer',
              '[[ship-equipment|Equipment]] maintenance and repair',
            ],
          ],
        },
      },
      {
        heading: 'Role Priority',
        paragraphs: [
          'When skills are tied, roles are assigned in priority order: Piloting > Mining > Commerce > Repairs.',
          'Crew can transition roles over time as they develop different [[skill-system|skills]] through [[job-slots|job training]], though this is uncommon.',
        ],
      },
    ],
    relatedArticles: [
      'skill-system',
      'job-slots',
      'crew-hiring',
      'crew-profiles',
    ],
  },

  {
    id: 'crew-hiring',
    title: 'Crew Hiring',
    category: 'Crew',
    summary:
      'Recruiting new crew at stations, archetypes, costs, and candidate generation.',
    sections: [
      {
        paragraphs: [
          'When docked at stations with hiring services (Earth, Forge Station, Freeport Station, Mars), you can recruit additional crew members.',
        ],
      },
      {
        heading: 'Candidate Generation',
        paragraphs: [
          "Each day, a new roster of candidates is generated at every hiring station. The number of available candidates depends on the station's size — major hubs like Earth typically offer 1-5 candidates, while smaller outposts may have none at all.",
          'There is a small chance that nobody is looking for work on a given day — about 10% at major hubs, rising to 50% at remote outposts. Advance to the next day to see a fresh roster.',
        ],
      },
      {
        heading: 'Archetypes & Skills',
        paragraphs: [
          'Every candidate has a [[crew-roles|role]] archetype — [[crew-roles|Pilot]], [[crew-roles|Miner]], or [[crew-roles|Trader]] — that determines their [[skill-system|skill]] distribution. A pilot has strong piloting with some commerce; a miner has strong mining with some piloting; a trader has strong commerce with some piloting.',
          'Candidate quality varies widely. Most candidates are green recruits with low skills, but occasionally a seasoned veteran will appear. Larger stations attract slightly better candidates on average.',
        ],
      },
      {
        heading: 'Hiring Cost',
        paragraphs: [
          "Hire cost scales polynomially with total skill — green recruits are cheap, but veterans and elite specialists demand real investment comparable to one or more trip's profit.",
        ],
        table: {
          headers: ['Candidate Type', 'Typical Skills', 'Approximate Cost'],
          rows: [
            ['Green recruit', '0-5 total', '500-830 cr'],
            ['Seasoned crew', '10-15 total', '1,800-3,100 cr'],
            ['Veteran', '25-35 total', '7,000-13,500 cr'],
            ['Elite specialist', '40-50 total', '16,000-24,000 cr'],
          ],
        },
      },
      {
        heading: 'Salary Scaling',
        paragraphs: [
          'More skilled candidates demand significantly higher [[crew-salaries|salaries]]. A green recruit costs the base rate (48 cr/day), while a veteran with 30 total skill points demands around 186 cr/day — nearly 4x the base rate. The salary multiplier is locked at hire time — training crew after hiring does not increase their wage.',
          'This creates a core decision: hire cheap recruits and train them over days of real time (cost-effective but slow), or invest heavily in pre-skilled veterans for immediate capability at ongoing expense.',
        ],
      },
      {
        heading: 'Strategy',
        paragraphs: [
          'Hiring decisions balance upfront cost, ongoing salary, and training time. A green recruit is cheap to hire and maintain but needs time to develop skills. A veteran hits the ground running but costs more to hire and demands higher wages.',
          'If crew leave due to unpaid wages, you may need emergency hiring at the next port.',
        ],
      },
    ],
    relatedArticles: [
      'crew-roles',
      'crew-salaries',
      'crew-profiles',
      'credits-economy',
      'station-services',
    ],
  },

  {
    id: 'crew-salaries',
    title: 'Crew Salaries',
    category: 'Crew',
    summary:
      'Salary rates by role, payment timing, skill-based scaling, and unpaid crew.',
    sections: [
      {
        paragraphs: [
          'Crew members require regular payment. Salaries are deducted every game day, including during manual day advancement while docked.',
        ],
      },
      {
        heading: 'Base Salary Rates',
        paragraphs: ['All non-captain roles share the same base salary rate:'],
        table: {
          headers: ['Role', 'Base Per Day', 'Notes'],
          rows: [
            ['Captain', '0 cr', 'Owner-operator, earns from ship profits'],
            ['[[crew-roles|Pilot]]', '48 cr', 'Essential bridge crew'],
            ['[[crew-roles|Miner]]', '48 cr', 'Resource extraction specialist'],
            ['[[crew-roles|Trader]]', '48 cr', 'Trade and commerce specialist'],
            [
              '[[crew-roles|Engineer]]',
              '48 cr',
              'Equipment maintenance specialist',
            ],
          ],
        },
      },
      {
        heading: 'Skill-Based Salary Scaling',
        paragraphs: [
          "More skilled crew command significantly higher wages. When [[crew-hiring|hired]], each crew member's salary multiplier is set based on their starting skills. A green recruit costs the base rate (48 cr/day), while a veteran with 30 total skill points demands around 186 cr/day — nearly 4x the base rate.",
          'The salary multiplier is locked at hire time — training crew after hiring does not increase their wage. A ship crewed with veterans can cost 500+ cr/day in salaries alone, making crew composition a serious economic decision.',
        ],
      },
      {
        heading: 'Payment Failure',
        paragraphs: [
          'If credits reach zero, crew become "unpaid." Unpaid crew will leave the ship once docked at a station. The captain never leaves.',
          'Running out of credits during a long flight means potentially losing your entire crew at the next port.',
        ],
      },
    ],
    relatedArticles: [
      'credits-economy',
      'crew-roles',
      'crew-hiring',
      'contracts',
    ],
  },

  {
    id: 'crew-profiles',
    title: 'Crew Profiles',
    category: 'Crew',
    summary:
      'Service records, ranked titles, and biographical information for each crew member.',
    sections: [
      {
        paragraphs: [
          'Each crew member has a service record that tracks their history with the company. Open the Crew tab and select a crew member to view their profile.',
        ],
      },
      {
        heading: 'Ranked Title',
        paragraphs: [
          'A crew member\'s title combines their [[skill-system|skill rank]] with their [[crew-roles|role]]. For example, a pilot with Competent-level piloting is titled "Competent Pilot". Titles update automatically as skills improve through [[job-slots|job training]].',
          'The captain is always shown as "Owner-Operator" regardless of skill level.',
        ],
      },
      {
        heading: 'Service Record',
        paragraphs: [
          "The service record shows the crew member's current [[job-slots|job assignment]], how long they have been aboard their current ship, and their total time with the company.",
          'When crew are [[crew-hiring|hired]], the recruitment location is recorded. Transferring crew between ships updates their ship tenure while preserving their company tenure.',
        ],
      },
    ],
    relatedArticles: ['crew-roles', 'crew-hiring', 'skill-system', 'job-slots'],
  },

  {
    id: 'job-slots',
    title: 'Rooms & Job Slots',
    category: 'Crew',
    summary:
      'How rooms generate job slots and how crew assignment drives skill training.',
    sections: [
      {
        paragraphs: [
          'Ships have rooms (bridge, engine room, mining bay, etc.) that generate specific job slots. Crew are assigned to job slots, not to rooms directly.',
        ],
      },
      {
        heading: 'How It Works',
        paragraphs: [
          'The bridge generates Helm and Comms slots. The engine room generates Drive Ops. The mining bay generates Mining Ops. [[ship-equipment|Ship equipment]] can generate additional slots (e.g. nav scanner creates Scan Ops, point defense creates Targeting).',
          'Helm is the only required job — without a helm crew member, the ship cannot undock or accept [[contracts|contracts]]. Assign crew to the helm before departing.',
        ],
      },
      {
        heading: 'Skill Training',
        paragraphs: [
          'Each job slot trains specific [[skill-system|skills]]. Assigning crew to jobs that match their [[crew-roles|role]] skill gives a 1.5x training speed bonus.',
          'Passive slots (Patient, Rest) benefit crew without training skills, allowing health recovery and rest.',
        ],
      },
      {
        heading: 'Auto-Assign',
        paragraphs: [
          'The auto-assign feature places crew in their best-fit slots based on skill affinity, saving you from manual assignment.',
        ],
      },
      {
        heading: 'Repair Slots',
        paragraphs: [
          'Ship-wide repair slots accept multiple crew members who generate repair points to fix degraded [[ship-equipment|equipment]]. Repair works in all ship states — docked, in flight, or orbiting. This is critical on fusion-class [[ship-classes|ships]] where equipment degrades continuously.',
        ],
      },
    ],
    relatedArticles: [
      'skill-system',
      'crew-roles',
      'ship-equipment',
      'ship-classes',
      'mining-system',
    ],
  },

  {
    id: 'leveling',
    title: 'Leveling & XP',
    category: 'Crew',
    summary: 'How crew gain experience, level up, and what levels unlock.',
    sections: [
      {
        paragraphs: [
          'Crew members earn XP from completing [[contracts|contracts]], surviving [[encounters|encounters]], and flight time. XP accumulates toward the next level (max level 20).',
          'When enough XP is earned, a level-up notification appears. Leveling up improves overall crew effectiveness.',
        ],
      },
      {
        heading: 'XP Sources',
        paragraphs: [
          '[[contracts|Contract]] completion grants XP to all crew. [[encounters|Encounters]] grant XP based on outcome: victories grant more than evasions.',
          'Event-based [[skill-system|skill]] gains (from encounters) bypass diminishing returns and provide flat skill amounts, making combat encounters valuable for training.',
        ],
      },
    ],
    relatedArticles: ['skill-system', 'encounters', 'contracts'],
  },

  {
    id: 'captain-command',
    title: "Captain's Command Bonus",
    category: 'Crew',
    summary:
      "The captain's skills provide ship-wide multipliers to income, mining yield, and encounter evasion.",
    sections: [
      {
        paragraphs: [
          'The captain is the player character — the owner-operator of the fleet. When aboard a ship, the captain provides a Command Bonus: a set of multiplicative modifiers derived from their [[skill-system|skills]].',
          'The Command Bonus creates a natural incentive to place the captain on the most productive ship. A +50% income bonus on a high-earning ship is worth far more than the same bonus on a small one.',
        ],
      },
      {
        heading: 'Bonus Formulas',
        paragraphs: [
          "Each of the captain's skills contributes a different bonus to the ship they command:",
        ],
        table: {
          headers: ['Skill', 'Formula', 'Example (Skill 50)'],
          rows: [
            [
              '[[commerce-skill|Commerce]]',
              'skill / 100',
              '+50% income on [[contracts|contracts]], trade routes, ore sales',
            ],
            [
              'Piloting',
              'skill / 200',
              '+25% [[encounters|encounter]] evasion chance',
            ],
            [
              '[[mining-system|Mining]]',
              'skill / 100',
              '+50% ore extraction rate',
            ],
          ],
        },
      },
      {
        heading: 'Acting Captain',
        paragraphs: [
          'Ships without the captain use an acting captain — the crew member with the highest [[commerce-skill|Commerce]] skill. The acting captain provides only 25% of the equivalent commerce bonus. Piloting and mining command bonuses are exclusive to the real captain.',
          "The fleet panel shows each ship's command status: a gold badge with the captain's bonus, or a gray badge for the acting captain's reduced bonus.",
        ],
      },
      {
        heading: 'Captain-Only Abilities',
        paragraphs: [
          "Only the captain's ship can attempt to negotiate with pirates during [[encounters|encounters]]. Ships without the captain must evade, fight, or flee — they cannot negotiate safe passage. This makes the captain's ship safer in dangerous space.",
          "The captain's leadership also provides a Rally Bonus of +5 to the ship's defense score in combat, strengthening the crew's ability to repel boarders.",
        ],
      },
      {
        heading: 'Fleet Coordination Aura',
        paragraphs: [
          'The captain projects a coordination aura that boosts nearby ships in the fleet. Ships at the same location as the captain receive +10% to income and training speed. Ships one hop away on the nav chart receive +5%.',
          "The aura only affects ships that are docked or orbiting — ships in flight are between locations and outside the aura's range. The captain's own ship does not receive the aura bonus (it already has the stronger direct command bonuses).",
          'This creates a fleet positioning incentive: clustering ships near the captain makes the entire fleet more productive.',
        ],
      },
      {
        heading: 'Training Speed Aura',
        paragraphs: [
          "All crew aboard the captain's ship train at 1.5× speed. This makes the captain's ship the natural training ground — recruit new crew, train them on the flagship, then deploy them to fleet ships.",
          "Ships near the captain also benefit from the fleet coordination aura's training bonus (+10% at same location, +5% one hop away).",
        ],
      },
      {
        heading: 'Strategy',
        paragraphs: [
          "Place the captain on the ship running the most profitable or dangerous routes. The captain's presence makes that ship more productive, safer, and a faster training ground.",
          'Consider stationing your fleet near the captain to maximize the coordination aura. The +10% income and training bonus on nearby ships compounds significantly over time.',
          "As the captain levels up, their command bonuses grow — rewarding investment in the captain's skills across all three disciplines.",
        ],
      },
    ],
    relatedArticles: [
      'commerce-skill',
      'skill-system',
      'credits-economy',
      'encounters',
      'mining-system',
      'contracts',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // SHIP SYSTEMS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'ship-classes',
    title: 'Ship Classes',
    category: 'Ship Systems',
    summary:
      'Ship classification by operational range, from orbital tenders to fusion torch ships.',
    sections: [
      {
        paragraphs: [
          'Ships are classified by operational range and capability. Higher classes are more powerful but more expensive and complex to operate.',
          'Each ship class has a dedicated fuel tank sized for its intended operational range. Fuel capacity is independent of cargo capacity — bigger fuel tanks support longer journeys without sacrificing cargo space.',
        ],
      },
      {
        heading: 'Class I: Orbital Maintenance Vessels',
        paragraphs: [
          'Range: 0-2,000 km (LEO operations). Typical missions include station resupply and orbital repairs.',
          "Simple chemical propulsion. Limited delta-v budget. Cannot escape Earth's gravity well without assistance. Travel time: minutes to hours.",
        ],
      },
      {
        heading: 'Class II: Inner System Vessels',
        paragraphs: [
          'Range: Earth-Moon, Earth-Mars, Asteroid Belt. Uses nuclear fission thermal rockets.',
          'Can achieve escape velocity. Effective range ~3 AU. Travel time: days to weeks. Requires [[orbital-mechanics|orbital mechanics]] planning and [[launch-windows|launch window]] awareness.',
        ],
      },
      {
        heading: 'Class III: Interplanetary Vessels',
        paragraphs: [
          'Range: Inner to outer solar system. [[engines|Fusion drives]] providing sustained high acceleration.',
          'Entire solar system accessible in weeks to months. Expensive fuel costs. Requires managing [[radiation|radiation]], [[waste-heat|waste heat]], and reactor containment.',
          'These are "torch ships" — powerful but demanding. Neglect kills on a torch ship.',
        ],
      },
      {
        heading: 'Mining Specialization',
        paragraphs: [
          'The Dreadnought and Leviathan are built for industrial-scale resource extraction. Each carries two mining bays providing 4 mining_ops [[job-slots|job slots]] — double the capacity of a standard [[ship-classes|Wayfarer]] or [[ship-classes|Firebrand]]. Combined with their massive cargo holds, these ships dominate long-duration [[mining-system|mining]] operations.',
        ],
      },
      {
        heading: 'Resource Costs',
        paragraphs: [
          'Higher-tier ships require mined [[ore-types|ore]] in addition to [[credits-economy|credits]] to purchase. This ore is consumed from your fleet-wide cargo on purchase, creating a sell-vs-stockpile decision for miners.',
          'The Dreadnought requires 200 [[ore-types|Titanium]] and 50 [[ore-types|Platinum]]. The Firebrand requires 300 Titanium and 100 Platinum. The Leviathan requires 500 Titanium, 200 Platinum, and 50 [[ore-types|Helium-3]] — you must mine He-3 at [[mining-destinations|Tycho Colony]] (0.1x yield) or [[mining-destinations|Jupiter Station]] before purchasing one.',
        ],
      },
      {
        heading: 'Ship Class Access',
        paragraphs: [
          'Higher-class ships require higher [[skill-system|piloting]] skill from the helm crew member. Class II requires Piloting 25 (Competent), Class III requires Piloting 50 (Able).',
          'Ships are also unlocked by lifetime [[credits-economy|credits]] earned — progress bars on each ship card in the Fleet tab and in Settings show how close you are to unlocking the next tier.',
        ],
      },
    ],
    relatedArticles: [
      'engines',
      'flight-physics',
      'orbital-mechanics',
      'launch-windows',
      'skill-system',
      'ship-equipment',
      'mining-system',
      'ore-types',
    ],
  },

  {
    id: 'engines',
    title: 'Engines',
    category: 'Ship Systems',
    summary: 'Engine types, warmup mechanics, thrust, and fuel consumption.',
    sections: [
      {
        paragraphs: [
          'Every ship has an engine that provides thrust for travel. Engine type determines acceleration, fuel efficiency, and operational complexity.',
        ],
      },
      {
        heading: 'Engine Types',
        paragraphs: [''],
        table: {
          headers: ['Type', 'Class', 'Characteristics'],
          rows: [
            [
              'Chemical',
              'I',
              'Simple, proven. Minutes of burn. Very limited delta-v.',
            ],
            [
              'Nuclear Fission',
              'I-II',
              'Higher Isp. Days-weeks of thrust. Radiation concerns.',
            ],
            [
              'Fusion (D-D/D-He3)',
              'II-III',
              'High sustained acceleration. Weeks-months. Complex containment.',
            ],
            [
              'Advanced Fusion',
              'III-IV',
              'Extreme thrust. Solar system in days. Severe radiation/heat.',
            ],
          ],
        },
      },
      {
        heading: 'Engine Warmup',
        paragraphs: [
          'Engines require warmup time before providing thrust. Chemical engines warm up quickly; fusion engines take longer.',
          'The engine room must be staffed (or the bridge manned) to start and maintain engines. An unstaffed engine room on a fusion ship is dangerous.',
        ],
      },
      {
        heading: 'Fuel Consumption',
        paragraphs: [
          'Fuel is consumed only during burn phases (acceleration and deceleration). During the coast phase, no fuel is used.',
          'The [[flight-physics|flight profile]] slider controls how much of the delta-v budget is used for burns vs. coasting — economy profiles use less fuel but take longer.',
        ],
      },
      {
        heading: 'Fuel Cost Tiers',
        paragraphs: [
          'Fuel price per kilogram depends on engine type. More powerful engines require increasingly expensive propellant — this is a major operating cost factor for higher-tier [[ship-classes|ships]].',
        ],
        table: {
          headers: ['Engine Type', 'Cost Multiplier', 'Ships'],
          rows: [
            ['Chemical Bipropellant', '1x', '[[ship-classes|Station Keeper]]'],
            [
              'Nuclear Fission',
              '3x',
              '[[ship-classes|Wayfarer]], [[ship-classes|Dreadnought]]',
            ],
            ['Fusion (D-D)', '10x', '[[ship-classes|Firebrand]]'],
            ['Fusion (D-He3)', '30x', '[[ship-classes|Leviathan]]'],
          ],
        },
      },
    ],
    relatedArticles: [
      'flight-physics',
      'ship-classes',
      'life-support',
      'radiation',
      'credits-economy',
    ],
  },

  {
    id: 'flight-physics',
    title: 'Flight Physics',
    category: 'Ship Systems',
    summary: 'Burn-coast-burn trajectories, flight profiles, and travel time.',
    sections: [
      {
        paragraphs: [
          'Ships travel using burn-coast-burn trajectories. The ship accelerates toward its destination (burn), coasts at cruising speed (coast), then decelerates to arrive (burn).',
        ],
      },
      {
        heading: 'Flight Phases',
        paragraphs: [
          'Accelerating: [[engines|Engines]] firing, fuel being consumed, crew experience thrust gravity.',
          'Coasting: No fuel consumed, [[zero-g-exposure|zero-g]] conditions, ship at cruising velocity.',
          'Decelerating: Engines firing again to slow down for arrival.',
        ],
      },
      {
        heading: 'Flight Profile Slider',
        paragraphs: [
          'Each ship has a flight profile slider (Economy to Max Speed) that controls the burn fraction of the delta-v budget.',
          'Economy: More coasting, less fuel, longer trip, more [[zero-g-exposure|zero-g exposure]].',
          'Max Speed: Maximum burns, more fuel, shorter trip, less zero-g but more fuel cost.',
          'The slider is available on the Work tab and the [[navigation|Navigation Chart]], including during active flight. Adjusting it recalculates the current trajectory immediately — the ship replans its burn-coast-burn profile from its present position.',
        ],
      },
      {
        heading: 'G-Force',
        paragraphs: [
          'During burns, crew experience g-force proportional to [[engines|engine]] thrust. This provides partial protection from [[zero-g-exposure|zero-g exposure]].',
          'Real-time g-force is displayed on the Ship tab during flight.',
        ],
      },
      {
        heading: 'Intercept Trajectories',
        paragraphs: [
          'Because all destinations follow [[orbital-mechanics|orbital paths]], ships do not fly toward where a target currently is — they aim at where it will be when they arrive. The flight computer iteratively solves for the intercept point, recalculating until the predicted arrival position converges.',
          "On long flights, the destination continues to move along its orbit. The flight computer periodically recalculates the intercept point to correct for orbital drift, silently adjusting the ship's trajectory. This keeps the ship on course for months-long journeys to Mars or Jupiter where the target may have shifted significantly from the initial prediction.",
          'This means travel distance and fuel cost depend on the relative motion of origin and destination. A trip to Mars during a close approach is far shorter and cheaper than the same trip when Mars is on the opposite side of the Sun. Check the [[launch-windows|launch window]] indicator on the Nav tab before committing to long-haul routes.',
        ],
      },
    ],
    relatedArticles: [
      'engines',
      'zero-g-exposure',
      'contracts',
      'time-system',
      'orbital-mechanics',
      'launch-windows',
      'gravity-assists',
    ],
  },

  {
    id: 'life-support',
    title: 'Life Support & Oxygen',
    category: 'Ship Systems',
    summary:
      'Oxygen generation, consumption, atmosphere capacity, and failure consequences.',
    sections: [
      {
        paragraphs: [
          'Oxygen is tracked as an emergent resource: generated by [[ship-equipment|equipment]], consumed by crew. Managing the balance is critical for survival.',
        ],
      },
      {
        heading: 'Generation & Consumption',
        paragraphs: [
          'Life Support Systems generate 12 O2 per day. Air Filtration Units generate 6 O2 per day but degrade with wear.',
          'Each crew member consumes 1 O2 per day. The balance must remain positive to sustain the crew.',
        ],
      },
      {
        heading: 'Atmosphere Capacity',
        paragraphs: [
          'Ship atmosphere capacity is derived from ship mass — larger ships have more air buffer when life support fails.',
          'Power loss stops oxygen generation. Crew then deplete remaining atmosphere.',
        ],
      },
      {
        heading: 'Low Oxygen Effects',
        paragraphs: [
          'Below 50%: Mild health damage.',
          'Below 25%: Severe health damage.',
          'Below 10%: Critical health damage.',
          'Air filter degradation creates emergent tension on large ships: as filters wear, the O2 balance can tip negative. Prolonged oxygen deprivation causes [[crew-death|crew death]].',
          'Station docking resupplies atmosphere to full.',
        ],
      },
      {
        heading: 'Provisions',
        paragraphs: [
          'Alongside oxygen, crew require [[provisions|food and water]] to survive. Base provision consumption is 15 kg per crew member per day, but [[life-support|life support]] equipment recycles a portion — with standard life support, effective consumption drops to ~5 kg per crew per day. Crew eat station-side at trade stations, so provisions are only consumed during flight, orbiting, and while docked at remote locations without trade services. Provisions auto-resupply when docked at trade stations. While oxygen failure is an equipment problem, [[provisions|provision]] depletion is an economic one — running out of [[credits-economy|credits]] means no resupply.',
        ],
      },
    ],
    relatedArticles: [
      'ship-equipment',
      'job-slots',
      'ship-classes',
      'engines',
      'provisions',
      'crew-death',
    ],
  },

  {
    id: 'ship-equipment',
    title: 'Ship Equipment',
    category: 'Ship Systems',
    summary: 'Equipment categories, slot types, degradation, and repair.',
    sections: [
      {
        paragraphs: [
          'Ships carry equipment in slots that provide various capabilities. Equipment degrades during operation and must be maintained by crew assigned to repair duties.',
        ],
      },
      {
        heading: 'Equipment Categories',
        paragraphs: [''],
        table: {
          headers: ['Category', 'Purpose', 'Examples'],
          rows: [
            [
              '[[life-support|Life Support]]',
              'Atmosphere and air quality',
              'Life Support System, Air Filtration Unit',
            ],
            [
              'Shielding',
              '[[radiation|Radiation]] protection',
              'Radiation Shielding Panel',
            ],
            [
              'Thermal',
              '[[waste-heat|Heat]] dissipation',
              'Radiator Array, Active Coolant System',
            ],
            [
              'Defense',
              '[[encounters|Combat]] and debris protection',
              'PD-10 Laser, PD-40 Flak Turret, Deflectors',
            ],
            [
              'Navigation',
              'Hazard detection',
              'Nav Scanner, Deep Space Scanner',
            ],
            [
              'Structural',
              'Heavy installations',
              'Reactor Containment, Centrifuge Pod',
            ],
            [
              'Gravity',
              '[[zero-g-exposure|Zero-g]] countermeasures',
              'Exercise Module, Centrifuge Pod',
            ],
            [
              '[[mining-system|Mining]]',
              'Ore extraction from asteroids',
              'Mining Laser Array, Industrial Rig, Deep Core System, Quantum Array',
            ],
          ],
        },
      },
      {
        heading: 'Slot Types',
        paragraphs: [
          'Standard slots accept most equipment. Structural slots accept both standard equipment and large structural items like centrifuges.',
          'Higher-class [[ship-classes|ships]] have more equipment slots and more structural slots, but they also NEED more equipment ([[radiation|shielding]], [[waste-heat|thermal]], containment) just to operate safely — an "equipment tax."',
        ],
      },
      {
        heading: 'Degradation & Repair',
        paragraphs: [
          'Equipment degrades during use. Air filtration units wear down constantly, excess [[waste-heat|waste heat]] during flight damages all degradable equipment, and [[mining-system|mining]] equipment wears from active extraction.',
          'As equipment degrades, its effectiveness decreases. At maximum wear, most equipment operates at 50% capacity. Air filtration units are the exception — they lose all output at full degradation, making them the highest maintenance priority.',
          'Crew assigned to repair [[job-slots|job slots]] generate repair points that restore equipment condition. Repair works whether your ship is docked, in flight, or orbiting — assign crew to repair duty to keep equipment in working order.',
        ],
      },
    ],
    relatedArticles: [
      'job-slots',
      'zero-g-exposure',
      'life-support',
      'radiation',
      'mining-system',
    ],
  },

  {
    id: 'crew-equipment',
    title: 'Crew Equipment',
    category: 'Ship Systems',
    summary:
      'Personal equipment for crew: weapons, tools, armor, and accessories.',
    sections: [
      {
        paragraphs: [
          'Crew members can equip personal items that affect their performance in various situations. Equipment is bought at stations with trade services and stored in ship cargo.',
        ],
      },
      {
        heading: 'Equipment Types',
        paragraphs: [''],
        table: {
          headers: ['Category', 'Items', 'Effect'],
          rows: [
            [
              'Weapons',
              'Sidearm (800 cr), Assault Rifle (3,500 cr)',
              'Improves [[encounters|combat]] attack score',
            ],
            [
              'Tools',
              'Toolkit (1,200 cr), Medkit (1,500 cr), Scanner (2,000 cr)',
              'Improves [[crew-roles|role]] effectiveness',
            ],
            [
              'Accessories',
              'Rebreather (600 cr), Wrist Terminal (450 cr)',
              'Various utility bonuses',
            ],
            [
              'Armor',
              'Ballistic Vest (2,200 cr)',
              'Improves defense in [[encounters|combat]]',
            ],
            [
              'Gravity',
              'G-Seat Harness (3,500 cr)',
              '30% reduction in [[zero-g-exposure|zero-g exposure]]',
            ],
          ],
        },
      },
      {
        heading: 'Buying & Selling',
        paragraphs: [
          'Equipment is purchased at full retail price from stations with trade services. Selling returns 50% of retail value.',
          'Items bought go to the ship cargo hold. From there, they can be equipped to specific crew members.',
        ],
      },
    ],
    relatedArticles: [
      'credits-economy',
      'encounters',
      'zero-g-exposure',
      'ship-equipment',
      'mining-system',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // SPACE
  // ═══════════════════════════════════════════════════════════
  {
    id: 'navigation',
    title: 'Navigation',
    category: 'Space',
    summary: 'The world map, locations, distances, and route planning.',
    sections: [
      {
        paragraphs: [
          "The navigation chart shows all known locations, their distances from your ship's current position, and available services. Access it via the Nav tab. The chart includes an orrery map that visualizes the 2D [[orbital-mechanics|orbital positions]] of all bodies in real time. Click any dot on the orrery to select it — the matching location card expands below with full details, travel estimates, and action buttons.",
          'Locations provide different services: refueling, hiring, trade, [[mining-system|mining]], and repair. Planning your route to hit needed services is key to efficient operations.',
          'Because all bodies follow [[orbital-mechanics|orbital paths]], distances between locations change continuously. The Nav tab updates distances every tick, reflecting the current orbital configuration. A destination that is nearby today may be far away in a few months — check [[launch-windows|launch window]] alignment before committing to long voyages.',
        ],
      },
      {
        heading: 'Locations',
        paragraphs: [
          'The game world includes 13 locations spanning from low Earth orbit to Jupiter, placed at realistic solar system distances. Locations include Earth, Gateway Station, Meridian Depot, Forge Station, Graveyard Drift, Tycho Colony, Freeport Station, The Scatter, Mars, Vesta Station, The Crucible, Ceres Station, and Jupiter Station.',
          'Each location has different services, different quest availability, and different threat levels for routes passing nearby. Mining value increases with distance from Earth — cislunar locations offer basic ores, the Belt introduces premium ores like Platinum, and Jupiter provides endgame resources. See [[mining-destinations|Mining Destinations]] for details on mining locations.',
        ],
      },
      {
        heading: 'Route Planning',
        paragraphs: [
          'Before departure, your [[crew-roles|pilot]] plots a course. Navigation quality depends on [[skill-system|piloting]] skill and [[ship-equipment|equipment]].',
          'Good navigation reduces debris [[encounters|encounters]], improves fuel efficiency, and gives better hazard warnings.',
          'Locations shown as unreachable are beyond your current fuel range at the selected [[flight-physics|flight profile]].',
          'Use the [[flight-physics|flight profile]] slider on the Nav tab to choose between economy (less fuel, longer trip) and max speed (more fuel, shorter trip) before departing. Travel time and fuel estimates update as you adjust.',
        ],
      },
      {
        heading: 'Mid-Flight Redirect',
        paragraphs: [
          'You can change your destination while in flight. Open the Nav tab during a manual flight to see distances calculated from your current position in space — these update live as you move.',
          'Select any reachable location and click "Redirect" in its expanded details to plot a new course. Your ship will begin a fresh burn-coast-burn trajectory from wherever it is.',
          'Mid-flight redirects are not available during [[contracts|contract]] flights or active mining routes.',
          'All [[encounters|threat levels]] and fuel estimates are recalculated based on your actual position, so redirecting into deep space may increase [[encounters|encounter]] risk.',
        ],
      },
    ],
    relatedArticles: [
      'flight-physics',
      'orbital-mechanics',
      'launch-windows',
      'gravity-assists',
      'encounters',
      'factions',
      'contracts',
      'mining-destinations',
    ],
  },

  {
    id: 'encounters',
    title: 'Encounters & Combat',
    category: 'Space',
    summary:
      'Pirate encounters, combat resolution, threat levels, and defense.',
    sections: [
      {
        paragraphs: [
          'During flight, your ship may encounter pirates. Encounter probability depends on your position, [[engines|engine]] heat signature, and crew [[skill-system|skills]].',
          "The captain's [[captain-command|Command Bonus]] provides an additional evasion chance based on their [[skill-system|piloting]] skill when aboard.",
        ],
      },
      {
        heading: 'Combat Pipeline',
        paragraphs: [
          'Encounters are auto-resolved through a pipeline: Evade ([[crew-roles|pilot]] [[skill-system|piloting]]) > Negotiate (captain only) > Flee (if outmatched) > Combat > Outcome.',
          'Possible outcomes: Evasion (clean escape), Negotiation (pay ransom), Fled (emergency escape with minor damage), Victory (bounty reward), Harassment (minor damage), Boarding (major losses). Severe combat damage can cause [[crew-death|crew death]].',
          '**Negotiation requires the captain.** Only the captain has the authority to broker deals with pirates. Ships without the captain skip the negotiation step entirely and must fight, evade, or flee.',
        ],
      },
      {
        heading: 'Defense Score',
        paragraphs: [
          "Your defense score comes from: point defense [[ship-equipment|equipment]] (PD lasers, flak turrets), deflector shields, [[crew-equipment|crew weapons]] (armory strength), ship mass, and the [[captain-command|captain's rally bonus]] (+5 when aboard).",
          'Equipping your ship with defense [[ship-equipment|equipment]] and arming your crew improves combat outcomes.',
        ],
      },
      {
        heading: 'Threat Levels',
        paragraphs: [
          'Routes have threat levels based on distance from [[factions|Terran Alliance]] space and proximity to lawless zones.',
        ],
        table: {
          headers: ['Level', 'Meaning'],
          rows: [
            ['CLEAR', 'Safe space, minimal encounter risk'],
            ['CAUTION', 'Moderate risk, encounters possible'],
            ['DANGER', 'High risk, encounters likely'],
            ['CRITICAL', 'Extremely dangerous, encounters frequent and severe'],
          ],
        },
      },
      {
        heading: 'Combat Variance',
        paragraphs: [
          'Pirate attack strength varies by +-30% and defense effectiveness by +-15%, ensuring borderline fights are unpredictable. Even well-defended ships can have bad luck.',
        ],
      },
    ],
    relatedArticles: [
      'navigation',
      'crew-equipment',
      'ship-equipment',
      'skill-system',
      'captain-command',
      'crew-death',
    ],
  },

  {
    id: 'factions',
    title: 'Factions',
    category: 'Space',
    summary: 'The three major factions and their influence on the game world.',
    sections: [
      {
        paragraphs: [
          'Three major factions shape the game world. Their influence determines [[contracts|quest]] availability, regional security, and trading opportunities.',
        ],
      },
      {
        heading: 'Terran Alliance',
        paragraphs: [
          'The dominant political entity controlling Earth and nearby stations. Space near Terran Alliance territory is the safest, with the lowest [[encounters|encounter]] rates.',
          'Provides structured [[contracts|contracts]] and reliable services at its stations.',
        ],
      },
      {
        heading: 'Free Traders Guild',
        paragraphs: [
          'An independent collective of merchants and ship captains. Operates in the spaces between faction territories.',
          'Offers lucrative trade routes but with higher risk due to less security coverage.',
        ],
      },
      {
        heading: 'Kreth Collective',
        paragraphs: [
          'A loosely organized group operating in the outer reaches. Territory near the Kreth Collective tends to be the most dangerous.',
          'Offers unique [[contracts|contracts]] and goods not available from other factions.',
        ],
      },
    ],
    relatedArticles: ['navigation', 'encounters', 'contracts'],
  },

  {
    id: 'mining-destinations',
    title: 'Mining Destinations',
    category: 'Space',
    summary:
      'Mining locations from cislunar space to Jupiter, with progressively valuable ores.',
    sections: [
      {
        paragraphs: [
          'Eight locations across the solar system offer [[mining-system|mining]] services. Mining value increases with distance from Earth — cislunar locations yield basic ores and [[ore-types|Titanium]], The Scatter provides the closest source of [[ore-types|Platinum]], and Jupiter provides endgame resources like [[ore-types|Helium-3]] and [[ore-types|Exotic Matter]]. Ore distributions reflect real planetary science.',
        ],
      },
      {
        heading: 'Mining Locations',
        paragraphs: [
          'Mining requires a ship with a mining bay ([[ship-classes|Class II]] Wayfarer or better). As your [[skill-system|piloting]] skill and ship class improve, more distant and lucrative sites become reachable.',
        ],
        table: {
          headers: ['Location', 'Distance', 'Piloting', 'Available Ores'],
          rows: [
            [
              'Graveyard Drift',
              '384K km',
              '15',
              '[[ore-types|Iron]], [[ore-types|Silicate]], [[ore-types|Copper]]',
            ],
            [
              'Tycho Colony',
              '384K km',
              '30',
              '[[ore-types|Titanium]], [[ore-types|Rare Earth]], [[ore-types|Water Ice]], [[ore-types|He-3]] (0.1x)',
            ],
            [
              'The Scatter',
              '1.8M km',
              '45',
              '[[ore-types|Iron]], [[ore-types|Titanium]], [[ore-types|Platinum]]',
            ],
            [
              'Mars',
              '55M km',
              '55',
              '[[ore-types|Iron]], [[ore-types|Rare Earth]], [[ore-types|Water Ice]]',
            ],
            [
              'Vesta Station',
              '110M km',
              '60',
              '[[ore-types|Iron]], [[ore-types|Titanium]], [[ore-types|Water Ice]]',
            ],
            [
              'The Crucible',
              '155M km',
              '68',
              '[[ore-types|Iron]], [[ore-types|Platinum]], [[ore-types|Rare Earth]]',
            ],
            [
              'Ceres Station',
              '265M km',
              '75',
              '[[ore-types|Water Ice]], [[ore-types|Iron]], [[ore-types|Platinum]], [[ore-types|Rare Earth]]',
            ],
            [
              'Jupiter Station',
              '588M km',
              '85',
              '[[ore-types|Helium-3]], [[ore-types|Exotic Matter]]',
            ],
          ],
        },
      },
      {
        heading: 'Yield Multipliers',
        paragraphs: [
          'Some locations have reduced yield for specific ores. Tycho Colony has [[ore-types|Helium-3]] at 0.1x yield — lunar regolith contains only trace amounts compared to industrial-scale atmospheric scooping at Jupiter (1.0x). The auto-select system accounts for effective value (base × multiplier), so dilute ores are not auto-selected over more profitable alternatives.',
        ],
      },
    ],
    relatedArticles: [
      'navigation',
      'mining-system',
      'ore-types',
      'ship-classes',
      'orbital-mechanics',
      'launch-windows',
    ],
  },

  {
    id: 'orbital-mechanics',
    title: 'Orbital Mechanics',
    category: 'Space',
    summary:
      'How celestial bodies move in 2D orbits (circular and elliptical), dynamic distances, and hierarchical orbit systems.',
    sections: [
      {
        paragraphs: [
          'Every location in the solar system follows an orbital path. Most near-Earth locations use circular orbits, while outer bodies (Mars, Jupiter, belt stations) follow elliptical orbits with realistic eccentricities. Planets and distant stations orbit the Sun, while near-Earth locations (Gateway Station, Meridian Depot, etc.) orbit Earth. These [[navigation|positions]] update every tick, so distances between locations change continuously as bodies move along their orbital paths.',
          "The game uses a 2D Keplerian orbital model with the Sun at the coordinate origin (0, 0). Each body has a semi-major axis (average distance from its parent), an orbital period, an eccentricity (how elongated the ellipse is), and a starting angle. For elliptical orbits, the body moves faster near perihelion (closest approach) and slower near aphelion (farthest point), following Kepler's laws. The current position is calculated from these parameters and the elapsed game time.",
        ],
      },
      {
        heading: 'Sun-Centric Orbits',
        paragraphs: [
          'Mars, the asteroid belt stations (Vesta, The Crucible, Ceres), and Jupiter Station all orbit the Sun directly on elliptical paths. Mars has the highest eccentricity (0.09), meaning its distance from the Sun varies by about 19% between perihelion and aphelion. Belt stations have moderate eccentricities (0.05–0.08), while Jupiter is nearly circular (0.05). Their orbital periods range from months to years of game time, matching realistic proportions. Mars completes an orbit in roughly 687 game days, while Jupiter takes nearly 12 game years.',
          'Because these bodies orbit at vastly different speeds and radii, the distance between any two of them changes dramatically over time. Earth-to-Mars distance can vary from roughly 55 million km at closest approach to over 400 million km at opposition. This variation directly affects travel time, fuel cost, and [[contracts|contract]] feasibility.',
        ],
      },
      {
        heading: 'Earth-Centric Orbits',
        paragraphs: [
          "Near-Earth locations — Gateway Station, Meridian Depot, Forge Station, Graveyard Drift, Tycho Colony, Freeport Station, and The Scatter — orbit Earth rather than the Sun. Their positions are computed hierarchically: first Earth's position relative to the Sun is calculated, then the local orbital offset is added.",
          'Earth-orbiting locations have much shorter orbital periods (hours to days) and smaller radii (hundreds to thousands of km). Distances between Earth satellites and each other change quickly but within a small range, so [[launch-windows|launch window]] timing matters less for these short hops.',
        ],
      },
      {
        heading: 'Dynamic Distances',
        paragraphs: [
          'The distanceFromEarth value for every location is recomputed each tick based on current orbital positions. This means the [[navigation|Nav tab]] distance readouts are always live — they reflect where bodies actually are right now, not static reference distances.',
          'For route planning, this has major implications. A trip to Mars during a close approach might take days and consume modest fuel. The same trip at opposition could take weeks and require far more fuel — or be out of range entirely for smaller [[ship-classes|ships]]. Always check current distances and [[launch-windows|alignment quality]] before launching on long-haul routes.',
        ],
      },
      {
        heading: 'The Orrery Map',
        paragraphs: [
          'The [[navigation|Nav tab]] includes an orrery — a 2D map showing all orbital paths and current body positions. The orrery provides a visual overview of the solar system layout, letting you see at a glance which destinations are currently close together and which are far apart. Hover over any dot to see a tooltip with the location name and distance; click to select it and expand its details in the legend below.',
          'Use the orrery to build spatial intuition about orbital timing. When two destinations are on the same side of their parent body, travel between them is short. When they are on opposite sides, the trip is much longer. Your current location pulses red, and your flight destination glows blue.',
        ],
      },
    ],
    relatedArticles: [
      'navigation',
      'launch-windows',
      'flight-physics',
      'ship-classes',
      'time-system',
      'gravity-assists',
    ],
  },

  {
    id: 'gravity-assists',
    title: 'Gravity Assist Corridors',
    category: 'Space',
    summary:
      'Free delta-v from passing near massive bodies during transit — save fuel or risk a correction burn.',
    sections: [
      {
        paragraphs: [
          "When a ship's trajectory passes close to a massive body during flight, the crew can attempt a gravity assist maneuver to gain free delta-v, saving fuel. This is detected automatically at departure based on the planned [[flight-physics|trajectory]] and the current [[orbital-mechanics|orbital positions]] of massive bodies.",
          'Gravity assists add a strategic layer to route planning. Checking the [[navigation|Nav tab]] before departure shows which routes currently have assist opportunities, letting you time departures for maximum fuel savings.',
        ],
      },
      {
        heading: 'Detection',
        paragraphs: [
          "At departure, the flight computer samples the planned trajectory and checks proximity to massive bodies. Each body has a sphere of influence proportional to its mass — Jupiter's gravity well extends far further than the Moon's.",
          "If the trajectory passes within a body's influence zone, a gravity assist opportunity is flagged. The Nav tab shows available assists per destination before departure, and the flight status panel tracks them during transit.",
        ],
      },
      {
        heading: 'Skill Check',
        paragraphs: [
          'When the ship reaches the closest approach point, the crew attempts to execute the maneuver. Success depends on [[skill-system|piloting]] skill — higher skill means better odds.',
          'A closer approach yields more fuel savings but is harder to execute. Even master pilots cannot guarantee success every time — space is unforgiving.',
        ],
      },
      {
        heading: 'Success: Fuel Refund',
        paragraphs: [
          "On success, the ship receives a fuel refund proportional to the body's mass, the closeness of the approach, and the pilot's skill. Typical fuel savings range from 2-10% of the trip's fuel cost.",
        ],
      },
      {
        heading: 'Failure: Correction Burn',
        paragraphs: [
          "On failure, the ship must execute a correction burn to recover from the botched maneuver, costing ~1-2% of the trip's fuel. Closer approaches incur larger corrections on failure.",
          'This creates a risk/reward tradeoff: a close approach to a massive body offers the best potential savings but carries the steepest penalty for low-skill crews.',
        ],
      },
      {
        heading: 'Eligible Bodies',
        paragraphs: [],
        table: {
          headers: ['Body', 'Influence Zone', 'Potential Savings'],
          rows: [
            ['Jupiter', '~75M km', 'Highest (most massive)'],
            ['Earth', '~3M km', 'High'],
            ['Mars', '~3M km', 'Moderate'],
            ['Moon', '~200K km', 'Low'],
            ['Ceres', '~200K km', 'Minimal'],
          ],
        },
      },
    ],
    relatedArticles: [
      'flight-physics',
      'navigation',
      'orbital-mechanics',
      'launch-windows',
      'skill-system',
    ],
  },

  {
    id: 'launch-windows',
    title: 'Launch Windows',
    category: 'Space',
    summary:
      'Timing departures for optimal alignment — alignment quality, synodic periods, and trip planning.',
    sections: [
      {
        paragraphs: [
          'Because destinations move along [[orbital-mechanics|orbital paths]], the distance between any two locations varies over time. A launch window is the period when two locations are well-aligned — close together — making travel faster, cheaper, and more fuel-efficient.',
          'The [[navigation|Nav tab]] displays alignment quality for each destination, helping you decide whether to depart now or wait for a better window.',
        ],
      },
      {
        heading: 'Alignment Quality',
        paragraphs: [
          'Alignment is classified by where the current distance falls within the historical min-max range for that pair of locations:',
        ],
        table: {
          headers: ['Rating', 'Distance Position', 'Meaning'],
          rows: [
            [
              'Excellent',
              'Within 20% of minimum',
              'Near closest approach — ideal departure time',
            ],
            [
              'Good',
              '20-45% of range',
              'Favorable conditions — efficient travel',
            ],
            [
              'Moderate',
              '45-70% of range',
              'Acceptable but not optimal — expect higher fuel use',
            ],
            [
              'Poor',
              'Above 70% of range',
              'Far from optimal — long trip, high fuel cost, consider waiting',
            ],
          ],
        },
      },
      {
        heading: 'Synodic Periods',
        paragraphs: [
          'The synodic period is the time between successive close approaches of two orbiting bodies. It depends on both orbital periods: bodies with similar periods have long synodic cycles (they rarely lap each other), while bodies with very different periods realign frequently.',
          'For Earth-to-Mars trips, the synodic period is roughly 780 game days (~2.1 game years). This means excellent launch windows to Mars come around approximately every two years. Missing a window means waiting a long time for the next one — or accepting a much longer, more expensive trip.',
          'Earth satellite-to-satellite routes (e.g. Gateway to Meridian) have very short synodic periods because the orbital radii differ greatly at small scales. Alignment changes rapidly, so waiting more than a few game days for a better window is rarely necessary.',
        ],
      },
      {
        heading: 'Planning Strategy',
        paragraphs: [
          'For short inner-system hops between Earth satellites, alignment barely matters — distances vary by thousands of km, not millions. Depart whenever you are ready.',
          'For Mars trips, alignment is critical. At closest approach (~55M km), a [[ship-classes|Class II]] vessel can make the trip in days. At opposition (~400M km), the same ship may not even have enough fuel range. Check alignment before accepting [[contracts|contracts]] headed to Mars or beyond.',
          'For Jupiter, distances are enormous regardless of alignment (588M-967M km), so [[ship-classes|Class III]] vessels are always required. But even for torch ships, an excellent window saves substantial fuel and travel time. Plan Jupiter [[mining-system|mining]] expeditions around favorable windows whenever possible.',
          'The Nav tab shows the estimated time until the next optimal window (in game days and real time). If alignment is poor and the next window is only a few real-time minutes away, it may be worth pausing operations and waiting for a better departure.',
        ],
      },
      {
        heading: 'Intercept Trajectories',
        paragraphs: [
          'When you launch toward a moving target, the [[flight-physics|flight computer]] calculates an intercept trajectory — aiming at where the destination will be when you arrive, not where it is now. This intercept calculation accounts for orbital motion automatically.',
          'This means the actual travel distance may differ from the straight-line distance shown on the Nav tab. For slow ships and fast-orbiting targets, the difference can be significant. The fuel and time estimates on the Nav tab already account for interception, so the numbers you see are accurate for decision-making.',
        ],
      },
    ],
    relatedArticles: [
      'orbital-mechanics',
      'navigation',
      'flight-physics',
      'contracts',
      'ship-classes',
      'time-system',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // HEALTH & ENVIRONMENT
  // ═══════════════════════════════════════════════════════════
  {
    id: 'zero-g-exposure',
    title: 'Zero-G Exposure',
    category: 'Health & Environment',
    summary:
      'Cumulative weightlessness effects, degradation tiers, recovery, and mitigation.',
    sections: [
      {
        paragraphs: [
          'Crew accumulate zero-g exposure during flight when the ship has no gravity source. Effects are cumulative and progressive — exposure builds up across trips and is not reset between voyages.',
        ],
      },
      {
        heading: 'Accumulation',
        paragraphs: [
          'Exposure accumulates every game day while the ship is in flight or orbiting without a gravity source. It is stored per crew member and persists across multiple trips.',
          'The base rate is 1.0 per game second of flight time. Various equipment and conditions reduce this rate.',
        ],
      },
      {
        heading: 'Degradation Tiers',
        paragraphs: [
          'As exposure accumulates, crew suffer progressive [[skill-system|piloting]] reduction that impacts [[encounters|combat]] and flight effectiveness.',
        ],
        table: {
          headers: ['Tier', 'Exposure', 'Piloting Penalty'],
          rows: [
            ['Safe', '< 14 days', 'None'],
            ['Minor Atrophy', '14-60 days', '-7.5%'],
            ['Moderate Atrophy', '60-180 days', '-17.5%'],
            ['Severe Atrophy', '180-365 days', '-35%'],
            ['Critical Atrophy', '> 365 days', '-60%'],
          ],
        },
      },
      {
        heading: 'Mitigation',
        paragraphs: [
          'Several [[ship-equipment|ship equipment]] and [[crew-equipment|crew equipment]] options reduce or eliminate zero-g exposure accumulation. All modifiers stack multiplicatively.',
        ],
        table: {
          headers: ['Equipment', 'Type', 'Effect'],
          rows: [
            [
              'Rotating Habitat',
              'Ship feature (Dreadnought/Leviathan)',
              '100% protection — no accumulation',
            ],
            [
              'Centrifuge Pod',
              'Ship equipment (structural slot)',
              '100% protection — no accumulation',
            ],
            [
              'Exercise Module',
              'Ship equipment',
              '50% reduction in accumulation rate',
            ],
            [
              'G-Seat Harness',
              'Crew equipment (3,500 cr)',
              '30% reduction per crew member equipped',
            ],
            [
              'Thrust Gravity',
              'Engine burns (fusion)',
              'Variable reduction during burn phases only',
            ],
          ],
        },
      },
      {
        heading: 'Recovery',
        paragraphs: [
          'Zero-g exposure continuously recovers while docked at a rate of 0.5x the accumulation rate — it takes roughly twice as long to recover as it did to accumulate.',
          'There is no instant reset. Long voyages build up a "debt" that must be paid off with extended docking time.',
          'Recovery does not occur during flight or while at zero-g stations.',
          'While docked with active exposure, the Crew tab shows a recovery indicator with estimated time to reach the next lower tier and full recovery.',
        ],
      },
      {
        heading: 'Strategic Implications',
        paragraphs: [
          'Long-haul fusion [[ship-classes|ships]] need gravity solutions (centrifuge pod or rotating habitat) or their crew will suffer serious piloting penalties.',
          'Shorter trips can skip gravity equipment if recovery time is planned between voyages.',
          'A mix of [[ship-equipment|exercise modules]] and [[crew-equipment|g-seat harnesses]] reduces the rate to 35% of normal — still accumulating but much slower.',
          'Pre-departure warnings appear on the Nav tab when a trip will push crew past a threshold.',
        ],
      },
    ],
    relatedArticles: [
      'ship-equipment',
      'crew-equipment',
      'flight-physics',
      'encounters',
    ],
  },

  {
    id: 'radiation',
    title: 'Radiation Exposure',
    category: 'Health & Environment',
    summary:
      'Radiation from fusion drives, shielding equipment, and health effects.',
    sections: [
      {
        paragraphs: [
          'All drives above chemical emit radiation proportional to their power output. On [[ship-classes|Class III]] fusion vessels ("torch ships"), radiation management is a critical concern.',
        ],
      },
      {
        heading: 'Radiation Sources',
        paragraphs: [
          'Fission drives: Mild radiation, manageable on short flights but cumulative on long ones.',
          'Fusion drives: Significant radiation requiring dedicated shielding equipment.',
          'Advanced fusion: Extreme radiation requiring heavy shielding.',
          'Reactor containment failures cause radiation spikes far exceeding normal output.',
        ],
      },
      {
        heading: 'Protection',
        paragraphs: [
          '[[ship-equipment|Radiation Shielding Panels]] reduce crew exposure. Shielding equipment consumes equipment slots and power — a direct tax on ship capability.',
          'Keeping the reactor room staffed with crew maintains containment integrity, preventing dangerous radiation spikes.',
        ],
      },
      {
        heading: 'Monitoring Radiation',
        paragraphs: [
          'The Ship tab displays a RADIATION status bar showing net exposure (engine output minus shielding). Hover over it for a detailed breakdown including per-crew health loss rate and containment status.',
          "Each crew member's detail panel in the Crew tab shows their individual radiation exposure status, including effective damage rate and whether medbay treatment is reducing it.",
          'When containment integrity drops below 70%, 50%, or 30%, the ship log records warnings and a toast notification alerts you. Keep the reactor room staffed to slow containment degradation.',
        ],
      },
      {
        heading: 'Cascading Failures',
        paragraphs: [
          'On fusion-class vessels, systems are interdependent. Degraded containment leads to radiation spikes, which cause crew health drops, which lead to unstaffed stations, which cause further degradation. Unchecked radiation can cause [[crew-death|crew death]].',
          'Preventing cascading failures through proper crew management and equipment maintenance is the core challenge of torch ship operations.',
        ],
      },
    ],
    relatedArticles: [
      'ship-classes',
      'engines',
      'ship-equipment',
      'waste-heat',
      'crew-death',
    ],
  },

  {
    id: 'waste-heat',
    title: 'Waste Heat',
    category: 'Health & Environment',
    summary: 'Thermal management on fusion vessels and cascade failure risk.',
    sections: [
      {
        paragraphs: [
          '[[engines|Fusion and advanced fusion drives]] produce enormous waste heat that must be radiated away. Insufficient thermal management causes accelerated degradation of all [[ship-equipment|ship equipment]].',
        ],
      },
      {
        heading: 'Thermal Equipment',
        paragraphs: [
          'Ships require thermal management equipment such as radiator arrays and active coolant systems.',
          'Thermal equipment itself degrades under load, creating the potential for cascade failures where overheating damages the very equipment meant to prevent overheating.',
        ],
      },
      {
        heading: 'Management',
        paragraphs: [
          'Monitor thermal status on the Ship tab. Assign crew to repair duty to maintain thermal [[ship-equipment|equipment]] condition.',
          'On long voyages, thermal management is a constant concern — not a set-and-forget system.',
        ],
      },
    ],
    relatedArticles: ['radiation', 'ship-equipment', 'engines', 'ship-classes'],
  },

  // ═══════════════════════════════════════════════════════════
  // MINING & RESOURCES
  // ═══════════════════════════════════════════════════════════
  {
    id: 'mining-system',
    title: 'Mining System',
    category: 'Mining & Resources',
    summary: 'How mining works, equipment, skill progression, and ore mastery.',
    sections: [
      {
        paragraphs: [
          'Mining is a core income activity alongside [[contracts|trade contracts]]. Ships orbiting locations with mine services can extract [[ore-types|ore]] and sell it at stations with trade services.',
        ],
      },
      {
        heading: 'How Mining Works',
        paragraphs: [
          'Mining happens automatically while your ship is orbiting a location that provides a mine service. The ship must have mining equipment installed — without it, no ore can be extracted. The [[ship-classes|Dreadnought]] and [[ship-classes|Leviathan]] carry two mining bays each, providing 4 mining_ops [[job-slots|job slots]] for maximum extraction speed.',
          'With mining equipment but no crew, the ship mines at a reduced base rate (25% speed), restricted to basic ores (Mining 0). Assigning crew to the mining_ops [[job-slots|job slot]] in the mining bay significantly increases extraction speed and unlocks higher-tier ores based on their [[skill-system|mining]] skill.',
          'Use the ore material picker in the mining panel to choose which ore to extract. By default the highest-value ore is selected automatically, but you can override this to focus on a specific material. Locked ores (requiring higher mining skill) are shown but cannot be selected until your crew levels up.',
          'Extraction rate depends on [[ship-equipment|ship mining equipment]] quality, [[skill-system|mining]] skill, and [[mastery-system|ore mastery]]. The mining panel shows real-time extraction rates and estimated time to fill cargo.',
          "Extracted ore is stored in your ship's cargo hold. The cargo progress bar shows fill level at a glance. When cargo is full, mining pauses. Sell ore at any station with a trade service to convert it into [[credits-economy|credits]]. Sell prices vary by location type and improve with the [[skill-system|commerce]] skill.",
        ],
      },
      {
        heading: 'Mining Equipment',
        paragraphs: [
          'Mining equipment is ship-mounted and installed in [[ship-equipment|equipment slots]]. It is operated by crew from the mining bay. Better equipment requires higher [[skill-system|mining]] skill to operate and draws more power.',
          'Mining equipment degrades during active extraction, reducing its effectiveness. At maximum wear, mining rate drops to 50%. Assign crew to repair [[job-slots|job slots]] to maintain equipment condition. The mining [[mastery-system|mastery pool]] checkpoint at 50% reduces mining equipment wear by 10%.',
          'Mining equipment is purchased and upgraded at stations with trade services via the Ship Equipment tab in the Station Store. Upgrading provides a trade-in credit of 50% of the old equipment value.',
        ],
        table: {
          headers: [
            'Equipment',
            'Mining Level Req',
            'Rate Multiplier',
            'Power Draw',
            'Price',
          ],
          rows: [
            ['Mining Laser Array', '0', '1.0x', '8 kW', '2,000 cr'],
            ['Industrial Mining Rig', '20', '2.0x', '15 kW', '8,000 cr'],
            ['Deep Core Extraction System', '50', '3.5x', '25 kW', '30,000 cr'],
            ['Quantum Resonance Array', '80', '5.0x', '40 kW', '80,000 cr'],
          ],
        },
      },
      {
        heading: 'Mining Skill Unlocks',
        paragraphs: [
          'Your mining skill level determines which [[ore-types|ore types]] you can extract. Higher-level ores are more valuable but require significant skill investment.',
        ],
        table: {
          headers: ['Mining Level', 'Unlocked Ores'],
          rows: [
            ['0', '[[ore-types|Iron]], [[ore-types|Silicate]]'],
            ['5', '[[ore-types|Water Ice]]'],
            ['10', '[[ore-types|Copper]], [[ore-types|Rare Earth]]'],
            ['25', '[[ore-types|Titanium]]'],
            ['40', '[[ore-types|Platinum]]'],
            ['60', '[[ore-types|Helium-3]]'],
            ['90', '[[ore-types|Exotic Matter]]'],
          ],
        },
      },
      {
        heading: 'Ore Mastery',
        paragraphs: [
          'Through the [[mastery-system|mastery system]], repeated mining of the same ore type builds ore mastery (0-99 per ore). Higher ore mastery improves yield and extraction speed for that specific ore.',
          '25% of ore mastery XP flows into the mining mastery pool, which provides skill-wide bonuses at key checkpoints.',
        ],
      },
      {
        heading: 'Selling Ore',
        paragraphs: [
          "Ore is sold at stations that offer a trade service. Sell prices depend on the ore base value, the location type, and your best crew member's [[commerce-skill|commerce]] skill. Planets offer the best prices (1.1× multiplier) while remote locations pay less.",
          'Price formula: base value × location multiplier × (1 + commerce skill × 0.005). At commerce 100, you earn 50% more per unit.',
        ],
      },
      {
        heading: 'Auto-Sell Mining Routes',
        paragraphs: [
          'For fully idle mining, set up an auto-sell route from the mining panel while orbiting a mining location. The destination picker shows each reachable trade station with estimated profitability: sell price per unit, round-trip travel time, and projected credits per hour.',
          'Once a route is established, the ship automatically:\n1. Mines until cargo is full\n2. Flies to the trade station and docks\n3. Sells all ore and auto-refuels if needed\n4. Flies back to the mining location and resumes mining',
          'The route repeats indefinitely until cancelled or funds run out for refueling. The mining panel shows route stats including trips completed, total credits earned, and average credits per hour.',
          'Choose your sell destination carefully — closer stations reduce transit time but may offer lower prices. The profitability estimate accounts for both fill time and travel time, so the best destination balances sell price against distance. The piloting skill gate still applies: you can only pick stations your crew can reach.',
        ],
      },
    ],
    relatedArticles: [
      'ore-types',
      'mastery-system',
      'mining-destinations',
      'ship-equipment',
      'skill-system',
      'commerce-skill',
    ],
  },

  {
    id: 'ore-types',
    title: 'Ore Types',
    category: 'Mining & Resources',
    summary:
      'All 9 ore types, their values, locations, and skill requirements.',
    sections: [
      {
        paragraphs: [
          'Nine ore types can be extracted from [[mining-destinations|mining locations]] across the solar system. Each ore has a base value, a [[skill-system|mining]] skill requirement to extract, and a cargo weight. Ore value generally increases with distance from Earth — basic ores are found in cislunar space, while premium ores require reaching the Belt or Jupiter.',
        ],
      },
      {
        heading: 'Ore Catalog',
        paragraphs: [''],
        table: {
          headers: ['Ore', 'Base Value', 'Mining Level', 'Locations', 'Weight'],
          rows: [
            [
              'Iron',
              '8 cr',
              '0',
              '[[mining-destinations|Graveyard Drift]], The Scatter, Mars, Vesta, The Crucible, Ceres',
              '10 kg',
            ],
            [
              'Silicate',
              '5 cr',
              '0',
              '[[mining-destinations|Graveyard Drift]]',
              '8 kg',
            ],
            [
              'Water Ice',
              '12 cr',
              '5',
              '[[mining-destinations|Tycho Colony]], Mars, Vesta, Ceres',
              '15 kg',
            ],
            [
              'Copper',
              '15 cr',
              '10',
              '[[mining-destinations|Graveyard Drift]]',
              '12 kg',
            ],
            [
              'Rare Earth',
              '35 cr',
              '10',
              '[[mining-destinations|Tycho Colony]], Mars, The Crucible, Ceres',
              '5 kg',
            ],
            [
              'Titanium',
              '60 cr',
              '25',
              '[[mining-destinations|Tycho Colony]], The Scatter, Vesta',
              '15 kg',
            ],
            [
              'Platinum',
              '120 cr',
              '40',
              '[[mining-destinations|The Scatter]], The Crucible, Ceres',
              '8 kg',
            ],
            [
              'Helium-3',
              '250 cr',
              '60',
              '[[mining-destinations|Tycho Colony]] (0.1x), Jupiter Station',
              '2 kg',
            ],
            [
              'Exotic Matter',
              '500 cr',
              '90',
              '[[mining-destinations|Jupiter Station]]',
              '1 kg',
            ],
          ],
        },
      },
      {
        heading: 'Selling Ore',
        paragraphs: [
          'Ore is sold at any station with a trade service. Dock at the station and use the Sell Ore panel in the Work tab. You can sell individual ore types or all at once.',
          'Sell price = base value × location multiplier × commerce bonus. Planets offer 1.1x prices, space stations 1.0x, and smaller outposts less. The [[skill-system|commerce]] skill of your best trader adds +0.5% per skill point (up to +50% at skill 100).',
        ],
      },
    ],
    relatedArticles: [
      'mining-system',
      'mining-destinations',
      'credits-economy',
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // SURVIVAL
  // ═══════════════════════════════════════════════════════════
  {
    id: 'provisions',
    title: 'Provisions',
    category: 'Health & Environment',
    summary:
      'Food and water supply for crew survival, consumption rates, auto-resupply, and starvation.',
    sections: [
      {
        paragraphs: [
          'Provisions represent the food, water, and basic consumables your crew needs to survive. Every ship carries provisions measured in kilograms, and every crew member consumes them while in flight or orbiting. When docked at a [[station-services|trade station]], crew eat station-side and ship provisions are not consumed. At remote locations without trade services (asteroid swarms, mining-only sites), provisions are still consumed normally. Running out of provisions causes [[crew-death|starvation damage]] that can kill crew members.',
        ],
      },
      {
        heading: 'Consumption Rate',
        paragraphs: [
          'Each crew member has a base consumption of 15 kg of provisions per game day, covering food, water, and basic life necessities. However, [[life-support|life support]] equipment recycles a significant portion — standard life support recycles 10 kg per crew per day, reducing effective consumption to ~5 kg. A ship with 4 crew and functioning life support burns through about 20 kg per day. If life support degrades, recycling efficiency drops and consumption rises toward the 15 kg base rate.',
          'Provisions mass counts against your available cargo capacity — a fully provisioned ship has less room for [[contracts|contract]] cargo and [[ore-types|mined ore]]. Managing the balance between provisions and cargo space is part of route planning.',
        ],
      },
      {
        heading: 'Auto-Resupply',
        paragraphs: [
          'When docked at a location with trade services, provisions are automatically purchased up to 30 days of supply for your current crew count. Since crew eat station-side at trade stations, your ship provisions remain at the level they were resupplied to until departure. At locations without trade services (such as asteroid mining sites), provisions continue to be consumed normally — plan accordingly for extended mining operations.',
          'If your [[credits-economy|credits]] are insufficient for a full resupply, the ship buys as much as it can afford. Partial resupply is logged so you know the ship departed without full provisions.',
        ],
      },
      {
        heading: 'Pricing',
        paragraphs: [
          'Provisions pricing varies by distance from Earth. Inner-system stations charge the base rate, while outer-system locations charge significantly more.',
        ],
        table: {
          headers: ['Region', 'Distance from Earth', 'Price per kg'],
          rows: [
            ['Inner system', '< 100,000 km', '0.50 cr'],
            ['Mid system', '100,000 - 1,000,000 km', '0.75 cr'],
            ['Outer system', '> 1,000,000 km', '1.25 cr'],
          ],
        },
      },
      {
        heading: 'Starvation',
        paragraphs: [
          'When provisions reach zero, all crew take 3.0 health damage per day — aggressive damage that will kill unprotected crew within days. The captain is exempt from [[crew-death|death]] (health floors at 1) but still suffers damage effects. Starvation cannot occur at trade stations (crew eat station-side), but can happen at remote mining locations without trade services.',
          'Starvation warnings appear at 7 days and 3 days remaining. At zero provisions, a critical alert fires and the game auto-pauses if critical alert pausing is enabled.',
          'Provisions are the survival clock for [[stranded-ships|stranded ships]] — when fuel runs out and provisions deplete, crew begin dying.',
        ],
      },
      {
        heading: 'Strategy',
        paragraphs: [
          'On short inner-system routes, provisions are a minor concern — auto-resupply handles everything. On long outer-system voyages, provisions mass becomes significant: a 5-crew ship with functioning life support needs about 750 kg for a 30-day trip. With degraded or missing life support, that figure climbs toward 2,250 kg at the base rate.',
          'When planning [[mining-system|mining]] routes or long-haul [[contracts|contracts]], factor in provisions mass. A ship loaded with 30 days of food for a large crew has less room for profitable cargo.',
        ],
      },
    ],
    relatedArticles: [
      'crew-death',
      'stranded-ships',
      'credits-economy',
      'life-support',
      'contracts',
      'station-services',
    ],
  },

  {
    id: 'stranded-ships',
    title: 'Stranded Ships',
    category: 'Health & Environment',
    summary:
      'What makes a ship stranded, the survival countdown, and how to get rescued.',
    sections: [
      {
        paragraphs: [
          'A ship becomes stranded when it has no way to refuel — it cannot reach any station with refueling service using its remaining fuel, and cannot buy fuel at its current location (either no refuel service or zero [[credits-economy|credits]]). Being stranded is one of the most dangerous situations in the game.',
        ],
      },
      {
        heading: 'Stranded Conditions',
        paragraphs: [
          'All four of these must be true simultaneously for a ship to be stranded:',
        ],
        table: {
          headers: ['Condition', 'Description'],
          rows: [
            [
              'Not in flight',
              'Ship is docked or orbiting (committed trajectories play out)',
            ],
            ['Crew aboard', 'Empty ships are not considered stranded'],
            [
              'Cannot buy fuel locally',
              'Current location has no refuel service, or you have zero credits',
            ],
            [
              'Cannot reach any refuel station',
              'Remaining fuel is insufficient to fly to any location with refueling',
            ],
          ],
        },
      },
      {
        heading: 'Survival Timer',
        paragraphs: [
          'Once stranded, the crew survives on remaining [[provisions|provisions]]. The survival timer shows how many days of food and water remain. When provisions run out, [[crew-death|starvation]] begins killing crew.',
          'The game auto-pauses when a ship is first detected as stranded (if critical alert pausing is enabled), giving you time to plan a [[rescue-missions|rescue]].',
        ],
      },
      {
        heading: 'Distress Beacon',
        paragraphs: [
          'Stranded ships automatically broadcast a distress beacon. This triggers [[rescue-missions|rescue quest]] generation across all other fleet locations, allowing any of your other ships to mount a rescue mission.',
          'The fleet panel shows stranded ships with a distress indicator, including their location and remaining provisions.',
        ],
      },
      {
        heading: 'Avoiding Stranding',
        paragraphs: [
          'Plan fuel carefully before departure. The [[navigation|Nav tab]] shows fuel cost estimates for each destination at your current [[flight-physics|flight profile]]. Locations shown as unreachable are beyond your fuel range.',
          'Keep a fuel reserve rather than flying on fumes. Economy [[flight-physics|flight profiles]] use less fuel, extending your effective range. Maintain a credit reserve so you can always buy fuel when docked.',
          'If stranding seems imminent, consider redirecting to a closer station mid-flight (available on manual flights only).',
        ],
      },
    ],
    relatedArticles: [
      'provisions',
      'rescue-missions',
      'crew-death',
      'navigation',
      'flight-physics',
      'credits-economy',
    ],
  },

  {
    id: 'crew-death',
    title: 'Crew Death',
    category: 'Health & Environment',
    summary:
      'How crew die, what causes fatal health loss, and what happens when crew are lost.',
    sections: [
      {
        paragraphs: [
          "Crew members die when their health reaches zero. Death is permanent — dead crew are removed from the ship and cannot be recovered. The captain is the sole exception: as the player avatar, the captain's health floors at 1 and they can never die.",
        ],
      },
      {
        heading: 'Causes of Death',
        paragraphs: ['Multiple hazards can reduce crew health to zero:'],
        table: {
          headers: ['Hazard', 'Source', 'Prevention'],
          rows: [
            [
              'Starvation',
              '[[provisions|Provisions]] depleted — 3.0 damage/tick',
              'Keep provisions stocked; auto-resupply at trade stations',
            ],
            [
              'Oxygen deprivation',
              '[[life-support|Oxygen]] below safe levels',
              'Maintain [[ship-equipment|life support equipment]]; repair [[ship-equipment|air filters]]',
            ],
            [
              'Radiation',
              '[[radiation|Radiation exposure]] from fusion drives',
              'Install [[ship-equipment|radiation shielding]]; staff reactor room',
            ],
            [
              'Combat',
              '[[encounters|Pirate encounters]] — boarding and harassment',
              'Equip [[crew-equipment|weapons/armor]]; install [[ship-equipment|point defense]]',
            ],
          ],
        },
      },
      {
        heading: 'Captain Immunity',
        paragraphs: [
          "The captain (player character) cannot die. When the captain's health would drop to zero, it is floored at 1 instead. The captain still suffers all negative effects of low health but will always survive.",
          'This means that even in the worst catastrophe — total crew loss on a [[stranded-ships|stranded ship]] — the captain survives alone, waiting for [[rescue-missions|rescue]] or a lucky break.',
        ],
      },
      {
        heading: 'Consequences of Crew Death',
        paragraphs: [
          'When a crew member dies, they are immediately removed from the ship roster. All [[job-slots|job slot]] assignments for that crew member are cleared — their station becomes unmanned.',
          'On ships with tight crew counts, a single death can cascade: losing the engineer stops repairs, equipment degrades faster, life support fails, and more crew die. On [[ship-classes|fusion-class vessels]], this cascade can be rapid and devastating.',
          'A death event is logged and a notification appears. Deaths are also summarized in the [[time-system|catch-up report]] when you return after an absence. Dead crew cannot be replaced until you dock at a station with [[crew-hiring|hiring]] services and recruit replacements.',
        ],
      },
      {
        heading: 'Prevention',
        paragraphs: [
          'Keep [[provisions|provisions]] stocked and [[life-support|oxygen]] flowing. Maintain [[ship-equipment|equipment]] — especially air filters and radiation shielding on fusion ships. Equip crew with [[crew-equipment|personal gear]] (medkits, rebreathers, armor) for survivability.',
          'Monitor health bars on the Crew tab. If health is trending down, identify the cause (check Ship tab status bars for oxygen, radiation, provisions) and address it before it becomes fatal.',
        ],
      },
    ],
    relatedArticles: [
      'provisions',
      'life-support',
      'radiation',
      'encounters',
      'stranded-ships',
      'crew-hiring',
      'job-slots',
    ],
  },

  {
    id: 'rescue-missions',
    title: 'Rescue Missions',
    category: 'Health & Environment',
    summary:
      'Fleet self-rescue quests for stranded ships: fuel delivery, requirements, and urgency.',
    sections: [
      {
        paragraphs: [
          'When a ship in your fleet becomes [[stranded-ships|stranded]], rescue quests automatically appear at all other locations where you have ships. Rescue missions are fleet self-rescue operations — another of your ships delivers fuel to the stranded vessel.',
        ],
      },
      {
        heading: 'How It Works',
        paragraphs: [
          'The rescue system calculates how much fuel the stranded ship needs to reach the nearest refueling station, adds a 20% safety buffer, and generates a rescue quest requiring that amount of fuel as cargo payload.',
          "Any of your other ships can accept the rescue quest. The rescuer flies to the stranded ship's location, transfers the fuel payload on arrival, then returns. The stranded ship receives enough fuel to fly to a station and refuel properly.",
        ],
      },
      {
        heading: 'Requirements',
        paragraphs: [
          'A ship must meet these requirements to accept a rescue quest:',
        ],
        table: {
          headers: ['Requirement', 'Details'],
          rows: [
            [
              'Cargo space',
              "Must have room for the fuel payload (fuel is carried as cargo, not in the rescuer's fuel tanks)",
            ],
            [
              'Own fuel',
              "Must have enough fuel for a round trip to the stranded ship's location and back",
            ],
            [
              'Helm crew',
              'Must have a crew member assigned to the [[job-slots|helm]] (standard departure requirement)',
            ],
            ['Not self-rescue', 'A stranded ship cannot rescue itself'],
          ],
        },
      },
      {
        heading: 'Urgency Levels',
        paragraphs: [
          "Rescue quests display urgency based on the stranded ship's remaining [[provisions|provisions]]:",
        ],
        table: {
          headers: ['Urgency', 'Provisions Remaining'],
          rows: [
            ['URGENT', 'Less than 7 days'],
            ['Priority', '7 - 14 days'],
            ['Standard', 'More than 14 days'],
          ],
        },
      },
      {
        heading: 'Payment',
        paragraphs: [
          'Rescue missions pay nothing — they are fleet self-rescue operations, not commercial contracts. The reward is saving your crew and ship from destruction. The fuel delivered and the fuel spent on the round trip are both real costs.',
          'Despite the zero payment, rescue missions are often the most important quest available. A [[stranded-ships|stranded ship]] with a trained crew and valuable [[ship-equipment|equipment]] is worth far more than the fuel cost of a rescue.',
        ],
      },
      {
        heading: 'Strategy',
        paragraphs: [
          'Keep at least one ship in the fleet with spare fuel capacity and cargo room to serve as a potential rescuer. Ships on short inner-system routes make good rescue platforms since they dock frequently and stay fueled.',
          "When a stranding alert fires, check the rescue quest details: fuel payload required, round-trip distance, and the stranded ship's survival timer. If the rescuer cannot reach the stranded ship before provisions run out, the crew will start dying from [[crew-death|starvation]] during the wait.",
        ],
      },
    ],
    relatedArticles: [
      'stranded-ships',
      'provisions',
      'crew-death',
      'contracts',
      'flight-physics',
      'navigation',
    ],
  },
];
