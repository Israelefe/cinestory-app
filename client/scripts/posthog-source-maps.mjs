import posthogPlugin from '@posthog/rollup-plugin';
import { archiveSourceMaps, buildRevision } from './private-source-maps.mjs';

export function posthogSourceMaps() {
  const personalApiKey = process.env.POSTHOG_CLI_API_KEY;
  const projectId = process.env.POSTHOG_CLI_PROJECT_ID;
  if (!personalApiKey && !projectId) return null;
  if (!personalApiKey || !/^\d+$/.test(projectId || '')) throw new Error('PostHog source-map upload needs both build credentials.');
  const host = process.env.POSTHOG_CLI_HOST || 'https://eu.posthog.com';
  if (!['https://eu.posthog.com', 'https://us.posthog.com'].includes(host)) throw new Error('Use the EU or US PostHog host for private source-map upload.');
  const plugin = posthogPlugin({ personalApiKey, projectId, host, sourcemaps: { enabled: true, deleteAfterUpload: true, releaseName: 'veylo-web', releaseVersion: buildRevision() } });
  const upload = plugin.writeBundle.handler;
  let config;
  plugin.configResolved = value => { config = value; };
  plugin.writeBundle.handler = async function (...args) {
    // Preserve maps for Veylo's own symbolication before the official plugin
    // removes them, and remove public copies even when upload fails.
    await archiveSourceMaps(config.root, config.build.outDir, true);
    try { await upload.apply(this, args); }
    finally { await archiveSourceMaps(config.root, config.build.outDir); }
  };
  return plugin;
}
