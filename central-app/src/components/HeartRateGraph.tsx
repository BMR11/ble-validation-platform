import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const WINDOW = 60;
/** Horizontal strip uses slots 0..MAX_SLOT (oldest→newest left→right when full). */
const MAX_SLOT = WINDOW - 1;
/** Fixed Y-axis span (BPM) — stable at runtime (no auto zoom). */
export const Y_AXIS_BPM_MIN = 40;
export const Y_AXIS_BPM_MAX = 180;
/** Plot area height inside the ~200px container (label + hint). */
const GRAPH_HEIGHT = 132;
const CONTAINER_HEIGHT = 200;
/** Left column width for Y-axis BPM labels. */
const Y_AXIS_W = 36;
const Y_TICK_FONT = 10;
const PAD_X = 8;
const STROKE = 2;
/** How often to append a point using the latest `bpm` (via ref). */
export const SAMPLE_MS = 100;
/** Normal-range trace (red, softer). */
const TRACE_RED = '#f87171';
/** Abnormal BPM segment/point (stronger red). */
const TRACE_RED_WARN = '#ef4444';

export type Point = { x: number; y: number };

/**
 * Map BPM to Y (px from top). Higher BPM → higher on screen (toward top).
 */
export function normalizeToY(
  value: number,
  min: number,
  max: number,
  height: number
): number {
  const t = (value - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, t));
  return (1 - clamped) * height;
}

/**
 * Map sample index i (0..n-1, oldest→newest) to a strip slot in [0, MAX_SLOT].
 * When n &lt; WINDOW, the cluster is centered (first point at mid-strip); when n === WINDOW, slots are 0..MAX_SLOT (scrolling strip).
 */
export function slotForStripSample(i: number, n: number): number {
  if (n <= 0) {
    return 0;
  }
  return MAX_SLOT / 2 - (n - 1) / 2 + i;
}

export function xFromStripSlot(
  slot: number,
  padX: number,
  innerW: number
): number {
  return padX + (slot / MAX_SLOT) * innerW;
}

/** Evenly spaced tick BPMs (high → low) for the Y axis. */
export function buildYTicks(yMin: number, yMax: number, count = 5): number[] {
  const n = Math.max(2, count);
  const raw = Array.from({ length: n }, (_, k) => {
    const t = k / (n - 1);
    return yMax - t * (yMax - yMin);
  }).map((v) => Math.round(v));
  const out: number[] = [];
  for (const v of raw) {
    if (out.length === 0 || out[out.length - 1] !== v) {
      out.push(v);
    }
  }
  return out;
}

/** Fixed BPM ticks for left/right legends (does not change at runtime). */
const Y_TICKS = buildYTicks(Y_AXIS_BPM_MIN, Y_AXIS_BPM_MAX, 5);

function yTickLabelTop(tickBpm: number): number {
  return (
    normalizeToY(tickBpm, Y_AXIS_BPM_MIN, Y_AXIS_BPM_MAX, GRAPH_HEIGHT) -
    Y_TICK_FONT / 2 -
    1
  );
}

/**
 * Build polyline segments for thin rotated Views (two points per segment).
 */
export function buildSegments(points: Point[]): Array<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}> {
  if (points.length < 2) {
    return [];
  }
  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return out;
}

function isAbnormalBpm(bpm: number): boolean {
  return bpm > 120 || bpm < 50;
}

function segmentColor(bpmA: number, bpmB: number): string {
  const bad = isAbnormalBpm(bpmA) || isAbnormalBpm(bpmB);
  return bad ? TRACE_RED_WARN : TRACE_RED;
}

/** True when a dot should be drawn at this index (first sample or BPM changed from previous). */
function showDotAtIndex(history: number[], i: number): boolean {
  if (i === 0) {
    return true;
  }
  return history[i] !== history[i - 1];
}

function LineSegment({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) {
    return null;
  }
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <View
      style={[
        styles.line,
        {
          left: cx - len / 2,
          top: cy - STROKE / 2,
          width: len,
          backgroundColor: color,
          transform: [{ rotate: `${angleDeg}deg` }],
        },
      ]}
    />
  );
}

export type HeartRateGraphProps = {
  /** Latest BPM from BLE (or other source); sampled at {@link SAMPLE_MS} while valid. */
  bpm: number;
  testID?: string;
  plotTestID?: string;
};

/**
 * Real-time heart rate strip: last 60 BPM samples, manual polyline (View only).
 * Every {@link SAMPLE_MS} ms appends the latest `bpm` so the polyline advances (flat BPM → horizontal
 * segments). **Dots** render only when BPM changes from the previous sample (plus the first point).
 * X-axis uses fixed strip slots: partial history is centered; at 60 samples the trace uses full width
 * and scrolls left as new samples arrive.
 */
export function HeartRateGraph({ bpm, testID, plotTestID }: HeartRateGraphProps) {
  const [history, setHistory] = useState<number[]>([]);
  const [plotW, setPlotW] = useState(0);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  const bpmValid = Number.isFinite(bpm) && bpm > 0;

  useEffect(() => {
    if (!bpmValid) {
      setHistory([]);
      return;
    }
    const append = () => {
      const v = bpmRef.current;
      if (!Number.isFinite(v) || v <= 0) {
        return;
      }
      setHistory((h) => [...h.slice(-(WINDOW - 1)), v].slice(-WINDOW));
    };
    append();
    const id = setInterval(append, SAMPLE_MS);
    return () => clearInterval(id);
  }, [bpmValid]);

  const innerW = Math.max(plotW - 2 * PAD_X, 1);

  const { points, segments, segmentColors } = useMemo(() => {
    const n = history.length;
    if (n === 0) {
      return {
        points: [] as Point[],
        segments: [] as ReturnType<typeof buildSegments>,
        segmentColors: [] as string[],
      };
    }
    const pts: Point[] = history.map((v, i) => {
      const slot = slotForStripSample(i, n);
      const x = xFromStripSlot(slot, PAD_X, innerW);
      const y = normalizeToY(v, Y_AXIS_BPM_MIN, Y_AXIS_BPM_MAX, GRAPH_HEIGHT);
      return { x, y };
    });
    const segs = buildSegments(pts);
    const colors = segs.map((_, i) =>
      segmentColor(history[i]!, history[i + 1]!)
    );
    return {
      points: pts,
      segments: segs,
      segmentColors: colors,
    };
  }, [history, innerW]);

  const abnormal =
    Number.isFinite(bpm) && bpm > 0 && isAbnormalBpm(bpm);

  return (
    <View style={styles.container} testID={testID}>
      <Text
        style={[styles.bpmLabel, abnormal && styles.bpmLabelWarn]}
        accessibilityLabel={
          Number.isFinite(bpm) && bpm > 0
            ? `Current heart rate ${Math.round(bpm)} BPM`
            : 'Heart rate unavailable'
        }
      >
        {Number.isFinite(bpm) && bpm > 0
          ? `${Math.round(bpm)} BPM`
          : '— BPM'}
      </Text>

      <View style={styles.plotRow}>
        <View style={styles.yAxisLabels} pointerEvents="none">
          {Y_TICKS.map((tickBpm, ti) => (
            <Text
              key={`ytl-${ti}-${tickBpm}`}
              style={[styles.yAxisTickLeft, { top: yTickLabelTop(tickBpm) }]}
            >
              {tickBpm}
            </Text>
          ))}
        </View>
        <View
          style={styles.plotWrap}
          testID={plotTestID}
          onLayout={(e) => setPlotW(e.nativeEvent.layout.width)}
        >
        {Y_TICKS.map((tickBpm, gi) => (
          <View
            key={`grid-${gi}-${tickBpm}`}
            style={[
              styles.gridLine,
              {
                top: normalizeToY(
                  tickBpm,
                  Y_AXIS_BPM_MIN,
                  Y_AXIS_BPM_MAX,
                  GRAPH_HEIGHT
                ),
              },
            ]}
          />
        ))}

        {segments.map((s, i) => (
          <LineSegment
            key={`seg-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            color={segmentColors[i] ?? TRACE_RED}
          />
        ))}

        {points.map((p, i) =>
          showDotAtIndex(history, i) ? (
            <View
              key={`pt-${i}`}
              style={[
                styles.dot,
                {
                  left: p.x - 3,
                  top: p.y - 3,
                  backgroundColor: isAbnormalBpm(history[i]!)
                    ? TRACE_RED_WARN
                    : TRACE_RED,
                },
              ]}
            />
          ) : null
        )}

        {history.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>Waiting for samples…</Text>
          </View>
        )}
        </View>
        <View style={styles.yAxisLabels} pointerEvents="none">
          {Y_TICKS.map((tickBpm, ti) => (
            <Text
              key={`ytr-${ti}-${tickBpm}`}
              style={[styles.yAxisTickRight, { top: yTickLabelTop(tickBpm) }]}
            >
              {tickBpm}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.axisHint}>
        Y {Y_AXIS_BPM_MIN}–{Y_AXIS_BPM_MAX} BPM · {WINDOW} samples · {SAMPLE_MS}{' '}
        ms
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: CONTAINER_HEIGHT,
  },
  bpmLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  bpmLabelWarn: {
    color: '#f87171',
  },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  yAxisLabels: {
    width: Y_AXIS_W,
    height: GRAPH_HEIGHT,
    position: 'relative',
  },
  yAxisTickLeft: {
    position: 'absolute',
    right: 2,
    width: Y_AXIS_W - 4,
    fontSize: Y_TICK_FONT,
    lineHeight: 12,
    textAlign: 'right',
    color: '#94a3b8',
  },
  yAxisTickRight: {
    position: 'absolute',
    left: 2,
    width: Y_AXIS_W - 4,
    fontSize: Y_TICK_FONT,
    lineHeight: 12,
    textAlign: 'left',
    color: '#94a3b8',
  },
  plotWrap: {
    flex: 1,
    minWidth: 0,
    height: GRAPH_HEIGHT,
    position: 'relative',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#1e293b',
    zIndex: 0,
  },
  line: {
    position: 'absolute',
    height: STROKE,
    zIndex: 1,
    borderRadius: 1,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  emptyWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  empty: {
    color: '#64748b',
    fontSize: 13,
  },
  axisHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#64748b',
  },
});
