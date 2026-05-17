(()=>{
const K='mcv-events';
const sample=[{id:'ev1',name:'MCV UHC DUOS #1',type:'tournament',prizePool:'$150',rules:'No cheats. 5v5.',teamSize:5,maxTeams:30,format:'single_elim',date:'2026-05-16',time:'18:00',status:'active'},{id:'ev0',name:'MCV Winter Cup',type:'tournament',prizePool:'$100',rules:'Archived event',teamSize:5,maxTeams:16,format:'double_elim',date:'2026-03-05',time:'20:00',status:'archived'}];
if(!localStorage.getItem(K)) localStorage.setItem(K,JSON.stringify(sample));
window.MCVEvents={all:()=>JSON.parse(localStorage.getItem(K)||'[]'),save:(arr)=>localStorage.setItem(K,JSON.stringify(arr)),active:()=>JSON.parse(localStorage.getItem(K)||'[]').filter(e=>e.status==='active')};
})();
