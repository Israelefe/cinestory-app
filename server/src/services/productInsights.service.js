const day = 86400000;
export const FUNNELS = [
  { key: 'activation', title: 'First delivery', identity: 'account', windowMs: 7 * day, steps: [['account.activated', 'Account activated'], ['upload.completed', 'Upload completed'], ['delivery.publish.succeeded', 'Delivery published']] },
  { key: 'checkout', title: 'Checkout to payment', identity: 'checkout', windowMs: day, steps: [['billing.checkout.started', 'Checkout opened'], ['billing.payment.confirmed', 'Payment confirmed']] },
  { key: 'recipient', title: 'Client viewing', identity: 'session', windowMs: 30 * 60000, steps: [['client.delivery.opened', 'Delivery opened'], ['client.experience.started', 'Viewing started'], ['client.photo.download.started', 'Photo download started']] }
];
function identity(event, kind) {
  if (kind === 'checkout') return event.actorType === 'photographer' && event.userId && event.flowDigest ? `${event.userId}:${event.flowDigest}` : null;
  if (kind === 'account') return event.actorType === 'photographer' && event.userId ? String(event.userId) : null;
  return event.actorType === 'client' && event.source === 'client' && event.sessionDigest && event.resourceDigest ? `${event.sessionDigest}:${event.resourceDigest}` : null;
}
export function orderedFunnel(events, definition, { since, now }) {
  const people = new Map();
  for (const event of [...events].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt) || (a.sequence || 0) - (b.sequence || 0))) {
    if (event.excluded) continue;
    if (['account.activated', 'billing.checkout.started', 'billing.payment.confirmed'].includes(event.name) && event.source !== 'server') continue;
    if (event.name === 'delivery.publish.succeeded' && event.source !== 'server') continue;
    const id = identity(event, definition.identity), at = new Date(event.occurredAt).getTime();
    if (!id || at > +now) continue;
    let person = people.get(id);
    if (!person && event.name === definition.steps[0][0] && at >= +since) {
      person = { step: 1, startedAt: at, lastAt: at, times: [at] }; people.set(id, person); continue;
    }
    if (!person || person.step >= definition.steps.length || at - person.startedAt > definition.windowMs || at < person.lastAt) continue;
    if (event.name === definition.steps[person.step][0]) { person.step++; person.lastAt = at; person.times.push(at); }
  }
  const rows = [...people.values()], total = rows.length;
  return { key: definition.key, title: definition.title, identity: definition.identity, windowHours: definition.windowMs / 3600000, participants: total,
    steps: definition.steps.map(([name, label], index) => {
      const reached = rows.filter(row => row.step > index), previous = index ? rows.filter(row => row.step >= index) : rows;
      const dropped = index ? previous.filter(row => row.step === index && +now - row.startedAt >= definition.windowMs).length : 0;
      const pending = index ? previous.filter(row => row.step === index && +now - row.startedAt < definition.windowMs).length : 0;
      const durations = reached.map(row => (row.times[index] - row.startedAt) / 1000).sort((a, b) => a - b);
      return { name, label, reached: reached.length, rate: total ? Math.round(reached.length / total * 1000) / 10 : null, dropped, pending, medianSeconds: durations.length ? durations[Math.floor((durations.length - 1) / 2)] : null };
    }) };
}
export function retentionReport(events, { since, now, periodDays = 7 }) {
  const users = new Map(), periodMs = periodDays * day;
  for (const event of events) {
    if (event.excluded || event.actorType !== 'photographer' || !event.userId || event.name !== 'delivery.publish.succeeded') continue;
    const at = +new Date(event.occurredAt); if (at > +now) continue;
    const id = String(event.userId), row = users.get(id) || { firstAt: at, times: [] };
    row.firstAt = Math.min(row.firstAt, at); row.times.push(at); users.set(id, row);
  }
  const cohorts = new Map();
  for (const row of users.values()) {
    if (row.firstAt < +since) continue;
    // Cohorts use Lagos calendar dates. Return intervals start at each user's
    // first recorded publication, rather than a partial calendar week.
    const key = new Date(row.firstAt + 3600000).toISOString().slice(0, 10);
    const cohort = cohorts.get(key) || { date: key, users: [] }; cohort.users.push(row); cohorts.set(key, cohort);
  }
  return { periodDays, definition: 'Returned to publish in the interval after their first recorded publication. Only completed intervals enter the denominator.', rows: [...cohorts.values()].sort((a, b) => b.date.localeCompare(a.date)).map(cohort => ({ date: cohort.date, size: cohort.users.length, periods: [1, 2, 3, 4].map(period => {
    const eligible = cohort.users.filter(row => row.firstAt + (period + 1) * periodMs <= +now);
    const returned = eligible.filter(row => row.times.some(at => at >= row.firstAt + period * periodMs && at < row.firstAt + (period + 1) * periodMs)).length;
    return { period, eligible: eligible.length, returned, rate: eligible.length ? Math.round(returned / eligible.length * 1000) / 10 : null };
  }) })) };
}
