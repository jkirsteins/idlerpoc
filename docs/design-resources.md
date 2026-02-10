# Design Resources

Research and references that informed game design decisions.

## Idle Game Progression & Mathematics

- **[The Math of Idle Games, Part I](https://blog.kongregate.com/the-math-of-idle-games-part-i/)** — Kongregate (Anthony Pecorella). Core exponential cost formula (`cost_base * rate_growth^owned`), why exponential costs paired with polynomial production creates the right pacing. Spreadsheet models included.
- **[The Math of Idle Games, Part II](https://blog.kongregate.com/the-math-of-idle-games-part-ii/)** — Derivative-based growth chains, sub-exponential production systems.
- **[The Math of Idle Games, Part III](https://blog.kongregate.com/the-math-of-idle-games-part-iii/)** — Prestige systems, diminishing-returns formulas for prestige currency (exponent 0.5-0.8), "bumpy" pacing via alternating slow/fast phases. Flat prestige curves nudge toward active play.
- **[The Math Behind Idle Games](https://gameanalytics.com/blog/idle-game-mathematics/)** — GameAnalytics summary of Kongregate's research with retention benchmarks.

## Idle Game Design Principles

- **[Idle Game Design Principles](https://ericguan.substack.com/p/idle-game-design-principles)** — Eric Guan. Psychophysics of progression perception (Weber's Law): humans perceive on logarithmic scales, so growth must be exponential to feel linear. "Numbers going up" hits less hard once you're acclimated to a higher baseline.
- **[How to design idle games](https://machinations.io/articles/idle-games-and-how-to-design-them)** — Machinations.io. Progression curve maps to engagement phases: Hook (0-30 min), Habit (1-7 days), Hobby (weeks-months). Reward calibration is critical — too few rewards and users churn, too many and resources feel devalued.
- **[Idle Games Best Practices](https://gridinc.co.za/blog/idle-games-best-practices)** — GridInc. Compounding progress, tight loops, and systems that scale in background while pulling player forward. Every top idle game is built around these.

## Retention & Engagement

- **[How to Keep Players Engaged in Your Idle Game](https://www.gameanalytics.com/blog/how-to-keep-players-engaged-and-coming-back-to-your-idle-game)** — GameAnalytics. D1 retention benchmarks: top 10% = 45.55%, top 25% = 39.40%. Offline income with caps as retention driver. Core loop: Action -> Reward -> Investment.
- **[How To Increase Engagement and Monetization in Idle Games](https://www.gamigion.com/idle/)** — Gamigion. 60/40 rule: ~60% progress from idle mechanics, ~40% from active engagement. Three engagement phases with specific design strategies per phase.
- **[Exploring Engagement in Idle Game Design](https://www.researchgate.net/publication/383510819_Exploring_Engagement_in_Idle_Game_Design)** — Academic study analyzing 66 idle games. Idle games move players from playing to planning; engagement as habit formation.
- **[Busy doing nothing? What do players do in idle games?](https://www.sciencedirect.com/science/article/abs/pii/S1071581918305251)** — Alharthi et al. Large-scale study (N=1,972) on Neko Atsume. Engagement characteristics: time spent, direct sociability, social media sociability, checking frequency.
- **[How to Make an Idle Game](https://apptrove.com/how-to-make-an-idle-game/)** — Apptrove. Layered complexity: simple core loop with complex meta loop. Late-game slowdowns often caused by UI/tutorial failures rather than actual balance issues.

## Diminishing Returns & Balancing

- **[When is it good to have diminishing returns in player progression?](https://askagamedev.tumblr.com/post/698737730887221248/when-is-good-to-have-diminishing-returns-in-player)** — Ask a Game Dev. Diminishing returns keep incentives to chase new content; logarithmic relationships can be discouraging if not counterbalanced by new systems.
- **[Diminishing Returns for Balance](https://tvtropes.org/pmwiki/pmwiki.php/Main/DiminishingReturnsForBalance)** — TV Tropes. Survey of how games implement diminishing returns across genres.
- **[The Mathematics of Game Balance](https://blog.userwise.io/blog/the-mathematics-of-game-balance)** — UserWise. Logarithmic vs exponential relationships; percentage increases compound.

## RPG Progression Curves

- **[GameDesign Math: RPG Level-based Progression](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)** — Davide Aversa. Comparison of linear, polynomial, and exponential XP curves with tradeoffs. Fibonacci-style curves produce smooth progression ratios.
- **[Melvor Idle Experience Table](https://wiki.melvoridle.com/w/Experience_Table)** — Melvor Idle (RuneScape-style). Exponential XP curve where level 92 = half of level 99. Max skill (level 120) at ~104M XP. Benchmark: single skill takes 1-2 real months of idle play to max.
- **[Clicker Games: Technical Exploration](https://medium.com/@tommcfly2025/clicker-games-a-technical-exploration-of-incremental-system-architecture-b6d842e6963e)** — Cost growth rates of 1.07-1.15 per level as the standard. Production growth must be sub-exponential to maintain pacing tension.

## Melvor Idle: Mastery System & Long-Term Engagement

- **[Mastery - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Mastery)** — Complete reference for Melvor's mastery system. Three-layer progression: skill level (gates access), per-item mastery level (improves efficiency), and mastery pool (skill-wide passive bonuses at 10/25/50/95% checkpoints). The pool creates spend-vs-maintain tension: spending pool XP boosts lagging items but risks losing checkpoint bonuses.
- **[Pets - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Pets)** — Probabilistic milestone system. Each skill has a pet with permanent passive bonuses, earned randomly while training. Drop chance scales with virtual level and action time. Creates surprise rewards at unpredictable intervals.
- **[Woodcutting - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Woodcutting)** — Example of per-item mastery: each tree type has independent mastery 0-99. Every 10 mastery levels = +5% double logs for that tree. Skill level 99 is surface completion; full item mastery is the real long-term goal.
- **[Cooking - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Cooking)** — Artisan skill mastery example: per-recipe mastery reduces burn chance and grants resource preservation/doubling at high levels. At mastery 85: 20% preservation + 20% double output.
- **[Mining - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Mining)** — Gathering skill mastery example: each ore's mastery level adds +1 HP to the rock (more mines before respawn). Different bonus pattern than woodcutting demonstrates skill-specific mastery design.
- **[Fishing - Melvor Idle Wiki](https://wiki.melvoridle.com/w/Fishing)** — Per-fish mastery reduces junk catch rate; at mastery 65 = 0% junk for that fish. Mastery pool 25% checkpoint eliminates junk globally.

### Key Design Patterns from Melvor

1. **Depth-within-breadth**: Skill level gates what you can do; item mastery determines how well you do it. Turns one skill into N parallel mastery grinds.
2. **Three simultaneous XP streams**: Every action generates skill XP + item mastery XP + 25% of mastery XP flows to pool. No action is ever wasted.
3. **Losable checkpoints**: Pool checkpoints deactivate if pool drops below threshold. Creates ongoing maintenance motivation even for "completed" skills.
4. **Spend-vs-maintain tension**: Pool XP can be spent to boost lagging items, but spending risks losing checkpoint bonuses. Genuine strategic decision.
5. **Cross-skill priority**: Firemaking's 95% checkpoint (+5% global mastery XP) means the order you complete skills matters, adding meta-progression.
6. **Completionist framing**: Reaching skill level 99 is ~10-20% of total completion. Full item mastery + pool checkpoints + pets + unique items multiplies engagement duration 5-10x.

## Difficulty & Monetization Research

- **[Personalized game design for improved user retention and monetization](https://www.sciencedirect.com/science/article/abs/pii/S0167811625000060)** — ScienceDirect. Large-scale RCT (300K+ players, 12 weeks): lower difficulty increases both engagement and long-term retention, resulting in higher total spending despite fewer per-round purchases.

## Key Takeaways Applied to This Game

1. **Power-law diminishing returns** for skill training (not exponential). Keeps passive progress visible on progress bars between check-ins, matching the 60/40 idle-to-active ratio.
2. **Anchor points mapped to engagement phases**: skill 5 at ~5 min (Hook), skill 50 at ~5 days (Habit-to-Hobby transition), Master at ~2 months (deep Hobby).
3. **Event gains as active-play reward**: flat skill gains from encounters and contracts become proportionally more valuable at high levels, creating the active-play incentive without making passive training feel pointless.
4. **Specialization as soft prestige**: at skill 50, locking in +50% training speed creates a prestige-like "breakthrough" moment that re-accelerates progression in one skill.
