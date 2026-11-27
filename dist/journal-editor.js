/* Local, structured diary editor. Only plain text and locally saved photos are stored. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const widths = [35, 65, 100];
  const safePhotoData = data => /^data:image\/(?:webp|jpeg|png|gif);base64,[A-Za-z0-9+/\s]+={0,2}$/i.test(data || '') ? data : '';
  function normalize(content, body = '', photos = []) {
    const ids = new Set(photos.map(photo => photo.id));
    const seen = new Set();
    const blocks = Array.isArray(content) ? content.flatMap(block => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const runs=Array.isArray(block.runs)?block.runs.filter(r=>r&&typeof r.text==='string').map(r=>({text:r.text,bold:r.bold===true,italic:r.italic===true})):[];
        return [{type:'text',text:block.text,...(runs.length&&runs.map(r=>r.text).join('')===block.text?{runs}:{})}];
      }
      if (block?.type !== 'photo' || !ids.has(block.photoId) || seen.has(block.photoId)) return [];
      seen.add(block.photoId);
      return [{type:'photo', photoId:block.photoId, align:['left','center','right'].includes(block.align) ? block.align : 'center', width:widths.includes(Number(block.width)) ? Number(block.width) : 65}];
    }) : [{type:'text', text:String(body || '')}];
    if (!blocks.length && body) blocks.push({type:'text',text:String(body)});
    photos.forEach(photo => { if (!seen.has(photo.id)) blocks.push({type:'photo',photoId:photo.id,align:'center',width:65}); });
    return blocks;
  }
  const text = blocks => blocks.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
  function photoHTML(block, photo, editable) {
    if (!safePhotoData(photo.data)) return '';
    const controls = editable ? `<details class="journal-photo-layout"><summary>Rregullo fotografinë</summary><div class="journal-photo-controls">
      ${[['left','Majtas'],['center','Në mes'],['right','Djathtas']].map(([value,label]) => `<button type="button" data-photo-align="${value}" aria-pressed="${block.align === value}">${label}</button>`).join('')}
      <select aria-label="Madhësia e fotografisë" data-photo-width>${[[35,'E vogël'],[65,'Mesatare'],[100,'E gjerë']].map(([value,label])=>`<option value="${value}" ${block.width===value?'selected':''}>${label}</option>`).join('')}</select>
      <button type="button" data-remove-inline-photo aria-label="Hiq fotografinë">×</button>
    </div></details>` : '';
    return `<figure class="journal-inline-photo" data-photo-id="${escape(photo.id)}" data-align="${block.align}" data-width="${block.width}" ${editable?'contenteditable="false"':''}><img src="${escape(photo.data)}" alt="${escape(photo.name || 'Fotografi e ditarit')}" style="width:${block.width}%;" draggable="false">${controls}</figure>`;
  }
  function html(content, photos, editable = false) {
    return content.map(block => {
      if (block.type === 'text') {
        const runs=block.runs || [{text:block.text}];
        return block.text ? `<div class="journal-text-block">${runs.map(run=>{let value=escape(run.text).replace(/\n/g,'<br>');if(run.bold)value=`<strong>${value}</strong>`;if(run.italic)value=`<em>${value}</em>`;return value;}).join('')}</div>` : '';
      }
      const photo = photos.find(item => item.id === block.photoId);
      return photo ? photoHTML(block,photo,editable) : '';
    }).join('');
  }
  function mount(element, {content, photos, onChange, onRemove}) {
    let bookmark = null;
    element.innerHTML = html(content,photos(),true);
    function read() {
      const blocks = [];
      let buffer = '';
      let runs=[];
      function append(value,bold=false,italic=false) {buffer+=value;const last=runs.at(-1);if(last&&last.bold===bold&&last.italic===italic)last.text+=value;else runs.push({text:value,bold,italic});}
      function flush() { if (buffer) blocks.push({type:'text',text:buffer,...(runs.some(r=>r.bold||r.italic)?{runs}:{})}); buffer='';runs=[]; }
      function visit(node,bold=false,italic=false) {
        if (node.nodeType === 3) { append(node.nodeValue,bold,italic); return; }
        if (node.nodeType !== 1) return;
        if (node.matches('figure[data-photo-id]')) {
          flush();
          if (photos().some(photo=>photo.id === node.dataset.photoId)) blocks.push({type:'photo',photoId:node.dataset.photoId,align:node.dataset.align || 'center',width:Number(node.dataset.width)||65});
          return;
        }
        bold=bold||/^(B|STRONG)$/.test(node.tagName)||Number(node.style.fontWeight)>=600||node.style.fontWeight==='bold';
        italic=italic||/^(I|EM)$/.test(node.tagName)||node.style.fontStyle==='italic';
        if (node.tagName === 'BR') { append('\n',bold,italic); return; }
        const isBlock = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE)$/.test(node.tagName);
        if (isBlock && buffer && !buffer.endsWith('\n')) append('\n');
        for (const child of node.childNodes) visit(child,bold,italic);
        if (isBlock && !buffer.endsWith('\n')) append('\n');
      }
      for (const child of element.childNodes) visit(child);
      flush();
      return blocks;
    }
    function changed() {
      const blocks=read();
      element.dataset.empty = !text(blocks) && !blocks.some(block=>block.type==='photo') ? 'true' : 'false';
      onChange(blocks);
    }
    function remember() {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return;
      const target = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      if (target?.closest('figure')) return;
      bookmark=range.cloneRange();
    }
    function rangeAtCursor(append = false) {
      const range = document.createRange();
      if (!append && bookmark && element.contains(bookmark.startContainer) && element.contains(bookmark.endContainer)) return bookmark.cloneRange();
      range.selectNodeContents(element); range.collapse(false); return range;
    }
    function select(range) {
      element.focus({preventScroll:true});
      const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); bookmark=range.cloneRange();
    }
    function insertText(value, append = false) {
      const range=rangeAtCursor(append);
      if (range.cloneContents().querySelector?.('figure')) range.collapse(false);
      range.deleteContents();
      const node=document.createTextNode(value); range.insertNode(node); range.setStartAfter(node);range.collapse(true);select(range);changed();
    }
    function removePhoto(photoId, notify=true) {
      [...element.querySelectorAll('figure[data-photo-id]')].filter(node=>node.dataset.photoId===photoId).forEach(node=>node.remove());
      if(notify) changed();
    }
    function insertPhoto(photo) {
      const range=rangeAtCursor(); range.collapse(false);
      const oldBlock=read().find(block=>block.type==='photo' && block.photoId===photo.id);
      removePhoto(photo.id,false);
      const template=document.createElement('template');
      template.innerHTML=photoHTML(oldBlock || {align:'center',width:65},photo,true);
      const figure=template.content.firstElementChild;
      if (!figure) return;
      range.insertNode(figure);
      const line=document.createElement('div');line.appendChild(document.createElement('br'));
      figure.after(line);range.setStart(line,0);range.collapse(true);select(range);changed();
    }
    function click(event) {
      const figure=event.target.closest('figure[data-photo-id]');
      if(!figure || !element.contains(figure))return;
      const alignment=event.target.closest('[data-photo-align]');
      if(alignment) {
        figure.dataset.align=alignment.dataset.photoAlign;
        figure.querySelectorAll('[data-photo-align]').forEach(button=>button.setAttribute('aria-pressed',String(button===alignment)));
        changed();
      }
      if(event.target.closest('[data-remove-inline-photo]')) onRemove(figure.dataset.photoId);
    }
    function change(event) {
      if (!event.target.matches('[data-photo-width]'))return;
      const figure=event.target.closest('figure');
      figure.dataset.width=event.target.value;
      figure.querySelector('img').style.width=event.target.value+'%';changed();
    }
    function paste(event) { if(event.target.closest('[contenteditable="false"]'))return; event.preventDefault();insertText(event.clipboardData.getData('text/plain')); }
    function drop(event) { event.preventDefault(); if(!event.dataTransfer.files.length)insertText(event.dataTransfer.getData('text/plain')); }
    element.addEventListener('input',changed);
    element.addEventListener('click',click);
    element.addEventListener('change',change);
    element.addEventListener('paste',paste);
    element.addEventListener('drop',drop);
    document.addEventListener('selectionchange',remember);
    element.dataset.empty = !text(content) && !content.some(block=>block.type==='photo') ? 'true' : 'false';
    function format(command) {const range=rangeAtCursor();select(range);document.execCommand(command,false);remember();changed();}
    return {read,remember,insertText,insertPhoto,removePhoto,format,selectedText:()=>rangeAtCursor().toString(),destroy(){
      element.removeEventListener('input',changed);element.removeEventListener('click',click);element.removeEventListener('change',change);element.removeEventListener('paste',paste);element.removeEventListener('drop',drop);document.removeEventListener('selectionchange',remember);
    }};
  }
  const api={normalize,text,html,mount,safePhotoData};
  if(typeof module==='object' && module.exports)module.exports=api;else root.EmmaJournalEditor=api;
})(globalThis);
