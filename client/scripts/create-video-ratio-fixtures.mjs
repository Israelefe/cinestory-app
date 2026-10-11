import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Small, silent, original test patterns. Keep these outside public assets.
const directory = new URL('../tests/fixtures/video-ratios/', import.meta.url);
mkdirSync(directory, { recursive: true });
const samples = [['square', 480, 480], ['classic', 640, 480], ['wide', 640, 360], ['cinema', 840, 360], ['ultrawide', 960, 270], ['portrait', 480, 600], ['portrait-classic', 400, 600], ['tall', 360, 640]];
for (const [name, width, height] of samples) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x213342:s=${width}x${height}:r=12`,
    '-vf', 'drawbox=x=0:y=0:w=iw:h=ih:c=0xff9b8e:t=8,drawgrid=w=iw/4:h=ih/4:t=1:c=white@0.2',
    '-t', '4', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '30', '-threads', '1', '-movflags', '+faststart',
    fileURLToPath(new URL(`${name}.mp4`, directory))
  ]);
}
console.log(`Created ${samples.length} aspect-ratio fixtures.`);
