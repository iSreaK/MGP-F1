/**
 * Build a closed monotone cubic elevation profile.
 *
 * Anchor heights are physical relative metres. presentationScale only makes
 * that relief readable from the circuit-wide camera; it never changes x/z.
 */
export function createElevationSampler(profile, {
  lapLength,
  baseY = .36,
  presentationScale = 1,
} = {}) {
  if (!Array.isArray(profile) || profile.length < 2 || profile[0][0] !== 0 ||
      profile.at(-1)[0] !== lapLength) {
    throw new Error('Le profil altimétrique doit couvrir un tour complet.');
  }
  const derivatives = profile.map((entry, i, points) => {
    const [x] = entry;
    if (i === 0 || i === points.length - 1) {
      const before = (points.at(-1)[1] - points.at(-2)[1]) /
        (points.at(-1)[0] - points.at(-2)[0]);
      const after = (points[1][1] - points[0][1]) /
        (points[1][0] - points[0][0]);
      return before * after <= 0 ? 0 : 2 * before * after / (before + after);
    }
    const leftSpan = x - points[i - 1][0];
    const rightSpan = points[i + 1][0] - x;
    const left = (entry[1] - points[i - 1][1]) / leftSpan;
    const right = (points[i + 1][1] - entry[1]) / rightSpan;
    if (left * right <= 0) return 0;
    const leftWeight = 2 * rightSpan + leftSpan;
    const rightWeight = rightSpan + 2 * leftSpan;
    return (leftWeight + rightWeight) /
      (leftWeight / left + rightWeight / right);
  });

  return station => {
    const distance = ((station % lapLength) + lapLength) % lapLength;
    let lo = 0, hi = profile.length - 2;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (profile[mid + 1][0] <= distance) lo = mid + 1;
      else hi = mid;
    }
    const [x0, y0] = profile[lo];
    const [x1, y1] = profile[lo + 1];
    const span = x1 - x0;
    const t = (distance - x0) / span;
    const t2 = t * t, t3 = t2 * t;
    const height = (2 * t3 - 3 * t2 + 1) * y0
      + (t3 - 2 * t2 + t) * span * derivatives[lo]
      + (-2 * t3 + 3 * t2) * y1
      + (t3 - t2) * span * derivatives[lo + 1];
    return baseY + height * presentationScale;
  };
}

