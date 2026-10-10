(function(root){
  function deviceState(data,now=Date.now(),receivedAt=now){
    const check=Date.parse(data?.lastCheck);
    const fresh=!!data && data.espOnline===true && Number.isFinite(check) && now-check<60000 && now-check>=-60000 && now-receivedAt<60000;
    return {esp:fresh,pc:fresh && data.pcReachable===true,
      pcText:!fresh?'Güncel bilgi yok':data.pcReachable===true?'Ping yanıtı var':data.pcReachable===false?'Ping yanıtı yok':'Bilgi yok',
      espText:fresh?'İnternete bağlı':'Güncel bağlantı yok',
      rssi:fresh && Number.isFinite(data.rssi)?String(data.rssi):'—'};
  }
  if(typeof module!=='undefined')module.exports=deviceState;
  else root.deviceState=deviceState;
})(typeof window!=='undefined'?window:globalThis);
