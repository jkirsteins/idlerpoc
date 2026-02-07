# Main guiding principle

The game is composed of many interacting systems, and the game state should be emergent from the behavior of those systems. Nothing should be hardcoded.

E.g. space ship range is derived from engines generating thrust, consuming fuel, mass on the ships the engines are powered etc. Space ship range would NOT be acceptable to hardcode on a ship as a single numeric value.

Similarly, all game updates need to happen in some central "update tick" method. All systems need to be updated with every tick.

# Additional rules

- Consult README for project scope before starting work.
- Always consider WORLDRULES.md for our game world constraints. Apply these to any game design decisions.
- Update README to reflect project goals/scope before commits.
- README: high-level only. Infer architecture from code; detailed docs go in docs/.
- Commit messages: concise, no "Claude Code" mentions.
- Never implement any migration code unless asked. For a proof of concept we should just reset the game state when making incompatible changes.
- "tick" is a implementation term, and should not appear in the game UI ever. Instead of "tick" convert it to terms like days, months, years, etc.
- Maintain BACKLOG.md: add deferred ideas during design discussions, remove items when implemented.
