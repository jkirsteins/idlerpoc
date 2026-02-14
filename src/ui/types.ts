import type { CrewEquipmentId, EquipmentId, OreId, SkillId } from '../models';

/**
 * Shared UI types extracted to break circular dependencies
 * between renderer, tabbedView, sidebars, and crewTab.
 */

export type PlayingTab =
  | 'ship'
  | 'station'
  | 'crew'
  | 'work'
  | 'nav'
  | 'fleet'
  | 'finances'
  | 'log'
  | 'guide'
  | 'settings';

export interface TabbedViewCallbacks {
  onReset: () => void;
  onTabChange: (tab: PlayingTab) => void;
  onJobAssign: (crewId: string, jobSlotId: string) => void;
  onJobUnassign: (crewId: string) => void;
  onAutoAssignCrew: () => void;
  onUndock: () => void;
  onDock: () => void;
  onEngineOn: () => void;
  onEngineOff: () => void;
  onToggleNavigation: () => void;
  onSelectCrew: (crewId: string) => void;
  onEquipItem: (crewId: string, itemId: string) => void;
  onUnequipItem: (crewId: string, itemId: string) => void;
  onAcceptQuest: (questId: string) => void;
  onAssignRoute: (questId: string) => void;
  onUnassignRoute: () => void;
  onDockAtNearestPort: () => void;
  onCancelPause: () => void;
  onRequestAbandon: () => void;
  onResumeContract: () => void;
  onAbandonContract: () => void;
  onBuyFuel: () => void;
  onStartTrip: (destinationId: string) => void;
  onHireCrew: (crewId: string) => void;
  onBuyEquipment: (equipmentId: CrewEquipmentId) => void;
  onSellEquipment: (itemId: string) => void;
  onBuyShipEquipment: (equipmentId: EquipmentId) => void;
  onSelectShip: (shipId: string) => void;
  onBuyShip: (classId: string, shipName: string) => void;
  onTransferCrew: (
    crewId: string,
    fromShipId: string,
    toShipId: string
  ) => void;
  onSpecializeCrew?: (crewId: string, skillId: SkillId) => void;
  onSellOre: (oreId: OreId, quantity: number) => void;
  onSellAllOre: () => void;
  onFlightProfileChange: () => void;
  onStartMiningRoute: (sellLocationId: string) => void;
  onCancelMiningRoute: () => void;
  onSelectMiningOre: (oreId: string | null) => void;
  onSpendPoolXp?: (crewId: string, skillId: SkillId, itemId: string) => void;
  onImportState?: (json: string) => void;
}
