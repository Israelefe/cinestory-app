import { maintenanceState } from '../services/runtimeConfig.service.js';

export async function maintenanceMiddleware(req, res, next) {
  try {
    if (String(req.path || '') === '/health') return next();
    const state = await maintenanceState();
    const path = String(req.path || '');
    const allowedDuringMaintenance = path === '/health' || path.startsWith('/api/v1/admin') || path.startsWith('/api/v1/auth') || path.startsWith('/api/v1/support');
    if (state.enabled && !allowedDuringMaintenance) {
      res.set('Retry-After', '300');
      return res.status(503).json({ success: false, code: 'MAINTENANCE_MODE', message: state.message || 'Veylo is briefly offline for maintenance. Please try again shortly.' });
    }
  } catch {
    // A configuration read must never take the API down. Continue with the
    // safe default of serving the request.
  }
  return next();
}
