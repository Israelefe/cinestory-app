import { rateLimit } from 'express-rate-limit';

function limiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message }
  });
}

export const authAttemptLimit = limiter(15 * 60 * 1000, 30, 'Too many attempts. Please wait before trying again.');
export const registrationLimit = limiter(60 * 60 * 1000, 10, 'Too many account requests from this connection. Please try again later.');
export const emailCodeLimit = limiter(60 * 60 * 1000, 12, 'Too many code requests. Please wait before requesting another one.');
