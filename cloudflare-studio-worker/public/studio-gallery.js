(() => {
  const MEDIA = 'https://studio-media-api.autumnnails.com';
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const gallery = () => document.getElementById('gallery');
  async function loadGalleryControls(){
    if(location.hash.slice(1) !== 'photos') return;
    const host = gallery(); if(!host) return;
    try {
      const data = await api(MEDIA,'/api/gallery');
      const list = data.files || [];
      if(!list.length){ host.innerHTML='<div class="empty">No photos in the gallery yet.</div>'; return; }
      host.innerHTML = list.map((p,i) => `<article class="photo" data-photo-name="${esc(p.name)}"><img src="${esc(p.url)}" alt="${esc(p.caption || 'Autumn Nails')}" loading="lazy"><div class="inside">${p.homepage?'<div class="gallery-home-badge">★ Homepage image</div>':''}<div class="gallery-position">Gallery position ${i+1} of ${list.length}</div><input value="${esc(p.caption || '')}" maxlength="180" aria-label="Caption"><div class="gallery-actions"><button class="button secondary gallery-caption-save">Save caption</button><button class="button secondary gallery-move-left" ${i===0?'disabled':''}>← Move left</button><button class="button secondary gallery-move-right" ${i===list.length-1?'disabled':''}>Move right →</button><button class="button secondary gallery-home" ${p.homepage?'disabled':''}>★ Set homepage</button><button class="button secondary gallery-delete">Delete</button></div></div></article>`).join('');
      host.querySelectorAll('.photo').forEach(card => {
        const name=card.dataset.photoName;
        card.querySelector('.gallery-caption-save').onclick=async()=>{try{await api(MEDIA,'/api/gallery/metadata',{method:'PUT',body:JSON.stringify({name,caption:card.querySelector('input').value.trim()})});await loadGalleryControls()}catch(e){alert(e.message)}};
        card.querySelector('.gallery-move-left').onclick=()=>move(name,-1);
        card.querySelector('.gallery-move-right').onclick=()=>move(name,1);
        card.querySelector('.gallery-home').onclick=async()=>{try{await api(MEDIA,'/api/gallery/metadata',{method:'PUT',body:JSON.stringify({homepage:name})});await loadGalleryControls()}catch(e){alert(e.message)}};
        card.querySelector('.gallery-delete').onclick=async()=>{if(!confirm('Delete this gallery photo?'))return;try{await api(MEDIA,'/api/gallery/'+encodeURIComponent(name),{method:'DELETE'});await loadGalleryControls()}catch(e){alert(e.message)}};
      });
    } catch(e) { console.error('Studio gallery controls failed',e); }
  }
  async function move(name,delta){
    const cards=[...gallery().querySelectorAll('.photo')];
    const names=cards.map(c=>c.dataset.photoName);
    const i=names.indexOf(name), target=i+delta;
    if(i<0||target<0||target>=names.length)return;
    [names[i],names[target]]=[names[target],names[i]];
    try{await api(MEDIA,'/api/gallery/metadata',{method:'PUT',body:JSON.stringify({order:names})});await loadGalleryControls()}catch(e){alert(e.message)}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadGalleryControls); else loadGalleryControls();
  window.addEventListener('hashchange',()=>setTimeout(loadGalleryControls,50));
})();
