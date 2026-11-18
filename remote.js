const RETRIES=4;
async function remoteJSON(url,signal){
 for(let attempt=0;;attempt++){
  let r;
  try{r=await fetch(url,{signal,cache:'no-store'});}catch(e){if(signal?.aborted||attempt>=RETRIES)throw e;}
  if(r?.ok)return r.json();
  if(r&&![429,500,502,503,504].includes(r.status))throw Error(r.status===403?'GitHub request limit reached. Try again after '+(r.headers.get('x-ratelimit-reset')?new Date(Number(r.headers.get('x-ratelimit-reset'))*1000).toLocaleTimeString():'a few minutes')+'.':`Source returned ${r.status}: ${url}`);
  if(attempt>=RETRIES)throw Error('Source temporarily unavailable. Retry to continue.');
  await new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve();},timer=setTimeout(done,Math.max(Number(r?.headers.get('retry-after'))*1000||0,1000*2**attempt));const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};signal?.addEventListener('abort',abort,{once:true});});
 }
}
const remoteSources=new Map();
function upstreamBase(city){return 'https://raw.githubusercontent.com/'+window.TRANSITHUB_CONFIG.repository+'/'+remoteSources.get(city)+'/meta/'+encodeURIComponent(city)+'/';}
let detailController;
function cancelHistory(){detailController?.abort();detailController=null;}
function overviewBase(city){const cfg=window.TRANSITHUB_CONFIG;return (cfg.summaryBaseUrl||cfg.overviewBaseUrl||('https://raw.githubusercontent.com/'+cfg.repository+'/'+cfg.branch+'/meta/')).replace(/\/?$/,'/')+encodeURIComponent(city)+'/dashboard/';}
async function summaryFile(city,name,manifest,signal){
 const info=manifest.files[name];if(!info)throw Error('Publish the '+name+' summary to GTFS-UI.');
 const response=await fetch(overviewBase(city)+(info.path||name).split('/').map(encodeURIComponent).join('/')+'?v='+info.sha256,{signal});
 if(!response.ok)throw Error(response.status===404?'Publish '+city+'/dashboard/'+name+' to GTFS-UI.':'Summary unavailable. Click Retry.');
 const bytes=await response.arrayBuffer();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==info.sha256)throw Error('Summary is being updated. Click Retry.');
 const payload=new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
 if(!info.codec)return payload.json();
 const packed=decodeTransitPack(await payload.arrayBuffer());
 if(info.codec==='profile')return packed.profile;
 if(info.codec==='daily')return packed;
 if(info.codec==='combined'){packed.rows.profile=packed.profile;return packed.rows;}
 throw Error('Unknown transit summary format');
}
