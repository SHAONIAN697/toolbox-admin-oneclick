(function(){
  const $ = (id) => document.getElementById(id);
  const q = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const token = () => localStorage.getItem('toolbox_session_token') || '';
  let me = null, system = null, users = [], invites = [], applications = [], applyInfo = null;

  function headers(){ return {Authorization:'Bearer '+token(), 'Content-Type':'application/json'}; }
  async function api(path, opts={}){
    const res = await fetch(path, {...opts, headers:{...headers(), ...(opts.headers||{})}});
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ throw new Error(text || '????????'); }
    if(!res.ok) throw new Error((data&&data.error) || ('???? HTTP '+res.status));
    return data;
  }
  function toast(msg){ if(window.showToast) window.showToast(msg); else if(window.setStatus) window.setStatus(msg); else console.log(msg); }
  function esc(v){ return String(v ?? '').replace(/[&<>"]/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
  function isSuper(){ return me && me.role === 'super'; }
  function agents(){ return users.filter(u=>u.role==='agent' && u.active!==false); }

  async function refreshBase(){
    if(!token()) return;
    try { me = await api('/api/admin/me'); } catch(e){ return; }
    try { system = await api('/api/admin/system'); } catch(e){}
    try { users = (await api('/api/super/users')).users || []; } catch(e){ users = me ? [me] : []; }
    try { invites = (await api('/api/super/invites')).invites || []; } catch(e){ invites = []; }
    try { applyInfo = await api('/api/admin/agent-application'); } catch(e){}
    if(isSuper()){
      try { const r = await api('/api/super/agent-applications'); applications = r.applications || []; } catch(e){ applications=[]; }
    }
  }

  function ensureAccountPanel(){
    const view = $('view-account'); if(!view || $('agentExtAccountPanel')) return;
    const panel = document.createElement('div'); panel.className='panel agent-ext-panel'; panel.id='agentExtAccountPanel';
    panel.innerHTML = `<div class="panel-head"><h2>????</h2><button id="agentExtApplyBtn" type="button">??????</button></div><div id="agentExtAccountBody" class="agent-ext-body"></div>`;
    view.appendChild(panel);
    q('#agentExtApplyBtn', panel).onclick = openApplyDialog;
  }

  function renderAccount(){
    ensureAccountPanel();
    const panel=$('agentExtAccountPanel'), body=$('agentExtAccountBody'), btn=$('agentExtApplyBtn'); if(!panel||!body||!me) return;
    const info = applyInfo || {}; const app = info.application || me.agentApplication || null;
    if(info.allowApply===false && me.role==='user' && !(app && app.status==='rejected')) { panel.hidden=true; return; }
    panel.hidden=false;
    if(me.role==='agent'){
      btn.hidden=true;
      body.innerHTML=`<div class="agent-ext-cards"><span class="agent-ext-tag ok">?????</span><span>?????<b>${esc(me.balance||info.balance||0)}</b></span><span>????${esc(me.inviteCount||0)}</span><span>?????${esc(me.promotedUserCount||0)}</span></div>`;
      return;
    }
    btn.hidden=false;
    if(app && app.status==='pending'){
      btn.disabled=true; btn.textContent='???????';
      body.innerHTML='<span class="agent-ext-tag warn">???????????</span>';
    }else if(app && app.status==='rejected'){
      btn.disabled=false; btn.textContent='????';
      body.innerHTML=`<span class="agent-ext-tag danger">???????</span><p>${esc(app.rejectReason||'')}</p>`;
    }else{
      btn.disabled=false; btn.textContent='??????';
      body.innerHTML='<span class="agent-ext-muted">????????????????????</span>';
    }
  }

  function openApplyDialog(){
    let overlay=$('agentExtApplyDialog');
    if(!overlay){
      overlay=document.createElement('div'); overlay.id='agentExtApplyDialog'; overlay.className='modal-overlay'; overlay.hidden=true;
      overlay.innerHTML=`<div class="modal-card agent-ext-dialog"><div class="panel-head"><h2>??????</h2><button id="agentExtApplyClose" type="button">??</button></div><div id="agentExtApplyDesc" class="agent-ext-desc"></div><div class="form-grid"><label>????<input id="agentExtApplyContact" placeholder="?? / QQ / ???"></label><label class="wide">????<textarea id="agentExtApplyReason" rows="5"></textarea></label></div><div class="button-pair"><button id="agentExtApplySubmit" type="button">????</button><button id="agentExtApplyCancel" class="secondary" type="button">??</button></div></div>`;
      document.body.appendChild(overlay);
      $('agentExtApplyClose').onclick=$('agentExtApplyCancel').onclick=()=>overlay.hidden=true;
      $('agentExtApplySubmit').onclick=submitApply;
    }
    $('agentExtApplyDesc').textContent=(applyInfo&&applyInfo.description)||'';
    overlay.hidden=false;
  }
  async function submitApply(){
    try{
      await api('/api/admin/agent-application',{method:'POST',body:JSON.stringify({contact:$('agentExtApplyContact').value,reason:$('agentExtApplyReason').value})});
      $('agentExtApplyDialog').hidden=true; toast((applyInfo&&applyInfo.reviewMode)==='auto'?'????????????':'???????????');
      await refreshBase(); renderAllExt();
    }catch(e){ toast(e.message); }
  }

  function ensureSystem(){
    const agentPanel = $('agentInvitePrice')?.closest('.panel');
    if(agentPanel && !$('agentAllowApply')){
      const grid = q('.form-grid', agentPanel);
      grid.insertAdjacentHTML('afterbegin', `<label class="toggle-line">????????<span><input id="agentAllowApply" type="checkbox"> ??</span></label><label>??????<select id="agentApplyReviewMode"><option value="manual">????</option><option value="auto">????</option></select></label>`);
      grid.insertAdjacentHTML('beforeend', `<label>??????<input id="agentDefaultBalance" type="number" min="0" step="0.01"></label><label class="wide">??????<textarea id="agentApplyDescription" rows="4"></textarea></label>`);
      const old=$('saveAgentSettingsBtn'); if(old) old.addEventListener('click', saveAgentExtSettings, true);
    }
    const orders = Array.from(document.querySelectorAll('.panel h2')).find(h=>h.textContent.trim()==='????')?.closest('.panel');
    if(orders && !$('agentExtApplicationsPanel')){
      const panel=document.createElement('div'); panel.className='panel collapsible-panel agent-ext-panel'; panel.id='agentExtApplicationsPanel';
      panel.innerHTML=`<div class="panel-head"><h2>??????</h2><div class="agent-ext-actions"><select id="agentExtApplyFilter"><option value="all">??</option><option value="pending">???</option><option value="approved">???</option><option value="rejected">???</option></select><button id="agentExtRefreshApply" type="button">??</button></div></div><div class="table-wrap"><table><thead><tr><th>????</th><th>????</th><th>????</th><th>????</th><th>????</th><th>???</th><th>????</th><th>??</th></tr></thead><tbody id="agentExtApplyRows"></tbody></table></div>`;
      orders.parentNode.insertBefore(panel, orders);
      $('agentExtApplyFilter').onchange=loadApplications;
      $('agentExtRefreshApply').onclick=loadApplications;
    }
  }
  function renderSystem(){
    ensureSystem(); if(!system) return; const a=system.agent||{};
    if($('agentAllowApply')) $('agentAllowApply').checked=!!a.allowApply;
    if($('agentApplyReviewMode')) $('agentApplyReviewMode').value=a.applyReviewMode||'manual';
    if($('agentDefaultBalance')) $('agentDefaultBalance').value=a.defaultBalance||0;
    if($('agentApplyDescription')) $('agentApplyDescription').value=a.applyDescription||'';
    renderApplications(); renderNoticeBadge();
  }
  async function saveAgentExtSettings(ev){
    if(ev) ev.stopPropagation();
    try{
      system=await api('/api/admin/system',{method:'PATCH',body:JSON.stringify({agent:{
        invitePrice:Number($('agentInvitePrice')?.value||0), currency:$('agentCurrency')?.value||'CNY', orderCooldownMinutes:Number($('agentOrderCooldown')?.value||0), allowNegativeBalance:$('agentAllowNegative')?.checked||false,
        allowApply:$('agentAllowApply')?.checked||false, applyReviewMode:$('agentApplyReviewMode')?.value||'manual', defaultBalance:Number($('agentDefaultBalance')?.value||0), applyDescription:$('agentApplyDescription')?.value||''
      }})});
      toast('????????'); renderSystem();
    }catch(e){ toast(e.message); }
  }
  async function loadApplications(){
    if(!isSuper()) return;
    const st=$('agentExtApplyFilter')?.value||'all';
    try{ const r=await api('/api/super/agent-applications?status='+encodeURIComponent(st)); applications=r.applications||[]; renderApplications(); }catch(e){ toast(e.message); }
  }
  function statusText(s){ return s==='approved'?'???':s==='rejected'?'???':'???'; }
  function renderApplications(){
    const tb=$('agentExtApplyRows'); if(!tb) return;
    const rows=applications||[];
    if(!rows.length){ tb.innerHTML='<tr><td colspan="8" class="empty">??????</td></tr>'; return; }
    tb.innerHTML=rows.map(x=>`<tr><td>${esc(x.displayName||x.username)}</td><td>${esc(x.contact)}</td><td class="agent-ext-reason">${esc(x.reason)}</td><td>${esc((x.createdAt||'').slice(0,19).replace('T',' '))}</td><td><span class="agent-ext-tag ${x.status}">${statusText(x.status)}</span></td><td>${esc(x.reviewerName||'')}</td><td>${esc((x.reviewedAt||'').slice(0,19).replace('T',' '))}</td><td>${x.status==='pending'?`<button data-agent-review="approved" data-id="${esc(x.id)}">??</button><button class="danger" data-agent-review="rejected" data-id="${esc(x.id)}">??</button>`:`<button data-agent-view data-id="${esc(x.id)}">??</button>`}</td></tr>`).join('');
    qa('[data-agent-review]',tb).forEach(btn=>btn.onclick=()=>reviewApply(btn.dataset.id,btn.dataset.agentReview));
    qa('[data-agent-view]',tb).forEach(btn=>btn.onclick=()=>{ const x=rows.find(r=>r.id===btn.dataset.id); alert(`?????${x.displayName||x.username}\n?????${x.contact}\n???${x.reason}\n???${statusText(x.status)}\n?????${x.rejectReason||''}`); });
  }
  async function reviewApply(id,status){
    let rejectReason=''; if(status==='rejected'){ rejectReason=prompt('???????')||''; }
    try{ await api('/api/super/agent-applications',{method:'POST',body:JSON.stringify({id,status,rejectReason})}); toast(status==='approved'?'?????':'?????'); await refreshBase(); renderAllExt(); }catch(e){ toast(e.message); }
  }

  function enhanceUsers(){
    const rows=qa('#userRows tr'); if(!rows.length) return;
    rows.forEach(tr=>{
      const nameCell=tr.children[0]; if(!nameCell) return;
      const text=nameCell.textContent.trim();
      const user=users.find(u=>text.includes(u.username)||text.includes(u.displayName)); if(!user || tr.dataset.agentExt) return;
      tr.dataset.agentExt='1';
      const roleCell=tr.children[3]; if(roleCell){ roleCell.insertAdjacentHTML('beforeend', `<div><span class="agent-ext-tag ${user.role}">${user.role==='super'?'????':user.role==='agent'?'??':'????'}</span></div>`); }
      const td=document.createElement('td'); td.className='agent-ext-user-actions';
      td.innerHTML=user.role==='agent'?`<input data-agent-bal="${esc(user.id)}" type="number" step="0.01" value="${esc(user.balance||0)}"><button data-agent-save="${esc(user.id)}">????</button><button class="danger" data-agent-cancel="${esc(user.id)}">????</button><div class="agent-ext-muted">??? ${user.inviteCount||0} / ?? ${user.promotedUserCount||0}</div>`:(user.role==='user'?`<button data-agent-promote="${esc(user.id)}">????</button>`:'');
      tr.appendChild(td);
    });
    qa('[data-agent-promote]').forEach(b=>b.onclick=()=>promoteUser(b.dataset.agentPromote));
    qa('[data-agent-cancel]').forEach(b=>b.onclick=()=>cancelAgent(b.dataset.agentCancel));
    qa('[data-agent-save]').forEach(b=>b.onclick=()=>saveBalance(b.dataset.agentSave));
  }
  async function promoteUser(id){ try{ await api('/api/super/users/agent',{method:'POST',body:JSON.stringify({userId:id,action:'promote',useDefaultBalance:confirm('???????????')})}); toast('?????'); await refreshBase(); location.reload(); }catch(e){ toast(e.message); } }
  async function cancelAgent(id){ if(!confirm('?????????????????')) return; try{ await api('/api/super/users/agent',{method:'POST',body:JSON.stringify({userId:id,action:'cancel'})}); toast('?????'); await refreshBase(); location.reload(); }catch(e){ toast(e.message); } }
  async function saveBalance(id){ const v=q(`[data-agent-bal="${CSS.escape(id)}"]`)?.value||0; try{ await api('/api/super/users/agent',{method:'PATCH',body:JSON.stringify({userId:id,balance:Number(v)})}); toast('?????'); }catch(e){ toast(e.message); } }

  function enhanceInvites(){
    const form=q('.invite-create'); if(form && !$('agentExtInviteRole')){
      form.insertAdjacentHTML('beforeend', `<label>?????<select id="agentExtInviteRole"><option value="user">????</option><option value="agent">??</option></select></label><label>????<select id="agentExtBoundAgent"><option value="">???</option></select></label>`);
      const old=$('createInviteBtn'); if(old) old.addEventListener('click', createInviteExt, true);
    }
    const sel=$('agentExtBoundAgent'); if(sel){ sel.innerHTML='<option value="">???</option>'+agents().map(u=>`<option value="${esc(u.id)}">${esc(u.displayName||u.username)}</option>`).join(''); }
    if($('agentExtInviteRole')) $('agentExtInviteRole').disabled=!isSuper();
    const tb=$('inviteRows'); if(tb && !tb.dataset.agentExtHead){ const head=q('.invite-table thead tr'); if(head){ head.insertAdjacentHTML('beforeend','<th>?????</th><th>????</th><th>?????</th>'); tb.dataset.agentExtHead='1'; } }
    qa('#inviteRows tr').forEach((tr,i)=>{ if(tr.dataset.agentExt) return; const inv=invites[i]; if(!inv) return; tr.dataset.agentExt='1'; tr.insertAdjacentHTML('beforeend',`<td>${inv.registerRole==='agent'?'??':'????'}</td><td>${esc(inv.boundAgentName||'???')}</td><td>${inv.isAgentInvite||inv.registerRole==='agent'?'?':'?'}</td>`); });
  }
  async function createInviteExt(ev){
    if(!$('agentExtInviteRole')) return;
    if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    ev.stopPropagation(); ev.preventDefault();
    try{ await api('/api/super/invites',{method:'POST',body:JSON.stringify({code:$('newInviteCode')?.value||'',maxUses:Number($('newInviteMaxUses')?.value||1),registerRole:$('agentExtInviteRole').value,boundAgentId:$('agentExtBoundAgent').value})}); toast('??????'); await refreshBase(); location.reload(); }catch(e){ toast(e.message); }
  }

  function renderNoticeBadge(){
    const count=(system&&system.agent&&system.agent.pendingApplyCount)||applications.filter(x=>x.status==='pending').length||0;
    const badge=$('noticeUnreadBadge'); if(badge && count>0){ badge.hidden=false; badge.textContent=String(Math.max(Number(badge.textContent)||0,count)); }
    const list=$('noticeList'); if(list && count>0 && !q('[data-agent-ext-notice]',list)){
      const item=document.createElement('div'); item.className='notice-item'; item.dataset.agentExtNotice='1'; item.innerHTML=`<strong>???????</strong><p>??? ${count} ??????????</p><small>??????????</small>`;
      item.onclick=()=>{ document.querySelector('[data-view="system"]')?.click(); setTimeout(()=>$('agentExtApplicationsPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),200); };
      list.prepend(item);
    }
  }

  function renderAllExt(){ renderAccount(); renderSystem(); enhanceUsers(); enhanceInvites(); renderNoticeBadge(); }
  async function boot(){ await refreshBase(); renderAllExt(); setInterval(async()=>{ await refreshBase(); renderAllExt(); }, 8000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  document.addEventListener('click',()=>setTimeout(renderAllExt,200),true);
})();
