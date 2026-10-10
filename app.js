'use strict';
const $=id=>document.getElementById(id);
const DEFAULT_ENDPOINT='https://script.google.com/macros/s/AKfycbwmx1Hk5vEzcrQhh7PFGIPoeZreEPVxqxVs0LR2ICQ93hWzKSSTWOqiqHCr5N7Kjpkm/exec';
const STORAGE='pc-wake-settings-v1';
let config={},lastData=null,receivedAt=0,inFlight=false,waking=false,configVersion=0;
try{config=JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch{}
$('endpoint').value=config.url||DEFAULT_ENDPOINT;
$('token').value=config.token||'';
function configured(){return !!config.url && !!config.token;}
function formVisible(show){$('configForm').hidden=!show;$('settings').setAttribute('aria-expanded',String(show));}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function render(){
 const s=deviceState(lastData,Date.now(),receivedAt);
 if(navigator.onLine===false){s.esp=false;s.pc=false;s.rssi='—';s.espText='Telefonun interneti yok';s.pcText='Güncel bilgi yok';}
 $('pcCircle').classList.toggle('online',s.pc);$('espCircle').classList.toggle('online',s.esp);
 $('pcCircle').setAttribute('aria-label','PC: '+s.pcText);$('espCircle').setAttribute('aria-label','ESP32: '+s.espText+', '+s.rssi+' dBm');
 $('pcState').textContent=s.pcText;$('espState').textContent=s.espText;$('rssi').textContent=s.rssi;
 $('wake').disabled=!configured() || waking || navigator.onLine===false;
 $('wakeText').textContent=waking?'Gönderiliyor…':'Wake';
 const stamp=Date.parse(lastData?.lastCheck);
 $('updated').textContent=Number.isFinite(stamp)?'Son rapor · '+new Date(stamp).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Henüz rapor alınmadı';
}
async function api(action){
 const url=new URL(config.url);url.searchParams.set('action',action);url.searchParams.set('token',config.token);url.searchParams.set('_',String(Date.now()));
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url.href,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'follow',signal:controller.signal});
  if(!response.ok)throw new Error('Sunucu yanıtı: '+response.status);
  let data;try{data=await response.json();}catch{throw new Error('JSON yanıtı alınamadı. Web uygulaması erişimini ve /exec adresini kontrol et.');}
  if(data.success!==true)throw new Error(data.message||'İstek kabul edilmedi.');
  return data;
 }finally{clearTimeout(timer);}
}
function jobMessage(data){
 const texts={queued:'Açma isteği kaydedildi. ESP32 bekleniyor.',running:'WOL gönderiliyor. PC’nin yanıtı bekleniyor.',reachable:'Son açma isteği: PC ping’e yanıt verdi.',timeout:'Son açma isteği: 60 saniyede ping yanıtı alınamadı.',expired:'Açma isteğinin süresi doldu. Wake ile tekrar dene.',cancelled:'WOL gönderimi durduruldu.'};
 return texts[data.state]||'Hazır. Bilgisayarı uyandırmak için Wake’e dokun.';
}
async function refresh(){
 if(!configured() || inFlight || waking || document.hidden)return;
 inFlight=true;const version=configVersion;
 try{const data=await api('status');if(version!==configVersion||waking)return;lastData=data;receivedAt=Date.now();message(jobMessage(data));}
 catch(e){if(version!==configVersion||waking)return;lastData=null;message(e.name==='AbortError'?'Bağlantı zaman aşımına uğradı.':e instanceof TypeError?'Bağlantı kurulamadı. İnterneti, adresi ve Apps Script erişimini kontrol et.':e.message,true);}
 finally{inFlight=false;render();}
}
$('wake').addEventListener('click',async()=>{
 if(waking||!configured())return;
 configVersion++;waking=true;render();message('Açma isteği gönderiliyor…');const version=configVersion;
 try{const data=await api('wake');if(version!==configVersion)return;lastData=data;receivedAt=Date.now();message(jobMessage(data));}
 catch(e){if(version!==configVersion)return;message('İsteğin sonucu doğrulanamadı. Durumu yenile; istek sunucuya ulaşmış olabilir.',true);}
 finally{waking=false;render();}
});
$('settings').addEventListener('click',()=>formVisible($('configForm').hidden));
$('configForm').addEventListener('submit',e=>{
 e.preventDefault();let url;
 try{url=new URL($('endpoint').value.trim());if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw 0;}
 catch{message('https://script.google.com/macros/s/…/exec adresini gir.',true);return;}
 url.search='';url.hash='';const token=$('token').value.trim();if(!token){message('PHONE_TOKEN değerini gir.',true);return;}
 config={url:url.href,token};configVersion++;lastData=null;
 try{localStorage.setItem(STORAGE,JSON.stringify(config));}catch{message('Ayarlar bu oturumda kullanılacak; cihazda saklanamadı.');}
 formVisible(false);message('Bağlantı kontrol ediliyor…');render();refresh();
});
$('refresh').addEventListener('click',()=>refresh());
window.addEventListener('online',()=>refresh());
window.addEventListener('offline',()=>{render();message('Telefonun internet bağlantısı yok.',true);});
document.addEventListener('visibilitychange',()=>{render();if(!document.hidden)refresh();});
setInterval(()=>{render();refresh();},5000);
formVisible(!configured());render();if(configured())refresh();
if('serviceWorker'in navigator && location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
