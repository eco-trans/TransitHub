'use strict';
let hrMap,hrLayer,hrObserver,hrRouteKey='',hrStopRows=[],hrRouteIds=[];
let hrSequence=new Map(),defaultRouteCity=null;
let showCityNetwork=false,initialRouteChoice=null,firstRouteLoad=null;
let routePickerOpen=false,routeQuery='',routeActive=-1,routeMatches=[];
function resetHighResolution(){
 showCityNetwork=false;firstRouteLoad=null;
 hrObserver?.disconnect();if(hrMap){hrMap.remove();hrMap=null;}hrLayer=null;hrRouteKey='';hrStopRows=[];
 for(const id of ['hr-body','hr-count','hr-legend','hr-summary'])$(id).innerHTML='';
 $('hr-route').value='';$('hr-search').value='';$('hr-sort').value='sequence';
 hrSequence=new Map();defaultRouteCity=null;hrRouteIds=[];routePickerOpen=false;routeQuery='';routeActive=-1;$('hr-route-options').hidden=true;$('hr-route-options').innerHTML='';$('hr-route').setAttribute('aria-expanded','false');$('hr-route').removeAttribute('aria-activedescendant');$('hr-route-matches').textContent='';
 $('hr-direction').innerHTML='<option value="all">All directions</option>';$('hr-empty').hidden=false;
 $('hr-context').textContent='';
 $('hr-route-label').textContent='Route';
 $('hr-route-scope').textContent='';$('hr-show-all').hidden=true;
}
function wireHighResolution(){
 wireRoutePicker();
 $('hr-show-all').onclick=()=>pickRoute(null);
 $('hr-direction').onchange=()=>{state.direction=$('hr-direction').value;state.stop=null;render();};
 $('hr-metric').onchange=()=>renderHighResolution();
 $('hr-sort').onchange=$('hr-search').oninput=()=>renderStopTable();
 $('hr-fit').onclick=()=>fitHighResolution();
 $('hr-route-trend').onclick=()=>{state.area=null;state.stop=null;render();$('trend').scrollIntoView({behavior:'smooth',block:'center'});};
}
function routeLabel(id){return id?`${id} · ${routes[id]?.name||''}`:'';}
function closeRoutePicker(){
 routePickerOpen=false;routeQuery='';routeActive=-1;renderRouteOptions();
}
function openRoutePicker(){
 if(routePickerOpen||!manifest)return;routePickerOpen=true;routeQuery='';routeActive=-1;renderRouteOptions();$('hr-route').select();
}
function pickRoute(id){
 closeRoutePicker();$('hr-route').value=routeLabel(id);
 if(id&&id!==state.route)chooseRoute(id);
 else if(!id){showCityNetwork=true;defaultRouteCity=currentCity;stopPendingHistory();loadToken++;state.route=state.stop=null;state.direction='all';routeLayer?.clearLayers();render();}
}
function wireRoutePicker(){
 const input=$('hr-route');
 input.onfocus=input.onclick=openRoutePicker;
 input.oninput=()=>{routePickerOpen=true;routeQuery=input.value;routeActive=-1;renderRouteOptions();};
 input.onkeydown=e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();openRoutePicker();const n=routeMatches.length;
   if(n){routeActive=e.key==='ArrowDown'?(routeActive+1)%n:(routeActive<=0?n-1:routeActive-1);renderRouteOptions();$('hr-route-option-'+routeActive)?.scrollIntoView({block:'nearest'});}
  }else if(e.key==='Enter'&&routePickerOpen){e.preventDefault();if(routeMatches.length)pickRoute(routeMatches[routeActive<0?0:routeActive]);}
  else if(e.key==='Escape'&&routePickerOpen){e.preventDefault();closeRoutePicker();}
  else if(e.key==='Tab'&&routePickerOpen)closeRoutePicker();
 };
 document.addEventListener('pointerdown',e=>{if(routePickerOpen&&!$('hr-route-picker').contains(e.target))closeRoutePicker();});
}
function renderRouteOptions(){
 const input=$('hr-route'),list=$('hr-route-options');
 input.setAttribute('aria-expanded',String(routePickerOpen));list.hidden=!routePickerOpen;
 if(!routePickerOpen){input.value=routeLabel(state.route);input.removeAttribute('aria-activedescendant');$('hr-route-matches').textContent='';return;}
 const terms=routeQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
 routeMatches=hrRouteIds.filter(id=>{const text=routeLabel(id).toLowerCase();return terms.every(term=>text.includes(term));});
 if(routeActive>=routeMatches.length)routeActive=-1;
 list.innerHTML=(!terms.length?'<button type="button" role="option" aria-selected="'+(state.route===null)+'" tabindex="-1" data-route-choice="">All routes</button>':'')+routeMatches.map((id,i)=>`<button type="button" role="option" aria-selected="${id===state.route}" tabindex="-1" id="hr-route-option-${i}" class="${i===routeActive?'focused':''}" data-route-choice="${esc(id)}">${esc(routeLabel(id))}</button>`).join('')+(routeMatches.length?'':'<div class="route-no-results">No matching routes</div>');
 list.querySelectorAll('button').forEach(button=>{button.onpointerdown=e=>e.preventDefault();button.onclick=()=>pickRoute(button.dataset.routeChoice);});
 if(routeActive>=0)input.setAttribute('aria-activedescendant','hr-route-option-'+routeActive);else input.removeAttribute('aria-activedescendant');
 $('hr-route-matches').textContent=`${routeMatches.length} matching routes`;
}
function selectHighResolutionStop(id){if(state.area!==null&&!(mapping[state.area]||[]).map(String).includes(String(id)))state.area=null;state.stop=id;render();if(locations[id])hrMap.setView(locations[id],16);}
function fitHighResolution(){const points=hrStopRows.filter(r=>locations[r.id]).map(r=>locations[r.id]);if(points.length)hrMap.fitBounds(L.latLngBounds(points),{padding:[28,28],maxZoom:16});}
function hrColor(row){
 const value=rates(row)[$('hr-metric').value];if(value===null||!row.valid)return '#b9c2c1';
 if($('hr-metric').value==='delay')return ['#2d8f81','#7ebba9','#d6c380','#dc9474','#b74e47'][Math.max(0,Math.min(4,Math.floor(value/3)))];
 return ['#b74e47','#dc9474','#d6c380','#7ebba9','#2d8f81'][Math.max(0,Math.min(4,Math.floor(value/20)))];
}
function renderHighResolution(){
 if(!manifest)return;

 if(!hrMap){const city=cityCatalog.find(c=>c.key===currentCity);hrMap=L.map('hr-map',{scrollWheelZoom:false}).setView(manifest.center||city.center,manifest.zoom||city.zoom);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(hrMap);hrLayer=L.layerGroup().addTo(hrMap);hrMap.on('click',()=>{if(state.route!==null)pickRoute(null);});hrObserver=new ResizeObserver(()=>hrMap?.invalidateSize());hrObserver.observe($('hr-map'));}
 const routeIds=Object.keys(index.routeStops).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 $('hr-route-label').textContent=`Route (all ${routeIds.length} routes)`;
 $('hr-route-scope').textContent=`${manifest.city} · All ${routeIds.length} route IDs`;
 $('hr-show-all').hidden=state.route===null;
 hrRouteIds=routeIds;renderRouteOptions();
 if(routeIds.length&&state.route===null&&defaultRouteCity!==currentCity){
  defaultRouteCity=currentCity;
  const requested=initialRouteChoice?.city===currentCity?initialRouteChoice.route:null;initialRouteChoice=null;
  if(requested==='')showCityNetwork=true;
  else firstRouteLoad=chooseRoute(requested&&routeIds.includes(requested)?requested:routeIds[0]);
 }
 const rows=routeCache.get(state.route)||[],directions=[...new Set(rows.map(r=>String(r[2])))].sort();
 $('hr-direction').innerHTML='<option value="all">All directions</option>'+directions.map(d=>`<option value="${esc(d)}">Direction ${esc(d)}</option>`).join('');$('hr-direction').value=state.direction;
 $('hr-direction').disabled=state.route===null;$('hr-fit').disabled=state.route===null;
 const days=selectedDays(),allowed=new Set(days),byStop=new Map();
 for(const r of rows){if(state.direction!=='all'&&String(r[2])!==state.direction)continue;const id=String(r[3]);
  if(!byStop.has(id))byStop.set(id,{id,name:stops[id]?.name||id,...empty(),days:days.length,observedDates:new Set()});
  if(!allowed.has(r[0])||!periodMatches(r[1]))continue;const a=byStop.get(id);addValues(a,r,4);if(r[4])a.observedDates.add(r[0]);
 }
 hrStopRows=[...byStop.values()];hrStopRows.forEach(r=>r.observed=r.observedDates.size);hrLayer.clearLayers();
 const routeTotal=empty(),routeDates=new Set();for(const r of hrStopRows){merge(routeTotal,r);for(const d of r.observedDates)routeDates.add(d);}routeTotal.days=days.length;routeTotal.observed=routeDates.size;const routeRates=rates(routeTotal);
 $('hr-summary').textContent=state.route===null?'':`Route on time ${pct(routeRates.otp)} · Mean delay ${routeRates.delay===null?'—':routeRates.delay.toFixed(2)+' min'} · Date coverage ${pct(routeRates.coverage)} · ${fmt(routeTotal.valid)} observations`;
 $('hr-route-trend').disabled=state.route===null;
 renderRouteLines();
 const eligible=new Set(hrStopRows.map(r=>r.id));
 for(const r of hrStopRows){if(!locations[r.id])continue;const m=rates(r);const marker=L.circleMarker(locations[r.id],{bubblingMouseEvents:false,radius:state.stop===r.id?9:6,weight:state.stop===r.id?3:1.5,color:state.stop===r.id?'#182f36':'#fff',fillColor:hrColor(r),fillOpacity:1}).bindTooltip(`<b>${esc(r.name)}</b><br>Stop ${esc(r.id)} · ${pct(m.otp)} on time<br>${m.delay===null?'—':m.delay.toFixed(2)} min · ${fmt(r.valid)} observations`);marker.on('click',()=>selectHighResolutionStop(r.id));marker.on('add',()=>{const el=marker.getElement();if(el){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label','Select stop '+r.id+' '+r.name);el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();selectHighResolutionStop(r.id);}});}});marker.addTo(hrLayer);}
 $('hr-context').textContent=state.route===null?'':`${manifest.city} · Route ${state.route} · All route stops · ${state.direction==='all'?'All directions':'Direction '+state.direction} · ${$('start').value} — ${$('end').value}`;
 const metric=$('hr-metric').value;
 $('hr-legend').hidden=state.route===null;
 const legendColors=metric==='delay'?['#2d8f81','#7ebba9','#d6c380','#dc9474','#b74e47']:['#b74e47','#dc9474','#d6c380','#7ebba9','#2d8f81'];
 const legendLabels=metric==='delay'?['<3','3–6','6–9','9–12','≥12']:['<20','20–40','40–60','60–80','≥80'];
 const legendTitle={otp:'Stop on-time rate (%)',coverage:'Stop date coverage (%)',delay:'Stop mean delay (min)'}[metric];
 $('hr-legend').innerHTML=`<strong>${legendTitle}</strong><div class="stop-legend-bins">${legendLabels.map((label,i)=>`<span><i style="background:${legendColors[i]}"></i>${label}</span>`).join('')}<span><i style="background:#b9c2c1"></i>No data</span></div>`;

 const key=currentCity+':'+state.route+':'+state.direction;if(key!==hrRouteKey){hrRouteKey=key;fitHighResolution();}
 renderRouteProfile();renderStopTable();
}
function renderStopTable(){
 const query=$('hr-search').value.trim().toLowerCase(),sort=$('hr-sort').value;
 const rows=hrStopRows.filter(r=>(r.name+' '+r.id).toLowerCase().includes(query));
 rows.sort((a,b)=>{if(sort==='sequence'){const av=hrSequence.get(a.id)??Infinity,bv=hrSequence.get(b.id)??Infinity;return av===bv?a.name.localeCompare(b.name):av-bv;}if(sort==='name')return a.name.localeCompare(b.name);if(sort==='valid')return b.valid-a.valid;const av=rates(a)[sort],bv=rates(b)[sort];return av===null?(bv===null?0:1):bv===null?-1:sort==='delay'?bv-av:av-bv;});
 $('hr-body').innerHTML=rows.map(r=>{const m=rates(r);return `<tr class="${state.stop===r.id?'selected':''}"><td><button data-stop="${esc(r.id)}" aria-pressed="${state.stop===r.id}">${esc(r.name)}<small>Stop ${esc(r.id)}</small></button></td><td>${hrSequence.get(r.id)??'—'}</td><td>${pct(m.otp)}</td><td>${m.delay===null?'—':m.delay.toFixed(2)+' min'}</td><td>${pct(m.coverage)}</td><td>${fmt(r.valid)}</td></tr>`;}).join('');
 $('hr-body').querySelectorAll('button').forEach(b=>b.onclick=()=>selectHighResolutionStop(b.dataset.stop));
 $('hr-empty').hidden=rows.length>0;$('hr-empty').textContent=state.route===null?'Choose a route to view stop performance.':'No matching stops.';
 $('hr-count').textContent=state.route===null?'':`${rows.length} of ${hrStopRows.length} stops · ${hrStopRows.filter(r=>r.valid).length} with observations`;
}

const cityLineCache=new Map(),cityLinePending=new Set();
function renderRouteLines(){
 const city=currentCity,token=cityToken;
 if(state.route===null&&!showCityNetwork)return;
 if(state.route===null&&!cityLineCache.has(city)){
  if(!cityLinePending.has(city)){cityLinePending.add(city);summaryFile(city,'route-lines.json.gz',manifest,cityController.signal).then(data=>{cityLineCache.set(city,data);if(token===cityToken&&currentPage==='routes'&&showCityNetwork&&state.route===null)renderHighResolution();}).catch(()=>{}).finally(()=>cityLinePending.delete(city));}return;
 }
 const network=state.route===null?cityLineCache.get(city):{[state.route]:edgeCache.get(state.route)||[]};
 for(const [id,edges] of Object.entries(network||{})){const segments=edges.filter(([a,b])=>a!==b&&locations[a]&&locations[b]).map(([a,b])=>[locations[a],locations[b]]);if(!segments.length)continue;
 const line=L.polyline(segments,{color:'#'+(routes[id]?.color||'287a64'),bubblingMouseEvents:false,weight:state.route===null?3:5,opacity:state.route===null?.65:.9}).bindTooltip(routeLabel(id));line.on('click',()=>pickRoute(id));line.addTo(hrLayer);
 }
}
function renderRouteProfile(){
 const svg=$('route-profile');if(!svg)return;
 if(state.route===null){hrSequence=new Map();$('route-profile-key').innerHTML='';svg.innerHTML='<text x="310" y="140" text-anchor="middle" fill="#819286">Choose a route</text>';$('route-profile-note').textContent='';return;}
 const days=new Set(selectedDays()),groups=new Map();
 for(const r of routeCache.get(state.route)||[]){const dir=String(r[2]),id=String(r[3]);if(state.direction!=='all'&&dir!==state.direction)continue;if(!groups.has(dir))groups.set(dir,new Map());const g=groups.get(dir);if(!g.has(id))g.set(id,empty());if(days.has(r[0])&&periodMatches(r[1]))addValues(g.get(id),r,4);}
 const series=[];
 for(const [dir,st] of groups){const links=(edgeCache.get(state.route)||[]).map(([a,b])=>[String(a),String(b)]).filter(([a,b])=>a!==b&&st.has(a)&&st.has(b)),out=new Map(),incoming=new Set();for(const [a,b] of links){if(!out.has(a))out.set(a,new Set());out.get(a).add(b);incoming.add(b);}
 const roots=[...out.keys()].filter(id=>!incoming.has(id));const starts=roots.length?roots:[out.keys().next().value];let count=0;
 function walk(path){if(count>=256)return;const next=[...(out.get(path.at(-1))||[])].filter(id=>!path.includes(id));if(!next.length){if(path.length>1){series.push({dir,st,path});count++;}return;}for(const id of next)walk([...path,id]);}
 for(const start of starts)if(start)walk([start]);

 }
 const directionControl=$('profile-direction'),branchControl=$('profile-branch');
 const directionIds=[...groups.keys()];
 const scope=currentCity+':'+state.route;
 if(directionControl.dataset.scope!==scope){directionControl.dataset.scope=scope;directionControl.dataset.chosen='';branchControl.dataset.chosen='0';}
 let chosen=state.direction!=='all'?state.direction:directionControl.dataset.chosen;
 if(!directionIds.includes(chosen))chosen=directionIds[0];
 directionControl.innerHTML=directionIds.map(d=>`<option value="${esc(d)}">Direction ${esc(d)}</option>`).join('');directionControl.value=chosen||'';directionControl.dataset.chosen=chosen||'';
 directionControl.onchange=()=>{directionControl.dataset.chosen=directionControl.value;branchControl.dataset.chosen='0';renderRouteProfile();};
 directionControl.disabled=state.direction!=='all';
 const candidates=series.filter(s=>s.dir===chosen).sort((a,b)=>b.path.length-a.path.length);
 let branch=Number(branchControl.dataset.chosen||0);if(branch>=candidates.length)branch=0;
 branchControl.innerHTML=candidates.map((s,i)=>`<option value="${i}">${esc(stops[s.path[0]]?.name||s.path[0])} → ${esc(stops[s.path.at(-1)]?.name||s.path.at(-1))} (${s.path.length} stops)</option>`).join('');branchControl.value=String(branch);branchControl.hidden=candidates.length<=1;
 branchControl.onchange=()=>{branchControl.dataset.chosen=branchControl.value;renderRouteProfile();};
 series.splice(0,series.length,...(candidates[branch]?[candidates[branch]]:[]));
 hrSequence=new Map((series[0]?.path||[]).map((id,i)=>[id,i+1]));renderStopTable();
 const vals=series.flatMap(s=>s.path.map(id=>rates(s.st.get(id)).otp)),domain=trendDomain(vals),left=48,right=590,bottom=235,y=v=>bottom-(v-domain[0])/(domain[1]-domain[0])*210;let html='';
 for(let i=0;i<=4;i++){const v=domain[0]+i*(domain[1]-domain[0])/4;html+=`<line x1="48" x2="590" y1="${y(v)}" y2="${y(v)}" stroke="#edf0eb"/><text x="38" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#819286">${v.toFixed(1)}</text>`;}
 const dirs=chosen?[chosen]:[],palette=['#277a64','#ba9864','#6689a2'];
 $('route-profile-key').innerHTML=dirs.map((d,i)=>`<span><i class="line-key" style="background:${palette[i%palette.length]}"></i>Direction ${esc(d)}</span>`).join('');
 const positions=new Set();for(const s of series){s.path.forEach((id,i)=>{if(id===state.stop)positions.add(left+i*(right-left)/(s.path.length-1));});}for(const x of positions)html+=`<line class="selected-stop-guide" x1="${x}" x2="${x}" y1="25" y2="${bottom}" stroke="#90999c" stroke-width="1.5" stroke-dasharray="4 3"><title>${esc(stops[state.stop]?.name||state.stop)}</title></line>`;
 for(const s of series){const color=palette[dirs.indexOf(s.dir)%palette.length];let path='',open=false;s.path.forEach((id,i)=>{const v=rates(s.st.get(id)).otp;if(v===null){open=false;return;}const x=left+i*(right-left)/(s.path.length-1);path+=(open?'L':'M')+x+','+y(v);open=true;html+=`<circle cx="${x}" cy="${y(v)}" r="3" fill="${color}" tabindex="0" role="button" data-profile-stop="${esc(id)}"><title>Direction ${esc(s.dir)} · ${esc(stops[id]?.name||id)} · ${pct(v)}</title></circle>`;});html+=`<path d="${path}" stroke="${color}" stroke-width="2" fill="none" pointer-events="none"/>`;}
 html+='<text x="48" y="265" font-size="12" fill="#819286">First stop</text><text x="590" y="265" text-anchor="end" font-size="12" fill="#819286">Last stop</text>';svg.innerHTML=html;
 svg.querySelectorAll('[data-profile-stop]').forEach(el=>{el.onclick=()=>selectHighResolutionStop(el.dataset.profileStop);el.onkeydown=e=>{if(e.key==='Enter')el.onclick();};});
 $('route-profile-note').textContent=series.length?'On-time rate (%) · '+dirs.map((d,i)=>'Direction '+d).join(' / ')+' · branches shown separately':'No connected stop sequence available';
}
