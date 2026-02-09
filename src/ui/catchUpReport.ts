import type { CatchUpReport } from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';

/**
 * Render the catch-up report modal shown after a significant absence.
 * Shows general progress (credits, trips, arrivals) and encounter details.
 */
export function renderCatchUpReport(
  report: CatchUpReport,
  onDismiss: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'catchup-report';

  // Header
  const header = document.createElement('div');
  header.className = 'catchup-header';

  const title = document.createElement('h3');
  title.textContent = 'While you were away...';
  header.appendChild(title);

  const duration = document.createElement('div');
  duration.className = 'catchup-duration';
  const gameSeconds = report.totalTicks * GAME_SECONDS_PER_TICK;
  const gamePart = formatDuration(gameSeconds);
  const realPart = formatRealDuration(report.elapsedRealSeconds);
  duration.textContent = `${gamePart} (irl ${realPart}) elapsed`;
  header.appendChild(duration);

  container.appendChild(header);

  // --- General progress summary ---
  const progress = document.createElement('div');
  progress.className = 'catchup-progress';

  // Net credits change
  if (report.creditsDelta !== 0) {
    const creditLine = document.createElement('div');
    creditLine.className = 'catchup-progress-line';
    const sign = report.creditsDelta >= 0 ? '+' : '';
    creditLine.textContent = `Credits: ${sign}${report.creditsDelta.toLocaleString()}`;
    creditLine.style.color = report.creditsDelta >= 0 ? '#4ecdc4' : '#ff6b6b';
    progress.appendChild(creditLine);
  }

  // Trips completed
  if (report.tripsCompleted > 0) {
    const tripLine = document.createElement('div');
    tripLine.className = 'catchup-progress-line';
    tripLine.textContent = `${report.tripsCompleted} trip${report.tripsCompleted > 1 ? 's' : ''} completed`;
    tripLine.style.color = '#4caf50';
    progress.appendChild(tripLine);
  }

  // Contracts completed
  if (report.contractsCompleted > 0) {
    const contractLine = document.createElement('div');
    contractLine.className = 'catchup-progress-line';
    contractLine.textContent = `${report.contractsCompleted} contract${report.contractsCompleted > 1 ? 's' : ''} completed`;
    contractLine.style.color = '#4ecdc4';
    progress.appendChild(contractLine);
  }

  // Arrivals
  if (report.arrivals.length > 0) {
    // Deduplicate: show last arrival per ship
    const lastArrivalByShip = new Map<string, string>();
    for (const a of report.arrivals) {
      lastArrivalByShip.set(a.shipName, a.location);
    }
    for (const [shipName, location] of lastArrivalByShip) {
      const arrivalLine = document.createElement('div');
      arrivalLine.className = 'catchup-progress-line';
      arrivalLine.textContent = `${shipName} arrived at ${location}`;
      arrivalLine.style.color = '#a0a0b0';
      progress.appendChild(arrivalLine);
    }
  }

  // If nothing interesting happened at all
  if (progress.children.length === 0 && report.shipReports.length === 0) {
    const quietLine = document.createElement('div');
    quietLine.className = 'catchup-progress-line';
    quietLine.textContent = 'All quiet — nothing notable happened.';
    quietLine.style.color = '#a0a0b0';
    progress.appendChild(quietLine);
  }

  if (progress.children.length > 0) {
    container.appendChild(progress);
  }

  // --- Per-ship encounter summaries ---
  if (report.shipReports.length > 0) {
    const encounterHeader = document.createElement('div');
    encounterHeader.className = 'catchup-section-header';
    encounterHeader.textContent = 'Encounters';
    container.appendChild(encounterHeader);

    const fleetSummary = document.createElement('div');
    fleetSummary.className = 'catchup-fleet-summary';

    let totalEncounterCreditsGained = 0;
    let totalEncounterCreditsLost = 0;

    for (const shipReport of report.shipReports) {
      const shipDiv = document.createElement('div');
      shipDiv.className = 'catchup-ship';

      const shipName = document.createElement('div');
      shipName.className = 'catchup-ship-name';
      shipName.textContent = shipReport.shipName;
      shipDiv.appendChild(shipName);

      const events = document.createElement('div');
      events.className = 'catchup-ship-events';

      if (shipReport.evaded > 0) {
        const line = document.createElement('div');
        line.style.color = '#4caf50';
        line.textContent = `Evaded ${shipReport.evaded} contact${shipReport.evaded > 1 ? 's' : ''}`;
        events.appendChild(line);
      }

      if (shipReport.negotiated > 0) {
        const line = document.createElement('div');
        line.style.color = '#ffc107';
        line.textContent = `Negotiated ${shipReport.negotiated} safe passage${shipReport.negotiated > 1 ? 's' : ''}`;
        events.appendChild(line);
      }

      if (shipReport.victories > 0) {
        const line = document.createElement('div');
        line.style.color = '#4ecdc4';
        line.textContent = `Repelled ${shipReport.victories} raider${shipReport.victories > 1 ? 's' : ''}`;
        events.appendChild(line);
      }

      if (shipReport.harassments > 0) {
        const line = document.createElement('div');
        line.style.color = '#ffa500';
        line.textContent = `${shipReport.harassments} skirmish${shipReport.harassments > 1 ? 'es' : ''} (minor damage)`;
        events.appendChild(line);
      }

      if (shipReport.fled > 0) {
        const line = document.createElement('div');
        line.style.color = '#cc8800';
        line.textContent = `Fled ${shipReport.fled} encounter${shipReport.fled > 1 ? 's' : ''} (outmatched)`;
        events.appendChild(line);
      }

      shipDiv.appendChild(events);
      fleetSummary.appendChild(shipDiv);

      // Accumulate encounter credit totals
      if (shipReport.creditsDelta > 0) {
        totalEncounterCreditsGained += shipReport.creditsDelta;
      } else {
        totalEncounterCreditsLost += Math.abs(shipReport.creditsDelta);
      }
    }

    container.appendChild(fleetSummary);

    // Encounter impact
    const impact = document.createElement('div');
    impact.className = 'catchup-impact';

    const netCredits = totalEncounterCreditsGained - totalEncounterCreditsLost;
    if (totalEncounterCreditsGained > 0 || totalEncounterCreditsLost > 0) {
      const creditLine = document.createElement('div');
      if (totalEncounterCreditsGained > 0 && totalEncounterCreditsLost > 0) {
        creditLine.textContent = `Encounter credits: +${totalEncounterCreditsGained} / -${totalEncounterCreditsLost} = ${netCredits >= 0 ? '+' : ''}${netCredits} net`;
      } else if (totalEncounterCreditsGained > 0) {
        creditLine.textContent = `Bounties collected: +${totalEncounterCreditsGained}`;
      } else {
        creditLine.textContent = `Ransoms/theft: -${totalEncounterCreditsLost}`;
      }
      creditLine.style.color = netCredits >= 0 ? '#4ecdc4' : '#ff6b6b';
      impact.appendChild(creditLine);
    }

    // Average health loss
    const totalHealthLost = report.shipReports.reduce(
      (sum, r) => sum + r.avgHealthLost,
      0
    );
    const avgHealthLost =
      report.shipReports.length > 0
        ? totalHealthLost / report.shipReports.length
        : 0;

    if (avgHealthLost > 0) {
      const healthLine = document.createElement('div');
      healthLine.textContent = `Crew health: -${avgHealthLost.toFixed(0)} average across fleet`;
      healthLine.style.color = '#ffa500';
      impact.appendChild(healthLine);
    }

    if (impact.children.length > 0) {
      container.appendChild(impact);
    }
  }

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'catchup-dismiss';
  dismissBtn.textContent = 'Continue';
  dismissBtn.addEventListener('click', onDismiss);
  container.appendChild(dismissBtn);

  return container;
}
