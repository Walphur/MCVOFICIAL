(()=>{const D={es:{label:'// MCV ADMIN',email:'EMAIL',password:'CONTRASEÑA',enter:'ENTRAR AL PANEL',back:'← VOLVER AL SITIO',bad:'Credenciales inválidas',lang:'EN'},en:{label:'// MCV ADMIN',email:'EMAIL',password:'PASSWORD',enter:'ENTER CONTROL ROOM',back:'← BACK TO SITE',bad:'Invalid credentials',lang:'ES'}};const L='mcv-lang';let lang=localStorage.getItem(L)||'es';
const USER='mcv_root_admin'; const HASH='e24d20f269e3946f78adf5e7f9c1f0f5456b916f9f97c58a97d2fe6f4e8fd8e5';
const $$=s=>[...document.querySelectorAll(s)], t=k=>D[lang][k]||k; async function sha256(v){const b=new TextEncoder().encode(v);const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function i18n(){document.documentElement.lang=lang;$$('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));langBtn.textContent=t('lang');}
langBtn.onclick=()=>{lang=lang==='es'?'en':'es';localStorage.setItem(L,lang);i18n();};
loginForm.onsubmit=async(e)=>{e.preventDefault();const okUser=email.value.trim()===USER;const okPass=(await sha256(password.value))===HASH;if(okUser&&okPass){sessionStorage.setItem('mcv-admin-auth','ok');location.href='admin.html';}else{msg.textContent=t('bad');}};
i18n();})();
