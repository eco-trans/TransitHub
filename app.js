'use strict';
const $=id=>document.getElementById(id), DAY=86400000;
const parse=s=>Date.parse(s+'T00:00:00Z'), iso=n=>new Date(n).toISOString().slice(0,10), fmt=n=>new Intl.NumberFormat('en-US').format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={area:null,route:null,stop:null,direction:'all',grain:'day',metric:'otp'};
const colors=['#dce9dd','#b4d4be','#87b99e','#539778','#2b7356','#164f3c'];
let manifest,overview,areaData,polygons,mapping,locations,routes,stops,index,map,polygonLayer,routeLayer,view,areaMetrics={},loadToken=0;
let cityCatalog=[],currentCity='san_francisco',cityToken=0,cityController,resizeObserver;
const routeCache=new Map(),edgeCache=new Map();
const empty=()=>({valid:0,early:0,on:0,delay:0,bins:Array(10).fill(0),days:0,observed:0});
const merge=(a,b)=>{for(const k of ['valid','early','on','delay','days','observed'])a[k]+=b[k];for(let i=0;i<10;i++)a.bins[i]+=b.bins[i];return a;};
const addValues=(a,row,offset)=>{a.valid+=row[offset];a.early+=row[offset+1];a.on+=row[offset+2];a.delay+=row[offset+3];for(let i=0;i<10;i++)a.bins[i]+=row[offset+4+i];};
const rates=a=>({otp:a.valid?a.on/a.valid*100:null,coverage:a.days?a.observed/a.days*100:null,delay:a.valid?a.delay/a.valid/60:null});
const pct=n=>n===null?'—':n.toFixed(1)+'%';
const dataConfig=window.TRANSITHUB_CONFIG||{};
async function json(name,city=currentCity,signal=cityController?.signal){return remoteJSON(upstreamBase(city)+name.replace(/^edges\//,'route_edges/'),signal);}
let cityHistory=null,areaHistory=null,historySerial=0,retrySource=null;
let areasReady=false,areasPromise=null,areaRows=new Map(),areaMetricKey=null;
function noHistory(){return state.route===null&&(state.area!==null?areaHistory?.area!==state.area:!cityHistory);}
function stopPendingHistory(){historySerial++;cancelHistory();$('cancel-history').hidden=true;$('load-history').disabled=false;}
function showHistoryStatus(text){$('remote-status').textContent=text;$('remote-controls').hidden=/ ready$/.test(text);}
function applyDates(result){
 if(!result.start)return;
 document.querySelectorAll('#start,#end,[data-days]').forEach(el=>el.disabled=false);
 manifest.start=cityHistory?.start||result.start;manifest.end=cityHistory?.end||result.end;
 for(const id of ['start','end']){$(id).min=manifest.start;$(id).max=manifest.end;}
 const oldStart=$('start').value,oldEnd=$('end').value;
 const preset=document.querySelector('[data-days].active')?.dataset.days;
 $('end').value=manifest.end;$('start').value=preset&&preset!=='all'?iso(Math.max(parse(manifest.start),parse(manifest.end)-(Number(preset)-1)*DAY)):manifest.start;
 if(!preset&&oldStart&&oldEnd&&oldStart<=manifest.end&&oldEnd>=manifest.start){$('start').value=oldStart<manifest.start?manifest.start:oldStart;$('end').value=oldEnd>manifest.end?manifest.end:oldEnd;}
}
function blankHistory(){
 view=null;for(const id of ['otp','delay','coverage','valid'])$(id).textContent='—';
 for(const id of ['otp-change','coverage-detail','scheduled','range-summary','calendar-summary','early-pct','on-pct','late-pct'])$(id).textContent='';
 for(const id of ['trend','distribution','calendar'])$(id).innerHTML='';
 $('coverage-bar').style.width='0%';$('export').disabled=true;
 $('trend-note').textContent=state.area===null?'Loading overview…':'Loading area history…';
 renderMap();renderDetail();renderHighResolution();
}
function useAreaResult(area){
 areaHistory={area};state.area=area;state.route=state.stop=null;state.direction='all';
 showHistoryStatus('Area '+area+' ready');render();
}
function restoreArea(area){
 if(!areasReady)return false;useAreaResult(area);return true;
}
function loadAreaSummaries(city,summaryManifest,token){
 if(areasReady)return Promise.resolve();
 if(areasPromise)return areasPromise;
 const signal=cityController.signal;
 const request=summaryFile(city,'areas.json.gz',summaryManifest,signal).then(rows=>{
  if(token!==cityToken||city!==currentCity)return;
  areaData=rows;areaRows=new Map();
  for(const row of rows){const id=String(row[0]);if(!areaRows.has(id))areaRows.set(id,[]);areaRows.get(id).push(row);}
  areasReady=true;areaMetricKey=null;
 }).catch(error=>{if(token===cityToken)areasPromise=null;throw error;});
 areasPromise=request;return request;
}
async function loadHistory(route=null,area=null){
 if(route!==null)showCityNetwork=false;
 if(route===null&&area===null){stopPendingHistory();state.area=state.route=state.stop=null;render();return;}
 const serial=++historySerial,city=currentCity;cancelHistory();$('retry-source').hidden=true;retrySource=()=>loadHistory(route,area);
 const label=route!==null?'Route '+route:'Area '+area;
 $('cancel-history').hidden=route===null;$('load-history').disabled=true;showHistoryStatus('Loading '+label+' summary…');
 try{
  if(area!==null){
   await loadAreaSummaries(city,manifest,cityToken);
   if(serial!==historySerial||city!==currentCity)return;
   useAreaResult(area);return;
  }
  detailController=new AbortController();const signal=AbortSignal.any([detailController.signal,cityController.signal]);
  const [rows,edges]=await Promise.all([
   routeCache.has(route)?routeCache.get(route):summaryFile(city,'routes/'+route+'.json.gz',manifest,signal),
   edgeCache.has(route)?edgeCache.get(route):summaryFile(city,'edges/'+route+'.json.gz',manifest,signal)
  ]);
  if(serial!==historySerial||city!==currentCity)return;
  if(rows.profile){const name='profiles/routes/'+route+'.json.gz';profileCache.set(name,rows.profile);while(profileCache.size>8)profileCache.delete(profileCache.keys().next().value);}
  routeCache.delete(route);routeCache.set(route,rows);edgeCache.set(route,edges);
  while(routeCache.size>4){const oldest=routeCache.keys().next().value;routeCache.delete(oldest);edgeCache.delete(oldest);}
  state.route=route;state.stop=null;state.direction='all';
  showHistoryStatus(label+' ready');render();
 }catch(e){if(serial!==historySerial||city!==currentCity)return;$('retry-source').hidden=false;showHistoryStatus(e.name==='AbortError'?'Loading paused. Click Retry to continue.':e.message);}
 finally{if(serial===historySerial){$('cancel-history').hidden=true;$('load-history').disabled=false;}}
}
let currentPage=null;
const blankScope=()=>({area:null,route:null,stop:null,direction:'all'});
let pageScopes={overview:blankScope(),routes:blankScope()};
function showPage(page){
 if(page===currentPage)return;
 if(currentPage==='routes'&&state.route===null&&!showCityNetwork)defaultRouteCity=null;
 if(currentPage){pageScopes[currentPage]={area:state.area,route:state.route,stop:state.stop,direction:state.direction};stopPendingHistory();}
 currentPage=page;Object.assign(state,pageScopes[page]);
 if(page==='routes')state.area=null;
 $('overview-view').hidden=page!=='overview';$('routes-view').hidden=page!=='routes';
 (page==='routes'?$('route-trend-slot'):$('overview-workspace')).appendChild($('trend-panel'));
 for(const name of ['overview','routes']){const link=$('nav-'+name);if(name===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 document.title=page==='routes'?'Route & stops · TransitHub':'TransitHub';
 closeRoutePicker();if(manifest){routeLayer?.clearLayers();if(state.area===null||!restoreArea(state.area)){render();if(state.area!==null&&areaHistory?.area!==state.area)loadHistory(null,state.area);}}
 requestAnimationFrame(()=>{if(page==='routes'){hrMap?.invalidateSize();fitHighResolution();}else map?.invalidateSize();});
}
function wirePages(){
 const sync=()=>showPage(['#routes','#route-performance'].includes(location.hash)?'routes':'overview');
 window.addEventListener('hashchange',sync);sync();
}
function selectedDays(start=$('start').value,end=$('end').value){const days=[];for(let t=parse(start);t<=parse(end);t+=DAY){const d=new Date(t).getUTCDay();if($('day-type').value==='weekday'&&(d===0||d===6))continue;if($('day-type').value==='weekend'&&d!==0&&d!==6)continue;days.push(iso(t));}return days;}
function periodMatches(p){return $('period').value==='all'||p==={am:0,mid:1,pm:2,eve:3}[$('period').value];}
function summarize(days){
 const dayMap=new Map(days.map(d=>[d,{date:d,...empty(),days:1}]));
 let rows=overview,doff=0,poff=1,voff=2;
 if(state.route!==null){rows=routeCache.get(state.route)||[];doff=0;poff=1;voff=4;}
 else if(state.area!==null){rows=areaRows.get(state.area)||[];doff=1;poff=2;voff=3;}
 const areaStops=state.area===null?null:new Set((mapping[state.area]||[]).map(String));
 for(const row of rows){const agg=dayMap.get(row[doff]);if(!agg||!periodMatches(row[poff]))continue;
  if(state.route===null&&state.area!==null&&String(row[0])!==state.area)continue;
  if(state.route!==null&&((areaStops&&!areaStops.has(String(row[3])))||(state.stop!==null&&String(row[3])!==state.stop)))continue;
  if(state.route!==null&&state.direction!=='all'&&String(row[2])!==state.direction)continue;
  addValues(agg,row,voff);
 }
 const total=empty(),daily=[...dayMap.values()];for(const d of daily){d.observed=d.valid>0?1:0;merge(total,d);}return {total,daily};
}
function computeAreas(days){
 const key=JSON.stringify([days,$('period').value,areasReady]);if(key===areaMetricKey)return;
 areaMetricKey=key;const allowed=new Set(days);areaMetrics={};
 for(const f of polygons.features){const id=String(f.properties.gid),dates=new Set(),total={...empty(),days:days.length};
  for(const row of areaRows.get(id)||[]){if(!allowed.has(row[1])||!periodMatches(row[2]))continue;addValues(total,row,3);if(row[3]>0)dates.add(row[1]);}
  total.observed=dates.size;areaMetrics[id]=total;
 }
}
function render(){
 if(!manifest)return;
 if(noHistory()){blankHistory();return;}
 overview=cityHistory?.overview||[];
 const start=$('start').value,end=$('end').value;
 if(!start||!end||start<manifest.start||end>manifest.end||start>end){$('filter-error').hidden=false;$('filter-error').textContent=`Choose dates between ${manifest.start} and ${manifest.end}, with From no later than To.`;$('export').disabled=true;return;}
 $('filter-error').hidden=true;$('export').disabled=false;
 const days=selectedDays();view=summarize(days);computeAreas(days);const m=rates(view.total),n=view.total;
 $('otp').innerHTML=m.otp===null?'—':m.otp.toFixed(1)+'<small>%</small>';
 $('delay').textContent=m.delay===null?'—':m.delay.toFixed(2);
 $('coverage').innerHTML=m.coverage===null?'—':m.coverage.toFixed(1)+'<small>%</small>';
 $('valid').textContent=fmt(n.valid);$('coverage-detail').textContent=`${n.observed} of ${n.days} selected days`;
 $('coverage-bar').style.width=(m.coverage||0)+'%';
 $('scheduled').textContent=state.stop!==null?'Stop observations':state.route!==null?'Route observations':state.area!==null?'Area observations':'Citywide observations';
 const len=Math.round((parse(end)-parse(start))/DAY)+1,prevStart=parse(start)-len*DAY;
 if(prevStart>=parse(manifest.start)&&m.otp!==null){const prev=rates(summarize(selectedDays(iso(prevStart),iso(parse(start)-DAY))).total).otp;const diff=prev===null?null:m.otp-prev;$('otp-change').textContent=diff===null?'':`${diff>=0?'↗ +':'↘ '}${diff.toFixed(1)} pp vs previous ${len} days`;}
 else $('otp-change').textContent='−1 to +5 minutes';
 $('range-summary').textContent=`${days.length} selected days`;
 $('early-pct').textContent=n.valid?pct(n.early/n.valid*100):'—';$('on-pct').textContent=pct(m.otp);$('late-pct').textContent=n.valid?pct((n.valid-n.early-n.on)/n.valid*100):'—';
 ensureProfile();if(currentPage==='overview')renderMap();renderTrend();renderDetail();renderDistribution();renderCalendar();if(currentPage==='routes')renderHighResolution();
}
function createMapScale(values,palette){
 const finite=values.filter(Number.isFinite),missing='#dfe4e1';
 if(!finite.length)return {min:null,max:null,colors:[missing],labels:['No data'],color:()=>missing};
 const min=finite.reduce((a,b)=>Math.min(a,b),Infinity),max=finite.reduce((a,b)=>Math.max(a,b),-Infinity);
 if(min===max){const color=palette[Math.floor(palette.length/2)];return {min,max,colors:[color],labels:[new Intl.NumberFormat('en-US',{maximumSignificantDigits:4}).format(min)],color:v=>Number.isFinite(v)?color:missing};}
 const digits=Math.max(1,Math.min(6,1-Math.floor(Math.log10(max-min)))),factor=10**digits;
 const low=Math.floor(min*factor)/factor,high=Math.ceil(max*factor)/factor;
 const label=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.min(7,digits+1)}).format(v);
 return {min:low,max:high,colors:palette,labels:[low,(low+high)/2,high].map(label),color:v=>Number.isFinite(v)?palette[Math.max(0,Math.min(palette.length-1,Math.floor((v-low)/(high-low)*palette.length)))]:missing};
}
let mapScale=createMapScale([],colors);
function colorFor(a){return a.valid?mapScale.color(rates(a)[state.metric]):'#dfe4e1';}
function areaStyle(feature){const id=String(feature.properties.gid),sel=state.area===id;return {color:sel?'#173c33':'#728e82',weight:sel?2.7:.65,fillColor:colorFor(areaMetrics[id]||empty()),fillOpacity:state.area!==null&&!sel?.3:.65};}
let mapBackgroundController;
function clearSpatialSelection(){
 if(state.area===null&&state.route===null&&state.stop===null)return;
 stopPendingHistory();loadToken++;state.area=state.route=state.stop=null;state.direction='all';
 routeLayer?.clearLayers();$('retry-source').hidden=true;showHistoryStatus('Overview ready');render();
}
function bindMapBackground(container){
 mapBackgroundController?.abort();mapBackgroundController=new AbortController();
 const options={capture:true,signal:mapBackgroundController.signal};let origin=null,moved=false;
 container.addEventListener('pointerdown',e=>{origin=[e.clientX,e.clientY];moved=false;},options);
 container.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>6)moved=true;},options);
 container.addEventListener('pointerup',()=>{origin=null;},options);
 container.addEventListener('pointercancel',()=>{origin=null;moved=true;},options);
 container.addEventListener('click',e=>{
  if(moved||e.target.closest('.leaflet-interactive,.leaflet-control,button,a,input,select'))return;
  clearSpatialSelection();
 },options);
}
function initMap(){
 const city=cityCatalog.find(c=>c.key===currentCity);
 map=L.map('map',{zoomControl:true,scrollWheelZoom:false}).setView(manifest.center||city.center,manifest.zoom||city.zoom);
 $('map').setAttribute('aria-label',manifest.city+' performance map');
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);
 bindMapBackground($('map'));
 polygonLayer=L.geoJSON(polygons,{bubblingMouseEvents:false,style:areaStyle,onEachFeature:(f,l)=>{const select=()=>{if(state.area===String(f.properties.gid)){clearSpatialSelection();return;}historySerial++;cancelHistory();$('cancel-history').hidden=true;$('load-history').disabled=false;loadToken++;state.area=String(f.properties.gid);state.route=state.stop=null;state.direction='all';routeLayer.clearLayers();if(restoreArea(state.area))return;render();if(areaHistory?.area!==state.area)loadHistory(null,state.area);};l.on('click',select);l.on('add',()=>{const el=l.getElement();el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','Select area '+f.properties.gid);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});});l.bindTooltip('Area '+f.properties.gid,{sticky:true});}}).addTo(map);
 routeLayer=L.layerGroup().addTo(map);
 resizeObserver=new ResizeObserver(()=>map?.invalidateSize());resizeObserver.observe($('map'));
}
function renderMap(){
 const palette=state.metric==='delay'?['#dce9dd','#b4d4be','#e3ddb9','#d7b18c','#c18c70','#a86050']:colors;
 mapScale=createMapScale(Object.values(areaMetrics).filter(a=>a.valid>0).map(a=>rates(a)[state.metric]),palette);
 if(!map)initMap();polygonLayer.setStyle(areaStyle);
 polygonLayer.eachLayer(l=>{const id=String(l.feature.properties.gid),v=rates(areaMetrics[id]||empty())[state.metric];l.setTooltipContent('GTFS-UI analysis area #'+id+' · '+(v===null?(!areasReady?'Loading area summaries':'No observations'):v.toFixed(1)+(state.metric==='delay'?' min':'%')));});
 $('legend-title').textContent={otp:'On-time rate (%)',delay:'Mean delay (min)',coverage:'Date coverage (%)'}[state.metric];
 $('legend-colors').innerHTML=mapScale.colors.map(c=>`<i style="background:${c}"></i>`).join('');
 $('legend-values').innerHTML=mapScale.labels.map(v=>`<span>${esc(v)}</span>`).join('');
 $('legend-values').dataset.min=mapScale.min??'';$('legend-values').dataset.max=mapScale.max??'';
 if(state.route!==null)drawRoute();
}
function drawRoute(){
 routeLayer.clearLayers();if(state.route===null)return;
 const edges=edgeCache.get(state.route)||[],bounds=[];
 for(const [a,b] of edges){if(locations[a]&&locations[b]){L.polyline([locations[a],locations[b]],{bubblingMouseEvents:false,color:'#254f43',weight:3,opacity:.8}).addTo(routeLayer);bounds.push(locations[a],locations[b]);}}
 const inside=state.area===null?null:new Set((mapping[state.area]||[]).map(String));
 for(const s of index.routeStops[state.route]||[]){if(!locations[s])continue;const selected=s===state.stop,inArea=!inside||inside.has(s);L.circleMarker(locations[s],{bubblingMouseEvents:false,radius:selected?7:inArea?4:2,weight:1.2,color:'#284b40',fillColor:selected?'#e7b369':'#fff',fillOpacity:inArea?1:.3}).bindTooltip(esc(stops[s]?.name||s)).on('click',()=>{if(!inArea)return;state.stop=s;render();}).addTo(routeLayer);}
}
const profileCache=new Map(),profilePending=new Set(),profileErrors=new Map();
function profileName(){return state.route!==null?'profiles/routes/'+state.route+'.json.gz':state.area!==null?'profiles/areas/'+state.area+'.json.gz':'profiles/overview.json.gz';}
function ensureProfile(){
 if(state.route!==null&&routeCache.get(state.route)?.profile){
  const name=profileName();profileCache.set(name,routeCache.get(state.route).profile);
  while(profileCache.size>8)profileCache.delete(profileCache.keys().next().value);
  return;
 }
 const name=profileName();if(!manifest?.files[name]||profileCache.has(name)||profilePending.has(name)||profileErrors.has(name))return;
 const token=cityToken;profilePending.add(name);
 summaryFile(currentCity,name,manifest,cityController.signal).then(data=>{
  if(token!==cityToken)return;profileCache.set(name,data);while(profileCache.size>8)profileCache.delete(profileCache.keys().next().value);
 }).catch(e=>{if(token===cityToken)profileErrors.set(name,e.message);}).finally(()=>{if(token!==cityToken)return;profilePending.delete(name);if(view&&profileName()===name){renderTrend();renderDistribution();}});
}
let profileManifestChecking=false;
async function refreshProfileManifest(){
 if(profileManifestChecking||!manifest||manifest.profiles)return;
 const token=cityToken;profileManifestChecking=true;
 try{const latest=await remoteJSON(overviewBase(currentCity)+'manifest.json',cityController.signal);if(token!==cityToken||latest.source_commit!==manifest.source_commit||!latest.profiles)return;manifest.files=latest.files;manifest.profiles=latest.profiles;ensureProfile();}
 catch(e){/* The next check retries while the offline build is running. */}
 finally{profileManifestChecking=false;}
}
setInterval(refreshProfileManifest,60000);
function filteredProfile(){
 const data=profileCache.get(profileName());if(!data)return null;
 const days=new Set(view.daily.map(r=>r.date)),route=state.route!==null,offset=route?4:2;
 const allowed=r=>days.has(iso(parse(data.start)+r[0]*DAY))&&(!route||((state.stop===null||String(r[3])===state.stop)&&(state.direction==='all'||String(r[2])===state.direction)));
 const hours=Array.from({length:24},(_,pos)=>({...empty(),pos,label:String(pos).padStart(2,'0')+':00'})),bins=Array(32).fill(0);
 if(data.format==='grouped-v1'){
  const start=parse(data.start),selected=new Set(view.daily.map(row=>(parse(row.date)-start)/DAY));
  const periods=[0,1,2,3].map(periodMatches);
  const matches=(direction,stop)=>!route||((state.stop===null||String(stop)===state.stop)&&(state.direction==='all'||String(direction)===state.direction));
  for(const [direction,stop,deltas,counts,on] of data.hours){
   if(!matches(direction,stop))continue;
   let key=0;
   for(let index=0;index<deltas.length;index++){
    key+=deltas[index];const hour=key%24;
    if(!selected.has(Math.floor(key/24))||!periods[hour>=7&&hour<10?0:hour>=10&&hour<16?1:hour>=16&&hour<19?2:3])continue;
    hours[hour].valid+=counts[index];hours[hour].on+=on[index];
   }
  }
  for(const [direction,stop,deltas,counts] of data.hist){
   if(!matches(direction,stop))continue;
   let key=0;
   for(let index=0;index<deltas.length;index++){
    key+=deltas[index];if(selected.has(Math.floor(key/128))&&periods[(key>>5)%4])bins[key%32]+=counts[index];
   }
  }
  return {hours,bins};
 }
 for(const r of data.hours){const h=r[1],period=h>=7&&h<10?0:h>=10&&h<16?1:h>=16&&h<19?2:3;if(!allowed(r)||!periodMatches(period))continue;hours[h].valid+=r[offset];hours[h].on+=r[offset+1];}
 for(const r of data.hist){if(allowed(r)&&periodMatches(r[1]))bins[r[offset]]+=r[offset+1];}
 return {hours,bins};
}
function trendDomain(values){
 const finite=values.filter(Number.isFinite);if(!finite.length)return [0,100];
 const min=Math.min(...finite),max=Math.max(...finite),pad=Math.max(1,(max-min)*.1);
 return [Math.max(0,Math.floor((min-pad)*10)/10),Math.min(100,Math.ceil((max+pad)*10)/10)];
}
function trendSeries(){
 if(state.grain==='day'){
  const weekly=new Map();for(const row of view.daily){const key=iso(parse(row.date)-((new Date(parse(row.date)).getUTCDay()+6)%7)*DAY);if(!weekly.has(key))weekly.set(key,{...empty(),first:row.date,last:row.date});const w=weekly.get(key);merge(w,row);w.last=row.date;}
  return [{name:'Daily',color:'#a7cabc',width:1.4,rows:view.daily.map(r=>({...r,label:r.date,pos:parse(r.date)}))},{name:'Weekly average',color:'#216c55',width:3,rows:[...weekly.values()].map(r=>({...r,label:r.first+' – '+r.last,pos:(parse(r.first)+parse(r.last))/2}))}];
 }
 if(state.grain==='weekday'){
  const rows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label,pos)=>({...empty(),label,pos}));
  for(const row of view.daily)merge(rows[(new Date(parse(row.date)).getUTCDay()+6)%7],row);
  return [{name:'On-time rate',color:'#216c55',width:2.8,rows}];
 }
 const profile=filteredProfile();
 return [{name:'Hourly average',color:'#216c55',width:2.8,rows:profile?.hours||Array.from({length:24},(_,pos)=>({...empty(),pos,label:String(pos).padStart(2,'0')+':00'}))}];
}

function renderTrend(){
 const series=trendSeries(),all=series.flatMap(s=>s.rows),domain=trendDomain(all.map(r=>rates(r).otp)),left=48,right=594,top=23,bottom=239;
 const positions=all.map(r=>r.pos),lo=Math.min(...positions),hi=Math.max(...positions),x=p=>lo===hi?(left+right)/2:left+(p-lo)/(hi-lo)*(right-left),y=v=>bottom-(v-domain[0])/(domain[1]-domain[0])*(bottom-top);
 let html='';
 for(let i=0;i<=4;i++){const tick=domain[0]+(domain[1]-domain[0])*i/4;html+=`<line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#edf0eb" stroke-dasharray="3 4"/><text x="38" y="${y(tick)+3}" text-anchor="end" font-size="12" fill="#819286">${Number(tick.toFixed(1))}</text>`;}
 if(!all.some(r=>r.valid))html+=`<text x="310" y="133" text-anchor="middle" font-size="15" fill="#8b9b90">${state.grain==='hour'&&!profileCache.has(profileName())?'Hourly summary is being prepared':'No observations in this selection'}</text>`;
 for(const s of series){if(state.grain!=='day'){const bw=(right-left)/s.rows.length*.7;for(const r of s.rows){const v=rates(r).otp;if(v===null)continue;const cx=left+(r.pos+.5)*(right-left)/s.rows.length;html+=`<rect x="${cx-bw/2}" y="${y(v)}" width="${bw}" height="${bottom-y(v)}" rx="2" fill="#539778"><title>${esc(r.label)}: ${pct(v)} · ${fmt(r.valid)} observations</title></rect>`;}continue;}let path='',open=false;for(const r of s.rows){const v=rates(r).otp;if(v===null){open=false;continue;}path+=(open?' L':' M')+x(r.pos)+','+y(v);open=true;}
  html+=`<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  for(const r of s.rows){const v=rates(r).otp;if(v===null)continue;html+=`<circle cx="${x(r.pos)}" cy="${y(v)}" r="${s.rows.length>60?1.8:3}" fill="${s.color}" stroke="white" stroke-width=".6"><title>${esc(s.name)} · ${esc(r.label)}: ${pct(v)} · ${fmt(r.valid)} observations</title></circle>`;}
 }
 const labels=series[0].rows,indices=state.grain==='day'?[...new Set([0,.25,.5,.75,1].map(f=>Math.floor((labels.length-1)*f)))]:state.grain==='hour'?[0,3,6,9,12,15,18,21,23]:labels.map((_,i)=>i);
 for(const i of indices){const r=labels[i];if(r)html+=`<text x="${state.grain==='day'?x(r.pos):left+(r.pos+.5)*(right-left)/labels.length}" y="262" text-anchor="middle" fill="#819286" font-size="12">${esc(state.grain==='day'?r.label.slice(5).replace('-','/'):r.label)}</text>`;}
 $('trend').innerHTML=html;$('trend').setAttribute('aria-label',state.grain==='day'?'Daily and weekly on-time performance':state.grain==='weekday'?'Weekday on-time profile':'Average on-time performance for each local hour');
 $('trend-key').innerHTML=series.map(s=>`<span><i class="line-key" style="background:${s.color}"></i>${s.name}</span>`).join('')+'<span class="unit">On time (%)</span>';
 $('trend-note').textContent=state.grain==='day'?'Observation-weighted weekly averages · weeks start Monday':state.grain==='weekday'?'Observation-weighted averages by weekday':profileCache.has(profileName())?'Observation-weighted averages by local hour':profilePending.has(profileName())?'Loading hourly summary…':'Hourly summary not available';
}
async function chooseRoute(id){
 if(currentPage!=='routes'){location.hash='routes';showPage('routes');}
 if(state.route===id)return;
 $('hr-search').value='';await loadHistory(id);
}
function renderDetail(){
 let ids=Object.keys(index.routeStops);const areaStops=state.area===null?null:new Set((mapping[state.area]||[]).map(String));
 if(areaStops)ids=[...new Set([...areaStops].flatMap(s=>index.stopRoutes[s]||[]))];ids.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 $('detail-title').textContent=state.area===null?'Routes':'Routes in area '+state.area;$('detail-subtitle').textContent=ids.length+' routes';
 $('route-list').innerHTML=ids.map(r=>`<button class="route-chip ${state.route===r?'active':''}" data-route="${esc(r)}" aria-pressed="${state.route===r}" title="${esc(routes[r]?.name||r)}"><b>${esc(r)}</b> ${esc(routes[r]?.name||'')}</button>`).join('');
 $('route-list').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseRoute(b.dataset.route));
 $('stop-row').hidden=state.route===null;
 if(state.route!==null){const eligible=new Set((routeCache.get(state.route)||[]).filter(r=>state.direction==='all'||String(r[2])===state.direction).map(r=>String(r[3])));const ids=(index.routeStops[state.route]||[]).filter(s=>(!areaStops||areaStops.has(s))&&eligible.has(s));$('stop').innerHTML='<option value="">All stops</option>'+ids.map(s=>`<option value="${esc(s)}">${esc(stops[s]?.name||s)} (${esc(s)})</option>`).join('');$('stop').value=state.stop||'';}
 $('insight').textContent=state.stop!==null?stops[state.stop]?.name||'':state.route!==null?routes[state.route]?.name||'':'';
}
function renderDistribution(){
 const groupedStop=state.stop!==null&&profileCache.get(profileName())?.routeBinsOnly;
 const fine=groupedStop?null:filteredProfile(),n=view.total,counts=fine?fine.bins:n.bins,max=Math.max(1,...counts),labels=fine?['<−10',...Array.from({length:30},(_,i)=>`${i-10}–${i-9}`),'≥20']:['<−5','−5–−1','−1–0','0–1','1–2','2–3','3–5','5–10','10–20','≥20'];let html='';
 for(let i=0;i<4;i++){const y=158-i*43;html+=`<line x1="45" x2="621" y1="${y}" y2="${y}" stroke="#edf0eb"/><text x="35" y="${y+3}" text-anchor="end" font-size="11" fill="#819286">${Number((max*i/3/Math.max(1,n.valid)*100).toFixed(1))}%</text>`;}
 const points=counts.map((c,i)=>[55+i*550/(counts.length-1),158-c/max*128]);
 if(n.valid)html+=`<path d="${points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ')}" fill="none" stroke="#2d8f81" stroke-width="2" stroke-linejoin="round"/>`;
 counts.forEach((c,i)=>{const [x,y]=points[i],early=fine?i<10:i<2,late=fine?i>=16:i>=7;if(n.valid)html+=`<circle cx="${x}" cy="${y}" r="${fine?2.5:4}" fill="${early?'#c5b69a':late?'#dc9474':'#2d8f81'}" stroke="white" stroke-width=".7"><title>${labels[i]} min: ${fmt(c)} observations (${pct(c/n.valid*100)})</title></circle>`;
 if(!fine||[0,6,11,16,21,26,31].includes(i))html+=`<text x="${x}" y="176" text-anchor="middle" font-size="11" fill="#819286">${fine?(['<−10',...Array.from({length:30},(_,j)=>String(j-10)),'≥20'][i]):labels[i]}</text>`;});
 if(!n.valid)html+='<text x="320" y="90" text-anchor="middle" font-size="14" fill="#819286">No observations in this selection</text>';
 html+=`<text x="620" y="199" text-anchor="end" font-size="11" fill="#819286">Delay (min)${fine?' · 1-minute bins':groupedStop?' · 10 delay bands':''}</text>`;$('distribution').innerHTML=html;
}
function renderCalendar(){
 const last=parse($('end').value),monday=last-((new Date(last).getUTCDay()+6)%7)*DAY,start=monday-11*7*DAY,lookup=new Map(view.daily.map(x=>[x.date,x])),max=Math.max(1,...view.daily.map(x=>x.valid));
 let html='<div class="calendar-grid"><span></span>';for(let w=0;w<12;w++)html+=`<span>${iso(start+w*7*DAY).slice(5).replace('-','/')}</span>`;
 for(let d=0;d<7;d++){html+=`<span>${['M','T','W','T','F','S','S'][d]}</span>`;for(let w=0;w<12;w++){const date=iso(start+(w*7+d)*DAY),row=lookup.get(date),n=row?.valid||0,col=n?colors[Math.min(5,Math.floor(n/max*5))]:'#e8ebec';html+=`<div class="cal-cell" tabindex="0" style="background:${col}" title="${date} · ${row?fmt(n)+' observations':'Outside selection'}"></div>`;}}
 $('calendar').innerHTML=html+'</div>';$('calendar-summary').textContent=`${view.total.observed} days with observations · ${view.total.days-view.total.observed} without`;
}
function wire(){
 wireHighResolution();
 $('city').onchange=()=>loadCity($('city').value);
 for(const id of ['start','end','day-type','period'])$(id).addEventListener('change',()=>{if(id==='start'||id==='end')document.querySelectorAll('[data-days]').forEach(b=>b.classList.remove('active'));render();});
 $('map-metric').onchange=()=>{state.metric=$('map-metric').value;if(view)renderMap();};
 $('stop').onchange=()=>{state.stop=$('stop').value||null;render();};
 document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{if(!manifest)return;$('end').value=manifest.end;$('start').value=b.dataset.days==='all'?manifest.start:iso(Math.max(parse(manifest.start),parse(manifest.end)-(Number(b.dataset.days)-1)*DAY));document.querySelectorAll('[data-days]').forEach(x=>x.classList.toggle('active',x===b));render();});
 document.querySelectorAll('[data-grain]').forEach(b=>b.onclick=()=>{state.grain=b.dataset.grain;document.querySelectorAll('[data-grain]').forEach(x=>x.classList.toggle('active',x===b));if(view)renderTrend();});
 $('method-button').onclick=()=>$('method-dialog').showModal();$('close-dialog').onclick=$('acknowledge').onclick=()=>$('method-dialog').close();
 $('export').onclick=()=>{
  const head=['city','area','route','stop','direction','day_filter','time_filter','date','observations','early','on_time','late','sum_delay_seconds','on_time_pct','has_observations'];
  const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
  const lines=view.daily.map(r=>[manifest.city,state.area??'ALL',state.route??'ALL',state.stop??'ALL',state.route===null?'all':state.direction,$('day-type').value,$('period').value,r.date,r.valid,r.early,r.on,r.valid-r.early-r.on,r.delay,r.valid?(r.on/r.valid*100).toFixed(4):'',r.observed].map(quote).join(','));
  const url=URL.createObjectURL(new Blob(['\ufeff'+head.join(',')+'\r\n'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`TransitHub_${currentCity}_${$('start').value}_${$('end').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}
function setLoading(loading){
 document.querySelectorAll('[data-days],[data-grain],#day-type,#period,#map-metric,#start,#end,#export,#hr-route,#hr-direction,#hr-metric,#hr-search,#hr-sort,#hr-fit,#hr-route-trend,#hr-show-all').forEach(el=>el.disabled=loading);
 $('dashboard').setAttribute('aria-busy',String(loading));
}
async function loadCity(key){
 const selected=cityCatalog.find(c=>c.key===key);if(!selected)return;
 $('retry-source').hidden=true;retrySource=()=>loadCity(key);
 const token=++cityToken;historySerial++;cancelHistory();cityController?.abort();cityController=new AbortController();
 profileCache.clear();profilePending.clear();profileErrors.clear();pageScopes={overview:blankScope(),routes:blankScope()};currentCity=key;manifest=null;cityHistory=areaHistory=null;areasReady=false;areasPromise=null;areaRows=new Map();areaMetricKey=null;overview=[];areaData=[];view=null;
 state.area=state.route=state.stop=null;state.direction='all';resetHighResolution();routeCache.clear();edgeCache.clear();resizeObserver?.disconnect();
 if(map){map.remove();map=null;}polygonLayer=routeLayer=null;
 setLoading(true);$('load-history').disabled=true;$('cancel-history').hidden=true;$('filter-error').hidden=true;
 $('start').value=$('end').value='';
 for(const id of ['otp','delay','coverage','valid'])$(id).textContent='—';
 for(const id of ['trend','distribution','calendar','route-list','coverage-detail','scheduled','range-summary','calendar-summary','detail-subtitle','footer-source','trend-note'])$(id).innerHTML='';
 showHistoryStatus('Connecting to '+selected.label+'…');
 try{
  const summaryManifest=await remoteJSON(overviewBase(key)+'manifest.json',cityController.signal);
  if(summaryManifest.schema_version!==2)throw Error('Unsupported overview format.');
  if(token!==cityToken)return;remoteSources.set(key,summaryManifest.source_commit);
  const rows=await summaryFile(key,'overview.json.gz',summaryManifest,cityController.signal);
  if(token!==cityToken)return;
  manifest={...selected,...summaryManifest};cityHistory={overview:rows,start:manifest.start,end:manifest.end};overview=rows;
  polygons={type:'FeatureCollection',features:[]};mapping={};locations={};routes={};stops={};index={routeStops:{},stopRoutes:{}};
  setLoading(false);applyDates(cityHistory);render();$('hr-route').disabled=true;
  $('footer-source').textContent='(Time: '+manifest.timezone+')';
  showHistoryStatus('Overview ready · loading map and route list…');
  const areaRequest=loadAreaSummaries(key,summaryManifest,token);areaRequest.catch(()=>{});
  const [routeIndex,metadata]=await Promise.all([
   summaryFile(key,'index.json.gz',summaryManifest,cityController.signal),
   summaryFile(key,'map.json.gz',summaryManifest,cityController.signal)
  ]);
  if(token!==cityToken)return;
  index=routeIndex;polygons=metadata['polygons.geojson'];mapping=metadata['polygon_stop_mapping.json'];locations=metadata['stop_location.json'];routes=metadata['routes_metadata.json'];stops=metadata['stops_metadata.json'];areaMetricKey=null;
  resizeObserver?.disconnect();if(map){map.remove();map=null;}polygonLayer=routeLayer=null;
  $('hr-route').disabled=false;showHistoryStatus('Overview ready · loading area summaries…');render();
  await areaRequest;if(token!==cityToken)return;areaMetricKey=null;if(state.area!==null)areaHistory={area:state.area};if(state.route===null)showHistoryStatus(state.area===null?'Overview ready':'Area '+state.area+' ready');render();
 }catch(e){if(token!==cityToken||e.name==='AbortError')return;$('retry-source').hidden=false;showHistoryStatus(e.message);$('filter-error').hidden=false;$('filter-error').textContent='Choose a city to retry.';}
}
async function init(params){
 wire();wirePages();$('retry-source').onclick=()=>retrySource?.();cityCatalog=dataConfig.cities.slice().sort((a,b)=>a.label.localeCompare(b.label));
 $('city').innerHTML=cityCatalog.map(c=>`<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('');$('city').value=cityCatalog.some(c=>c.key===params.get('city'))?params.get('city'):'san_francisco';
 if(currentPage==='routes')initialRouteChoice={city:$('city').value,route:params.get('route')};
 $('load-history').onclick=()=>loadHistory();$('cancel-history').onclick=()=>cancelHistory();
 await loadCity($('city').value);
}
