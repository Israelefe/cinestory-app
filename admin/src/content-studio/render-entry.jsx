import React from 'react';
import { Composition, registerRoot } from 'remotion';
import ContentComposition from './Composition.jsx';
import { totalFrames } from './timing.js';

function Root() {
  return <Composition id="VeyloContent" component={ContentComposition} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{ plan: { scenes: [] } }} calculateMetadata={({ props }) => ({ width: props.width || 1080, height: props.height || 1920, durationInFrames: totalFrames(props) })} />;
}
registerRoot(Root);
