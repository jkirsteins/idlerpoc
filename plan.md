# Captain Bonus — Phase 1 Implementation Plan

## Overview

Implement the **Captain Presence Multiplier** (Phase 1 from `docs/captain-flagship-design.md`) plus the required UI surfacing. This is the core incentive system that makes the captain's ship the most productive in the fleet.

The captain's skills provide multiplicative bonuses to income, mining yield, and encounter evasion **on the ship the captain is aboard**. Ships without the captain fall back to an acting captain who provides only 25% of the bonus.

---

## Step 1: Create `src/captainBonus.ts` — Pure Bonus Calculation Module

Create a new module that centralizes all captain bonus math. This keeps the logic testable and avoids scattering it across quest/mining/combat files.

**Functions to implement:**

```ts
/** Returns the captain (isCaptain) if aboard, or undefined. */
export function getCaptainOnShip(ship: Ship): CrewMember | undefined;

/** Returns the acting captain (highest commerce crew, excluding real captain). */
export function getActingCaptain(ship: Ship): CrewMember | undefined;

/** Commerce bonus: captain = 1 + commerce/100, acting = 25% of that. No captain = 0. */
export function getCommandCommerceBonus(ship: Ship): number;

/** Piloting bonus: captain = 1 + piloting/200, acting = 0. */
export function getCommandPilotingBonus(ship: Ship): number;

/** Mining bonus: captain = 1 + mining/100, acting = 0. */
export function getCommandMiningBonus(ship: Ship): number;

/** Full breakdown for UI tooltip/display. */
export interface CommandBonusBreakdown {
  hasCaptain: boolean;
  captainName: string;
  commerceBonus: number;      // e.g. 0.47 = +47%
  pilotingBonus: number;      // e.g. 0.235 = +23.5%
  miningBonus: number;        // e.g. 0.12 = +12%
  actingCaptainName?: string;
  actingCommerceBonus?: number; // what acting captain would give
}
export function getCommandBonusBreakdown(ship: Ship): CommandBonusBreakdown;

/**
 * Given a total payment (which includes the command bonus) and the ship,
 * compute how many credits the command bonus accounts for.
 * Used by quest cards to show the captain's contribution as a credit value.
 */
export function getCommandBonusCreditAttribution(
  totalPayment: number,
  ship: Ship
): number;

/**
 * What would the captain provide if transferred to this ship?
 * Looks up the captain from any ship in the fleet's GameData.
 * Used by quest cards to show the dimmed "(Captain: +X cr)" hint.
 */
export function getHypotheticalCaptainBonus(
  ship: Ship,
  gameData: GameData
): number;
```

**Design notes:**
- The `getShipCommander()` function in `models/index.ts` currently combines captain + acting captain fallback. The new functions **split** these roles so we can apply different multiplier rates (100% vs 25%).
- The existing `getCommercePaymentBonus()` in `skillRanks.ts` uses tiered brackets (0/5/10/15/20%). The design doc specifies a **continuous linear** formula (`commerce/100`). The new system replaces the tiered approach with the linear formula for the command bonus, which is more granular and rewards every skill point.
- The existing `getShipCommerceBonus()` in `questGen.ts` is the current bonus applied to payments. It will be replaced by calls to `getCommandCommerceBonus()`.

---

## Step 2: Integrate Commerce Bonus into Payment Calculations

**File: `src/questGen.ts`**

Modify `calculatePayment()` (line ~170) and `calculateTradeRoutePayment()` (line ~610):

- Replace the existing `getShipCommerceBonus(ship)` call with `getCommandCommerceBonus(ship)` from the new module.
- The old code: `const commerceBonus = getShipCommerceBonus(ship);` → `payment * (1 + crewBonus + commerceBonus)`
- The new code uses the same pattern but with the new continuous formula and the 25% acting captain reduction built in.
- Remove the now-unused `getShipCommerceBonus()` private function from `questGen.ts`.
- Keep `calculateCrewSkillBonus()` unchanged — it covers scanner/helm/drive_ops piloting bonuses that are separate from the captain command bonus.

**File: `src/contractExec.ts`**

No changes needed here — payment values are calculated at quest generation time (in `questGen.ts`) and stored on the quest. Trade route payments are also calculated by `calculateTradeRoutePayment()` which we already modify above.

**File: `src/skillRanks.ts`**

- Keep `getCommercePaymentBonus()` and `getCommerceFuelDiscount()` intact for now. The fuel discount is a separate system (applied at the refuel dialog). The old payment bonus function can be deprecated with a comment noting it's replaced by `captainBonus.ts` for quest/trade payments.

---

## Step 3: Integrate Mining Bonus

**File: `src/miningSystem.ts`**

In the `applyMiningTick()` function, where per-miner yield is calculated:

- After the existing `skillFactor` calculation, add a captain mining bonus multiplier:
  ```
  const captainMiningMultiplier = 1 + getCommandMiningBonus(ship);
  orePerTick *= captainMiningMultiplier;
  ```
- Import `getCommandMiningBonus` from `captainBonus.ts`.
- This applies the captain's mining skill as a ship-wide yield multiplier on top of each miner's individual skill factor.

---

## Step 4: Integrate Evasion Bonus

**File: `src/combatSystem.ts`**

In `attemptEvasion()` (line ~144):

- After the existing `pilotingBonus` from scanner/helm crew, add the captain's command piloting bonus:
  ```
  const commandEvasionBonus = getCommandPilotingBonus(ship) * 0.15;
  // Captain with piloting 100 → +0.5 * 0.15 = +7.5% extra evasion
  ```
- Add `commandEvasionBonus` to the total `chance`.
- This is a modest bonus (max +7.5% evasion on top of existing 65% max) that rewards having the captain aboard for dangerous routes.

---

## Step 5: Add CSS Color Class for Command Bar

**File: `src/ui/styles.css` (or wherever existing `bar-good`/`bar-warning`/`bar-danger` are defined)**

The existing `renderStatBar()` API uses CSS classes for fill colors (`bar-good` = green, `bar-warning` = yellow, `bar-danger` = red). Add two new classes:

```css
.bar-command { background: #fbbf24; }          /* Gold — captain aboard */
.bar-command-inactive { background: #6b7280; }  /* Gray — no captain */
```

---

## Step 6: Add Command Bonus Status Bar to Ship Tab

**File: `src/ui/shipTab.ts`**

Add a "Command" status bar in the status bars area, alongside Fuel, Power, Oxygen, etc.

**DOM pattern** — follows the existing slot-div leaf-helper pattern:

1. During mount (factory), create a stable slot div alongside the others:
   ```ts
   const commandBarSlot = document.createElement('div');
   // Insert after containmentBarSlot in the shipContent.append() call
   ```

2. During update (each tick), use the leaf-helper swap:
   ```ts
   if (commandBarSlot.firstChild) commandBarSlot.removeChild(commandBarSlot.firstChild);
   commandBarSlot.appendChild(renderCommandBar(gameData));
   ```

3. The `renderCommandBar()` function:
   - Calls `getCommandBonusBreakdown(ship)` from `captainBonus.ts`.
   - Uses `renderStatBar()` with:
     - `label`: `'COMMAND'`
     - `percentage`: The captain's highest skill percentage (e.g. commerce 47 → 47%). For acting captain, scale down proportionally. For no crew, 0%.
     - `colorClass`: `'bar-command'` when captain aboard, `'bar-command-inactive'` when absent.
     - `valueLabel`: `'+47% CMD'` or `'Acting +12%'` or `'No Captain'`.
     - `mode`: `'full'`
   - Attaches tooltip via `attachTooltip(bar, { content: tooltipHtml })`:
     - Captain aboard:
       ```
       Captain's Command Bonus
       ────────────────────────
       Commerce:  +47% income     (skill 47)
       Piloting:  +23% evasion    (skill 47)
       Mining:    +12% extraction  (skill 12)
       ```
     - Captain absent:
       ```
       Acting Captain: [Name]
       Commerce:  +12% income (25% of skill 48)
       No piloting or mining bonus without captain.
       ```

**Always visible** (per UI discoverability rule): shown dimmed/gray with "No Captain" even on ships without the captain or with no crew. This teaches players the system exists.

---

## Step 7: Add Command Section to Ship Capabilities Panel

**File: `src/ui/shipTab.ts`**

The capabilities panel (`renderShipStatsPanel()`) is a leaf helper rebuilt each tick via the slot pattern (`shipStatsPanelSlot`). It already has cards for Range, Acceleration, Defense, etc. Add a "Command" card.

**Implementation**: Add a new `div` inside `renderShipStatsPanel()` after the defense card:

- Call `getCommandBonusBreakdown(ship)` from `captainBonus.ts`.
- When captain is aboard:
  ```
  ── Command ──────────────
  Captain:    CPT [Name] ✦
    Commerce: +47% income
    Piloting: +23% evasion
    Mining:   +12% yield
  ```
- When captain is absent:
  ```
  ── Command ──────────────
  Acting Cpt: [Name]
    Commerce: +12% income (reduced)
    Piloting: —
    Mining:   —
  ```
- Style: use `#fbbf24` (gold) for captain values, `#888` for labels and "—" entries, `#6b7280` for acting captain values.
- The "—" entries and gray text communicate what the ship is missing without hiding the existence of the system.

Since this panel is already a leaf helper (rebuilt each tick), no special mount-once pattern needed — just add elements to the existing `renderShipStatsPanel()` function.

---

## Step 8: Add Captain Badge and Command Bonus to Fleet Panel

**File: `src/ui/fleetPanel.ts`**

The fleet panel uses a `ShipRowRefs` interface with stable element references updated via `textContent` shallow-compare. Each row's top line is: `[tierBadge] [nameSpan] [activityBadge]`.

**Changes to `ShipRowRefs`**: Add a `commandBadge: HTMLSpanElement` field.

**Changes to `createShipRow()`**: Create the command badge span and insert it between `nameSpan` and `activityBadge` on the top line:
```ts
const commandBadge = document.createElement('span');
commandBadge.className = 'fleet-row-command';
commandBadge.style.cssText = 'font-size: 0.75em; margin-left: 4px;';
topLine.appendChild(commandBadge); // before activityBadge
```

**Changes to `updateShipRow()`**: On each tick, update the badge with shallow-compare:
```ts
const hasCaptain = ship.crew.some(c => c.isCaptain);
const commandBonus = getCommandCommerceBonus(ship);
const cmdText = hasCaptain
  ? `✦ +${Math.round(commandBonus * 100)}% CMD`
  : commandBonus > 0
    ? `+${Math.round(commandBonus * 100)}% ACT`
    : '— CMD';
if (refs.commandBadge.textContent !== cmdText) {
  refs.commandBadge.textContent = cmdText;
}
refs.commandBadge.style.color = hasCaptain ? '#fbbf24' : '#6b7280';
```

The `✦` icon immediately signals which ship has the captain. The percentage shows the bonus value at a glance.

---

## Step 9: Add Captain Bonus Line to Quest Cards (Work Tab)

**File: `src/ui/workTab.ts`**

Quest cards use a `QuestCardRefs` interface with stable element references. The profit breakdown order is: fuel estimate → time → crew cost → fuel cost → **profit** → risk badge. The captain bonus lines go between fuel cost and profit.

**Changes to `QuestCardRefs`**: Add two new div refs:
```ts
captainBonusInfo: HTMLDivElement;  // "Captain bonus: +960 cr" or "Acting cpt: +240 cr"
captainHintInfo: HTMLDivElement;   // "(Captain: +960 cr)" dimmed hint — only on non-captain ships
```

**Changes to `createQuestCardRefs()`**: Create both divs and insert them in the details container after `fuelCostInfo` and before `profitInfo`:
```ts
const captainBonusInfo = document.createElement('div');
const captainHintInfo = document.createElement('div');
captainHintInfo.style.cssText = 'color: #666; font-size: 0.85em;';
details.insertBefore(captainHintInfo, profitInfo);
details.insertBefore(captainBonusInfo, captainHintInfo);
```

**Changes to `updateQuestCardRefs()`**: Compute and display the captain bonus attribution:

**Key design issue — decomposing the bonus from the baked-in payment:**

The `quest.paymentPerTrip` already includes the command commerce bonus (it's baked in during quest generation). To show the bonus as a separate line, we need to reverse-engineer the captain's contribution. Add a helper in `captainBonus.ts`:

```ts
/**
 * Given a total payment (which includes the command bonus) and the ship,
 * compute how many credits the command bonus accounts for.
 * Formula: payment includes (1 + commandBonus) as a multiplicative factor.
 * So: bonusCredits = payment - payment / (1 + commandBonus)
 */
export function getCommandBonusCreditAttribution(
  totalPayment: number,
  ship: Ship
): number;

/**
 * Hypothetical: what would the captain provide if they were on this ship?
 * Looks up the captain from any ship in the fleet.
 */
export function getHypotheticalCaptainBonus(
  ship: Ship,
  gameData: GameData
): number;
```

Then in the quest card update:
```ts
const commandBonus = getCommandCommerceBonus(ship);
const bonusCredits = getCommandBonusCreditAttribution(tripPayment, ship);
const hasCaptain = ship.crew.some(c => c.isCaptain);

if (hasCaptain && bonusCredits > 0) {
  refs.captainBonusInfo.textContent = `Captain bonus: +${bonusCredits.toLocaleString()} cr`;
  refs.captainBonusInfo.style.color = '#fbbf24'; // gold
  refs.captainBonusInfo.style.display = '';
  refs.captainHintInfo.style.display = 'none';
} else if (!hasCaptain) {
  // Show what acting captain gives
  refs.captainBonusInfo.textContent = bonusCredits > 0
    ? `Acting cpt: +${bonusCredits.toLocaleString()} cr`
    : 'No command bonus';
  refs.captainBonusInfo.style.color = '#6b7280'; // gray
  refs.captainBonusInfo.style.display = '';
  // Dimmed hint showing what the real captain would earn
  const hypothetical = getHypotheticalCaptainBonus(ship, gameData);
  if (hypothetical > 0) {
    const hypotheticalCredits = Math.round(tripPayment * hypothetical / (1 + hypothetical));
    refs.captainHintInfo.textContent = `(Captain: +${hypotheticalCredits.toLocaleString()} cr)`;
    refs.captainHintInfo.style.display = '';
  } else {
    refs.captainHintInfo.style.display = 'none';
  }
} else {
  refs.captainBonusInfo.style.display = 'none';
  refs.captainHintInfo.style.display = 'none';
}
```

This is the most powerful UI nudge — concrete credit values on every quest card showing what the captain is worth (or what the player is missing).

---

## Step 10: Update Gamepedia Articles

**File: `src/gamepediaData.ts`**

Update existing articles and add a new one:

1. **New article: `captain-command`** (category: "Crew")
   - Title: "Captain's Command Bonus"
   - Explains the command bonus system: captain provides skill-based multipliers to income, mining, and evasion.
   - Acting captain fallback at 25%.
   - Cross-references: `[[commerce-skill|Commerce]]`, `[[encounters|Encounters]]`, `[[mining|Mining]]`

2. **Update `credits-economy` article**: Mention the captain command bonus as a factor in income optimization. Link to `[[captain-command|Captain's Command Bonus]]`.

3. **Update `commerce-skill` article**: Note that the captain's commerce skill now provides a continuous linear bonus (not just tiered brackets) via the command system. Link to `[[captain-command|Captain's Command Bonus]]`.

4. **Update `encounters` article**: Mention the captain's piloting-based evasion bonus.

---

## Step 11: Write Unit Tests

**File: `src/__tests__/captainBonus.test.ts`**

Test the pure calculation functions:

- `getCaptainOnShip()`: returns captain when aboard, undefined when not
- `getActingCaptain()`: returns highest commerce crew (excluding captain)
- `getCommandCommerceBonus()`: captain at skill 0 → 0, skill 50 → 0.5, skill 100 → 1.0
- `getCommandCommerceBonus()` with acting captain: skill 50 → 0.125 (25% of 0.5)
- `getCommandMiningBonus()`: only applies when captain is aboard
- `getCommandPilotingBonus()`: only applies when captain is aboard
- `getCommandBonusBreakdown()`: returns complete breakdown for UI

Test integration points:

- Payment calculation with captain aboard vs acting captain vs no crew
- Mining yield multiplier with captain aboard vs not
- Evasion chance increase with captain aboard

---

## Step 12: Update README and BACKLOG

**File: `README.md`**

Add a bullet under Game Features:
- **Captain Command Bonus**: Captain's skills provide ship-wide multipliers — Commerce boosts income, Piloting improves evasion, Mining increases extraction. Acting captain fallback provides 25% bonus. Command bonus bar and fleet badges surface the concrete value of captain placement.

**File: `BACKLOG.md`**

- Mark Phase 1 (Captain Presence Multiplier) as implemented.
- Keep Phases 2-5 (Morale, Captain-Only Encounters, Fleet Coordination Aura, Training Speed Aura) as backlog items since they are not part of this implementation.

---

## Files Modified (Summary)

| File | Change |
|------|--------|
| `src/captainBonus.ts` | **NEW** — pure bonus calculations + credit attribution + hypothetical helpers |
| `src/questGen.ts` | Replace `getShipCommerceBonus()` with `getCommandCommerceBonus()` |
| `src/miningSystem.ts` | Add captain mining multiplier to yield formula |
| `src/combatSystem.ts` | Add captain piloting bonus to evasion chance |
| `src/ui/styles.css` | Add `.bar-command` and `.bar-command-inactive` CSS classes |
| `src/ui/shipTab.ts` | Command status bar slot + capabilities panel command card |
| `src/ui/fleetPanel.ts` | `ShipRowRefs.commandBadge` + captain `✦` icon and bonus badge |
| `src/ui/workTab.ts` | `QuestCardRefs.captainBonusInfo/captainHintInfo` + bonus credit line |
| `src/gamepediaData.ts` | New captain-command article + update existing articles |
| `src/__tests__/captainBonus.test.ts` | **NEW** — unit tests |
| `README.md` | Add captain command bonus to features list |
| `BACKLOG.md` | Mark Phase 1 complete, keep Phases 2-5 |

## No Save Migration Needed

This feature adds no new fields to the persisted `GameData` shape. All bonus calculations are derived from existing crew skill values and the `isCaptain` flag at runtime. No save version bump required.
