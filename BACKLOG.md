# Backlog

This file tracks deferred features and known gaps that are not currently prioritized for implementation.

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
- **Convoy Protection System**: Nearby ships on similar routes reduce encounter probability (formula in phase_b.md).
- **Convoy Protection UI**: Display convoy status and risk reduction in navigation view and flight status.
- **Ship Readiness Summary on Quest Cards**: Show defense equipment status for CAUTION+ routes.
- **Crew Competence Display**: Show best navigator/gunner/charisma skills as compact readiness line.
- **Encounter Heat Map**: Visual overlay on navigation map showing danger zones.
- **Log Entry Click-to-Expand**: Expandable log entries showing detailed encounter outcome breakdown.

## Deferred Fuel/Cargo System Features

- **Manual Fuel/Cargo Allocation**: Allow players to adjust fuel/cargo split before departure. Needs slider UI, presets, and validation. See `docs/fuel-cargo-tradeoff-design.md` Option 2.
- **Fuel Reserve System**: Warn when fuel below safety threshold (e.g., 20% of route requirement). Add "Reserve Fuel Lock" toggle.
- **Modular Fuel Tanks**: Purchasable tank upgrades (Extended Range Tank, Cargo Maximizer). Requires equipment installation UI.
- **Fuel Trading Mechanics**: Buy fuel at low prices, sell at high prices for speculation gameplay. Requires cargo system integration.
- **Emergency Fuel Delivery**: Rescue mechanic for stranded ships (distress beacon, fuel cost + delivery fee). Currently ships that run dry mid-flight still complete their leg on the pre-computed trajectory — this item would add a "stranded" state with distress beacon, drift to nearest station, and rescue fee.
- **Fuel Efficiency Upgrades**: Engine modifications to reduce fuel consumption (e.g., "Optimized Nozzles" equipment).
- **Alternative Propellant Support**: Chemical bipropellant vs monopropellant, ion drives, etc. Needs fuel type system per engine.
- **Hub Station Route Bonuses**: +10% payment for multi-leg routes using major stations as waypoints. Rewards emergent route planning.
- **Standing Freight Distance Multiplier**: Increase standing freight pay multiplier for long routes (0.7x → 0.9x). See `docs/quest-economics-validation.md`.

## Engine Design

- **Slow-Start High-Efficiency Engine Type**: An engine class that trades very long warmup times (e.g., 2+ game days) for significantly better fuel efficiency once running. Creates a strategic choice: quick departure vs. fuel savings on long hauls. Would reward players who plan ahead and start warmup early. Could pair with a "pre-heat while docked" mechanic.

## Deferred Job Slot System Features

- **Repair Prioritization**: Allow players to prioritize which degraded equipment gets repair points first.
- **Job Slot Bonuses from Skill Level**: Scale ship bonuses more granularly (fuel efficiency from piloting, warmup speed from engineering, etc.).
- **Training Rooms**: Dedicated training facility room that boosts skill training rate for assigned crew.
- **Job Slot Equipment Requirements**: Some jobs could require specific crew equipment (e.g., EVA suit for external repair).
- **Shift System**: Crew fatigue from extended job assignment; rotate crew between jobs and rest.

## Deferred Skill System Features

- **Enforce Piloting Tier Requirements**: Block ship purchase/departure when no helm crew meets the piloting tier. Currently defined in skillRanks.ts but not enforced.
- **Skill Threshold Effects (non-piloting)**: Implement the remaining skill thresholds documented in `docs/skill-system.md` — charisma auto-negotiation at 75, engineering repair doubling at 75, strength bounty bonus at 75, loyalty salary discount at 50, etc.
- **Skill-Based Equipment Requirements**: Require minimum strength for heavy weapons, engineering for advanced tools.
- **Mastery Traits**: Award a permanent crew trait when reaching skill 100 (Master rank).
- **Commerce for Non-Captains**: Allow quartermaster role to earn commerce at a reduced rate.
- **Prestige/Reset Loop**: Long-term engagement mechanic — "retire" experienced crew for permanent bonuses on future hires.
- **Event Gain Scaling**: Scale flat event gains inversely to rank bracket to prevent high-level spikiness (combat +3.0 is huge at skill 95).
- **Stronger Match Bonus**: Consider increasing SKILL_MATCH_MULTIPLIER from 1.5x to 3x to make crew assignment more impactful.

## Other Known Gaps

- **Equipment Repair at Stations**: Degraded equipment cannot currently be repaired (in-flight repair now via job slots).
- **Morale System**: Morale exists but has no game effects yet.
- **Health Recovery Mechanic**: Health can decrease; patient job slot provides in-flight recovery. Station recovery not yet implemented.
- **Ship Unlocking**: All ships except Station Keeper are locked. Need unlock progression system.
- **Cargo Weight Estimation**: Currently hardcoded `* 100`. Need proper cargo weight tracking.
- **Cargo Space Limit**: Currently hardcoded `maxSpace = 20`. Should use ship cargo capacity.
- **Class IV/V Ships**: Ship classes defined in WORLDRULES.md but not implemented.
- **Remove Debug Console Logs**: Clean up `console.log` statements throughout codebase.
