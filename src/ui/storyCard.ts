import type { StoryArc } from '../models';
import { generateNarrative, generateShareText } from '../narrativeGenerator';

/**
 * Story Card — Shareable story component
 *
 * Two export modes:
 * 1. Text copy (clipboard) — formatted for social media
 * 2. Image export (PNG via canvas) — game-palette styled card
 *
 * Mobile: Web Share API when available.
 */

// ── Game palette ─────────────────────────────────────────────────
const BG_COLOR = '#1a1a2e';
const ACCENT_COLOR = '#e94560';
const TEXT_COLOR = '#c0c0d0';
const MUTED_COLOR = '#8888aa';
const STAR_COLOR = '#ffc107';

/**
 * Copy story text to clipboard. Falls back to textarea trick.
 */
export async function copyStoryText(arc: StoryArc): Promise<boolean> {
  const text = generateShareText(arc);

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS
    return fallbackCopy(text);
  }
}

/**
 * Share story via Web Share API (mobile) or fall back to clipboard copy.
 */
export async function shareStory(arc: StoryArc): Promise<void> {
  const text = generateShareText(arc);

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Starship Commander — ${arc.title}`,
        text,
      });
      return;
    } catch {
      // User cancelled or share failed — fall back to copy
    }
  }

  // Fall back to clipboard copy
  const success = await copyStoryText(arc);
  showCopyFeedback(success);
}

/**
 * Export story as a PNG image via canvas rendering.
 * Downloads the file automatically.
 */
export function exportStoryImage(arc: StoryArc): void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 600;
  const H = 400;
  const PADDING = 30;
  canvas.width = W;
  canvas.height = H;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  // Accent bar at top
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, W, 4);

  // Title
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText(arc.title, PADDING, PADDING + 22);

  // Actor name
  ctx.fillStyle = MUTED_COLOR;
  ctx.font = '14px monospace';
  ctx.fillText(arc.actorName, PADDING, PADDING + 44);

  // Stars
  const stars = '\u2605'.repeat(arc.rating) + '\u2606'.repeat(5 - arc.rating);
  ctx.fillStyle = STAR_COLOR;
  ctx.font = '16px monospace';
  ctx.fillText(stars, W - PADDING - ctx.measureText(stars).width, PADDING + 22);

  // Divider
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, PADDING + 58);
  ctx.lineTo(W - PADDING, PADDING + 58);
  ctx.stroke();

  // Narrative text (word-wrapped)
  const narrative = generateNarrative(arc);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '13px monospace';

  const maxWidth = W - PADDING * 2;
  const lines = wrapText(ctx, narrative, maxWidth);
  let y = PADDING + 80;
  for (const line of lines.slice(0, 10)) {
    ctx.fillText(line, PADDING, y);
    y += 20;
  }

  // Footer
  ctx.fillStyle = MUTED_COLOR;
  ctx.font = '11px monospace';
  ctx.fillText(
    'STARSHIP COMMANDER  |  #StarshipCommander',
    PADDING,
    H - PADDING
  );

  // Bottom accent bar
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, H - 4, W, 4);

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starship-commander-${arc.arcType}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ── Helpers ──────────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}

function showCopyFeedback(success: boolean): void {
  const msg = document.createElement('div');
  msg.textContent = success
    ? 'Story copied to clipboard!'
    : 'Could not copy — try sharing manually.';
  msg.style.cssText =
    'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
    'background:#1a1a2e;border:1px solid #e94560;color:#c0c0d0;' +
    'padding:0.75rem 1.5rem;border-radius:4px;z-index:9999;' +
    'font-size:0.85rem;animation:fadeIn 0.3s ease;';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 3000);
}
