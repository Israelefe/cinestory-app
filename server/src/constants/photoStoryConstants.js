import { DELIVERY_SOUNDTRACKS } from './deliverySoundtracks.js';

// Keep the legacy Photo Story service on the exact same allowlisted catalogue
// used by Delivery V2. No client-provided music URL is trusted here.
export const CURATED_SOUNDTRACKS = DELIVERY_SOUNDTRACKS.map(track => ({
  ...track,
  audioUrl: `/api/v1/deliveries/soundtracks/${encodeURIComponent(track.id)}/audio`,
  bestFor: track.tags
}));

export const THEME_PRESETS = {
  midnight_velvet: { name: 'Midnight Velvet', bgGradient: 'from-[#0D0B18] via-[#1E1138] to-[#08080C]', accentColor: '#A24CF3', vibeTag: 'Midnight Radiance', glowColor: 'rgba(162, 76, 243, 0.35)' },
  royal_emerald: { name: 'Royal Emerald', bgGradient: 'from-[#051710] via-[#0A2E20] to-[#040C08]', accentColor: '#10B981', vibeTag: 'Royal Emerald Grace', glowColor: 'rgba(16, 185, 129, 0.35)' },
  obsidian_gold: { name: 'Obsidian Gold', bgGradient: 'from-[#14120A] via-[#2A2411] to-[#0A0906]', accentColor: '#F59E0B', vibeTag: 'Golden Sovereign', glowColor: 'rgba(245, 158, 11, 0.35)' },
  neon_violet: { name: 'Neon Violet', bgGradient: 'from-[#12072B] via-[#2E1065] to-[#0A031A]', accentColor: '#C084FC', vibeTag: 'Electric Violet', glowColor: 'rgba(192, 132, 252, 0.35)' },
  sunset_rose: { name: 'Sunset Rose', bgGradient: 'from-[#1C0A14] via-[#3B1127] to-[#0D0509]', accentColor: '#F43F5E', vibeTag: 'Sunset Rose', glowColor: 'rgba(244, 63, 94, 0.35)' },
  clean_editorial: { name: 'Clean Editorial', bgGradient: 'from-[#0F172A] via-[#1E293B] to-[#0A0E17]', accentColor: '#38BDF8', vibeTag: 'Clean Editorial', glowColor: 'rgba(56, 189, 248, 0.35)' },
  monochrome_luxury: { name: 'Monochrome', bgGradient: 'from-[#121212] via-[#242424] to-[#080808]', accentColor: '#FFFFFF', vibeTag: 'Monochrome', glowColor: 'rgba(255, 255, 255, 0.25)' },
  cyber_neon: { name: 'Deep Cyan', bgGradient: 'from-[#031B20] via-[#083344] to-[#020B0E]', accentColor: '#06B6D4', vibeTag: 'Deep Cyan', glowColor: 'rgba(6, 182, 212, 0.35)' },
  champagne_glamour: { name: 'Champagne', bgGradient: 'from-[#1C180E] via-[#362B14] to-[#0F0C07]', accentColor: '#FDE68A', vibeTag: 'Champagne', glowColor: 'rgba(253, 230, 138, 0.35)' },
  lavender_haze: { name: 'Lavender', bgGradient: 'from-[#1B0C24] via-[#38164D] to-[#0D0512]', accentColor: '#E879F9', vibeTag: 'Lavender', glowColor: 'rgba(232, 121, 249, 0.35)' },
  crimson_royalty: { name: 'Crimson', bgGradient: 'from-[#22070D] via-[#450A17] to-[#120306]', accentColor: '#E11D48', vibeTag: 'Crimson', glowColor: 'rgba(225, 29, 72, 0.35)' },
  tuscan_warmth: { name: 'Terracotta', bgGradient: 'from-[#231005] via-[#451A03] to-[#120702]', accentColor: '#FB923C', vibeTag: 'Terracotta', glowColor: 'rgba(251, 146, 60, 0.35)' },
  arctic_glacier: { name: 'Glacier', bgGradient: 'from-[#081827] via-[#0E2F4D] to-[#040C14]', accentColor: '#67E8F9', vibeTag: 'Glacier', glowColor: 'rgba(103, 232, 249, 0.35)' },
  safari_earth: { name: 'Earth', bgGradient: 'from-[#1C1308] via-[#3D260C] to-[#0E0A04]', accentColor: '#F59E0B', vibeTag: 'Earth', glowColor: 'rgba(245, 158, 11, 0.35)' },
  celestial_aurora: { name: 'Aurora', bgGradient: 'from-[#061F17] via-[#0F3D30] to-[#03110C]', accentColor: '#34D399', vibeTag: 'Aurora', glowColor: 'rgba(52, 211, 153, 0.35)' },
  velvet_amethyst: { name: 'Amethyst', bgGradient: 'from-[#150A24] via-[#2E1450] to-[#0B0512]', accentColor: '#8B5CF6', vibeTag: 'Amethyst', glowColor: 'rgba(139, 92, 246, 0.35)' }
};
