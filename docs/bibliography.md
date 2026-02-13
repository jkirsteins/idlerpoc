# Bibliography & Design References

External sources, reference games, and industry data cited during design research.

---

## Idle Game Design Theory

### Kongregate — The Math of Idle Games (Anthony Pecorella)

Three-part series establishing the mathematical foundations of idle/incremental game design. Covers broad vs. deep generator models, prestige loop mathematics (fractional exponent on lifetime earnings), and pacing curves.

- Part I: https://blog.kongregate.com/the-math-of-idle-games-part-i/
- Part II: https://blog.kongregate.com/the-math-of-idle-games-part-ii/
- Part III: https://blog.kongregate.com/the-math-of-idle-games-part-iii/

### GDC Vault — Idle Games: The Mechanics and Monetization

- https://gdcvault.com/play/1022065/Idle-Games-The-Mechanics-and

### GDC Vault — Quest for Progress: The Math of Idle Games

- https://www.gdcvault.com/play/1023876/Quest-for-Progress-The-Math

### Eric Guan — Idle Game Design Principles (Substack)

Introduces the "reengagement clock" framework: different production units should have different cycle lengths, allowing players to self-optimize toward their natural engagement frequency.

- https://ericguan.substack.com/p/idle-game-design-principles

### Adrian Crook — Passive Resource Systems in Idle Games

Analyzes production caps, premium boost ratios (2-5x standard), and multi-currency retention effects (+30% retention over single-currency).

- https://adriancrook.com/passive-resource-systems-in-idle-games/

### SubtleZungle — From Taps to Tactics: 6 Core Systems

Argues that idle game depth comes from system interdependence, not feature volume.

- https://subtlezungle.substack.com/p/6-core-systems-that-make-or-break

### Machinations.io — How to Design Idle Games

- https://machinations.io/articles/idle-games-and-how-to-design-them

### The Mind Studios — Idle Clicker Game Design and Monetization

- https://games.themindstudios.com/post/idle-clicker-game-design-and-monetization/

---

## Hero Placement & Adjacency Systems

### Idle Champions of the Forgotten Realms — Formation Strategy

Champions provide adjacency-based buffs that stack multiplicatively. The optimal formation funnels all multipliers onto a single DPS carry.

- Formation Strategy Wiki: https://idlechampions.fandom.com/wiki/Formation_strategy
- Optimal Formations Guide (Steam): https://steamcommunity.com/sharedfiles/filedetails/?l=german&id=1319319295

### Idle Heroes — Faction Aura System

Faction-based team composition buffs (e.g. Shadow: +20% armor break + health; Rainbow: bonuses for faction diversity).

- https://game-maps.com/Idle-Heroes/Idle-Heroes-Auras.asp

### Idle Hero TD — Synergy-Driven Placement

Hero synergies require physical adjacency. Meta shifts with progression.

- Steam: https://store.steampowered.com/app/2897580/Idle_Hero_TD__Tower_Defense/
- Community Tools: https://www.idleherotdtools.com/

---

## Flagship & Mothership Mechanics

### Idle Planet Miner — Mothership Rooms

Persistent mothership as a meta-progression layer. Mothership rooms are purchased with prestige currency and provide multiplicative bonuses that stack with all other systems.

- Mothership Rooms Guide: https://gameplay.tips/guides/idle-planet-miner-mothership-rooms-guide.html
- Strategy Guide: https://idle-planet-miner.fandom.com/wiki/Strategy_Guide

### Idle Armada — The Anti-Pattern

The mothership becomes completely obsolete. While fleet ships deal 600+ damage, the mothership deals ~38. No scaling, no fleet-wide aura, no morale buff. A flagship that doesn't scale alongside the fleet becomes dead weight.

- Steam Discussions: https://steamcommunity.com/app/1408060/discussions/0/2850173019339827231/

### Unnamed Space Idle (USI) — Layered Capital Ship Progression

Capital ships unlock at a milestone, introducing unique slot types and hangars that spawn autonomous fighters. Player complaint: fleet resources feel isolated from other systems — fleet systems must feed back bidirectionally.

- Capital Gameplay: https://spaceidle.game-vault.net/wiki/Capital_Gameplay
- Fleet System: https://spaceidle.game-vault.net/wiki/Fleet
- Ship Configuration Guide: https://spaceidle.game-vault.net/wiki/Guide:Ship_Configuration
- Fleet Discussions: https://steamcommunity.com/app/2471100/discussions/0/600785168536573157/

### SPACEPLAN — Single Flagship as Entire Game

The player's satellite IS the game. All upgrades performed on one central unit.

- CrazyGames: https://www.crazygames.com/game/spaceplan/

---

## Fleet Commander & Crew Leadership Systems

### Star Trek Fleet Command — Fleet Commander Buffs

Command Center building with limited slots for Fleet Commanders. Ships must be docked to change commander assignments — friction cost to respeccing.

- https://scopely.helpshift.com/hc/en/19-star-trek-fleet-command/faq/7128-fleet-commanders-and-command-center/

### Star Valor — Tactician Fleet Role

Fleet ships gain Tactician bonuses including: Acceleration, Damage Resistance, Weapon Damage, Shield, Armor, Energy Generation, HP Regen, and Fleet Commander points.

- https://star-valor.fandom.com/wiki/Player_Fleets

### Barotrauma — Captain Presence as Crew Buff

The Captain class provides direct leadership mechanics: Commander Perk grants damage resistance + skill bonuses to ordered crew; Leading By Example applies "High Morale" buff to entire crew.

- https://steamcommunity.com/app/602960/discussions/1/3160958175978703765/

---

## Active vs. Passive Income Design

### Realm Grinder — Faction-Based Active/Idle Split

Good factions reward clicking/active play; Evil factions reward idling (Undead has offline bonuses). Players self-select playstyle by choosing faction.

- https://realm-grinder.fandom.com/wiki/Factions

### AdVenture Capitalist — Angel Investors & Managers

Managers enable fully passive income. Angel Investors provide 2% multiplicative bonus per angel on all profits. Active optimization is choosing WHEN to prestige and WHICH upgrades to buy.

- Angel Investors: https://adventure-capitalist.fandom.com/wiki/Angel_Investors
- Managers: https://adventure-capitalist.fandom.com/wiki/Managers

### Cell: Idle Factory Incremental (CIFI) — Ship Evolution

Winner of r/incremental_games Best Mobile Incremental Game 2023-2025. Ships have Rank, Installs (point allocation), and Crew (limited capacity requiring evolution).

- Ships Wiki: https://cifi.fandom.com/wiki/Ships
- Beginner Guide: https://cifi.game-vault.net/wiki/Guide:Beginners_Guide
- Ship Evolution Guide: https://theidlegamer.com/cifi-ship-evolution-guide-costs-and-bonuses/

---

## Equipment & Loadout Optimization

### NGU Idle — Equipment Loadout System

16 accessory slots with loadout profiles optimized for different activities. Multiplicative stacking makes even small bonuses significant. Set bonuses require all pieces maxed.

- Inventory Guide: https://sayolove.github.io/ngu-guide/en/mechanics/inventory/
- Gear Optimizer Guide: https://sayolove.github.io/ngu-guide/en/guides/go-guide/

---

## Reference Games by Training Model

### Coupled ("Learn by Doing")

Games where skills improve by performing associated activities.

- **RuneScape** — Mine ore to train Mining, cook food to train Cooking. Classic coupled skill system.
- **Melvor Idle** — Idle variant of the RuneScape model. Skills 1-99 follow a curve where the last 8 levels (92-99) take as long as levels 1-92 combined. Full completion: ~3,000+ hours.
- **Skyrim** — Skills improve through use. Heavy Armor levels up by taking hits while wearing heavy armor.
- **Idle Skilling** — Idle game with skill-by-doing progression.

### Decoupled ("Passive Queue / Time-Based")

Games where skills train via a real-time queue independent of gameplay activities.

- **EVE Online** — Pure time-based skill queue. CCP identified skill training as "one of the big roadblocks preventing new player retention." CCP also acknowledged "people were a lot more patient 22 years ago." EVE earned the nickname "Skill Queue Online" because many players' primary interaction was checking their queue.
- **OGame** — Time-based research and building queues.
- **Torn City** — Real-time stat training independent of gameplay.

### Hybrid (Both)

Games combining activity-based and point/queue-based progression.

- **Starfield** — Skill points from leveling + usage challenges to unlock ranks.
- **Fable** — Typed XP from combat styles + general XP pool for allocation.
- **Idling to Rule the Gods** — Passive queue + clone automation for skill training.
- **Star Wars Combine** — 42 skill points allocated at creation (front-loaded), then XP from activities → level up → 1 freely allocatable point. System is heavily front-loaded; ongoing level-up gains are marginal compared to initial allocation.

---

## Idle Game Industry Data

### Session Patterns

- Average idle game session: ~8 minutes
- Average check-ins per day: 5.3
- Total daily engagement: ~42 minutes

### Retention Benchmarks

- Day 1 retention (top 25%): 42%
- Day 7: 10-15%
- Day 28: 5-10%
- 80% of mobile players abandon within the first week

### Engagement Decay Principle

Ideal pacing matches the player's natural attention curve. Multiple resource systems should operate at different time scales:

- Clock A caps every ~20 minutes (short check-in reward)
- Clock B caps every ~5 hours (lunch/dinner check-in)
- Clock C caps every ~2 days (weekly planning layer)

### What Kills Retention

1. Hitting a wall with no visible path forward
2. Punishing absence (losing progress while away)
3. Tedious mechanics that feel like wasted time
4. Number novelty wearing off without new systems to discover

### What Sustains Retention Over Months

1. Multiple interacting systems requiring strategic rebalancing
2. New mechanics "unfolding" over time (not just bigger numbers)
3. Offline progress creating anticipation to return
4. Always having a visible "next goal" within reach
