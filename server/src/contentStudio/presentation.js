import { mediaUrl } from './media.js';
import { DIMENSIONS } from './schema.js';

export function compositionProps(project, version, format = 'video', sceneIndex = 0) {
  const assets = [...project.assets, ...(version.generatedAssets || [])];
  const images = Object.fromEntries(assets.map(asset => [
    asset.id,
    {
      id: asset.id,
      src: asset.url || mediaUrl(asset.publicId),
      localPath: asset.localPath,
      kind: asset.kind,
      slotId: asset.slotId,
      width: asset.width,
      height: asset.height
    }
  ]));

  const customMusic = project.assets.find(a => a.kind === 'music');
  const musicSrc = customMusic
    ? (customMusic.url || mediaUrl(customMusic.publicId))
    : (version.music ? (version.music.url || mediaUrl(version.music.publicId, { resourceType: 'video', format: 'wav' })) : null);

  return {
    plan: version.plan,
    images,
    format,
    sceneIndex,
    width: DIMENSIONS[format][0],
    height: DIMENSIONS[format][1],
    voice: Object.fromEntries(Object.entries(version.brief.narration ? version.voice || {} : {}).map(([id, value]) => [
      id,
      {
        src: value.url || mediaUrl(value.publicId, { resourceType: 'video', format: 'mp3' }),
        localPath: value.localPath,
        duration: value.duration,
        words: value.words || []
      }
    ])),
    music: musicSrc ? { src: musicSrc, bpm: version.music?.bpm || 108 } : null,
    effect: version.effect ? (version.effect.url || mediaUrl(version.effect.publicId, { resourceType: 'video', format: 'wav' })) : null,
    still: format !== 'video',
    reducedMotion: false
  };
}

export function presentProject(project) {
  const job = project.job || {};
  return {
    id: String(project._id),
    title: project.title,
    brief: project.brief,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeVersionId: project.activeVersionId,
    assets: project.assets.map(asset => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      slotId: asset.slotId,
      width: asset.width,
      height: asset.height,
      url: asset.url || mediaUrl(asset.publicId),
      localPath: asset.localPath,
      analysis: asset.analysis
    })),
    job: {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error: job.error,
      attempts: job.attempts,
      cancelRequested: job.cancelRequested
    },
    versions: project.versions.map(version => ({
      id: version.id,
      createdAt: version.createdAt,
      instruction: version.instruction,
      plan: version.plan,
      preview: compositionProps(project, version),
      outputs: (version.outputs || []).map(output => ({
        ...output,
        publicId: undefined,
        url: output.url || (output.publicId ? mediaUrl(output.publicId, { resourceType: output.format === 'video' ? 'video' : 'image', format: output.format === 'video' ? 'mp4' : 'png' }) : undefined),
        localPath: output.localPath,
        filename: output.filename,
        exportFolder: output.exportFolder
      }))
    }))
  };
}
