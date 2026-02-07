import type { CatchUpReport } from '../models';
import { formatDuration, GAME_SECONDS_PER_TICK } from '../timeSystem';

/**
 * Render the catch-up report modal shown after fast-forward with encounters.
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
  const elapsedSeconds = report.totalTicks * GAME_SECONDS_PER_TICK;
  duration.textContent = `${formatDuration(elapsedSeconds)} elapsed`;
  header.appendChild(duration);

  container.appendChild(header);

  // Per-ship summaries
  const fleetSummary = document.createElement('div');
  fleetSummary.className = 'catchup-fleet-summary';

  let totalCreditsGained = 0;
  let totalCreditsLost = 0;

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

    shipDiv.appendChild(events);
    fleetSummary.appendChild(shipDiv);

    // Accumulate credit totals
    if (shipReport.creditsDelta > 0) {
      totalCreditsGained += shipReport.creditsDelta;
    } else {
      totalCreditsLost += Math.abs(shipReport.creditsDelta);
    }
  }

  container.appendChild(fleetSummary);

  // Impact summary
  const impact = document.createElement('div');
  impact.className = 'catchup-impact';

  const netCredits = totalCreditsGained - totalCreditsLost;
  const creditLine = document.createElement('div');
  if (totalCreditsGained > 0 && totalCreditsLost > 0) {
    creditLine.textContent = `Credits: +${totalCreditsGained} (bounties) / -${totalCreditsLost} (ransoms/theft) = ${netCredits >= 0 ? '+' : ''}${netCredits} net`;
  } else if (totalCreditsGained > 0) {
    creditLine.textContent = `Credits: +${totalCreditsGained} (bounties)`;
  } else if (totalCreditsLost > 0) {
    creditLine.textContent = `Credits: -${totalCreditsLost} (ransoms/theft)`;
  }
  creditLine.style.color = netCredits >= 0 ? '#4ecdc4' : '#ff6b6b';
  if (totalCreditsGained > 0 || totalCreditsLost > 0) {
    impact.appendChild(creditLine);
  }

  // Average health loss across fleet
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

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'catchup-dismiss';
  dismissBtn.textContent = 'Continue';
  dismissBtn.addEventListener('click', onDismiss);
  container.appendChild(dismissBtn);

  return container;
}
