(() => {
  const MEDIA='https://studio-media-api.autumnnails.com';
  const css=`.gallery-upload-preview{margin-top:16px;display:grid;gap:10px}.gallery-upload-heading{display:flex;justify-content:space-between;gap:16px;align-items:baseline;padding-bottom:4px}.gallery-upload-heading span{color:var(--ink-soft);font-size:.8rem}.gallery-upload-row{display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.7)}.gallery-upload-row img{width:72px;height:72px;object-fit:cover;border-radius:12px}.gallery-upload-row>div{min-width:0}.gallery-upload-name{font-size:.72rem;color:var(--ink-soft);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gallery-upload-caption{box-sizing:border-box;width:100%;min-height:44px;padding:11px 13px;border:1px solid var(--line);border-radius:13px;background:white;color:var(--espresso);outline:none}.gallery-upload-caption:focus{border-color:rgba(196,106,43,.5);box-shadow:0 0 0 3px rgba(196,106,43,.08)}@media(max-width:520px){.gallery-upload-heading{display:grid;gap:3px}.gallery-upload-row{grid-template-columns:58px 1fr}.gallery-upload-row img{width:58px;height:58px}}`;
  if(!document.getElementById('gallery-upload-style')){const s=document.createElement('style');s.id='gallery-upload-style';s.textContent=css;document.head.appendChild(s)}
  const bind=()=>{
    if(location.hash.slice(1)!=='photos')return;
    const input=document.getElementById('photoFiles'), button=document.getElementById('uploadPhotos'), msg=document.getElementById('photoMsg');
    if(!input||!button||input.dataset.multiUploadBound==='1')return;
    input.dataset.multiUploadBound='1';
    const panel=input.closest('.panel'); let preview=document.getElementById('galleryUploadPreview');
    if(!preview){preview=document.createElement('div');preview.id='galleryUploadPreview';preview.className='gallery-upload-preview';panel.querySelector('.actions').before(preview)}
    let selected=[];
    const render=()=>{
      selected=[...input.files];
      if(!selected.length){preview.innerHTML='';button.disabled=true;return}
      preview.innerHTML=`<div class="gallery-upload-heading"><strong>${selected.length} photo${selected.length===1?'':'s'} selected</strong><span>Add a caption to each before uploading.</span></div>`+selected.map((f,i)=>`<div class="gallery-upload-row"><img src="${URL.createObjectURL(f)}" alt=""><div><div class="gallery-upload-name">${String(f.name).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]))}</div><input class="gallery-upload-caption" data-index="${i}" maxlength="180" placeholder="Add a caption…" aria-label="Caption for ${String(f.name).replace(/\"/g,'')}"></div></div>`).join('');
      button.disabled=false;msg.textContent='';
    };
    input.addEventListener('change',render);
    button.onclick=async()=>{
      if(!selected.length){msg.textContent='Choose one or more photos first.';return}
      button.disabled=true;msg.textContent='Uploading…';
      const form=new FormData();selected.forEach(f=>form.append('files',f));
      const captions={};preview.querySelectorAll('.gallery-upload-caption').forEach(el=>captions[el.dataset.index]=el.value.trim());form.append('captions',JSON.stringify(captions));
      try{
        const response=await fetch(MEDIA+'/api/gallery',{method:'POST',credentials:'include',cache:'no-store',body:form});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'Upload failed.');
        msg.textContent='✓ Photos uploaded';input.value='';selected=[];preview.innerHTML='';
        if(typeof window.__studioReloadGallery==='function')await window.__studioReloadGallery();
      }catch(e){msg.textContent=e.message;button.disabled=false}
    };
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
  window.addEventListener('hashchange',bind);
})();
