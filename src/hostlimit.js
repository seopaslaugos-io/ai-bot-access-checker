import { DurableObject } from 'cloudflare:workers';

// One instance per checked hostname (idFromName(host)). Fixed one-minute window counter held
// in memory and storage: exact across Cloudflare's network, unlike the ratelimit binding.
export class HostLimit extends DurableObject {
  async take(limit, windowMs) {
    const now = Date.now();
    let w = (await this.ctx.storage.get('w')) || { start: now, count: 0 };
    if (now - w.start >= windowMs) w = { start: now, count: 0 };
    if (w.count >= limit) return { ok: false, retryAfter: Math.ceil((w.start + windowMs - now) / 1000) };
    w.count++;
    await this.ctx.storage.put('w', w);
    return { ok: true };
  }
}
