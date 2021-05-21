export function color(r, g, b) {
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
export function scale(x, x1, x2, y1, y2, limit = false) {
    const y = y1 + (y2 - y1) * (x / (x2 - x1));
    return (limit) ? Math.min(Math.max(y, y1), y2) : y;
}
