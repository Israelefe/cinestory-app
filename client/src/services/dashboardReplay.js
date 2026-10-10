let recording = null;
let generation = 0;
export const dashboardReplayAllowed = () => globalThis.location?.pathname === '/dashboard' && !globalThis.location.search && !globalThis.location.hash && !document.hidden;

export function replayOptions(config, isActive = () => true) {
  return {
    api_host: config.host, ui_host: config.host.includes('eu.') ? 'https://eu.posthog.com' : 'https://us.posthog.com',
    bootstrap: { distinctID: config.distinctId, isIdentifiedID: true },
    persistence: 'memory', disable_persistence: true, person_profiles: 'never', ip: false,
    autocapture: false, capture_pageview: false, capture_pageleave: false, capture_dead_clicks: false,
    capture_exceptions: false, capture_performance: false, capture_heatmaps: false, capture_web_vitals: false,
    capture_webmcp: false, disable_surveys: true, enable_recording_console_log: false,
    disable_product_tours: true, disable_conversations: true, save_campaign_params: false, save_referrer: false,
    disable_session_recording: true, disable_external_dependency_loading: true,
    advanced_disable_feature_flags: true, advanced_disable_toolbar_metrics: true,
    session_recording: {
      maskAllInputs: true, maskTextSelector: '*', maskTextFn: text => '*'.repeat(text.length),
      maskAllElementAttributes: true,
      blockSelector: '.ph-no-capture, header, nav, footer, form, input, textarea, select, img, picture, video, audio, canvas, svg, iframe, script, style, link, [contenteditable], [role="dialog"], .v-dashboard-deliveries, .v-studio-action-list',
      collectFonts: false, inlineStylesheet: false, recordCrossOriginIframes: false,
      captureJsonLd: false, recordHeaders: false, recordBody: false,
      captureCanvas: { recordCanvas: false }, canvasCapture: { maskRegionsFn: () => null },
      maskCapturedNetworkRequestFn: () => null,
      sampling: { mousemove: false }, compress_events: false
    },
    before_send: event => {
      if (!isActive() || !dashboardReplayAllowed() || event.event !== '$snapshot') return null;
      // Keep only replay transport fields. SDK defaults also contain referrers,
      // full URLs and browser properties which this integration does not need.
      const allowed = new Set(['token', 'distinct_id', '$cookieless_mode', '$device_id', '$session_id', '$window_id', '$snapshot_data', '$snapshot_bytes', '$lib', '$lib_version']);
      event.properties = Object.fromEntries(Object.entries(event.properties || {}).filter(([key]) => allowed.has(key)));
      if (Array.isArray(event.properties.$snapshot_data)) {
        event.properties.$snapshot_data = event.properties.$snapshot_data.filter(item => ![5, 6].includes(item.type)).map(item => item.type === 4 ? { ...item, data: { ...item.data, href: `${location.origin}/dashboard` } } : item);
      }
      event.properties.$geoip_disable = true;
      return event;
    }
  };
}
export function stopDashboardReplay() {
  generation += 1;
  if (!recording) return;
  const instance = recording;
  recording = null;
  instance.stopSessionRecording();
  // The SDK's opt_out_capturing() persists its decision even with memory-only
  // event storage. Keep this short-lived permission in memory and leave the
  // stopped instance opted out without a browser consent identifier.
  instance.set_config({ opt_out_capturing_by_default: true, disable_session_recording: true });
  instance.clear_opt_in_out_capturing();
}
export async function startDashboardReplay(config) {
  stopDashboardReplay();
  const version = generation;
  if (!dashboardReplayAllowed()) throw new Error('Open the dashboard to start a recording.');
  const { PostHog } = await import('posthog-js/full/no-external');
  if (version !== generation || !dashboardReplayAllowed()) return false;
  const instance = new PostHog();
  recording = instance;
  instance.init(config.projectToken, replayOptions(config, () => recording === instance && version === generation));
  instance.startSessionRecording({ sampling: true, linked_flag: true, url_trigger: true, event_trigger: true });
  // The project must also enable Session Replay. Wait for remote configuration
  // before showing an active state; a successful init is not a recording.
  for (let attempt = 0; attempt < 30; attempt++) {
    if (version !== generation) return false;
    if (!dashboardReplayAllowed()) { stopDashboardReplay(); return false; }
    if (instance.sessionRecordingStarted()) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  stopDashboardReplay();
  throw new Error('Recording is unavailable right now. You can still contact support.');
}
