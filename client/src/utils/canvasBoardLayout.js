// Coordinates belong to the responsive viewer, never to the saved delivery.
export function canvasBoardLayout({ width, points, photos, introHeight, closingHeight, measure, ordered = false }) {
  const phone = width < 620, tablet = !phone && width < 1000, scale = width / 1200;
  const inset = phone ? width * .067 : width * .0667;
  const intro = { x: inset, y: phone ? 32 : 52 * scale, width: phone ? width * .84 : width * .37, height: introHeight };
  const placements = [], frames = [], obstacles = [{ ...intro }];
  const frameHeight = (id, w) => {
    const photo = photos.get(id), ratio = photo?.width && photo?.height ? photo.width / photo.height : .75;
    const padding = phone ? 7 : tablet ? 8 : 11;
    return (w - padding * 2) / ratio + padding * 2 + 18 + (measure(`label:${id}`) || 24);
  };
  const add = (point, index, x, y, regionWidth, wide = false) => {
    const group = point.type === 'group';
    const headingWidth = phone ? width * .76 : wide ? Math.min(regionWidth, 440) : regionWidth * .9;
    const headingHeight = group ? measure(`heading:${point.id}`) || 110 : 0;
    const p = { id: point.id, x, y, width: regionWidth, headingWidth, headingX: phone ? width * (index % 4 === 3 ? .078 : .144) : 0, headingY: 0, frames: [], height: 0 };
    const localFrames = [];
    if (phone) {
      let top = group ? headingHeight + 48 : 0;
      point.assetIds.forEach((id, place) => {
        const right = group && !ordered && (place + (index % 4 === 3 ? 1 : 0)) % 2 === 1;
        const w = width * (group ? ordered ? .65 : right ? .528 : .506 : index === 0 ? .672 : .597);
        const left = width * (right ? .389 : group ? .083 : .078);
        const height = frameHeight(id, w);
        localFrames.push({ id, x: left, y: top, width: w, height, right });
        top += height + 84;
      });
    } else if (wide) {
      const columns = tablet ? 2 : 3, gap = width * .035;
      const cell = (regionWidth - gap * (columns - 1)) / columns;
      let top = headingHeight + 42;
      for (let start = 0; start < point.assetIds.length; start += columns) {
        let bottom = top;
        point.assetIds.slice(start, start + columns).forEach((id, col) => {
          const w = ordered ? cell : cell * [1, .84, .94][col];
          const fy = top + (ordered ? 0 : [0, 75, 25][col] * scale);
          const height = frameHeight(id, w);
          localFrames.push({ id, x: col * (cell + gap), y: fy, width: w, height, right: col === columns - 1 });
          bottom = Math.max(bottom, fy + height);
        });
        top = bottom + 84;
      }
    } else if (group) {
      let top = headingHeight + (tablet ? 40 : 32);
      for (let start = 0; start < point.assetIds.length; start += 2) {
        let bottom = top;
        point.assetIds.slice(start, start + 2).forEach((id, col) => {
          const secondMotif = index % 4 === 3;
          const w = ordered ? regionWidth * .43 : width * (col === 0 ? secondMotif ? .2208 : .1792 : secondMotif ? .1625 : .2042);
          const fx = col === 0 ? 0 : ordered ? regionWidth * .55 : width * (secondMotif ? .3 : .2042);
          const fy = top + (ordered ? 0 : col * (tablet ? 125 : secondMotif ? 145 : 160) * scale);
          const height = frameHeight(id, w);
          localFrames.push({ id, x: fx, y: fy, width: w, height, right: col === 1 });
          bottom = Math.max(bottom, fy + height);
        });
        top = bottom + 92 * scale;
      }
    } else {
      const w = regionWidth;
      localFrames.push({ id: point.assetIds[0], x: 0, y: 0, width: w, height: frameHeight(point.assetIds[0], w), right: index % 2 === 1 });
    }
    p.frames = localFrames;
    p.height = Math.max(headingHeight, ...localFrames.map(f => f.y + f.height));
    p.marker = group
      ? { x: phone ? width * (index % 4 === 3 ? .905 : .044) : x - 34, y: y + Math.min(headingHeight / 2, 32) }
      : { x: phone ? width * .044 : x - 26, y: y + 25 };
    if (group) obstacles.push({ x: x + p.headingX, y, width: headingWidth, height: headingHeight });
    for (const f of localFrames) {
      const global = { ...f, x: x + f.x, y: y + f.y, pointId: point.id };
      global.anchor = { x: global.right ? global.x + global.width + 14 : global.x - (phone ? 14 : 18), y: global.y + 25 };
      frames.push(global); obstacles.push(global);
    }
    placements.push(p); return p;
  };
  let cursor = intro.y + intro.height + (phone ? 48 : 68);
  let lastLeftBottom = cursor;
  for (let at = 0; at < points.length;) {
    if (phone) {
      const p = add(points[at], at, 0, cursor, width);
      cursor += p.height + (points[at + 1]?.type === 'group' ? 92 : 80);
      lastLeftBottom = cursor; at++; continue;
    }
    const wide = points[at].type === 'group' && points[at].assetIds.length > 4;
    if (wide) {
      const p = add(points[at], at, inset, cursor, width * .89, true);
      cursor = p.y + p.height + 115 * scale;
      lastLeftBottom = cursor; at++; continue;
    }
    const leftGroup = points[at].type === 'group', first = at === 0;
    const leftX = leftGroup ? inset : width * (first ? .0583 : .1375);
    const leftWidth = leftGroup ? width * .405 : width * (ordered ? .2583 : first ? .2583 : at % 4 === 0 ? .24 : .1833);
    const left = add(points[at], at, leftX, cursor, leftWidth);
    lastLeftBottom = left.y + left.height;
    let bottom = lastLeftBottom;
    const next = points[at + 1];
    if (next && !(next.type === 'group' && next.assetIds.length > 4)) {
      const rightGroup = next.type === 'group';
      const rightX = width * (rightGroup ? first ? .525 : .4917 : .67);
      const rightY = first ? Math.max(120 * scale, 75) : cursor + 50 * scale;
      const right = add(next, at + 1, rightX, rightY, rightGroup ? width * (first ? .445 : .4783) : width * .235);
      bottom = Math.max(bottom, right.y + right.height); at++;
    }
    cursor = bottom + Math.max(80, 94 * scale); at++;
  }
  const last = placements.at(-1);
  const closeY = phone ? cursor : Math.max(lastLeftBottom + 96 * scale, last?.y + 270 * scale || 0);
  const closing = { x: inset, y: closeY, width: phone ? width * .84 : width * .37, height: closingHeight };
  obstacles.push(closing);
  return { phone, intro, closing, points: placements, frames, obstacles, height: Math.max(cursor, closeY + closingHeight) + (phone ? 52 : 80 * scale) };
}

// Route through empty space rather than drawing a decorative line over prints.
function route(start, end, obstacles, width, height) {
  const pad = 10;
  const blocked = obstacles.map(r => ({ l: r.x - pad, r: r.x + r.width + pad, t: r.y - pad, b: r.y + r.height + pad }));
  const xs = [...new Set([start.x, end.x, 8, width - 8, ...blocked.flatMap(r => [r.l, r.r])].filter(x => x >= 0 && x <= width))].sort((a,b) => a-b);
  const ys = [...new Set([start.y, end.y, 8, height - 8, ...blocked.flatMap(r => [r.t, r.b])].filter(y => y >= 0 && y <= height))].sort((a,b) => a-b);
  const nx = xs.length, total = nx * ys.length, first = ys.indexOf(start.y) * nx + xs.indexOf(start.x), target = ys.indexOf(end.y) * nx + xs.indexOf(end.x);
  const valid = (x,y) => !blocked.some(r => x > r.l + .1 && x < r.r - .1 && y > r.t + .1 && y < r.b - .1);
  const segment = (x,y,tx,ty) => !blocked.some(r => x === tx ? x > r.l + .1 && x < r.r - .1 && Math.max(y,ty) > r.t + .1 && Math.min(y,ty) < r.b - .1 : y > r.t + .1 && y < r.b - .1 && Math.max(x,tx) > r.l + .1 && Math.min(x,tx) < r.r - .1);
  const distances = new Float64Array(total).fill(Infinity), parent = new Int32Array(total).fill(-1), done = new Uint8Array(total), queue = [];
  const push = entry => { queue.push(entry); for(let i=queue.length-1;i>0;){const p=(i-1)>>1;if(queue[p].score<=entry.score)break;queue[i]=queue[p];queue[p]=entry;i=p;} };
  const pop = () => { const value=queue[0], end=queue.pop();if(queue.length){queue[0]=end;for(let i=0;;){let c=i*2+1;if(c>=queue.length)break;if(c+1<queue.length&&queue[c+1].score<queue[c].score)c++;if(queue[i].score<=queue[c].score)break;[queue[i],queue[c]]=[queue[c],queue[i]];i=c;}}return value; };
  distances[first] = 0; push({ id:first, score:0 });
  while(queue.length){
    const {id}=pop(); if(done[id])continue;done[id]=1;if(id===target)break;
    const ix=id%nx, iy=Math.floor(id/nx), x=xs[ix], y=ys[iy];
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const tx=ix+dx,ty=iy+dy;if(tx<0||tx>=nx||ty<0||ty>=ys.length)continue;
      const next=ty*nx+tx, px=xs[tx],py=ys[ty];if(done[next]||!valid(px,py)||!segment(x,y,px,py))continue;
      const before=parent[id], turn=before>=0&&((before%nx===ix)!==(dx===0))?18:0;
      const cost=distances[id]+Math.abs(px-x)+Math.abs(py-y)+turn;
      if(cost<distances[next]){distances[next]=cost;parent[next]=id;push({id:next,score:cost+Math.abs(px-end.x)+Math.abs(py-end.y)});}
    }
  }
  if(!Number.isFinite(distances[target]))return []; // Never fall back to a line through a photograph.
  const result=[];for(let at=target;at>=0;at=parent[at])result.push({x:xs[at%nx],y:ys[Math.floor(at/nx)]});
  return result.reverse();
}

function rounded(points) {
  const clean = points.filter((p,i) => i===0 || i===points.length-1 || !((points[i-1].x===p.x&&points[i+1].x===p.x)||(points[i-1].y===p.y&&points[i+1].y===p.y)));
  if(clean.length<2)return '';
  let d=`M ${clean[0].x} ${clean[0].y}`;
  for(let i=1;i<clean.length-1;i++){
    const a=clean[i-1],b=clean[i],c=clean[i+1], l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(12,l1/2,l2/2);
    d+=` L ${b.x+(a.x-b.x)*r/l1} ${b.y+(a.y-b.y)*r/l1} Q ${b.x} ${b.y} ${b.x+(c.x-b.x)*r/l2} ${b.y+(c.y-b.y)*r/l2}`;
  }
  return d+` L ${clean.at(-1).x} ${clean.at(-1).y}`;
}

export function canvasBoardPaths(layout, points, width) {
  const paths=[], byId=new Map(layout.frames.map(f=>[f.id,f]));
  const connect=(id,pointId,next,start,end,waypoints=[])=>{
    const chain=[start,...waypoints,end], vertices=[];
    for(let i=1;i<chain.length;i++){
      const part=route(chain[i-1],chain[i],layout.obstacles,width,layout.height);
      if(!part.length)return;
      vertices.push(...(vertices.length?part.slice(1):part));
    }
    const d=rounded(vertices);if(d)paths.push({id,pointId,next,d});
  };
  layout.points.forEach((p,index)=>{
    const point=points[index];
    if(point.type==='group')point.assetIds.forEach((id,place)=>{
      const previous=place&&layout.phone?byId.get(point.assetIds[place-1]).anchor:p.marker;
      connect(`${point.id}-${id}`,point.id,point.id,previous,byId.get(id).anchor);
    });
    const next=layout.points[index+1];if(!next)return;
    const start=layout.phone&&point.type==='group'?byId.get(point.assetIds.at(-1)).anchor:p.marker;
    const waypoints=layout.phone&&point.type==='photo'&&next.marker.x<width*.2 ? [{x:width*.935,y:p.y-24},{x:width*.935,y:next.y+(next.headingY||0)-24}] : [];
    connect(`${point.id}-next`,point.id,next.id,start,next.marker,waypoints);
  });
  return paths;
}
