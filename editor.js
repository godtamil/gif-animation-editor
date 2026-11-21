import {parseGIF,decompressFrames} from 'gifuct-js';
import {GIFEncoder,quantize,applyPalette} from 'gifenc';
const $=id=>document.getElementById(id);
const canvas=$('preview'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let originals=[],frames=[], busy=false, stamp=0,elapsed=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function render(i){
 $('playhead').max=frames.length;
 $('playhead').value=i+1;
 $('frame').textContent=(i+1)+' / '+frames.length;
 const {image}=frames[i],w=canvas.width,h=canvas.height,t=i/frames.length*Math.PI*2,k=+$('power').value/100;
 ctx.fillStyle='#08090b';ctx.fillRect(0,0,w,h);ctx.save();
 const mode=$('effect').value;
 if(mode==='shake')ctx.translate(Math.sin(t*5)*w*.025*k,Math.cos(t*7)*h*.025*k);
 if(mode==='pulse'){const s=1+.075*k*(1-Math.cos(t));ctx.translate(w/2,h/2);ctx.scale(s,s);ctx.translate(-w/2,-h/2);}
 if(mode==='chrome')ctx.filter='grayscale(1) contrast('+ (1+k*.5)+')';
 ctx.drawImage(image,0,0,w,h);ctx.restore();
 if(mode==='fire'){
  const glow=ctx.createLinearGradient(0,h,0,h*.28);glow.addColorStop(0,'rgba(255,64,0,'+(.54*k)+')');glow.addColorStop(1,'transparent');
  ctx.globalCompositeOperation='screen';ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';
  for(let j=0;j<58;j++){const f=(i/frames.length+j*.618)%1;ctx.fillStyle='rgba(255,155,49,'+(Math.sin(f*Math.PI)*k)+')';ctx.fillRect((j*137.3+15*Math.sin(f*7+j))%w,h*(1-f),1+j%3,2+j%4);}
 }
}
function setFrames(list,w,h,name){
 const scale=Math.min(1,600/Math.max(w,h));
 canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
 originals=list;frames=list;elapsed=0;$('first').value=1;$('last').value=list.length;$('first').max=$('last').max=list.length;$('name').textContent=name;$('meta').textContent=canvas.width+' × '+canvas.height+' · '+list.length+' frames';render(0);
}
async function load(file){
 if(!file||busy)return;
 if(file.size>15*1024*1024)throw Error('Choose an image under 15 MB.');
 if(file.type==='image/gif'||/\.gif$/i.test(file.name)){
  const data=parseGIF(await file.arrayBuffer()),{width,height}=data.lsd;
  const count=data.frames.filter(f=>f.image).length;
  if(!count||width*height*count>22e6)throw Error('This GIF has too many pixels across its frames. Try a smaller GIF.');
  const source=document.createElement('canvas');source.width=width;source.height=height;
  const c=source.getContext('2d'),patch=document.createElement('canvas');
  const list=decompressFrames(data,true).map(f=>{
   const {left,top,width:w,height:h}=f.dims;
   const previous=f.disposalType===3?c.getImageData(0,0,width,height):null;
   patch.width=w;patch.height=h;patch.getContext('2d').putImageData(new ImageData(f.patch,w,h),0,0);c.drawImage(patch,left,top);
   const image=document.createElement('canvas');image.width=width;image.height=height;image.getContext('2d').drawImage(source,0,0);
   if(previous)c.putImageData(previous,0,0);else if(f.disposalType===2)c.clearRect(left,top,w,h);
   return {image,delay:f.delay||100};
  });
  setFrames(list,width,height,file.name);
 }else{
  const image=await createImageBitmap(file);setFrames(Array.from({length:36},()=>({image,delay:80})),image.width,image.height,file.name);
 }
}
async function open(file){try{await load(file);$('status').textContent='';}catch(e){$('status').textContent=e.message;}}
$('file').onchange=e=>open(e.target.files[0]);
const stage=$('stage');stage.ondragover=e=>e.preventDefault();stage.ondrop=e=>{e.preventDefault();open(e.dataTransfer.files[0]);};
function tick(now){
 const delta=Math.min(now-stamp,100);stamp=now;
 if(frames.length&&!busy&&!$('pause').checked){
  elapsed+=delta*(+$('speed').value);const total=frames.reduce((a,f)=>a+f.delay,0);let t=elapsed%total,i=0;
  while(i<frames.length-1&&t>=frames[i].delay)t-=frames[i++].delay;
  render(i);
 }
 requestAnimationFrame(tick);
}
$('export').onclick=async()=>{
 if(!frames.length||busy)return;
 busy=true;$('export').disabled=true;
 try{
  const enc=GIFEncoder(),{width:w,height:h}=canvas,speed=+$('speed').value;
  for(let i=0;i<frames.length;i++){
   render(i);const rgba=ctx.getImageData(0,0,w,h).data,palette=quantize(rgba,256);
   enc.writeFrame(applyPalette(rgba,palette),w,h,{palette,delay:clamp(frames[i].delay/speed,20,655350),repeat:0});
   if(i%4===0){$('status').textContent='Encoding '+Math.round(100*i/frames.length)+'%';await new Promise(r=>requestAnimationFrame(r));}
  }
  enc.finish();const url=URL.createObjectURL(new Blob([enc.bytes()],{type:'image/gif'}));
  const a=document.createElement('a');a.href=url;a.download='animation-'+$('effect').value+'.gif';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  $('status').textContent='GIF exported';
 }catch(e){$('status').textContent=e.message;}finally{busy=false;$('export').disabled=false;}
};
for(const id of ['effect','power','speed'])$(id).oninput=()=>{if(!busy&&frames.length)render(Number($('playhead').value)-1);};
function seek(frame){
 if(!frames.length||busy)return;
 const index=clamp(frame-1,0,frames.length-1);
 $('pause').checked=true;
 elapsed=frames.slice(0,index).reduce((total,f)=>total+f.delay,0);
 render(index);
}
$('playhead').oninput=e=>seek(Number(e.target.value));
$('previous').onclick=()=>seek(Number($('playhead').value)-1);
$('next').onclick=()=>seek(Number($('playhead').value)+1);
$('play').onclick=()=>{$('pause').checked=!$('pause').checked;};
$('still').oninput=()=>{
 if(busy||!originals.length)return;
 editFrames();
};
function editFrames(){
 if(!originals.length||busy)return;
 const start=clamp(Number($('first').value)||1,1,originals.length);
 const end=clamp(Number($('last').value)||originals.length,start,originals.length);
 frames=originals.slice(start-1,end);
 if($('reverse').checked)frames.reverse();
 if(frames.length===1&&$('still').checked)frames=Array.from({length:36},()=>({image:frames[0].image,delay:80}));
 elapsed=0;
 $('meta').textContent=canvas.width+' x '+canvas.height+' / '+frames.length+' frames';
 render(0);
}
for(const id of ['first','last','reverse'])$(id).onchange=editFrames;
const sample=Array.from({length:36},(_,i)=>{
 const image=document.createElement('canvas');image.width=520;image.height=340;
 const c=image.getContext('2d'),t=i*Math.PI/18;
 c.fillStyle='#10111d';c.fillRect(0,0,520,340);
 for(let k=0;k<3;k++){
  c.strokeStyle=['#fda879','#a294ff','#66e6dd'][k];c.lineWidth=7;
  c.beginPath();c.ellipse(260,170,110,37,t+k*Math.PI/3,0,Math.PI*2);c.stroke();
 }
 c.fillStyle='#faf2ee';c.beginPath();c.arc(260,170,13,0,Math.PI*2);c.fill();
 return {image,delay:80};
});
setFrames(sample,520,340,'Orbit sample');
requestAnimationFrame(tick);
