/*
 * Small, dependency-free MQTT 3.1.1 client for secure browser WebSockets.
 * Supported: username/password, QoS 0 subscriptions, retained messages,
 * QoS 1 publishes with PUBACK, LWT reception, keepalive and reconnect.
 * Written for PC Wake; not intended as a general-purpose MQTT library.
 */
'use strict';
(function(root){
  const encoder=new TextEncoder();
  const decoder=new TextDecoder();
  function bytes(text){return encoder.encode(String(text));}
  function u16(n){return [(n>>>8)&255,n&255];}
  function str(text){const v=bytes(text);if(v.length>65535)throw Error('MQTT metni fazla uzun.');return Uint8Array.from([...u16(v.length),...v]);}
  function remaining(n){const result=[];do{let b=n%128;n=Math.floor(n/128);if(n)b|=128;result.push(b);}while(n);return result;}
  function packet(header,body=[]){return Uint8Array.from([header,...remaining(body.length),...body]);}
  function join(parts){let n=0;parts.forEach(p=>n+=p.length);const b=new Uint8Array(n);let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return b;}
  function readText(buf,pos){if(pos+2>buf.length)throw Error('Geçersiz MQTT metni.');const n=buf[pos]*256+buf[pos+1];if(pos+2+n>buf.length)throw Error('Eksik MQTT metni.');return [decoder.decode(buf.slice(pos+2,pos+2+n)),pos+2+n];}
  class MqttWssClient{
    constructor({url,username,password,clientId,onConnect,onDisconnect,onMessage,onError}){
      Object.assign(this,{url,username,password,clientId,onConnect,onDisconnect,onMessage,onError});
      this.ws=null;this.connected=false;this.running=false;this.buffer=new Uint8Array(0);
      this.packetId=0;this.pending=new Map();this.subscriptions=[];
      this.reconnectTimer=null;this.connectTimer=null;this.pingTimer=null;
      this.lastTraffic=0;this.pingSentAt=0;this.failure='';
    }
    notifyError(text){this.failure=text;this.onError?.(text);}
    start(){if(this.running)return;this.running=true;this.open();}
    stop(){
      this.running=false;clearTimeout(this.reconnectTimer);clearTimeout(this.connectTimer);clearInterval(this.pingTimer);
      this.reconnectTimer=this.connectTimer=this.pingTimer=null;
      this.connected=false;this.rejectPending('MQTT bağlantısı kesildi.');
      const ws=this.ws;this.ws=null;
      if(ws){try{if(ws.readyState===WebSocket.OPEN){ws.send(packet(0xE0));}}catch{}try{ws.close();}catch{}}
    }
    nextId(){this.packetId=this.packetId%65535+1;return this.packetId;}
    rejectPending(reason){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(Error(reason));}this.pending.clear();}
    open(){
      if(!this.running || this.ws)return;
      let ws;
      try{ws=new WebSocket(this.url,['mqtt']);}
      catch(e){this.notifyError('WebSocket başlatılamadı: '+e.message);this.scheduleReconnect();return;}
      this.ws=ws;ws.binaryType='arraybuffer';this.buffer=new Uint8Array(0);this.failure='';
      this.connectTimer=setTimeout(()=>{if(this.ws===ws&&!this.connected){this.notifyError('MQTT bağlantısı zaman aşımına uğradı.');ws.close();}},15000);
      ws.onopen=()=>{
        if(this.ws!==ws)return;
        const vh=Uint8Array.from([0,4,77,81,84,84,4,0xC2,0,60]); // MQTT 3.1.1, clean session, user+pass
        this.send(packet(0x10,join([vh,str(this.clientId),str(this.username),str(this.password)])));
      };
      ws.onmessage=async(e)=>{
        if(this.ws!==ws)return;
        try{
          const v=e.data instanceof ArrayBuffer?new Uint8Array(e.data):
            e.data instanceof Blob?new Uint8Array(await e.data.arrayBuffer()):new Uint8Array(e.data);
          if(this.ws===ws)this.receive(v);
        }catch(err){this.notifyError('MQTT paket işleme hatası: '+err.message);try{ws.close();}catch{}}
      };
      ws.onerror=()=>{if(this.ws===ws && !this.failure)this.notifyError('MQTT sunucusuna WSS bağlantısı kurulamadı.');};
      ws.onclose=()=>{
        if(this.ws!==ws)return;
        this.ws=null;clearTimeout(this.connectTimer);clearInterval(this.pingTimer);this.connectTimer=null;this.pingTimer=null;
        this.connected=false;this.pingSentAt=0;this.rejectPending('Bağlantı kesildi; komutun ulaştığı doğrulanamadı.');
        this.onDisconnect?.(this.failure||'MQTT bağlantısı kesildi.');
        this.scheduleReconnect();
      };
    }
    scheduleReconnect(){if(!this.running)return;clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>this.open(),5000);}
    send(data){if(!this.ws||this.ws.readyState!==WebSocket.OPEN)throw Error('MQTT bağlantısı açık değil.');this.ws.send(data);this.lastTraffic=Date.now();}
    receive(chunk){
      if(this.buffer.length+chunk.length>262144)throw Error('MQTT paket boyutu sınırı aşıldı.');
      this.buffer=join([this.buffer,chunk]);let pos=0;
      while(pos<this.buffer.length){
        if(pos+2>this.buffer.length)break;
        let len=0,multiplier=1,at=pos+1,complete=false;
        for(let i=0;i<4;i++){
          if(at>=this.buffer.length)break;
          const b=this.buffer[at++];len+=(b&127)*multiplier;
          if(!(b&128)){complete=true;break;}multiplier*=128;
        }
        if(!complete){if(at-pos>=5)throw Error('MQTT uzunluk alanı geçersiz.');break;}
        if(len>131072)throw Error('MQTT paket uzunluğu fazla.');
        if(at+len>this.buffer.length)break;
        this.handle(this.buffer[pos],this.buffer.slice(at,at+len));
        pos=at+len;
      }
      this.buffer=this.buffer.slice(pos);
    }
    handle(header,body){
      const type=header>>>4;
      if(type===2){ // CONNACK
        if(body.length!==2)throw Error('Geçersiz CONNACK.');
        if(body[1]){
          const reasons={1:'Protokol reddedildi',2:'Client ID reddedildi',3:'Sunucu kullanılamıyor',4:'Kullanıcı adı veya şifre hatalı',5:'Yetkisiz bağlantı'};
          this.notifyError('MQTT giriş başarısız: '+(reasons[body[1]]||('Kod '+body[1]))+'.');
          this.running=false;this.ws?.close();return;
        }
        clearTimeout(this.connectTimer);this.connectTimer=null;
        this.connected=true;this.lastTraffic=Date.now();this.pingSentAt=0;
        this.pingTimer=setInterval(()=>this.checkPing(),10000);
        this.onConnect?.();
      }else if(type===3){ // PUBLISH
        let [topic,offset]=readText(body,0);
        const qos=(header>>>1)&3;
        if(qos===3)throw Error('Geçersiz MQTT QoS.');
        let id;
        if(qos){if(offset+2>body.length)throw Error('Eksik paket kimliği.');id=body[offset]*256+body[offset+1];offset+=2;}
        const content=decoder.decode(body.slice(offset));
        if(qos===1)this.send(packet(0x40,u16(id)));
        this.onMessage?.(topic,content,{retain:!!(header&1),qos});
      }else if(type===9){ // SUBACK
        if(body.length<3)throw Error('Geçersiz SUBACK.');
        if([...body.slice(2)].some(x=>x===0x80))this.notifyError('MQTT durum konularına abonelik reddedildi. Authorization izinlerini kontrol et.');
      }else if(type===4){ // PUBACK
        if(body.length<2)return;
        const id=body[0]*256+body[1],item=this.pending.get(id);
        if(item){this.pending.delete(id);clearTimeout(item.timer);item.resolve();}
      }else if(type===13){this.pingSentAt=0;}
      this.lastTraffic=Date.now();
    }
    subscribe(topics){
      if(!this.connected)throw Error('MQTT bağlı değil.');
      this.subscriptions=topics.slice();
      const body=[...u16(this.nextId())];
      for(const topic of topics)body.push(...str(topic),0); // QoS 0
      this.send(packet(0x82,body));
    }
    publish(topic,content){ // QoS 1, retain=false
      if(!this.connected)return Promise.reject(Error('MQTT bağlı değil.'));
      const id=this.nextId();const frame=packet(0x32,join([str(topic),Uint8Array.from(u16(id)),bytes(content)]));
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Broker onayı alınamadı; komut ulaşmış olabilir.'));},10000);
        this.pending.set(id,{resolve,reject,timer});
        try{this.send(frame);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
      });
    }
    checkPing(){
      if(!this.connected)return;
      if(this.pingSentAt){if(Date.now()-this.pingSentAt>20000){this.notifyError('MQTT ping yanıtı alınamadı.');this.ws?.close();}return;}
      if(Date.now()-this.lastTraffic>40000){this.pingSentAt=Date.now();try{this.send(packet(0xC0));}catch{this.ws?.close();}}
    }
  }
  root.MqttWssClient=MqttWssClient;
})(typeof window!=='undefined'?window:globalThis);
