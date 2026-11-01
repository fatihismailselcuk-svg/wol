/* Device presentation state from retained MQTT values (no false age assumptions). */
(function(root){
  function deviceState(data){
    const connected=data?.connected===true;
    const esp=connected && data?.espOnline===true;
    const rawPc=data?.pcStatus;
    const known=esp && (rawPc==='ON'||rawPc==='OFF');
    const pc=known && rawPc==='ON';
    const rssi=esp && Number.isFinite(data?.rssi) && data.rssi<=0 && data.rssi>=-120 ? Math.round(data.rssi) : null;
    return {
      esp,pc,known,rssi,
      espMetric:rssi===null?(esp?'ON':'—'):String(rssi),
      espUnit:rssi===null?'MQTT':'dBm',
      espText:!connected?'MQTT bağlantısı yok':esp?'İnternete bağlı':data?.espOnline===false?'ESP32 çevrimdışı':'ESP32 durumu bekleniyor',
      pcText:!connected?'Güncel bilgi yok':!esp?'ESP32 yanıtı bekleniyor':
        rawPc==='ON'?'Ping yanıtı var':rawPc==='OFF'?'Ping yanıtı yok':'PC durumu bekleniyor'
    };
  }
  if(typeof module!=='undefined')module.exports=deviceState;
  else root.deviceState=deviceState;
})(typeof window!=='undefined'?window:globalThis);
