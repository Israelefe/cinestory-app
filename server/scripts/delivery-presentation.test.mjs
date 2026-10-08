import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Delivery from '../src/models/Delivery.js';
import DeliveryShareGrant from '../src/models/DeliveryShareGrant.js';
import AnalyticsEvent from '../src/models/AnalyticsEvent.js';
import { v3Showcase, v3Theme, v3Pinboard } from '../src/controllers/deliveryV3.controller.js';
import { getPhotoDownload, streamPhotoDownload, trackPhotoDownload, getGalleryDownload } from '../src/controllers/delivery.controller.js';
import { presentationSchema, presentationIssues, sectionWritingSchema, sectionIssues, scopedPresentation } from '../src/constants/deliveryPresentation.js';
import { presentationSettings, presentationSections, albumSpreads, suggestedSpreads, numberLabel } from '../src/constants/deliveryPresentationCore.js';
import { CANVAS_DEMO, CHAPTERS_DEMO, ALBUM_DEMO, EVENT_DEMO, CAMPAIGN_DEMO, GRIDBOARD_DEMO } from '../../client/src/constants/deliveryDemoFixtures.js';
const fixtures=[CANVAS_DEMO,CHAPTERS_DEMO,ALBUM_DEMO,EVENT_DEMO,CAMPAIGN_DEMO];
const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;},redirect(code,url){this.statusCode=code;this.location=url;return this;},cookie(){},setHeader(){},write(){return true;},end(){this.ended=true;}});
function draft(record){return {...structuredClone(record),_id:'507f1f77bcf86cd799439011',status:'review',collectionAnalysis:{status:'ready',images:record.assets.map(asset=>({assetId:asset.assetId}))},v3:{...record.v3,approvedRevision:1},markModified(){},async save(){this.saved=true;}};}
function owned(t,document){t.mock.method(Delivery,'findOne',query=>{assert.equal(query.userId,'owner');return document;});}
test('paired browser/server presentation rules remain identical and numbering handles double digits',()=>{assert.equal(readFileSync(new URL('../src/constants/deliveryPresentationCore.js',import.meta.url),'utf8'),readFileSync(new URL('../../client/src/utils/deliveryPresentation.js',import.meta.url),'utf8'));assert.equal(numberLabel(12),'12');});
// Saved settings from the withdrawn redesign remain readable; these are compatibility fixtures.
for(const record of fixtures) test(`${record.format} saved settings follow persisted schemas, membership and bounds`,()=>{
 const selected=record.curatedAssetIds,settings=presentationSchema.parse({format:record.format,...presentationSettings(record)});
 assert.equal(presentationIssues(settings,record.format,selected),'');
 if(record.format!=='album'){const sections=sectionWritingSchema.parse(presentationSections(record));assert.equal(sectionIssues(sections,record.format,selected),'');}
 for(const asset of record.assets){assert.ok(asset.width>0&&asset.height>0);assert.ok(asset.url.endsWith(asset.originalFilename));}
});
test('legacy and malformed records keep every approved photo exactly once',()=>{
 const ids=ALBUM_DEMO.curatedAssetIds;
 const malformed={...ALBUM_DEMO,formatConfig:{album:{spreads:[{id:'bad',layout:'single',assetIds:[...ids.slice(0,4),ids[0],'foreign']}]}}};
 const spreads=albumSpreads(malformed);assert.deepEqual(spreads.flatMap(spread=>spread.assetIds),ids);assert.ok(spreads.every(spread=>spread.assetIds.length<=3));
 const sections=presentationSections({...CANVAS_DEMO,creativeDirection:{sections:[{id:'bad',title:'One group',assetIds:[ids[0],'foreign']}]}});assert.deepEqual(sections.flatMap(section=>section.assetIds),CANVAS_DEMO.curatedAssetIds);
 assert.equal(presentationSections({format:'canvas',assets:[]}).length,0);
 const suggestions=suggestedSpreads(ids,ALBUM_DEMO.assets.map((asset,index)=>({...asset,width:index===0?1600:960,height:1280})));assert.equal(suggestions[0].layout,'wide');assert.deepEqual(suggestions.flatMap(spread=>spread.assetIds),ids);
});
test('legacy Event scenes keep contiguous order without inventing dates or chronology',()=>{
 const record={...EVENT_DEMO,creativeDirection:{...EVENT_DEMO.creativeDirection,sections:[]}},sections=presentationSections(record);
 assert.deepEqual(sections.flatMap(section=>section.assetIds),record.curatedAssetIds);assert.ok(sections.every(section=>section.assetIds.length<=6&&section.body===''));assert.equal(sections[0].title,'Scene 01');
});
for(const record of fixtures) test(`${record.format} settings save, round-trip and invalidate approval`,async t=>{
 const document=draft(record);owned(t,document);const settings={format:record.format,...presentationSettings(record)},res=response();
 await v3Theme({params:{id:document._id},user:{id:'owner'},body:{palette:record.creativeDirection.palette,typography:record.creativeDirection.typography,presentation:settings,...(record.format==='campaign'?{usageTerms:'Use only as agreed with the studio.'}:{})}},res);
 assert.equal(res.statusCode,200,JSON.stringify(res.body));assert.ok(document.saved);assert.equal(document.v3.revision,2);assert.equal(document.v3.approvedRevision,null);assert.deepEqual(presentationSettings(document),presentationSettings(record));
 if(record.format==='campaign')assert.equal(document.formatConfig.usageTerms,'Use only as agreed with the studio.');
});
test('foreign references, wrong formats, impossible dates and layout counts fail before saving',async t=>{
 const document=draft(ALBUM_DEMO);owned(t,document);
 for(const presentation of [{format:'canvas',...presentationSettings(CANVAS_DEMO)},{format:'album',...presentationSettings(ALBUM_DEMO),spreads:[{id:'one',layout:'pair',assetIds:ALBUM_DEMO.curatedAssetIds.slice(0,1),heading:'One',note:''}]}]){const res=response();await v3Theme({params:{id:document._id},user:{id:'owner'},body:{palette:document.creativeDirection.palette,typography:document.creativeDirection.typography,presentation}},res);assert.equal(res.statusCode,400);assert.ok(!document.saved);}
 assert.ok(presentationIssues({format:'event-coverage',eventDate:'2026-02-30'},'event-coverage',[]));assert.ok(sectionIssues([],'canvas',[]));
 const sections=presentationSections(CANVAS_DEMO);sections[0].coverAssetId=CANVAS_DEMO.assets[11].assetId;assert.ok(sectionIssues(sections,'canvas',CANVAS_DEMO.curatedAssetIds));
 assert.equal(presentationSchema.safeParse({format:'canvas',...presentationSettings(CANVAS_DEMO),unexpected:true}).success,false);
});
test('new section introductions and spreads save through Showcase without losing memberships',async t=>{
 for(const record of [CHAPTERS_DEMO,ALBUM_DEMO]){
  const document=draft(record);t.mock.method(Delivery,'findOne',()=>document);const res=response();
  await v3Showcase({params:{id:document._id},user:{id:'owner'},body:{assetIds:record.curatedAssetIds,frames:record.creativeDirection.frames.map(({assetId,headline,caption})=>({assetId,headline,caption})),title:record.title,openingLine:record.creativeDirection.openingLine,closingLine:record.creativeDirection.closingLine,openingAssetId:record.v3.openingAssetId,closingAssetId:record.v3.closingAssetId,presentation:{format:record.format,...presentationSettings(record)},...(record.format==='chapters'?{sectionWriting:presentationSections(record)}:{})}},res);
  assert.equal(res.statusCode,200,JSON.stringify(res.body));assert.ok(document.saved);assert.deepEqual(presentationSettings(document),presentationSettings(record));
 }
});
test('restricted links remove all hidden presentation references without mutating stored settings',()=>{const visible=new Set([ALBUM_DEMO.assets[1].assetId]);const before=JSON.stringify(ALBUM_DEMO.formatConfig);const scoped=scopedPresentation(ALBUM_DEMO.formatConfig,visible);assert.deepEqual(scoped.album.spreads.flatMap(spread=>spread.assetIds),[...visible]);assert.equal(scoped.album.spreads[0].layout,'single');assert.equal(JSON.stringify(ALBUM_DEMO.formatConfig),before);});
test('GridBoard description saves and round-trips without dropping any arrangement assets',async t=>{
 const document=draft(GRIDBOARD_DEMO);owned(t,document);const res=response();
 const {title,layouts,selectedLayoutId,moments,palette,typography,grid,animation}=GRIDBOARD_DEMO.pinboard;
 await v3Pinboard({params:{id:document._id},user:{id:'owner'},body:{title,layouts,selectedLayoutId,moments,palette,typography,grid,animation,description:'  Lora, here is your birthday collection.  '}},res);
 assert.equal(res.statusCode,200,JSON.stringify(res.body));assert.equal(document.pinboard.description,'Lora, here is your birthday collection.');assert.equal(document.v3.approvedRevision,null);
 for(const layout of document.pinboard.layouts)assert.deepEqual(new Set(layout.assetOrder),new Set(document.assets.map(asset=>asset.assetId)));
});
for(const individual of [false,true])for(const bulk of [false,true])test(`independent download permissions: individual=${individual}, bulk=${bulk}`,async t=>{
 const settings={R2_MEDIA_OFFLOAD_ENABLED:'true',R2_IMAGE_WORKER_URL:'https://media.example.test',R2_IMAGE_WORKER_SECRET:'offline-media-signing-key-with-at-least-32-characters',R2_ACCOUNT_ID:'offline',R2_ACCESS_KEY_ID:'offline',R2_SECRET_ACCESS_KEY:'offline',R2_BUCKET_NAME:'veylo'};
 const previous=Object.fromEntries(Object.keys(settings).map(name=>[name,process.env[name]]));Object.assign(process.env,settings);t.after(()=>{for(const [name,value]of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
 const document={_id:'507f1f77bcf86cd799439011',publicId:'sample',status:'published',access:{allowIndividualDownloads:individual,allowDownloadAll:bulk},assets:[{assetId:'one',publicId:'veylo/users/owner/deliveries/sample/one'}],userId:{},async save(){}};
 t.mock.method(Delivery,'findOne',()=>{const query=Promise.resolve(document);query.select=query.populate=()=>query;return query;});t.mock.method(Delivery,'updateOne',async()=>({}));t.mock.method(AnalyticsEvent,'create',async()=>({}));t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(String(url),'https://media.example.test/v2/rpc/archive');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body).files,[{key:document.assets[0].publicId,name:'one'}]);return Response.json({key:'veylo/system/media-manifests/offline'});});
 const req={params:{publicId:'sample',assetId:'one'},query:{},headers:{},get:()=>'',originalUrl:'/test',socket:{remoteAddress:'127.0.0.1'},ip:'127.0.0.1'};
 for(const handler of [getPhotoDownload,streamPhotoDownload,trackPhotoDownload]){const res=response();await handler(req,res);assert.equal(res.statusCode,individual?(handler===streamPhotoDownload?302:200):403,handler.name);if(individual&&handler===streamPhotoDownload)assert.match(res.location,/^https:\/\/media\.example\.test\/v2\/file\//);}
 const res=response();await getGalleryDownload(req,res);assert.equal(res.statusCode,bulk?200:403);
});
