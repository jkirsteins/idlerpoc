# Bibliography: Idle Game Design Research

Research conducted February 2026 to inform the Captain Flagship design (`docs/captain-flagship-design.md`).

---

## Foundational Idle Game Design Theory

### Kongregate — The Math of Idle Games (Anthony Pecorella)

Three-part series establishing the mathematical foundations of idle/incremental game design. Covers broad vs. deep generator models, prestige loop mathematics (fractional exponent on lifetime earnings), and pacing curves.

- Part I: https://blog.kongregate.com/the-math-of-idle-games-part-i/
- Part II: https://blog.kongregate.com/the-math-of-idle-games-part-ii/
- Part III: https://blog.kongregate.com/the-math-of-idle-games-part-iii/

**Key takeaway for flagship design:** The layered prestige model — broad fleet expansion within a run, deep flagship upgrades as a meta-layer — is the proven pattern. Same-type bonuses stack additively; different-type bonuses stack multiplicatively.

### GDC Vault — Idle Games: The Mechanics and Monetization

Industry talk on idle game mechanics and their monetization patterns.

- https://gdcvault.com/play/1022065/Idle-Games-The-Mechanics-and

### GDC Vault — Quest for Progress: The Math of Idle Games

Follow-up GDC talk focused on mathematical progression systems.

- https://www.gdcvault.com/play/1023876/Quest-for-Progress-The-Math

### Eric Guan — Idle Game Design Principles (Substack)

Introduces the "reengagement clock" framework: different production units should have different cycle lengths, allowing players to self-optimize toward their natural engagement frequency.

- https://ericguan.substack.com/p/idle-game-design-principles

**Key takeaway for flagship design:** The captain's ship should reward frequent check-ins (assign recruits, rotate trained crew), while fleet ships run on longer autonomous cycles. Different "clock lengths" per ship type.

### Adrian Crook — Passive Resource Systems in Idle Games

Analyzes production caps, premium boost ratios (2-5x standard), and multi-currency retention effects (+30% retention over single-currency).

- https://adriancrook.com/passive-resource-systems-in-idle-games/

**Key takeaway for flagship design:** Active play multiplier over idle should be 2-5x. Captain presence bonus of 1.5-2x fits within this range without making automated ships feel useless.

### SubtleZungle — From Taps to Tactics: 6 Core Systems

Argues that idle game depth comes from system interdependence, not feature volume. "The biggest mistake new idle devs make is trying to add depth by layering new features. But volume isn't what makes an idle game compelling. It's interdependence."

- https://subtlezungle.substack.com/p/6-core-systems-that-make-or-break

**Key takeaway for flagship design:** The captain flagship system must feed back into other systems bidirectionally — captain makes fleet better, fleet earnings fund captain upgrades.

### Machinations.io — How to Design Idle Games

General framework for idle game systems design with economy modeling.

- https://machinations.io/articles/idle-games-and-how-to-design-them

### The Mind Studios — Idle Clicker Game Design and Monetization

Overview of idle game design patterns and best practices.

- https://games.themindstudios.com/post/idle-clicker-game-design-and-monetization/

---

## Hero Placement & Adjacency Systems

### Idle Champions of the Forgotten Realms — Formation Strategy

The gold standard for hero-placement idle games. Champions provide adjacency-based buffs that stack multiplicatively. The optimal formation funnels all multipliers onto a single DPS carry.

- Formation Strategy Wiki: https://idlechampions.fandom.com/wiki/Formation_strategy
- Optimal Formations Guide (Steam): https://steamcommunity.com/sharedfiles/filedetails/?l=german&id=1319319295

**Key mechanics studied:**
- **Birdsong's Song of Battle**: Increases damage of heroes within 2 slots
- **Nayeli**: Directional buffs (heroes behind her)
- **Anson (Unshakable)**: Tank-as-force-multiplier — increases damage of all Champions in columns behind him, gains stacks when attacked
- **Kyre (Pure of Soul)**: 300% buff per Good Champion in formation, multiplicative stacking; adjacency spreads the "Good" tag
- **Artemis (Observance)**: Power scales based on quality of buffs being applied to adjacent units — a direct "best unit placement" mechanic

**Key takeaway for flagship design:** The captain's presence multiplier follows the Idle Champions pattern — a leader unit whose bonuses are multiplicative and whose value scales with the quality of the asset they're placed on.

### Idle Heroes — Faction Aura System

Faction-based team composition buffs (e.g. Shadow: +20% armor break + health; Rainbow: bonuses for faction diversity).

- https://game-maps.com/Idle-Heroes/Idle-Heroes-Auras.asp

**Key takeaway:** Composition-based bonuses (fleet aura) complement leader-based bonuses (captain presence). Both patterns can coexist.

### Idle Hero TD — Synergy-Driven Placement

Hero synergies require physical adjacency. Meta shifts with progression (Druid+Arbalest optimal early; Warlord+Wizard later). Built-in presets teach new players why placement matters.

- Steam: https://store.steampowered.com/app/2897580/Idle_Hero_TD__Tower_Defense/
- Community Tools: https://www.idleherotdtools.com/

---

## Flagship & Mothership Mechanics

### Idle Planet Miner — Mothership Rooms (Best-in-Class)

The clearest example of a persistent mothership as a meta-progression layer. Mothership rooms are purchased with prestige currency and provide multiplicative bonuses that stack with all other systems.

- Mothership Rooms Guide: https://gameplay.tips/guides/idle-planet-miner-mothership-rooms-guide.html
- Strategy Guide: https://idle-planet-miner.fandom.com/wiki/Strategy_Guide

**Key rooms:** Engineering (+15% mining rate/level), Forge (+10% smelt speed/level), Lounge (increased credit gain), Laboratory (reduces project costs).

**Key takeaway for flagship design:** The mothership transforms prestige from an abstract currency into investment in a tangible, visible asset. Greedy optimization ("buy the cheapest upgrade") works by design — the system is balanced for intuitive play.

### Idle Armada — The Anti-Pattern

The mothership becomes completely obsolete. While fleet ships deal 600+ damage, the mothership deals ~38. No scaling, no fleet-wide aura, no morale buff. Players called it out as a failure: "the mothership serves no purpose."

- Steam Discussions: https://steamcommunity.com/app/1408060/discussions/0/2850173019339827231/

**Key takeaway for flagship design:** A flagship that doesn't scale alongside the fleet becomes dead weight. The captain's skill-based multiplier prevents this — as the captain trains, the bonus grows.

### Unnamed Space Idle (USI) — Layered Capital Ship Progression

Most sophisticated capital ship system found. Capital ships unlock at a milestone, introducing unique slot types and hangars that spawn autonomous fighters. Fleet system (after 5 reinforces) grants permanent upgrades across all resets.

- Capital Gameplay: https://spaceidle.game-vault.net/wiki/Capital_Gameplay
- Fleet System: https://spaceidle.game-vault.net/wiki/Fleet
- Ship Configuration Guide: https://spaceidle.game-vault.net/wiki/Guide:Ship_Configuration

**Player complaint:** Fleet resources (Astrium) feel isolated from other systems. "One of the best parts of this game is how every system directly feeds into improving all the others" but fleet progression doesn't participate in that interconnection.

- Fleet Discussions: https://steamcommunity.com/app/2471100/discussions/0/600785168536573157/

**Key takeaway for flagship design:** Fleet systems must feed back into other systems bidirectionally. Isolated progression lanes kill engagement.

### SPACEPLAN — Single Flagship as Entire Game

The player's satellite IS the game. All upgrades performed on one central unit. Includes a click multiplier that "incentivizes actually clicking through the use of an upgrade that multiplies your production while actually clicking."

- CrazyGames: https://www.crazygames.com/game/spaceplan/
- Review: https://toucharcade.com/2017/05/08/spaceplan-review-delicious-potatoes/

---

## Fleet Commander & Crew Leadership Systems

### Star Trek Fleet Command — Fleet Commander Buffs

Command Center building with limited slots for Fleet Commanders. Each commander provides unique buffs. Ships must be docked to change commander assignments — there's a cost to respeccing.

- https://scopely.helpshift.com/hc/en/19-star-trek-fleet-command/faq/7128-fleet-commanders-and-command-center/

**Key takeaway:** Commander reassignment should have a friction cost (must be docked). This is already true in our game since the captain can only transfer ships at stations.

### Star Valor — Tactician Fleet Role

Fleet ships gain Tactician bonuses including: Acceleration, Damage Resistance, Weapon Damage, Shield, Armor, Energy Generation, HP Regen, and Fleet Commander points.

- https://star-valor.fandom.com/wiki/Player_Fleets

### Barotrauma — Captain Presence as Crew Buff

The Captain class provides direct leadership mechanics:
- **Commander Perk**: Orders grant 25% physical damage resistance + 10 to all skills
- **Leading By Example**: Applies "High Morale" buff to entire crew (repair, welding, movement speed)

- https://steamcommunity.com/app/602960/discussions/1/3160958175978703765/

**Key takeaway for flagship design:** Captain presence should provide both direct combat bonuses (rally defense) and indirect crew performance bonuses (morale → training speed). Barotrauma validates this dual-path approach.

---

## Active vs. Passive Income Design

### Realm Grinder — Faction-Based Active/Idle Split

The most elegant active/idle differentiation found. Good factions reward clicking/active play; Evil factions reward idling (Undead has offline bonuses). Players self-select playstyle by choosing faction.

- https://realm-grinder.fandom.com/wiki/Factions

**Key takeaway:** Our captain placement serves a similar role to faction choice — the captain's ship is the "active" ship (higher rewards), fleet ships are the "idle" ships (lower but automatic income).

### AdVenture Capitalist — Angel Investors & Managers

Codified many active/passive patterns. Managers enable fully passive income. Angel Investors provide 2% multiplicative bonus per angel on all profits. Active optimization is choosing WHEN to prestige and WHICH upgrades to buy.

- Angel Investors: https://adventure-capitalist.fandom.com/wiki/Angel_Investors
- Managers: https://adventure-capitalist.fandom.com/wiki/Managers

### Cell: Idle Factory Incremental (CIFI) — Ship Evolution

Winner of r/incremental_games Best Mobile Incremental Game 2023-2025. Ships have Rank, Installs (point allocation), and Crew (limited capacity requiring evolution). Active layer is optimization decisions (install distribution to avoid diminishing returns), not clicking.

- Ships Wiki: https://cifi.fandom.com/wiki/Ships
- Beginner Guide: https://cifi.game-vault.net/wiki/Guide:Beginners_Guide
- Ship Evolution Guide: https://theidlegamer.com/cifi-ship-evolution-guide-costs-and-bonuses/

---

## Equipment & Loadout Optimization

### NGU Idle — Equipment Loadout System

16 accessory slots with loadout profiles optimized for different activities. Even weak items matter due to multiplicative stacking math. Set bonuses require all pieces maxed.

- Inventory Guide: https://sayolove.github.io/ngu-guide/en/mechanics/inventory/
- Gear Optimizer Guide: https://sayolove.github.io/ngu-guide/en/guides/go-guide/

**Key takeaway:** Multiplicative stacking makes even small bonuses significant. The captain's per-skill bonuses (commerce, piloting, mining) being multiplicative with each other creates meaningful diversity in which skills to train.
