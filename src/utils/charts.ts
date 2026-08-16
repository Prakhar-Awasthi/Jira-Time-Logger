export interface BarData {
  label: string;
  value: number;
  color?: string;
}

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

const COLORS = ["var(--teal)", "var(--warning)", "var(--purple)", "var(--success)", "var(--pink)", "var(--orange)", "#6366f1", "#84cc16"];

export function getColor(index: number): string {
  return COLORS[index % COLORS.length];
}

export function renderBarChart(data: BarData[], options: { width: number; height: number; targetLine?: number }): string {
  const { width, height, targetLine } = options;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...data.map(d => d.value), targetLine || 0) * 1.1 || 1;
  const barWidth = Math.min(chartWidth / data.length * 0.7, 60);
  const barGap = (chartWidth - barWidth * data.length) / (data.length + 1);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Y-axis grid lines
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    const val = ((maxValue * i) / 4).toFixed(1);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="4"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${val}h</text>`;
  }

  // Bars
  data.forEach((d, i) => {
    const x = padding.left + barGap + i * (barWidth + barGap);
    const barHeight = (d.value / maxValue) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    const color = d.color || getColor(i);
    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" opacity="0.85"/>`;
    svg += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="var(--text)">${d.label}</text>`;
    svg += `<text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${d.value.toFixed(1)}</text>`;
  });

  // Target line
  if (targetLine) {
    const ty = padding.top + chartHeight - (targetLine / maxValue) * chartHeight;
    svg += `<line x1="${padding.left}" y1="${ty}" x2="${width - padding.right}" y2="${ty}" stroke="var(--error)" stroke-width="2" stroke-dasharray="6,3"/>`;
    svg += `<text x="${width - padding.right + 4}" y="${ty + 4}" font-size="10" fill="var(--error)">${targetLine}h</text>`;
  }

  svg += `</svg>`;
  return svg;
}

export function renderSparkline(values: number[], options: { color?: string } = {}): string {
  const { color = "var(--accent)" } = options;
  const width = 200;
  const height = 44;
  const padding = 4;
  if (values.length === 0) return "";

  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  const gradId = `spark-grad-${Math.abs(values.reduce((a, b, i) => a + b * (i + 1), 0)).toFixed(0)}`;

  let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<path d="${areaD}" fill="url(#${gradId})" stroke="none"/>`;
  svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg += `</svg>`;
  return svg;
}

export function renderDonutChart(slices: PieSlice[], options: { size: number }): string {
  const { size } = options;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.6;
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;

  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

  let startAngle = -Math.PI / 2;
  slices.forEach((slice) => {
    const angle = (slice.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + innerR * Math.cos(endAngle);
    const y3 = cy + innerR * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(startAngle);
    const y4 = cy + innerR * Math.sin(startAngle);

    svg += `<path d="M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${slice.color}" opacity="0.85"/>`;
    startAngle = endAngle;
  });

  svg += `</svg>`;
  return svg;
}

export function renderTrendLine(data: { label: string; value: number }[], options: { width: number; height: number }): string {
  const { width, height } = options;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...data.map(d => d.value)) * 1.15 || 1;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    const val = ((maxValue * i) / 4).toFixed(0);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="4"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${val}h</text>`;
  }

  // Points and line
  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.value / maxValue) * chartHeight;
    return { x, y, ...d };
  });

  if (points.length > 1) {
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    svg += `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

    // Area fill
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;
    svg += `<path d="${areaD}" fill="url(#gradient)" opacity="0.2"/>`;
    svg += `<defs><linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  }

  points.forEach((p) => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    svg += `<text x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="10" fill="var(--text)">${p.label}</text>`;
    svg += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.value.toFixed(1)}h</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// --- Phase 2 chart renderers ---

import { OvertimeDay, DistributionBucket, DailyGap, ProjectMomentum } from "./insights";

export function renderHeatmapRow(days: OvertimeDay[], options: { width: number }): string {
  const { width } = options;
  const cellSize = Math.min(48, (width - 20) / days.length - 4);
  const totalWidth = days.length * (cellSize + 4) - 4;
  const height = cellSize + 40;

  let svg = `<svg width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  days.forEach((day, i) => {
    const x = i * (cellSize + 4);
    let fill: string;
    let opacity: number;
    if (day.intensity > 0) {
      const alpha = Math.min(1, day.intensity);
      fill = "var(--error)";
      opacity = 0.2 + alpha * 0.6;
    } else if (day.intensity < 0) {
      const alpha = Math.min(1, Math.abs(day.intensity));
      fill = "var(--success)";
      opacity = 0.2 + alpha * 0.4;
    } else {
      fill = "var(--muted)";
      opacity = 0.2;
    }

    svg += `<rect x="${x}" y="0" width="${cellSize}" height="${cellSize}" rx="4" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>`;
    svg += `<text x="${x + cellSize / 2}" y="${cellSize / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text)">${day.hours.toFixed(1)}</text>`;
    svg += `<text x="${x + cellSize / 2}" y="${cellSize + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${day.dayLabel}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

export function renderHistogram(buckets: DistributionBucket[], options: { width: number; height: number }): string {
  const { width, height } = options;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...buckets.map(b => b.count), 1) * 1.2;
  const barWidth = Math.min(chartWidth / buckets.length * 0.7, 60);
  const barGap = (chartWidth - barWidth * buckets.length) / (buckets.length + 1);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    const val = Math.round((maxCount * i) / 4);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="4"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${val}</text>`;
  }

  buckets.forEach((b, i) => {
    const x = padding.left + barGap + i * (barWidth + barGap);
    const barHeight = (b.count / maxCount) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${getColor(i)}" opacity="0.85"/>`;
    svg += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="var(--text)">${b.label}</text>`;
    svg += `<text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${b.percentage}%</text>`;
  });

  svg += `</svg>`;
  return svg;
}

export function renderGapChart(gaps: DailyGap[], options: { width: number; height: number; targetLine: number }): string {
  const { width, height, targetLine } = options;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...gaps.map(g => g.target), ...gaps.map(g => g.actual)) * 1.15 || 1;
  const barWidth = Math.min(chartWidth / gaps.length * 0.7, 60);
  const barGap = (chartWidth - barWidth * gaps.length) / (gaps.length + 1);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    const val = ((maxValue * i) / 4).toFixed(1);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="4"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${val}h</text>`;
  }

  gaps.forEach((g, i) => {
    const x = padding.left + barGap + i * (barWidth + barGap);
    const actualHeight = (g.actual / maxValue) * chartHeight;
    const gapHeight = (g.gap / maxValue) * chartHeight;
    const actualY = padding.top + chartHeight - actualHeight;
    const gapY = actualY - gapHeight;

    if (g.gap > 0) {
      svg += `<rect x="${x}" y="${gapY}" width="${barWidth}" height="${gapHeight}" rx="4" fill="var(--error)" opacity="0.2"/>`;
    }
    svg += `<rect x="${x}" y="${actualY}" width="${barWidth}" height="${actualHeight}" rx="4" fill="var(--accent)" opacity="0.85"/>`;
    svg += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="11" fill="var(--text)">${g.dayLabel}</text>`;
    svg += `<text x="${x + barWidth / 2}" y="${actualY - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${g.actual.toFixed(1)}</text>`;
  });

  const ty = padding.top + chartHeight - (targetLine / maxValue) * chartHeight;
  svg += `<line x1="${padding.left}" y1="${ty}" x2="${width - padding.right}" y2="${ty}" stroke="var(--error)" stroke-width="2" stroke-dasharray="6,3"/>`;
  svg += `<text x="${width - padding.right + 4}" y="${ty + 4}" font-size="10" fill="var(--error)">${targetLine}h</text>`;

  svg += `</svg>`;
  return svg;
}

export interface PeerBarItem {
  name: string;
  value: number;
  isCurrentUser: boolean;
  rank: number;
}

export function renderPeerBarChart(items: PeerBarItem[], options: { width: number }): string {
  const { width } = options;
  const rowH = 38;
  const rankW = 28;
  const labelW = 120;
  const valueW = 44;
  const padding = { top: 8, right: valueW + 14, bottom: 8, left: rankW + labelW + 8 };
  const chartWidth = width - padding.left - padding.right;
  const height = padding.top + padding.bottom + items.length * rowH;
  const maxValue = Math.max(...items.map(i => i.value), 0.01);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  items.forEach((item, i) => {
    const y = padding.top + i * rowH;
    const barH = rowH - 16;
    const barY = y + 8;
    const barW = Math.max(0, (item.value / maxValue) * chartWidth);
    const fill = item.isCurrentUser ? "var(--accent)" : "var(--purple)";
    const textFill = item.isCurrentUser ? "var(--accent)" : "var(--text)";
    const weight = item.isCurrentUser ? "700" : "500";
    const rankLabel = item.rank === 1 ? "1st" : item.rank === 2 ? "2nd" : item.rank === 3 ? "3rd" : `${item.rank}th`;
    const displayName = item.isCurrentUser ? `${item.name} (You)` : item.name;
    const truncName = displayName.length > 17 ? displayName.slice(0, 16) + "…" : displayName;

    svg += `<text x="${rankW - 2}" y="${barY + barH / 2 + 4}" text-anchor="end" font-size="10" font-weight="600" fill="var(--muted)">${rankLabel}</text>`;
    svg += `<text x="${rankW + 6}" y="${barY + barH / 2 + 4}" font-size="11" font-weight="${weight}" fill="${textFill}">${truncName}</text>`;
    svg += `<rect x="${padding.left}" y="${barY}" width="${chartWidth}" height="${barH}" rx="3" fill="var(--surface-2)"/>`;
    if (barW > 0) {
      svg += `<rect x="${padding.left}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="${fill}" opacity="${item.isCurrentUser ? "0.88" : "0.6"}"/>`;
    }
    svg += `<text x="${padding.left + chartWidth + 6}" y="${barY + barH / 2 + 4}" font-size="11" font-weight="${weight}" fill="${textFill}">${item.value.toFixed(1)}h</text>`;
  });

  svg += `</svg>`;
  return svg;
}

export function renderMomentumBars(items: ProjectMomentum[], options: { width: number; height: number }): string {
  const { width, height } = options;
  const display = items.slice(0, 8);
  if (display.length === 0) return "";

  const padding = { top: 10, right: 20, bottom: 10, left: 100 };
  const chartWidth = width - padding.left - padding.right;
  const barHeight = Math.min(24, (height - padding.top - padding.bottom) / display.length - 6);
  const rowHeight = barHeight + 6;
  const svgHeight = Math.max(height, padding.top + padding.bottom + display.length * rowHeight);
  const maxDelta = Math.max(...display.map(d => Math.abs(d.delta)), 1);
  const centerX = padding.left + chartWidth / 2;

  let svg = `<svg width="${width}" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

  svg += `<line x1="${centerX}" y1="${padding.top}" x2="${centerX}" y2="${svgHeight - padding.bottom}" stroke="var(--border)" stroke-width="1"/>`;

  display.forEach((item, i) => {
    const y = padding.top + i * rowHeight;
    const barW = (Math.abs(item.delta) / maxDelta) * (chartWidth / 2 - 10);
    const color = item.direction === "up" ? "var(--success)" : item.direction === "down" ? "var(--error)" : "var(--muted)";

    if (item.delta >= 0) {
      svg += `<rect x="${centerX + 2}" y="${y}" width="${barW}" height="${barHeight}" rx="3" fill="${color}" opacity="0.8"/>`;
    } else {
      svg += `<rect x="${centerX - barW - 2}" y="${y}" width="${barW}" height="${barHeight}" rx="3" fill="${color}" opacity="0.8"/>`;
    }

    svg += `<text x="${padding.left - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="11" fill="var(--text)">${item.project}</text>`;
    const label = `${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(1)}h`;
    const labelX = item.delta >= 0 ? centerX + barW + 8 : centerX - barW - 8;
    const anchor = item.delta >= 0 ? "start" : "end";
    svg += `<text x="${labelX}" y="${y + barHeight / 2 + 4}" text-anchor="${anchor}" font-size="10" fill="${color}" font-weight="600">${label}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

