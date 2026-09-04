(() => {
  const MEDIA = 'https://studio-media-api.autumnnails.com';
  const styleHref = '/studio-gallery.css?v=20260904b';
  if(!document.querySelector(`link[href="${styleHref}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=styleHref;document.head.appendChild(link)}
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const gallery = () => document.getElementById('gallery');
  const write = body => {
    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(body));
    return fetch(MEDIA + '/api/gallery/metadata', {
      method:'POST', credentials:'include', cache:'no-store',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:form
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save gallery changes.');
      return data;
    });
  };
  async function loadGalleryControls(){
    if(location.hash.slice(1) !== 'photos') return;
    const host = gallery(); if(!host) return;
    try {
      const data = await api(MEDIA,'/api/gallery');
      const list = data.files || [];
      if(!list.length){ host.innerHTML='<div class="empty">No photos in the gallery yet.</div>'; return; }
      host.innerHTML = list.map((p,i) => `<article class="photo gallery-photo" data-photo-name="${esc(p.name)}"><img src="${esc(p.url)}" alt="${esc(p.caption || 'Autumn Nails')}" loading="lazy"><div class="inside"><div class="gallery-photo-meta">${p.homepage?'<span class="gallery-home-badge">★ Homepage</span>':''}<span class="gallery-position">${i+1} of ${list.length}</span></div><input value="${esc(p.caption || '')}" maxlength="180" aria-label="Caption" placeholder="Add a caption…"><div class="gallery-actions"><button class="button gallery-caption-save" type="button">Save caption</button><div class="gallery-move-group"><button class="button secondary gallery-move-left" type="button" aria-label="Move photo left" title="Move left" ${i===0?'disabled':''}>←</button><button class="button secondary gallery-move-right" type="button" aria-label="Move photo right" title="Move right" ${i===list.length-1?'disabled':''}>→</button></div><button class="button secondary gallery-home" type="button" ${p.homepage?'disabled':''}>★ Set homepage</button><button class="button secondary gallery-delete" type="button">Delete</button></div></div></article>`).join('');
      host.querySelectorAll('.photo').forEach(card => {
        const name=card.dataset.photoName;
        card.querySelector('.gallery-caption-save').onclick=async()=>{const button=card.querySelector('.gallery-caption-save');button.disabled=true;button.textContent='Saving…';try{await write({name,caption:card.querySelector('input').value.trim()});button.textContent='Saved';setTimeout(()=>{button.textContent='Save caption';button.disabled=false},900)}catch(e){button.textContent='Save caption';button.disabled=false;alert(e.message)}};
        card.querySelector('.gallery-move-left').onclick=()=>move(name,-1);
        card.querySelector('.gallery-move-right').onclick=()=>move(name,1);
        card.querySelector('.gallery-home').onclick=async()=>{try{await write({homepage:name});await loadGalleryControls()}catch(e){alert(e.message)}};
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
    try{await write({order:names});await loadGalleryControls()}catch(e){alert(e.message)}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadGalleryControls); else loadGalleryControls();
  window.addEventListener('hashchange',()=>setTimeout(loadGalleryControls,50));
})();
