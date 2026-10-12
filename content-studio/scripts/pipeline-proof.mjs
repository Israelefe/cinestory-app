// Offline integration proof: real persistence, media tools, templates and ZIP export;
// deterministic provider doubles only. This is not a live voice/model calibration.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { configuration, root } from '../src/server/config.mjs';
import { initialiseStorage, atomicWrite, contained, hash } from '../src/server/storage.mjs';
import { openDatabase, setSetting } from '../src/server/database.mjs';
import { createJob, getJob, saveStage, recordReview, revise } from '../src/server/jobs.mjs';
import { readKnowledge, sourceFingerprint } from '../src/server/knowledge.mjs';
import { handlers } from '../src/server/pipeline.mjs';
import { storeImage } from '../src/server/assets.mjs';
import { run, tool, probe, storeMedia } from '../src/server/media.mjs';
const config = configuration({ data: path.join(root, 'data/tests/pipeline-' + randomUUID()) }); await initialiseStorage(config);
const db = openDatabase(config), originalFetch = globalThis.fetch;
let job;
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const voiceover = { hook: 'Photographers, make the handover count.', problem: 'An ordinary link can feel unfinished.', demo: 'Present your finished collection with Veylo.', result: 'Your portraits, ready for their first viewing.', cta: 'Get started for free. Link in bio.' };
const clips = ['proof-opening', 'proof-interaction', 'proof-gallery'];
const variants = ['pain', 'result', 'curiosity'].map((angle, i) => ({ id: 'v' + i, title: ['The ordinary link', 'A considered first viewing', 'Portraits worth opening'][i], angle, audience: 'portrait', featureId: 'photoswap', hookType: angle + '-handover', voiceover: { ...voiceover, hook: [voiceover.hook, 'Portraits deserve a considered first viewing.', 'Studio owners, how does your handover feel?'][i] }, onScreen: { ...voiceover, hook: ['Photographers, make the handover count.', 'Give portraits their first viewing.', 'How does your handover feel?'][i] }, captureIds: [clips[i]], factIds: ['feature:photoswap'], ctaId: 'start-free', why: 'A concrete portrait handover problem with a real product demonstration.' }));
const planScenes = [['s1','hook','HookKinetic'],['s2','problem','PainMontage'],['s3','problem','VideoScene'],['s4','demo','PhoneDemo'],['s5','demo','UIZoom'],['s6','demo','BeforeAfterSplit'],['s7','demo','BigCaptions'],['s8','result','MotionImage'],['s9','result','BigCaptions'],['s10','cta','CTACard']].map(([id,section,template]) => ({ id,section,template,enter:'wordStagger',camera:'none',transitionOut:'cut' }));
const requests = [{ id:'context',kind:'video',use:'context',purpose:'Abstract context clip for the old handover.',prompt:'A warm neutral studio backdrop. The camera moves gently toward a desk. No people or text.',aspectRatio:'9:16',resolution:'1080p',sourceSeconds:6,references:[],filename:'context.mp4' },{ id:'finished',kind:'image',use:'finished_work',purpose:'A real cleared portrait from the sample collection.',prompt:'Use a real cleared photograph from the sample shoot. Do not generate finished client work.',aspectRatio:'9:16',resolution:'1080p',sourceSeconds:0,references:[],filename:'finished.png' }];
const sceneProps = { HookKinetic:{text:voiceover.hook,emphasis:['handover']},PainMontage:{slotIds:['context'],caption:'An ordinary link can feel unfinished.'},VideoScene:{slotId:'context',caption:'Give the handover some care.',framing:'cover'},PhoneDemo:{clipId:clips[0],zoomTargets:[],caption:'Open the real Veylo client view.'},UIZoom:{clipId:clips[0],zoomTargets:[],caption:'One photograph at a time.'},BeforeAfterSplit:{slotId:'finished',clipId:clips[0],before:'The ordinary link',after:'A considered viewing'},BigCaptions:{text:'Present the finished collection with Veylo.'},MotionImage:{slotId:'finished',caption:'The finished photographs stay yours.',preset:'drift'},CTACard:{ctaId:'start-free',text:voiceover.cta} };
try {
  await atomicWrite(path.join(config.data,'credentials.json'), { groq:'isolated-test-key',deepgram:'isolated-test-key' });
  setSetting(db,'setup',{ limitsConfirmed:true,soloLicense:true }); setSetting(db,'groqLimits',{rpm:1000,rpd:10000,tpm:100000,tpd:1000000}); setSetting(db,'caps',{job:10,day:20}); setSetting(db,'providerProbe',{passed:true,model:'qwen/qwen3.8-27b',testDouble:true}); setSetting(db,'voice','flux-hannah-en'); setSetting(db,'voiceApproved',true);
  const knowledge = await readKnowledge(config,db), feature = knowledge.features.find(item=>item.id==='photoswap'); recordReview(db,'feature:photoswap',feature.digest,{decision:'approved',note:'Isolated integration fixture approval.'});
  const image = await storeImage(config,db,await sharp({create:{width:1080,height:1920,channels:3,background:'#71584c'}}).webp().toBuffer(),{name:'Original abstract test graphic'});
  db.prepare("UPDATE assets SET rights='cleared',metadata=?,license_note='Original test graphic, no people.' WHERE id=?").run(JSON.stringify({...image.metadata,consent:true}),image.id);
  await sharp(contained(config.data,image.path)).png().toFile(contained(config.data,'temp/film-source.png'));
  const testFilm = contained(config.data,'temp/film.mp4'); await run(tool('ffmpeg'),['-y','-v','error','-loop','1','-framerate','30','-i',contained(config.data,'temp/film-source.png'),'-t','6','-c:v','libx264','-pix_fmt','yuv420p',testFilm]);
  const filmId = await storeMedia(config,db,await fs.readFile(testFilm),{name:'Original abstract test film',kind:'video'}); db.prepare("UPDATE assets SET rights='cleared',metadata=json_set(metadata,'$.consent',json('true')),license_note='Original abstract test film, no people.' WHERE id=?").run(filmId);
  const film = db.prepare('SELECT * FROM assets WHERE id=?').get(filmId), fingerprint = await sourceFingerprint();
  const captures = clips.map(id=>({id,featureId:'photoswap',description:'Isolated abstract clip, not a product recording.',path:film.path,width:1080,height:1920,duration:6,fps:30,targets:[],assetIds:[],sourceDigest:fingerprint.digest,digest:hash(id)})); setSetting(db,'captures',captures); for(const clip of captures)recordReview(db,'capture:'+clip.id,clip.digest,{decision:'approved',note:'Isolated test only.'});
  const tone = contained(config.data,'temp/voice.wav'); await run(tool('ffmpeg'),['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-c:a','pcm_s16le',tone]); const wav = await fs.readFile(tone), submittedLines=[];
  const musicId = await storeMedia(config,db,wav,{name:'Original test tone',kind:'music'}); db.prepare("UPDATE assets SET rights='cleared',license_note='Original synthesized test tone.' WHERE id=?").run(musicId);
  globalThis.fetch = async (url,options) => {
    const address=String(url);
    if(address.startsWith('https://api.deepgram.com/')){submittedLines.push(JSON.parse(options.body).text);return new Response(wav,{headers:{'content-type':'audio/wav'}});}
    if(address.includes('api.groq.com')&&address.endsWith('/audio/transcriptions')){const text=submittedLines.shift();const tokens=text.trim().split(/\s+/);return json({words:tokens.map((word,i)=>({word,start:i/tokens.length*.9,end:(i+1)/tokens.length*.9}))});}
    if(address.includes('api.groq.com')&&address.endsWith('/chat/completions')){
      const body=JSON.parse(options.body), stage=body.response_format.json_schema.name, wrapped=JSON.parse(Array.isArray(body.messages[1].content) ? body.messages[1].content[0].text : body.messages[1].content), input=wrapped.input; let output;
      if(stage==='pitches')output={pitches:[0,1,2].map(i=>({id:'p'+i,title:'A considered portrait handover',featureId:'photoswap',hook:voiceover.hook,problem:voiceover.problem,benefit:voiceover.result,direction:'Use context, then demonstrate the real product.',why:'A specific photographer problem.'}))};
      else if(stage==='scripts')output={variants};
      else if(stage==='storyboard_plan')output={title:'Offline integration proof',scenes:planScenes,requests,coverSceneId:'s8'};
      else if(stage==='scene_props')output=sceneProps[input.scene.template];
      else if(stage==='vision_asset')output={scores:{relevance:5,quality:5,composition:5,style:5,artifacts:5},watermark:false,privateInformation:false,generatedText:false,allGeneratedPeopleBlackAdults:true,uncertain:false,reasons:['Test double: original abstract fixture, no people.']};
      else if(stage==='caption')output={caption:'Photographers, give the finished collection a considered handover. Get started for free. Link in bio.',hashtags:['#NigerianPhotographers','#PortraitPhotography'],factIds:['feature:photoswap']};
      else output={passed:true,reasons:['Offline test double; not a live creative or vision review.']};
      return json({choices:[{message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:300,completion_tokens:300}});
    }
    return originalFetch(url,options);
  };
  job=createJob(db,{title:'Offline full pipeline proof',audience:'portrait',focus:'photoswap',platform:'both',seconds:30,notes:'Test fixtures only.'});
  async function stage(type,payload={}){job=getJob(db,job.id);console.log(type+' / revision '+job.revision);await handlers[type]({config,db,task:{job_id:job.id,payload:{revision:job.revision,...payload}},progress:(p,message)=>{if(Number.isFinite(p)&&p>=.9)console.log(message);}});job=getJob(db,job.id);}
  await stage('pitches');await stage('scripts');saveStage(db,job,'variant',{variant:variants[0]},'variant_chosen');await stage('storyboard');
  let slots=structuredClone(job.artifacts.slots.slots);slots.context.assetId=filmId;slots.finished.assetId=image.id;saveStage(db,job,'slots',{slots},'images_ready');
  for(const slotId of ['context','finished']){await stage('vision_asset',{slotId});const request=job.artifacts.storyboard.board.requests.find(item=>item.id===slotId),entry=job.artifacts.slots.slots[slotId],asset=db.prepare('SELECT sha256 FROM assets WHERE id=?').get(entry.assetId);recordReview(db,'slot:'+job.id+':'+slotId,hash({asset:asset.sha256,prompt:request.prompt,rubric:entry.vision}),{decision:'approved',note:'Isolated test fixture review.'});}
  await stage('voice'); const cachedVoice=job.artifacts.voice.path;job=revise(db,job.id,'preview');assert.equal(job.artifacts.voice.path,cachedVoice);await stage('preview');recordReview(db,'preview:'+job.id,job.artifacts.preview._digest,{decision:'approved',note:'Automated integration approval only.'});
  await stage('music',{assetId:musicId});await stage('final'); assert.equal(job.artifacts.final.info.width,1080); assert.equal(job.artifacts.final.info.sampleRate,48000); assert.equal(job.artifacts.final.passed,true,JSON.stringify(job.artifacts.final.loudness));
  recordReview(db,'final:'+job.id,job.artifacts.final._digest,{decision:'approved',note:'Automated integration approval only.'});await stage('export'); assert.equal(job.state,'exported');assert.match(job.artifacts.export.links.tiktok,/utm_medium=organic_video/);assert.ok((await fs.stat(contained(config.data,job.artifacts.export.path))).size>1000);
  const report={providerMode:'offline deterministic doubles, not live calibration',jobId:job.id,state:job.state,revision:job.revision,templates:job.artifacts.final.scenes.map(scene=>scene.template),final:job.artifacts.final.info,loudness:job.artifacts.final.loudness,export:job.artifacts.export.path,upstreamReuseVerified:true}; await atomicWrite(path.join(config.data,'report.json'),report);console.log(JSON.stringify({...report,data:config.data},null,2));
}finally{globalThis.fetch=originalFetch;db.close();}
