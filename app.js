'use strict';
const $=id=>document.getElementById(id);
const BROKER='mfc1e7d3.ala.us-east-1.emqxsl.com';
const WSS_URL=`wss://${BROKER}:8084/mqtt`;
const SETTINGS_KEY='pc-wake-mqtt-settings-v1';
const TOPIC_WAKE='ev/wol/command';
const TOPIC_PC='ev/wol/pc/status';
const TOPIC_ESP='ev/wol/esp/status';
let saved={},credentials=null,client=null,pcStatus=null,espOnline=null,rssi=null;
let connected=false,waking=false,lastReceived=0,lastStatusRetained=false,clientSerial=0;
try{saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch{}
// The old Apps Script API token should not remain at rest in the site's storage.
try{localStorage.removeItem('pc-wake-settings-v1');}catch{}
$('broker').textContent=BROKER;
$('username').value=saved.username||'iphone_wol';
$('remember').checked=saved.remember===true;
$('password').placeholder=saved.remember&&saved.password?'Şifre kayıtlı (değiştirmek için yaz)':'EMQX iphone_wol şifresi';
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function formVisible(show){$('configForm').hidden=!show;$('settings').setAttribute('aria-expanded',String(show));}
function formatTime(ms){return new Date(ms).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function render(){
  const s=deviceState({connected,espOnline,pcStatus,rssi});
  $('pcCircle').classList.toggle('online',s.pc);
  $('espCircle').classList.toggle('online',s.esp);
  $('pcCircle').setAttribute('aria-label','PC: '+s.pcText);
  $('espCircle').setAttribute('aria-label','ESP32: '+s.espText+(s.rssi===null?'':', '+s.rssi+' dBm'));
  $('pcState').textContent=s.pcText;
  $('espState').textContent=s.espText;
  $('rssi').textContent=s.espMetric;
  $('espMetricLabel').textContent=s.espUnit;
  $('wake').disabled=!connected||!s.esp||!s.known||s.pc||waking||navigator.onLine===false;
  $('wakeText').textContent=waking?'Gönderiliyor…':'Wake';
  $('updated').textContent=lastReceived?
    'Son MQTT alımı · '+formatTime(lastReceived)+(lastStatusRetained?' (retained)':''):
    connected?'Durum mesajları bekleniyor':'MQTT bağlantısı yok';
  $('connection').textContent=connected?'MQTT bağlı':credentials?(navigator.onLine===false?'Telefon çevrimdışı':'MQTT bağlanıyor…'):'MQTT ayarları gerekli';
  $('connection').classList.toggle('live',connected);
}
function parseEspStatus(value){
  const txt=value.trim().toLowerCase();
  if(txt==='online'){espOnline=true;rssi=null;return;}
  if(txt==='offline'){espOnline=false;rssi=null;return;}
  try{
    const obj=JSON.parse(value);
    if(typeof obj.online==='boolean'){
      espOnline=obj.online;
      rssi=Number.isFinite(obj.rssi)?obj.rssi:null;
    }
  }catch{}
}
function randomClientId(){
  const v=new Uint8Array(6);crypto.getRandomValues(v);
  return 'EV_WOL_IPHONE_'+Array.from(v,b=>b.toString(16).padStart(2,'0')).join('');
}
function closeClient(){
  clientSerial++;
  if(client){client.stop();client=null;}
  connected=false;espOnline=null;pcStatus=null;rssi=null;lastReceived=0;lastStatusRetained=false;
  render();
}
function startClient(){
  closeClient();
  if(!credentials||!credentials.password||document.hidden||navigator.onLine===false)return;
  if(typeof MqttWssClient!=='function'){message('MQTT istemcisi yüklenemedi.',true);return;}
  const serial=clientSerial;
  const instance=new MqttWssClient({
    url:WSS_URL,username:credentials.username,password:credentials.password,clientId:randomClientId(),
    onConnect(){
      if(serial!==clientSerial)return;
      connected=true;pcStatus=null;espOnline=null;rssi=null;
      message('MQTT bağlandı. ESP32 ve PC durumu alınıyor…');
      instance.subscribe([TOPIC_PC,TOPIC_ESP]);
      render();
    },
    onDisconnect(reason){
      if(serial!==clientSerial)return;
      connected=false;pcStatus=null;espOnline=null;rssi=null;
      message(reason||'MQTT bağlantısı kesildi; tekrar bağlanılıyor.',true);
      render();
    },
    onMessage(topic,payload,meta){
      if(serial!==clientSerial)return;
      if(topic===TOPIC_PC){
        const value=payload.trim().toUpperCase();
        pcStatus=['ON','OFF','UNKNOWN'].includes(value)?value:null;
      } else if(topic===TOPIC_ESP){parseEspStatus(payload);}
      else return;
      lastReceived=Date.now();lastStatusRetained=!!meta?.retain;
      if(!waking){
        const s=deviceState({connected,espOnline,pcStatus,rssi});
        if(s.esp&&s.pc)message('PC açık. Ping yanıtı alınıyor.');
        else if(s.esp&&s.known)message('PC kapalı. Açmak için Wake düğmesine dokun.');
        else if(espOnline===false)message('ESP32 çevrimdışı. Wake komutu gönderilemez.',true);
      }
      render();
    },
    onError(text){if(serial===clientSerial){message(text,true);render();}}
  });
  client=instance;
  instance.start();
  message('Güvenli MQTT bağlantısı kuruluyor…');render();
}
$('wake').addEventListener('click',async()=>{
  if(waking||!client||!connected||espOnline!==true||pcStatus!=='OFF')return;
  waking=true;render();message('WAKE komutu MQTT brokerına gönderiliyor…');
  try{
    await client.publish(TOPIC_WAKE,'WAKE');
    message('WAKE komutu broker tarafından onaylandı. PC’nin ping yanıtı bekleniyor.');
  }catch(err){message('WAKE sonucu kesinleşmedi: '+err.message,true);}
  finally{waking=false;render();}
});
$('settings').addEventListener('click',()=>formVisible($('configForm').hidden));
$('configForm').addEventListener('submit',e=>{
  e.preventDefault();
  const username=$('username').value.trim();
  const entered=$('password').value;
  const fallback=(credentials?.username===username?credentials.password:null)||
    (saved.username===username?saved.password:null);
  const password=entered||fallback;
  if(!username||!password){message('MQTT kullanıcı adı ve şifresini gir.',true);return;}
  credentials={username,password};
  saved={username,remember:$('remember').checked};
  if(saved.remember)saved.password=password;
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(saved));}
  catch{message('Bilgiler cihazda saklanamadı; bu oturumda kullanılacak.',true);}
  $('password').value='';
  $('password').placeholder=saved.remember?'Şifre kayıtlı (değiştirmek için yaz)':'EMQX iphone_wol şifresi';
  formVisible(false);startClient();
});
$('forget').addEventListener('click',()=>{
  closeClient();credentials=null;saved={username:'iphone_wol',remember:false};
  try{localStorage.removeItem(SETTINGS_KEY);}catch{}
  $('username').value='iphone_wol';$('password').value='';$('password').placeholder='EMQX iphone_wol şifresi';
  $('remember').checked=false;formVisible(true);message('Bu cihazdaki MQTT giriş bilgileri silindi.');render();
});
$('refresh').addEventListener('click',()=>{
  if(!credentials){formVisible(true);message('Önce MQTT bağlantı bilgilerini gir.');return;}
  if(client&&connected){
    // Re-subscribe sends retained statuses immediately without extra topics/HTTP calls.
    client.subscribe([TOPIC_PC,TOPIC_ESP]);message('MQTT üzerinden son durum isteniyor…');
  }else startClient();
});
window.addEventListener('online',()=>{if(credentials)startClient();});
window.addEventListener('offline',()=>{closeClient();message('Telefonun internet bağlantısı yok.',true);});
document.addEventListener('visibilitychange',()=>{
  // iOS background WebSockets are not reliable; reconnect and fetch retained state upon return.
  if(document.hidden){closeClient();return;}
  if(credentials)startClient();
});
credentials=saved.remember&&saved.password?{username:saved.username,password:saved.password}:null;
formVisible(!credentials);render();
if(credentials)startClient();
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
