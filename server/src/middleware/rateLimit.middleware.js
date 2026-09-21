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
export const aiGenerationLimit = limiter(60 * 60 * 1000, 12, 'Too many generation requests. Wait a while before asking Veylo to direct another shoot.');
export const publicAccessLimit = limiter(15 * 60 * 1000, 80, 'Too many attempts. Please wait before trying this delivery again.');
export const clientDeliveryEmailLimit = limiter(60 * 60 * 1000, 20, 'Too many delivery emails were requested. Wait before sending another one.');
export const publicMediaLimit = limiter(60 * 60 * 1000, 700, 'Too many delivery requests were made. Wait a while and try again.');
export const mediaSignatureLimit = limiter(60 * 60 * 1000, 650, 'Too many uploads were started from this connection. Wait before starting more.');
export const billingActionLimit = limiter(60 * 60 * 1000, 30, 'Too many billing requests were made. Wait a while and try again.');
export const profileUpdateLimit = limiter(60 * 60 * 1000, 20, 'Too many profile changes were requested. Please try again later.');
export const supportTicketLimit = limiter(60 * 60 * 1000, 8, 'Too many support requests were sent from this connection. Please try again later.');
