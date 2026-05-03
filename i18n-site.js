(()=>{
  const KEY='mcv-lang';
  let lang=localStorage.getItem(KEY)||'es';
  const page=(location.pathname.split('/').pop()||'index.html');
  const dict={
    'index.html':{
      en:{
        '.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(2) a':'Tournament','.nav-links li:nth-child(3) a':'Bot','.nav-links li:nth-child(4) a':'Tickets','.nav-links li:nth-child(5) a':'Streams',
        '.home-hero-content p':'Competitive clan, events, streams and tools to manage Rust players better.',
        '.home-actions a:nth-child(1)':'View events','.home-actions a:nth-child(2)':'Open tracker','.home-actions a:nth-child(3)':'Discord',
        '.bottom-cta h2':'Join the <span>command.</span>'
      }
    },
    'tournament.html':{
      en:{
        '.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(2) a':'Tournament','.nav-links li:nth-child(3) a':'Bot','.nav-links li:nth-child(4) a':'Tickets','.nav-links li:nth-child(5) a':'Streams',
        '.tournament-hero h1':'LAST SQUAD <span>STANDING.</span>',
        '.tournament-hero .description':'30 teams. 5 players per roster. One competitive bracket.',
        '.tournament-actions a:nth-child(1)':'REGISTER TEAM','.tournament-actions a:nth-child(2)':'VIEW RULES','.tournament-actions a:nth-child(3)':'DISCORD'
      }
    }
  };

  function set(sel,val){const el=document.querySelector(sel); if(!el) return; if(val.includes('<span>')) el.innerHTML=val; else el.textContent=val;}
  function apply(){document.documentElement.lang=lang; const m=(dict[page]&&dict[page][lang])||{}; if(lang==='es'){location.reload(); return;} Object.entries(m).forEach(([s,v])=>set(s,v)); const b=document.getElementById('site-lang-toggle'); if(b)b.textContent=lang==='es'?'EN':'ES'; }
  const b=document.getElementById('site-lang-toggle'); if(b){b.onclick=()=>{lang=lang==='es'?'en':'es';localStorage.setItem(KEY,lang);if(lang==='es'){localStorage.setItem(KEY,'es');location.reload();}else apply();}; b.textContent=lang==='es'?'EN':'ES';}
  if(lang==='en') apply();
})();
