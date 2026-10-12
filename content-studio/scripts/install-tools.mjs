import { tool, run } from '../src/server/media.mjs';
for (const name of ['ffmpeg', 'ffprobe']) { const result = await run(tool(name), ['-version']); console.log(result.stdout.split('\n')[0]); }
console.log('Using the media binaries shipped with the pinned Remotion compositor. No system installation is required.');
