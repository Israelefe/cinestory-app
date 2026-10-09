import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api.js';
const PricingContext = createContext(null);
const PRO_PRICE_NAIRA = 40000;
export const formatNaira = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
const basePricing = Object.freeze({ currency: 'NGN', amountKobo: 4_000_000, monthlyPriceNaira: PRO_PRICE_NAIRA, quote: 'pro:4000000' });
export function ProPricingProvider({ children }) {
  const [pricing, setPricing] = useState(null);
  const [plans, setPlans] = useState([]);
  const refresh = useCallback(async () => {
    try { const response = await api.get('/v1/billing/plans'); setPricing({ ...basePricing, ...response.data.pricing, billingAvailable: response.data.billingAvailable }); setPlans(Array.isArray(response.data.data) ? response.data.data : []); }
    catch { setPricing(basePricing); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <PricingContext.Provider value={{ pricing, plans, refresh, setPricing }}>{children}</PricingContext.Provider>;
}
export function useProPricing() { return useContext(PricingContext) || { pricing: null, refresh: () => {} }; }
export function ProPrice() {
  const { pricing } = useProPricing();
  return <span className="v-pro-price">{formatNaira(pricing?.monthlyPriceNaira || PRO_PRICE_NAIRA)}</span>;
}
export function PricingNotice() {
  return <div className="v-pro-pricing-note">
    <p>One price for everyone: <ProPrice /> per month, charged in naira.</p>
    <small>Your bank or card provider may convert the charge to another currency and add a fee.</small>
  </div>;
}
