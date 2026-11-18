// Shareable dashboard state. Query parameters are scoped to this page.
(async function(){
 const params=new URLSearchParams(location.search);
 if(params.has('s')){try{const token=params.get('s'),packed=Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const text=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();const decoded=new URLSearchParams(text);for(const [k,v] of decoded)if(!params.has(k))params.set(k,v);}catch(e){console.warn('Invalid shared view code');}}
 const comparison=location.pathname.endsWith('compare.html');let restoring=true;
 const fields=comparison?{'from':'compare-start','to':'compare-end','rank':'compare-metric'}:{'from':'start','to':'end','days':'day-type','time':'period','mapMetric':'map-metric','stopMetric':'hr-metric','sort':'hr-sort','search':'hr-search'};
 const pause=()=>new Promise(r=>setTimeout(r,100));
 try{
  if(comparison){while(!document.getElementById('compare-start').value)await pause();}
  else{
   await init(params);
   if(!manifest||!Object.keys(index.routeStops).length)return;
   await firstRouteLoad;
  }
  for(const [key,id] of Object.entries(fields)){const el=document.getElementById(id);if(params.has(key)){const value=params.get(key);if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===value))el.value=value;}}
  if(comparison)drawComparison();
  else{
   if(params.has('from')||params.has('to'))document.querySelectorAll('[data-days]').forEach(b=>b.classList.remove('active'));
   if(['day','weekday','hour'].includes(params.get('view')))state.grain=params.get('view');
   state.metric=$('map-metric').value;
   if(currentPage==='overview'&&params.has('area')&&areaRows.has(params.get('area')))restoreArea(params.get('area'));
   if(params.has('direction'))state.direction=params.get('direction');
   if(params.has('stop')&&(index.routeStops[state.route]||[]).map(String).includes(params.get('stop')))state.stop=params.get('stop');
   render();document.querySelectorAll('[data-grain]').forEach(b=>b.classList.toggle('active',b.dataset.grain===state.grain));
   if(params.has('profileDirection')){$('profile-direction').dataset.chosen=params.get('profileDirection');}
   if(params.has('branch'))$('profile-branch').dataset.chosen=params.get('branch');
   if(currentPage==='routes')renderRouteProfile();
  }
  const m=comparison?comparisonMap:currentPage==='routes'?hrMap:map;
  const lat=Number(params.get('lat')),lng=Number(params.get('lng')),zoom=Number(params.get('zoom'));
  if(m&&params.has('lat')&&params.has('lng')&&params.has('zoom')&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&zoom>=0&&zoom<=19)m.setView([lat,lng],zoom,{animate:false});
 }finally{restoring=false;}
 let lastQuery='',encodeVersion=0;
 async function save(){if(restoring)return;const p=new URLSearchParams();
  for(const [key,id] of Object.entries(fields)){const el=document.getElementById(id);if(el)p.set(key,el.value);}
  if(!comparison){if(!manifest)return;p.set('city',currentCity);p.set('view',state.grain);if(currentPage==='routes'){p.set('route',state.route??'');p.set('direction',state.direction);p.set('stop',state.stop??'');p.set('profileDirection',$('profile-direction').value);p.set('branch',$('profile-branch').value);}else p.set('area',state.area??'');}
  const m=comparison?comparisonMap:currentPage==='routes'?hrMap:map;if(m){const c=m.getCenter();p.set('lat',c.lat.toFixed(6));p.set('lng',c.lng.toFixed(6));p.set('zoom',String(m.getZoom()));}
  const query=p.toString(),key=query+location.hash;if(key===lastQuery)return;lastQuery=key;const version=++encodeVersion,hash=location.hash;
  try{const packed=new Uint8Array(await new Response(new Blob([query]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());let binary='';for(const byte of packed)binary+=String.fromCharCode(byte);const token=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(version===encodeVersion)history.replaceState(null,'',location.pathname+'?s='+token+hash);}catch(e){lastQuery='';}

 }

 save();
 setInterval(save,400);
 window.addEventListener('popstate',()=>location.reload());
})();
