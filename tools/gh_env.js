window.PREP_ENV=(function(){
  const CFG=/*CFG*/{};
  const LSK="ps_ido_";
  const te=new TextEncoder(), td=new TextDecoder();
  const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const b64e=u=>{let s="";u.forEach(b=>s+=String.fromCharCode(b));return btoa(s);};
  let CK=null, KEYS=null, resolveReady;
  const ready=new Promise(r=>{resolveReady=r;});

  async function fetchKeys(force){const r=await fetch("keys.json",{cache:force?"reload":"no-cache"});if(!r.ok)throw new Error("keys");return r.json();}
  async function importCK(raw){return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["decrypt"]);}
  async function decryptJSON(env){const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(env.iv)},CK,b64d(env.ct));return JSON.parse(td.decode(pt));}
  function norm(code){return String(code||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
  async function unwrap(code){
    const c=norm(code); const id=c.slice(0,4), secret=c.slice(4);
    const e=KEYS.people[id]; if(!e||secret.length<8)throw new Error("code");
    const base=await crypto.subtle.importKey("raw",te.encode(secret),"PBKDF2",false,["deriveKey"]);
    const kek=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64d(e.salt),iterations:KEYS.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
    const raw=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(e.iv)},kek,b64d(e.wrapped)));
    return {raw,id};
  }
  function gate(msg){
    const app=document.getElementById("app");
    app.innerHTML=`<div class="stack" style="max-width:440px;margin:40px auto">
      <div><div class="eyebrow">Prep Studio · WBPSC IDO</div><h1 style="margin-top:4px">Enter your access code</h1>
      <p class="muted" style="margin:8px 0 0">The course is encrypted. Use the personal code you were given, for example <b>ab12-cd34-ef56</b>.</p></div>
      <form id="gateform" class="stack" style="gap:8px">
        <label for="gatecode" class="small">Access code</label>
        <input id="gatecode" autocomplete="off" autocapitalize="off" spellcheck="false" style="font:inherit;font-size:18px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);letter-spacing:.05em">
        <button class="btn primary" type="submit" id="gatego">Unlock</button>
        <div class="err" id="gateerr">${msg||""}</div>
      </form>
      <p class="small muted">Unlocking takes a second or two. The code is remembered on this device until the course key changes.</p>
    </div>`;
    const inp=document.getElementById("gatecode"); inp.focus(); inp.oninput=()=>{document.getElementById("gateerr").textContent="";};
    document.getElementById("gateform").onsubmit=async e=>{
      e.preventDefault(); const v=inp.value.trim();
      if(!v){document.getElementById("gateerr").textContent="Enter your access code.";return;}
      const b=document.getElementById("gatego"); b.disabled=true; b.textContent="Unlocking…";
      try{const {raw,id}=await unwrap(v);CK=await importCK(raw);
        try{localStorage.setItem(LSK+"ck",JSON.stringify({v:KEYS.v,id,k:b64e(raw)}));}catch(x){}
        app.innerHTML='<p class="muted">Loading your course…</p>'; resolveReady();
      }catch(err){b.disabled=false;b.textContent="Unlock";document.getElementById("gateerr").textContent="That code didn't work. Check it and try again, or ask for a new one.";}
    };
  }
  async function start(){
    if(!window.crypto||!crypto.subtle){document.getElementById("app").innerHTML='<p class="err">This browser can\'t unlock the course. Use a recent Chrome, Edge, Safari or Firefox.</p>';return;}
    try{KEYS=await fetchKeys(false);}catch(e){document.getElementById("app").innerHTML='<p class="err">Couldn\'t reach the course. Check your connection and reload.</p>';return;}
    let cached=null;try{cached=JSON.parse(localStorage.getItem(LSK+"ck")||"null");}catch(e){}
    if(cached&&cached.v===KEYS.v&&KEYS.people[cached.id]){try{CK=await importCK(b64d(cached.k));resolveReady();return;}catch(e){}}
    gate(cached&&cached.v!==KEYS.v?"The course key has changed. Enter your code again.":"");
  }
  async function get(f,force){
    const r=await fetch("content/"+f+".enc",{cache:force?"reload":"no-cache"});
    if(!r.ok)throw new Error("fetch "+f);
    try{return await decryptJSON(await r.json());}
    catch(e){try{localStorage.removeItem(LSK+"ck");}catch(x){} location.reload(); throw e;}
  }

  /* ---- Google Drive (drive.file scope: only the file this app creates) ---- */
  const FNAME="prep-studio-ido-progress.json";
  let token=null, tokenExp=0, fileId=null, tc=null, saveT=null, pending=false;
  function btn(){return document.getElementById("drivebtn");}
  function loadGIS(){return new Promise((res,rej)=>{if(window.google&&google.accounts)return res();const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
  async function api(url,opt){
    opt=opt||{};opt.headers=Object.assign({Authorization:"Bearer "+token},opt.headers||{});
    const r=await fetch(url,opt); if(r.status===401){token=null;throw new Error("auth");} if(!r.ok)throw new Error("drive "+r.status); return r;
  }
  async function findFile(){
    const q=encodeURIComponent(`name='${FNAME}' and trashed=false`);
    const r=await api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
    const j=await r.json(); return j.files&&j.files[0]?j.files[0].id:null;
  }
  async function upload(){
    const body=JSON.stringify({app:"prep-studio-ido",v:1,saved:new Date().toISOString(),state:S,notes:N});
    if(fileId){await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,{method:"PATCH",headers:{"Content-Type":"application/json"},body});return;}
    const meta={name:FNAME,mimeType:"application/json",description:"Progress for Prep Studio (WBPSC IDO). Safe to keep; delete to reset."};
    const fd=new FormData(); fd.append("metadata",new Blob([JSON.stringify(meta)],{type:"application/json"})); fd.append("file",new Blob([body],{type:"application/json"}));
    const r=await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",body:fd}); fileId=(await r.json()).id;
  }
  async function pull(){
    fileId=await findFile(); if(!fileId){await upload();return;}
    const r=await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`); const d=await r.json();
    let changed=false;
    if(d.state&&(d.state.last||0)>(S.last||0)){S=Object.assign(structuredClone(DEF),d.state);try{localStorage.setItem(LSK+"state",JSON.stringify(S));}catch(e){}changed=true;}
    if(d.notes&&(d.notes.last||0)>(N.last||0)){N=d.notes;if(!Array.isArray(N.items))N.items=[];try{localStorage.setItem(LSK+"notes",JSON.stringify(N));}catch(e){}changed=true;}
    if(!changed||(S.last||0)>((d.state||{}).last||0))await upload();
    if(changed)render(true);
  }
  function connected(){return token&&Date.now()<tokenExp-60000;}
  function setBtn(t,show){const b=btn();if(!b)return;b.hidden=!show;b.textContent=t;}
  async function connect(){
    try{await loadGIS();}catch(e){setSync("warn","Couldn't load Google sign-in");return;}
    if(!tc)tc=google.accounts.oauth2.initTokenClient({client_id:CFG.clientId,scope:"https://www.googleapis.com/auth/drive.file",callback:async resp=>{
      if(resp.error){setSync("warn","Drive not connected");return;}
      token=resp.access_token; tokenExp=Date.now()+(resp.expires_in||3600)*1000;
      try{localStorage.setItem(LSK+"drive","1");}catch(e){}
      setSync("warn","Syncing with Drive…"); setBtn("Drive connected",false);
      try{await pull();setSync("ok","Synced to your Google Drive");pending=false;}catch(e){setSync("warn","Drive sync failed. Saved on this device");setBtn("Retry Drive sync",true);}
    }});
    tc.requestAccessToken({prompt:localStorage.getItem(LSK+"drive")?"":"consent"});
  }
  function save(){
    if(!CFG.clientId)return;
    clearTimeout(saveT); pending=true;
    saveT=setTimeout(async()=>{
      if(!connected()){setSync("warn","Saved on this device · reconnect Drive to sync");setBtn("Sync to Drive",true);return;}
      try{setSync("warn","Saving to Drive…");await upload();pending=false;setSync("ok","Synced to your Google Drive");}
      catch(e){setSync("warn","Drive save failed. Saved on this device");setBtn("Sync to Drive",true);}
    },2500);
  }
  function initCloud(){
    if(!CFG.clientId){setSync("","Saved on this device");return;}
    const h=document.querySelector("header.top"); if(h&&!btn()){const b=document.createElement("button");b.className="btn sm";b.id="drivebtn";b.onclick=connect;h.insertBefore(b,document.getElementById("updbtn"));}
    setSync("","Saved on this device");
    setBtn(localStorage.getItem(LSK+"drive")?"Sync to Drive":"Connect Google Drive",true);
  }
  window.addEventListener("beforeunload",e=>{if(pending&&connected()){e.preventDefault();e.returnValue="";}});
  document.addEventListener("DOMContentLoaded",start);
  return {mode:"gh",lsPrefix:LSK,ready,get,save,initCloud,lock(){try{localStorage.removeItem(LSK+"ck");}catch(e){}location.reload();}};
})();
