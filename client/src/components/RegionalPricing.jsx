import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api.js';
const PricingContext = createContext(null);
export const formatNaira = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
export function RegionalPricingProvider({ children }) {
  const [pricing, setPricing] = useState(null), [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get('/v1/billing/plans'); setPricing({ ...response.data.pricing, billingAvailable: response.data.billingAvailable }); }
    catch { setPricing({ region: 'unknown', monthlyPriceNaira: null, quote: null }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <PricingContext.Provider value={{ pricing, loading, refresh, setPricing }}>{children}</PricingContext.Provider>;
}
export function useRegionalPricing() { return useContext(PricingContext) || { pricing: null, loading: true, refresh: () => {} }; }
export function ProPrice() {
  const { pricing } = useRegionalPricing();
  return <span className="v-regional-price">{pricing?.monthlyPriceNaira ? formatNaira(pricing.monthlyPriceNaira) : '₦25,000 / ₦30,000'}</span>;
}
export function PricingNotice() {
  const { pricing, loading, refresh } = useRegionalPricing();
  return <div className="v-regional-notice">
    <p>{pricing?.region === 'nigeria' ? 'Nigeria: ₦25,000 per month.' : pricing?.region === 'international' ? 'Outside Nigeria: ₦30,000 per month.' : 'Pro is ₦25,000 per month in Nigeria and ₦30,000 outside Nigeria.'} Both prices are charged in naira. The features are the same.</p>
    {pricing?.region === 'international' && <p>Your card issuer converts the charge into your currency and may add a conversion fee.</p>}
    {(!pricing || pricing.region === 'unknown') && <p>{loading ? 'Checking your country…' : 'We could not confirm your country. Checkout waits for a confirmed price.'} <button type="button" onClick={refresh} disabled={loading}>Check again</button></p>}
    <small>Pricing uses your internet connection’s country. Existing subscriptions keep their agreed price. For a location error, email <a href="mailto:payment@veylo.com.ng">payment@veylo.com.ng</a>.</small>
  </div>;
}
