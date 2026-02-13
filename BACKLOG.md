# Backlog

This file tracks deferred features and known gaps that are not currently prioritized for implementation.

## Captain Flagship System

Full design in `docs/captain-flagship-design.md`.

- ~~**Captain Presence Multiplier (Phase 1)**~~: **DONE** — Captain's skills provide ship-wide multipliers: Commerce (+1%/point income), Piloting (+0.5%/point evasion), Mining (+1%/point yield). Acting captain fallback at 25%. Command bar, fleet badges, quest card bonus lines, and capabilities panel all surface the bonus. See `src/captainBonus.ts`.
- **Morale System Activation (Phase 2)**: Wire up the existing unused `morale` field. Captain presence stabilizes morale; absence causes drift and eventual desertion. High morale → +15% training speed, +10% combat defense. Low morale → penalties and desertion risk.
- ~~**Captain-Only Encounter Outcomes (Phase 3)**~~: **DONE** — Negotiation gated behind captain presence. Ships without captain skip negotiation and must evade, fight, or flee. Captain provides +5 rally defense bonus. See `src/combatSystem.ts`.
- ~~**Fleet Coordination Aura (Phase 4)**~~: **DONE** — Captain provides +10% income/training to ships at same location, +5% one hop away (adjacent in sorted-by-distance order). Applied to contract payments, ore sales, and passive training. See `src/captainBonus.ts`.
- ~~**Training Speed Aura (Phase 5)**~~: **DONE** — Captain's ship gets 1.5× training speed for all crew aboard. Combined with fleet aura for nearby ships. See `src/skillProgression.ts`.

## Deferred Gravity System Features

- **"Juice" / Anti-Atrophy Drugs**: Consumable system needed first. Would allow temporary protection from zero-g exposure.
- **Permanent Stat/Trait Changes**: Trait system needed first. Severe/critical exposure could cause permanent degradation or special traits.
- **Equipment Install/Uninstall UI**: Currently equipment is fixed at game creation. Would need UI and balance for swapping equipment.
- **Station-Based Gravity Recovery**: Some stations (rotating habitats) could have faster recovery rates. Needs `hasGravity` flag on WorldLocation.
- **Centrifuge Degradation**: Currently centrifuge_pod doesn't degrade. Could add degradation mechanics like other equipment.
- **Medical Outcome Modifiers**: Gravity degradation could affect medical event outcomes in future medical system.
- **Childhood/Multi-Year Exposure**: Long-term exposure (years) could lock characters to low-g environments permanently.
- **Population Divergence**: Habitat ships with generations in zero-g could develop distinct populations.
- **Coriolis Discomfort**: Small-radius centrifuges could cause nausea/discomfort effects on crew morale.

## Deferred Encounter System Features (Phase B2/B3)

- **Fleet Ship Positions on Nav Map**: Show in-flight ship positions as markers on the navigation chart.
- **Convoy Protection System**: Nearby ships on similar routes reduce encounter probability.
- **Convoy Protection UI**: Display convoy status and risk reduction in navigation view and flight status.
- **Ship Readiness Summary on Quest Cards**: Show defense equipment status for CAUTION+ routes.
- **Crew Competence Display**: Show best piloting/mining/commerce skills as compact readiness line.
- **Encounter Heat Map**: Visual overlay on navigation map showing danger zones.
- **Log Entry Click-to-Expand**: Expandable log entries showing detailed encounter outcome breakdown.

## Deferred Fuel/Cargo System Features

- ~~**Fuel/Cargo Decoupling**~~: **DONE** — Each ship class has a dedicated `fuelCapacity` (kg) independent of cargo. Fuel tanks are route-targeted (sized for the ship's intended operational range). Full `cargoCapacity` is now available for trade goods, ore, and provisions. See `src/shipClasses.ts`.
- ~~**Fuel Reserve System**~~: **DONE** — Stranded ship detection warns when ships can't reach any refuel station. Soft warnings on quest cards for insufficient fuel/provisions on round trips. Auto-pause on critical alert.
- **Modular Fuel Tanks**: Purchasable tank upgrades (Extended Range Tank). Requires equipment installation UI.
- **Fuel Trading Mechanics**: Buy fuel at low prices, sell at high prices for speculation gameplay. Requires cargo system integration.
- ~~**Emergency Fuel Delivery**~~: **DONE** — Rescue quest type generated when ships are stranded. Fleet emergency broadcast appears at all locations. Rescue ship carries fuel as cargo payload; transfers on arrival. See `src/rescueSystem.ts`, `src/strandedSystem.ts`.
- **Fuel Efficiency Upgrades**: Engine modifications to reduce fuel consumption (e.g., "Optimized Nozzles" equipment).
- **Alternative Propellant Support**: Chemical bipropellant vs monopropellant, ion drives, etc. Needs fuel type system per engine.
- **Advanced Recycling Equipment**: Purchasable tiers of life support recycling (Advanced Recycler, Closed-Loop Life Support) that reduce provisions consumption further.
- **Hub Station Route Bonuses**: +10% payment for multi-leg routes using major stations as waypoints. Rewards emergent route planning.
- **Trade Route Distance Multiplier**: Scale trade route base pay by distance (120% short → 140% long). See `docs/quest-reward-balancing.md`.

## Deferred Mining Improvements

- **Track actual mining route costs in model**: Add `totalFuelCost` and `totalSalaryCost` fields to `MiningRoute` interface for accurate historical profit tracking. Currently mining profit is estimated from current ship state (crew salary rate, fuel prices). Requires save migration.

## Ship Equipment Variety (Build Differentiation)

Current ship equipment (20 items) is dominated by mandatory survival systems. "Free choice" slots have limited options for specialization. Key gaps:

### Offensive Ship Weapons

- **Ship-to-ship weapons category**: Currently zero offensive weapons exist. PD turrets and deflectors are purely reactive. Need weapons like railguns, missile launchers, torpedo systems with tiers and tradeoffs (damage/speed, range, power draw, ammo).
- **Weapon progression**: Light → Medium → Heavy tiers so combat builds can invest in firepower, not just passive defense score.
- **Weapon type tradeoffs**: High damage/slow (railgun) vs low damage/fast (autocannon), long range (missiles) vs short range (point-blank lasers). Different weapons could be more effective against different encounter types.

### Shield Tiers

- **Energy shield equipment**: Active shields with meaningful power draw tradeoffs (light/medium/heavy). Current deflectors give flat +5/+10 bonuses with no progression path.
- **Shield types**: Could differentiate kinetic vs energy vs radiation protection for build variety.

### Trade/Cargo Equipment

- **Cargo expanders**: Increase cargo capacity at the cost of equipment slots.
- **Fuel efficiency modules**: Reduce fuel consumption (overlaps with "Fuel Efficiency Upgrades" in Fuel/Cargo section).
- **Trade computers / route optimizers**: Boost commerce skill gains or improve trade route pay.
- **Smuggling compartments**: Hidden cargo space that avoids pirate seizure during boarding.

### Sensor/Scanner Progression

- **Scanner tiers**: Short/medium/long range detection upgrades (currently only one nav scanner).
- **Specialized scanners**: Mining survey scanner (boost ore detection), threat scanner (improve evasion), anomaly scanner (future exploration content).

### Crew Weapons & Armor Depth

- **Mid-tier weapons**: Gap between sidearm (3 atk) and rifle (7 atk). Could add shotgun, SMG, or energy pistol.
- **Heavy weapons**: Crew-portable heavy weapons for high-skill combatants.
- **Armor tiers**: Only 1 armor piece (ballistic vest). Need light/medium/heavy armor with weight/protection tradeoffs.
- **Specialized combat gear**: Stun grenades, breaching charges, combat drugs — items that modify boarding outcomes.

### Engine Variety (see also Engine Design below)

- Engines are in decent shape (9 types across 4 drive classes) but could benefit from more lateral choices within tiers rather than just linear upgrades.

## Engine Design

- **Slow-Start High-Efficiency Engine Type**: An engine class that trades very long warmup times (e.g., 2+ game days) for significantly better fuel efficiency once running. Creates a strategic choice: quick departure vs. fuel savings on long hauls. Would reward players who plan ahead and start warmup early. Could pair with a "pre-heat while docked" mechanic.

## Deferred Job Slot System Features

- **Repair Prioritization**: Allow players to prioritize which degraded equipment gets repair points first.
- **Job Slot Bonuses from Skill Level**: Scale ship bonuses more granularly (fuel efficiency from piloting, mining yield from mining skill, etc.).
- **Training Rooms**: Dedicated training facility room that boosts skill training rate for assigned crew.
- **Job Slot Equipment Requirements**: Some jobs could require specific crew equipment (e.g., EVA suit for external repair).
- **Shift System**: Crew fatigue from extended job assignment; rotate crew between jobs and rest.

## Deferred Skill System Features

- **Enforce Piloting Tier Requirements**: Block ship purchase/departure when no helm crew meets the piloting tier. Currently defined in skillRanks.ts but not enforced.
- **Enforce Piloting-Gated Destinations**: Prevent navigation to locations where crew piloting skill doesn't meet `pilotingRequirement`. Currently defined but not enforced in flight initialization.
- ~~**Mastery Pool Spending UI**~~: **DONE** — "+1 Lv" button on each mastery item row in Crew tab spends pool XP to boost item mastery. Shows cost, warns when spending would drop below a checkpoint.
- ~~**Mastery Pool Checkpoint Bonuses (Active)**~~: **DONE** — All checkpoint bonuses now wired into gameplay: piloting (warmup, fuel, evasion), mining (yield, wear, doubles), commerce (salary, sell price, payments), repairs (speed, filter, bonus points).
- **Item Mastery Bonuses (Active)**: Per-item mastery bonuses for routes and trade routes are defined but not applied during gameplay calculations. Mining ore mastery yield bonuses are now active.
- ~~**Mining Ore Selection UI**~~: **DONE** — Ore material picker allows selecting which ore to mine per-ship. Auto-select defaults to highest-value ore. See mining panel in Work tab.
- **Mining Equipment Slot Management**: Ship mining equipment can now be bought/upgraded at the Station Store (Ship Equipment tab). A future UI could allow selecting which equipment slot to install in, or allow uninstalling equipment to free slots.
- **Mastery Traits**: Award a permanent crew trait when reaching skill 100 (Master rank).
- **Prestige/Reset Loop**: Long-term engagement mechanic — "retire" experienced crew for permanent bonuses on future hires.
- **Event Gain Scaling**: Scale flat event gains inversely to rank bracket to prevent high-level spikiness (combat +3.0 is huge at skill 95).
- **Stronger Match Bonus**: Consider increasing SKILL_MATCH_MULTIPLIER from 1.5x to 3x to make crew assignment more impactful.

## EVA System

- **EVA (Extra-Vehicular Activity)**: Crew EVA system for outside-the-ship operations. Would enable hand-mining of specific asteroid targets, ship hull inspection/repair, cargo transfer between ships, and salvage operations. Requires EVA suit crew equipment, airlock room type, and EVA skill or EVA-related piloting checks. Could tie into mining (artisanal hand-mining of rare samples) and repair (hull patch jobs) gameplay loops.

## Deferred Spatial Model Features

- ~~**2D/3D Coordinate System**~~: **DONE** — All 13 locations have 2D circular orbital parameters. Sun-orbiting bodies (Mars, belt, Jupiter) and Earth-orbiting satellites follow circular orbits with realistic radii and periods. Distances computed dynamically each tick via `updateWorldPositions()`. See `src/orbitalMechanics.ts`.
- **Patrol Corridor System**: Define patrolled routes between major locations. Ships traveling along established corridors get reduced encounter rates; deviating into unpatrolled space increases danger. Only meaningful with 2D+ coordinates where "off-corridor" is spatially distinct from "on-corridor."
- ~~**Orbital Position Drift**~~: **DONE** — All bodies move on circular orbits each tick. Earth-Mars distance varies ~55M–400M km. Launch window alignment system classifies timing quality. See `src/orbitalMechanics.ts`, `computeLaunchWindow()`.
- ~~**Gravity Assist Corridors**~~: **DONE** — Ships detect massive bodies (Earth, Moon, Mars, Ceres, Jupiter) along their trajectory at departure. Piloting skill check at approach point; success refunds 2-10% fuel, failure costs ~1-2% correction burn. Pre-flight preview in Nav tab. Orrery shows assist markers. See `src/gravityAssistSystem.ts`.
- **Tighten Gravity Assist Thresholds**: Current influence zone thresholds are gameplay-expanded (e.g., Jupiter 75M km, Mars 3M km) for ~30-50% trigger rate. Revisit to tighten toward physically realistic Hill sphere values once the mechanic is established and player feedback is available. Consider making thresholds scale with a `gravityAssistDifficulty` setting.
- **Lagrange Point Stationkeeping Costs**: L1/L2 stations get a `stationkeepingCost` — a periodic fuel/credit drain reflecting their unstable orbital position. Surfaces as higher docking fees or occasional "drift events" where the station temporarily shifts position. L4/L5 (Trojan) stations have zero or negligible cost. Differentiates station types economically and teaches players that L-point geometry matters without any physics simulation.

## Duplicate Logic Consolidation (DONE)

All items from the original duplicate-logic audit have been resolved.
Remaining follow-up:

- ~~**Move `getFuelPricePerKg` out of `ui/refuelDialog.ts`**~~: **DONE** — Extracted to `src/fuelPricing.ts` with engine-type multipliers (Chemical 1x, Fission 3x, D-D 10x, D-He3 30x). `refuelDialog.ts` re-exports for backward compatibility.

## Bounty Hunting Mechanic

- **Bounty Hunting System**: A gameplay loop where players can accept contracts to track down and capture/eliminate specific targets. Would involve:
  - Bounty board at stations with posted contracts (target, reward, initial location hints)
  - **Investigation mechanics**: Finding the target requires following a trail of clues from station to station
    - Gathering information at each location (interviews, data searches, bribery)
    - Clues point to next location in the trail
    - Investigation skill(s) determine success rate and quality of information gathered
    - Reputation with local factions affects willingness to provide information
    - Time pressure: target may move if investigation takes too long
  - Target tracking/hunting mechanics (search, pursuit, interception)
  - **Showdown encounter**: Final confrontation once target is located (higher difficulty than random encounters)
  - Reputation system with bounty-issuing factions and local informants
  - Risk/reward scaling based on target difficulty and investigation complexity
  - Requires combat equipment, skilled crew, and investigation capabilities
  - Could tie into encounter system, combat mechanics, reputation/faction features, and potential Investigation/Charisma skills

## Deferred Provisions & Efficiency Features

- **Visual Efficiency Indicator**: Show health-based work efficiency multiplier on crew cards (e.g., "Efficiency: 71%"). Currently efficiency is applied behind the scenes but not surfaced to players directly.
- **Provisions-Aware Freight Routes**: Mining routes check provisions before departing, but freight/trade routes do not. Consider adding the same provisions check to the freight route system.
- **Starvation Morale Impact**: Starvation could also affect crew morale (field exists but is unused). Would create cascading effects: no food → low morale → desertions.

## Other Known Gaps

- ~~**Equipment Repair at Stations**~~: Resolved — repair job slots now work in all ship states (docked, in flight, orbiting).
- **Morale System**: Morale is initialized on crew members but never modified or used. No decay, recovery, or gameplay effects. Galley and rest slots reference morale in design but provide no morale effect in code.
- **Loyalty Skill Thresholds**: Three loyalty thresholds (morale decay reduction at 25, salary discount at 50, departure delay at 75) are documented in `skillRanks.ts` comments but none are implemented. Loyalty is not a current skill.
- **Additional Skills**: Astrogation, Engineering, Strength, Charisma, and Loyalty skills are designed in WORLDRULES.md but not implemented. Only Piloting, Mining, Commerce, and Repairs exist.
- **Health Recovery Mechanic**: Health can decrease; patient job slot provides in-flight recovery. Station recovery not yet implemented.
- **Ship Unlocking**: All ships except Station Keeper are locked. Need unlock progression system.
- **Cargo Weight Estimation**: Currently hardcoded `* 100`. Need proper cargo weight tracking.
- **Cargo Space Limit**: Currently hardcoded `maxSpace = 20`. Should use ship cargo capacity.
- **Class IV/V Ships**: Ship classes defined in WORLDRULES.md but not implemented.
- **Remove Debug Console Logs**: Clean up `console.log` statements throughout codebase.
- **Move `regenerateQuestsIfNewDay` into `applyTick`**: Daily quest/hiring regeneration is a simulation event (midnight world reset) but currently lives in UI orchestration (`main.ts`) and is called from three separate sites. Should move into `gameTick.ts` so it fires naturally at day boundaries. Small and large catch-up paths duplicate this call; unifying them into one batched path would remove the duplication. No gameplay impact — cosmetic/architectural only.

## Deferred Ship & Economy Features

- **Combat System**: Corsair and Phantom ship classes were removed because they depend on unimplemented combat mechanics (armory rooms, boarding actions). Reintroduce when combat loop is built.
- **Stealth System**: Phantom ship class requires stealth mechanics (reduced encounter detection, stealth engine). Deferred until encounter system supports stealth gameplay.
- **Ore-to-Fuel Conversion**: Allow mining stations to convert water ice to hydrogen fuel or refine deuterium. Would create a self-sufficient mining loop reducing dependency on station refueling.
- **Waypoint Route Chains**: Multi-leg route planning (e.g., Earth → Gateway → Meridian → Forge). Currently ships can only fly direct routes. Would enable Class II ships to reach distant destinations through refueling stops.
