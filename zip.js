// ZIP32 with stored entries: browser Blobs avoid duplicating an entire archive in JavaScript memory.
(function(root){
  const encoder=new TextEncoder(), table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  const safeName=s=>String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^\.+/,'_').slice(0,160)||'file';
  async function crc(blob){let value=0xffffffff;const reader=blob.stream().getReader();for(;;){const {done,value:chunk}=await reader.read();if(done)break;for(const b of chunk)value=table[(value^b)&255]^(value>>>8);}return (value^0xffffffff)>>>0;}
  async function create(entries){
    if(entries.length>65535)throw Error('ZIP entry limit');
    const parts=[],central=[];let offset=0;const names=new Set();
    for(const {name,blob} of entries){
      const path=name.split('/').map(safeName).join('/'),file=encoder.encode(path);
      if(names.has(path))throw Error('Duplicate ZIP filename');names.add(path);
      if(file.length>65535||blob.size>0xffffffff||offset+30+file.length+blob.size>0xffffffff)throw Error('ZIP size limit');
      const checksum=await crc(blob),head=new Uint8Array(30),h=new DataView(head.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,checksum,true);h.setUint32(18,blob.size,true);h.setUint32(22,blob.size,true);h.setUint16(26,file.length,true);
      parts.push(head,file,blob);
      const dir=new Uint8Array(46),d=new DataView(dir.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,checksum,true);d.setUint32(20,blob.size,true);d.setUint32(24,blob.size,true);d.setUint16(28,file.length,true);d.setUint32(42,offset,true);
      central.push(dir,file);offset+=head.length+file.length+blob.size;
    }
    const size=central.reduce((n,p)=>n+p.length,0);if(offset+size+22>0xffffffff)throw Error('ZIP size limit');
    const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  const api={create,safeName};if(typeof module!=='undefined')module.exports=api;else root.BrowserZip=api;
})(globalThis);
