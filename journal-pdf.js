/* Local, high-resolution diary book export. No network, print dialog or remote fonts. */
(function(root) {
  'use strict';
  const W=419.53,H=595.28,SCALE=3;
  function pdfFromJpegs(images) {
    const encoder=new TextEncoder(),encode=value=>encoder.encode(value),objects=[];
    const add=value=>(objects.push(value),objects.length);
    const catalog=add(''),pages=add(''),ids=[];
    for(const image of images) {
      const raw=Uint8Array.from(atob(image.data.split(',')[1]),c=>c.charCodeAt(0));
      const imageId=add([encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raw.length} >>\nstream\n`),raw,encode('\nendstream')]);
      const commands=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      const content=add(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
      ids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objects[catalog-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;
    objects[pages-1]=`<< /Type /Pages /Kids [${ids.map(id=>`${id} 0 R`).join(' ')}] /Count ${ids.length} >>`;
    const pieces=[encode('%PDF-1.4\n%EmmaSpace\n')],offsets=[0];let size=pieces[0].length;
    const push=value=>{const bytes=typeof value==='string'?encode(value):value;pieces.push(bytes);size+=bytes.length;};
    objects.forEach((object,index)=>{offsets.push(size);push(`${index+1} 0 obj\n`);for(const part of Array.isArray(object)?object:[object])push(part);push('\nendobj\n');});
    const xref=size;push(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset=>push(`${String(offset).padStart(10,'0')} 00000 n \n`));
    push(`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const result=new Uint8Array(size);let cursor=0;pieces.forEach(piece=>{result.set(piece,cursor);cursor+=piece.length;});return result;
  }
  async function create(entries,{normalize,createCanvas,loadImage}={}) {
    createCanvas ||= (w,h)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
    loadImage ||= data=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Një fotografi nuk u hap. PDF-ja nuk u krijua.'));img.src=data;});
    const images=[];let canvas,ctx,y=0,pageNumber=0,entryTitle='';
    const font=(size=11.5,bold=false,italic=false)=>{ctx.font=`${italic?'italic ':''}${bold?'bold ':''}${size}px Georgia, serif`;};
    const text=(value,x,lineY,size=11.5,color='#392c35',bold=false)=>{font(size,bold);ctx.fillStyle=color;ctx.fillText(value,x,lineY);};
    function finish(){if(!canvas)return;text(String(pageNumber),W/2-3,H-20,9,'#88747f');images.push({data:canvas.toDataURL('image/jpeg',0.93),width:canvas.width,height:canvas.height});canvas=null;}
    function page(cover=false){finish();pageNumber++;canvas=createCanvas(Math.round(W*SCALE),Math.round(H*SCALE));ctx=canvas.getContext('2d');ctx.scale(SCALE,SCALE);ctx.fillStyle=cover?'#fbf0f4':'#fffdfc';ctx.fillRect(0,0,W,H);ctx.textBaseline='alphabetic';y=cover?0:76;if(!cover){text('EMMA’S SPACE',32,30,8,'#9b627a',true);text(entryTitle.length>52?entryTitle.slice(0,50)+'…':entryTitle,32,48,10,'#75616b');ctx.strokeStyle='#ead8e0';ctx.beginPath();ctx.moveTo(32,58);ctx.lineTo(W-32,58);ctx.stroke();}}
    function line(tokens,size=11.5,height=17.5) {
      if(y+height>H-40)page();
      let x=32;for(const token of tokens){font(size,token.bold,token.italic);ctx.fillStyle='#392c35';ctx.fillText(token.text,x,y);x+=ctx.measureText(token.text).width;}y+=height;
    }
    function write(runs,size=11.5,height=17.5) {
      let row=[],width=0;
      for(const run of runs)for(const character of Array.from(run.text)) {
        if(character==='\r')continue;
        if(character==='\n'){line(row,size,height);row=[];width=0;continue;}
        font(size,run.bold,run.italic);const advance=ctx.measureText(character).width;
        if(width+advance>W-64){
          const breakAt=row.map(t=>t.text).lastIndexOf(' ');
          if(breakAt>0){const tail=row.splice(breakAt+1);row.pop();line(row,size,height);row=tail;width=row.reduce((sum,t)=>{font(size,t.bold,t.italic);return sum+ctx.measureText(t.text).width;},0);}
          else {line(row,size,height);row=[];width=0;}
        }
        row.push({text:character,bold:run.bold,italic:run.italic});width+=advance;
      }
      if(row.length)line(row,size,height);
    }
    page(true);
    text('EMMA’S SPACE',143,150,12,'#986078',true);
    text('Ditari im',119,220,38,'#49313e',true);
    ctx.strokeStyle='#c98ca6';ctx.beginPath();ctx.moveTo(174,250);ctx.lineTo(245,250);ctx.stroke();
    text('Fjalët dhe kujtimet që dua t’i mbaj pranë.',76,285,13,'#715463');
    text(`${entries.length} kujtime të ruajtura`,143,330,11,'#715463');
    text('Një hapësirë vetëm për mua.',129,460,11,'#986078');
    for(const entry of entries) {
      entryTitle=entry.title || 'Një kujtim i bukur';page();
      const date=new Date(entry.date),months=['janar','shkurt','mars','prill','maj','qershor','korrik','gusht','shtator','tetor','nëntor','dhjetor'];
      text(`${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`,32,y,10,'#986078');y+=32;
      write([{text:entryTitle,bold:true}],23,30);y+=12;
      const blocks=normalize?normalize(entry.content,entry.body,entry.photos || []):entry.content || [{type:'text',text:entry.body || ''}];
      for(const block of blocks) {
        if(block.type==='text'){write(block.runs || [{text:block.text}]);continue;}
        const photo=entry.photos?.find(photo=>photo.id===block.photoId);if(!photo)continue;
        if(!/^data:image\/(?:webp|jpeg|png|gif);base64,/i.test(photo.data))throw new Error('Fotografi e pavlefshme në ditar.');
        const img=await loadImage(photo.data);let width=(W-64)*(Number(block.width)||65)/100,height=width*img.height/img.width;
        const maxHeight=H-130;if(height>maxHeight){width*=maxHeight/height;height=maxHeight;}
        y+=12;if(y+height>H-40)page();
        const x=block.align==='left'?32:block.align==='right'?W-32-width:(W-width)/2;
        ctx.drawImage(img,x,y,width,height);y+=height+16;
      }
    }
    finish();return pdfFromJpegs(images);
  }
  const api={create,pdfFromJpegs};if(typeof module==='object'&&module.exports)module.exports=api;else root.EmmaJournalPdf=api;
})(globalThis);
