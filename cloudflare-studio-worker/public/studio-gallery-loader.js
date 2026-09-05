(() => {
  const loadGalleryControls=()=>{
    if(location.hash.slice(1)!=='photos')return;
    if(window.__studioGalleryLoading)return;
    if(typeof window.loadGallery==='function'){
      window.loadGallery();
      return;
    }
    window.__studioGalleryLoading=true;
    const script=document.createElement('script');
    script.src='/studio-gallery.js?v=20260904c';
    script.onload=()=>{
      window.__studioGalleryLoading=false;
      if(typeof window.loadGallery==='function')window.loadGallery();
      const upload=document.createElement('script');
      upload.src='/studio-gallery-upload.js?v=20260904a';
      document.body.appendChild(upload);
    };
    script.onerror=()=>{window.__studioGalleryLoading=false;console.error('Studio gallery controls failed to load')};
    document.body.appendChild(script);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadGalleryControls);else loadGalleryControls();
  window.addEventListener('hashchange',loadGalleryControls);
})();
