import type {
  CatchUpReport,
  CatchUpEncounterStats,
  CatchUpGravityAssistStats,
  LogEntryType,
} from '../models';
import {
  formatDuration,
  formatRealDuration,
  GAME_SECONDS_PER_TICK,
} from '../timeSystem';
import { formatMass } from '../formatting';

/** Render encounter detail lines into a container element. */
function renderEncounterLines(
  enc: CatchUpEncounterStats,
  parent: HTMLElement
): void {
  const lines: { text: string; color: string }[] = [];
  if (enc.evaded > 0)
    lines.push({
      text: `Evaded ${enc.evaded} contact${enc.evaded > 1 ? 's' : ''}`,
      color: '#4caf50',
    });
  if (enc.negotiated > 0)
    lines.push({
      text: `Negotiated ${enc.negotiated} safe passage${enc.negotiated > 1 ? 's' : ''}`,
      color: '#ffc107',
    });
  if (enc.victories > 0)
    lines.push({
      text: `Repelled ${enc.victories} raider${enc.victories > 1 ? 's' : ''}`,
      color: '#4ecdc4',
    });
  if (enc.harassments > 0)
    lines.push({
      text: `${enc.harassments} skirmish${enc.harassments > 1 ? 'es' : ''} (minor damage)`,
      color: '#ffa500',
    });
  if (enc.fled > 0)
    lines.push({
      text: `Fled ${enc.fled} encounter${enc.fled > 1 ? 's' : ''} (outmatched)`,
      color: '#cc8800',
    });

  for (const { text, color } of lines) {
    const line = document.createElement('div');
    line.className = 'catchup-ship-event';
    line.textContent = text;
    line.style.color = color;
    line.style.paddingLeft = '0.75rem';
    line.style.fontSize = '0.85rem';
    parent.appendChild(line);
  }
}

/** Render gravity assist summary line(s) into a container element. */
function renderGravityAssistLine(
  stats: CatchUpGravityAssistStats,
  parent: HTMLElement
): void {
  const total = stats.successes + stats.failures;
  if (total === 0) return;

  const pilotSuffix = stats.pilotName ? ` (${stats.pilotName} piloting)` : '';

  let text: string;

  if (total === 1) {
    // Single assist — show specific body + result
    const body = stats.singleBodyName ?? 'unknown body';
    if (stats.successes === 1) {
      text = `Gravity assist off ${body} — saved ${formatMass(stats.totalFuelSavedKg)} fuel${pilotSuffix}`;
    } else {
      text = `Gravity assist at ${body} failed — cost ${formatMass(stats.totalFuelCostKg)} fuel${pilotSuffix}`;
    }
  } else {
    // Multiple assists — aggregated counts
    const parts: string[] = [];
    if (stats.successes > 0) {
      parts.push(`${stats.successes} successful`);
    }
    if (stats.failures > 0) {
      parts.push(`${stats.failures} failed`);
    }

    const netFuelKg = stats.totalFuelSavedKg - stats.totalFuelCostKg;
    let fuelSummary: string;
    if (stats.failures === 0) {
      fuelSummary = `saved ${formatMass(stats.totalFuelSavedKg)} fuel`;
    } else if (stats.successes === 0) {
      fuelSummary = `cost ${formatMass(stats.totalFuelCostKg)} fuel`;
    } else {
      const sign = netFuelKg >= 0 ? 'saved' : 'cost';
      fuelSummary = `net ${formatMass(Math.abs(netFuelKg))} fuel ${sign}`;
    }

    text = `Gravity assists: ${parts.join(', ')} — ${fuelSummary}${pilotSuffix}`;
  }

  const line = document.createElement('div');
  line.className = 'catchup-ship-event';
  line.textContent = text;
  line.style.paddingLeft = '0.75rem';
  line.style.fontSize = '0.85rem';

  // Color: green if net fuel positive, orange if net fuel negative
  const netFuel = stats.totalFuelSavedKg - stats.totalFuelCostKg;
  line.style.color = netFuel >= 0 ? '#4caf50' : '#ffa500';

  parent.appendChild(line);
}

/**
 * Render the catch-up report modal shown after a significant absence.
 * Ship-centric layout: each ship appears once with all its activities consolidated.
 */
export function renderCatchUpReport(
  report: CatchUpReport,
  onDismiss: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'catchup-report';

  // --- Header ---
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

  // Show a note when diminishing returns kicked in
  const FULL_RATE_SECONDS = 4 * 3600; // mirrors FULL_RATE_CATCH_UP_SECONDS in main.ts
  if (report.elapsedRealSeconds > FULL_RATE_SECONDS) {
    const capNote = document.createElement('div');
    capNote.className = 'catchup-cap-note';
    capNote.textContent =
      `Away for ${formatRealDuration(report.elapsedRealSeconds)} — ` +
      `progress beyond ${formatRealDuration(FULL_RATE_SECONDS)} accrues at a reduced rate.`;
    capNote.style.color = '#888';
    capNote.style.fontSize = '0.85rem';
    capNote.style.fontStyle = 'italic';
    capNote.style.marginTop = '0.25rem';
    header.appendChild(capNote);
  }

  container.appendChild(header);

  // --- Fleet-wide stats ---
  const fleetStats = document.createElement('div');
  fleetStats.className = 'catchup-progress';

  if (report.creditsDelta !== 0) {
    const creditLine = document.createElement('div');
    creditLine.className = 'catchup-progress-line';
    const sign = report.creditsDelta >= 0 ? '+' : '';
    creditLine.textContent = `Credits: ${sign}${report.creditsDelta.toLocaleString()}`;
    creditLine.style.color = report.creditsDelta >= 0 ? '#4ecdc4' : '#ff6b6b';
    fleetStats.appendChild(creditLine);
  }

  if (report.contractsCompleted > 0) {
    const contractLine = document.createElement('div');
    contractLine.className = 'catchup-progress-line';
    contractLine.textContent = `${report.contractsCompleted} contract${report.contractsCompleted > 1 ? 's' : ''} completed`;
    contractLine.style.color = '#4ecdc4';
    fleetStats.appendChild(contractLine);
  }

  if (report.crewLost > 0) {
    const crewLostLine = document.createElement('div');
    crewLostLine.className = 'catchup-progress-line';
    crewLostLine.textContent = `${report.crewLost} crew member${report.crewLost > 1 ? 's' : ''} lost`;
    crewLostLine.style.color = '#ff6b6b';
    fleetStats.appendChild(crewLostLine);
  }

  if (fleetStats.children.length > 0) {
    container.appendChild(fleetStats);
  }

  // --- Highlight colors (shared by per-ship crew events and remaining highlights) ---
  const HIGHLIGHT_COLORS: Partial<Record<LogEntryType, string>> = {
    crew_level_up: '#4ade80',
    crew_hired: '#4ecdc4',
    crew_departed: '#ff6b6b',
    crew_death: '#ff6b6b',
    gravity_warning: '#ffa500',
  };

  // --- Per-ship summaries ---
  let totalEncounterCreditsGained = 0;
  let totalEncounterCreditsLost = 0;
  let totalHealthLost = 0;
  let shipsWithEncounters = 0;

  if (report.shipSummaries.length > 0) {
    const shipsSection = document.createElement('div');
    shipsSection.className = 'catchup-fleet-summary';

    for (const summary of report.shipSummaries) {
      const shipDiv = document.createElement('div');
      shipDiv.className = 'catchup-ship';

      // Ship name
      const nameEl = document.createElement('div');
      nameEl.className = 'catchup-ship-name';
      nameEl.textContent = summary.shipName;
      shipDiv.appendChild(nameEl);

      // Activity line
      const activityEl = document.createElement('div');
      activityEl.className = 'catchup-ship-activity';
      activityEl.style.paddingLeft = '0.75rem';
      activityEl.style.fontSize = '0.9rem';

      switch (summary.activity.type) {
        case 'trade_route':
          if (summary.activity.tripsCompleted > 0) {
            activityEl.textContent = `Made ${summary.activity.tripsCompleted} trip${summary.activity.tripsCompleted > 1 ? 's' : ''} on trade route ${summary.activity.routeName}`;
            activityEl.style.color = '#4a9eff';
          } else {
            activityEl.textContent = `On trade route ${summary.activity.routeName} (no trips completed)`;
            activityEl.style.color = '#a0a0b0';
          }
          break;
        case 'mining_route':
          if (summary.activity.tripsCompleted > 0) {
            activityEl.textContent = `Made ${summary.activity.tripsCompleted} trip${summary.activity.tripsCompleted > 1 ? 's' : ''} on mining route ${summary.activity.routeName}`;
            activityEl.style.color = '#81c784';
          } else {
            activityEl.textContent = `On mining route ${summary.activity.routeName} (no trips completed)`;
            activityEl.style.color = '#a0a0b0';
          }
          break;
        case 'completed_trips':
          activityEl.textContent = `Made ${summary.activity.tripsCompleted} trip${summary.activity.tripsCompleted > 1 ? 's' : ''}`;
          activityEl.style.color = '#4caf50';
          break;
        case 'arrived':
          activityEl.textContent = `Arrived at ${summary.activity.destination}`;
          activityEl.style.color = '#4caf50';
          break;
        case 'en_route':
          activityEl.textContent = `En route to ${summary.activity.destination}`;
          activityEl.style.color = '#a0a0b0';
          activityEl.style.fontStyle = 'italic';
          break;
        case 'idle':
          activityEl.textContent = `Docked at ${summary.activity.location}`;
          activityEl.style.color = '#a0a0b0';
          break;
      }

      shipDiv.appendChild(activityEl);

      // Contract info line (if any)
      if (summary.contractInfo) {
        const contractEl = document.createElement('div');
        contractEl.className = 'catchup-ship-event';
        contractEl.style.paddingLeft = '0.75rem';
        contractEl.style.fontSize = '0.85rem';

        const statusLabels: Record<string, { text: string; color: string }> = {
          ongoing: { text: 'In progress', color: '#4a9eff' },
          completed: { text: 'Completed', color: '#4ecdc4' },
          expired: { text: 'Expired', color: '#ff6b6b' },
          abandoned: { text: 'Abandoned', color: '#ffa500' },
        };

        const { text, color } =
          statusLabels[summary.contractInfo.status] ?? statusLabels.ongoing;
        contractEl.textContent = `Contract: ${summary.contractInfo.title} — ${text}`;
        contractEl.style.color = color;
        shipDiv.appendChild(contractEl);
      }

      // Encounter lines (if any)
      if (summary.encounters) {
        renderEncounterLines(summary.encounters, shipDiv);

        // Accumulate fleet-wide encounter totals
        if (summary.encounters.creditsDelta > 0) {
          totalEncounterCreditsGained += summary.encounters.creditsDelta;
        } else {
          totalEncounterCreditsLost += Math.abs(
            summary.encounters.creditsDelta
          );
        }
        totalHealthLost += summary.encounters.avgHealthLost;
        shipsWithEncounters++;
      }

      // Gravity assist summary (if any)
      if (summary.gravityAssists) {
        renderGravityAssistLine(summary.gravityAssists, shipDiv);
      }

      // Crew highlights nested under this ship
      if (summary.crewHighlights && summary.crewHighlights.length > 0) {
        for (const entry of summary.crewHighlights) {
          const line = document.createElement('div');
          line.className = 'catchup-ship-event';
          line.textContent = entry.message;
          line.style.color = HIGHLIGHT_COLORS[entry.type] ?? '#a0a0b0';
          line.style.paddingLeft = '0.75rem';
          line.style.fontSize = '0.85rem';
          shipDiv.appendChild(line);
        }
      }

      shipsSection.appendChild(shipDiv);
    }

    container.appendChild(shipsSection);
  }

  // --- Remaining crew highlights not tied to a specific ship ---
  if (report.logHighlights && report.logHighlights.length > 0) {
    const crewSection = document.createElement('div');
    crewSection.className = 'catchup-progress';

    for (const entry of report.logHighlights) {
      const line = document.createElement('div');
      line.className = 'catchup-progress-line';
      line.textContent = entry.message;
      line.style.color = HIGHLIGHT_COLORS[entry.type] ?? '#a0a0b0';
      crewSection.appendChild(line);
    }

    container.appendChild(crewSection);
  }

  // --- Fleet-wide encounter impact ---
  if (
    totalEncounterCreditsGained > 0 ||
    totalEncounterCreditsLost > 0 ||
    totalHealthLost > 0
  ) {
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

    const avgHealthLost =
      shipsWithEncounters > 0 ? totalHealthLost / shipsWithEncounters : 0;
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

  // If nothing interesting happened at all
  if (
    report.shipSummaries.length === 0 &&
    (!report.logHighlights || report.logHighlights.length === 0)
  ) {
    const quietSection = document.createElement('div');
    quietSection.className = 'catchup-progress';
    const quietLine = document.createElement('div');
    quietLine.className = 'catchup-progress-line';
    quietLine.textContent = 'All quiet — nothing notable happened.';
    quietLine.style.color = '#a0a0b0';
    quietSection.appendChild(quietLine);
    container.appendChild(quietSection);
  }

  // New stories detected during catch-up
  if (report.newStories && report.newStories.length > 0) {
    const storiesSection = document.createElement('div');
    storiesSection.className = 'catchup-stories';
    storiesSection.style.marginTop = '1rem';

    const storiesHeader = document.createElement('h4');
    storiesHeader.textContent = 'New Stories Detected';
    storiesHeader.style.color = '#e94560';
    storiesHeader.style.marginBottom = '0.5rem';
    storiesSection.appendChild(storiesHeader);

    for (const arc of report.newStories) {
      const storyLine = document.createElement('div');
      storyLine.style.cssText =
        'padding:0.4rem 0;border-bottom:1px solid #333;';

      const stars =
        '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);
      storyLine.innerHTML =
        `<span style="color:#e94560;font-weight:bold">${arc.title}</span> ` +
        `<span style="color:#ffc107">${stars}</span> ` +
        `<span style="color:#888">— ${arc.actorName}</span>`;

      storiesSection.appendChild(storyLine);
    }

    const hint = document.createElement('div');
    hint.textContent = 'Visit the Stories tab to read more.';
    hint.style.cssText = 'color:#666;font-size:0.8rem;margin-top:0.5rem;';
    storiesSection.appendChild(hint);

    container.appendChild(storiesSection);
  }

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'catchup-dismiss';
  dismissBtn.textContent = 'Continue';
  dismissBtn.addEventListener('click', onDismiss);
  container.appendChild(dismissBtn);

  return container;
}
