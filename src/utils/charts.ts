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

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

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
    svg += `<line x1="${padding.left}" y1="${ty}" x2="${width - padding.right}" y2="${ty}" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,3"/>`;
    svg += `<text x="${width - padding.right + 4}" y="${ty + 4}" font-size="10" fill="#ef4444">${targetLine}h</text>`;
  }

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
    svg += `<path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

    // Area fill
    const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;
    svg += `<path d="${areaD}" fill="url(#gradient)" opacity="0.2"/>`;
    svg += `<defs><linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>`;
  }

  points.forEach((p) => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>`;
    svg += `<text x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="10" fill="var(--text)">${p.label}</text>`;
    svg += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.value.toFixed(1)}h</text>`;
  });

  svg += `</svg>`;
  return svg;
}
