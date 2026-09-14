export const PRO_PRICE_KOBO = 2_500_000;
export const PRO_PRICE_NAIRA = 25_000;

export const PLAN_DEFINITIONS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Veylo Free',
    monthlyPriceNaira: 0,
    deliveriesPerMonth: 3,
    photosPerDelivery: 100,
    formats: ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album'],
    branding: 'veylo',
    portfolio: false,
    personalStorageBytes: 0
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Veylo Pro',
    monthlyPriceNaira: PRO_PRICE_NAIRA,
    deliveriesPerMonth: null,
    photosPerDelivery: 500,
    formats: ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album'],
    branding: 'studio',
    portfolio: true,
    personalStorageBytes: 50 * 1024 * 1024 * 1024
  })
});

export function publicPlans() {
  return Object.values(PLAN_DEFINITIONS).map(plan => ({
    ...plan,
    personalStorageGb: Math.round(plan.personalStorageBytes / (1024 ** 3)),
    personalStorageBytes: undefined
  }));
}
