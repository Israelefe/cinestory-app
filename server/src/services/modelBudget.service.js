import mongoose from 'mongoose';
import { modelConcurrencyLimits, modelOwnerConcurrency } from './modelRequestScheduler.service.js';

const MINUTE = 60_000;
const numeric = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
export function rateLimitDuration(value) {
  const source = String(value || '').trim();
  if (/^\d+(\.\d+)?$/.test(source)) return Number(source) * 1000;
  let milliseconds = 0;
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)) milliseconds += Number(match[1]) * ({ ms: 1, s: 1000, m: MINUTE, h: 3_600_000, d: 86_400_000 }[match[2]]);
  return milliseconds || Math.max(0, Date.parse(source) - Date.now()) || 0;
}

export function providerBudgetObservation(response, usage) {
  const headers = response?.headers;
  return {
    tokensLimit: numeric(headers?.get?.('x-ratelimit-limit-tokens')),
    tokensRemaining: numeric(headers?.get?.('x-ratelimit-remaining-tokens')),
    tokensResetMs: rateLimitDuration(headers?.get?.('x-ratelimit-reset-tokens')),
    // Groq's request limit header is DAILY, never requests per minute.
    requestsRemaining: numeric(headers?.get?.('x-ratelimit-remaining-requests')),
    requestsResetMs: rateLimitDuration(headers?.get?.('x-ratelimit-reset-requests')),
    retryMs: response?.status === 429 ? Math.max(1000, rateLimitDuration(headers?.get?.('retry-after'))) : 0,
    actualTokens: numeric(usage?.total_tokens) ?? (response?.ok === false ? 0 : null)
  };
}

function defaultBudget(provider) {
  const prefix = provider === 'Groq AI' ? 'GROQ' : 'ALIBABA';
  return {
    rpm: Math.max(1, Number(process.env[`${prefix}_REQUESTS_PER_MINUTE`]) || 1000),
    tpm: Math.max(1, Number(process.env[`${prefix}_TOKENS_PER_MINUTE`]) || 250_000)
  };
}

function observationUpdate(state, observation, at, provider) {
  if (observation.tokensLimit > 0) state.providerTpm = observation.tokensLimit;
  state.tpm = Math.min(defaultBudget(provider).tpm, state.providerTpm || Infinity);
  if (observation.tokensRemaining !== null && observation.tokensRemaining !== undefined) {
    state.remaining = state.observedUntil > at && state.remaining !== null ? Math.min(state.remaining, observation.tokensRemaining) : observation.tokensRemaining;
    state.observedUntil = Math.max(state.observedUntil || 0, at + (observation.tokensResetMs || MINUTE));
  }
  if (observation.retryMs) state.blockedUntil = Math.max(state.blockedUntil || 0, at + observation.retryMs);
  if (observation.requestsRemaining === 0) state.blockedUntil = Math.max(state.blockedUntil || 0, at + (observation.requestsResetMs || MINUTE));
}

export function createMemoryModelBudget({ now = Date.now } = {}) {
  const states = new Map();
  return {
    async reserve(entry) {
      const key = `${entry.provider}:${entry.model}`;
      const state = states.get(key) || { ...defaultBudget(entry.provider), usage: [], leases: [], remaining: null, observedUntil: 0, blockedUntil: 0 };
      states.set(key, state);
      const configured = defaultBudget(entry.provider);
      state.rpm = configured.rpm;
      state.tpm = Math.min(configured.tpm, state.providerTpm || Infinity);
      const at = now();
      state.usage = state.usage.filter(item => item.at > at - MINUTE);
      state.leases = state.leases.filter(item => item.expiresAt > at);
      const tokens = Math.max(1, Math.ceil(entry.tokens));
      if (tokens > state.tpm) throw Object.assign(new Error('This AI request is larger than the available processing allowance.'), { code: 'AI_REQUEST_TOO_LARGE' });
      const laneLimit = modelConcurrencyLimits()[entry.workload];
      const laneLeases = state.leases.filter(item => item.workload === entry.workload);
      const full = state.usage.length >= state.rpm || state.usage.reduce((sum, item) => sum + item.tokens, 0) + tokens > state.tpm;
      const observedFull = state.observedUntil > at && state.remaining !== null && state.remaining < tokens;
      if (state.blockedUntil > at || full || observedFull || laneLeases.length >= laneLimit || laneLeases.filter(item => item.owner === entry.owner).length >= modelOwnerConcurrency(entry.workload)) {
        return { acquired: false, waitUntil: Math.max(at + 100, state.blockedUntil || 0, full ? (state.usage[0]?.at || at) + MINUTE : 0, observedFull ? state.observedUntil : 0) };
      }
      state.usage.push({ id: entry.id, at, tokens });
      state.leases.push({ id: entry.id, owner: entry.owner, workload: entry.workload, tokens, expiresAt: at + entry.timeoutMs + 10_000 });
      if (state.observedUntil > at && state.remaining !== null) state.remaining -= tokens;
      return { acquired: true };
    },
    async finish(entry, observation) {
      const state = states.get(`${entry.provider}:${entry.model}`);
      if (!state) return;
      state.leases = state.leases.filter(item => item.id !== entry.id);
      const usage = state.usage.find(item => item.id === entry.id);
      if (usage && observation.actualTokens !== null && observation.actualTokens !== undefined) {
        if (state.observedUntil > now() && state.remaining !== null) state.remaining = Math.max(0, Math.min(state.tpm, state.remaining + usage.tokens - observation.actualTokens));
        usage.tokens = observation.actualTokens;
      }
      const adjusted = { ...observation };
      if (adjusted.tokensRemaining !== null && adjusted.tokensRemaining !== undefined) adjusted.tokensRemaining = Math.max(0, adjusted.tokensRemaining - state.leases.reduce((sum, lease) => sum + (lease.tokens || 0), 0));
      observationUpdate(state, adjusted, now(), entry.provider);
    },
    snapshot: () => structuredClone([...states.entries()])
  };
}

// Admission uses one atomic MongoDB update. Separate API and worker processes
// therefore share provider/model allowance, while retaining distinct lanes.
export function createMongoModelBudget(collection, { now = Date.now } = {}) {
  const live = (field, condition) => ({ $filter: { input: { $ifNull: [`$${field}`, []] }, as: 'item', cond: condition } });
  const total = array => ({ $sum: { $map: { input: array, as: 'item', in: '$$item.tokens' } } });
  return {
    async reserve(entry) {
      const key = `${entry.provider}:${entry.model}`;
      const defaults = defaultBudget(entry.provider);
      const at = now(), tokens = Math.max(1, Math.ceil(entry.tokens));
      try { await collection.updateOne({ _id: key }, [{ $set: {
        rpm: defaults.rpm, tpm: { $min: [defaults.tpm, { $ifNull: ['$providerTpm', defaults.tpm] }] },
        usage: { $ifNull: ['$usage', []] }, leases: { $ifNull: ['$leases', []] },
        remaining: { $ifNull: ['$remaining', null] }, observedUntil: { $ifNull: ['$observedUntil', 0] }, blockedUntil: { $ifNull: ['$blockedUntil', 0] }
      } }], { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
      const leases = live('leases', { $gt: ['$$item.expiresAt', at] });
      const usage = live('usage', { $gt: ['$$item.at', at - MINUTE] });
      const laneLeases = { $filter: { input: leases, as: 'item', cond: { $eq: ['$$item.workload', entry.workload] } } };
      const ownerLeases = { $filter: { input: laneLeases, as: 'item', cond: { $eq: ['$$item.owner', entry.owner] } } };
      const hasRemaining = { $and: [{ $gt: ['$observedUntil', at] }, { $ne: ['$remaining', null] }] };
      const record = await collection.findOneAndUpdate({ _id: key, $expr: { $and: [
        { $lte: ['$blockedUntil', at] }, { $lt: [{ $size: usage }, '$rpm'] },
        { $lte: [{ $add: [total(usage), tokens] }, '$tpm'] },
        { $lt: [{ $size: laneLeases }, modelConcurrencyLimits()[entry.workload]] }, { $lt: [{ $size: ownerLeases }, modelOwnerConcurrency(entry.workload)] },
        { $or: [{ $not: [hasRemaining] }, { $gte: ['$remaining', tokens] }] }
      ] } }, [{ $set: {
        usage: { $concatArrays: [usage, [{ id: entry.id, at, tokens }]] },
        leases: { $concatArrays: [leases, [{ id: entry.id, owner: entry.owner, workload: entry.workload, tokens, expiresAt: at + entry.timeoutMs + 10_000 }]] },
        remaining: { $cond: [hasRemaining, { $subtract: ['$remaining', tokens] }, '$remaining'] }, updatedAt: new Date(at)
      } }], { returnDocument: 'after', includeResultMetadata: false });
      if (record) return { acquired: true };
      const state = await collection.findOne({ _id: key });
      if (tokens > state.tpm) throw Object.assign(new Error('This AI request is larger than the available processing allowance.'), { code: 'AI_REQUEST_TOO_LARGE' });
      const recent = state.usage.filter(item => item.at > at - MINUTE);
      const full = recent.length >= state.rpm || recent.reduce((sum, item) => sum + item.tokens, 0) + tokens > state.tpm;
      const observedFull = state.observedUntil > at && state.remaining !== null && state.remaining < tokens;
      return { acquired: false, waitUntil: Math.max(at + 100, state.blockedUntil || 0, full ? (recent[0]?.at || at) + MINUTE : 0, observedFull ? state.observedUntil : 0) };
    },
    async finish(entry, observation) {
      const at = now();
      const update = {
        leases: live('leases', { $and: [{ $ne: ['$$item.id', entry.id] }, { $gt: ['$$item.expiresAt', at] }] }),
        updatedAt: new Date(at)
      };
      if (observation.actualTokens !== null && observation.actualTokens !== undefined) update.usage = { $map: { input: { $ifNull: ['$usage', []] }, as: 'item', in: { $cond: [{ $eq: ['$$item.id', entry.id] }, { $mergeObjects: ['$$item', { tokens: observation.actualTokens }] }, '$$item'] } } };
      if (observation.tokensLimit > 0) {
        update.providerTpm = observation.tokensLimit;
        update.tpm = Math.min(defaultBudget(entry.provider).tpm, observation.tokensLimit);
      }
      const hasObserved = { $and: [{ $gt: ['$observedUntil', at] }, { $ne: ['$remaining', null] }] };
      const reconciledRemaining = observation.actualTokens !== null && observation.actualTokens !== undefined
        ? { $max: [0, { $min: ['$tpm', { $add: ['$remaining', entry.tokens - observation.actualTokens] }] }] } : '$remaining';
      if (observation.tokensRemaining !== null && observation.tokensRemaining !== undefined) {
        const available = { $max: [0, { $subtract: [observation.tokensRemaining, total(update.leases)] }] };
        update.remaining = { $cond: [hasObserved, { $min: [reconciledRemaining, available] }, available] };
        update.observedUntil = { $max: ['$observedUntil', at + (observation.tokensResetMs || MINUTE)] };
      } else if (observation.actualTokens !== null && observation.actualTokens !== undefined) update.remaining = { $cond: [hasObserved, reconciledRemaining, '$remaining'] };
      if (observation.retryMs || observation.requestsRemaining === 0) update.blockedUntil = { $max: ['$blockedUntil', at + Math.max(observation.retryMs || 0, observation.requestsRemaining === 0 ? observation.requestsResetMs || MINUTE : 0)] };
      await collection.updateOne({ _id: `${entry.provider}:${entry.model}` }, [{ $set: update }]);
    }
  };
}

const memory = createMemoryModelBudget();
export const modelBudget = {
  reserve(entry) {
    if (mongoose.connection.readyState === 1) return createMongoModelBudget(mongoose.connection.db.collection('aimodelbudgets')).reserve(entry);
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('AI processing is temporarily unavailable. Please try again.'), { code: 'AI_SCHEDULER_UNAVAILABLE' });
    return memory.reserve(entry);
  },
  finish(entry, observation) {
    if (mongoose.connection.readyState === 1) return createMongoModelBudget(mongoose.connection.db.collection('aimodelbudgets')).finish(entry, observation);
    return memory.finish(entry, observation);
  }
};
