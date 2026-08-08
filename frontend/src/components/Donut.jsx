import React from 'react';

// segments: [{ label, value, color }]. Renders a ring donut via stacked
// stroke-dasharray arcs - no chart library needed for one simple donut.
export default function Donut({ segments, size = 120, thickness = 16 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((s) => {
    const fraction = s.value / total;
    const length = fraction * circumference;
    const arc = { ...s, length, offset, fraction };
    offset += length;
    return arc;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={thickness}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </g>
    </svg>
  );
}
