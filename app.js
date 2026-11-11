'use strict';
// No server secrets belong in this file. Supabase RLS protects the tables.
const $ = id => document.getElementById(id);
const encode = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const alphabetical = (a,b) => String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});
const ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let client=null, currentUser=null, data={rooms:[],boxes:[],items:[]}, pendingBackup=null, busy=false;
let authGeneration=0;

function notice(message,error=false){
  $('message').textContent=message;
  $('message').classList.toggle('error',error);
  $('message').hidden=false;
  $('message').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function clearNotice(){ $('message').hidden=true; }
function showPanel(id){
  for(const p of ['setupPanel','authPanel','recoveryPanel','appPanel']) $(p).hidden=p!==id;
  $('signOut').hidden=id!=='appPanel' && id!=='recoveryPanel';
  if(id!=='appPanel') $('accountEmail').textContent='';
}
function tab(name){
  for(const page of document.querySelectorAll('[data-page]')) page.hidden=page.dataset.page!==name;
  for(const button of document.querySelectorAll('[data-tab]')) {
    const selected=button.dataset.tab===name;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
  }
  if(name==='inventory') drawInventory();
}
function room(id){return data.rooms.find(x=>x.id===id);}
function box(id){return data.boxes.find(x=>x.id===id);}
function pathFor(b){ return [room(b?.roomId)?.name,b?.location,b?.code].filter(Boolean).join(' → '); }
function containerUrl(id){const url=new URL(window.location.href);url.hash='';url.search='';url.searchParams.set('container',id);return url.toString();}
function selectOptions(entries,label){return '<option value="">Choose...</option>'+entries.map(x=>`<option value="${encode(x.id)}">${encode(label(x))}</option>`).join('');}
function draw(){
  $('roomCount').textContent=data.rooms.length;
  $('boxCount').textContent=data.boxes.length;
  $('itemCount').textContent=data.items.length;
  const prevRoom=$('boxRoom').value,prevBox=$('itemBox').value;
  $('boxRoom').innerHTML=selectOptions([...data.rooms].sort((a,b)=>alphabetical(a.name,b.name)),r=>r.name);
  $('itemBox').innerHTML=selectOptions([...data.boxes].sort((a,b)=>alphabetical(a.code,b.code)),b=>`${b.code} — ${b.name}`);
  if(data.rooms.some(x=>x.id===prevRoom)) $('boxRoom').value=prevRoom;
  if(data.boxes.some(x=>x.id===prevBox)) $('itemBox').value=prevBox;
  $('addBox').disabled=!data.rooms.length || busy;
  $('addItem').disabled=!data.boxes.length || busy;
  $('addRoom').disabled=busy;
  search();
  drawInventory();
}
function drawInventory(){
  const existingOpenRooms=new Set([...document.querySelectorAll('.tree-room[open]')].map(el=>el.dataset.room));
  const existingOpenBoxes=new Set([...document.querySelectorAll('.tree-box[open]')].map(el=>el.dataset.box));
  $('inventoryTree').innerHTML=data.rooms.length?[...data.rooms].sort((a,b)=>alphabetical(a.name,b.name)).map(r=>{
    const boxes=[...data.boxes].filter(b=>b.roomId===r.id).sort((a,b)=>alphabetical(a.code,b.code));
    return `<details class="tree-room" data-room="${encode(r.id)}" ${existingOpenRooms.has(r.id)?'open':''}>
      <summary><b>${encode(r.name)}</b><small>${boxes.length} ${boxes.length===1?'container':'containers'}</small></summary>
      <div class="tree-contents"><div class="row actions"><button class="secondary" data-act="renameRoom" data-id="${encode(r.id)}">Rename room</button><button class="danger" data-act="deleteRoom" data-id="${encode(r.id)}">Delete room</button></div>
      ${boxes.length?boxes.map(b=>{
        const items=[...data.items].filter(i=>i.boxId===b.id).sort((a,c)=>alphabetical(a.name,c.name));
        return `<details class="tree-box" data-box="${encode(b.id)}" ${existingOpenBoxes.has(b.id)?'open':''}>
         <summary><b>${encode(b.code)} — ${encode(b.name)}</b><small>${b.location?encode(b.location)+' · ':''}${items.length} item ${items.length===1?'entry':'entries'}</small></summary>
         <div class="tree-contents"><div class="row actions"><button class="secondary" data-act="editBox" data-id="${encode(b.id)}">Edit container</button><button class="secondary" data-act="copyLink" data-id="${encode(b.id)}">Copy direct link</button><button class="danger" data-act="deleteBox" data-id="${encode(b.id)}">Delete container</button></div>
         ${items.length?items.map(i=>`<div class="entry row spaced"><div><b>${encode(i.name)} ×${encode(i.qty)}</b>${i.notes?`<small>${encode(i.notes)}</small>`:''}</div><div class="row"><button class="secondary" data-act="editItem" data-id="${encode(i.id)}">Edit</button><button class="danger" data-act="deleteItem" data-id="${encode(i.id)}">Delete</button></div></div>`).join(''):'<p class="muted">No items yet.</p>'}</div></details>`;
      }).join(''):'<p class="muted">No containers yet.</p>'}
      </div></details>`;
  }).join(''):'<p class="muted">No rooms yet. Choose Add to get started.</p>';
}
function resultLink(title,subtitle,boxId,roomId){
  return `<div class="result"><button type="button" data-jump="${encode(boxId||'')}" data-jumproom="${encode(roomId||'')}">${encode(title)}</button><span class="hint">${encode(subtitle)}</span></div>`;
}
function search(){
  const q=$('search').value.trim().toLocaleLowerCase();
  if(!q){$('results').innerHTML='<p class="muted">Enter a name, keyword, container ID, or room to locate your belongings.</p>';return;}
  const matchingItems=data.items.filter(i=>{
    const b=box(i.boxId);
    return [i.name,i.notes,b?.name,b?.code,b?.location,room(b?.roomId)?.name].some(s=>String(s||'').toLocaleLowerCase().includes(q));
  }).sort((a,b)=>alphabetical(a.name,b.name));
  const matchingBoxes=data.boxes.filter(b=>[b.code,b.name,b.location,room(b.roomId)?.name].some(s=>String(s||'').toLocaleLowerCase().includes(q))).sort((a,b)=>alphabetical(a.code,b.code));
  const matchingRooms=data.rooms.filter(r=>r.name.toLocaleLowerCase().includes(q)).sort((a,b)=>alphabetical(a.name,b.name));
  const results=[
    ...matchingItems.map(i=>{const b=box(i.boxId);return resultLink(`${i.name} ×${i.qty}`,`${pathFor(b)} — ${b?.name||'Unknown container'}`,i.boxId,b?.roomId)}),
    ...matchingBoxes.map(b=>resultLink(`${b.code} — ${b.name}`,pathFor(b)+' · Container',b.id,b.roomId)),
    ...matchingRooms.map(r=>resultLink(r.name,'Room',null,r.id))
  ];
  $('results').innerHTML=results.length?results.slice(0,100).join('')+(results.length>100?`<p class="muted">Showing the first 100 of ${results.length} matches. Try a more specific search.</p>`:''):'<p>No matching inventory found.</p>';
}
function jumpTo(roomId,boxId){
  tab('inventory');
  const roomEl=[...document.querySelectorAll('.tree-room')].find(x=>x.dataset.room===roomId);
  if(roomEl){roomEl.open=true;if(boxId){const boxEl=[...roomEl.querySelectorAll('.tree-box')].find(x=>x.dataset.box===boxId);if(boxEl){boxEl.open=true;boxEl.scrollIntoView({behavior:'smooth',block:'center'});return;}}roomEl.scrollIntoView({behavior:'smooth',block:'center'});}
}
async function rows(table){
  const all=[];
  for(let from=0;from<100000;from+=1000){
    const {data:page,error}=await client.from(table).select('*').order('id',{ascending:true}).range(from,from+999);
    if(error)throw error;
    all.push(...(page||[]));
    if(!page||page.length<1000) return all;
  }
  throw Error('Inventory unusually large; contact support to adjust the loading limit.');
}
async function loadAll(){
  const [rs,bs,is]=await Promise.all([rows('rooms'),rows('boxes'),rows('items')]);
  data={rooms:rs.map(r=>({id:r.id,name:r.name})),boxes:bs.map(b=>({id:b.id,roomId:b.room_id,code:b.code,name:b.name,location:b.location||''})),items:is.map(i=>({id:i.id,boxId:i.box_id,name:i.name,qty:i.qty,notes:i.notes||''}))};
  draw();
}
async function onSession(session){
  if(!session?.user){authGeneration++;currentUser=null;data={rooms:[],boxes:[],items:[]};showPanel('authPanel');$('connectionState').textContent='Signed out';return;}
  const newUser=session.user.id;
  if(currentUser===newUser) return;
  currentUser=newUser;
  const thisRequest=++authGeneration;
  $('accountEmail').textContent=session.user.email||'Signed in';
  showPanel('appPanel');
  $('accountEmail').textContent=session.user.email||'Signed in';
  $('connectionState').textContent='Loading cloud inventory';
  tab('home');
  try{
    await loadAll();
    if(thisRequest!==authGeneration) return;
    $('connectionState').textContent='Connected to Supabase';
    clearNotice();
    const desired=new URL(window.location.href).searchParams.get('container');
    if(desired && ID_REGEX.test(desired)){
      const b=box(desired);
      if(b) jumpTo(b.roomId,b.id);
      else notice('That container was not found in your inventory.',true);
    }
  }catch(e){if(thisRequest===authGeneration){$('connectionState').textContent='Database error';notice('Could not load your inventory. Check that the database SQL was installed: '+e.message,true);}}
}
function setBusy(value){busy=value;for(const id of ['addRoom','addBox','addItem','signIn','signUp','restore']) $(id).disabled=value; if(!value) $('restore').disabled=!pendingBackup||!$('confirmRestore').checked;}
async function mutate(operation,success){
  if(busy)return;
  setBusy(true);clearNotice();
  try{await operation();await loadAll();notice(success);}catch(e){notice('Could not save: '+(e.message||String(e)),true);}finally{setBusy(false);draw();}
}
function verify(result){if(result.error)throw result.error;return result.data;}
function checkNonempty(s,title){const v=String(s??'').trim();if(!v)throw Error(`${title} is required.`);return v;}
async function createRoom(event){event.preventDefault();const name=checkNonempty($('roomName').value,'Room name');if(data.rooms.some(r=>r.name.toLowerCase()===name.toLowerCase()))return notice('A room with that name already exists.',true);await mutate(async()=>{verify(await client.from('rooms').insert({name}));$('roomForm').reset();},'Room added.');}
async function createBox(event){event.preventDefault();const code=checkNonempty($('boxCode').value,'Container ID');const name=checkNonempty($('boxName').value,'Container name');const roomId=$('boxRoom').value;const location=$('boxLocation').value.trim();if(!room(roomId))return notice('Choose a room first.',true);if(data.boxes.some(b=>b.code.toLowerCase()===code.toLowerCase()))return notice('That container ID is already in use.',true);await mutate(async()=>{verify(await client.from('boxes').insert({code,name,room_id:roomId,location}));$('boxForm').reset();},'Container added.');}
async function createItem(event){event.preventDefault();const name=checkNonempty($('itemName').value,'Item name');const qty=Number($('itemQty').value);const boxId=$('itemBox').value;const notes=$('itemNotes').value.trim();if(!box(boxId))return notice('Choose a container first.',true);if(!Number.isInteger(qty)||qty<1||qty>999999)return notice('Quantity must be between 1 and 999999.',true);await mutate(async()=>{verify(await client.from('items').insert({name,qty,notes,box_id:boxId}));$('itemForm').reset();$('itemBox').value=boxId;},'Item added. You can immediately enter another.');}
async function inventoryAction(action,id){
  const r=room(id),b=box(id),i=data.items.find(x=>x.id===id);
  if(action==='copyLink'){
    if(!b)return;
    const link=containerUrl(id);
    try{await navigator.clipboard.writeText(link);notice('Container link copied. It opens after signing in.');}catch{window.prompt('Copy the container link:',link);}return;
  }
  if(action==='renameRoom'&&r){const name=prompt('Room name',r.name);if(name===null)return;const n=name.trim();if(!n)return notice('Room name cannot be blank.',true);if(data.rooms.some(x=>x.id!==id&&x.name.toLowerCase()===n.toLowerCase()))return notice('Room name already used.',true);await mutate(async()=>verify(await client.from('rooms').update({name:n}).eq('id',id)),'Room updated.');}
  if(action==='deleteRoom'&&r){if(data.boxes.some(x=>x.roomId===id))return notice('Move or remove its containers before deleting the room.',true);if(!confirm(`Delete room "${r.name}"?`))return;await mutate(async()=>verify(await client.from('rooms').delete().eq('id',id)),'Room deleted.');}
  if(action==='editBox'&&b){
    const name=prompt('Container name',b.name);if(name===null)return;
    const code=prompt('Container ID',b.code);if(code===null)return;
    const location=prompt('Location within room (optional)',b.location);if(location===null)return;
    const roomName=prompt('Room name (must match an existing room)',room(b.roomId)?.name||'');if(roomName===null)return;
    const target=data.rooms.find(x=>x.name.toLowerCase()===roomName.trim().toLowerCase());
    if(!target||!name.trim()||!code.trim())return notice('Container name, ID and an existing room are required.',true);
    if(data.boxes.some(x=>x.id!==id&&x.code.toLowerCase()===code.trim().toLowerCase()))return notice('Container ID is already used.',true);
    await mutate(async()=>verify(await client.from('boxes').update({name:name.trim(),code:code.trim(),location:location.trim(),room_id:target.id}).eq('id',id)),'Container updated.');
  }
  if(action==='deleteBox'&&b){if(data.items.some(x=>x.boxId===id))return notice('Remove or move the items before deleting the container.',true);if(!confirm(`Delete container ${b.code}?`))return;await mutate(async()=>verify(await client.from('boxes').delete().eq('id',id)),'Container deleted.');}
  if(action==='editItem'&&i){
    const name=prompt('Item name',i.name);if(name===null)return;
    const qty=prompt('Quantity',i.qty);if(qty===null)return;
    const notes=prompt('Notes / tags',i.notes);if(notes===null)return;
    const code=prompt('Move to container ID',box(i.boxId)?.code||'');if(code===null)return;
    const target=data.boxes.find(x=>x.code.toLowerCase()===code.trim().toLowerCase());
    const n=Number(qty);
    if(!target||!name.trim()||!Number.isInteger(n)||n<1||n>999999)return notice('Check the item name, quantity, and an existing container ID.',true);
    await mutate(async()=>verify(await client.from('items').update({name:name.trim(),qty:n,notes:notes.trim(),box_id:target.id}).eq('id',id)),'Item updated.');
  }
  if(action==='deleteItem'&&i){if(!confirm(`Delete "${i.name}"?`))return;await mutate(async()=>verify(await client.from('items').delete().eq('id',id)),'Item deleted.');}
}
function download(dataToSave){
  const blob=new Blob([JSON.stringify(dataToSave,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='home-inventory-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function normalizeBackup(raw){
  if(!raw || typeof raw!=='object'||!Array.isArray(raw.rooms)||!Array.isArray(raw.boxes)||!Array.isArray(raw.items))throw Error('Not a Home Inventory backup: expected rooms, boxes and items.');
  if(raw.rooms.length>200||raw.boxes.length>5000||raw.items.length>30000)throw Error('Backup exceeds the current import limits.');
  const clean=(v,max,title)=>{const s=String(v??'').trim();if(!s||s.length>max)throw Error(`Invalid ${title}.`);return s;};
  const rm=new Map(),bm=new Map();const seenRooms=new Set(),seenBoxes=new Set(),seenItems=new Set();
  const makeId=(x,seen)=>{const key=String(x??'');if(!key||seen.has(key))throw Error('Missing or duplicate ID in backup.');seen.add(key);return ID_REGEX.test(key)?key.toLowerCase():crypto.randomUUID();};
  const rooms=raw.rooms.map(r=>{if(!r||typeof r!=='object')throw Error('Invalid room record.');const id=makeId(r.id,seenRooms),name=clean(r.name,100,'room name'),test=name.toLowerCase();if([...rm.values()].some(v=>v.name.toLowerCase()===test))throw Error('Duplicate room name.');rm.set(String(r.id),{id,name});return {id,name};});
  const boxes=raw.boxes.map(b=>{if(!b||typeof b!=='object')throw Error('Invalid container record.');const id=makeId(b.id,seenBoxes),code=clean(b.code,60,'container ID'),name=clean(b.name,120,'container name'),location=String(b.location??'').trim();if(location.length>180)throw Error('Location too long.');const rel=rm.get(String(b.roomId));if(!rel)throw Error('Container references a missing room.');if([...bm.values()].some(v=>v.code.toLowerCase()===code.toLowerCase()))throw Error('Duplicate container ID.');const row={id,code,name,location,roomId:rel.id};bm.set(String(b.id),row);return row;});
  const items=raw.items.map(i=>{if(!i||typeof i!=='object')throw Error('Invalid item record.');const id=makeId(i.id,seenItems),name=clean(i.name,160,'item name'),notes=String(i.notes??'').trim(),qty=Number(i.qty),rel=bm.get(String(i.boxId));if(!rel)throw Error('Item references a missing container.');if(notes.length>500||!Number.isInteger(qty)||qty<1||qty>999999)throw Error('Invalid notes or quantity.');return {id,name,notes,qty,boxId:rel.id};});
  return {rooms,boxes,items};
}
async function backupFileChanged(event){
  pendingBackup=null;$('confirmRestore').checked=false;$('restore').disabled=true;$('importSummary').textContent='';
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>12*1024*1024)throw Error('File too large (maximum 12 MB).');
    pendingBackup=normalizeBackup(JSON.parse(await file.text()));
    $('importSummary').textContent=`Ready to restore: ${pendingBackup.rooms.length} rooms, ${pendingBackup.boxes.length} containers, ${pendingBackup.items.length} item entries.`;
  }catch(e){pendingBackup=null;notice('Backup file could not be read: '+e.message,true);}
}
async function restoreBackup(){
  if(!pendingBackup||!$('confirmRestore').checked||busy)return;
  if(!confirm(`REPLACE ALL CLOUD INVENTORY?\n\nExisting: ${data.rooms.length} rooms, ${data.boxes.length} containers, ${data.items.length} items.\nBackup: ${pendingBackup.rooms.length} rooms, ${pendingBackup.boxes.length} containers, ${pendingBackup.items.length} items.\n\nDownload a current backup first if you may need it later.`))return;
  setBusy(true);clearNotice();
  try{verify(await client.rpc('replace_inventory',{payload:pendingBackup}));await loadAll();notice('Backup restored successfully. Your cloud inventory has been replaced.');pendingBackup=null;$('import').value='';$('confirmRestore').checked=false;$('importSummary').textContent='';}
  catch(e){notice('Restore failed; the database should have kept your previous inventory unchanged: '+e.message,true);}
  finally{setBusy(false);}
}
function events(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $('search').addEventListener('input',search);
  $('roomForm').addEventListener('submit',createRoom);
  $('boxForm').addEventListener('submit',createBox);
  $('itemForm').addEventListener('submit',createItem);
  $('refresh').addEventListener('click',async()=>{try{await loadAll();notice('Inventory refreshed from the cloud.');}catch(e){notice(e.message,true);}});
  $('export').addEventListener('click',()=>download(data));
  $('import').addEventListener('change',backupFileChanged);
  $('confirmRestore').addEventListener('change',()=>{$('restore').disabled=!pendingBackup||!$('confirmRestore').checked||busy;});
  $('restore').addEventListener('click',restoreBackup);
  document.addEventListener('click',async e=>{
    const jump=e.target.closest('button[data-jump]');if(jump){jumpTo(jump.dataset.jumproom,jump.dataset.jump);return;}
    const btn=e.target.closest('button[data-act]');if(btn)await inventoryAction(btn.dataset.act,btn.dataset.id);
  });
  $('authForm').addEventListener('submit',async e=>{
    e.preventDefault();setBusy(true);clearNotice();try{verify(await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}));$('password').value='';}catch(err){notice('Sign-in failed: '+err.message,true);}finally{setBusy(false);}
  });
  $('signUp').addEventListener('click',async()=>{
    const email=$('email').value.trim(),password=$('password').value;
    if(!email||password.length<6)return notice('Enter an email and a password of at least 6 characters.',true);
    setBusy(true);try{const response=verify(await client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}}));
      if(response.session)notice('Account created and signed in.');else notice('Account request submitted. Check your email for a confirmation link, then sign in.');
    }catch(err){notice('Account creation failed: '+err.message,true);}finally{setBusy(false);}
  });
  $('forgotPassword').addEventListener('click',async()=>{
    const email=$('email').value.trim();if(!email)return notice('Enter your email address first.',true);
    try{verify(await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname}));notice('If this account exists, a password reset email has been requested.');}catch(e){notice(e.message,true);}
  });
  $('recoveryForm').addEventListener('submit',async e=>{e.preventDefault();try{verify(await client.auth.updateUser({password:$('newPassword').value}));$('newPassword').value='';showPanel('appPanel');await loadAll();notice('Password updated.');}catch(err){notice(err.message,true);}});
  $('signOut').addEventListener('click',async()=>{try{verify(await client.auth.signOut());}catch(e){notice('Sign-out failed: '+e.message,true);}});
}
async function start(){
  events();tab('home');
  const cfg=window.HOME_INVENTORY_CONFIG;
  if(!cfg||!/^https:\/\/[a-z\d-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')||!/^sb_publishable_/.test(cfg.supabasePublishableKey||'')){
    $('connectionState').textContent='Setup required';showPanel('setupPanel');return;
  }
  if(!window.supabase?.createClient){$('connectionState').textContent='Library unavailable';showPanel('setupPanel');notice('Could not load the Supabase library. Check your internet connection and reload.',true);return;}
  client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){showPanel('recoveryPanel');$('signOut').hidden=false;return;}
    if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setTimeout(()=>onSession(session),0);
  });
  try{const {data:sessionData,error}=await client.auth.getSession();if(error)throw error;await onSession(sessionData.session);}catch(e){showPanel('authPanel');notice('Connection problem: '+e.message,true);}
}
start();
