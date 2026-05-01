(()=>{const L='mcv-lang';let lang=localStorage.getItem(L)||'es';
const T={
index:{en:{' .nav-links a:nth-child(1)': 'Clan',' .nav-links li:nth-child(2) a':'Tournament',' .nav-links li:nth-child(4) a':'Tickets','.home-hero-content p':'Competitive clan, events, streams and tools to manage Rust players better.','.btn-primary.pulse-rust':'View events','.btn-secondary':'Open tracker','.home-strip span:nth-child(2)':'Rust tournaments'},es:{}},
tournament:{en:{'.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(3) a':'Bot','.nav-links li:nth-child(4) a':'Tickets'},es:{}},
bot:{en:{'.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(2) a':'Tournament','.nav-links li:nth-child(4) a':'Tickets'},es:{}},
tickets:{en:{'.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(2) a':'Tournament','.nav-links li:nth-child(4) a':'Tickets'},es:{}},
live:{en:{'.nav-links li:nth-child(1) a':'Clan','.nav-links li:nth-child(2) a':'Tournament','.nav-links li:nth-child(4) a':'Tickets'},es:{}}
};
const page=location.pathname.split('/').pop().replace('.html','')||'index';
const base={};document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,label').forEach((el,i)=>{if(!el.dataset.base && el.textContent.trim().length){el.dataset.base=el.textContent;}});
function apply(){document.documentElement.lang=lang;const map=(T[page]&&T[page][lang])||{};document.querySelectorAll('[data-base]').forEach(el=>el.textContent=el.dataset.base);Object.entries(map).forEach(([sel,val])=>{const el=document.querySelector(sel.trim());if(el)el.textContent=val;});const btn=document.getElementById('site-lang-toggle');if(btn)btn.textContent=lang==='es'?'EN':'ES';}
const b=document.getElementById('site-lang-toggle');if(b)b.onclick=()=>{lang=lang==='es'?'en':'es';localStorage.setItem(L,lang);apply();};apply();})();
