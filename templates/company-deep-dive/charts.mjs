// Small inline-SVG chart helpers (no libraries; CSP is 'self'). Colors come from CSS classes
// (.c-1 … .c-7 for series fills, .k-1 … for strokes) so light/dark themes swap in style.css.
// Every value shown on hover is also in the view's table, so tooltips never gate data.
import { chartAxis, finite } from "./model.mjs";

const NS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
function frame(host, width, height, label) {
  const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": label, class: "chart" });
  host.replaceChildren(root);
  return root;
}
// One shared tooltip. Content is always set with textContent (labels come from API data).
let tooltip;
function tip(el, content) {
  if (!content) return el;
  el.classList.add("hit");
  const show = (event) => {
    tooltip ??= document.getElementById("tooltip");
    if (!tooltip) return;
    const rows = [];
    if (content.title) rows.push(Object.assign(document.createElement("div"), { className: "tt-title", textContent: content.title }));
    for (const row of content.rows ?? []) {
      const line = document.createElement("div");
      line.className = "tt-row";
      const key = document.createElement("span");
      key.className = "tt-key " + (row.color ?? "");
      const value = Object.assign(document.createElement("strong"), { textContent: row.value });
      const label = Object.assign(document.createElement("span"), { textContent: row.label ?? "" });
      line.append(key, value, label);
      rows.push(line);
    }
    tooltip.replaceChildren(...rows);
    tooltip.hidden = false;
    const box = tooltip.getBoundingClientRect();
    const x = event.clientX ?? el.getBoundingClientRect().right, y = event.clientY ?? el.getBoundingClientRect().top;
    tooltip.style.left = Math.max(8, Math.min(innerWidth - box.width - 8, x + 14)) + "px";
    tooltip.style.top = Math.max(8, Math.min(innerHeight - box.height - 8, y + 14)) + "px";
  };
  el.addEventListener("pointermove", show);
  el.addEventListener("pointerleave", () => tooltip && (tooltip.hidden = true));
  return el;
}
// Bars: rounded data-end, square at the baseline (4px radius).
function barPath(x0, x1, y, h, horizontal = true) {
  if (horizontal) {
    const left = Math.min(x0, x1), right = Math.max(x0, x1), r = Math.min(4, (right - left) / 2, h / 2);
    if (right - left < 0.5) return `M${left},${y}h0.5v${h}h-0.5z`;
    return x1 >= x0
      ? `M${left},${y}H${right - r}Q${right},${y} ${right},${y + r}V${y + h - r}Q${right},${y + h} ${right - r},${y + h}H${left}Z`
      : `M${right},${y}H${left + r}Q${left},${y} ${left},${y + r}V${y + h - r}Q${left},${y + h} ${left + r},${y + h}H${right}Z`;
  }
  // Vertical: x0 is the column's x, x1 the width, y0/y1 baseline and end.
  const [x, w, base, end] = [x0, x1, y, h], top = Math.min(base, end), bottom = Math.max(base, end);
  const r = Math.min(4, w / 2, (bottom - top) / 2);
  if (bottom - top < 0.5) return `M${x},${top}h${w}v0.5h-${w}z`;
  return end <= base
    ? `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`
    : `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${top}Z`;
}
function scale(min, max, a, b) {
  return (v) => a + ((v - min) / (max - min || 1)) * (b - a);
}
// Approximate fit for a label column: full-width (CJK) characters are about twice as wide as Latin ones.
function fit(text, px, size = 12) {
  let width = 0, out = "";
  for (const ch of text) {
    width += (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56) * size;
    if (width > px) return out.slice(0, -1) + "…";
    out += ch;
  }
  return out;
}

export function empty(host, text) {
  const box = document.createElement("div");
  box.className = "chart-empty";
  box.textContent = text;
  host.replaceChildren(box);
}

// Horizontal grouped bars, one row per category. rows: [{label, values:[{value, color, tip}], note}]
export function hBars(host, { width, rows, format, label, noteWidth = 64, noteHeader }) {
  const per = rows[0]?.values.length ?? 1, bar = per > 1 ? 9 : 14, gap = 2, rowH = per * (bar + gap) + 18;
  const labelW = Math.min(170, Math.max(96, width * 0.3)), top = 22, height = top + rows.length * rowH + 8;
  const root = frame(host, width, height, label);
  const values = rows.flatMap((r) => r.values.map((v) => finite(v.value))).filter((v) => v !== null);
  const { min, max, ticks } = chartAxis(values, width < 420 ? 3 : 4);
  const valueSpace = rows.some((r) => r.values[0]?.valueLabel) ? 40 : 0;
  const x = scale(min, max, labelW + 8, width - noteWidth - 8 - valueSpace);
  for (const tick of ticks) {
    root.append(svg("line", { x1: x(tick), x2: x(tick), y1: top - 4, y2: height - 6, class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: x(tick), y: 12, class: "tick", "text-anchor": "middle" }, format(tick)));
  }
  if (noteHeader) root.append(svg("text", { x: width - 4, y: 12, class: "tick", "text-anchor": "end" }, noteHeader));
  rows.forEach((row, i) => {
    const y0 = top + i * rowH + 9;
    root.append(svg("text", { x: labelW, y: y0 + (per * (bar + gap)) / 2 + 4, class: row.muted ? "label muted" : "label", "text-anchor": "end" }, fit(row.label, labelW - 4)));
    row.values.forEach((item, j) => {
      const y = y0 + j * (bar + gap), value = finite(item.value);
      if (value === null) {
        root.append(svg("text", { x: x(0) + 4, y: y + bar - 1, class: "tick" }, "—"));
        return;
      }
      root.append(tip(svg("path", { d: barPath(x(0), x(value), y, bar), class: item.color }), item.tip));
      if (j === 0 && item.valueLabel) {
        const end = x(value), inside = value < 0;
        root.append(svg("text", { x: inside ? end - 4 : end + 4, y: y + bar - 2, class: "value", "text-anchor": inside ? "end" : "start" }, item.valueLabel));
      }
    });
    if (row.note) root.append(svg("text", { x: width - 4, y: y0 + (per * (bar + gap)) / 2 + 4, class: "note", "text-anchor": "end" }, row.note));
  });
  return root;
}

// Diverging stacked columns around zero. categories: [{label, parts:[{value, color, tip}], marker:{value, tip}}]
export function stackedColumns(host, { width, height = 240, categories, format, label }) {
  const left = 46, right = width - 8, top = 14, bottom = height - 26;
  const root = frame(host, width, height, label);
  const extents = categories.flatMap((c) => {
    let up = 0, down = 0;
    for (const p of c.parts) { const v = finite(p.value); if (v !== null) (v >= 0 ? (up += v) : (down += v)); }
    return [up, down, finite(c.marker?.value) ?? 0];
  });
  const { min, max, ticks } = chartAxis(extents, 6);
  const y = scale(min, max, bottom, top);
  for (const tick of ticks) {
    root.append(svg("line", { x1: left, x2: right, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: left - 6, y: y(tick) + 4, class: "tick", "text-anchor": "end" }, format(tick)));
  }
  const band = (right - left) / categories.length, w = Math.min(28, band * 0.5);
  categories.forEach((c, i) => {
    const cx = left + band * i + band / 2;
    let up = 0, down = 0;
    for (const part of c.parts) {
      const v = finite(part.value);
      if (v === null || v === 0) continue;
      const base = v > 0 ? up : down, end = base + v;
      // 2px surface gap between stacked segments.
      const y0 = y(base) + (base === 0 ? 0 : v > 0 ? -1 : 1), y1 = y(end);
      root.append(tip(svg("path", { d: barPath(cx - w / 2, w, y0, y1, false), class: part.color }), part.tip));
      if (v > 0) up = end; else down = end;
    }
    const m = finite(c.marker?.value);
    if (m !== null) root.append(tip(svg("circle", { cx: cx + w / 2 + 7, cy: y(m), r: 4.5, class: "dot " + c.marker.color }), c.marker.tip));
    root.append(svg("text", { x: cx, y: height - 8, class: "tick", "text-anchor": "middle" }, c.label));
  });
  return root;
}

// Waterfall: steps [{label, from, to, type:'start'|'delta'|'subtotal', color, tip, valueLabel}]
export function waterfall(host, { width, height = 250, steps, format, label, unknown = "—" }) {
  const left = 46, right = width - 8, top = 22, bottom = height - 40;
  const root = frame(host, width, height, label);
  const { min, max, ticks } = chartAxis(steps.flatMap((s) => [finite(s.from), finite(s.to)]));
  const y = scale(min, max, bottom, top);
  for (const tick of ticks) {
    root.append(svg("line", { x1: left, x2: right, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: left - 6, y: y(tick) + 4, class: "tick", "text-anchor": "end" }, format(tick)));
  }
  const band = (right - left) / steps.length, w = Math.min(36, band * 0.62);
  steps.forEach((s, i) => {
    const x = left + band * i + (band - w) / 2, from = finite(s.from), to = finite(s.to);
    if (from !== null && to !== null) {
      root.append(tip(svg("path", { d: barPath(x, w, y(from), y(to), false), class: s.color }), s.tip));
      root.append(svg("text", { x: x + w / 2, y: Math.min(y(from), y(to)) - 6, class: "value", "text-anchor": "middle" }, s.valueLabel));
      const next = steps[i + 1];
      if (next && next.type === "delta" && finite(next.from) !== null)
        root.append(svg("line", { x1: x + w, x2: x + band, y1: y(to), y2: y(to), class: "connector" }));
    } else {
      root.append(svg("text", { x: x + w / 2, y: y(0) - 6, class: "value muted", "text-anchor": "middle" }, unknown));
    }
    const words = s.label.split("\n");
    words.forEach((word, k) => root.append(svg("text", { x: x + w / 2, y: bottom + 16 + k * 12, class: "tick", "text-anchor": "middle" }, fit(word, band - 2, 10.5))));
  });
  return root;
}

// Single-series line with dots and an end label; missing values break the line.
export function lineChart(host, { width, height = 170, points, format, label, color = "k-1", fill = "c-1", domain }) {
  const left = 46, right = width - 40, top = 14, bottom = height - 24;
  const root = frame(host, width, height, label);
  const values = points.map((p) => finite(p.value));
  const { min, max, ticks } = chartAxis(domain ? [...values, ...domain] : values, 3);
  const y = scale(min, max, bottom, top), x = (i) => left + 22 + (points.length === 1 ? (right - left - 44) / 2 : ((right - left - 44) * i) / (points.length - 1));
  for (const tick of ticks) {
    root.append(svg("line", { x1: left, x2: right + 30, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: left - 6, y: y(tick) + 4, class: "tick", "text-anchor": "end" }, format(tick)));
  }
  let d = "";
  values.forEach((v, i) => { d += v === null ? "" : `${d && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`; });
  if (d) root.append(svg("path", { d, class: "line " + color }));
  values.forEach((v, i) => {
    root.append(svg("text", { x: x(i), y: height - 6, class: "tick", "text-anchor": "middle" }, points[i].label));
    if (v === null) return;
    root.append(tip(svg("circle", { cx: x(i), cy: y(v), r: 4, class: "dot " + fill }), points[i].tip));
  });
  const last = values.findLastIndex((v) => v !== null);
  if (last >= 0) root.append(svg("text", { x: x(last) + 9, y: y(values[last]) + 4, class: "value" }, points[last].valueLabel));
  return root;
}

// Simple columns (one series, can be negative) with a value label on the latest column.
export function columns(host, { width, height = 170, points, format, label, color = "c-7" }) {
  const left = 46, right = width - 8, top = 18, bottom = height - 24;
  const root = frame(host, width, height, label);
  const { min, max, ticks } = chartAxis(points.map((p) => p.value), 3);
  const y = scale(min, max, bottom, top), band = (right - left) / points.length, w = Math.min(24, band * 0.5);
  for (const tick of ticks) {
    root.append(svg("line", { x1: left, x2: right, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: left - 6, y: y(tick) + 4, class: "tick", "text-anchor": "end" }, format(tick)));
  }
  points.forEach((p, i) => {
    const cx = left + band * i + band / 2, v = finite(p.value);
    root.append(svg("text", { x: cx, y: height - 6, class: "tick", "text-anchor": "middle" }, p.label));
    if (v === null) {
      root.append(svg("text", { x: cx, y: y(0) - 4, class: "tick", "text-anchor": "middle" }, "—"));
      return;
    }
    root.append(tip(svg("path", { d: barPath(cx - w / 2, w, y(0), y(v), false), class: color }), p.tip));
    // Negative values are labelled just above the zero line so they never collide with the axis labels.
    if (i === points.length - 1) root.append(svg("text", { x: cx, y: v >= 0 ? y(v) - 5 : y(0) - 5, class: "value", "text-anchor": "middle" }, p.valueLabel));
  });
  return root;
}

// Forecast paths grouped by target fiscal year: dots per announcement, a diamond for the actual.
export function forecastPaths(host, { width, height = 260, groups, format, label }) {
  const left = 50, right = width - 10, top = 16, bottom = height - 42;
  const root = frame(host, width, height, label);
  const values = groups.flatMap((g) => [...g.points.map((p) => p.value), g.actual?.value]);
  const { min, max, ticks } = chartAxis(values);
  const y = scale(min, max, bottom, top);
  for (const tick of ticks) {
    root.append(svg("line", { x1: left, x2: right, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
    root.append(svg("text", { x: left - 6, y: y(tick) + 4, class: "tick", "text-anchor": "end" }, format(tick)));
  }
  const band = (right - left) / Math.max(1, groups.length);
  groups.forEach((g, gi) => {
    const x0 = left + band * gi, slots = Math.max(5, g.points.length + 1), step = (band - 18) / (slots - 1);
    if (gi > 0) root.append(svg("line", { x1: x0, x2: x0, y1: top, y2: bottom + 26, class: "grid" }));
    const xs = g.points.map((_, i) => x0 + 9 + step * i);
    let d = "";
    g.points.forEach((p, i) => { const v = finite(p.value); if (v !== null) d += `${d ? "L" : "M"}${xs[i]},${y(v)}`; });
    if (d) root.append(svg("path", { d, class: "line k-1" }));
    const actual = finite(g.actual?.value), ax = x0 + 9 + step * (slots - 1);
    const lastIndex = g.points.findLastIndex((p) => finite(p.value) !== null);
    if (actual !== null && lastIndex >= 0)
      root.append(svg("line", { x1: xs[lastIndex], x2: ax, y1: y(g.points[lastIndex].value), y2: y(actual), class: "connector" }));
    g.points.forEach((p, i) => {
      const v = finite(p.value);
      if (v !== null) root.append(tip(svg("circle", { cx: xs[i], cy: y(v), r: i === 0 ? 4.5 : 4, class: "dot " + (i === 0 ? "c-hollow" : "c-1") }), p.tip));
    });
    if (actual !== null)
      root.append(tip(svg("path", { d: `M${ax},${y(actual) - 6}l6,6l-6,6l-6,-6z`, class: "dot c-3" }), g.actual.tip));
    root.append(svg("text", { x: x0 + band / 2, y: bottom + 18, class: "label", "text-anchor": "middle" }, g.label));
    if (g.sub) root.append(svg("text", { x: x0 + band / 2, y: bottom + 32, class: "tick", "text-anchor": "middle" }, g.sub));
  });
  return root;
}

// Horizontal meters on a 0..max scale with an optional reference line (e.g. 100% wage parity).
export function meters(host, { width, rows, format, label, max = 1, reference }) {
  const labelW = Math.min(170, width * 0.42), rowH = 30, top = 6, height = top + rows.length * rowH + 4;
  const root = frame(host, width, height, label);
  const scaleMax = Math.max(max, ...rows.map((r) => finite(r.value) ?? 0));
  const x = scale(0, scaleMax, labelW + 10, width - 56);
  rows.forEach((row, i) => {
    const y = top + i * rowH + 8, v = finite(row.value);
    root.append(svg("text", { x: labelW, y: y + 9, class: "label", "text-anchor": "end" }, fit(row.label, labelW - 4)));
    root.append(svg("rect", { x: x(0), y, width: x(scaleMax) - x(0), height: 12, rx: 3, class: "track" }));
    if (v !== null) root.append(tip(svg("path", { d: barPath(x(0), x(v), y, 12), class: row.color ?? "c-1" }), row.tip));
    root.append(svg("text", { x: width - 4, y: y + 10, class: v === null ? "value muted" : "value", "text-anchor": "end" }, format(v)));
  });
  if (reference !== undefined) {
    const rx = x(reference);
    root.append(svg("line", { x1: rx, x2: rx, y1: top, y2: height - 2, class: "reference" }));
  }
  return root;
}
