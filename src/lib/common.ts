export function color(r: number, g: number, b: number)
{
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

export function scale(x: number, x1: number, x2: number, y1: number, y2: number, limit = false)
{
    const y = y1 + (y2 - y1) * (x / (x2 - x1))
    return (limit) ? Math.min(Math.max(y, y1), y2) : y
}