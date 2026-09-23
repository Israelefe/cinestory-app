import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import ContentComposition from './Composition.jsx';
import { totalFrames } from './timing.js';

const sizes = { video: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], carousel: [1080, 1350] };
export default function Preview({ version, format, sceneIndex, reducedMotion }) {
  const [width, height] = sizes[format];
  const props = useMemo(() => ({ ...version.preview, width, height, still: format !== 'video', format, sceneIndex, reducedMotion }), [version.preview, width, height, format, sceneIndex, reducedMotion]);
  return <div className={`cs-player-stage cs-player-${format}`}><div className="cs-player-wrap"><Player key={`${version.id}-${format}-${sceneIndex}`} component={ContentComposition} inputProps={props} durationInFrames={totalFrames(props)} compositionWidth={width} compositionHeight={height} fps={30} controls={format === 'video'} autoPlay={false} loop={!reducedMotion} clickToPlay={format === 'video'} showVolumeControls={format === 'video'} style={{ width: '100%', aspectRatio: `${width} / ${height}`, borderRadius: 4 }} errorFallback={() => <div className="cs-preview-error">This preview could not load. Refresh the campaign to try again.</div>} /></div></div>;
}
