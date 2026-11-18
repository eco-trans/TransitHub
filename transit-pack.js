'use strict';
function decodeTransitPack(buffer){
 const bytes=new Uint8Array(buffer),headerSize=new DataView(buffer).getUint32(0,true);
 const [kind,start,groups]=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+headerSize)));
 let cursor=4+headerSize;
 function number(){let value=0,scale=1;while(cursor<bytes.length){const byte=bytes[cursor++];value+=(byte%128)*scale;if(byte<128)return value;scale*=128;}throw Error('Incomplete transit data');}
 function column(length){const result=new Float64Array(length);for(let index=0;index<length;index++)result[index]=number();return result;}
 const dates=[],epoch=Date.parse(start+'T00:00:00Z'),rows=[],hours=[],hist=[];
 function date(day){return dates[day]||(dates[day]=new Date(epoch+day*86400000).toISOString().slice(0,10));}
 const periods=Array.from({length:24},(_,h)=>h>=7&&h<10?0:h>=10&&h<16?1:h>=16&&h<19?2:3);
 const coarseIndex=[0,0,0,0,0,0,1,1,1,1,2,3,4,5,6,6,7,7,7,7,7,8,8,8,8,8,8,8,8,8,8,9];
 for(const [direction,stop,hourCount,histCount,dayCount,precision] of groups){
  if(kind==='daily'){
   const keys=column(dayCount),delays=column(dayCount),bins=Array.from({length:10},()=>column(dayCount));let key=0;
   for(let index=0;index<dayCount;index++){
    key+=keys[index];const values=bins.map(col=>col[index]),early=values[0]+values[1],on=values.slice(2,7).reduce((a,b)=>a+b,0);
    const delay=delays[index],sum=(delay%2?-(delay+1)/2:delay/2)/precision;
    rows.push([stop,date(Math.floor(key/4)),key%4,values.reduce((a,b)=>a+b,0),early,on,sum,...values]);
   }
   continue;
  }
  const hd=column(hourCount),hn=column(hourCount),ho=column(hourCount);if(hourCount)hours.push([direction,stop,hd,hn,ho]);
  const bd=column(histCount),bn=column(histCount);if(histCount)hist.push([direction,stop,bd,bn]);
  if(!dayCount)continue;
  const sums=column(dayCount),daily=[],ordered=[];let key=0;
  for(let index=0;index<hourCount;index++){
   key+=hd[index];const day=Math.floor(key/24),period=periods[key%24],slot=day*4+period;
   let row=daily[slot];if(!row){row=[date(day),period,direction,stop,0,0,0,0,0,0,0,0,0,0,0,0,0,0];daily[slot]=row;ordered.push(slot);}
   row[4]+=hn[index];row[6]+=ho[index];
  }
  ordered.sort((a,b)=>a-b);if(ordered.length!==dayCount)throw Error('Invalid daily totals');
  if(kind==='route'){
   key=0;
   for(let index=0;index<histCount;index++){key+=bd[index];daily[Math.floor(key/32)][8+coarseIndex[key%32]]+=bn[index];}
  }else{
   for(const bin of [0,2,4,5,6,7,8,9])for(const slot of ordered)daily[slot][8+bin]=number();
  }
  for(let index=0;index<ordered.length;index++){
   const row=daily[ordered[index]],sum=sums[index];row[7]=(sum%2?-(sum+1)/2:sum/2)/precision;
   if(kind==='route'){
    const boundary=row[6]-row.slice(10,15).reduce((a,b)=>a+b,0);row[14]+=boundary;row[15]-=boundary;
   }else{
    row[11]=row[6]-row[10]-row[12]-row[13]-row[14];row[9]=row[4]-row[6]-row[8]-row[15]-row[16]-row[17];
   }
   row[5]=row[8]+row[9];rows.push(row);
  }
 }
 if(cursor!==bytes.length)throw Error('Unexpected data length');
 if(kind==='daily')return rows;
 return {rows,profile:{format:'grouped-v1',start,hours,hist,routeBinsOnly:kind==='route10'}};
}
if(typeof module!=='undefined')module.exports=decodeTransitPack;
