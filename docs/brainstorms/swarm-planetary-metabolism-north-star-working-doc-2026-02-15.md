# Swarm Planetary Atmosphere and Resource Metabolism -- Engineering North Star Prompt

> Working document imported on 2026-02-15.
>
> Source: `/Users/janiskirsteins/Downloads/swarm_planetary_metabolism_north_star.md`
>
> Status: Working draft / brainstorm reference.

## Purpose

This document defines the foundational simulation model for:

- Emergent planetary atmosphere
- Zone-driven atmospheric evolution
- Swarm carbon, nutrient, and energy metabolism
- Terraforming through swarm activity

This is a north star specification, not a rigid implementation contract.

Engineers should preserve these principles while retaining flexibility
in implementation.

---

# Principle 1: Planetary Stats Are Emergent From Zones

Planet-level atmosphere and pressure are derived from zone
contributions.

Planet properties must NOT be stored as static values.

Instead, compute from zones:

    planet.atmosphericMass =
        sum(zone.atmosphericMass)

    planet.pressure =
        planet.atmosphericMass * pressureNormalizationFactor

    planet.composition[gas] =
        sum(zone.atmosphericMass * zone.gasFraction[gas])
        / planet.atmosphericMass

Atmosphere emerges from zone state.

Terraforming naturally changes planet atmosphere.

---

# Principle 2: Zones Define Atmospheric Contributions

Each zone has:

    zone.atmosphericMass: number

    zone.gasFraction = {
        N2: number
        CO2: number
        O2: number
        CH4: number
        inert: number
    }

Gas fractions sum to 1.0.

Initially defined by planet generation.

After swarm conquest, gas fractions change to swarm-regulated profile.

---

# Principle 3: Atmospheric Pressure Is Emergent

Pressure is derived from atmospheric mass.

Zones may contribute different atmospheric mass based on:

- elevation
- temperature
- atmospheric collapse
- swarm regulation

Planet pressure evolves as zones are terraformed.

---

# Principle 4: Planet UI Displays Derived Atmosphere

Planet UI must display:

- pressure
- atmospheric composition
- atmospheric stability (optional)

These values must be computed from zones.

Not stored independently.

---

# Principle 5: Biomass Is Primary Early Resource Input

Workers gather biomass.

Biomass represents organic material containing:

- carbon
- energy
- nutrients

Workers deliver biomass to Queen.

---

# Principle 6: Queen Performs Metabolic Conversion

Queen maintains internal storage:

    queen.biomassPool
    queen.carbonPool
    queen.energyPool
    queen.nutrientPool

Queen converts biomass into usable components:

    carbonPool += biomass * carbonYield
    energyPool += biomass * energyYield
    nutrientPool += biomass * nutrientYield

This models biological metabolism.

---

# Principle 7: Alien Creation Requires Three Inputs

To produce new organisms, Queen must expend:

- carbon (structure)
- energy (assembly)
- nutrients (trace biochemical components)

Example:

    workerCost = {
        carbon: number
        energy: number
        nutrients: number
    }

This ensures biologically grounded growth constraints.

---

# Principle 8: Biomass Initially Feeds All Resource Pools

Early game:

Single worker job gathers biomass.

Biomass is metabolized into:

- carbon
- energy
- nutrients

No separate gathering required initially.

Later evolution unlocks specialized acquisition.

---

# Principle 9: Later Evolution Unlocks Alternative Acquisition

Examples:

Atmospheric carbon fixation -> increases carbonPool

Mineral nutrient extraction -> increases nutrientPool

Energy harvesting organisms -> increases energyPool

This allows expansion into low-biomass environments.

---

# Principle 10: Terraforming Is Emergent From Zone Control

Swarm-controlled zones gradually replace atmospheric composition.

Example swarm atmospheric profile:

    N2: 85-95%
    CO2: 1-5%
    CH4: 0-10%
    O2: trace

This represents biological atmospheric regulation.

Atmosphere evolves continuously as swarm expands.

---

# Principle 11: Different Planets Have Different Atmospheric Rules

Planet generation defines:

- initial atmospheric composition
- atmospheric mass
- carbon availability
- nutrient availability

Terraforming response may differ by planet.

Some planets resist atmospheric change.

Others change rapidly.

This creates planetary diversity.

---

# Principle 12: Atmosphere Is Resource Source, Not Absolute Requirement

Swarm requires:

- carbon
- energy
- nutrients

Atmosphere may provide carbon.

If atmospheric carbon is low:

Swarm extracts carbon from minerals or biomass.

Atmosphere affects efficiency and growth rate.

Not immediate survival.

---

# Engineering Documentation Guidance

Engineers should:

- model resource flows explicitly
- compute planetary properties from zones
- avoid static planetary stats
- document emergent systems clearly

Avoid hardcoding outcomes.

Preserve emergence.

---

# North Star Vision

Planets are not consumed.

Planets are metabolized.

Zone control reshapes planetary atmosphere.

Planet becomes biological infrastructure.

All planetary state emerges from swarm interaction with zones.
