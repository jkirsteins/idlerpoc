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

## Other Known Gaps

- **Equipment Repair at Stations**: Degraded equipment cannot currently be repaired.
- **XP Earning During Gameplay**: XP is only awarded at game creation. Need XP rewards for missions, combat, etc.
- **Morale System**: Morale exists but has no game effects yet.
- **Health Recovery Mechanic**: Health can decrease but has no recovery system.
- **Ship Unlocking**: All ships except Station Keeper are locked. Need unlock progression system.
- **Cargo Weight Estimation**: Currently hardcoded `* 100`. Need proper cargo weight tracking.
- **Cargo Space Limit**: Currently hardcoded `maxSpace = 20`. Should use ship cargo capacity.
- **Class IV/V Ships**: Ship classes defined in WORLDRULES.md but not implemented.
- **Remove Debug Console Logs**: Clean up `console.log` statements throughout codebase.
