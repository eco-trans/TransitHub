let comparisonMap,comparisonMarkers;
function renderComparisonMap(rows,metric){
 if(!comparisonMap){comparisonMap=L.map('comparison-map',{scrollWheelZoom:false,zoomSnap:0.1}).setView([40,-99],3);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(comparisonMap);comparisonMarkers=L.layerGroup().addTo(comparisonMap);comparisonMap.fitBounds(window.TRANSITHUB_CONFIG.cities.filter(c=>c.key!=='toronto').map(c=>c.center),{paddingTopLeft:[22,22],paddingBottomRight:[22,90],animate:false});}
 comparisonMarkers.clearLayers();
 const values=rows.map(r=>r[metric]).filter(Number.isFinite),min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):0,palette=['#dce9dd','#b4d4be','#87b99e','#539778','#2b7356','#164f3c'];
 const names={otp:'On-time rate',delay:'Mean delay',coverage:'Date coverage',valid:'Observations'},valueLabel=v=>v===null?'No observations':metric==='valid'?format(v):v.toFixed(metric==='delay'?2:1)+(metric==='delay'?' min':'%');
 node('comparison-legend-title').textContent=names[metric]+(metric==='delay'?' (min)':metric==='valid'?'':' (%)');
 const legendPalette=metric==='delay'?[...palette].reverse():palette;
 node('comparison-legend-colors').replaceChildren(...legendPalette.map(color=>{const swatch=document.createElement('i');swatch.style.background=color;return swatch;}));
 const label=v=>metric==='valid'?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v):Number(v.toFixed(metric==='delay'?2:1)).toString();
 node('comparison-legend-values').replaceChildren(...(values.length?(min===max?[min]:[min,(min+max)/2,max]):[null]).map(v=>{const span=document.createElement('span');span.textContent=v===null?'No data':label(v);return span;}));

 for(const r of rows){let t=max===min?.5:(r[metric]-min)/(max-min);if(metric==='delay')t=1-t;const color=r[metric]===null?'#b7bfc0':palette[Math.min(5,Math.max(0,Math.floor(t*6)))];
 const popup=document.createElement('div'),title=document.createElement('strong');title.textContent=r.city;popup.append(title);
 for(const [label,v] of [['On time',r.otp===null?'—':r.otp.toFixed(1)+'%'],['Mean delay',r.delay===null?'—':r.delay.toFixed(2)+' min'],['Date coverage',r.coverage.toFixed(1)+'%'],['Observations',format(r.valid)]]){const line=document.createElement('div');line.textContent=label+': '+v;popup.append(line);}
 L.circleMarker(r.center,{radius:10,color:'#254c44',weight:1.5,fillColor:color,fillOpacity:.95}).bindTooltip(r.city+' · '+valueLabel(r[metric])).bindPopup(popup).addTo(comparisonMarkers);
 }
}
const node=id=>document.getElementById(id),cityData=new Map(),failures=new Set(),DAY_MS=86400000;
const dateMs=s=>Date.parse(s+'T00:00:00Z'),format=n=>new Intl.NumberFormat('en-US').format(n);
function drawComparison(){
 const start=node('compare-start').value,end=node('compare-end').value;if(!start||!end)return;
 if(start>end){node('compare-status').textContent='From must be no later than To.';node('compare-body').innerHTML='';comparisonMarkers?.clearLayers();return;}
 const days=Math.round((dateMs(end)-dateMs(start))/DAY_MS)+1,metric=node('compare-metric').value;
 const result=[...cityData.values()].map(({city,rows})=>{let valid=0,on=0,delay=0;const dates=new Set();for(const r of rows){if(r[0]<start||r[0]>end)continue;valid+=r[2];on+=r[4];delay+=r[5];if(r[2])dates.add(r[0]);}return {city:city.label,center:city.center,valid,otp:valid?on/valid*100:null,delay:valid?delay/valid/60:null,coverage:dates.size/days*100};});
 result.sort((a,b)=>a[metric]===null?1:b[metric]===null?-1:(metric==='delay'?a[metric]-b[metric]:b[metric]-a[metric])||a.city.localeCompare(b.city));
 renderComparisonMap(result,metric);
 node('compare-body').replaceChildren(...result.map((r,i)=>{const tr=document.createElement('tr');for(const [j,value] of [r.city,...['otp','delay','coverage','valid'].map(k=>r[k])].entries()){const td=document.createElement('td');td.textContent=j===0?`${i+1}. ${value}`:value===null?'—':j===4?format(value):value.toFixed(j===2?2:1);if(j===1&&value!==null){const bar=document.createElement('div');bar.className='rank-bar';const fill=document.createElement('i');fill.style.width=value+'%';bar.append(fill);td.append(bar);}tr.append(td);}return tr;}));
 node('compare-status').textContent=failures.size?'Unavailable: '+[...failures].join(', '):'';node('compare-retry').hidden=!failures.size;
 document.querySelectorAll('[data-sort]').forEach(b=>b.parentElement.setAttribute('aria-sort',b.dataset.sort===metric?(metric==='delay'?'ascending':'descending'):'none'));
}
async function loadComparison(){
 const queue=window.TRANSITHUB_CONFIG.cities.filter(c=>c.key!=='toronto'&&!cityData.has(c.key));
 async function worker(){while(queue.length){const city=queue.shift();try{const manifest=await remoteJSON(overviewBase(city.key)+'manifest.json');const rows=await summaryFile(city.key,'overview.json.gz',manifest);cityData.set(city.key,{city,manifest,rows});failures.delete(city.label);}catch(e){failures.add(city.label);}}}
 await Promise.all([worker(),worker(),worker()]);
 if(!node('compare-start').value&&cityData.size){const values=[...cityData.values()];let start=values.map(v=>v.manifest.start).sort().at(-1),end=values.map(v=>v.manifest.end).sort()[0];if(start>end){start=values.map(v=>v.manifest.start).sort()[0];end=values.map(v=>v.manifest.end).sort().at(-1);}node('compare-start').value=start;node('compare-end').value=end;}
 if(!cityData.size){node('compare-status').textContent='City summaries could not be loaded.';node('compare-retry').hidden=false;return;}drawComparison();
}
for(const id of ['compare-start','compare-end','compare-metric'])node(id).onchange=drawComparison;
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{node('compare-metric').value=b.dataset.sort;drawComparison();});node('compare-retry').onclick=loadComparison;loadComparison();
