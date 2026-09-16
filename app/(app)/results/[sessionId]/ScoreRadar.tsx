'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';

/**
 * PRD §14 Phase 6 — the score breakdown radar.
 *
 * Deliberate choices:
 *   - the radius domain is pinned to [0, 100]. Recharts would otherwise scale
 *     to the data, which makes 62/65/60/58 look like a dramatic spread and
 *     90/92/91/89 look flat. Both readings would be lies.
 *   - one series, so no legend: the heading names it. Each axis is labelled
 *     with its own value, so identity is never carried by colour alone.
 *   - the axis text uses text tokens, not the series colour.
 *   - a table carries the same numbers for screen readers and for anyone the
 *     shape does not serve.
 */

export interface RadarDatum {
  axis: string;
  value: number;
}

export function ScoreRadar({ data }: { data: RadarDatum[] }) {
  return (
    <figure className="mt-6">
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--line)" strokeWidth={1} />
            <PolarAngleAxis
              dataKey="axis"
              tick={<AxisTick data={data} />}
              tickLine={false}
              axisLine={false}
            />
            {/* Pinned scale — see the note above. */}
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
            <Radar
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="var(--accent)"
              fillOpacity={0.18}
              dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--raised)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">
        Score out of 100 for each dimension, shown as a radar chart. The same figures are in the
        table below.
      </figcaption>

      {/* The numbers, plainly. Visible rather than sr-only — the shape shows the
          pattern, the table answers "but what was it exactly?". */}
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Score breakdown by dimension</caption>
        <tbody className="divide-y divide-line border-y border-line">
          {data.map((d) => (
            <tr key={d.axis}>
              <th scope="row" className="py-2 text-left font-normal text-muted">
                {d.axis}
              </th>
              <td className="py-2 text-right tabular-nums">
                <span className="inline-flex items-center gap-3">
                  <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-line sm:inline-block">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }}
                    />
                  </span>
                  <span className="w-10 font-medium">{Math.round(d.value)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Axis label plus its value, so the chart is readable without tracing rings. */
function AxisTick({
  x,
  y,
  textAnchor,
  payload,
  data,
}: {
  x?: number;
  y?: number;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  payload?: { value?: string };
  data?: RadarDatum[];
}) {
  const label = payload?.value ?? '';
  const datum = data?.find((d) => d.axis === label);

  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        textAnchor={textAnchor}
        dy={-2}
        fill="var(--muted)"
        fontSize={12}
        fontWeight={500}
      >
        {label}
      </text>
      {datum && (
        <text textAnchor={textAnchor} dy={14} fill="var(--text)" fontSize={13} fontWeight={600}>
          {Math.round(datum.value)}
        </text>
      )}
    </g>
  );
}
