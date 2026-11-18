// Shared interaction behavior for overview, route and comparison maps.
L.Map.mergeOptions({fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false});
L.TileLayer.mergeOptions({keepBuffer:1,updateWhenIdle:true,noWrap:true});
L.Map.addInitHook(function(){
 const map=this;let moving=false;
 function closeLabels(){map.eachLayer(layer=>{if(layer.getTooltip?.())layer.closeTooltip();});}
 map.on('movestart zoomstart dragstart',()=>{moving=true;closeLabels();});
 map.on('moveend zoomend dragend',()=>{closeLabels();moving=false;});
 map.on('tooltipopen',event=>{
  if(moving){map.closeTooltip(event.tooltip);return;}
  map.eachLayer(layer=>{if(layer.getTooltip?.()&&layer.getTooltip()!==event.tooltip)layer.closeTooltip();});
 });
});
