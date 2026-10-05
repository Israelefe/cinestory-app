import { expect, test } from '@playwright/test';
import { CANVAS_DEMO_DELIVERY } from '../src/constants/canvasDemo.js';

const draftId = '507f1f77bcf86cd799439011';
const user = { _id: '507f1f77bcf86cd799439012', name: 'Amara', email: 'amara@example.com', emailVerified: true, onboardingComplete: true, plan: 'free' };
const widths = [[320,740],[768,1024],[834,1194],[1440,900]];
function record(count = 6, mode = 'mixed', white = false) {
  const data = structuredClone(CANVAS_DEMO_DELIVERY);
  data._id = draftId; data.publicId = 'canvas-test'; data.status = 'published'; data.kind = 'story';
  data.assets = Array.from({ length: count + 2 }, (_, index) => ({ assetId: `00000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`, url: `/veylo/web/demo-courage-${index % 6 + 1}-960.webp?canvas=${index}`, thumbnailUrl: `/veylo/web/demo-courage-${index % 6 + 1}-480.webp`, originalFilename: `photo-${index + 1}.jpg`, width: 960, height: 1280 }));
  if (count >= 8) Object.assign(data.assets[4], { url: '/veylo/demo/campaign/campaign-01-hero.webp', width: 1600, height: 1067 });
  data.curatedAssetIds = data.assets.slice(0,count).map(asset => asset.assetId);
  data.creativeDirection.frames = data.curatedAssetIds.map((assetId,index) => ({ assetId, headline: `Portrait ${index + 1}`, caption: `Courage, keep photograph ${index + 1} from your graduation. These portraits belong in your album.`, focalPoint: '50% 40%' }));
  const ids=data.curatedAssetIds;
  data.creativeDirection.sections = mode === 'single' ? [] : [{ id:'together',title:'Graduation portraits',subtitle:'Two portraits from the session.',assetIds:ids.slice(1,3) }, ...(mode==='group'?[{id:'remaining',title:'The rest of the session',subtitle:'',assetIds:[ids[0],...ids.slice(3)]}]:[])];
  data.formatConfig.canvas.checkpoints = mode==='group' ? [{id:'first-group',type:'group',sectionId:'together'},{id:'second-group',type:'group',sectionId:'remaining'}] : ids.flatMap((assetId,index)=>mode==='mixed'&&index===1?[{id:'group-point',type:'group',sectionId:'together'}]:mode==='mixed'&&index===2?[]:[{id:`photo-${index}`,type:'photo',assetId}]);
  if(mode==='group') data.curatedAssetIds=[...ids.slice(1,3),ids[0],...ids.slice(3)];
  data.v3={revision:1,step:'showcase',openingAssetId:ids[0],closingAssetId:ids.at(-1)};
  data.access={allowIndividualDownloads:true,allowDownloadAll:true,allowLikes:true};
  if(white)data.creativeDirection.palette={background:'#ffffff',surface:'#f5f5f5',text:'#111111',accent:'#9d341e'};
  return data;
}
async function init(page) {
  await page.addInitScript(()=>localStorage.setItem('veylo_cookie_preferences_v1',JSON.stringify({version:3,necessary:true,serviceAnalytics:true})));
  await page.route('**/api/v1/**',route=>route.fulfill({contentType:'application/json',body:'{"success":true,"data":{}}'}));
}
async function preview(page, data) {
  await page.goto('/__phone-preview'); await expect(page.getByText('Waiting for the preview.',{exact:true})).toBeVisible();
  await page.evaluate(delivery=>window.postMessage({type:'veylo:phone-preview-data',payload:{delivery,access:delivery.access}},location.origin),data);
  await expect(page.locator('.cv-board')).toBeVisible();
}
async function swipe(page, locator, dx, dy = 0) {
  const rect=await locator.boundingBox(), x=rect.x+rect.width*.7,y=rect.y+rect.height*.5;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=6;step++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/6,y:y+dy*step/6}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach();
}

test('Courage demo uses the same saved checkpoints as preview, with working responsive loading and real touch scroll',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await init(page);
  await page.goto('/demo/canvas?phoneView=1');await expect(page.locator('.cv-board')).toBeVisible();
  await page.getByRole('button',{name:'Explore the canvas',exact:true}).click();
  const initial=await page.evaluate(()=>scrollY);await swipe(page,page.locator('.cv-photo-open').first(),0,-180);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(initial+60);
  const signature=()=>page.locator('.cv-checkpoint').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.point,type:node.dataset.type,photos:[...node.querySelectorAll('.cv-frame-label>span')].map(el=>el.textContent)})));
  const demo=await signature();await page.getByRole('button',{name:'Open photograph 1',exact:true}).click();
  await expect.poll(()=>page.locator('.cv-focus-header small').textContent()).not.toContain('Loading');
  await page.waitForTimeout(350);await expect(page.locator('.cv-focus .pv-image-waiting')).toHaveCount(0);
  expect(await page.locator('.cv-focus figure img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await page.keyboard.press('Escape');await preview(page,structuredClone(CANVAS_DEMO_DELIVERY));expect(await signature()).toEqual(demo);
  await page.getByRole('button',{name:'Explore the canvas',exact:true}).click();await page.getByRole('button',{name:/Checkpoints/}).click();await page.locator('.cv-directory nav button').last().click();
  await expect(page.locator('.cv-checkpoint').last()).toHaveClass(/is-jumped/);expect(await page.locator('.cv-checkpoint').last().evaluate(node=>Math.abs(node.getBoundingClientRect().top-32)<2)).toBe(true);
});

test('normal-motion touch scrolling keeps tilted prints stationary and compact pairs separated',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
  try {
    const page=await context.newPage();await init(page);await page.goto('http://127.0.0.1:5178/demo/canvas?phoneView=1');
    await expect(page.locator('.cv-board')).toHaveAttribute('data-touch','true');
    const photo=page.locator('.cv-photo-open').first(),surface=page.locator('.cv-frame-surface').first();
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.cv-frame').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    await page.evaluate(()=>window.scrollTo({top:scrollY,left:0,behavior:'instant'}));
    const transform=await surface.evaluate(el=>getComputedStyle(el).transform);
    expect(await surface.evaluate(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).b))).toBeGreaterThan(.01);
    const initial=await page.evaluate(()=>scrollY);
    await swipe(page,photo,0,-180);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(initial+60);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(surface).toHaveCSS('transform',transform);
    await expect(page.locator('.cv-frame-drift').first()).toHaveCSS('transform','none');
    const pair=page.locator('.cv-checkpoint.is-group').first().locator('.cv-frame');
    const left=await pair.nth(0).boundingBox(),right=await pair.nth(1).boundingBox();
    expect(left.x+left.width).toBeLessThan(right.x);
    expect(right.y).toBeLessThan(left.y+left.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  } finally {await context.close();}
});

test('live preview wording updates on the same image and removal of an open group stays safe',async({page})=>{
  await page.setViewportSize({width:834,height:1194});await init(page);await page.emulateMedia({reducedMotion:'reduce'});
  const data=record();await preview(page,data);await page.getByRole('button',{name:'Open Graduation portraits',exact:true}).click();
  await expect(page.locator('.cv-focus-header small')).not.toContainText('Loading');
  data.creativeDirection.frames[1].caption='Courage, this is the wording your photographer edited.';
  await page.evaluate(delivery=>window.postMessage({type:'veylo:phone-preview-data',payload:{delivery}},location.origin),data);
  await expect(page.locator('.cv-focus-copy p')).toHaveText(data.creativeDirection.frames[1].caption);
  data.curatedAssetIds=data.curatedAssetIds.filter(id=>id!==data.assets[1].assetId&&id!==data.assets[2].assetId);data.creativeDirection.sections=[];
  await page.evaluate(delivery=>window.postMessage({type:'veylo:phone-preview-data',payload:{delivery}},location.origin),data);
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.cv-photo-open')).toHaveCount(4);
});

test('long focus copy keeps navigation visible on a short phone and mouse drag still works',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});await init(page);
  const data=record();data.creativeDirection.sections[0].title='Graduation portraits with a longer name for the photo group';data.creativeDirection.frames[1].headline='Courage, a graduation portrait for you to keep and return to';data.creativeDirection.frames[1].caption='Courage, these portraits mark your graduation. Keep them in your album, share them with the people who matter to you, and take another look whenever you want to remember this occasion.';
  await preview(page,data);await page.locator('.cv-group-heading button').click();
  const dialog=page.getByRole('dialog'), next=dialog.getByRole('button',{name:'Next',exact:true});await expect(next).toBeVisible();
  const box=await next.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(556);
  const image=dialog.locator('.cv-focus-image'),rect=await image.boundingBox();await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.5);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.5,{steps:6});await page.mouse.up();await expect(dialog.locator('h2')).toHaveText('Portrait 3');
});

test('normal-motion connections reveal in place, stay dashed, and avoid photo frames',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await init(page);await preview(page,record(8,'mixed'));
  await page.getByRole('button',{name:'Explore the canvas',exact:true}).click();
  const mask=page.locator('.cv-paths mask path').first();await expect.poll(()=>mask.evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length')))).toBe(1);
  await expect(page.locator('.cv-paths>path').first()).toHaveCSS('stroke-dasharray','4px, 7px');await expect(mask).toHaveCSS('animation-name','none');
  // Finish each arrival before checking the whole board's resting geometry.
  // Offscreen prints still have their entry offsets, and their lines are hidden.
  for(const frame of await page.locator('.cv-frame').all()){await frame.scrollIntoViewIfNeeded();await expect.poll(()=>frame.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');}
  await expect.poll(()=>page.locator('.cv-paths').evaluate(svg=>{
    const bounds=svg.getBoundingClientRect(),photos=[...document.querySelectorAll('.cv-frame-surface')].map(node=>node.getBoundingClientRect());
    return [...svg.querySelectorAll(':scope>path')].every(path=>{for(let at=0;at<=80;at++){const point=path.getPointAtLength(path.getTotalLength()*at/80),x=point.x+bounds.left,y=point.y+bounds.top;if(photos.some(rect=>x>rect.left&&x<rect.right&&y>rect.top&&y<rect.bottom))return false;}return true;});
  })).toBe(true);
});

test('staggered Canvas keeps captions upright, reveals group members separately and retains normal-motion navigation',async({page})=>{
  await page.setViewportSize({width:1440,height:600});await page.emulateMedia({reducedMotion:'no-preference'});await init(page);const data=record();
  data.creativeDirection.sections[0].assetIds=data.curatedAssetIds.slice(1,5);data.formatConfig.canvas.checkpoints=data.formatConfig.canvas.checkpoints.filter(p=>p.type==='group'||!data.curatedAssetIds.slice(3,5).includes(p.assetId));await preview(page,data);
  await page.getByRole('button',{name:'Explore the canvas',exact:true}).click();
  await expect.poll(()=>page.locator('.cv-frame').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  const poses=await page.locator('.cv-frame').evaluateAll(frames=>frames.map(el=>({tilt:parseFloat(el.style.getPropertyValue('--cv-tilt')),caption:getComputedStyle(el.querySelector('figcaption')).transform})));
  expect(poses.some(p=>p.tilt>=2)).toBe(true);expect(poses.some(p=>p.tilt<=-2)).toBe(true);expect(poses.every(p=>p.caption==='none')).toBe(true);
  await expect.poll(()=>page.locator('.cv-frame-surface').first().evaluate(el=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).b))).toBeGreaterThan(.02);
  const branchMasks=page.locator('.cv-paths mask path');
  await expect.poll(()=>branchMasks.nth(1).evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length')))).toBe(1);
  // The last member sits below the fold; its branch waits for that print.
  expect(await branchMasks.nth(4).evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length')))).toBe(0);
  await page.locator('.cv-checkpoint.is-group .cv-frame').last().scrollIntoViewIfNeeded();
  await expect.poll(()=>branchMasks.nth(4).evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length')))).toBe(1);
  await page.locator('.cv-checkpoint.is-group .cv-frame').nth(1).scrollIntoViewIfNeeded();
  await expect.poll(()=>branchMasks.nth(2).evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length')))).toBe(1);
  await page.getByRole('button',{name:'Open photograph 3',exact:true}).click();const before=await page.evaluate(()=>scrollY);
  const dialog=page.getByRole('dialog');await expect(dialog.locator('h2')).toHaveText('Portrait 3');await expect.poll(()=>dialog.locator('.cv-focus-header small').textContent()).not.toContain('Loading');
  await swipe(page,dialog.locator('.cv-focus-image'),-110);await expect(dialog.locator('h2')).toHaveText('Portrait 4');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>scrollY)).toBe(before);
  data.creativeDirection.sections[0].assetIds.reverse();
  await page.evaluate(delivery=>window.postMessage({type:'veylo:phone-preview-data',payload:{delivery}},location.origin),data);
  // Reordering a live preview keeps connections for prints already explored.
  await expect.poll(()=>branchMasks.evaluateAll(masks=>masks.slice(1,5).filter(el=>Number(getComputedStyle(el).getPropertyValue('--cv-line-length'))===1).length)).toBe(4);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.cv-frame-drift').first()).toHaveCSS('transform','none');
  await expect(page.locator('.cv-frame-surface').first()).toHaveCSS('transform','none');
});

test('aligned Canvas keeps straight prints without scroll depth in the same creator preview',async({page})=>{
  await page.setViewportSize({width:834,height:1194});await page.emulateMedia({reducedMotion:'no-preference'});await init(page);const data=record();data.formatConfig.canvas.arrangement='ordered';await preview(page,data);
  await page.getByRole('button',{name:'Explore the canvas',exact:true}).click();
  await expect(page.locator('.cv-frame-drift').first()).toHaveCSS('transform','none');
  expect(await page.locator('.cv-frame').evaluateAll(frames=>frames.every(el=>parseFloat(el.style.getPropertyValue('--cv-tilt'))===0))).toBe(true);
  await page.locator('.cv-bookend.is-closing').scrollIntoViewIfNeeded();await expect(page.locator('.cv-paths>path')).toHaveCount(6);
});

test('Canvas respects separate bookend choices and reflows long group copy when resized',async({page})=>{
  await init(page);await page.emulateMedia({reducedMotion:'reduce'});
  const data=record(12,'mixed',true);data.v3.openingAssetId=data.assets[12].assetId;data.v3.closingAssetId=data.assets[13].assetId;
  data.creativeDirection.sections[0].title='Graduation portraits to keep with your family photographs';
  data.creativeDirection.sections[0].subtitle='Courage, these portraits belong together in your album. Keep a copy for yourself and share them with the people who have supported you.';
  await page.setViewportSize({width:320,height:740});await preview(page,data);
  await expect(page.locator('.cv-bookend.is-opening img')).toHaveAttribute('src',data.assets[12].url);
  await expect(page.locator('.cv-bookend.is-closing img')).toHaveAttribute('src',data.assets[13].url);
  for(const width of [320,768,834,1440]){
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.locator('.cv-path-board').evaluate(board=>{
      const bounds=board.getBoundingClientRect(),parts=[...board.querySelectorAll('.cv-frame,.cv-group-heading,.cv-bookend')].map(el=>el.getBoundingClientRect());
      return parts.every((r,i)=>r.left>=bounds.left-2&&r.right<=bounds.right+2&&r.top>=bounds.top&&r.bottom<=bounds.bottom+2&&parts.every((o,j)=>i===j||r.right<=o.left||r.left>=o.right||r.bottom<=o.top||r.top>=o.bottom));
    })).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
    await expect(page.locator('.cv-paths>path')).toHaveCount(12);
  }
});

for(const [count,mode] of [[6,'mixed'],[8,'single'],[12,'mixed'],[18,'group']]) for(const [width,height] of widths) test(`Canvas ${count} ${mode} photos scroll without overflow at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:'reduce'}); await init(page);
  const errors=[];page.on('pageerror',error=>errors.push(error.message)); await preview(page,record(count,mode,width===320));
  await expect(page.locator('.cv-photo-open')).toHaveCount(count);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  expect(await page.locator('.cv-board').evaluate(el=>el.scrollHeight>innerHeight)).toBe(true);
  await page.mouse.move(width/2,height*.7); await page.mouse.wheel(0,700);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(400);
  const cards=page.locator('.cv-frame');
  for(let at=0;at<count;at++){await cards.nth(at).scrollIntoViewIfNeeded();await expect(cards.nth(at).locator('img')).toHaveJSProperty('complete',true);}
  await page.locator('.cv-bookend.is-closing').scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'View full gallery',exact:true})).toBeVisible();
  const checkpointCount=await page.locator('.cv-checkpoint').count();
  const groupedPhotos=await page.locator('.cv-checkpoint.is-group .cv-frame').count();
  await expect(page.locator('.cv-paths>path')).toHaveCount(checkpointCount-1+groupedPhotos);
  expect(await page.locator('.cv-path-board').evaluate(board=>{
    const bounds=board.getBoundingClientRect(), parts=[...board.querySelectorAll('.cv-frame,.cv-group-heading,.cv-bookend')].map(el=>el.getBoundingClientRect());
    return parts.every((r,i)=>r.left>=bounds.left-2&&r.right<=bounds.right+2&&r.top>=bounds.top&&r.bottom<=bounds.bottom+2&&parts.every((other,j)=>i===j||r.right<=other.left||r.left>=other.right||r.bottom<=other.top||r.top>=other.bottom));
  })).toBe(true);
  expect(errors).toEqual([]);
});

for(const [width,height] of [[320,740],[834,1194],[1440,900],[740,360]]) test(`Canvas focus has readable copy, swipe, scope and return position at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:'reduce'}); await init(page); await preview(page,record());
  await page.getByRole('button',{name:'Open Graduation portraits',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog.locator('h2')).toHaveText('Portrait 2');
  await expect(dialog.locator('.cv-focus-header small')).toContainText('01 / 02');
  await expect.poll(()=>dialog.locator('.cv-focus-header small').textContent()).not.toContain('Loading');
  expect(await dialog.locator('.cv-focus-copy>div').evaluate(el=>getComputedStyle(el).display)).toBe('block');
  const box=await dialog.boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(dialog.locator('h2')).toHaveText('Portrait 3');
  await dialog.getByRole('button',{name:'Browse all 6 photos',exact:true}).click();await expect(dialog.locator('.cv-focus-header small')).toContainText('03 / 06');
  const image=dialog.locator('.cv-focus-image');await swipe(page,image,-100);await expect(dialog.locator('h2')).toHaveText('Portrait 4');
  await swipe(page,image,100);await expect(dialog.locator('h2')).toHaveText('Portrait 3');
  await swipe(page,image,30,110);await expect(dialog.locator('h2')).toHaveText('Portrait 3');
  await page.keyboard.press('ArrowRight');await expect(dialog.locator('h2')).toHaveText('Portrait 4');
  const before=await page.evaluate(()=>scrollY);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>scrollY)).toBe(before);await expect(page.getByRole('button',{name:'Open Graduation portraits',exact:true})).toBeFocused();
});

test('Canvas keeps the current image during delayed decode, accepts a swipe across decode and retries failures',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await init(page);
  let release, failed=true;
  await page.route('**/*canvas=1',async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});
  await page.route('**/*canvas=2',async route=>{if(failed)await route.abort();else await route.continue();});
  await preview(page,record(6,'single'));
  await page.getByRole('button',{name:'Open photograph 1',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('h2')).toHaveText('Portrait 1');
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await expect(dialog.locator('.cv-focus-header small')).toContainText('02 / 06');
  await expect(dialog.locator('h2')).toHaveText('Portrait 1');
  await expect(dialog.locator('.cv-focus-image img')).toHaveAttribute('src',/canvas=0/);
  const image=dialog.locator('.cv-focus-image'),rect=await image.boundingBox();const cdp=await page.context().newCDPSession(page);
  const x=rect.x+rect.width*.7,y=rect.y+rect.height*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  release();await expect(dialog.locator('h2')).toHaveText('Portrait 2');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-110,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await expect(dialog.locator('.cv-focus-header small')).toContainText('03 / 06');await expect(dialog.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('Portrait 2');failed=false;await dialog.getByRole('button',{name:'Retry',exact:true}).click();await expect(dialog.locator('h2')).toHaveText('Portrait 3');
});

for(const [width,height] of [[320,740],[834,1194]]) test(`Canvas creator groups, protects manual copy, undoes and saves exact checkpoints at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height});await init(page);const data=record();data.status='review';data.creativeDirection.writingOverrides=[];let saved;
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname, reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:body})});
    if(path.endsWith('/auth/me'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,user})});
    if(path.endsWith('/billing/status'))return reply({plan:'free',limits:{photosPerDelivery:100},usage:{deliveriesRemaining:3}});
    if(path.endsWith('/regenerate')){const input=route.request().postDataJSON();return reply(input.writingBlocks?{blocks:input.writingBlocks.map(block=>({key:block.key,text:'Suggested graduation wording.'}))}:{headline:'One more portrait',caption:'Courage, here is another portrait from your graduation.'});}
    if(path.endsWith('/v3/showcase')){saved=route.request().postDataJSON();Object.assign(data,{curatedAssetIds:saved.assetIds,formatConfig:{canvas:saved.presentation},creativeDirection:{...data.creativeDirection,sections:saved.sectionWriting,frames:saved.frames},v3:{...data.v3,step:'design'}});return reply(data);}
    return reply(data);
  });
  await page.goto('/create?draft='+draftId);const editor=page.getByRole('region',{name:'Canvas checkpoint editor'});
  await expect(page.getByRole('heading',{name:'Arrange the connected board.'})).toBeVisible();
  await editor.getByLabel('Group name',{exact:true}).fill('Our graduation portraits');
  await editor.getByLabel('Move photo 4 to checkpoint',{exact:true}).selectOption('together');
  await expect(page.locator('.delivery-writing-review')).toContainText('Our graduation portraits');
  await expect(editor.getByLabel('Group name',{exact:true})).toHaveValue('Our graduation portraits');
  const keep=page.getByRole('button',{name:'Keep my text',exact:true});for(let count=await keep.count();count>0;count--)await keep.first().click();
  await page.getByRole('button',{name:'Undo photo change',exact:true}).click();await expect(editor.getByLabel('Move photo 4 to checkpoint',{exact:true})).toHaveValue('');
  await editor.getByRole('button',{name:'Keep every photo on its own',exact:true}).click();await expect(editor.locator('.cv-editor-points>li')).toHaveCount(6);
  await editor.getByLabel('Select photo 1 to combine',{exact:true}).check();await editor.getByLabel('Select photo 2 to combine',{exact:true}).check();await editor.getByLabel('New group name',{exact:true}).fill('The first portraits');await editor.getByRole('button',{name:'Combine 2 photos',exact:true}).click();
  await expect(editor.getByLabel('Group name',{exact:true})).toHaveValue('The first portraits');
  for(let count=await keep.count();count>0;count--)await keep.first().click();
  await editor.getByLabel('Place the next added photo',{exact:true}).selectOption({label:'In The first portraits'});
  await page.getByRole('button',{name:'Add another showcase photo',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Choose photo-7.jpg',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Use this photo',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Headline')).toHaveValue('One more portrait');await expect(page.locator('.v3-showcase-item>img')).toHaveAttribute('alt','photo-7.jpg');
  for(let count=await keep.count();count>0;count--)await keep.first().click();
  await page.getByRole('button',{name:'Move later',exact:true}).click();await expect(editor.locator('.cv-editor-points>li').first().locator('strong').first()).toHaveText('Individual photograph');
  await page.getByRole('button',{name:'Undo photo change',exact:true}).click();await expect(editor.locator('.cv-editor-points>li').first().locator('strong').first()).toContainText('The first portraits');
  await editor.getByRole('button',{name:'Preview Canvas',exact:true}).click();const previewFrame=page.frameLocator('.cv-creator-preview iframe');await expect(previewFrame.locator('.cv-board')).toBeVisible();await expect(previewFrame.locator('.cv-photo-open')).toHaveCount(7);
  await page.getByRole('button',{name:'Close Canvas preview',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect.poll(()=>saved?.presentation?.checkpoints?.length).toBe(5);
  expect(saved.sectionWriting).toHaveLength(1);expect(saved.sectionWriting[0].title).toBe('The first portraits');expect(saved.sectionWriting[0].assetIds).toHaveLength(3);expect(saved.assetIds).toHaveLength(7);expect(saved.presentation.checkpoints[0].type).toBe('group');
});
