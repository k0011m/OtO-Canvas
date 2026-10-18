export interface FloatingPosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastMovedAt: number;
}

/** 指を離した勢いを減衰させ、図形の半径を考慮した壁で反射する。 */
export function advanceFloatingPosition(body: FloatingPosition, seconds: number, radiusX: number, radiusY: number): void {
  const rx = Math.min(.49, Math.max(0, radiusX));
  const ry = Math.min(.49, Math.max(0, radiusY));
  const duration = Math.min(.1, Math.max(0, seconds));
  const steps = Math.max(1, Math.ceil(duration * 120));
  const dt = duration / steps;
  for (let i = 0; i < steps; i++) {
    const decay = Math.exp(-.65 * dt);
    body.x += body.vx * (1 - decay) / .65;
    body.y += body.vy * (1 - decay) / .65;
    body.vx *= decay; body.vy *= decay;
    if (body.x < rx) { body.x = rx; body.vx = Math.abs(body.vx) * .78; }
    else if (body.x > 1 - rx) { body.x = 1 - rx; body.vx = -Math.abs(body.vx) * .78; }
    if (body.y < ry) { body.y = ry; body.vy = Math.abs(body.vy) * .78; }
    else if (body.y > 1 - ry) { body.y = 1 - ry; body.vy = -Math.abs(body.vy) * .78; }
  }
  if (Math.hypot(body.vx, body.vy) < .008) { body.vx = 0; body.vy = 0; }
}
