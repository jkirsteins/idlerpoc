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
          'Time advances automatically during flight but is frozen when docked at a station or planet. While docked, you can manually advance to the next day to refresh available [[contracts|quests]] and trigger [[zero-g-exposure|recovery]] mechanics.',
        ],
      },
      {
        heading: 'Idle Catch-Up',
        paragraphs: [
          'The game is idle-friendly: closing the browser or backgrounding the tab does not lose progress. When you return, the game computes all elapsed time and processes pending updates in batches.',
          'If you were away for more than 5 real minutes, a catch-up report shows what happened while you were gone, including [[encounters|encounters]], [[contracts|contract]] completions, and [[credits-economy|credit]] changes.',
          'Catch-up processes up to 1 real day of elapsed time. During fast-forward, [[encounters|encounter]] severity is capped (boardings downgraded to harassment) to prevent unfair losses while away.',
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
    relatedArticles: ['contracts', 'flight-physics', 'encounters'],
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
          'Economic pressure is constant: your crew costs money every day during flight, and fuel is expensive. Accepting profitable [[contracts|contracts]], [[mining-system|mining]] valuable ores, and planning efficient routes is essential to stay solvent.',
        ],
      },
      {
        heading: 'Income Sources',
        paragraphs: [
          '[[contracts|Contracts]]: Delivery, passenger, freight, and supply contracts pay upon completion or per trip for standing routes.',
          'Standing freight routes provide reliable recurring income between trading stations. Payment scales with distance, route danger, and location economic power.',
          '[[mining-system|Mining]]: Extract ore at mining locations and sell at stations with trade services.',
          '[[encounters|Combat]] victories occasionally yield bounty payments.',
        ],
      },
      {
        heading: 'Expenses',
        paragraphs: [
          '[[crew-salaries|Crew salaries]] are deducted every day during flight. A typical 3-person crew costs about 120 credits per day.',
          'Fuel must be purchased at stations with refueling services. Fuel pricing varies by location.',
          '[[ship-equipment|Equipment]] can be bought at stations with trade services. Selling equipment returns 50% of the retail value.',
          'If credits reach zero, crew become unpaid. Unpaid crew will leave the ship at the next port. The captain (you) never leaves.',
        ],
      },
      {
        heading: 'Commerce Skill Bonus',
        paragraphs: [
          'As your captain develops the [[commerce-skill|Commerce]] skill through trade operations, you earn quest payment bonuses (up to +20%) and fuel discounts (up to -20%).',
        ],
      },
    ],
    relatedArticles: [
      'contracts',
      'crew-salaries',
      'commerce-skill',
      'crew-hiring',
      'mining-system',
    ],
  },

  {
    id: 'contracts',
    title: 'Contracts & Trade Routes',
    category: 'Core Systems',
    summary:
      'Quest types, standing freight, payment structure, and contract management.',
    sections: [
      {
        paragraphs: [
          'Contracts are your primary source of [[credits-economy|income]]. Available contracts refresh each day and are generated based on your [[navigation|location]], ship capabilities, and local conditions.',
        ],
      },
      {
        heading: 'Contract Types',
        paragraphs: [
          'Delivery: Transport specific cargo to a destination. One-time payment on completion.',
          'Passenger: Ferry passengers between locations. Higher pay but time-sensitive.',
          'Freight: Haul bulk goods. Pay per trip, scales with cargo capacity.',
          'Supply: Provide specific materials to a location. Often higher pay for harder-to-reach destinations.',
        ],
      },
      {
        heading: 'Standing Freight Routes',
        paragraphs: [
          'Every location with trade services offers permanent standing freight routes to all its trading partners. These never expire and provide reliable recurring income.',
          'Standing freight payment scales with distance, route danger, and location economic power. Trade goods are determined by [[navigation|location]] type: planets export manufactured goods, stations export tech components.',
        ],
      },
      {
        heading: 'Contract Management',
        paragraphs: [
          'You can only have one active contract per ship at a time. Contracts can be paused, resumed, or abandoned.',
          'Abandoning a contract forfeits any earned payments and may affect future contract availability.',
          'Quest cards show estimated fuel cost, trip time, [[crew-salaries|crew salary]] cost, and projected profit/loss based on your current [[flight-physics|flight profile]].',
        ],
      },
    ],
    relatedArticles: [
      'credits-economy',
      'flight-physics',
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
          'The base skill level determines what you can do. Higher levels unlock new capabilities: better [[ship-classes|ship classes]] for piloting, rarer [[ore-types|ores]] for mining, and larger trade bonuses for [[commerce-skill|commerce]].',
          'Skill level trains passively through [[job-slots|job slot]] assignment during flight. Training uses diminishing returns — fast progress early, slow progress at high levels.',
        ],
      },
      {
        heading: 'Layer 2: Item Mastery (0-99 per item)',
        paragraphs: [
          'Each skill has specific items that can be mastered individually. Mastery builds through repeated use and provides familiarity bonuses.',
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
          ],
        },
      },
      {
        heading: 'Layer 3: Mastery Pool (0-100%)',
        paragraphs: [
          'As you earn item mastery XP, 25% of that XP flows into a per-skill mastery pool. The pool percentage represents your overall mastery of the skill domain.',
          'The mastery pool provides skill-wide bonuses at key checkpoints.',
        ],
        table: {
          headers: ['Checkpoint', 'Bonus'],
          rows: [
            ['10%', 'Minor skill-wide efficiency bonus'],
            ['25%', 'Moderate skill-wide efficiency bonus'],
            ['50%', 'Major skill-wide bonus + unlock advanced techniques'],
            ['95%', 'Pinnacle bonus — near-complete mastery of the domain'],
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
      'Three core skills with mastery layers, trained passively via job slot assignment.',
    sections: [
      {
        paragraphs: [
          'Every crew member has 3 skills on a 0-99 scale. Skills train passively through [[job-slots|job slot]] assignment during flight. Each skill feeds into the [[mastery-system|three-layer mastery system]] for deeper progression.',
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
          ],
        },
      },
      {
        heading: 'Training Mechanics',
        paragraphs: [
          'Skills train passively when crew are assigned to [[job-slots|job slots]] that use that skill. Training speed uses diminishing returns — fast progress early, slow progress at high levels.',
          'When a crew member is assigned to a job that matches their primary [[crew-roles|role]] skill, they receive a 1.5x training bonus.',
          'Training only occurs during flight. Docked time does not advance skill training.',
        ],
      },
      {
        heading: 'Mastery Layers',
        paragraphs: [
          'Beyond the base skill level, each skill has [[mastery-system|item mastery]] and a mastery pool that provide additional bonuses. Route mastery for piloting, ore mastery for mining, and trade route mastery for commerce all reward repeated engagement with specific content.',
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
          'The captain and first officer (senior non-captain crew member) earn additional commerce XP when [[contracts|contracts]] complete, creating a feedback loop where trade experience improves future profitability.',
        ],
      },
      {
        heading: 'Training',
        paragraphs: [
          'Commerce trains through trader job slot assignment like other skills. Additionally, completing [[contracts|trade route contracts]] provides bonus commerce XP.',
          'Captain earns: 1.0 + 0.5 per trip completed in the contract.',
          "First officer earns half the captain's amount.",
          'Trade route [[mastery-system|mastery]] develops separately through repeated runs on the same routes, providing familiarity bonuses.',
        ],
      },
      {
        heading: 'Bonuses',
        paragraphs: [''],
        table: {
          headers: ['Commerce Level', 'Quest Pay Bonus', 'Fuel Discount'],
          rows: [
            ['0-24', '+0%', '0%'],
            ['25-49', '+5%', '-5%'],
            ['50-74', '+10%', '-10%'],
            ['75-94', '+15%', '-15%'],
            ['95-99', '+20%', '-20%'],
          ],
        },
      },
    ],
    relatedArticles: [
      'skill-system',
      'contracts',
      'credits-economy',
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
          'The captain is always the player character regardless of skills.',
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
          ],
        },
      },
      {
        heading: 'Role Priority',
        paragraphs: [
          'When skills are tied, roles are assigned in priority order: Piloting > Mining > Commerce.',
          'Crew can transition roles over time as they develop different [[skill-system|skills]] through [[job-slots|job training]], though this is uncommon.',
        ],
      },
    ],
    relatedArticles: ['skill-system', 'job-slots', 'crew-hiring'],
  },

  {
    id: 'crew-hiring',
    title: 'Crew Hiring',
    category: 'Crew',
    summary:
      'Recruiting new crew at stations, costs, and candidate generation.',
    sections: [
      {
        paragraphs: [
          'When docked at stations with hiring services (Earth, Forge Station, Freeport Station, Mars), you can recruit additional crew members.',
        ],
      },
      {
        heading: 'Mechanics',
        paragraphs: [
          '2-3 randomly generated candidates are available per station visit. Candidates refresh when advancing the day.',
          'Each candidate has randomized [[skill-system|skills]], level, and [[crew-roles|role]].',
        ],
      },
      {
        heading: 'Hiring Cost',
        paragraphs: ['Base cost: 500 credits + (Level x 200 credits).'],
        table: {
          headers: ['Crew Level', 'Approximate Cost'],
          rows: [
            ['Level 1', '~700 credits'],
            ['Level 3', '~1,100 credits'],
            ['Level 5', '~1,500 credits'],
          ],
        },
      },
      {
        heading: 'Strategy',
        paragraphs: [
          'Higher-level crew cost more but start with better [[skill-system|skills]]. Larger crews increase [[crew-salaries|salary]] costs but reduce dependency on any one person.',
          'If crew leave due to unpaid wages, you may need emergency hiring at the next port.',
        ],
      },
    ],
    relatedArticles: ['crew-roles', 'crew-salaries', 'credits-economy'],
  },

  {
    id: 'crew-salaries',
    title: 'Crew Salaries',
    category: 'Crew',
    summary: 'Salary rates by role, payment timing, and unpaid crew.',
    sections: [
      {
        paragraphs: [
          'Crew members require regular payment during flight operations. Salaries are deducted every game day during flight. When docked, [[time-system|time]] is frozen and no salaries are charged.',
        ],
      },
      {
        heading: 'Salary Rates',
        paragraphs: [''],
        table: {
          headers: ['Role', 'Per Day', 'Justification'],
          rows: [
            ['Captain', '0 cr', 'Owner-operator, earns from ship profits'],
            ['[[crew-roles|Pilot]]', '48 cr', 'Essential bridge crew'],
            ['[[crew-roles|Miner]]', '36 cr', 'Resource extraction specialist'],
            ['[[crew-roles|Trader]]', '36 cr', 'Trade and commerce specialist'],
          ],
        },
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
          'Helm is the only required job — without a helm crew member, the ship coasts with no active control.',
        ],
      },
      {
        heading: 'Skill Training',
        paragraphs: [
          'Each job slot trains specific [[skill-system|skills]]. Assigning crew to jobs that match their [[crew-roles|role]] skill gives a 1.5x training speed bonus.',
          'Passive slots (Patient, Rest) benefit crew without training skills, allowing health and morale recovery.',
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
          'Ship-wide repair slots accept multiple crew members who generate repair points to fix degraded [[ship-equipment|equipment]]. This is critical on fusion-class [[ship-classes|ships]] where equipment degrades continuously.',
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
          'Can achieve escape velocity. Effective range ~3 AU. Travel time: days to weeks. Requires [[navigation|orbital mechanics planning]].',
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
        heading: 'Ship Class Access',
        paragraphs: [
          'Higher-class ships require higher [[skill-system|piloting]] skill from the helm crew member. Class II requires Piloting 25 (Competent), Class III requires Piloting 50 (Able).',
          'Ships are also unlocked by lifetime [[credits-economy|credits]] earned — a progression mechanic visible in Settings.',
        ],
      },
    ],
    relatedArticles: [
      'engines',
      'flight-physics',
      'skill-system',
      'ship-equipment',
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
    ],
    relatedArticles: [
      'flight-physics',
      'ship-classes',
      'life-support',
      'radiation',
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
          'Quest cards show profile-aware estimates so you can make informed decisions.',
        ],
      },
      {
        heading: 'G-Force',
        paragraphs: [
          'During burns, crew experience g-force proportional to [[engines|engine]] thrust. This provides partial protection from [[zero-g-exposure|zero-g exposure]].',
          'Real-time g-force is displayed on the Ship tab during flight.',
        ],
      },
    ],
    relatedArticles: ['engines', 'zero-g-exposure', 'contracts', 'time-system'],
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
          'Air filter degradation creates emergent tension on large ships: as filters wear, the O2 balance can tip negative.',
          'Station docking resupplies atmosphere to full.',
        ],
      },
    ],
    relatedArticles: ['ship-equipment', 'job-slots', 'ship-classes', 'engines'],
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
          'Equipment degrades during use. Life support filters wear down, shielding absorbs radiation, thermal radiators work harder.',
          'Crew assigned to repair [[job-slots|job slots]] generate repair points that restore equipment condition. Keeping crew on repair duty is essential on long voyages.',
        ],
      },
    ],
    relatedArticles: [
      'job-slots',
      'zero-g-exposure',
      'life-support',
      'radiation',
    ],
  },

  {
    id: 'crew-equipment',
    title: 'Crew Equipment',
    category: 'Ship Systems',
    summary:
      'Personal equipment for crew: weapons, tools, armor, mining gear, and accessories.',
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
              'Mining',
              'Basic Mining Laser, Improved Laser, Heavy Drill, Deep Core Extractor, Fusion Cutter, Quantum Excavator',
              'Determines [[mining-system|mining]] capability and extraction rate',
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
          "The navigation chart shows all known locations, their distances, and your ship's current position. Access it via the Nav tab.",
          'Locations provide different services: refueling, hiring, trade, [[mining-system|mining]], and repair. Planning your route to hit needed services is key to efficient operations.',
        ],
      },
      {
        heading: 'Locations',
        paragraphs: [
          'The game world includes 8 locations: Earth, Gateway Station, Meridian Station, Forge Station, Freeport Station, Ceres, Mars, and The Outpost.',
          'Each location has different services, different quest availability, and different threat levels for routes passing nearby.',
        ],
      },
      {
        heading: 'Route Planning',
        paragraphs: [
          'Before departure, your [[crew-roles|pilot]] plots a course. Navigation quality depends on [[skill-system|piloting]] skill and [[ship-equipment|equipment]].',
          'Good navigation reduces debris [[encounters|encounters]], improves fuel efficiency, and gives better hazard warnings.',
          'Locations shown as unreachable are beyond your current fuel range at the selected [[flight-physics|flight profile]].',
        ],
      },
    ],
    relatedArticles: [
      'flight-physics',
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
        ],
      },
      {
        heading: 'Combat Pipeline',
        paragraphs: [
          'Encounters are auto-resolved through a pipeline: Evade ([[crew-roles|pilot]] [[skill-system|piloting]]) > Negotiate ([[skill-system|commerce]]) > Flee (if outmatched) > Combat > Outcome.',
          'Possible outcomes: Evasion (clean escape), Negotiation (pay ransom), Fled (emergency escape with minor damage), Victory (bounty reward), Harassment (minor damage), Boarding (major losses).',
        ],
      },
      {
        heading: 'Defense Score',
        paragraphs: [
          'Your defense score comes from: point defense [[ship-equipment|equipment]] (PD lasers, flak turrets), deflector shields, [[crew-equipment|crew weapons]] (armory strength), and ship mass.',
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
    summary: 'Near-Earth mining locations accessible by Station Keeper ships.',
    sections: [
      {
        paragraphs: [
          'Several locations near Earth offer [[mining-system|mining]] services, accessible even by early-game ships. As your [[skill-system|piloting]] skill and ship class improve, more distant and lucrative mining sites become reachable.',
        ],
      },
      {
        heading: 'Near-Earth Mining Locations',
        paragraphs: [
          'These sites are within range of Station Keeper class ships and provide a solid introduction to mining operations.',
        ],
        table: {
          headers: [
            'Location',
            'Distance',
            'Piloting Req',
            'Available Ores',
            'Services',
          ],
          rows: [
            [
              'Debris Field Alpha',
              '300 km',
              '10',
              '[[ore-types|Iron]], [[ore-types|Silicate]]',
              'Mine',
            ],
            [
              'Scrapyard Ring',
              '800 km',
              '10',
              '[[ore-types|Iron]], [[ore-types|Copper]]',
              'Mine',
            ],
            [
              'NEA-2247',
              '1,500 km',
              '25',
              '[[ore-types|Iron]], [[ore-types|Rare Earth]], [[ore-types|Titanium]]',
              'Mine',
            ],
          ],
        },
      },
      {
        heading: 'Advanced Mining Locations',
        paragraphs: [
          'More distant locations offer rarer and more valuable [[ore-types|ores]] but require better ships and higher [[skill-system|piloting]] skill to reach.',
          'The Scatter: A dense asteroid cluster beyond the Moon, rich in Titanium and Platinum deposits. Requires Class II ship capability.',
          'Mars: Surface mining operations yield Rare Earth and Helium-3. Requires long-range flight capability.',
          'Jupiter Station: Orbital mining platforms harvest Helium-3 and Exotic Matter from the gas giant. The most lucrative mining in the solar system, but requires Class III vessels.',
        ],
      },
    ],
    relatedArticles: [
      'navigation',
      'mining-system',
      'ore-types',
      'ship-classes',
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
          'Zero-g exposure slowly recovers while docked. Recovery happens during manual day advancement at a rate of 0.5x the accumulation rate — it takes roughly twice as long to recover as it did to accumulate.',
          'There is no instant reset. Long voyages build up a "debt" that must be paid off with extended docking time.',
          'Recovery does not occur during flight or while at zero-g stations.',
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
        heading: 'Cascading Failures',
        paragraphs: [
          'On fusion-class vessels, systems are interdependent. Degraded containment leads to radiation spikes, which cause crew health drops, which lead to unstaffed stations, which cause further degradation.',
          'Preventing cascading failures through proper crew management and equipment maintenance is the core challenge of torch ship operations.',
        ],
      },
    ],
    relatedArticles: [
      'ship-classes',
      'engines',
      'ship-equipment',
      'waste-heat',
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
          'Mining happens automatically while your ship is orbiting a location that provides a mine service. Crew assigned to the mining_ops [[job-slots|job slot]] perform the extraction work.',
          'Crew in mining_ops train the [[skill-system|mining]] skill passively during operations. Higher mining skill unlocks rarer ores and improves extraction speed.',
          "Extracted ore is stored in your ship's cargo hold. Sell ore at any station with a trade service to convert it into [[credits-economy|credits]].",
        ],
      },
      {
        heading: 'Mining Equipment',
        paragraphs: [
          'Mining equipment is equipped in the crew equipment slot and determines what [[ore-types|ores]] you can extract and your extraction rate. Better equipment requires higher [[skill-system|mining]] skill to operate.',
        ],
        table: {
          headers: ['Equipment', 'Mining Level Req', 'Rate Multiplier'],
          rows: [
            ['Basic Mining Laser', '0', '1.0x'],
            ['Improved Mining Laser', '15', '1.5x'],
            ['Heavy Drill', '30', '2.0x'],
            ['Deep Core Extractor', '50', '2.5x'],
            ['Fusion Cutter', '75', '3.5x'],
            ['Quantum Excavator', '90', '5.0x'],
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
    ],
    relatedArticles: [
      'ore-types',
      'mastery-system',
      'mining-destinations',
      'crew-equipment',
      'skill-system',
    ],
  },

  {
    id: 'ore-types',
    title: 'Ore Types',
    category: 'Mining & Resources',
    summary: 'Available ore types, locations, and values.',
    sections: [
      {
        paragraphs: [
          'Eight ore types can be extracted from [[mining-destinations|mining locations]] across the solar system. Each ore has a base value, a [[skill-system|mining]] skill requirement to extract, and a cargo weight.',
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
              '5 cr',
              '0',
              '[[mining-destinations|Debris Field Alpha]], Scrapyard Ring, NEA-2247',
              'Heavy',
            ],
            [
              'Silicate',
              '3 cr',
              '0',
              '[[mining-destinations|Debris Field Alpha]]',
              'Light',
            ],
            [
              'Copper',
              '8 cr',
              '10',
              '[[mining-destinations|Scrapyard Ring]]',
              'Medium',
            ],
            [
              'Rare Earth',
              '15 cr',
              '10',
              '[[mining-destinations|NEA-2247]], Mars',
              'Medium',
            ],
            [
              'Titanium',
              '25 cr',
              '25',
              '[[mining-destinations|NEA-2247]], The Scatter',
              'Heavy',
            ],
            ['Platinum', '50 cr', '40', 'The Scatter, Mars', 'Heavy'],
            ['Helium-3', '80 cr', '60', 'Mars, Jupiter Station', 'Light'],
            ['Exotic Matter', '200 cr', '90', 'Jupiter Station', 'Light'],
          ],
        },
      },
      {
        heading: 'Selling Ore',
        paragraphs: [
          'Ore is sold at any station with a trade service. Prices are based on the ore base value, modified by local supply and demand.',
          'Building [[mastery-system|trade route mastery]] in [[commerce-skill|commerce]] can improve the prices you receive when selling ore.',
        ],
      },
    ],
    relatedArticles: [
      'mining-system',
      'mining-destinations',
      'credits-economy',
    ],
  },
];
