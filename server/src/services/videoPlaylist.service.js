export function parseHlsPlaylist(text, duration) {
  const segments = []; let seconds;
  if (!text.startsWith('#EXTM3U') || !text.includes('#EXT-X-ENDLIST')) throw new Error('Incomplete playback playlist.');
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#EXTINF:')) seconds = Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#')) {
      if (line !== `s${String(segments.length).padStart(6, '0')}.ts` || !Number.isFinite(seconds) || seconds <= 0 || seconds > 12) throw new Error('Invalid playback segment.');
      segments.push({ seconds }); seconds = undefined;
    }
  }
  const total = segments.reduce((sum, row) => sum + row.seconds, 0);
  if (!segments.length || segments.length > 6000 || Math.abs(total - duration) > Math.max(2, duration * .001)) throw new Error('Playback duration did not match the original.');
  return segments;
}
