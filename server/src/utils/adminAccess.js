const roles = (...values) => Object.freeze(values);
export const ADMIN_READ_ACCESS = Object.freeze({
  operations: roles('superadmin', 'operations', 'read-only'),
  analytics: roles('superadmin', 'finance', 'analyst', 'read-only'),
  accounts: roles('superadmin', 'operations', 'support', 'finance'),
  deliveries: roles('superadmin', 'operations', 'support'),
  support: roles('superadmin', 'operations', 'support', 'finance'),
  finance: roles('superadmin', 'finance'),
  jobs: roles('superadmin', 'operations', 'read-only'),
  storage: roles('superadmin', 'operations'),
  configuration: roles('superadmin'),
  security: roles('superadmin')
});
export function adminSections(role) {
  const has = area => ADMIN_READ_ACCESS[area].includes(role);
  return ['overview', ...(has('operations') ? ['operations', 'issues'] : []),
    ...(has('accounts') ? ['users'] : []), ...(has('deliveries') ? ['deliveries', 'portfolio', 'volume', 'access'] : []),
    ...(has('support') ? ['support'] : []), ...(has('finance') ? ['payments'] : []),
    ...(has('jobs') ? ['aiJobs'] : []), ...(has('storage') ? ['storage', 'musicNarration'] : []),
    ...(['superadmin', 'operations', 'analyst', 'read-only'].includes(role) ? ['productAnalytics', 'visitorTraffic'] : []),
    ...(has('configuration') ? ['configuration'] : []), ...(has('security') ? ['security'] : [])];
}
export const adminMfaRequired = () => process.env.ADMIN_REQUIRE_MFA === 'true' || process.env.NODE_ENV === 'production';
