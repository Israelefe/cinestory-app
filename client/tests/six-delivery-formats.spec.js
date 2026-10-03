import { expect, test } from '@playwright/test';
import { CANVAS_DEMO, CHAPTERS_DEMO, ALBUM_DEMO, EVENT_DEMO, CAMPAIGN_DEMO, GRIDBOARD_DEMO } from '../src/constants/deliveryDemoFixtures.js';
const fixtures={canvas:CANVAS_DEMO,chapters:CHAPTERS_DEMO,album:ALBUM_DEMO,'event-coverage':EVENT_DEMO,campaign:CAMPAIGN_DEMO,gridboard:GRIDBOARD_DEMO};
test.describe.configure({ mode: 'parallel' });
const sizes=[[320,740],[390,844],[640,900],[768,1024],[834,1112],[1024,768],[1280,720],[1440,900]];
async function setup(page,delivery){await page.addInitScript(()=>localStorage.setItem('veylo_cookie_preferences_v1',JSON.stringify({version:3,necessary:true,serviceAnalytics:true})));await page.route('**/api/v1/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:delivery})}));}
for(const [format,record] of Object.entries(fixtures))for(const [width,height] of sizes)test(`${format} spacious demo at ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page,record);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`/demo/${format}?phoneView=1`);
 await expect(page.locator(format==='gridboard'?'.pb-intro h1':'.pv-viewer h1,.pv-album-page h2').first()).toBeVisible();
 await expect.poll(()=>page.locator(format==='gridboard'?'.pb-tile img':'.pv-main img').first().evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 if(format!=='canvas'&&format!=='gridboard')await expect(page.getByRole('button',{name:'Open full gallery',exact:true})).toHaveCount(0);
 if(width===834||width===320)await page.screenshot({path:`../.visual-review/six-formats-${format}-${width}.png`});
});
test('Canvas keeps the current photo during loading and ignores a late neighbour response',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,CANVAS_DEMO);let release;const held=new Promise(resolve=>{release=resolve;});
 await page.route('**'+CANVAS_DEMO.assets[1].url,async route=>{await held;await route.continue();});
 await page.goto('/demo/canvas?phoneView=1');await page.getByRole('button',{name:'Open photograph 1',exact:true}).click();const focus=page.getByRole('dialog',{name:'Photograph focus'}),photo=focus.locator('.pv-focus-image img');await expect.poll(()=>photo.getAttribute('src')).toBe(CANVAS_DEMO.assets[0].url);
 await focus.getByRole('button',{name:'Next',exact:true}).click();await expect(photo).toHaveAttribute('src',CANVAS_DEMO.assets[0].url);await expect(focus.locator('p').first()).toHaveText(CANVAS_DEMO.creativeDirection.frames[0].caption);
 await focus.getByRole('button',{name:'Next',exact:true}).click();await expect.poll(()=>photo.getAttribute('src')).toBe(CANVAS_DEMO.assets[2].url);release();await expect(photo).toHaveAttribute('src',CANVAS_DEMO.assets[2].url);
});
test('Album failed spread keeps the last page and records an explicit skip without unlocking unread pages',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,ALBUM_DEMO);await page.route('**'+ALBUM_DEMO.assets[1].url,route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto('/demo/album?phoneView=1');await page.getByRole('button',{name:'Open album',exact:true}).click();await expect(page.locator('.pv-album-page')).toContainText(ALBUM_DEMO.formatConfig.album.spreads[0].heading);await page.locator('.pv-spread-end').scrollIntoViewIfNeeded();await expect(page.locator('.pv-album-navigation>span')).toContainText('1 of');
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByRole('button',{name:'Skip this page'})).toBeVisible();await expect(page.locator('.pv-album-page')).toContainText(ALBUM_DEMO.formatConfig.album.spreads[0].heading);await expect(page.getByRole('button',{name:'Open full gallery',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Skip this page'}).click();await expect(page.locator('.pv-album-page')).toContainText(ALBUM_DEMO.formatConfig.album.spreads[2].heading);await page.getByRole('button',{name:'Pages',exact:true}).click();await expect(page.locator('.pv-overview>button').nth(2)).toContainText('Skipped');
});
test('Canvas focus retains its image, restores focus and offers immediate full gallery',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page,CANVAS_DEMO);await page.goto('/demo/canvas?phoneView=1');
 const tile=page.getByRole('button',{name:'Open photograph 1',exact:true});await tile.click();const focus=page.getByRole('dialog',{name:'Photograph focus'});await expect(focus.locator('.pv-focus-image img')).toBeVisible();
 await focus.getByRole('button',{name:'Next',exact:true}).click();await expect.poll(()=>focus.locator('.pv-focus-image img').getAttribute('src')).toBe(CANVAS_DEMO.assets[1].url);await focus.getByRole('button',{name:'Close photograph'}).press('Escape');await expect(tile).toBeFocused();
 await page.getByRole('button',{name:'Open full gallery',exact:true}).first().click();await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(12);
});
test('Chapter rooms render every photograph, restrict early enlargement and unlock after every footer',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,CHAPTERS_DEMO);await page.goto('/demo/chapters?phoneView=1');
 const covers=page.locator('.pv-chapter-cover');for(const index of [1,0,2]){
  await covers.nth(index).click();const room=page.getByRole('dialog',{name:CHAPTERS_DEMO.creativeDirection.sections[index].title});await expect(room.locator('.pv-photo-card')).toHaveCount(CHAPTERS_DEMO.creativeDirection.sections[index].assetIds.length);
  if(index===1){await room.locator('.pv-photo-card>button').first().click();await expect(page.locator('.client-gallery')).toBeVisible();await expect(page.locator('.client-gallery-grid')).toHaveCount(0);await expect(page.getByRole('button',{name:'Next photograph'})).toHaveCount(0);await page.getByRole('button',{name:'Return to presentation'}).click();}
  await room.locator('.pv-room-footer').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.pv-intro small').textContent()).toContain(index===1?'1 of':index===0?'2 of':'3 of');await room.getByRole('button',{name:'Chapters',exact:true}).click();await expect(covers.nth(index)).toBeFocused();
 }
 await page.getByRole('button',{name:'Open full gallery',exact:true}).first().click();await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(10);
});
test('Album seeking cannot bypass unread spreads; decoded mobile pairs count after their ending and completion stays unlocked',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,ALBUM_DEMO);await page.goto('/demo/album?phoneView=1');
 await page.getByRole('button',{name:'Pages',exact:true}).click();await page.locator('.pv-overview>button').last().click();await expect(page.locator('.pv-album-page')).toContainText(ALBUM_DEMO.creativeDirection.closingLine);await page.locator('.pv-spread-end').scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Open full gallery',exact:true})).toHaveCount(0);
 for(let index=0;index<ALBUM_DEMO.formatConfig.album.spreads.length;index++){
  await page.getByRole('button',{name:'Pages',exact:true}).click();await page.locator('.pv-overview>button').nth(index+1).click();await expect(page.locator('.pv-album-page')).toContainText(ALBUM_DEMO.formatConfig.album.spreads[index].heading);await expect(page.locator('.pv-album-photos img')).toHaveCount(ALBUM_DEMO.formatConfig.album.spreads[index].assetIds.length);await expect(page.locator('.pv-album-page')).toHaveAttribute('aria-busy','false');await page.locator('.pv-spread-end').scrollIntoViewIfNeeded();await expect.poll(()=>page.locator('.pv-album-navigation>span').textContent()).toContain(`${index+2} of`);
 }
 await expect(page.getByRole('button',{name:'Open full gallery',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.getByRole('button',{name:'Open full gallery',exact:true}).first()).toBeVisible();
});
for(const format of ['event-coverage','campaign'])test(`${format} observed ending unlocks gallery while early enlargement is restricted`,async({page})=>{
 await page.setViewportSize({width:834,height:1112});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,fixtures[format]);await page.goto(`/demo/${format}?phoneView=1`);await page.getByRole('button',{name:'Open cover photograph'}).click();await expect(page.locator('.client-gallery-grid')).toHaveCount(0);await page.getByRole('button',{name:'Return to presentation'}).click();await page.locator('.pv-ending').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Open full gallery',exact:true}).first().click();await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(fixtures[format].assets.length);
});
test('GridBoard compact sheets retain filters, arrangements, modal focus and independent download controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});const record=structuredClone(GRIDBOARD_DEMO);record.access.allowIndividualDownloads=false;await setup(page,record);await page.goto('/d/test?phoneView=1');
 const find=page.getByRole('button',{name:'Find photos',exact:true});await find.click();const sheet=page.getByRole('dialog',{name:'Find photos'});await sheet.getByLabel('Arrangement').selectOption('colour-flow');await sheet.getByRole('button',{name:'View photographs',exact:true}).click();await expect(find).toBeFocused();await expect(page.locator('.pb-tile')).toHaveCount(6);
 await page.getByRole('button',{name:'Open photograph 1',exact:true}).click();const lightbox=page.getByRole('dialog',{name:'Photograph',exact:true});await expect(lightbox.getByRole('button',{name:'Download photo',exact:true})).toHaveCount(0);await lightbox.getByRole('button',{name:'Close photograph'}).press('Tab');expect(await page.evaluate(()=>!!document.activeElement.closest('.pb-lightbox'))).toBe(true);await lightbox.getByRole('button',{name:'Close photograph'}).press('Escape');
 await page.getByRole('button',{name:'More gallery actions'}).click();await expect(page.getByRole('button',{name:'Download all photos'})).toBeVisible();await expect(page.getByRole('button',{name:'Make a WhatsApp Status card'})).toBeVisible();
});
test('Album Read again clears the reading run and gallery access',async({page})=>{
 await page.setViewportSize({width:834,height:1194});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,ALBUM_DEMO);await page.goto('/demo/album?phoneView=1');
 const { completePresentation }=await import('./helpers/presentationGallery.js');await completePresentation(page,'album');await page.getByRole('button',{name:'Read again',exact:true}).click();
 await expect(page.locator('.pv-album-toolbar>span')).toHaveText('01 / 06');await expect(page.getByRole('button',{name:'Open full gallery',exact:true})).toHaveCount(0);await expect(page.locator('.pv-album-navigation>span')).toContainText('0 of');
});
test('Campaign handoff respects downloads and saved file-set gallery membership',async({page})=>{
 await page.setViewportSize({width:390,height:844});const record=structuredClone(CAMPAIGN_DEMO);record.access.allowDownloadAll=false;record.access.allowIndividualDownloads=false;await setup(page,record);await page.goto('/d/test?phoneView=1');
 await expect(page.getByRole('button',{name:'Save file list'})).toHaveCount(0);await page.locator('.pv-ending').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Open full gallery',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Save file list'})).toHaveCount(0);const group=record.formatConfig.campaign.fileSets[0];await page.getByLabel('File set',{exact:true}).selectOption(group.id);await expect(page.locator('.client-gallery-grid>figure')).toHaveCount(group.assetIds.length);
 await page.locator('.client-gallery-photo').first().click();await expect(page.getByRole('button',{name:'Download photograph',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'All photographs',exact:true}).click();await expect(page.getByLabel('File set',{exact:true})).toHaveValue(group.id);
});
const draftId='507f1f77bcf86cd799439011';
for(const format of ['canvas','event-coverage','campaign'])test(`${format} uses the photographer's selected group lead`,async({page})=>{
 const record=structuredClone(fixtures[format]),section=record.creativeDirection.sections[0];section.coverAssetId=section.assetIds.at(-1);await setup(page,record);await page.goto('/d/test?phoneView=1');
 const lead=page.locator(format==='canvas'?'.pv-canvas-group':'.pv-scene').first().locator('.pv-photo-card>button').first();const index=record.curatedAssetIds.indexOf(section.coverAssetId);await expect(lead).toHaveAttribute('aria-label',`Open photograph ${index+1}`);
});
for(const [format,fixture] of Object.entries(fixtures))test(`${format} keeps actions reachable on a short phone and a white theme`,async({page})=>{
 const record=structuredClone(fixture),palette={background:'#ffffff',surface:'#f3f0e9',text:'#181817',accent:'#7c5630'};if(format==='gridboard')record.pinboard.palette=palette;else record.creativeDirection.palette=palette;
 await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,record);await page.goto('/d/test?phoneView=1');await expect(page.locator(format==='gridboard'?'.pb-intro h1':'.pv-viewer h1,.pv-album-page h2').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`../.visual-review/six-white-short-${format}.png`});
});
for(const format of ['canvas','chapters','album','event-coverage','campaign'])test(`${format} creator saves presentation settings before approval and restores them on reload`,async({page})=>{
 await page.setViewportSize({width:834,height:1112});let draft={...structuredClone(fixtures[format]),_id:draftId,status:'review',v3:{...fixtures[format].v3,step:'design'}},savedTheme;await page.addInitScript(()=>localStorage.setItem('veylo_cookie_preferences_v1',JSON.stringify({version:3,necessary:true,serviceAnalytics:true})));
 await page.route('**/api/v1/**',route=>{const path=new URL(route.request().url()).pathname;const reply=data=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});if(path.endsWith('/auth/me'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,user:{_id:'507f1f77bcf86cd799439012',name:'Amara',emailVerified:true,onboardingComplete:true,plan:'free'}})});if(path.endsWith('/billing/status'))return reply({plan:'free',limits:{photosPerDelivery:100},usage:{deliveriesRemaining:3}});if(path.endsWith('/v3/showcase')){const body=route.request().postDataJSON();draft={...draft,creativeDirection:{...draft.creativeDirection,...(body.sectionWriting?{sections:body.sectionWriting}:{})},formatConfig:{...draft.formatConfig,[{canvas:'canvas',chapters:'chapters',album:'album','event-coverage':'eventCoverage',campaign:'campaign'}[format]]:body.presentation}};return reply(draft);}if(path.endsWith('/v3/theme')){savedTheme=route.request().postDataJSON();draft={...draft,formatConfig:{...draft.formatConfig,...(savedTheme.usageTerms!==undefined?{usageTerms:savedTheme.usageTerms}:{})}};return reply(draft);}if(path.endsWith('/v3/approve')){draft={...draft,v3:{...draft.v3,step:'access'}};return reply(draft);}if(path.endsWith('/deliveries/'+draftId))return reply(draft);return reply([]);});
 await page.goto('/create?draft='+draftId);await expect(page.getByRole('heading',{name:'See how your delivery will look.'})).toBeVisible();const controls=page.locator('.v3-design-controls');
 if(format==='canvas')await controls.getByLabel('Arrangement',{exact:true}).selectOption('ordered');if(format==='chapters')await controls.getByLabel('Chapter directory').selectOption('list');if(format==='album')await controls.getByLabel('Paper tone').selectOption('dark');if(format==='event-coverage')await controls.getByLabel('Venue (optional)').fill('The conference hall');if(format==='campaign')await controls.getByLabel('Campaign usage terms').fill('Use for the agreed campaign only.');
 await page.getByRole('button',{name:'Approve and set access'}).click();await expect(page.getByRole('heading',{name:'Set the rules for this link.'}).first()).toBeVisible();expect(savedTheme.presentation.format).toBe(format);
 if(format==='canvas')expect(savedTheme.presentation.arrangement).toBe('ordered');if(format==='chapters')expect(savedTheme.presentation.directoryLayout).toBe('list');if(format==='album')expect(savedTheme.presentation.paperTone).toBe('dark');if(format==='event-coverage')expect(savedTheme.presentation.venue).toBe('The conference hall');if(format==='campaign')expect(savedTheme.usageTerms).toBe('Use for the agreed campaign only.');
 await page.reload();await expect(page.locator('.v3-panel').first()).toBeVisible();
});
