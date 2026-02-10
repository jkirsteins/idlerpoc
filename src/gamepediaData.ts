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
  | 'Health & Environment';

export const GAMEPEDIA_CATEGORIES: GamepediaCategory[] = [
  'Core Systems',
  'Crew',
  'Ship Systems',
  'Space',
  'Health & Environment',
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
          'Time advances automatically during flight but is frozen when docked at a station or planet. While docked, you can manually advance to the next day to refresh available quests and trigger recovery mechanics.',
        ],
      },
      {
        heading: 'Idle Catch-Up',
        paragraphs: [
          'The game is idle-friendly: closing the browser or backgrounding the tab does not lose progress. When you return, the game computes all elapsed time and processes pending updates in batches.',
          'If you were away for more than 5 real minutes, a catch-up report shows what happened while you were gone, including encounters, contract completions, and credit changes.',
          'Catch-up processes up to 1 real day of elapsed time. During fast-forward, encounter severity is capped (boardings downgraded to harassment) to prevent unfair losses while away.',
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
          'Credits are the universal currency. You earn them by completing contracts and trade routes, and spend them on fuel, crew salaries, hiring, and equipment.',
          'Economic pressure is constant: your crew costs money every day during flight, and fuel is expensive. Accepting profitable contracts and planning efficient routes is essential to stay solvent.',
        ],
      },
      {
        heading: 'Income Sources',
        paragraphs: [
          'Contracts: Delivery, passenger, freight, and supply contracts pay upon completion or per trip for standing routes.',
          'Standing freight routes provide reliable recurring income between trading stations. Payment scales with distance, route danger, and location economic power.',
          'Combat victories occasionally yield bounty payments.',
        ],
      },
      {
        heading: 'Expenses',
        paragraphs: [
          'Crew salaries are deducted every day during flight. A typical 3-person crew costs about 120 credits per day.',
          'Fuel must be purchased at stations with refueling services. Fuel pricing varies by location.',
          'Equipment can be bought at stations with trade services. Selling equipment returns 50% of the retail value.',
          'If credits reach zero, crew become unpaid. Unpaid crew will leave the ship at the next port. The captain (you) never leaves.',
        ],
      },
      {
        heading: 'Commerce Skill Bonus',
        paragraphs: [
          'As your captain develops the Commerce skill through completing trade routes, you earn quest payment bonuses (up to +20%) and fuel discounts (up to -20%). See the Commerce Skill article for details.',
        ],
      },
    ],
    relatedArticles: [
      'contracts',
      'crew-salaries',
      'commerce-skill',
      'crew-hiring',
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
          'Contracts are your primary source of income. Available contracts refresh each day and are generated based on your location, ship capabilities, and local conditions.',
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
          'Standing freight payment scales with distance, route danger, and location economic power. Trade goods are determined by location type: planets export manufactured goods, stations export tech components.',
        ],
      },
      {
        heading: 'Contract Management',
        paragraphs: [
          'You can only have one active contract per ship at a time. Contracts can be paused, resumed, or abandoned.',
          'Abandoning a contract forfeits any earned payments and may affect future contract availability.',
          'Quest cards show estimated fuel cost, trip time, crew salary cost, and projected profit/loss based on your current flight profile.',
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

  // ═══════════════════════════════════════════════════════════
  // CREW
  // ═══════════════════════════════════════════════════════════
  {
    id: 'skill-system',
    title: 'Skill System',
    category: 'Crew',
    summary:
      'Seven skills, passive training via job slots, and diminishing returns.',
    sections: [
      {
        paragraphs: [
          'Every crew member has 7 skills on a 1-100 scale. Six core skills train passively through job slot assignment during flight. The seventh skill, Commerce, is trained exclusively through completing trade routes.',
        ],
      },
      {
        heading: 'Core Skills',
        paragraphs: [''],
        table: {
          headers: ['Skill', 'Role', 'Used For'],
          rows: [
            [
              'Piloting',
              'Pilot',
              'Ship handling, helm control, ship class access',
            ],
            [
              'Astrogation',
              'Navigator',
              'Route plotting, hazard analysis, encounter avoidance',
            ],
            ['Engineering', 'Engineer', 'Reactor maintenance, systems repair'],
            ['Strength', 'Gunner', 'Combat capability, boarding defense'],
            ['Charisma', 'Quartermaster', 'Trade negotiations, crew morale'],
            ['Loyalty', 'First Officer', 'Crew support, conflict mediation'],
            ['Commerce', '(Captain only)', 'Trade bonuses, fuel discounts'],
          ],
        },
      },
      {
        heading: 'Training Mechanics',
        paragraphs: [
          'Skills train passively when crew are assigned to job slots that use that skill. Training speed uses diminishing returns — fast progress early, slow progress at high levels.',
          'When a crew member is assigned to a job that matches their primary role skill, they receive a 1.5x training bonus.',
          'Training only occurs during flight. Docked time does not advance skill training.',
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
      'specialization',
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
          'When any core skill (not Commerce) reaches level 50 (Able rank), you can choose to specialize that crew member in that skill.',
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
          'Specialize early (at 50) if you want faster progression to Expert and Master ranks in one skill.',
          'Wait and keep training broadly if you want a versatile crew member who can fill multiple roles.',
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
      'A unique skill trained by completing trade routes, providing financial bonuses.',
    sections: [
      {
        paragraphs: [
          'Commerce is the 7th skill, unique in how it is trained. It is not gained through job slots — only through completing trade route contracts.',
          'Only the captain and first officer (highest-loyalty non-captain crew) earn Commerce when a contract completes.',
        ],
      },
      {
        heading: 'Training',
        paragraphs: [
          'Captain earns: 1.0 + 0.5 per trip completed in the contract.',
          "First officer earns half the captain's amount.",
          'Commerce creates a feedback loop: completing routes improves Commerce, which improves pay and reduces fuel costs, making future routes more profitable.',
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
            ['95-100', '+20%', '-20%'],
          ],
        },
      },
    ],
    relatedArticles: ['skill-system', 'contracts', 'credits-economy'],
  },

  {
    id: 'crew-roles',
    title: 'Crew Roles',
    category: 'Crew',
    summary: 'How roles are derived from skills, not assigned directly.',
    sections: [
      {
        paragraphs: [
          "A crew member's role is determined by their highest skill, representing their primary expertise. Roles are not manually assigned — they shift dynamically if skill distribution changes.",
          'The captain is always the player character regardless of skills.',
        ],
      },
      {
        heading: 'Role Mapping',
        paragraphs: [''],
        table: {
          headers: ['Highest Skill', 'Role', 'Specialty'],
          rows: [
            ['Piloting', 'Pilot', 'Ship handling and helm control'],
            ['Astrogation', 'Navigator', 'Route plotting and scanning'],
            ['Engineering', 'Engineer', 'Repair and maintenance'],
            ['Strength', 'Gunner', 'Combat and security'],
            ['Charisma', 'Quartermaster', 'Morale and negotiations'],
            ['Loyalty', 'First Officer', 'Crew support and cohesion'],
          ],
        },
      },
      {
        heading: 'Role Priority',
        paragraphs: [
          'When skills are tied, roles are assigned in priority order: Piloting > Astrogation > Engineering > Strength > Charisma > Loyalty.',
          'Crew can transition roles over time as they develop different skills through job training, though this is uncommon.',
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
          'Each candidate has randomized skills, level, and role.',
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
          'Higher-level crew cost more but start with better skills. Larger crews increase salary costs but reduce dependency on any one person.',
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
          'Crew members require regular payment during flight operations. Salaries are deducted every game day during flight. When docked, time is frozen and no salaries are charged.',
        ],
      },
      {
        heading: 'Salary Rates',
        paragraphs: [''],
        table: {
          headers: ['Role', 'Per Day', 'Justification'],
          rows: [
            ['Captain', '0 cr', 'Owner-operator, earns from ship profits'],
            ['Pilot', '48 cr', 'Essential bridge crew'],
            ['Navigator', '48 cr', 'Route planning and hazard analysis'],
            ['Engineer', '72 cr', 'Critical for ship systems'],
            ['Cook', '24 cr', 'Morale specialist'],
            ['Medic', '36 cr', 'Medical care'],
            ['Gunner', '36 cr', 'Combat capability'],
            ['Mechanic', '48 cr', 'Repairs and maintenance'],
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
          'Ships have rooms (bridge, engine room, medbay, etc.) that generate specific job slots. Crew are assigned to job slots, not to rooms directly.',
        ],
      },
      {
        heading: 'How It Works',
        paragraphs: [
          'The bridge generates Helm and Comms slots. The engine room generates Drive Ops. The medbay generates Patient slots. Ship equipment can generate additional slots (e.g. nav scanner creates Scan Ops, point defense creates Targeting).',
          'Helm is the only required job — without a helm crew member, the ship coasts with no active control.',
        ],
      },
      {
        heading: 'Skill Training',
        paragraphs: [
          'Each job slot trains specific skills. Assigning crew to jobs that match their role skill gives a 1.5x training speed bonus.',
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
          'Ship-wide repair slots accept multiple engineers who generate repair points to fix degraded equipment. This is critical on fusion-class ships where equipment degrades continuously.',
        ],
      },
    ],
    relatedArticles: [
      'skill-system',
      'crew-roles',
      'ship-equipment',
      'ship-classes',
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
          'Crew members earn XP from completing contracts, surviving encounters, and flight time. XP accumulates toward the next level (max level 20).',
          'When enough XP is earned, a level-up notification appears. Leveling up improves overall crew effectiveness.',
        ],
      },
      {
        heading: 'XP Sources',
        paragraphs: [
          'Contract completion grants XP to all crew. Encounters grant XP based on outcome: victories grant more than evasions.',
          'Event-based skill gains (from encounters) bypass diminishing returns and provide flat skill amounts, making combat encounters valuable for training.',
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
          'Can achieve escape velocity. Effective range ~3 AU. Travel time: days to weeks. Requires orbital mechanics planning.',
        ],
      },
      {
        heading: 'Class III: Interplanetary Vessels',
        paragraphs: [
          'Range: Inner to outer solar system. Fusion drives providing sustained high acceleration.',
          'Entire solar system accessible in weeks to months. Expensive fuel costs. Requires managing radiation, waste heat, and reactor containment.',
          'These are "torch ships" — powerful but demanding. Neglect kills on a torch ship.',
        ],
      },
      {
        heading: 'Ship Class Access',
        paragraphs: [
          'Higher-class ships require higher piloting skill from the helm crew member. Class II requires Piloting 25 (Competent), Class III requires Piloting 50 (Able).',
          'Ships are also unlocked by lifetime credits earned — a progression mechanic visible in Settings.',
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
          'The flight profile slider controls how much of the delta-v budget is used for burns vs. coasting — economy profiles use less fuel but take longer.',
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
          'Accelerating: Engines firing, fuel being consumed, crew experience thrust gravity.',
          'Coasting: No fuel consumed, zero-g conditions, ship at cruising velocity.',
          'Decelerating: Engines firing again to slow down for arrival.',
        ],
      },
      {
        heading: 'Flight Profile Slider',
        paragraphs: [
          'Each ship has a flight profile slider (Economy to Max Speed) that controls the burn fraction of the delta-v budget.',
          'Economy: More coasting, less fuel, longer trip, more zero-g exposure.',
          'Max Speed: Maximum burns, more fuel, shorter trip, less zero-g but more fuel cost.',
          'Quest cards show profile-aware estimates so you can make informed decisions.',
        ],
      },
      {
        heading: 'G-Force',
        paragraphs: [
          'During burns, crew experience g-force proportional to engine thrust. This provides partial protection from zero-g exposure.',
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
          'Oxygen is tracked as an emergent resource: generated by equipment, consumed by crew. Managing the balance is critical for survival.',
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
          'Ships carry equipment in slots that provide various capabilities. Equipment degrades during operation and must be maintained by engineer crew.',
        ],
      },
      {
        heading: 'Equipment Categories',
        paragraphs: [''],
        table: {
          headers: ['Category', 'Purpose', 'Examples'],
          rows: [
            [
              'Life Support',
              'Atmosphere and air quality',
              'Life Support System, Air Filtration Unit',
            ],
            ['Shielding', 'Radiation protection', 'Radiation Shielding Panel'],
            [
              'Thermal',
              'Heat dissipation',
              'Radiator Array, Active Coolant System',
            ],
            [
              'Defense',
              'Combat and debris protection',
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
              'Zero-g countermeasures',
              'Exercise Module, Centrifuge Pod',
            ],
          ],
        },
      },
      {
        heading: 'Slot Types',
        paragraphs: [
          'Standard slots accept most equipment. Structural slots accept both standard equipment and large structural items like centrifuges.',
          'Higher-class ships have more equipment slots and more structural slots, but they also NEED more equipment (shielding, thermal, containment) just to operate safely — an "equipment tax."',
        ],
      },
      {
        heading: 'Degradation & Repair',
        paragraphs: [
          'Equipment degrades during use. Life support filters wear down, shielding absorbs radiation, thermal radiators work harder.',
          'Engineers assigned to repair job slots generate repair points that restore equipment condition. Keeping engineers on repair duty is essential on long voyages.',
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
              'Improves combat attack score',
            ],
            [
              'Tools',
              'Toolkit (1,200 cr), Medkit (1,500 cr), Scanner (2,000 cr)',
              'Improves role effectiveness',
            ],
            [
              'Accessories',
              'Rebreather (600 cr), Wrist Terminal (450 cr)',
              'Various utility bonuses',
            ],
            [
              'Armor',
              'Ballistic Vest (2,200 cr)',
              'Improves defense in combat',
            ],
            [
              'Gravity',
              'G-Seat Harness (3,500 cr)',
              '30% reduction in zero-g exposure',
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
          'Locations provide different services: refueling, hiring, trade, and repair. Planning your route to hit needed services is key to efficient operations.',
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
          'Before departure, your navigator plots a course. Navigation quality depends on navigator skill and equipment.',
          'Good navigation reduces debris encounters, improves fuel efficiency, and gives better hazard warnings.',
          'Locations shown as unreachable are beyond your current fuel range at the selected flight profile.',
        ],
      },
    ],
    relatedArticles: ['flight-physics', 'encounters', 'factions', 'contracts'],
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
          'During flight, your ship may encounter pirates. Encounter probability depends on your position, engine heat signature, and crew skills.',
        ],
      },
      {
        heading: 'Combat Pipeline',
        paragraphs: [
          'Encounters are auto-resolved through a pipeline: Evade (navigator skill) > Negotiate (charisma) > Flee (if outmatched) > Combat > Outcome.',
          'Possible outcomes: Evasion (clean escape), Negotiation (pay ransom), Fled (emergency escape with minor damage), Victory (bounty reward), Harassment (minor damage), Boarding (major losses).',
        ],
      },
      {
        heading: 'Defense Score',
        paragraphs: [
          'Your defense score comes from: point defense equipment (PD lasers, flak turrets), deflector shields, crew weapons (armory strength), and ship mass.',
          'Equipping your ship with defense equipment and arming your crew improves combat outcomes.',
        ],
      },
      {
        heading: 'Threat Levels',
        paragraphs: [
          'Routes have threat levels based on distance from Terran Alliance space and proximity to lawless zones.',
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
          'Pirate attack strength varies by ±30% and defense effectiveness by ±15%, ensuring borderline fights are unpredictable. Even well-defended ships can have bad luck.',
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
          'Three major factions shape the game world. Their influence determines quest availability, regional security, and trading opportunities.',
        ],
      },
      {
        heading: 'Terran Alliance',
        paragraphs: [
          'The dominant political entity controlling Earth and nearby stations. Space near Terran Alliance territory is the safest, with the lowest encounter rates.',
          'Provides structured contracts and reliable services at its stations.',
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
          'Offers unique contracts and goods not available from other factions.',
        ],
      },
    ],
    relatedArticles: ['navigation', 'encounters', 'contracts'],
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
          'As exposure accumulates, crew suffer progressive strength reduction that impacts combat effectiveness.',
        ],
        table: {
          headers: ['Tier', 'Exposure', 'Strength Penalty'],
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
          'Several equipment options reduce or eliminate zero-g exposure accumulation. All modifiers stack multiplicatively.',
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
          'Long-haul fusion ships need gravity solutions (centrifuge pod or rotating habitat) or their crew will suffer serious combat penalties.',
          'Shorter trips can skip gravity equipment if recovery time is planned between voyages.',
          'A mix of exercise modules and g-seat harnesses reduces the rate to 35% of normal — still accumulating but much slower.',
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
          'All drives above chemical emit radiation proportional to their power output. On Class III fusion vessels ("torch ships"), radiation management is a critical concern.',
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
          'Radiation Shielding Panels reduce crew exposure. Shielding equipment consumes equipment slots and power — a direct tax on ship capability.',
          'Keeping the reactor room staffed with engineers maintains containment integrity, preventing dangerous radiation spikes.',
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
          'Fusion and advanced fusion drives produce enormous waste heat that must be radiated away. Insufficient thermal management causes accelerated degradation of all ship equipment.',
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
          'Monitor thermal status on the Ship tab. Assign engineers to repair duty to maintain thermal equipment condition.',
          'On long voyages, thermal management is a constant concern — not a set-and-forget system.',
        ],
      },
    ],
    relatedArticles: ['radiation', 'ship-equipment', 'engines', 'ship-classes'],
  },
];
