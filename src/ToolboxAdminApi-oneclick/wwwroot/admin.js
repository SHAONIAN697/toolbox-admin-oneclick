const state = {
  token: localStorage.getItem('toolbox_session_token') || '',
  currentUser: null,
  targetUser: null,
  targetUserId: localStorage.getItem('toolbox_target_user') || '',
  users: [],
  invites: [],
  inviteFilter: ['all', 'used', 'unused'].includes(localStorage.getItem('toolbox_invite_filter')) ? localStorage.getItem('toolbox_invite_filter') : 'all',
  orders: [],
  agentOrders: [],
  mail: null,
  system: null,
  templateMode: false,
  notices: [],
  config: null,
  buttons: [],
  inviteCurrency: 'CNY',
  noticePopupShownIds: new Set(),
  activeView: localStorage.getItem('toolbox_active_view') || 'overview',
  clientDownloading: false,
  clientBuildTimer: null,
  clientBuildStartedAt: 0,
  inviteRefreshTimer: null,
  inviteRefreshBusy: false,
  inviteSnapshot: ''
};

function applyDesktopTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('desktopToken') || '';
  if (!token) return;
  state.token = token;
  localStorage.setItem('toolbox_session_token', token);
  params.delete('desktopToken');
  params.delete('desktop');
  params.delete('_t');
  const query = params.toString();
  const cleanUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  window.history.replaceState(null, document.title, cleanUrl);
}

applyDesktopTokenFromUrl();

const $ = (id) => document.getElementById(id);
const ADMIN_THEME_STORAGE_KEY = 'toolbox_admin_theme';

applyAdminTheme();

const ACTIONS = [
  ['link', '打开网页'],
  ['download', '下载文件'],
  ['cmd', '运行命令'],
  ['script', '内置功能'],
  ['winget', '安装软件']
];

const ACTION_LABELS = Object.fromEntries(ACTIONS);

const SCRIPT_LABELS = {
  preset_new_machine: '新机一键优化',
  preset_audio_workstation: '音频工站优化',
  preset_privacy_lockdown: '隐私加固',
  preset_pure_activate: '纯净激活套装',
  sys_control_panel: '控制面板',
  sys_sound_settings: '声音设置',
  open_network_connections: '网络连接',
  sys_apps_features: '程序和功能',
  sys_device_manager: '设备管理器',
  sys_disk_manager: '磁盘管理',
  sys_computer_manager: '计算机管理',
  sys_services: '服务',
  sys_task_manager: '任务管理器',
  sys_system_info: '系统信息',
  sys_env_vars: '环境变量',
  sys_event_viewer: '事件查看器',
  sys_registry: '注册表',
  sys_group_policy: '组策略',
  sys_cmd_prompt: '命令提示符',
  sys_security_policy: '安全策略',
  disable_firewall: '关闭防火墙',
  disable_update: '禁用系统更新',
  sys_power_options: '电源管理',
  sys_classic_context_menu: 'Win 传统右键',
  add_hosts_block: '编辑 Hosts',
  sys_system_clean: '系统清理',
  disable_uac: '禁用 UAC',
  activate_windows: '一键激活系统'
};

const SCRIPT_OPTIONS = Object.entries(SCRIPT_LABELS).map(([value, label]) => ({ value, label }));
const SCRIPT_VALUE_BY_LABEL = Object.fromEntries(SCRIPT_OPTIONS.map(({ value, label }) => [label, value]));
const CUSTOM_SCRIPT_VALUE = '__custom_script__';
const INVITE_REFRESH_INTERVAL_MS = 3000;
const CLIENT_VARIANTS = [
  {
    id: 'original',
    label: '原版工具箱',
    badge: '保留最初版本',
    description: '沿用最开始的工具箱界面，继续使用后台配置的主题、标题和原按钮布局。',
    preview: 'original'
  },
  {
    id: 'studio',
    label: '调音师经典版',
    badge: '推荐系统工具',
    description: '左侧导航、分组面板和紧凑按钮布局，适合系统优化、音频维护、驱动工具集合。',
    preview: 'studio'
  },
  {
    id: 'tuner',
    label: '\u8c03\u97f3\u5e08\u5de5\u5177\u7bb1\u7b80\u7ea6\u7248',
    badge: '\u7b80\u7ea6\u65b0\u7248',
    description: '\u767d\u8272\u6807\u9898\u680f\u3001\u5de6\u4fa7\u5bfc\u822a\u3001\u72ec\u7acb\u4e0b\u8f7d\u9875\u548c\u7b80\u7ea6\u7cfb\u7edf\u8bbe\u7f6e\u9875\uff0c\u9002\u5408\u8c03\u97f3\u5de5\u5177\u4e0e\u7cfb\u7edf\u7ef4\u62a4\u573a\u666f\u3002',
    preview: 'tuner'
  },
  {
    id: 'portal',
    label: '导航首页版',
    badge: '推荐资源中心',
    description: '首页横幅、导航侧栏和资源卡片布局，适合软件中心、常用链接和下载资源站。',
    preview: 'portal'
  }
];

function normalizeScriptTarget(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (SCRIPT_LABELS[text]) return text;
  return SCRIPT_VALUE_BY_LABEL[text] || text;
}

function formatDateTime(value) {
  if (!value) return '从未登录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMoney(value, currency = 'CNY') {
  return `${Number(value || 0).toFixed(2)} ${currency || 'CNY'}`;
}

function displayNameOf(user, fallback = '') {
  return (user?.displayName || user?.name || fallback || user?.username || user?.id || '').trim();
}

function userNameFromId(userId, fallback = '') {
  const user = state.users.find((item) => item.id === userId)
    || (state.currentUser?.id === userId ? state.currentUser : null);
  return displayNameOf(user, fallback || userId || '');
}

function noticeAuthorName(notice) {
  if (!notice) return '';
  if (notice.createdBy === 'system' || notice.createdById === 'system') return '系统';
  return notice.createdByName || userNameFromId(notice.createdById, notice.createdBy || '');
}

function contentDispositionFilename(disposition) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].replace(/"/g, '').trim());
    } catch {
      return encoded[1].replace(/"/g, '').trim();
    }
  }
  const quoted = disposition.match(/filename="([^"]+)"/i);
  if (quoted) return quoted[1];
  const plain = disposition.match(/filename=([^;]+)/i);
  return plain ? plain[1].trim() : '';
}

async function blobHasWindowsExeHeader(blob) {
  const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a;
}

const NAV_ICONS = {
  overview: '⌁',
  account: '♙',
  mail: '✉',
  buttons: '▦',
  users: '♙',
  system: '⚙',
  json: '▤',
  exchange: '⇄',
  dock: '⌘'
};

const VIEW_TITLES = {
  overview: ['后台管理', '编辑标题、网址、下载按钮和系统工具配置。'],
  account: ['账号资料', '修改当前账号的基础信息和登录密码。'],
  buttons: ['按钮管理', '配置工具箱里的页面、分组、按钮和动作。'],
  users: ['用户管理', '管理账号、邀请码和用户专属对接地址。'],
  system: ['系统管理', '配置邮箱、通知、支付、模板和隐藏入口。'],
  json: ['JSON 管理', '直接编辑当前用户的完整配置 JSON。'],
  exchange: ['配置交换', '导出、导入配置文件，或生成云端链接分享给别人。'],
  dock: ['工具箱对接', '选择工具箱 UI 版本并下载当前用户专属 EXE。']
};

function setupSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.dataset.ready) return;
  sidebar.dataset.ready = '1';
  const brand = sidebar.querySelector('.brand');
  const toggle = document.createElement('button');
  toggle.id = 'sidebarToggle';
  toggle.type = 'button';
  toggle.className = 'sidebar-toggle';
  toggle.setAttribute('aria-label', '展开/收起菜单');
  toggle.textContent = '☰';
  sidebar.insertBefore(toggle, brand);

  sidebar.querySelectorAll('.nav').forEach((button) => {
    const view = button.dataset.view || '';
    const text = button.textContent.trim();
    button.innerHTML = `<span class="nav-icon">${NAV_ICONS[view] || '•'}</span><span class="nav-text">${escapeHtml(text)}</span>`;
    button.title = text;
  });

  const applyMobileDefault = () => {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    document.body.classList.toggle('sidebar-collapsed', mobile && !document.body.classList.contains('sidebar-open'));
  };
  toggle.onclick = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.body.classList.toggle('sidebar-open');
      document.body.classList.toggle('sidebar-collapsed', !document.body.classList.contains('sidebar-open'));
    } else {
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('toolbox_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
    }
  };
  if (localStorage.getItem('toolbox_sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
  window.addEventListener('resize', applyMobileDefault);
  applyMobileDefault();
}

function setupCollapsiblePanels() {
  document.querySelectorAll('[data-collapsible-panel]').forEach((panel) => {
    if (panel.dataset.collapseReady) return;
    panel.dataset.collapseReady = '1';

    const head = panel.querySelector('.panel-head');
    if (!head) return;

    const title = head.querySelector('h2');
    [...panel.children].filter((child) => child !== head).forEach((child) => child.classList.add('collapsible-body'));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'panel-collapse-toggle';
    toggle.setAttribute('aria-label', '展开/收起');
    toggle.textContent = panel.classList.contains('is-collapsed') ? '展开' : '收起';
    if (title) title.insertAdjacentElement('afterbegin', toggle);

    const setCollapsed = (collapsed) => {
      panel.classList.toggle('is-collapsed', collapsed);
      toggle.textContent = collapsed ? '展开' : '收起';
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (panel.id) {
        localStorage.setItem(`toolbox_panel_${panel.id}`, collapsed ? '1' : '0');
      }
      [...panel.children].filter((child) => child !== head).forEach((child) => {
        child.classList.add('collapsible-body');
        child.hidden = collapsed || child.dataset.keepHidden === '1';
      });
    };

    const savedCollapsed = panel.id ? localStorage.getItem(`toolbox_panel_${panel.id}`) : '';
    const shouldCollapse = savedCollapsed === '1' || (savedCollapsed !== '0' && panel.dataset.defaultCollapsed === '1');
    setCollapsed(shouldCollapse);
    toggle.onclick = (event) => {
      event.stopPropagation();
      setCollapsed(!panel.classList.contains('is-collapsed'));
    };
    head.addEventListener('click', (event) => {
      if (event.target.closest('button:not(.panel-collapse-toggle), input, select, textarea, a')) return;
      setCollapsed(!panel.classList.contains('is-collapsed'));
    });
  });
}

function ensureButtonsPagePanels() {
  const view = $('view-buttons');
  if (!view) return;
  ['页面与分组', '新增按钮'].forEach((titleText) => {
    const panel = [...view.querySelectorAll(':scope > .panel')].find((item) => {
      return item.querySelector(':scope > .panel-head h2')?.textContent?.trim() === titleText;
    });
    if (!panel) return;
    panel.classList.add('collapsible-panel');
    if (!panel.dataset.collapseReady) panel.classList.add('is-collapsed');
    panel.dataset.collapsiblePanel = '';
    panel.dataset.defaultCollapsed = '1';
  });
  setupCollapsiblePanels();
}

function setStatus(message, isError = false) {
  const status = $('status');
  if (status) status.textContent = '';
  if (!message) return;
  showToast(message, isError ? 'error' : 'success');
}

function getToastStack() {
  let stack = $('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.setAttribute('aria-live', 'polite');
  }
  stack.className = 'toast-stack';
  if (stack.parentElement !== document.body) {
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, type = 'success') {
  if (!message) return;
  const stack = getToastStack();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'error' ? '!' : (type === 'warn' ? '!' : '✓');
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div');
  text.className = 'toast-message';
  text.textContent = message;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', '关闭提示');
  close.textContent = '×';
  toast.appendChild(icon);
  toast.appendChild(text);
  toast.appendChild(close);
  stack.appendChild(toast);

  const remove = () => {
    if (!toast.isConnected || toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 180);
  };
  close.onclick = remove;
  setTimeout(remove, type === 'error' ? 5200 : 2600);
  while (stack.children.length > 4) {
    stack.firstElementChild?.remove();
  }
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ensureClientBuildDialog() {
  let overlay = $('clientBuildOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'clientBuildOverlay';
  overlay.className = 'client-build-overlay';
  overlay.innerHTML = `
    <div class="client-build-dialog" role="dialog" aria-modal="true" aria-labelledby="clientBuildTitle">
      <div class="client-build-ring"><span></span></div>
      <h2 id="clientBuildTitle">正在生成工具箱 EXE</h2>
      <p id="clientBuildText">正在准备编译环境...</p>
      <div class="client-build-meter"><i id="clientBuildMeter"></i></div>
      <div class="client-build-meta">
        <span id="clientBuildElapsed">已用时 00:00</span>
        <span id="clientBuildHint">首次生成通常需要 10-60 秒</span>
      </div>
      <button id="clientBuildClose" type="button" hidden>关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('clientBuildClose').onclick = () => closeClientBuildDialog();
  return overlay;
}

function openClientBuildDialog(message = '正在编译客户端，请稍等...') {
  const overlay = ensureClientBuildDialog();
  state.clientBuildStartedAt = Date.now();
  overlay.classList.remove('done', 'error');
  overlay.classList.add('show');
  $('clientBuildTitle').textContent = '正在生成工具箱 EXE';
  $('clientBuildText').textContent = message;
  $('clientBuildHint').textContent = '首次生成通常需要 10-60 秒，缓存命中会更快';
  $('clientBuildMeter').style.width = '12%';
  $('clientBuildClose').hidden = true;
  window.clearInterval(state.clientBuildTimer);
  state.clientBuildTimer = window.setInterval(() => {
    const elapsed = Date.now() - state.clientBuildStartedAt;
    $('clientBuildElapsed').textContent = `已用时 ${formatElapsed(elapsed)}`;
    const pct = Math.min(88, 12 + Math.floor(elapsed / 900));
    $('clientBuildMeter').style.width = `${pct}%`;
  }, 1000);
}

function updateClientBuildDialog(type, message) {
  const overlay = ensureClientBuildDialog();
  overlay.classList.toggle('done', type === 'done');
  overlay.classList.toggle('error', type === 'error');
  if (type === 'done') {
    window.clearInterval(state.clientBuildTimer);
    $('clientBuildTitle').textContent = '工具箱 EXE 已生成';
    $('clientBuildText').textContent = message || '下载已开始。';
    $('clientBuildHint').textContent = '同配置下次会直接走缓存';
    $('clientBuildMeter').style.width = '100%';
  } else if (type === 'error') {
    window.clearInterval(state.clientBuildTimer);
    $('clientBuildTitle').textContent = '生成失败';
    $('clientBuildText').textContent = message || '请检查登录状态或服务器编译环境。';
    $('clientBuildHint').textContent = '刷新重新登录后可再次尝试';
    $('clientBuildMeter').style.width = '100%';
    $('clientBuildClose').hidden = false;
  } else {
    $('clientBuildText').textContent = message;
  }
}

function closeClientBuildDialog() {
  window.clearInterval(state.clientBuildTimer);
  const overlay = $('clientBuildOverlay');
  if (overlay) overlay.classList.remove('show', 'done', 'error');
}

function authHeaders() {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  return headers;
}

function withTargetUser(path, explicitUserId = '') {
  const targetUserId = explicitUserId || state.targetUserId || '';
  if (!targetUserId || state.currentUser?.role !== 'super' || isTemplateMode()) return path;
  if (typeof path !== 'string' || !path.startsWith('/api/admin')) return path;
  const hashIndex = path.indexOf('#');
  const beforeHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const joiner = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${joiner}targetUserId=${encodeURIComponent(targetUserId)}${hash}`;
}

function isSuper() {
  return state.currentUser?.role === 'super';
}

function isAgent() {
  return state.currentUser?.role === 'agent';
}

function isManager() {
  return isSuper() || isAgent();
}

function isTemplateMode() {
  return !!(state.templateMode && isSuper());
}

function configApiPath() {
  return isTemplateMode() ? '/api/super/template' : '/api/admin/config';
}

function appApiPath() {
  return isTemplateMode() ? '/api/super/template/app' : '/api/admin/app';
}

function buttonsApiPath() {
  return isTemplateMode() ? '/api/super/template/buttons' : '/api/admin/buttons';
}

async function api(path, options = {}) {
  const { targetUserId, ...fetchOptions } = options;
  const res = await fetch(withTargetUser(path, targetUserId), {
    ...fetchOptions,
    headers: {
      ...authHeaders(),
      ...(fetchOptions.headers || {})
    }
  });

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text);

  function parseJson() {
    try {
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (looksLikeHtml) {
        throw new Error(`接口 ${path} 返回了网页内容，不是 JSON。请检查 CDN/反向代理是否已放行 /api 路径。`);
      }
      throw new Error(`接口 ${path} 返回格式错误：${error.message}`);
    }
  }

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const parsed = parseJson();
      throw new Error(parsed?.error || `接口 ${path} 请求失败：HTTP ${res.status}`);
    }
    if (looksLikeHtml) {
      throw new Error(`接口 ${path} 被返回成网页了，不是后台数据。请检查 CDN/反代规则是否把 /api 转发到后端。`);
    }
    throw new Error(text || `接口 ${path} 请求失败：HTTP ${res.status}`);
  }

  if (contentType.includes('application/json')) {
    return parseJson();
  }
  if (path.startsWith('/api/')) {
    if (looksLikeHtml) {
      throw new Error(`接口 ${path} 返回了网页内容，不是 JSON。请检查 CDN/反向代理是否已放行 /api 路径。`);
    }
    throw new Error(`接口 ${path} 没有返回 JSON，请检查后端服务状态。`);
  }
  return text;
}

function isAuthFailure(error) {
  const message = String(error?.message || '');
  return /请先登录|Please log in first|Unauthorized|HTTP 401|HTTP 403/i.test(message);
}

function setLoginMessage(message, type = 'error') {
  $('loginError').textContent = message || '';
  if (message) showToast(message, type);
}
async function loadAll() {
  if (!state.token) {
    await loadPublicBrand();
    showLogin();
    return;
  }

    const viewToRestore = state.activeView || document.querySelector('.view.show')?.id?.replace(/^view-/, '') || 'overview';
  let me;
  try {
    me = await api('/api/admin/me');
  } catch (error) {
    handleLoadFailure(error, isAuthFailure(error));
    return;
  }
  state.currentUser = me.user;
  state.targetUser = me.targetUser;
  if (!isSuper()) state.templateMode = false;

  try {
    if (isManager()) {
      await loadUsers();
      if (isSuper()) {
        await loadMailSettings();
        await loadSystemSettings();
      }
      if (!state.targetUserId) {
        state.targetUserId = state.currentUser.id;
        localStorage.setItem('toolbox_target_user', state.targetUserId);
      }
    } else {
      state.targetUserId = state.currentUser.id;
      state.users = [];
    }
    await loadNotices();

    state.config = await api(configApiPath());
    state.buttons = await api(buttonsApiPath());
    renderAll();
    if (viewToRestore) switchView(viewToRestore);
    showUnreadNoticePopup();
    showToast('配置读取成功。', 'success');
  } catch (error) {
    handleLoadFailure(error, isAuthFailure(error));
  }
}

function handleLoadFailure(error, silent = false) {
  const status = $('status');
  if (status) status.textContent = '';
  state.token = '';
  state.currentUser = null;
  state.targetUser = null;
  state.targetUserId = '';
  state.templateMode = false;
  state.users = [];
  state.invites = [];
  state.agentOrders = [];
  state.inviteSnapshot = '';
  state.activeView = 'overview';
  stopInviteAutoRefresh();
  localStorage.removeItem('toolbox_session_token');
  localStorage.removeItem('toolbox_target_user');
  localStorage.removeItem('toolbox_active_view');
  showLogin();
  if (!silent) showToast(`读取配置失败：${error.message}`, 'error');
}

function showLogin() {
  $('loginScreen').classList.remove('hidden');
  document.querySelectorAll('aside, main').forEach((el) => el.style.visibility = 'hidden');
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  document.querySelectorAll('aside, main').forEach((el) => el.style.visibility = '');
}

async function loadPublicBrand() {
  try {
    const brand = await api('/api/public/brand');
    $('loginTitle').textContent = brand.title || '工具箱后台登录';
    const hint = (brand.hint || '').trim();
    $('loginHint').textContent = hint;
    $('loginHint').hidden = !hint;
  } catch {
    $('loginTitle').textContent = '工具箱后台登录';
    $('loginHint').textContent = '';
    $('loginHint').hidden = true;
  }
}

async function login() {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  setLoginMessage('');

  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.token = result.token;
    state.currentUser = result.user;
    state.templateMode = false;
    state.targetUserId = result.user.id;
    localStorage.setItem('toolbox_session_token', state.token);
    localStorage.setItem('toolbox_target_user', state.targetUserId);
    showApp();
    await loadAll();
  } catch (error) {
    setLoginMessage('登录失败：账号或密码不正确。');
  }
}

function setLoginMode(mode) {
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  $('loginForm').hidden = isRegister || isForgot;
  $('registerForm').hidden = !isRegister;
  $('forgotForm').hidden = !isForgot;
  $('showLoginBtn').classList.toggle('active', !isRegister && !isForgot);
  $('showRegisterBtn').classList.toggle('active', isRegister);
  $('showForgotBtn').classList.toggle('active', isForgot);
  setLoginMessage('');
}

async function register() {
  const username = $('registerUsername').value.trim();
  const email = $('registerEmail').value.trim();
  const displayName = $('registerDisplayName').value.trim();
  const password = $('registerPassword').value;
  const inviteCode = $('registerInviteCode').value.trim();
  setLoginMessage('');

  if (!username || !email || !password || !inviteCode) {
    setLoginMessage('注册失败：用户名、邮箱、密码和邀请码都要填写。');
    return;
  }

  try {
    const result = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, displayName, password, inviteCode })
    });
    state.token = result.token;
    state.currentUser = result.user;
    state.templateMode = false;
    state.targetUserId = result.user.id;
    localStorage.setItem('toolbox_session_token', state.token);
    localStorage.setItem('toolbox_target_user', state.targetUserId);
    showApp();
    await loadAll();
  } catch (error) {
    setLoginMessage(`注册失败：${error.message || '邀请码无效或账号已存在。'}`);
  }
}

const RESET_CODE_COOLDOWN_SECONDS = 60;
const RESET_CODE_COOLDOWN_KEY = 'toolbox_reset_code_cooldown_until';
let resetCodeCountdownTimer = null;
function updateResetCodeCountdown() {
  const button = $('sendResetCodeBtn'); const secondsLeft = Math.max(0, Math.ceil((Number(localStorage.getItem(RESET_CODE_COOLDOWN_KEY) || 0) - Date.now()) / 1000));
  if (secondsLeft > 0) { button.disabled = true; button.textContent = `${secondsLeft}秒后重新发送`; return; }
  localStorage.removeItem(RESET_CODE_COOLDOWN_KEY); button.disabled = false; button.textContent = '重新发送验证码'; if (resetCodeCountdownTimer) clearInterval(resetCodeCountdownTimer); resetCodeCountdownTimer = null;
}
function startResetCodeCountdown(seconds = RESET_CODE_COOLDOWN_SECONDS) {
  localStorage.setItem(RESET_CODE_COOLDOWN_KEY, String(Date.now() + seconds * 1000)); updateResetCodeCountdown(); if (resetCodeCountdownTimer) clearInterval(resetCodeCountdownTimer); resetCodeCountdownTimer = setInterval(updateResetCodeCountdown, 1000);
}
async function sendResetCode() {
  const email = $('forgotEmail').value.trim();
  const button = $('sendResetCodeBtn');
  setLoginMessage('');
  if (!email) {
    setLoginMessage('请先输入邮箱。');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setLoginMessage('请输入正确的邮箱地址。'); return; }
  button.disabled = true; button.textContent = '发送中...';
  try {
    const result = await api('/api/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }); setLoginMessage(result.debugCode ? `${result.message} 验证码：${result.debugCode}` : result.message, result.debugCode ? 'warn' : 'success'); startResetCodeCountdown();
  } catch (error) { const retryAfter = Number(String(error.message || '').match(/(\d+)\s*秒后/)?.[1] || 0); if (retryAfter > 0) startResetCodeCountdown(retryAfter); else { button.disabled = false; button.textContent = '发送验证码'; } throw error; }
}

async function resetPassword() {
  const email = $('forgotEmail').value.trim();
  const code = $('resetCode').value.trim();
  const password = $('resetPassword').value;
  setLoginMessage('');
  try {
    await api('/api/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, password })
    });
    setLoginMessage('密码已重置，请返回登录。', 'success');
    $('resetCode').value = '';
    $('resetPassword').value = '';
  } catch (error) {
    setLoginMessage(`重置失败：${error.message || '验证码无效。'}`);
  }
}

function logout() {
  state.token = '';
  state.currentUser = null;
  state.targetUser = null;
  state.templateMode = false;
  state.users = [];
  state.invites = [];
  state.agentOrders = [];
  state.inviteSnapshot = '';
  stopInviteAutoRefresh();
  localStorage.removeItem('toolbox_session_token');
  localStorage.removeItem('toolbox_target_user');
  showLogin();
}

function renderAll() {
  showApp();
  document.body.classList.toggle('is-template-mode', isTemplateMode());
  syncInviteAutoRefresh();
  renderUserContext();
  renderApp();
  renderPopupSettings();
  renderAccount();
  renderMailSettings();
  renderSystemSettings();
  renderTemplateControls();
  renderNotices();
  ensureButtonsPagePanels();
  renderStats();
  renderManageControls();
  renderPageAccessControls();
  renderSelectors();
  renderButtons();
  renderClientVariants();
  renderExchangeControls();
  const canJson = canViewJson();
  const jsonNav = document.querySelector('.nav[data-view="json"]');
  if (jsonNav) jsonNav.hidden = !canJson;
  if (!canJson && $('view-json')?.classList.contains('show')) switchView('overview');
  if ($('jsonEditor')) $('jsonEditor').value = canJson ? JSON.stringify(state.config, null, 2) : '';
  renderJsonPermissions();
  if (isTemplateMode()) {
    $('publicEndpoint').textContent = '正在编辑新用户模板，模板没有公开对接地址。';
  } else {
    const endpointUser = state.targetUser || state.currentUser;
    const key = endpointUser?.apiKey ? `?key=${encodeURIComponent(endpointUser.apiKey)}` : '';
    $('publicEndpoint').textContent = `${location.origin}/api/toolbox/config${key}`;
  }
}

async function loadUsers() {
  if (!isManager()) return;
  const result = await api('/api/super/users');
  state.users = result.users || [];
  if (state.targetUserId && !state.users.some((user) => user.id === state.targetUserId)) {
    state.targetUserId = state.currentUser.id;
    localStorage.setItem('toolbox_target_user', state.targetUserId);
  }
  state.targetUser = state.users.find((user) => user.id === state.targetUserId) || state.currentUser;
  await loadInvites();
}

function inviteSnapshot(invites) {
  return JSON.stringify((invites || []).map((invite) => ({
    code: invite.code || '',
    active: invite.active !== false,
    usedCount: Number(invite.usedCount || 0),
    maxUses: Number(invite.maxUses || 1),
    usedBy: invite.usedBy || [],
    ownerAgentId: invite.ownerAgentId || '',
    registerRole: invite.registerRole || 'user',
    boundAgentId: invite.boundAgentId || '',
    isAgentInvite: invite.isAgentInvite === true,
    createdAt: invite.createdAt || ''
  })));
}

async function loadInvites() {
  if (!isManager()) return false;
  const result = await api('/api/super/invites');
  const nextInvites = result.invites || [];
  const nextSnapshot = inviteSnapshot(nextInvites);
  const changed = nextSnapshot !== state.inviteSnapshot;
  state.invites = nextInvites;
  state.inviteSnapshot = nextSnapshot;
  return changed;
}

function shouldAutoRefreshInvites() {
  return !!(state.token && isManager() && !isTemplateMode());
}

function stopInviteAutoRefresh() {
  if (state.inviteRefreshTimer) {
    window.clearInterval(state.inviteRefreshTimer);
    state.inviteRefreshTimer = null;
  }
  state.inviteRefreshBusy = false;
}

function startInviteAutoRefresh() {
  if (!shouldAutoRefreshInvites()) {
    stopInviteAutoRefresh();
    return;
  }
  if (state.inviteRefreshTimer) return;
  state.inviteRefreshTimer = window.setInterval(refreshInvitesSilently, INVITE_REFRESH_INTERVAL_MS);
}

function syncInviteAutoRefresh() {
  if (shouldAutoRefreshInvites()) startInviteAutoRefresh();
  else stopInviteAutoRefresh();
}

async function refreshInvitesSilently() {
  if (!shouldAutoRefreshInvites() || state.inviteRefreshBusy || document.hidden) return;
  state.inviteRefreshBusy = true;
  try {
    const changed = await loadInvites();
    if (changed) renderInvites();
  } catch (error) {
    console.warn('邀请码自动刷新失败：', error);
  } finally {
    state.inviteRefreshBusy = false;
  }
}

async function loadMailSettings() {
  if (!isSuper()) return;
  state.mail = await api('/api/super/mail');
}

async function loadSystemSettings() {
  if (!isSuper()) return;
  state.system = await api('/api/super/system');
  const result = await api('/api/super/orders');
  state.orders = result.orders || [];
}

async function loadNotices() {
  if (!state.currentUser) return;
  const result = await api('/api/admin/notices');
  state.notices = result.notices || [];
}

function renderUserContext() {
  const superMode = isSuper();
  const managerMode = isManager();
  document.querySelectorAll('.super-only').forEach((el) => {
    el.hidden = !superMode;
  });
  document.querySelectorAll('.manager-only').forEach((el) => {
    el.hidden = !managerMode;
  });

  if (!superMode && $('view-system')?.classList.contains('show')) {
    switchView('overview');
  }
  if (!managerMode && $('view-users')?.classList.contains('show')) {
    switchView('overview');
  }

  const roleText = state.currentUser ? (state.currentUser.roleLabel || (superMode ? '总管理员' : (isAgent() ? '代理' : '普通用户'))) : '';
  let userText = state.currentUser
    ? `${displayNameOf(state.currentUser)}（${roleText}）`
    : '未登录';
  if (isTemplateMode()) {
    userText += ' · 新用户模板';
  }
  if (isAgent()) {
    userText += ` · 余额：${formatMoney(state.currentUser.balance, state.inviteCurrency)}`;
  }
  $('currentUserLabel').textContent = userText;

  const selector = $('targetUserSelect');
  if (superMode && selector) {
    const previous = state.targetUserId || state.currentUser.id;
    selector.innerHTML = '';
    state.users.forEach((user) => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = displayNameOf(user, user.username);
      opt.title = user.username || '';
      selector.appendChild(opt);
    });
    selector.value = previous;
    state.targetUserId = selector.value || state.currentUser.id;
    state.targetUser = state.users.find((user) => user.id === state.targetUserId) || state.currentUser;
    selector.disabled = isTemplateMode();
  }

  renderUsers();
  renderInvites();
  const addUserPanel = $('addUserBtn')?.closest('.panel');
  if (addUserPanel) addUserPanel.hidden = !superMode;
}

function switchView(view) {
  if (view === 'system' && !isSuper()) {
    view = 'overview';
  }
  if (view === 'users' && !isManager()) {
    view = 'overview';
  }
  if (view === 'json' && !canViewJson()) {
    setStatus('当前账号没有 JSON 管理权限。', true);
    view = 'overview';
  }
  state.activeView = view;
  localStorage.setItem('toolbox_active_view', view);
  document.querySelectorAll('.nav').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.view').forEach((x) => x.classList.remove('show'));
  const nav = document.querySelector(`.nav[data-view="${view}"]`);
  const panel = $(`view-${view}`);
  if (nav) nav.classList.add('active');
  if (panel) panel.classList.add('show');
  const title = VIEW_TITLES[view] || VIEW_TITLES.overview;
  if ($('pageTitle')) $('pageTitle').textContent = title[0];
  if ($('pageSubtitle')) $('pageSubtitle').textContent = title[1];
}

function canViewJson() {
  if (!state.currentUser) return false;
  if (isSuper()) return true;
  return state.currentUser.canViewJson !== false;
}

function renderJsonPermissions() {
  const view = $('view-json');
  if (!view) return;
  let panel = $('jsonPermissionPanel');
  if (state.currentUser?.role !== 'super') {
    if (panel) panel.hidden = true;
    return;
  }
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'jsonPermissionPanel';
    panel.className = 'panel json-permission-panel';
    panel.innerHTML = `
      <div class="panel-head">
        <h2>JSON 查看权限</h2>
        <button id="saveJsonPermissionBtn" type="button">保存权限</button>
      </div>
      <div class="permission-list" id="jsonPermissionList"></div>
    `;
    view.insertBefore(panel, view.firstElementChild);
    $('saveJsonPermissionBtn').onclick = saveJsonPermissions;
  }
  panel.hidden = false;
  const list = $('jsonPermissionList');
  list.innerHTML = '';
  state.users.forEach((user) => {
    const item = document.createElement('label');
    item.className = 'permission-item';
    item.innerHTML = `
      <input class="json-permission-check" type="checkbox" value="${escapeAttr(user.id || '')}" ${user.canViewJson !== false ? 'checked' : ''} ${user.role === 'super' ? 'disabled' : ''}>
      <span>
        <strong>${escapeHtml(user.displayName || user.username || '')}</strong>
        <small>${escapeHtml(user.username || '')} · ${user.role === 'super' ? '总管理员默认可见' : '普通用户'}</small>
      </span>
    `;
    list.appendChild(item);
  });
}

function renderApp() {
  ensureExeMetaFields();
  ensureUpdateFields();
  ensureThemeSelect();
  ensureLoginBrandFields();
  organizeOverviewCards();
  const app = state.config.app || {};
  $('appTitle').value = app.title || '';
  $('appSubtitle').value = app.subtitle || '';
  $('appVersion').value = app.version || '';
  $('appTheme').value = app.theme || '午夜靛蓝';
  $('appThemeCount').value = app.theme_count || 19;
  $('appAllowClientTheme').checked = app.allow_client_theme !== false;
  if ($('appDefaultViewMode')) $('appDefaultViewMode').value = app.default_view_mode === 'list' ? 'list' : 'grid';
  $('appLogo').value = app.logo_text || '';
  $('appIcon').value = app.icon || app.icon_url || '';
  ensureExeIconField();
  $('appExeIcon').value = app.exe_icon || app.exe_icon_url || '';
  $('loginTitleInput').value = app.admin_title || '工具箱后台登录';
  $('loginHintInput').value = app.login_hint || '';
  const loginPanel = $('appLoginPanel');
  const isSuper = state.currentUser?.role === 'super';
  document.body.classList.toggle('is-super-admin', isSuper);
  if (loginPanel) loginPanel.hidden = !isSuper;
  $('appWidth').value = app.window_width || 1080;
  $('appHeight').value = app.window_height || 700;
  $('appPasswordEnabled').checked = app.password_enabled === undefined ? !!app.password : !!app.password_enabled;
  $('appPassword').value = '';
  $('appPassword').disabled = !$('appPasswordEnabled').checked;
  $('appUpdateUrl').value = app.update_url || '';
  $('appUpdateTitle').value = app.update_title || '工具箱更新';
  $('appUpdateButton').value = app.update_button || '下载最新版';
  $('appExeTitle').value = app.exe_title || app.title || '';
  $('appExeDescription').value = app.exe_description || app.subtitle || '';
  $('appExeProduct').value = app.exe_product || app.title || '';
  $('appExeCompany').value = app.exe_company || '';
  $('appExeCopyright').value = app.exe_copyright || '';
  $('appExeVersion').value = app.exe_version || app.version || '1.0.0.0';
}

function normalizeAdminTheme(value) {
  return String(value || '').toLowerCase() === 'light' ? 'light' : 'dark';
}

function applyAdminTheme(theme = localStorage.getItem(ADMIN_THEME_STORAGE_KEY)) {
  const mode = normalizeAdminTheme(theme);
  const light = mode === 'light';
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-dayblue');
  document.body.classList.add(light ? 'theme-light' : 'theme-dark');
  const toggle = $('adminThemeToggle');
  const text = $('adminThemeToggleText');
  const icon = toggle?.querySelector('.theme-toggle-icon');
  if (toggle) {
    toggle.setAttribute('aria-pressed', light ? 'true' : 'false');
    toggle.title = light ? '切换深色主题' : '切换浅色主题';
  }
  if (text) text.textContent = light ? '浅色' : '深色';
  if (icon) icon.textContent = light ? '☀' : '☾';
}

function toggleAdminTheme() {
  const current = normalizeAdminTheme(localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
  applyAdminTheme(next);
}

function organizeOverviewCards() {
  const view = $('view-overview');
  const firstPanel = view?.querySelector('.panel');
  const grid = firstPanel?.querySelector('.form-grid');
  if (!view || !firstPanel || !grid) return;
  if ($('appPropertyPanel')) {
    bindOverviewSaveActions();
    return;
  }
  firstPanel.querySelector('h2').textContent = '基础信息';

  const saveButton = $('saveAppBtn');
  if (saveButton) saveButton.textContent = '保存基础信息';

  const stats = view.querySelector('.stats');
  const passwordPanel = createOverviewPanel('启动密码', 'appPasswordPanel', 'saveAppPasswordBtn', '保存启动密码');
  const loginPanel = createOverviewPanel('登录页设置', 'appLoginPanel', 'saveAppLoginBtn', '保存登录页');
  const propertyPanel = createOverviewPanel('EXE 属性', 'appPropertyPanel', 'saveAppExeBtn', '保存 EXE');
  const pageAccessPanel = ensurePageAccessPanel();
  const updatePanel = createOverviewPanel('更新入口', 'appUpdatePanel', 'saveAppUpdateBtn', '保存更新入口');
  const popupPanel = createPopupOverviewPanel();
  view.insertBefore(loginPanel, stats);
  view.insertBefore(passwordPanel, stats);
  view.insertBefore(pageAccessPanel, stats);
  view.insertBefore(propertyPanel, stats);
  view.insertBefore(updatePanel, stats);
  view.insertBefore(popupPanel, stats);
  setupCollapsiblePanels();
  bindOverviewSaveActions();
  bindPopupSettingsActions();

  moveLabels(grid, loginPanel.querySelector('.form-grid'), ['loginTitleInput', 'loginHintInput']);
  moveLabels(grid, passwordPanel.querySelector('.form-grid'), ['appPasswordEnabled', 'appPassword']);
  moveLabels(grid, propertyPanel.querySelector('.form-grid'), ['appExeTitle', 'appExeDescription', 'appExeProduct', 'appExeVersion', 'appExeCompany', 'appExeCopyright']);
  moveLabels(grid, updatePanel.querySelector('.form-grid'), ['appUpdateUrl', 'appUpdateTitle', 'appUpdateButton']);
}

function createPopupOverviewPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel collapsible-panel is-collapsed';
  panel.id = 'popupOverviewPanel';
  panel.dataset.collapsiblePanel = '';
  panel.dataset.defaultCollapsed = '1';
  panel.innerHTML = `
    <div class="panel-head">
      <h2>联系方式</h2>
      <button id="savePopupAllBtn" type="button">保存联系方式</button>
    </div>
    <div class="popup-settings">
      <div class="popup-admin-block">
        <div class="popup-admin-head">
          <h3>基础设置</h3>
        </div>
        <div class="form-grid compact">
          <label class="toggle-line">启用隐藏入口<span><input id="popupEnabled" type="checkbox"> 启用</span></label>
          <label>Logo 连续点击次数<input id="popupClickCount" type="number" min="1" max="20" step="1"></label>
          <label>数据缓存分钟<input id="popupCacheMinutes" type="number" min="0" max="1440" step="1"></label>
          <label>弹窗标题<input id="popupTitle" placeholder="联系我们 / 支持作者"></label>
          <label class="wide">感谢文案<textarea id="popupThanksText" rows="3" placeholder="感谢你的支持，我们会持续维护和更新工具箱。"></textarea></label>
        </div>
      </div>
      <div class="popup-admin-block">
        <div class="popup-admin-head">
          <h3>联系方式二维码</h3>
          <div class="popup-head-actions">
            <button id="addPopupContactBtn" type="button">新增联系方式</button>
          </div>
        </div>
        <div id="popupContactRows" class="popup-config-list"></div>
      </div>
      <div class="popup-admin-block">
        <div class="popup-admin-head">
          <h3>收款码</h3>
          <div class="popup-head-actions">
            <button id="addPopupPaymentBtn" type="button">新增收款码</button>
          </div>
        </div>
        <div id="popupPaymentRows" class="popup-config-list"></div>
      </div>
      <div class="popup-admin-block">
        <div class="popup-admin-head">
          <h3>相关链接</h3>
          <div class="popup-head-actions">
            <button id="addPopupLinkBtn" type="button">新增链接</button>
          </div>
        </div>
        <div id="popupLinkRows" class="popup-config-list"></div>
      </div>
    </div>
  `;
  return panel;
}

function bindPopupSettingsActions() {
  if ($('savePopupAllBtn')) $('savePopupAllBtn').onclick = () => savePopupSettings('联系方式').catch((error) => setStatus(error.message, true));
  if ($('addPopupContactBtn')) $('addPopupContactBtn').onclick = () => addPopupItem('contact');
  if ($('addPopupPaymentBtn')) $('addPopupPaymentBtn').onclick = () => addPopupItem('payment');
  if ($('addPopupLinkBtn')) $('addPopupLinkBtn').onclick = () => addPopupItem('link');
}

function ensureLoginBrandFields() {
  const hintInput = $('loginHintInput');
  if (!hintInput) return;
  const hintLabel = hintInput.closest('label');
  if (hintLabel) {
    hintLabel.classList.add('wide');
    if (hintLabel.firstChild?.nodeType === Node.TEXT_NODE) hintLabel.firstChild.textContent = '登录页提示';
  }
  if ($('loginTitleInput')) return;
  const titleLabel = document.createElement('label');
  titleLabel.innerHTML = '登录页标题<input id="loginTitleInput" placeholder="例如：工具箱后台登录">';
  hintLabel?.insertAdjacentElement('beforebegin', titleLabel);
}

function bindOverviewSaveActions() {
  const bind = (id, handler) => {
    const button = $(id);
    if (button) button.onclick = () => handler().catch((error) => setStatus(error.message, true));
  };
  bind('saveAppBtn', saveAppBasicSettings);
  bind('saveAppLoginBtn', saveAppLoginSettings);
  bind('saveAppPasswordBtn', saveAppPasswordSettings);
  bind('saveAppExeBtn', saveAppExeSettings);
  bind('saveAppUpdateBtn', saveAppUpdateSettings);
  if ($('savePageAccessBtn')) $('savePageAccessBtn').onclick = () => savePageAccess().catch((error) => setStatus(error.message, true));
}

function createOverviewPanel(title, id, saveButtonId = '', saveText = '保存') {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = id;
  const action = saveButtonId ? `<button id="${saveButtonId}" type="button">${saveText}</button>` : '';
  panel.innerHTML = `<div class="panel-head"><h2>${title}</h2>${action}</div><div class="form-grid"></div>`;
  return panel;
}

function moveLabels(sourceGrid, targetGrid, ids) {
  ids.forEach((id) => {
    const el = $(id);
    const label = el?.closest('label');
    if (label) targetGrid.appendChild(label);
  });
}

function ensureThemeSelect() {
  const input = $('appTheme');
  if (!input) return;
  if (!$('appThemeCount')) {
    const themeLabel = input.closest('label');
    const countLabel = document.createElement('label');
    countLabel.innerHTML = '工具箱可显示主题数<input id="appThemeCount" type="number" min="1" max="19" placeholder="最多 19 个">';
    themeLabel.insertAdjacentElement('afterend', countLabel);
    const allowLabel = document.createElement('label');
    allowLabel.className = 'toggle-line';
    allowLabel.innerHTML = '工具箱同步可自行修改主题<span><input id="appAllowClientTheme" type="checkbox"> 启用</span>';
    countLabel.insertAdjacentElement('afterend', allowLabel);
  }
  if (input.tagName === 'SELECT') return;
  const select = document.createElement('select');
  select.id = 'appTheme';
  [
    ['午夜靛蓝', '午夜靛蓝'],
    ['海雾蓝湖', '海雾蓝湖'],
    ['冰川浅蓝', '冰川浅蓝'],
    ['钻蓝冷辉', '钻蓝冷辉'],
    ['晴空蓝白', '晴空蓝白'],
    ['森境青绿', '森境青绿'],
    ['翡翠冷绿', '翡翠冷绿'],
    ['极光青碧', '极光青碧'],
    ['落日绯红', '落日绯红'],
    ['玫瑰粉雾', '玫瑰粉雾'],
    ['樱雾浅粉', '樱雾浅粉'],
    ['蓝雾淡紫', '蓝雾淡紫'],
    ['星云紫幕', '星云紫幕'],
    ['霓虹电缎', '霓虹电缎'],
    ['墨金深空', '墨金深空'],
    ['暖棕咖啡', '暖棕咖啡'],
    ['余烬橙焰', '余烬橙焰'],
    ['沙丘金黄', '沙丘金黄'],
    ['银光素白', '银光素白']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  input.replaceWith(select);
}

function ensureExeMetaFields() {
  if ($('appExeTitle')) return;
  const grid = $('appPassword')?.closest('.form-grid');
  if (!grid) return;
  const fields = [
    ['appExeTitle', 'EXE 文件说明', '属性里显示的文件说明'],
    ['appExeDescription', 'EXE 介绍', '属性里的说明/介绍'],
    ['appExeProduct', 'EXE 产品名称', '属性里的产品名称'],
    ['appExeVersion', 'EXE 文件版本', '例如：1.0.0.0'],
    ['appExeCompany', 'EXE 公司名称', '可留空'],
    ['appExeCopyright', 'EXE 版权', '例如：Copyright © 2026']
  ];
  fields.forEach(([id, labelText, placeholder]) => {
    const label = document.createElement('label');
    label.innerHTML = `${labelText}<input id="${id}" placeholder="${placeholder}">`;
    grid.appendChild(label);
  });
}

function ensureExeIconField() {
  if ($('appExeIcon')) return;
  const appIcon = $('appIcon');
  const grid = appIcon?.closest('.form-grid');
  if (!grid) return;
  const label = document.createElement('label');
  label.className = 'wide';
  label.innerHTML = 'EXE 图标链接<input id="appExeIcon" placeholder="建议填 .ico 或 PNG 图床链接，生成工具箱时使用">';
  appIcon.closest('label').insertAdjacentElement('afterend', label);
}

function ensureUpdateFields() {
  if ($('appUpdateUrl')) return;
  const grid = $('appPassword')?.closest('.form-grid');
  if (!grid) return;
  const updateUrl = document.createElement('label');
  updateUrl.className = 'wide';
  updateUrl.innerHTML = '工具箱更新链接<input id="appUpdateUrl" placeholder="粘贴新版 EXE 下载地址，留空不显示更新入口">';
  const updateTitle = document.createElement('label');
  updateTitle.innerHTML = '更新入口标题<input id="appUpdateTitle" placeholder="例如：工具箱更新">';
  const updateButton = document.createElement('label');
  updateButton.innerHTML = '更新按钮文字<input id="appUpdateButton" placeholder="例如：下载最新版">';
  grid.appendChild(updateUrl);
  grid.appendChild(updateTitle);
  grid.appendChild(updateButton);
}

function renderAccount() {
  const user = state.currentUser || {};
  $('accountUsername').value = user.username || '';
  $('accountEmail').value = user.email || '';
  $('accountDisplayName').value = user.displayName || '';
  $('accountCurrentPassword').value = '';
  $('accountNewPassword').value = '';
}

function renderMailSettings() {
  if (state.currentUser?.role !== 'super' || !state.mail) return;
  $('mailHost').value = state.mail.host || '';
  $('mailPort').value = state.mail.port || 465;
  $('mailUser').value = state.mail.user || '';
  $('mailFrom').value = state.mail.from || '';
  $('mailPassword').value = '';
  $('mailSecure').checked = state.mail.secure !== false;
  $('mailStatusText').textContent = state.mail.hasPassword ? '已保存 SMTP 密码' : '未保存 SMTP 密码';
}

async function saveMailSettings() {
  const body = {
    host: $('mailHost').value.trim(),
    port: Number($('mailPort').value || 465),
    user: $('mailUser').value.trim(),
    from: $('mailFrom').value.trim(),
    password: $('mailPassword').value,
    secure: $('mailSecure').checked
  };
  state.mail = await api('/api/super/mail', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  renderMailSettings();
  setStatus('邮箱设置已保存。');
}

async function testMailSettings() {
  const email = $('mailTestTo').value.trim();
  if (!email) {
    setStatus('请输入测试收件邮箱。', true);
    return;
  }
  await api('/api/super/mail/test', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
  setStatus('测试邮件已发送。');
}

async function saveAccount() {
  const body = {
    username: $('accountUsername').value.trim(),
    email: $('accountEmail').value.trim(),
    displayName: $('accountDisplayName').value.trim()
  };
  const newPassword = $('accountNewPassword').value;
  if (newPassword) {
    body.currentPassword = $('accountCurrentPassword').value;
    body.password = newPassword;
  }
  const result = await api('/api/admin/account', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  state.currentUser = result.user;
  renderUserContext();
  renderAccount();
  setStatus('账号已保存。');
}

function renderUsers() {
  const tbody = $('userRows');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!isManager()) return;
  const tableWrap = tbody.closest('.table-wrap');
  if (tableWrap) {
    tableWrap.dataset.keepHidden = '1';
    tableWrap.hidden = true;
  }
  const panel = tbody.closest('.panel');
  setPanelCounter(panel, 'userTotalCount', state.users.length);
  let cards = $('userCards');
  if (!cards && panel) {
    cards = document.createElement('div');
    cards.id = 'userCards';
    cards.className = 'user-card-list';
    panel.appendChild(cards);
  }
  ensureUserBatchTools(panel);
  if (!cards) return;
  cards.classList.add('collapsible-body');
  cards.hidden = !!panel?.classList.contains('is-collapsed');
  cards.innerHTML = '';

  state.users.forEach((user) => {
    const endpoint = `${location.origin}/api/toolbox/config?key=${encodeURIComponent(user.apiKey || '')}`;
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = user.id;
    card.innerHTML = `
      <div class="user-card-main">
        <input class="user-check" type="checkbox" value="${escapeAttr(user.id || '')}" ${user.id === 'admin' ? 'disabled' : ''}>
        <button class="user-expand" type="button">▸</button>
        <div class="user-avatar">${escapeHtml((user.displayName || user.username || 'U').slice(0, 1).toUpperCase())}</div>
        <div class="user-summary">
          <strong>${escapeHtml(user.displayName || user.username || '')}</strong>
          <span>${escapeHtml(user.username || '')} · ${escapeHtml(user.email || '未填写邮箱')}</span>
          <small>上次登录：${escapeHtml(formatDateTime(user.lastLoginAt))}${user.parentAgentName ? ` · 归属代理：${escapeHtml(user.parentAgentName)}` : ''}</small>
        </div>
        <span class="pill">${escapeHtml(user.roleLabel || (user.role === 'super' ? '总管理员' : (user.role === 'agent' ? '代理' : '普通用户')))}</span>
        <span class="pill ${user.active === false ? 'danger-pill' : ''}">${user.active === false ? '已停用' : '正常'}</span>
        <span class="pill ${user.canViewJson === false ? 'muted-pill' : ''}">JSON ${user.canViewJson === false ? '不可见' : '可见'}</span>
        ${user.role === 'agent' ? `
          <label class="inline-balance">
            <span>代理余额</span>
            <input data-field="balance" type="number" step="0.01" value="${Number(user.balance || 0)}" ${!isSuper() ? 'disabled' : ''}>
            <button data-action="save-balance" type="button" ${!isSuper() ? 'disabled' : ''}>保存余额</button>
          </label>
          <span class="pill">邀请码 ${Number(user.agentInviteCount || 0)}</span>
          <span class="pill">推广用户 ${Number(user.promotedUserCount || 0)}</span>
        ` : ''}
      </div>
      <div class="user-card-detail" hidden>
        <div class="form-grid">
          <label>账号<input data-field="username" value="${escapeAttr(user.username || '')}"><small>${escapeHtml(user.id || '')}</small></label>
          <label>邮箱<input data-field="email" type="email" value="${escapeAttr(user.email || '')}"></label>
          <label>显示名称<input data-field="displayName" value="${escapeAttr(user.displayName || '')}"></label>
          <label>角色
            <select data-field="role" ${!isSuper() ? 'disabled' : ''}>
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option>
              <option value="agent" ${user.role === 'agent' ? 'selected' : ''}>代理</option>
              <option value="super" ${user.role === 'super' ? 'selected' : ''}>总管理员</option>
            </select>
          </label>
          <label>新密码<input data-field="password" type="password" placeholder="留空不修改" ${!isSuper() ? 'disabled' : ''}></label>
          <label>代理余额<input data-field="detailBalance" type="number" step="0.01" value="${Number(user.balance || 0)}" ${!isSuper() || user.role !== 'agent' ? 'disabled' : ''}></label>
          <label class="toggle-line">JSON 管理<span><input data-field="canViewJson" type="checkbox" ${user.canViewJson !== false ? 'checked' : ''} ${user.role === 'super' || !isSuper() ? 'disabled' : ''}> 可查看</span></label>
          <label class="wide">工具箱对接地址<input class="user-endpoint" readonly value="${escapeAttr(endpoint)}"></label>
        </div>
        <div class="card-actions">
          <button data-action="download" data-variant="original" ${!isSuper() ? 'disabled' : ''}>下载工具箱</button>
          <button data-action="save" ${!isSuper() ? 'disabled' : ''}>保存</button>
          ${user.role === 'agent'
            ? `<button data-action="cancel-agent" class="danger" ${!isSuper() || user.id === 'admin' ? 'disabled' : ''}>取消代理</button><button data-action="view-agent-orders" type="button">查看代理订单</button>`
            : `<button data-action="promote-agent" ${!isSuper() || user.role === 'super' ? 'disabled' : ''}>设为代理</button>`}
          <button data-action="toggle-active" class="${user.active === false ? '' : 'danger'}" ${user.id === 'admin' ? 'disabled' : ''}>${user.active === false ? '解冻账号' : '冻结账号'}</button>
          <button data-action="reset-key" ${!isSuper() ? 'disabled' : ''}>重置地址</button>
          <button class="danger" data-action="delete" ${user.id === 'admin' || !isSuper() ? 'disabled' : ''}>删除</button>
        </div>
      </div>
    `;
    card.querySelector('.user-expand').onclick = () => {
      const detail = card.querySelector('.user-card-detail');
      const open = detail.hidden;
      detail.hidden = !open;
      card.querySelector('.user-expand').textContent = open ? '▾' : '▸';
    };
    card.querySelector('[data-action="download"]').onclick = () => downloadClient(user.id);
    card.querySelector('[data-action="save"]').onclick = () => saveUser(user.id, card);
    const saveBalanceBtn = card.querySelector('[data-action="save-balance"]');
    if (saveBalanceBtn) saveBalanceBtn.onclick = () => saveAgentBalance(user.id, card);
    const promoteBtn = card.querySelector('[data-action="promote-agent"]');
    if (promoteBtn) promoteBtn.onclick = () => promoteUserAgent(user.id);
    const cancelAgentBtn = card.querySelector('[data-action="cancel-agent"]');
    if (cancelAgentBtn) cancelAgentBtn.onclick = () => cancelUserAgent(user.id);
    const viewAgentOrdersBtn = card.querySelector('[data-action="view-agent-orders"]');
    if (viewAgentOrdersBtn) viewAgentOrdersBtn.onclick = () => jumpToAgentOrders(user.id);
    card.querySelector('[data-action="toggle-active"]').onclick = () => toggleUserActive(user.id, user.active !== false);
    card.querySelector('[data-action="reset-key"]').onclick = () => resetUserApiKey(user.id);
    card.querySelector('[data-action="delete"]').onclick = () => deleteUser(user.id, user.username);
    cards.appendChild(card);
  });
}

function setPanelCounter(panel, id, count) {
  if (!panel) return;
  const title = panel.querySelector('.panel-head h2');
  if (!title) return;
  let badge = $(id);
  if (!badge) {
    badge = document.createElement('small');
    badge.id = id;
    badge.className = 'panel-count';
    title.appendChild(badge);
  }
  badge.textContent = `共 ${typeof count === 'string' ? count : Number(count || 0)} 个`;
}

function inviteIsUsed(invite) {
  return Number(invite?.usedCount || 0) > 0;
}

function filteredInvites() {
  const filter = state.inviteFilter || 'all';
  return (state.invites || []).filter((invite) => {
    if (filter === 'used') return inviteIsUsed(invite);
    if (filter === 'unused') return !inviteIsUsed(invite);
    return true;
  });
}

function ensureUserBatchTools(panel) {
  if (!panel || $('userBatchBar')) return;
  const bar = document.createElement('div');
  bar.id = 'userBatchBar';
  bar.className = 'batch-bar collapsible-body';
  bar.innerHTML = `
    <label class="checkline"><input id="userSelectAll" type="checkbox"> 全选</label>
    <button data-user-batch="enable">批量启用</button>
    <button data-user-batch="disable">批量停用</button>
    <button data-user-batch="allow_json">允许 JSON</button>
    <button data-user-batch="deny_json">禁止 JSON</button>
    <button class="danger" data-user-batch="delete">批量删除</button>
  `;
  const head = panel.querySelector('.panel-head');
  head?.insertAdjacentElement('afterend', bar);
  if (panel.classList.contains('is-collapsed')) bar.hidden = true;
  $('userSelectAll').onchange = (event) => {
    document.querySelectorAll('.user-check:not(:disabled)').forEach((box) => { box.checked = event.target.checked; });
  };
  bar.querySelectorAll('[data-user-batch]').forEach((button) => {
    button.onclick = () => batchUsers(button.dataset.userBatch);
  });
}

function renderInvites() {
  const tbody = $('inviteRows');
  if (!tbody) return;
  ensureInviteTools();
  const checkedCodes = new Set([...tbody.querySelectorAll('.invite-check:checked')].map((box) => box.value));
  tbody.innerHTML = '';

  if (!isManager()) return;
  const visibleInvites = filteredInvites();
  const totalInvites = state.invites.length;
  const counterText = visibleInvites.length === totalInvites ? totalInvites : `${visibleInvites.length}/${totalInvites}`;
  setPanelCounter(tbody.closest('.panel'), 'inviteTotalCount', counterText);
  const filter = $('inviteUseFilter');
  if (filter && filter.value !== state.inviteFilter) filter.value = state.inviteFilter || 'all';

  if (!visibleInvites.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="11" class="empty-cell">当前筛选下没有邀请码。</td>`;
    tbody.appendChild(tr);
  }

  visibleInvites.forEach((invite) => {
    const usedCount = Number(invite.usedCount || 0);
    const maxUses = Number(invite.maxUses || 1);
    const inviteUsed = inviteIsUsed(invite);
    const usedBy = (invite.usedBy || [])
      .map((item) => `${item.username || item.userId || ''} ${item.usedAt ? new Date(item.usedAt).toLocaleString() : ''}`)
      .join('；');
    const registerRole = invite.registerRole === 'agent' ? '代理' : '普通用户';
    const boundAgentName = invite.boundAgentName || userNameFromId(invite.boundAgentId || invite.ownerAgentId || '', invite.boundAgentId || invite.ownerAgentId || '');
    const isAgentInvite = invite.isAgentInvite === true || invite.registerRole === 'agent' || !!invite.ownerAgentId;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="invite-check" value="${escapeAttr(invite.code || '')}" ${checkedCodes.has(invite.code || '') ? 'checked' : ''}></td>
      <td><input readonly class="invite-code" value="${escapeAttr(invite.code || '')}"></td>
      <td>${escapeHtml(invite.createdAt ? formatDateTime(invite.createdAt) : '暂无')}</td>
      <td><span class="invite-badge ${invite.registerRole === 'agent' ? 'is-unused' : ''}">${escapeHtml(registerRole)}</span></td>
      <td>${escapeHtml(boundAgentName || '不绑定')}</td>
      <td>${isAgentInvite ? '<span class="invite-badge is-unused">是</span>' : '<span class="invite-badge">否</span>'}</td>
      <td><span class="invite-badge ${invite.active ? 'is-active' : 'is-inactive'}">${invite.active ? '可用' : '已停用'}</span></td>
      <td><span class="invite-badge ${inviteUsed ? 'is-used' : 'is-unused'}">${inviteUsed ? '已使用' : '未使用'}</span></td>
      <td>${usedCount} / ${maxUses}</td>
      <td>${escapeHtml(usedBy || '暂无')}${invite.ownerAgentId ? '<br><small>代理生成</small>' : ''}</td>
      <td class="actions">
        <button data-invite-action="copy">复制</button>
        <button data-invite-action="toggle">${invite.active ? '停用' : '启用'}</button>
        <button data-invite-action="delete" class="danger">删除</button>
      </td>
    `;
    tr.dataset.inviteCode = invite.code || '';
    tr.dataset.inviteActive = invite.active ? '1' : '0';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-invite-action]').forEach((button) => {
    button.onclick = () => {
      const row = button.closest('tr');
      const code = row.dataset.inviteCode;
      const action = button.dataset.inviteAction;
      if (action === 'copy') copyText(code);
      if (action === 'toggle') toggleInvite(code, row.dataset.inviteActive !== '1').catch((error) => setStatus(error.message, true));
      if (action === 'delete') deleteInvite(code).catch((error) => setStatus(error.message, true));
    };
  });
}

function renderStats() {
  $('statPages').textContent = Object.keys(state.config.pages || {}).length;
  $('statTabs').textContent = (state.config.toolbox_tabs || []).length;
  $('statButtons').textContent = state.buttons.length;
}

function renderNotices() {
  const list = $('noticeList');
  if (!list) return;
  const title = $('noticeAreaTitle');
  if (title) title.textContent = state.system?.locations?.noticeAreaTitle || '全部未读';
  const unread = state.notices.filter((item) => !item.read).length;
  const totalUnread = unread;
  const badge = $('noticeUnreadBadge');
  if (badge) {
    badge.textContent = String(totalUnread);
    badge.hidden = totalUnread <= 0;
  }
  const bell = $('noticeBellBtn');
  if (bell) {
    bell.classList.toggle('has-unread', totalUnread > 0);
    bell.title = totalUnread > 0 ? `通知：${totalUnread} 条提醒` : '通知';
  }
  if (!state.notices.length) {
    list.textContent = '暂无通知';
    return;
  }
  list.innerHTML = state.notices.map((notice) => `
    <div class="notice-item ${notice.read ? 'is-read' : ''}" data-notice-id="${escapeAttr(notice.id || '')}" data-order-id="${escapeAttr(orderIdFromNotice(notice))}">
      <div class="notice-item-head">
        <strong>${escapeHtml(notice.title || '通知')}</strong>
        ${isSuper() ? '<div class="notice-item-actions"><button class="notice-mail-one" type="button">邮箱推送</button><button class="notice-delete-one" type="button">删除</button></div>' : ''}
      </div>
      <p>${escapeHtml(notice.content || '')}</p>
      <small>${escapeHtml(noticeAuthorName(notice))} · ${escapeHtml(formatDateTime(notice.createdAt))}</small>
    </div>
  `).join('');
  list.querySelectorAll('.notice-item').forEach((item) => {
    item.onclick = (event) => {
      if (event.target.closest('.notice-delete-one, .notice-mail-one')) return;
      openNoticeItem(item.dataset.noticeId, item.dataset.orderId).catch((error) => setStatus(error.message, true));
    };
  });
  list.querySelectorAll('.notice-delete-one').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const id = button.closest('.notice-item')?.dataset.noticeId;
      deleteNotice(id).catch((error) => setStatus(error.message, true));
    };
  });
  list.querySelectorAll('.notice-mail-one').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const id = button.closest('.notice-item')?.dataset.noticeId;
      sendNoticeMail(id).catch((error) => setStatus(error.message, true));
    };
  });
}

function closeNoticeDropdown() {
  const box = $('noticeDropdown');
  if (box) box.hidden = true;
}

function setupNoticeDropdownDismiss() {
  document.addEventListener('click', (event) => {
    const box = $('noticeDropdown');
    if (!box || box.hidden) return;
    if (event.target.closest('.notice-tools')) return;
    box.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNoticeDropdown();
  });
}

function orderIdFromNotice(notice) {
  const text = `${notice?.title || ''} ${notice?.content || ''}`;
  const match = text.match(/order_[A-Za-z0-9_]+/);
  return match ? match[0] : '';
}

async function openNoticeItem(noticeId, orderId = '') {
  if (noticeId) await markNoticeRead(noticeId);
  if (orderId && isSuper()) {
    const box = $('noticeDropdown');
    if (box) box.hidden = true;
    await jumpToOrder(orderId);
  }
}

function ensureUnreadNoticePopup() {
  let overlay = $('unreadNoticeOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'unreadNoticeOverlay';
  overlay.className = 'modal-overlay notice-popup-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal-card unread-notice-card" role="dialog" aria-modal="true" aria-labelledby="unreadNoticeTitle">
      <div class="unread-notice-top">
        <span class="unread-notice-icon">!</span>
        <span class="unread-notice-pill">未读</span>
      </div>
      <h2 id="unreadNoticeTitle"></h2>
      <small id="unreadNoticeMeta"></small>
      <div id="unreadNoticeContent" class="unread-notice-content"></div>
      <div class="unread-notice-actions">
        <button id="unreadNoticeLaterBtn" type="button">稍后再看</button>
        <button id="unreadNoticeOrderBtn" type="button" hidden>查看订单</button>
        <button id="unreadNoticeReadBtn" type="button">标记已读</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  $('unreadNoticeLaterBtn').onclick = () => { overlay.hidden = true; };
  $('unreadNoticeOrderBtn').onclick = () => {
    const noticeId = overlay.dataset.noticeId || '';
    const orderId = overlay.dataset.orderId || '';
    overlay.hidden = true;
    openNoticeItem(noticeId, orderId).catch((error) => setStatus(error.message, true));
  };
  $('unreadNoticeReadBtn').onclick = () => markNoticeRead(overlay.dataset.noticeId)
    .then(() => { overlay.hidden = true; showUnreadNoticePopup(); })
    .catch((error) => setStatus(error.message, true));
  return overlay;
}

function showUnreadNoticePopup() {
  const notice = state.notices.find((item) => !item.read && !state.noticePopupShownIds.has(item.id));
  if (!notice) return;
  state.noticePopupShownIds.add(notice.id);
  const overlay = ensureUnreadNoticePopup();
  overlay.dataset.noticeId = notice.id || '';
  overlay.dataset.orderId = orderIdFromNotice(notice);
  $('unreadNoticeTitle').textContent = notice.title || '通知';
  $('unreadNoticeMeta').textContent = `${noticeAuthorName(notice)} · ${formatDateTime(notice.createdAt)}`;
  $('unreadNoticeContent').textContent = notice.content || '';
  const orderButton = $('unreadNoticeOrderBtn');
  if (orderButton) orderButton.hidden = !overlay.dataset.orderId || !isSuper();
  overlay.hidden = false;
}

function renderSystemSettings() {
  if (!isSuper() || !state.system) return;
  const locations = state.system.locations || {};
  const agent = state.system.agent || {};
  const pay = state.system.pay || {};
  const integrity = state.system.integrity || {};
  if ($('systemNoticeTitle')) $('systemNoticeTitle').value = locations.noticeAreaTitle || '全部未读';
  if ($('systemMenuName')) $('systemMenuName').value = locations.adminSystemName || '系统管理';
  if ($('systemFrontendGlow')) $('systemFrontendGlow').checked = locations.frontendActiveGlow !== false;
  if ($('systemFrontendGroupCount')) $('systemFrontendGroupCount').checked = locations.frontendShowGroupCount !== false;
  if ($('integrityEnabled')) $('integrityEnabled').checked = integrity.enabled !== false;
  if ($('integrityTokenTtl')) $('integrityTokenTtl').value = Number(integrity.tokenTtlMinutes || 10080);
  if ($('integrityRotateSecret')) $('integrityRotateSecret').checked = false;
  if ($('agentInvitePrice')) $('agentInvitePrice').value = Number(agent.invitePrice || 0);
  if ($('agentCurrency')) $('agentCurrency').value = agent.currency || 'CNY';
  if ($('agentOrderCooldown')) $('agentOrderCooldown').value = Number(agent.orderCooldownMinutes ?? 30);
  if ($('agentAllowNegative')) $('agentAllowNegative').checked = !!agent.allowNegativeBalance;
  if ($('payWechatChannel')) $('payWechatChannel').value = pay.wechatChannel || 'disabled';
  if ($('payAlipayChannel')) $('payAlipayChannel').value = pay.alipayChannel || 'disabled';
  if ($('payWechatOrder')) $('payWechatOrder').value = Number(pay.wechatOrder || 10);
  if ($('payAlipayOrder')) $('payAlipayOrder').value = Number(pay.alipayOrder || 20);
  renderPayGatewayCards();
  renderOrders();
}

function renderPopupSettings() {
  if (!state.config) return;
  const popup = ensurePopupSettings();
  if ($('popupEnabled')) $('popupEnabled').checked = popup.enabled === true;
  if ($('popupClickCount')) $('popupClickCount').value = Number(popup.clickCount || 3);
  if ($('popupCacheMinutes')) $('popupCacheMinutes').value = Number(popup.cacheMinutes ?? 60);
  if ($('popupTitle')) $('popupTitle').value = popup.title || '联系我们 / 支持作者';
  if ($('popupThanksText')) $('popupThanksText').value = popup.thanksText || '感谢你的支持，我们会持续维护和更新工具箱。';
  renderPopupConfigLists();
}

function ensurePopupSettings() {
  if (!state.config) return { contacts: [], payments: [], links: [] };
  if (!state.config.popup || typeof state.config.popup !== 'object') {
    state.config.popup = {};
  }
  const popup = state.config.popup;
  if (!Array.isArray(popup.contacts)) popup.contacts = [];
  if (!Array.isArray(popup.payments)) popup.payments = [];
  if (!Array.isArray(popup.links)) popup.links = [];
  return popup;
}

function popupItems(kind) {
  const popup = ensurePopupSettings();
  const key = kind === 'contact' ? 'contacts' : (kind === 'payment' ? 'payments' : 'links');
  if (!Array.isArray(popup[key])) popup[key] = [];
  return popup[key];
}

function popupListId(kind) {
  return kind === 'contact' ? 'popupContactRows' : (kind === 'payment' ? 'popupPaymentRows' : 'popupLinkRows');
}

function newPopupItem(kind) {
  const nextSort = popupItems(kind).length + 1;
  if (kind === 'link') {
    return { title: '', description: '', url: '', buttonText: '打开链接', enabled: true, sort: nextSort };
  }
  return { title: '', description: '', image: '', enabled: true, sort: nextSort, buttonText: '', buttonUrl: '' };
}

function addPopupItem(kind) {
  if (!state.config) return;
  popupItems(kind).push(newPopupItem(kind));
  renderPopupConfigLists();
}

function deletePopupItem(kind, index) {
  popupItems(kind).splice(index, 1);
  renderPopupConfigLists();
}

function renderPopupConfigLists() {
  renderPopupQrList('contact');
  renderPopupQrList('payment');
  renderPopupLinkList();
}

function renderPopupQrList(kind) {
  const wrap = $(popupListId(kind));
  if (!wrap || !state.config) return;
  const rows = popupItems(kind);
  if (!rows.length) {
    wrap.innerHTML = '<div class="popup-empty">暂无内容，点击右上角新增。</div>';
    return;
  }
  wrap.innerHTML = rows.map((item, index) => `
    <div class="popup-config-row" data-popup-kind="${kind}" data-popup-index="${index}">
      <div class="popup-config-fields">
        <label>标题<input data-popup-field="title" value="${escapeAttr(item.title || '')}" placeholder="例如：微信联系"></label>
        <label>排序<input data-popup-field="sort" type="number" step="1" value="${Number(item.sort || index + 1)}"></label>
        <label class="toggle-line">是否启用<span><input data-popup-field="enabled" type="checkbox" ${item.enabled !== false ? 'checked' : ''}> 启用</span></label>
        <label class="wide">说明<textarea data-popup-field="description" rows="2" placeholder="扫码添加微信">${escapeHtml(item.description || '')}</textarea></label>
        <label>图床图片地址<input data-popup-field="image" value="${escapeAttr(item.image || '')}" placeholder="https://example.com/qrcode.png"></label>
        <label>按钮文字<input data-popup-field="buttonText" value="${escapeAttr(item.buttonText || '')}" placeholder="可选，例如：打开官网"></label>
        <label>按钮链接<input data-popup-field="buttonUrl" value="${escapeAttr(item.buttonUrl || '')}" placeholder="可选，仅支持 http/https"></label>
      </div>
      <div class="popup-preview">
        ${item.image ? `<img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.title || '二维码预览')}">` : '<span>未上传图片</span>'}
      </div>
      <div class="popup-row-actions">
        <button data-popup-delete type="button" class="danger">删除</button>
      </div>
    </div>
  `).join('');
  bindPopupRows(wrap);
}

function renderPopupLinkList() {
  const wrap = $('popupLinkRows');
  if (!wrap || !state.config) return;
  const rows = popupItems('link');
  if (!rows.length) {
    wrap.innerHTML = '<div class="popup-empty">暂无链接，点击右上角新增。</div>';
    return;
  }
  wrap.innerHTML = rows.map((item, index) => `
    <div class="popup-config-row" data-popup-kind="link" data-popup-index="${index}">
      <div class="popup-config-fields">
        <label>链接名称<input data-popup-field="title" value="${escapeAttr(item.title || '')}" placeholder="例如：官方网站"></label>
        <label>排序<input data-popup-field="sort" type="number" step="1" value="${Number(item.sort || index + 1)}"></label>
        <label class="toggle-line">是否启用<span><input data-popup-field="enabled" type="checkbox" ${item.enabled !== false ? 'checked' : ''}> 启用</span></label>
        <label class="wide">链接说明<textarea data-popup-field="description" rows="2" placeholder="访问软件官网">${escapeHtml(item.description || '')}</textarea></label>
        <label>URL 地址<input data-popup-field="url" value="${escapeAttr(item.url || '')}" placeholder="https://example.com"></label>
        <label>按钮文字<input data-popup-field="buttonText" value="${escapeAttr(item.buttonText || '打开链接')}" placeholder="打开官网"></label>
      </div>
      <div class="popup-row-actions">
        <button data-popup-delete type="button" class="danger">删除</button>
      </div>
    </div>
  `).join('');
  bindPopupRows(wrap);
}

function bindPopupRows(wrap) {
  wrap.querySelectorAll('[data-popup-field]').forEach((input) => {
    input.oninput = () => updatePopupItemFromInput(input);
    input.onchange = () => updatePopupItemFromInput(input);
  });
  wrap.querySelectorAll('[data-popup-delete]').forEach((button) => {
    button.onclick = () => {
      const row = button.closest('[data-popup-kind]');
      const kind = row?.dataset.popupKind;
      const index = Number(row?.dataset.popupIndex || 0);
      if (!confirm('确定删除这条配置吗？')) return;
      deletePopupItem(kind, index);
    };
  });
}

function updatePopupItemFromInput(input) {
  const row = input.closest('[data-popup-kind]');
  if (!row) return;
  const kind = row.dataset.popupKind;
  const index = Number(row.dataset.popupIndex || 0);
  const item = popupItems(kind)[index];
  if (!item) return;
  const field = input.dataset.popupField;
  if (input.type === 'checkbox') item[field] = input.checked;
  else if (input.type === 'number') item[field] = Number(input.value || 0);
  else item[field] = input.value.trim();
  if (field === 'image') {
    const preview = row.querySelector('.popup-preview');
    if (preview) preview.innerHTML = item.image ? `<img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.title || '二维码预览')}">` : '<span>未上传图片</span>';
  }
}

function collectPopupRows(kind) {
  return popupItems(kind).map((item, index) => {
    const base = {
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      enabled: item.enabled !== false,
      sort: Number(item.sort || index + 1)
    };
    if (kind === 'link') {
      return {
        ...base,
        url: String(item.url || '').trim(),
        buttonText: String(item.buttonText || '打开链接').trim() || '打开链接'
      };
    }
    return {
      ...base,
      image: String(item.image || '').trim(),
      buttonText: String(item.buttonText || '').trim(),
      buttonUrl: String(item.buttonUrl || '').trim()
    };
  });
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function validatePopupRows(rows, kind) {
  const kindName = kind === 'contact' ? '联系方式' : (kind === 'payment' ? '收款码' : '相关链接');
  rows.forEach((row, index) => {
    const label = row.title || `${kindName}${index + 1}`;
    if (kind === 'link') {
      if (row.url && !isHttpUrl(row.url)) {
        throw new Error(`${label} 的链接必须是 http:// 或 https:// 开头。`);
      }
      return;
    }
    if (row.image && !isHttpUrl(row.image)) {
      throw new Error(`${label} 的图片地址必须是图床外链，且以 http:// 或 https:// 开头。`);
    }
    if (row.buttonUrl && !isHttpUrl(row.buttonUrl)) {
      throw new Error(`${label} 的按钮链接必须是 http:// 或 https:// 开头。`);
    }
  });
}

function collectPopupSettings() {
  const contacts = collectPopupRows('contact');
  const payments = collectPopupRows('payment');
  const links = collectPopupRows('link');
  validatePopupRows(contacts, 'contact');
  validatePopupRows(payments, 'payment');
  validatePopupRows(links, 'link');
  return {
    enabled: $('popupEnabled')?.checked || false,
    clickCount: Number($('popupClickCount')?.value || 3),
    cacheMinutes: Number($('popupCacheMinutes')?.value || 60),
    title: $('popupTitle')?.value.trim() || '联系我们 / 支持作者',
    thanksText: $('popupThanksText')?.value.trim() || '感谢你的支持，我们会持续维护和更新工具箱。',
    contacts,
    payments,
    links
  };
}

async function savePopupSettings(sectionName = '联系方式') {
  state.config = await api(isTemplateMode() ? '/api/super/template/popup' : '/api/admin/popup', {
    method: 'PATCH',
    body: JSON.stringify(collectPopupSettings())
  });
  renderPopupSettings();
  if ($('jsonEditor') && canViewJson()) $('jsonEditor').value = JSON.stringify(state.config, null, 2);
  setStatus(`${sectionName}已保存。`);
}

function renderTemplateControls() {
  const status = $('templateStatus');
  if (!status) return;
  const editing = isTemplateMode();
  status.textContent = editing ? '正在编辑新用户配置模板' : '当前编辑用户配置';
  const editButton = $('editTemplateBtn');
  if (editButton) editButton.textContent = editing ? '退出模板编辑' : '进入模板编辑';
  const copyButton = $('copyCurrentToTemplateBtn');
  if (copyButton) copyButton.disabled = editing;
  const downloadButton = $('downloadCurrentClientBtn');
  if (downloadButton) {
    downloadButton.disabled = editing;
    downloadButton.textContent = editing ? '模板不能下载工具箱' : '下载当前用户工具箱';
  }
}

function clientPreviewMarkup(type) {
  if (type === 'original') {
    return `
      <div class="client-preview original-preview">
        <div class="preview-window-bar"><span>工具箱</span><i></i><i></i><i></i></div>
        <div class="original-preview-body">
          <aside>
            <b>Y</b>
            <em>系统工具</em>
            <em>软件资源</em>
            <em>常用链接</em>
            <em>设置</em>
          </aside>
          <main>
            <h4>工具箱</h4>
            <div class="original-button-grid">
              ${Array.from({ length: 12 }).map((_, index) => `<span>${['控制面板', '设备管理', '系统清理', '运行命令'][index % 4]}</span>`).join('')}
            </div>
          </main>
        </div>
      </div>`;
  }
  if (type === 'tuner') {
    return `
      <div class="client-preview tuner-preview">
        <div class="preview-window-bar tuner-window-bar"><span>\u8c03\u97f3\u5e08\u5de5\u5177\u7bb1\u7b80\u7ea6\u7248</span><i></i><i></i><i></i></div>
        <div class="tuner-preview-body">
          <aside>
            <div class="tuner-brand"><b>Y</b><strong>\u5c11\u5e74\u97f3\u9891\u8d44\u6e90\u7f51</strong><small>\u8c03\u97f3\u5e08\u5de5\u5177\u7bb1</small></div>
            <em class="active">\u8c03\u97f3\u5de5\u5177</em>
            <em>\u673a\u67b6\u5bbf\u4e3b</em>
            <em>\u63d2\u4ef6\u4e2d\u5fc3</em>
            <em>\u7cfb\u7edf\u5de5\u5177</em>
          </aside>
          <main>
            <section class="tuner-section">
              <h4><span>?</span> \u8c03\u97f3\u5de5\u5177 <b>?</b></h4>
              <div class="tuner-buttons"><span>Studio Pro</span><span>\u767e\u5ea6</span><span>\u63d2\u4ef6\u68c0\u67e5</span><span>\u58f0\u5361\u9a71\u52a8</span><span>\u5e38\u7528\u8f6f\u4ef6</span><span>\u5e38\u7528\u7f51\u7ad9</span></div>
            </section>
            <div class="tuner-status"><span>? \u5df2\u540c\u6b65</span><time>12:30:26</time></div>
          </main>
        </div>
      </div>`;
  }
  if (type === 'portal') {
    return `
      <div class="client-preview portal-preview">
        <div class="preview-window-bar"><span>143</span><i></i><i></i><i></i></div>
        <div class="portal-preview-body">
          <aside>
            <b>Y</b>
            <em>首页</em>
            <em>软件中心</em>
            <em>调试常用</em>
            <em>新导航</em>
          </aside>
          <main>
            <div class="portal-hero"><strong>143</strong><span>213</span></div>
            <h4>远程调试工具12</h4>
            <div class="portal-card"><b>⌂</b><strong>新工具</strong><span>打开</span></div>
          </main>
        </div>
      </div>`;
  }
  return `
    <div class="client-preview studio-preview">
      <div class="preview-window-bar"><span>调音师工具箱</span><i></i><i></i><i></i></div>
      <div class="studio-preview-body">
        <aside>
          <b>X</b>
          <em>调音工具</em>
          <em>软件资源</em>
          <em>声卡驱动</em>
          <em>常用链接</em>
        </aside>
        <main>
          <h4>系统优化</h4>
          <div class="studio-button-grid">
            ${Array.from({ length: 15 }).map((_, index) => `<span>${['程序禁网', 'Hosts管理', '重置插件', '插件列表', '插件清理'][index % 5]}</span>`).join('')}
          </div>
          <h4>常用工具</h4>
          <div class="studio-small-row"><span>系统清理</span><span>运行库</span></div>
        </main>
      </div>
    </div>`;
}

function renderClientVariants() {
  const grid = $('clientVariantGrid');
  if (!grid) return;
  const editing = isTemplateMode();
  grid.innerHTML = CLIENT_VARIANTS.map((variant) => `
    <article class="client-variant-card" data-client-variant="${escapeAttr(variant.id)}">
      ${clientPreviewMarkup(variant.preview)}
      <div class="client-variant-info">
        <div>
          <strong>${escapeHtml(variant.label)}</strong>
          <span>${escapeHtml(variant.badge)}</span>
        </div>
        <p>${escapeHtml(variant.description)}</p>
        <button type="button" data-action="download-client-variant" data-variant="${escapeAttr(variant.id)}" ${editing ? 'disabled' : ''}>
          ${editing ? '模板不能下载' : '下载这个版本'}
        </button>
      </div>
    </article>
  `).join('');
  grid.querySelectorAll('[data-action="download-client-variant"]').forEach((button) => {
    button.onclick = () => downloadClient('', button.dataset.variant || 'original').catch((error) => setStatus(error.message, true));
  });
}

function renderOrders() {
  const tbody = $('orderRows');
  if (!tbody) return;
  const orders = state.orders || [];
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6">暂无订单</td></tr>';
    return;
  }
  const paymentLabels = { balance: '余额支付', manual: '人工审核', interface: '接口支付' };
  const orderStatusLabels = { pending: '待处理', paid: '已支付', done: '已处理', cancelled: '已取消' };
  tbody.innerHTML = orders.map((order) => `
    <tr data-order-id="${escapeAttr(order.id || '')}" data-order-agent-id="${escapeAttr(order.agentId || '')}">
      <td>${escapeHtml(order.id || '')}<br><small>${escapeHtml(formatDateTime(order.createdAt))}</small></td>
      <td>${escapeHtml(order.agentDisplayName || userNameFromId(order.agentId, order.agentUsername || ''))}</td>
      <td>${Number(order.amount || 0).toFixed(2)} ${escapeHtml(order.currency || 'CNY')}</td>
      <td>${escapeHtml(orderStatusLabels[order.status] || order.status || '待处理')}</td>
      <td>
        ${escapeHtml(order.detail || order.action || '')}
        ${order.paymentMethod ? `<br><small>${escapeHtml(paymentLabels[order.paymentMethod] || order.paymentMethod)}${order.paymentChannel ? ` / ${escapeHtml(order.paymentChannel)}` : ''}</small>` : ''}
        ${(order.fulfilledInviteCodes || []).length ? `<br><small>已生成：${escapeHtml(order.fulfilledInviteCodes.join('，'))}</small>` : ''}
        ${order.fulfilledAt ? `<br><small>生成时间：${escapeHtml(formatDateTime(order.fulfilledAt))}</small>` : ''}
      </td>
      <td class="actions">
        <button data-order-status="done" type="button">已处理</button>
        <button data-order-status="cancelled" class="danger" type="button">取消</button>
        <button data-order-delete class="danger" type="button">删除</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-order-status]').forEach((button) => {
    button.onclick = () => updateOrderStatus(button.closest('tr')?.dataset.orderId, button.dataset.orderStatus)
      .catch((error) => setStatus(error.message, true));
  });
  tbody.querySelectorAll('[data-order-delete]').forEach((button) => {
    button.onclick = () => deleteOrder(button.closest('tr')?.dataset.orderId)
      .catch((error) => setStatus(error.message, true));
  });
}

const PAY_GATEWAYS = [
  {
    key: 'alipayOfficial',
    title: '支付宝官方',
    enableText: '启用支付宝官方',
    saveText: '保存支付宝官方',
    route: 'alipay',
    fields: [
      ['appId', '支付宝 APPID'],
      ['notifyUrl', '支付宝回调地址'],
      ['privateKey', '支付宝应用私钥', 'textarea'],
      ['publicKey', '支付宝公钥', 'textarea']
    ]
  },
  {
    key: 'wechatOfficial',
    title: '微信企业支付',
    enableText: '启用微信官方',
    saveText: '保存微信官方',
    route: 'wechat',
    fields: [
      ['appId', '微信 APPID'],
      ['mchId', '微信商户号'],
      ['apiV3Key', '微信 API v3 Key'],
      ['serialNo', '微信证书序列号'],
      ['notifyUrl', '微信回调地址'],
      ['privateKey', '微信商户私钥', 'textarea']
    ]
  },
  {
    key: 'easypay',
    title: '易支付一',
    enableText: '启用易支付一',
    saveText: '保存易支付一',
    route: 'both',
    fields: [
      ['name', '易支付一名称'],
      ['apiUrl', 'API接口网址'],
      ['pid', '商户号 PID'],
      ['key', '商户密钥 Key'],
      ['pcScan', 'PC端扫码支付', 'checkbox']
    ]
  },
  {
    key: 'easypay2',
    title: '易支付二',
    enableText: '启用易支付二',
    saveText: '保存易支付二',
    route: 'both',
    fields: [
      ['name', '易支付二名称'],
      ['apiUrl', 'API接口网址'],
      ['pid', '商户号 PID'],
      ['key', '商户密钥 Key'],
      ['pcScan', 'PC端扫码支付', 'checkbox']
    ]
  }
];

function renderPayGatewayCards() {
  const wrap = $('payGatewayCards');
  if (!wrap || !state.system) return;
  const pay = state.system.pay || {};
  wrap.innerHTML = PAY_GATEWAYS.map((gateway) => {
    const data = pay[gateway.key] || {};
    const enabled = data.enabled === true || pay.wechatChannel === gateway.key || pay.alipayChannel === gateway.key;
    return `
    <div class="gateway-card collapsible-panel is-collapsed" data-pay-gateway="${escapeAttr(gateway.key)}" data-collapsible-panel data-default-collapsed="1">
      <div class="panel-head"><h2>${escapeHtml(gateway.title)}</h2></div>
      <div class="pay-gateway-body">
        <label class="pay-enable-line"><input data-pay-enabled type="checkbox" ${enabled ? 'checked' : ''}> ${escapeHtml(gateway.enableText)}</label>
        <div class="pay-gateway-grid">
          ${gateway.fields.map(([field, label, type]) => {
            const value = data[field];
            if (type === 'textarea') {
              return `<label class="pay-field pay-field-textarea">${escapeHtml(label)}<textarea data-pay-field="${field}" rows="3">${escapeHtml(value || '')}</textarea></label>`;
            }
            if (type === 'checkbox') {
              return `<label class="pay-check-line"><input data-pay-field="${field}" type="checkbox" ${value ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
            }
            return `<label class="pay-field">${escapeHtml(label)}<input data-pay-field="${field}" value="${escapeAttr(value || '')}"></label>`;
          }).join('')}
        </div>
        <div class="pay-gateway-actions">
          <button type="button" data-pay-save>${escapeHtml(gateway.saveText)}</button>
        </div>
      </div>
    </div>
  `;
  }).join('');
  wrap.querySelectorAll('[data-pay-gateway]').forEach((card) => {
    const syncRoutes = () => syncPayRoutesFromCards();
    card.querySelector('[data-pay-enabled]')?.addEventListener('change', syncRoutes);
    card.querySelector('[data-pay-save]')?.addEventListener('click', () => saveSystemSettings('pay').catch((error) => setStatus(error.message, true)));
  });
  syncPayRoutesFromCards();
  setupCollapsiblePanels();
}

function getPositions() {
  const positions = [];
  const pages = state.config.pages || {};
  const sidebar = Array.isArray(state.config.sidebar) ? state.config.sidebar : [];
  const addedPages = new Set();

  sidebar.forEach((item) => {
    const pageId = item?.id || '';
    const page = pages[pageId];
    if (!page || pageId === 'settings') return;
    addedPages.add(pageId);
    positions.push({
      value: `page:${pageId}`,
      scope: 'page',
      pageId,
      orderIndex: positions.length,
      label: `页面 / ${page.title || item.name || pageId}`,
      name: page.title || item.name || pageId,
      container: page
    });
  });

  Object.entries(pages).forEach(([pageId, page]) => {
    if (addedPages.has(pageId) || pageId === 'settings') return;
    positions.push({
      value: `page:${pageId}`,
      scope: 'page',
      pageId,
      orderIndex: positions.length,
      label: `页面 / ${page.title || pageId}`,
      name: page.title || pageId,
      container: page
    });
  });

  (state.config.toolbox_tabs || []).forEach((tab, index) => {
    positions.push({
      value: `toolbox:${index}`,
      scope: 'toolbox',
      tabIndex: index,
      orderIndex: positions.length,
      label: `系统工具 / ${tab.name || index + 1}`,
      name: tab.name || `系统工具 ${index + 1}`,
      container: tab
    });
  });

  return positions;
}

function ensureFeatureSettings() {
  if (!state.config.features || typeof state.config.features !== 'object' || Array.isArray(state.config.features)) {
    state.config.features = {};
  }
  if (state.config.features.software_catalog_enabled === undefined) {
    state.config.features.software_catalog_enabled = true;
  }
  return state.config.features;
}

function ensurePageLocks() {
  if (!state.config.page_locks || typeof state.config.page_locks !== 'object' || Array.isArray(state.config.page_locks)) {
    state.config.page_locks = {};
  }
  return state.config.page_locks;
}

function getLockablePages() {
  const rows = [{ id: 'software_catalog', title: '软件大全', type: '内置页面' }];
  const seen = new Set(rows.map((item) => item.id));
  const pages = state.config.pages || {};
  const sidebar = Array.isArray(state.config.sidebar) ? state.config.sidebar : [];

  if ((state.config.toolbox_tabs || []).length) {
    rows.push({ id: 'toolbox', title: '系统工具', type: '内置页面' });
    seen.add('toolbox');
  }

  const addPage = (pageId, page, fallbackName = '') => {
    if (!pageId || pageId === 'settings' || seen.has(pageId)) return;
    seen.add(pageId);
    rows.push({
      id: pageId,
      title: page?.title || page?.name || fallbackName || pageId,
      type: '自定义页面'
    });
  };

  sidebar.forEach((item) => {
    const pageId = item?.id || '';
    addPage(pageId, pages[pageId], item?.name || '');
  });
  Object.entries(pages).forEach(([pageId, page]) => addPage(pageId, page));
  return rows;
}

function ensurePageAccessPanel() {
  const view = $('view-overview');
  if (!view) return null;
  let panel = $('pageAccessPanel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'pageAccessPanel';
  panel.className = 'panel page-access-panel collapsible-panel is-collapsed';
  panel.dataset.collapsiblePanel = '';
  panel.dataset.defaultCollapsed = '1';
  panel.innerHTML = `
    <div class="panel-head">
      <h2>页面权限</h2>
      <button id="savePageAccessBtn" type="button">保存权限</button>
    </div>
    <div class="form-grid compact page-feature-grid">
      <label class="toggle-line">软件大全页面<span><input id="softwareCatalogEnabled" type="checkbox"> 显示</span></label>
    </div>
    <div class="table-wrap page-lock-wrap">
      <table class="page-lock-table">
        <thead><tr><th>页面</th><th>类型</th><th>访问限制</th><th>页面密码</th><th>状态</th></tr></thead>
        <tbody id="pageLockRows"></tbody>
      </table>
    </div>
    <p class="page-lock-note">开启上锁后，用户进入对应页面必须输入该页面的密码；密码留空表示不修改已保存密码。</p>
  `;
  const saveButton = panel.querySelector('#savePageAccessBtn');
  if (saveButton) saveButton.onclick = () => savePageAccess().catch((error) => setStatus(error.message, true));
  return panel;
}

function renderPageAccessControls() {
  const panel = ensurePageAccessPanel();
  if (!panel || !state.config) return;
  const features = ensureFeatureSettings();
  const locks = ensurePageLocks();
  const softwareEnabled = $('softwareCatalogEnabled');
  if (softwareEnabled) softwareEnabled.checked = features.software_catalog_enabled !== false;
  const tbody = $('pageLockRows');
  if (!tbody) return;
  tbody.innerHTML = getLockablePages().map((page) => {
    const lock = locks[page.id] && typeof locks[page.id] === 'object' ? locks[page.id] : {};
    const enabled = lock.enabled === true;
    const hasPassword = !!lock.password;
    return `
      <tr data-page-lock-id="${escapeAttr(page.id)}" data-page-lock-title="${escapeAttr(page.title)}">
        <td><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.id)}</small></td>
        <td>${escapeHtml(page.type)}</td>
        <td><label class="checkline"><input data-page-lock-enabled type="checkbox" ${enabled ? 'checked' : ''}> 必须输入密码</label></td>
        <td><input data-page-lock-password type="password" placeholder="${hasPassword ? '已设置，留空不修改' : '输入页面密码'}"></td>
        <td><span class="${hasPassword ? 'muted-pill' : 'danger-pill'}">${hasPassword ? '已设置密码' : '未设置密码'}</span></td>
      </tr>
    `;
  }).join('');
}

async function savePageAccess() {
  const features = ensureFeatureSettings();
  features.software_catalog_enabled = $('softwareCatalogEnabled')?.checked !== false;

  const locks = ensurePageLocks();
  let missingPasswordFor = '';
  document.querySelectorAll('[data-page-lock-id]').forEach((row) => {
    if (missingPasswordFor) return;
    const pageId = row.dataset.pageLockId || '';
    const title = row.dataset.pageLockTitle || pageId;
    const current = locks[pageId] && typeof locks[pageId] === 'object' ? locks[pageId] : {};
    const next = { ...current };
    const password = row.querySelector('[data-page-lock-password]')?.value.trim() || '';
    next.enabled = row.querySelector('[data-page-lock-enabled]')?.checked === true;
    next.title = title;
    if (password) next.password = password;
    if (next.enabled && !next.password) {
      missingPasswordFor = title;
      return;
    }
    locks[pageId] = next;
  });

  if (missingPasswordFor) {
    setStatus(`请先给「${missingPasswordFor}」填写页面密码。`, true);
    return;
  }

  await saveWholeConfig('页面权限已保存。');
}

function parsePositionValue(value) {
  const positions = getPositions();
  return positions.find((item) => item.value === value) || positions[0] || null;
}

function ensureSections(container) {
  if (!container.sections || !Array.isArray(container.sections)) {
    container.sections = [];
  }
  if (!container.sections.length) {
    container.sections.push({ title: '默认分组', buttons: [] });
  }
  container.sections.forEach((section) => {
    if (!Array.isArray(section.buttons)) section.buttons = [];
  });
  return container.sections;
}

function renderManageControls() {
  const scope = $('manageScope');
  if (!scope) return;

  const previous = scope.value;
  const positions = getPositions();
  scope.innerHTML = '';

  positions.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    scope.appendChild(opt);
  });

  if (positions.some((item) => item.value === previous)) {
    scope.value = previous;
  }

  scope.onchange = renderManagedSections;
  renderManagedSections();
}

function renderManagedSections() {
  const pos = parsePositionValue($('manageScope')?.value || '');
  const sectionSelect = $('manageSection');
  if (!pos || !sectionSelect) return;

  $('manageScopeName').value = pos.name || '';
  if ($('manageScopeOrder')) $('manageScopeOrder').value = Number(pos.orderIndex || 0) + 1;
  const previous = sectionSelect.value;
  const sections = ensureSections(pos.container);
  sectionSelect.innerHTML = '';

  sections.forEach((section, index) => {
    const opt = document.createElement('option');
    opt.value = String(index);
    opt.textContent = section.title || `默认分组 ${index + 1}`;
    sectionSelect.appendChild(opt);
  });

  if ([...sectionSelect.options].some((option) => option.value === previous)) {
    sectionSelect.value = previous;
  }

  sectionSelect.onchange = renderManagedSectionName;
  renderManagedSectionName();
}

function renderManagedSectionName() {
  const pos = parsePositionValue($('manageScope')?.value || '');
  if (!pos) return;
  const sectionIndex = Number($('manageSection').value || 0);
  const section = ensureSections(pos.container)[sectionIndex];
  $('manageSectionName').value = section ? (section.title || '') : '';
  if ($('manageSectionOrder')) $('manageSectionOrder').value = section ? sectionIndex + 1 : 1;
}

function renderSelectors() {
  const scope = $('addScope');
  scope.innerHTML = '';

  getPositions().forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    scope.appendChild(opt);
  });

  scope.onchange = renderSectionSelector;
  renderSectionSelector();
}

function renderSectionSelector() {
  const section = $('addSection');
  const target = currentAddTarget();
  section.innerHTML = '';

  const sections = target?.sections || [];
  sections.forEach((sec, index) => {
    const opt = document.createElement('option');
    opt.value = String(index);
    opt.textContent = sec.title || `默认分组 ${index + 1}`;
    section.appendChild(opt);
  });

  if (!sections.length) {
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = '默认分组';
    section.appendChild(opt);
  }
}

function currentAddTarget() {
  const raw = $('addScope').value;
  if (!raw) return null;
  const [scope, id] = raw.split(':');
  if (scope === 'toolbox') {
    return state.config.toolbox_tabs?.[Number(id)];
  }
  return state.config.pages?.[id];
}

function positionValueForButton(button) {
  return button.scope === 'toolbox' ? `toolbox:${button.tabIndex}` : `page:${button.pageId}`;
}

function positionOptionsHtml(selectedValue) {
  return getPositions().map((item) =>
    `<option value="${escapeAttr(item.value)}" ${item.value === selectedValue ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
  ).join('');
}

function sectionOptionsHtml(positionValue, selectedIndex = 0) {
  const pos = parsePositionValue(positionValue);
  const sections = ensureSections(pos?.container || {});
  return sections.map((section, index) =>
    `<option value="${index}" ${index === Number(selectedIndex || 0) ? 'selected' : ''}>${escapeHtml(section.title || `默认分组 ${index + 1}`)}</option>`
  ).join('');
}

function syncRowSectionOptions(row) {
  const scopeSelect = row.querySelector('[data-field="moveScope"]');
  const sectionSelect = row.querySelector('[data-field="moveSection"]');
  if (!scopeSelect || !sectionSelect) return;
  const previous = sectionSelect.value;
  sectionSelect.innerHTML = sectionOptionsHtml(scopeSelect.value, Number(previous || 0));
  if (![...sectionSelect.options].some((option) => option.value === previous)) {
    sectionSelect.value = '0';
  }
}

function selectedMoveTarget(row) {
  const raw = row.querySelector('[data-field="moveScope"]')?.value || '';
  const [scope, id] = raw.split(':');
  const sectionIndex = Number(row.querySelector('[data-field="moveSection"]')?.value || 0);
  if (scope === 'toolbox') {
    return {
      targetScope: 'toolbox',
      targetTabIndex: Number(id || 0),
      targetSectionIndex: sectionIndex
    };
  }
  return {
    targetScope: 'page',
    targetPageId: id,
    targetSectionIndex: sectionIndex
  };
}

function renderButtons() {
  const tbody = $('buttonRows');
  const query = ($('buttonSearch').value || '').trim().toLowerCase();
  ensureButtonSortUi();
  ensureButtonScriptHelpUi();
  ensureButtonFilters();
  renderButtonFilterOptions();
  const areaFilter = $('buttonAreaFilter')?.value || '';
  const sectionFilter = $('buttonSectionFilter')?.value || '';
  const actionFilter = $('buttonActionFilter')?.value || '';
  tbody.innerHTML = '';

  state.buttons
    .slice()
    .sort((a, b) =>
      String(a.scope || '').localeCompare(String(b.scope || '')) ||
      Number(a.areaOrder ?? 0) - Number(b.areaOrder ?? 0) ||
      Number(a.sectionOrder ?? a.sectionIndex ?? 0) - Number(b.sectionOrder ?? b.sectionIndex ?? 0) ||
      Number(a.sort ?? a.raw?.sort ?? 0) - Number(b.sort ?? b.raw?.sort ?? 0) ||
      Number(a.buttonIndex || 0) - Number(b.buttonIndex || 0)
    )
    .filter((button) => {
      const targetLabel = displayTarget(button);
      const actionLabel = ACTION_LABELS[button.action] || button.action;
      const stateLabel = button.enabled === false ? '停用 禁用 disabled' : '启用 enabled';
      const haystack = `${button.area} ${button.section} ${button.name} ${button.icon || ''} ${button.action} ${actionLabel} ${button.target} ${targetLabel} ${stateLabel}`.toLowerCase();
      if (areaFilter && button.area !== areaFilter) return false;
      if (sectionFilter && button.section !== sectionFilter) return false;
      if (actionFilter && button.action !== actionFilter) return false;
      return !query || haystack.includes(query);
    })
    .forEach((button) => {
      const tr = document.createElement('tr');
      renderButtonPreviewRow(tr, button);
      tbody.appendChild(tr);
    });
}

function renderButtonPreviewRow(tr, button) {
  const icon = button.icon || button.raw?.icon || '';
  const description = button.raw?.description || button.raw?.intro || button.raw?.remark || '';
  const isScript = button.action === 'script';
  const enabled = button.enabled !== false;
  tr.className = enabled ? '' : 'button-disabled-row';
  tr.innerHTML = `
    <td><strong>${escapeHtml(button.area || '')}</strong><small>${escapeHtml(button.section || '')}</small></td>
    <td>${escapeHtml(String(button.sort ?? button.raw?.sort ?? 0))}</td>
    <td>${escapeHtml(button.name || '')}</td>
    <td>${icon ? `<span class="icon-preview readonly-icon">${icon.startsWith('http') || icon.startsWith('/') ? `<img src="${escapeAttr(icon)}" alt="">` : escapeHtml(icon)}</span>` : '<span class="muted-action">无</span>'}</td>
    <td>${escapeHtml(description || '-')}</td>
    <td>${escapeHtml(ACTION_LABELS[button.action] || button.action || '')}</td>
    <td><span class="target-preview" title="${escapeAttr(displayTarget(button))}">${escapeHtml(displayTarget(button) || '-')}</span></td>
    <td class="actions">
      <button data-action="edit">编辑</button>
      <button data-action="toggle-enabled" class="${enabled ? 'danger' : ''}">${enabled ? '停用' : '启用'}</button>
      ${isScript ? '<span class="muted-action">内置功能不可删除</span>' : '<button class="danger" data-action="delete">删除</button>'}
    </td>
  `;
  tr.querySelector('[data-action="edit"]').onclick = () => renderButtonEditRow(tr, button);
  tr.querySelector('[data-action="toggle-enabled"]').onclick = () => toggleButtonEnabled(button);
  const deleteBtn = tr.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.onclick = () => deleteButton(button);
}

function renderButtonEditRow(tr, button) {
  const icon = button.icon || button.raw?.icon || '';
  const isScript = button.action === 'script';
  const enabled = button.enabled !== false;
  const moveScopeValue = positionValueForButton(button);
  tr.className = enabled ? 'button-edit-row' : 'button-edit-row button-disabled-row';
  tr.innerHTML = `
    <td>
      <select data-field="moveScope">${positionOptionsHtml(moveScopeValue)}</select>
      <select data-field="moveSection">${sectionOptionsHtml(moveScopeValue, button.sectionIndex)}</select>
    </td>
    <td><input class="sort-input" type="number" value="${escapeAttr(button.sort ?? button.raw?.sort ?? 0)}" data-field="sort" title="数字越小越靠前"></td>
    <td><input value="${escapeAttr(button.name || '')}" data-field="name"></td>
    <td>
      <div class="icon-field">
        <span class="icon-preview" title="${icon ? '图标预览，双击清空' : '暂无图标'}">${icon ? `<img src="${escapeAttr(icon)}" alt="">` : '<b>预览</b>'}</span>
        <input value="${escapeAttr(icon)}" data-field="icon" placeholder="图床图片链接">
      </div>
    </td>
    <td><input value="${escapeAttr(button.raw?.description || button.raw?.intro || button.raw?.remark || '')}" data-field="description" placeholder="鼠标悬停说明"></td>
    <td>
      <select data-field="action">
        ${ACTIONS.map(([action, label]) =>
          `<option value="${action}" ${action === button.action ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
    </td>
    <td>
      <span class="target-control">${targetControlHtml(button.action, button.target)}</span>
      <small class="target-note"></small>
    </td>
    <td class="actions">
      <button data-action="save">保存</button>
      <button data-action="cancel">取消</button>
      <button data-action="toggle-enabled" class="${enabled ? 'danger' : ''}">${enabled ? '停用' : '启用'}</button>
      ${isScript ? '<span class="muted-action">内置功能不可删除</span>' : '<button class="danger" data-action="delete">删除</button>'}
    </td>
  `;

  updateRowTargetState(tr, button);
  tr.querySelector('[data-field="moveScope"]').onchange = () => syncRowSectionOptions(tr);
  tr.querySelector('[data-field="action"]').onchange = () => updateRowTargetState(tr, button);
  tr.querySelector('[data-field="icon"]').oninput = () => updateIconPreview(tr);
  tr.querySelector('.icon-preview').ondblclick = () => {
    tr.querySelector('[data-field="icon"]').value = '';
    updateIconPreview(tr);
  };
  tr.querySelector('[data-action="save"]').onclick = () => saveButton(button, tr);
  tr.querySelector('[data-action="cancel"]').onclick = () => renderButtonPreviewRow(tr, button);
  tr.querySelector('[data-action="toggle-enabled"]').onclick = () => toggleButtonEnabled(button);
  const deleteBtn = tr.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.onclick = () => deleteButton(button);
}

function ensureButtonSortUi() {
  const addName = $('addName');
  if (addName && !$('addSort')) {
    const label = document.createElement('label');
    label.innerHTML = '排序<input id="addSort" type="number" value="0" placeholder="越小越靠前">';
    addName.closest('label')?.insertAdjacentElement('beforebegin', label);
  }

  const headRow = document.querySelector('#buttonRows')?.closest('table')?.querySelector('thead tr');
  if (headRow && !headRow.querySelector('[data-sort-head]')) {
    const th = document.createElement('th');
    th.dataset.sortHead = '1';
    th.textContent = '排序';
    const nameHead = headRow.children[1];
    headRow.insertBefore(th, nameHead || null);
  }
}

function ensureButtonScriptHelpUi() {
  const addAction = $('addAction');
  if (!addAction || $('buttonScriptHelp')) return;
  const grid = addAction.closest('.form-grid');
  if (!grid) return;
  grid.insertAdjacentHTML('afterend', scriptHelpHtml('buttonScriptHelp', true));
}

function ensureButtonFilters() {
  const search = $('buttonSearch');
  if (!search || $('buttonFilterBar')) return;
  const bar = document.createElement('div');
  bar.id = 'buttonFilterBar';
  bar.className = 'button-filters';
  const area = document.createElement('select');
  area.id = 'buttonAreaFilter';
  const section = document.createElement('select');
  section.id = 'buttonSectionFilter';
  const action = document.createElement('select');
  action.id = 'buttonActionFilter';
  bar.appendChild(area);
  bar.appendChild(section);
  bar.appendChild(action);
  search.parentElement.insertBefore(bar, search);
  bar.appendChild(search);
  [area, section, action].forEach((select) => {
    select.onchange = renderButtons;
  });
}

function renderButtonFilterOptions() {
  const area = $('buttonAreaFilter');
  const section = $('buttonSectionFilter');
  const action = $('buttonActionFilter');
  if (!area || !section || !action) return;
  fillFilterOptions(area, '全部位置', uniqueSorted(state.buttons.map((button) => button.area || '')));
  fillFilterOptions(section, '全部分组', uniqueSorted(state.buttons.map((button) => button.section || '')));
  fillFilterOptions(action, '全部动作', ACTIONS.map(([value, label]) => ({ value, label })));
}

function fillFilterOptions(select, allLabel, items) {
  const previous = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>`;
  items.forEach((item) => {
    const value = typeof item === 'string' ? item : item.value;
    const label = typeof item === 'string' ? item : item.label;
    if (!value) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label || value;
    select.appendChild(opt);
  });
  select.value = [...select.options].some((option) => option.value === previous) ? previous : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function updateIconPreview(row) {
  const input = row.querySelector('[data-field="icon"]');
  const preview = row.querySelector('.icon-preview');
  const url = input.value.trim();
  preview.title = url ? '图标预览，双击清空' : '暂无图标';
  preview.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="">` : '<b>预览</b>';
}

function displayTarget(button) {
  if (button.action === 'script') {
    const scriptId = normalizeScriptTarget(button.target);
    return SCRIPT_LABELS[scriptId] || (button.target ? `自定义：${button.target}` : '');
  }
  return button.target || '';
}

function scriptHelpHtml(id = '', hidden = false) {
  return `
    <div ${id ? `id="${id}" ` : ''}class="script-help-box" ${hidden ? 'hidden' : ''}>
      <strong>内置功能配置说明</strong>
      <p>新增按钮时，动作选择“内置功能”；需要自己写命令时，在内置功能下拉里选择第一项“自定义内置功能”，然后填写要执行的 Windows 命令。</p>
      <p>常用写法：打开程序填 <code>start "" "D:\\软件\\xxx.exe"</code>，打开控制面板项填 <code>control mmsys.cpl</code>，执行 PowerShell 填 <code>powershell -NoProfile -ExecutionPolicy Bypass -Command "你的命令"</code>。</p>
      <p>涉及服务、注册表、防火墙、系统更新等命令，客户端会按管理员权限执行；建议先用测试用户下载工具箱验证。</p>
    </div>
  `;
}

function scriptOptionsHtml(selected = '') {
  const selectedValue = normalizeScriptTarget(selected);
  const effectiveValue = selectedValue || SCRIPT_OPTIONS[0]?.value || '';
  const options = SCRIPT_OPTIONS.map(({ value, label }) =>
    `<option value="${escapeAttr(value)}" ${value === effectiveValue ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
  const customSelected = effectiveValue && !SCRIPT_LABELS[effectiveValue] ? 'selected' : '';
  return `<option value="${CUSTOM_SCRIPT_VALUE}" ${customSelected}>自定义内置功能</option><option value="" disabled>────────────</option>${options}`;
}

function targetControlHtml(action, target = '') {
  if (action === 'script') {
    const scriptId = normalizeScriptTarget(target);
    const effectiveScriptId = scriptId || SCRIPT_OPTIONS[0]?.value || '';
    const custom = effectiveScriptId && !SCRIPT_LABELS[effectiveScriptId];
    return `
      <div class="script-target-control">
        <select class="target-input" data-field="target">${scriptOptionsHtml(effectiveScriptId)}</select>
        <input class="target-input custom-script-input" data-field="custom-script" value="${custom ? escapeAttr(effectiveScriptId) : ''}" placeholder="输入要执行的命令" ${custom ? '' : 'hidden'}>
      </div>
    `;
  }
  return `<input class="target-input" value="${escapeAttr(target || '')}" data-field="target" title="${escapeAttr(target || '')}">`;
}

function updateRowTargetState(row, button) {
  const action = row.querySelector('[data-field="action"]').value;
  const holder = row.querySelector('.target-control');
  const note = row.querySelector('.target-note');
  const currentTarget = readRowTarget(row) || button.target || '';
  if (holder) holder.innerHTML = targetControlHtml(action, currentTarget);
  bindScriptTargetControl(row);
  if (note && action !== 'script') note.textContent = '';
}

function bindScriptTargetControl(root) {
  const select = root.querySelector('[data-field="target"]');
  const custom = root.querySelector('[data-field="custom-script"]');
  const note = root.querySelector('.target-note');
  if (!select || !custom || select.dataset.customReady) return;
  select.dataset.customReady = '1';
  const sync = () => {
    const isCustom = select.value === CUSTOM_SCRIPT_VALUE;
    custom.hidden = !isCustom;
    if (note) note.textContent = isCustom ? '自定义内置功能会直接执行下面填写的 Windows 命令。' : '';
    if (isCustom) custom.focus();
  };
  select.onchange = sync;
  sync();
}

function updateAddTargetState() {
  const action = $('addAction')?.value || 'link';
  const target = $('addTarget') || $('addScriptControl');
  if (!target) return;
  const label = target.closest('label');
  const help = $('buttonScriptHelp');
  if (action === 'script') {
    const selected = normalizeScriptTarget(readAddTarget()) || SCRIPT_OPTIONS[0]?.value || '';
    const custom = selected && !SCRIPT_LABELS[selected];
    label.innerHTML = `
      内置功能
      <div id="addScriptControl" class="script-target-control">
        <select id="addTarget">${scriptOptionsHtml(selected)}</select>
        <input id="addCustomScript" value="${custom ? escapeAttr(selected) : ''}" placeholder="输入要执行的命令" ${custom ? '' : 'hidden'}>
      </div>
    `;
    bindAddScriptTargetControl();
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = '内置功能';
  } else if (target.tagName === 'SELECT') {
    label.innerHTML = '网址 / 内容<input id="addTarget" placeholder="粘贴网页或下载地址">';
    if (help) help.hidden = true;
  } else if (target.id === 'addScriptControl') {
    label.innerHTML = '网址 / 内容<input id="addTarget" placeholder="粘贴网页或下载地址">';
    if (help) help.hidden = true;
  }
}

function bindAddScriptTargetControl() {
  const select = $('addTarget');
  const custom = $('addCustomScript');
  const help = $('buttonScriptHelp');
  if (!select || !custom) return;
  const sync = () => {
    const isCustom = select.value === CUSTOM_SCRIPT_VALUE;
    custom.hidden = !isCustom;
    if (help) help.hidden = !isCustom;
    if (isCustom) custom.focus();
  };
  select.onchange = sync;
  sync();
}

function readAddTarget() {
  if ($('addAction')?.value === 'script') {
    const select = $('addTarget');
    if (select?.value === CUSTOM_SCRIPT_VALUE) return $('addCustomScript')?.value.trim() || '';
    return select?.value.trim() || '';
  }
  return $('addTarget')?.value.trim() || '';
}

async function saveAppPatch(patch, message) {
  state.config = await api(appApiPath(), {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  await refreshButtons(message);
}

async function saveAppBasicSettings() {
  await saveAppPatch({
    title: $('appTitle').value.trim(),
    subtitle: $('appSubtitle').value.trim(),
    version: $('appVersion').value.trim(),
    theme: $('appTheme').value.trim(),
    theme_count: Math.max(1, Math.min(19, Number($('appThemeCount')?.value || 19))),
    allow_client_theme: $('appAllowClientTheme')?.checked !== false,
    default_view_mode: $('appDefaultViewMode')?.value === 'list' ? 'list' : 'grid',
    logo_text: $('appLogo').value.trim(),
    icon: $('appIcon').value.trim(),
    exe_icon: $('appExeIcon')?.value.trim() || '',
    window_width: Number($('appWidth').value || 1080),
    window_height: Number($('appHeight').value || 700)
  }, '基础信息已保存。');
}

async function saveAppLoginSettings() {
  if (state.currentUser?.role !== 'super') {
    setStatus('只有总管理员可以保存登录页设置。', true);
    return;
  }
  await saveAppPatch({
    admin_title: $('loginTitleInput')?.value.trim() || '工具箱后台登录',
    login_hint: $('loginHintInput').value.trim()
  }, '登录页设置已保存。');
}

async function saveAppPasswordSettings() {
  const passwordEnabled = $('appPasswordEnabled').checked;
  const newPassword = $('appPassword').value.trim();
  const hasExistingPassword = !!(state.config.app && state.config.app.password);

  if (passwordEnabled && !hasExistingPassword && !newPassword) {
    setStatus('开启工具箱密码时，请先填写新密码。', true);
    return;
  }

  const patch = {
    password_enabled: passwordEnabled
  };
  if (newPassword) patch.password = newPassword;
  await saveAppPatch(patch, '启动密码已保存。');
}

async function saveAppExeSettings() {
  await saveAppPatch({
    exe_title: $('appExeTitle')?.value.trim() || '',
    exe_description: $('appExeDescription')?.value.trim() || '',
    exe_product: $('appExeProduct')?.value.trim() || '',
    exe_company: $('appExeCompany')?.value.trim() || '',
    exe_copyright: $('appExeCopyright')?.value.trim() || '',
    exe_version: $('appExeVersion')?.value.trim() || ''
  }, 'EXE 属性已保存。');
}

async function saveAppUpdateSettings() {
  await saveAppPatch({
    update_url: $('appUpdateUrl')?.value.trim() || '',
    update_title: $('appUpdateTitle')?.value.trim() || '工具箱更新',
    update_button: $('appUpdateButton')?.value.trim() || '下载最新版'
  }, '更新入口已保存。');
}

async function saveApp() {
  await saveAppBasicSettings();
}

async function saveWholeConfig(message) {
  await api(configApiPath(), {
    method: 'PUT',
    body: JSON.stringify(state.config)
  });
  await reloadConfigAndButtons(message);
}

function newConfigId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`;
}

async function addPosition() {
  const name = $('newScopeName').value.trim();
  const type = $('newScopeType').value;
  if (!name) {
    setStatus('先填写新增位置名称。', true);
    return;
  }

  if (type === 'toolbox') {
    if (!Array.isArray(state.config.toolbox_tabs)) state.config.toolbox_tabs = [];
    state.config.toolbox_tabs.push({
      id: newConfigId('tab'),
      name,
      sections: [{ title: '默认分组', buttons: [] }]
    });
  } else {
    const id = newConfigId('page');
    if (!Array.isArray(state.config.sidebar)) state.config.sidebar = [];
    if (!state.config.pages || typeof state.config.pages !== 'object') state.config.pages = {};
    state.config.sidebar.push({ id, name });
    state.config.pages[id] = {
      title: name,
      sections: [{ title: '默认分组', buttons: [] }]
    };
  }

  $('newScopeName').value = '';
  await saveWholeConfig('位置已新增。');
}

async function renamePosition() {
  const pos = parsePositionValue($('manageScope').value);
  const name = $('manageScopeName').value.trim();
  if (!pos || !name) {
    setStatus('先选择位置并填写名称。', true);
    return;
  }

  if (pos.scope === 'toolbox') {
    state.config.toolbox_tabs[pos.tabIndex].name = name;
  } else {
    state.config.pages[pos.pageId].title = name;
    const sidebarItem = (state.config.sidebar || []).find((item) => item.id === pos.pageId);
    if (sidebarItem) sidebarItem.name = name;
  }

  await saveWholeConfig('位置名称已保存。');
}

function ensureSidebarOrder() {
  if (!Array.isArray(state.config.sidebar)) state.config.sidebar = [];
  if (!state.config.pages || typeof state.config.pages !== 'object') state.config.pages = {};
  const existing = new Set(state.config.sidebar.map((item) => item?.id).filter(Boolean));
  Object.entries(state.config.pages).forEach(([pageId, page]) => {
    if (pageId === 'settings' || existing.has(pageId)) return;
    state.config.sidebar.push({ id: pageId, name: page?.title || pageId });
    existing.add(pageId);
  });
  state.config.sidebar = state.config.sidebar.filter((item) => {
    const pageId = item?.id || '';
    return pageId && pageId !== 'settings' && state.config.pages[pageId];
  });
}

function moveArrayItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list) || fromIndex < 0 || fromIndex >= list.length) return false;
  const target = Math.max(0, Math.min(list.length - 1, toIndex));
  if (fromIndex === target) return false;
  const [item] = list.splice(fromIndex, 1);
  list.splice(target, 0, item);
  return true;
}

async function movePosition() {
  const selected = $('manageScope').value;
  const pos = parsePositionValue(selected);
  if (!pos) return;
  const desired = Math.max(1, Number($('manageScopeOrder')?.value || 1));

  if (pos.scope === 'toolbox') {
    const tabs = state.config.toolbox_tabs || [];
    if (!tabs.length) return;
    moveArrayItem(tabs, pos.tabIndex, desired - 1);
  } else {
    ensureSidebarOrder();
    const fromIndex = state.config.sidebar.findIndex((item) => item?.id === pos.pageId);
    moveArrayItem(state.config.sidebar, fromIndex, desired - 1);
  }

  await saveWholeConfig('页面位置已保存。');
  const scope = $('manageScope');
  if (scope) scope.value = selected;
  renderManageControls();
  renderSelectors();
}

async function deletePosition() {
  const pos = parsePositionValue($('manageScope').value);
  if (!pos) return;
  if (!confirm(`删除位置「${pos.name}」以及里面的所有按钮？`)) return;

  if (pos.scope === 'toolbox') {
    state.config.toolbox_tabs.splice(pos.tabIndex, 1);
  } else {
    delete state.config.pages[pos.pageId];
    state.config.sidebar = (state.config.sidebar || []).filter((item) => item.id !== pos.pageId);
  }

  await saveWholeConfig('位置已删除。');
}

async function addSection() {
  const pos = parsePositionValue($('manageScope').value);
  const name = $('newSectionName').value.trim() || '默认分组';
  if (!pos) return;

  ensureSections(pos.container).push({ title: name, buttons: [] });
  $('newSectionName').value = '';
  await saveWholeConfig('分组已新增。');
}

async function renameSection() {
  const pos = parsePositionValue($('manageScope').value);
  if (!pos) return;
  const sectionIndex = Number($('manageSection').value || 0);
  const section = ensureSections(pos.container)[sectionIndex];
  if (!section) return;

  section.title = $('manageSectionName').value.trim();
  await saveWholeConfig('分组名称已保存。');
}

async function moveSection() {
  const pos = parsePositionValue($('manageScope').value);
  if (!pos) return;
  const sections = ensureSections(pos.container);
  const fromIndex = Number($('manageSection').value || 0);
  const desired = Math.max(1, Math.min(sections.length, Number($('manageSectionOrder')?.value || fromIndex + 1)));
  if (fromIndex < 0 || fromIndex >= sections.length) return;
  moveArrayItem(sections, fromIndex, desired - 1);
  await saveWholeConfig('分组位置已保存。');
}

async function deleteSection() {
  const pos = parsePositionValue($('manageScope').value);
  if (!pos) return;
  const sections = ensureSections(pos.container);
  const sectionIndex = Number($('manageSection').value || 0);
  const section = sections[sectionIndex];
  if (!section) return;

  const title = section.title || `默认分组 ${sectionIndex + 1}`;
  const count = (section.buttons || []).length;
  if (!confirm(`删除分组「${title}」？里面有 ${count} 个按钮。`)) return;

  sections.splice(sectionIndex, 1);
  if (!sections.length) {
    sections.push({ title: '默认分组', buttons: [] });
  }

  await saveWholeConfig('分组已删除。');
}

async function addButton() {
  const [scope, id] = $('addScope').value.split(':');
  const name = $('addName').value.trim();
  const icon = $('addIcon').value.trim();
  const description = $('addDescription').value.trim();
  const sort = Number($('addSort')?.value || 0);
  const action = $('addAction').value;
  const target = readAddTarget();
  if (!name) {
    setStatus('请先填写按钮名称。', true);
    return;
  }
  if (!target && !description && !icon) {
    setStatus('请至少填写网址/内容、介绍或图标。', true);
    return;
  }
  const request = {
    scope,
    sectionIndex: Number($('addSection').value || 0),
    button: {
      name,
      sort,
      icon,
      description,
      action,
      target,
      enabled: true
    }
  };

  if (scope === 'toolbox') request.tabIndex = Number(id);
  else request.pageId = id;

  await api(buttonsApiPath(), {
    method: 'POST',
    body: JSON.stringify(request)
  });

  $('addName').value = '';
  if ($('addSort')) $('addSort').value = '0';
  $('addIcon').value = '';
  $('addDescription').value = '';
  $('addTarget').value = '';
  await reloadConfigAndButtons('按钮已新增。');
}

async function saveButton(ref, row) {
  const request = {
    id: ref.id,
    scope: ref.scope,
    pageId: ref.pageId,
    tabIndex: ref.tabIndex,
    sectionIndex: ref.sectionIndex,
    buttonIndex: ref.buttonIndex,
    ...selectedMoveTarget(row),
    button: {
      name: row.querySelector('[data-field="name"]').value.trim(),
      sort: Number(row.querySelector('[data-field="sort"]')?.value || 0),
      icon: row.querySelector('[data-field="icon"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      action: row.querySelector('[data-field="action"]').value,
      target: readRowTarget(row),
      enabled: ref.enabled !== false
    }
  };

  await api(buttonsApiPath(), {
    method: 'PATCH',
    body: JSON.stringify(request)
  });
  await reloadConfigAndButtons('按钮已保存。');
}

function readRowTarget(row) {
  const action = row.querySelector('[data-field="action"]').value;
  const target = row.querySelector('[data-field="target"]');
  if (action === 'script') {
    if (target.value === CUSTOM_SCRIPT_VALUE) {
      return row.querySelector('[data-field="custom-script"]')?.value.trim() || '';
    }
    return target.value.trim();
  }
  return target.value.trim();
}

async function toggleButtonEnabled(ref) {
  const nextEnabled = ref.enabled === false;
  const request = {
    id: ref.id,
    scope: ref.scope,
    pageId: ref.pageId,
    tabIndex: ref.tabIndex,
    sectionIndex: ref.sectionIndex,
    buttonIndex: ref.buttonIndex,
    targetScope: ref.scope,
    targetPageId: ref.pageId,
    targetTabIndex: ref.tabIndex,
    targetSectionIndex: ref.sectionIndex,
    button: {
      name: ref.name || '',
      sort: Number(ref.sort ?? ref.raw?.sort ?? 0),
      icon: ref.icon || ref.raw?.icon || '',
      description: ref.raw?.description || ref.raw?.intro || ref.raw?.remark || '',
      action: ref.action || 'link',
      target: ref.target || '',
      enabled: nextEnabled
    }
  };

  await api(buttonsApiPath(), {
    method: 'PATCH',
    body: JSON.stringify(request)
  });
  await reloadConfigAndButtons(nextEnabled ? '按钮已启用。' : '按钮已停用。');
}

async function deleteButton(ref) {
  if (ref.action === 'script') {
    setStatus('内置功能不能删除，只能停用。', true);
    return;
  }
  if (!confirm(`删除按钮「${ref.name}」？`)) return;

  await api(buttonsApiPath(), {
    method: 'DELETE',
    body: JSON.stringify({
      scope: ref.scope,
      pageId: ref.pageId,
      tabIndex: ref.tabIndex,
      sectionIndex: ref.sectionIndex,
      buttonIndex: ref.buttonIndex
    })
  });
  await reloadConfigAndButtons('按钮已删除。');
}

async function addUser() {
  const username = $('newUsername').value.trim();
  const email = $('newUserEmail').value.trim();
  const displayName = $('newDisplayName').value.trim();
  const password = $('newUserPassword').value.trim();
  const role = $('newUserRole').value;
  const balance = Number($('newUserBalance')?.value || 0);

  if (!username || !password) {
    setStatus('用户名和初始密码不能为空。', true);
    return;
  }

  await api('/api/super/users', {
    method: 'POST',
    body: JSON.stringify({ username, email, displayName, password, role, balance })
  });

  $('newUsername').value = '';
  $('newUserEmail').value = '';
  $('newDisplayName').value = '';
  $('newUserPassword').value = '';
  await loadUsers();
  renderUserContext();
  setStatus('用户已创建。');
}

function invitePayloadFromForm() {
  return {
    prefix: $('newInviteCode').value.trim(),
    maxUses: Number($('newInviteMaxUses').value || 1),
    count: Number($('newInviteCount')?.value || 1),
    retentionDays: Number($('newInviteRetentionDays')?.value || 7),
    registerRole: $('newInviteRegisterRole')?.value || 'user',
    boundAgentId: $('newInviteBoundAgent')?.value || ''
  };
}

function resetInviteForm() {
  $('newInviteCode').value = '';
  if ($('newInviteCount')) $('newInviteCount').value = '1';
  if ($('newInviteRetentionDays')) $('newInviteRetentionDays').value = '7';
  $('newInviteMaxUses').value = '1';
  if ($('newInviteRegisterRole')) $('newInviteRegisterRole').value = 'user';
  if ($('newInviteBoundAgent')) $('newInviteBoundAgent').value = isAgent() ? state.currentUser?.id || '' : '';
}

function closeInvitePaymentDialog(choice = null) {
  const overlay = $('invitePaymentOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  if (overlay._resolve) {
    overlay._resolve(choice);
    overlay._resolve = null;
  }
}

function ensureInvitePaymentDialog() {
  let overlay = $('invitePaymentOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'invitePaymentOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal-card invite-payment-card" role="dialog" aria-modal="true" aria-labelledby="invitePaymentTitle">
      <div class="modal-head">
        <h2 id="invitePaymentTitle">邀请码付款</h2>
        <button id="closeInvitePaymentBtn" type="button" aria-label="关闭">×</button>
      </div>
      <div id="invitePaymentSummary" class="invite-payment-summary"></div>
      <div id="invitePaymentActions" class="invite-payment-actions"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (event) => {
    if (event.target === overlay) closeInvitePaymentDialog();
  };
  $('closeInvitePaymentBtn').onclick = () => closeInvitePaymentDialog();
  return overlay;
}

function showInvitePaymentDialog(quote) {
  const overlay = ensureInvitePaymentDialog();
  const currency = quote.currency || 'CNY';
  const channels = quote.channels || [];
  const canPayBalance = quote.balanceEnough || quote.allowNegativeBalance;
  $('invitePaymentSummary').innerHTML = `
    <div class="invite-pay-grid">
      <div><span>账户余额</span><strong>${escapeHtml(formatMoney(quote.balance, currency))}</strong></div>
      <div><span>本次需付</span><strong>${escapeHtml(formatMoney(quote.total, currency))}</strong></div>
      <div><span>单个价格</span><strong>${escapeHtml(formatMoney(quote.price, currency))}</strong></div>
      <div><span>生成数量</span><strong>${Number(quote.request?.count || 1)} 个</strong></div>
    </div>
    <p class="invite-pay-note">请选择付款方式提交订单，必须总管理员通过后才会生成邀请码。</p>
  `;
  const actions = $('invitePaymentActions');
  actions.innerHTML = '';
  const balanceBtn = document.createElement('button');
  balanceBtn.type = 'button';
  balanceBtn.textContent = canPayBalance ? '余额支付，提交审核' : '余额不足';
  balanceBtn.disabled = !canPayBalance;
  balanceBtn.onclick = () => closeInvitePaymentDialog({ paymentMethod: 'balance' });
  actions.appendChild(balanceBtn);

  channels.forEach((channel) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${channel.label || channel.key}支付，提交审核`;
    btn.onclick = () => closeInvitePaymentDialog({ paymentMethod: 'interface', paymentChannel: channel.key });
    actions.appendChild(btn);
  });

  const manualBtn = document.createElement('button');
  manualBtn.type = 'button';
  manualBtn.textContent = '提交总管理审核';
  manualBtn.onclick = () => closeInvitePaymentDialog({ paymentMethod: 'manual' });
  actions.appendChild(manualBtn);

  if (!channels.length) {
    const tip = document.createElement('p');
    tip.className = 'invite-pay-note';
    tip.textContent = '当前未配置支付接口，可提交订单等待总管理员后台通过。';
    actions.appendChild(tip);
  }

  overlay.hidden = false;
  return new Promise((resolve) => {
    overlay._resolve = resolve;
  });
}

async function createInvite() {
  const payload = invitePayloadFromForm();
  let payment = {};

  try {
    if (isAgent()) {
      let quote;
      try {
        quote = await api('/api/super/invites/quote', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch (error) {
        setStatus(error.message || '邀请码预估失败。', true);
        return;
      }
      state.inviteCurrency = quote.currency || state.inviteCurrency || 'CNY';
      if (state.currentUser) state.currentUser.balance = quote.balance;
      renderUserContext();
      const choice = await showInvitePaymentDialog(quote);
      if (!choice) return;
      payment = choice;
    }

    const result = await api('/api/super/invites', {
      method: 'POST',
      body: JSON.stringify({ ...payload, ...payment })
    });

    if (typeof result.balance !== 'undefined' && state.currentUser) {
      state.currentUser.balance = result.balance;
    }
    resetInviteForm();
    try {
      await loadInvites();
    } catch (error) {
      console.warn('刷新邀请码失败：', error);
    }
    renderUserContext();
    if (result.order) {
      setStatus(result.message || '订单已提交，必须总管理员通过后才会生成邀请码。');
      return;
    }
    const createdCount = (result.invites || []).length || Math.max(1, payload.count);
    openInviteResultDialog(result.invites || [], createdCount);
    setStatus(`邀请码已生成 ${createdCount} 个。`);
  } catch (error) {
    setStatus(error.message || '生成邀请码失败。', true);
  }
}

function ensureInviteTools() {
  const table = $('inviteRows')?.closest('table');
  if (table && !table.dataset.inviteSelectReady) {
    const headRow = table.querySelector('thead tr');
    if (headRow) {
      const th = document.createElement('th');
      th.innerHTML = '<input id="inviteSelectAll" type="checkbox">';
      headRow.insertBefore(th, headRow.firstElementChild);
      table.dataset.inviteSelectReady = '1';
      th.querySelector('input').onchange = (event) => {
        document.querySelectorAll('.invite-check').forEach((box) => {
          box.checked = event.target.checked;
        });
      };
    }
  }
  if (table && !table.dataset.inviteCreatedHeadReady) {
    const headRow = table.querySelector('thead tr');
    if (headRow) {
      const hasCreatedHead = [...headRow.children].some((item) => item.textContent.trim() === '生成时间');
      if (!hasCreatedHead) {
        const th = document.createElement('th');
        th.textContent = '生成时间';
        const statusHead = [...headRow.children].find((item) => item.textContent.trim() === '状态');
        headRow.insertBefore(th, statusHead || headRow.children[2] || null);
      }
      table.dataset.inviteCreatedHeadReady = '1';
    }
  }
  if (table && !table.dataset.inviteUsedHeadReady) {
    const headRow = table.querySelector('thead tr');
    if (headRow) {
      const hasUsedHead = [...headRow.children].some((item) => item.textContent.trim() === '是否使用');
      if (!hasUsedHead) {
        const th = document.createElement('th');
        th.textContent = '是否使用';
        const statusHead = [...headRow.children].find((item) => item.textContent.trim() === '状态');
        headRow.insertBefore(th, statusHead?.nextElementSibling || headRow.children[4] || null);
      }
      table.dataset.inviteUsedHeadReady = '1';
    }
  }
  if (table && !table.dataset.inviteAgentHeadReady) {
    const headRow = table.querySelector('thead tr');
    if (headRow) {
      const heads = [...headRow.children].map((item) => item.textContent.trim());
      const insertBeforeStatus = [...headRow.children].find((item) => item.textContent.trim() === '状态');
      [
        ['注册后角色', 'role'],
        ['绑定代理', 'agent'],
        ['代理邀请码', 'flag']
      ].forEach(([label]) => {
        if (heads.includes(label)) return;
        const th = document.createElement('th');
        th.textContent = label;
        headRow.insertBefore(th, insertBeforeStatus || null);
      });
      table.dataset.inviteAgentHeadReady = '1';
    }
  }

  const prefixInput = $('newInviteCode');
  if (prefixInput && !prefixInput.dataset.prefixReady) {
    prefixInput.placeholder = '例如：YQ，系统自动补随机码';
    prefixInput.closest('label').childNodes[0].textContent = '邀请码前缀';
    const countLabel = document.createElement('label');
    countLabel.textContent = '生成数量';
    countLabel.innerHTML = '生成数量<input id="newInviteCount" type="number" min="1" max="200" value="1">';
    prefixInput.closest('.invite-create').appendChild(countLabel);
    const retentionLabel = document.createElement('label');
    retentionLabel.innerHTML = '使用后保留天数<input id="newInviteRetentionDays" type="number" min="0" value="7">';
    prefixInput.closest('.invite-create').appendChild(retentionLabel);
    const roleLabel = document.createElement('label');
    roleLabel.innerHTML = '注册后角色<select id="newInviteRegisterRole"><option value="user">普通用户</option><option value="agent">代理</option></select>';
    prefixInput.closest('.invite-create').appendChild(roleLabel);
    const boundLabel = document.createElement('label');
    boundLabel.innerHTML = '绑定代理<select id="newInviteBoundAgent"></select>';
    prefixInput.closest('.invite-create').appendChild(boundLabel);
    prefixInput.dataset.prefixReady = '1';
  }
  renderInviteAgentControls();

  const panelHead = $('createInviteBtn')?.closest('.panel-head');
  if (panelHead && !$('inviteUseFilter')) {
    const filterWrap = document.createElement('label');
    filterWrap.className = 'invite-filter';
    filterWrap.innerHTML = `
      <span>筛选</span>
      <select id="inviteUseFilter">
        <option value="all">全部</option>
        <option value="used">已使用</option>
        <option value="unused">未使用</option>
      </select>
    `;
    filterWrap.querySelector('select').value = state.inviteFilter || 'all';
    filterWrap.querySelector('select').onchange = (event) => {
      state.inviteFilter = event.target.value || 'all';
      localStorage.setItem('toolbox_invite_filter', state.inviteFilter);
      const selectAll = $('inviteSelectAll');
      if (selectAll) selectAll.checked = false;
      renderInvites();
    };
    panelHead.insertBefore(filterWrap, $('createInviteBtn'));
  }

  if (panelHead && !$('exportInvitesBtn')) {
    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportInvitesBtn';
    exportBtn.type = 'button';
    exportBtn.textContent = '导出选中';
    exportBtn.onclick = exportInvites;
    panelHead.insertBefore(exportBtn, $('createInviteBtn'));
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'deleteSelectedInvitesBtn';
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '删除选中';
    deleteBtn.onclick = deleteSelectedInvites;
    panelHead.insertBefore(deleteBtn, $('createInviteBtn'));
  }
}

function renderInviteAgentControls() {
  const roleSelect = $('newInviteRegisterRole');
  const boundSelect = $('newInviteBoundAgent');
  if (!roleSelect || !boundSelect) return;
  const previousRole = roleSelect.value || 'user';
  const previousBound = boundSelect.value || '';
  roleSelect.innerHTML = '<option value="user">普通用户</option><option value="agent">代理</option>';
  roleSelect.value = previousRole === 'agent' && isSuper() ? 'agent' : 'user';
  roleSelect.disabled = !isSuper();
  boundSelect.innerHTML = '<option value="">不绑定</option>';
  (state.users || [])
    .filter((user) => user.role === 'agent' && user.active !== false)
    .forEach((user) => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = displayNameOf(user, user.username);
      boundSelect.appendChild(opt);
    });
  if (isAgent()) {
    const own = state.currentUser?.id || '';
    if (![...boundSelect.options].some((option) => option.value === own)) {
      const opt = document.createElement('option');
      opt.value = own;
      opt.textContent = displayNameOf(state.currentUser, state.currentUser?.username || '当前代理');
      boundSelect.appendChild(opt);
    }
    boundSelect.value = own;
    boundSelect.disabled = true;
  } else {
    boundSelect.value = [...boundSelect.options].some((option) => option.value === previousBound) ? previousBound : '';
    boundSelect.disabled = false;
  }
}

function exportInvites() {
  const checked = [...document.querySelectorAll('.invite-check:checked')].map((box) => box.value).filter(Boolean);
  const codes = checked.length ? checked : filteredInvites().map((invite) => invite.code).filter(Boolean);
  if (!codes.length) {
    setStatus('没有可导出的邀请码。', true);
    return;
  }
  const blob = new Blob([codes.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `邀请码-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已导出 ${codes.length} 个邀请码。`);
}

async function toggleInvite(code, active) {
  await api('/api/super/invites', {
    method: 'PATCH',
    body: JSON.stringify({ code, active })
  });
  await loadInvites();
  renderInvites();
  setStatus(active ? '邀请码已启用。' : '邀请码已停用。');
}

async function deleteInvite(code) {
  if (!confirm(`删除邀请码「${code}」？`)) return;
  await api('/api/super/invites', {
    method: 'DELETE',
    body: JSON.stringify({ code })
  });
  await loadInvites();
  renderInvites();
  setStatus('邀请码已删除。');
}

async function deleteSelectedInvites() {
  const codes = [...document.querySelectorAll('.invite-check:checked')].map((box) => box.value).filter(Boolean);
  if (!codes.length) {
    setStatus('请先选择邀请码。', true);
    return;
  }
  if (!confirm(`确定删除选中的 ${codes.length} 个邀请码吗？`)) return;
  await api('/api/super/invites', {
    method: 'DELETE',
    body: JSON.stringify({ codes })
  });
  await loadInvites();
  renderInvites();
  setStatus(`已删除 ${codes.length} 个邀请码。`);
}

async function copyText(text) {
  const value = String(text || '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showToast('已复制。', 'success');
      return;
    }
  } catch {}

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    if (!document.execCommand('copy')) throw new Error('copy failed');
    showToast('已复制。', 'success');
  } catch {
    textarea.style.left = '12px';
    textarea.style.right = '12px';
    textarea.style.top = '12px';
    textarea.style.width = 'calc(100vw - 24px)';
    textarea.style.height = '120px';
    textarea.style.zIndex = '2147483647';
    textarea.focus();
    textarea.select();
    showToast('请长按选中文本后复制。', 'error');
    setTimeout(() => textarea.remove(), 8000);
    return;
  } finally {
    if (textarea.parentElement && textarea.style.left === '-9999px') textarea.remove();
  }
}

function ensureInviteResultDialog() {
  let overlay = $('inviteResultOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'inviteResultOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal-card invite-result-card" role="dialog" aria-modal="true" aria-labelledby="inviteResultTitle">
      <div class="modal-head">
        <h2 id="inviteResultTitle">邀请码已生成</h2>
        <button id="closeInviteResultBtn" type="button" aria-label="关闭">×</button>
      </div>
      <div id="inviteResultList" class="invite-result-list"></div>
      <div class="invite-result-actions">
        <button id="copyInviteResultAllBtn" type="button">复制全部</button>
        <button id="closeInviteResultBtn2" type="button">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (event) => {
    if (event.target === overlay) closeInviteResultDialog();
  };
  $('closeInviteResultBtn').onclick = closeInviteResultDialog;
  $('closeInviteResultBtn2').onclick = closeInviteResultDialog;
  return overlay;
}

function closeInviteResultDialog() {
  const overlay = $('inviteResultOverlay');
  if (overlay) overlay.hidden = true;
}

function openInviteResultDialog(invites, count = 0) {
  const overlay = ensureInviteResultDialog();
  const list = $('inviteResultList');
  const codes = (invites || []).map((item) => item.code || '').filter(Boolean);
  if (codes.length) {
    list.innerHTML = codes.map((code) => `
      <div class="invite-result-row">
        <input readonly value="${escapeAttr(code)}">
        <button type="button" data-copy-code="${escapeAttr(code)}">复制</button>
      </div>
    `).join('');
  } else {
    list.innerHTML = `<p class="invite-pay-note">本次已生成 ${Number(count || 0)} 个邀请码，请在列表里查看。</p>`;
  }
  $('copyInviteResultAllBtn').disabled = !codes.length;
  $('copyInviteResultAllBtn').onclick = () => copyText(codes.join('\r\n'));
  list.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.onclick = () => copyText(button.dataset.copyCode || '');
  });
  overlay.hidden = false;
}

async function saveUser(userId, row) {
  const balanceInput = row.querySelector('[data-field="balance"]') || row.querySelector('[data-field="detailBalance"]');
  const body = {
    id: userId,
    username: row.querySelector('[data-field="username"]').value.trim(),
    email: row.querySelector('[data-field="email"]').value.trim(),
    displayName: row.querySelector('[data-field="displayName"]').value.trim(),
    role: row.querySelector('[data-field="role"]').value,
    canViewJson: row.querySelector('[data-field="canViewJson"]')?.checked !== false,
    balance: Number(balanceInput?.value || 0)
  };
  const password = row.querySelector('[data-field="password"]').value.trim();
  if (password) body.password = password;

  await api('/api/super/users', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  await loadUsers();
  renderUserContext();
  setStatus('用户已保存。');
}

async function saveAgentBalance(userId, row) {
  const balance = Number(row.querySelector('[data-field="balance"]')?.value || row.querySelector('[data-field="detailBalance"]')?.value || 0);
  await api('/api/super/users/agent', {
    method: 'POST',
    body: JSON.stringify({ id: userId, action: 'balance', balance })
  });
  await loadUsers();
  renderUserContext();
  setStatus('代理余额已保存。');
}

async function promoteUserAgent(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const useDefaultBalance = confirm(`把「${user.displayName || user.username}」设为代理，并写入系统默认代理余额吗？\n选择“取消”会设为代理但余额保留为 0 或当前值。`);
  await api('/api/super/users/agent', {
    method: 'POST',
    body: JSON.stringify({ id: userId, action: 'promote', useDefaultBalance })
  });
  await loadUsers();
  await loadInvites();
  renderUserContext();
  setStatus('用户已设为代理。');
}

async function cancelUserAgent(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  if (!confirm(`确认取消「${user.displayName || user.username}」的代理身份？\n用户不会删除，历史代理订单会保留。`)) return;
  await api('/api/super/users/agent', {
    method: 'POST',
    body: JSON.stringify({ id: userId, action: 'cancel' })
  });
  await loadUsers();
  await loadInvites();
  renderUserContext();
  setStatus('代理身份已取消。');
}

async function jumpToAgentOrders(agentId) {
  if (!isSuper()) return;
  switchView('system');
  await refreshOrders(false);
  const panel = $('orderRows')?.closest('.collapsible-panel');
  if (panel?.classList.contains('is-collapsed')) panel.querySelector('.panel-collapse-toggle')?.click();
  const rows = [...document.querySelectorAll('[data-order-agent-id]')].filter((row) => row.dataset.orderAgentId === agentId);
  setTimeout(() => {
    (rows[0] || panel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rows.forEach((row) => {
      row.classList.add('row-highlight');
      setTimeout(() => row.classList.remove('row-highlight'), 2600);
    });
  }, 80);
  setStatus(rows.length ? `已找到 ${rows.length} 条代理订单。` : '该代理暂无订单记录。');
}

async function batchUsers(action) {
  const ids = [...document.querySelectorAll('.user-check:checked')].map((box) => box.value).filter(Boolean);
  if (!ids.length) {
    setStatus('请先选择用户。', true);
    return;
  }
  if (action === 'delete' && !confirm(`确定删除选中的 ${ids.length} 个用户吗？`)) return;
  await api('/api/super/users/batch', {
    method: 'POST',
    body: JSON.stringify({ ids, action })
  });
  await loadUsers();
  renderUserContext();
  setStatus(`批量操作完成：${ids.length} 个用户。`);
}

async function saveJsonPermissions() {
  const checks = [...document.querySelectorAll('.json-permission-check')];
  for (const box of checks) {
    const user = state.users.find((item) => item.id === box.value);
    if (!user || user.role === 'super') continue;
    if ((user.canViewJson !== false) === box.checked) continue;
    await api('/api/super/users', {
      method: 'PATCH',
      body: JSON.stringify({ id: user.id, canViewJson: box.checked })
    });
  }
  await loadUsers();
  renderAll();
  setStatus('JSON 查看权限已保存。');
}

async function markNoticeRead(id) {
  if (!id) return;
  await api('/api/admin/notices', {
    method: 'PATCH',
    body: JSON.stringify({ id, read: true })
  });
  await loadNotices();
  renderNotices();
}

async function markAllNoticesRead() {
  for (const notice of state.notices.filter((item) => !item.read)) {
    await api('/api/admin/notices', {
      method: 'PATCH',
      body: JSON.stringify({ id: notice.id, read: true })
    });
  }
  await loadNotices();
  renderNotices();
  setStatus('通知已全部标记为已读。');
}

async function deleteNotice(id) {
  if (!id) return;
  if (!isSuper()) {
    setStatus('只有总管理员可以删除通知。', true);
    return;
  }
  await api('/api/admin/notices', {
    method: 'DELETE',
    body: JSON.stringify({ id })
  });
  state.notices = state.notices.filter((item) => item.id !== id);
  renderNotices();
  setStatus('通知已删除。');
}

async function deleteAllNotices() {
  if (!isSuper()) {
    setStatus('只有总管理员可以删除所有通知。', true);
    return;
  }
  if (!confirm('确定删除所有通知吗？此操作不可恢复。')) return;
  await api('/api/admin/notices', { method: 'DELETE' });
  state.notices = [];
  renderNotices();
  setStatus('所有通知已删除。');
}

async function sendNotice() {
  const title = $('noticeTitleInput').value.trim();
  const content = $('noticeContentInput').value.trim();
  const level = $('noticeLevelInput').value;
  const mailPush = $('noticeMailPushInput')?.checked || false;
  const result = await api('/api/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ title, content, level, mailPush })
  });
  $('noticeTitleInput').value = '';
  $('noticeContentInput').value = '';
  if ($('noticeMailPushInput')) $('noticeMailPushInput').checked = false;
  $('noticeComposer').hidden = true;
  await loadNotices();
  renderNotices();
  setStatus(result.mailMessage || '通知已发送。');
}

async function sendNoticeMail(id) {
  if (!id) return;
  const result = await api('/api/admin/notices/mail', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
  setStatus(result.message || '邮件已推送。');
}

function collectPayGateway(key) {
  const card = document.querySelector(`[data-pay-gateway="${key}"]`);
  const data = { enabled: card?.querySelector('[data-pay-enabled]')?.checked || false };
  card?.querySelectorAll('[data-pay-field]').forEach((input) => {
    data[input.dataset.payField] = input.type === 'checkbox' ? input.checked : input.value.trim();
  });
  if (key === 'alipayOfficial' && !data.gateway) {
    data.gateway = 'https://openapi.alipay.com/gateway.do';
  }
  return data;
}

function syncPayRoutesFromCards() {
  const pay = state.system?.pay || {};
  const enabled = (key) => document.querySelector(`[data-pay-gateway="${key}"] [data-pay-enabled]`)?.checked || false;
  const currentWechat = $('payWechatChannel')?.value || pay.wechatChannel || 'disabled';
  const currentAlipay = $('payAlipayChannel')?.value || pay.alipayChannel || 'disabled';
  if ($('payWechatChannel')) {
    $('payWechatChannel').value = enabled(currentWechat) ? currentWechat : (enabled('wechatOfficial') ? 'wechatOfficial' : (enabled('easypay') ? 'easypay' : (enabled('easypay2') ? 'easypay2' : 'disabled')));
  }
  if ($('payAlipayChannel')) {
    $('payAlipayChannel').value = enabled(currentAlipay) ? currentAlipay : (enabled('alipayOfficial') ? 'alipayOfficial' : (enabled('easypay') ? 'easypay' : (enabled('easypay2') ? 'easypay2' : 'disabled')));
  }
}

async function saveSystemSettings(section) {
  const body = {};
  if (section === 'locations') {
    body.locations = {
      noticeAreaTitle: $('systemNoticeTitle').value.trim() || '全部未读',
      adminSystemName: $('systemMenuName').value.trim() || '系统管理',
      frontendActiveGlow: $('systemFrontendGlow').checked,
      frontendShowGroupCount: $('systemFrontendGroupCount').checked
    };
  }
  if (section === 'agent') {
    body.agent = {
      invitePrice: Number($('agentInvitePrice').value || 0),
      currency: $('agentCurrency').value.trim() || 'CNY',
      orderCooldownMinutes: Number($('agentOrderCooldown')?.value || 0),
      allowNegativeBalance: $('agentAllowNegative').checked
    };
  }
  if (section === 'pay') {
    syncPayRoutesFromCards();
    body.pay = {
      wechatChannel: $('payWechatChannel').value,
      alipayChannel: $('payAlipayChannel').value,
      wechatOrder: Number($('payWechatOrder').value || 10),
      alipayOrder: Number($('payAlipayOrder').value || 20),
      easypay: collectPayGateway('easypay'),
      easypay2: collectPayGateway('easypay2'),
      alipayOfficial: collectPayGateway('alipayOfficial'),
      wechatOfficial: collectPayGateway('wechatOfficial')
    };
  }
  if (section === 'integrity') {
    body.integrity = {
      enabled: $('integrityEnabled')?.checked !== false,
      tokenTtlMinutes: Number($('integrityTokenTtl')?.value || 10080),
      rotateSecret: $('integrityRotateSecret')?.checked || false
    };
  }
  state.system = await api('/api/super/system', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  renderSystemSettings();
  renderNotices();
  setStatus('系统设置已保存。');
}

async function enterTemplateMode() {
  if (!isSuper()) {
    setStatus('只有总管理员可以编辑新用户模板。', true);
    return;
  }
  state.templateMode = true;
  state.config = await api('/api/super/template');
  state.buttons = await api('/api/super/template/buttons');
  renderAll();
  switchView('overview');
  setStatus('已进入新用户模板编辑。');
}

async function exitTemplateMode() {
  state.templateMode = false;
  await reloadConfigAndButtons('已返回当前用户配置。');
}

async function toggleTemplateMode() {
  if (isTemplateMode()) {
    await exitTemplateMode();
  } else {
    await enterTemplateMode();
  }
}

async function copyCurrentToTemplate() {
  if (!isSuper()) {
    setStatus('只有总管理员可以设置新用户模板。', true);
    return;
  }
  if (isTemplateMode()) {
    setStatus('当前已经在模板编辑中。', true);
    return;
  }
  const sourceUserId = state.targetUserId || state.currentUser?.id || '';
  const sourceUser = state.users.find((item) => item.id === sourceUserId) || state.currentUser;
  const name = sourceUser?.displayName || sourceUser?.username || sourceUserId || '当前配置';
  if (!confirm(`用「${name}」的当前配置覆盖新用户模板吗？`)) return;
  await api('/api/super/template', {
    method: 'POST',
    body: JSON.stringify({ action: 'copy_current', userId: sourceUserId })
  });
  setStatus('新用户模板已更新。');
}

async function resetTemplate() {
  if (!isSuper()) {
    setStatus('只有总管理员可以重置新用户模板。', true);
    return;
  }
  if (!confirm('确定把新用户模板恢复为系统默认配置吗？')) return;
  await api('/api/super/template', {
    method: 'POST',
    body: JSON.stringify({ action: 'reset' })
  });
  if (isTemplateMode()) {
    state.config = await api('/api/super/template');
    state.buttons = await api('/api/super/template/buttons');
    renderAll();
  }
  setStatus('新用户模板已恢复默认。');
}

async function refreshOrders(showMessage = true) {
  const result = await api('/api/super/orders');
  state.orders = result.orders || [];
  renderOrders();
  if (showMessage) setStatus('订单列表已刷新。');
}

async function updateOrderStatus(id, status) {
  if (!id || !status) return;
  await api('/api/super/orders', {
    method: 'PATCH',
    body: JSON.stringify({ id, status })
  });
  await refreshOrders();
  setStatus('订单状态已更新。');
}

async function deleteOrder(id) {
  if (!id) return;
  if (!confirm(`确定删除订单「${id}」吗？此操作不可恢复。`)) return;
  await api('/api/super/orders', {
    method: 'DELETE',
    body: JSON.stringify({ id })
  });
  await refreshOrders();
  setStatus('订单已删除。');
}

async function jumpToOrder(orderId) {
  if (!orderId || !isSuper()) return;
  switchView('system');
  await refreshOrders();
  const rows = [...document.querySelectorAll('[data-order-id]')];
  const row = rows.find((item) => item.dataset.orderId === orderId);
  const panel = row?.closest('.collapsible-panel') || $('orderRows')?.closest('.collapsible-panel');
  if (panel?.classList.contains('is-collapsed')) {
    panel.querySelector('.panel-collapse-toggle')?.click();
  }
  if (!row) {
    setStatus('订单可能已被删除，未找到对应订单。', true);
    return;
  }
  setTimeout(() => {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('row-highlight');
    setTimeout(() => row.classList.remove('row-highlight'), 2600);
  }, 80);
  setStatus('已跳转到对应订单。');
}

async function resetUserApiKey(userId) {
  if (!confirm('重置后，这个用户旧的工具箱对接地址会失效，继续吗？')) return;

  await api('/api/super/users', {
    method: 'PATCH',
    body: JSON.stringify({ id: userId, resetApiKey: true })
  });

  await loadUsers();
  renderUserContext();
  setStatus('用户对接地址已重置。');
}

async function toggleUserActive(userId, currentlyActive) {
  const user = state.users.find((item) => item.id === userId);
  const nextActive = !currentlyActive;
  const actionText = nextActive ? '解冻' : '冻结';
  if (!confirm(`${actionText}用户「${user?.username || userId}」？`)) return;

  await api('/api/super/users', {
    method: 'PATCH',
    body: JSON.stringify({ id: userId, active: nextActive })
  });

  await loadUsers();
  renderUserContext();
  setStatus(`用户已${actionText}。`);
}

async function deleteUser(userId, username) {
  if (!confirm(`删除用户「${username}」？他的配置数据不会在界面里显示。`)) return;

  await api('/api/super/users', {
    method: 'DELETE',
    body: JSON.stringify({ id: userId })
  });

  if (state.targetUserId === userId) {
    state.targetUserId = state.currentUser.id;
    localStorage.setItem('toolbox_target_user', state.targetUserId);
  }
  await loadUsers();
  renderUserContext();
  setStatus('用户已删除。');
}

async function downloadClient(userId = '', variant = 'original') {
  if (state.clientDownloading) return;
  variant = variant || 'original';
  const variantInfo = CLIENT_VARIANTS.find((item) => item.id === variant) || CLIENT_VARIANTS[0];
  state.clientDownloading = true;
  openClientBuildDialog('正在向服务器提交生成请求...');
  const downloadButtons = Array.from(document.querySelectorAll('[data-action="download-client-variant"], [data-action="download"]'))
    .filter((button) => (button.dataset.variant || 'original') === variant);
  downloadButtons.forEach((button) => {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.disabled = true;
    button.textContent = '正在生成...';
  });

  try {
    const headers = authHeaders();
    setStatus(`正在生成${variantInfo.label} EXE，首次生成可能需要十几秒...`);
    updateClientBuildDialog('progress', '服务器正在创建编译任务...');
    const started = await api('/api/admin/client/build', {
      method: 'POST',
      targetUserId: userId || '',
      headers,
      body: JSON.stringify({ targetUserId: userId || '', variant })
    });
    const jobId = started.id;
    if (!jobId) throw new Error('生成任务创建失败。');

    let job = started;
    for (;;) {
      if (job.status === 'done') break;
      if (job.status === 'error') throw new Error(job.message || '工具箱 EXE 生成失败。');
      updateClientBuildDialog('progress', job.message || '服务器正在编译 EXE，请保持页面打开...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const params = new URLSearchParams({ id: jobId, _t: String(Date.now()) });
      job = await api(`/api/admin/client/build/status?${params.toString()}`, { headers });
    }

    updateClientBuildDialog('progress', 'EXE 已生成，正在准备浏览器下载...');
    delete headers['Content-Type'];
    const fileParams = new URLSearchParams({ id: jobId, variant, _t: String(Date.now()) });
    const res = await fetch(withTargetUser(`/api/admin/client/build/file?${fileParams.toString()}`, userId || ''), { headers });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      const text = await res.text();
      const trimmed = text.trim();
      if (contentType.includes('application/json') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        throw new Error(parsed.error || `HTTP ${res.status}`);
      }
      throw new Error(trimmed || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    if (contentType.includes('text/html') || blob.type.includes('text/html')) {
      throw new Error('/api/admin/client/build/file 返回了网页，不是 EXE。请检查 CDN 对 /api 的放行和不缓存规则。');
    }
    if (!(await blobHasWindowsExeHeader(blob))) {
      throw new Error('服务器返回的下载内容不是有效 EXE。请确认后端已更新并重启，然后清理旧缓存重新生成。');
    }
    const disposition = res.headers.get('content-disposition') || '';
    const fileName = job.fileName || contentDispositionFilename(disposition) || 'toolbox.exe';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    updateClientBuildDialog('done', `已生成 ${fileName}，浏览器下载已开始。`);
    setTimeout(closeClientBuildDialog, 1600);
    setStatus(`${variantInfo.label} EXE 已生成，下一次同配置会更快。`);
  } catch (error) {
    updateClientBuildDialog('error', error.message);
    throw error;
  } finally {
    state.clientDownloading = false;
    downloadButtons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || '下载工具箱';
    });
  }
}

async function saveJson() {
  let config;
  try {
    config = JSON.parse($('jsonEditor').value);
  } catch (error) {
    setStatus(`JSON 格式错误：${error.message}`, true);
    return;
  }

  await api(configApiPath(), {
    method: 'PUT',
    body: JSON.stringify(config)
  });
  await reloadConfigAndButtons('完整配置已保存。');
}

function configSummaryText(summary) {
  if (!summary) return '';
  const title = summary.title || '未命名配置';
  return `${title} · ${Number(summary.pages || 0)} 个页面 · ${Number(summary.tabs || 0)} 个标签 · ${Number(summary.buttons || 0)} 个按钮`;
}

function renderExchangeControls() {
  const disabled = isTemplateMode();
  ['exportConfigBtn', 'importConfigFileBtn', 'generateShareLinkBtn', 'copyShareLinkBtn', 'importCloudUrlBtn'].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = disabled;
  });
  const file = $('importConfigFile');
  if (file) file.disabled = disabled;
  const cloud = $('importCloudUrl');
  if (cloud) cloud.disabled = disabled;
  const meta = $('configShareMeta');
  if (meta && disabled) meta.textContent = '正在编辑新用户模板时不能导入导出，请先退出模板编辑。';
}

async function exportConfigFile() {
  if (isTemplateMode()) {
    setStatus('请先退出模板编辑，再导出当前用户配置。', true);
    return;
  }
  const headers = authHeaders();
  const res = await fetch(withTargetUser(`/api/admin/config/export?_t=${Date.now()}`), { headers });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const text = await res.text();
    if (contentType.includes('application/json') || text.trim().startsWith('{')) {
      const parsed = JSON.parse(text || '{}');
      throw new Error(parsed.error || `导出失败：HTTP ${res.status}`);
    }
    throw new Error(text || `导出失败：HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const fileName = contentDispositionFilename(disposition) || `toolbox-config-${Date.now()}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('配置文件已导出。');
}

function readSelectedConfigFile() {
  const file = $('importConfigFile')?.files?.[0];
  if (!file) throw new Error('请先选择配置文件。');
  if (file.size > 3 * 1024 * 1024) throw new Error('配置文件过大。');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '')));
      } catch (error) {
        reject(new Error(`配置文件 JSON 格式错误：${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取配置文件失败。'));
    reader.readAsText(file, 'utf-8');
  });
}

async function importConfigFile() {
  if (isTemplateMode()) {
    setStatus('请先退出模板编辑，再导入当前用户配置。', true);
    return;
  }
  const payload = await readSelectedConfigFile();
  if (!confirm('导入会覆盖当前正在编辑的工具箱配置，继续吗？')) return;
  const result = await api('/api/admin/config/import', {
    method: 'POST',
    body: JSON.stringify({ source: 'file', payload })
  });
  if ($('importConfigFile')) $('importConfigFile').value = '';
  await reloadConfigAndButtons(`配置已导入：${configSummaryText(result.summary)}`);
}

async function generateConfigShareLink() {
  if (isTemplateMode()) {
    setStatus('请先退出模板编辑，再生成云端链接。', true);
    return;
  }
  const result = await api('/api/admin/config/share', {
    method: 'POST',
    body: JSON.stringify({})
  });
  if ($('configShareUrl')) $('configShareUrl').value = result.shareUrl || '';
  if ($('configShareMeta')) $('configShareMeta').textContent = configSummaryText(result.summary);
  setStatus('云端配置链接已生成。');
}

async function copyConfigShareLink() {
  let url = $('configShareUrl')?.value.trim() || '';
  if (!url) {
    await generateConfigShareLink();
    url = $('configShareUrl')?.value.trim() || '';
  }
  if (!url) {
    setStatus('还没有可复制的云端链接。', true);
    return;
  }
  await copyText(url);
}

async function importCloudConfig() {
  if (isTemplateMode()) {
    setStatus('请先退出模板编辑，再导入云端配置。', true);
    return;
  }
  const url = $('importCloudUrl')?.value.trim() || '';
  if (!url) {
    setStatus('请先粘贴云端配置链接。', true);
    return;
  }
  if (!confirm('导入云端配置会覆盖当前正在编辑的工具箱配置，继续吗？')) return;
  const result = await api('/api/admin/config/import', {
    method: 'POST',
    body: JSON.stringify({ source: 'url', url })
  });
  await reloadConfigAndButtons(`云端配置已导入：${configSummaryText(result.summary)}`);
}

async function refreshButtons(message) {
  state.buttons = await api(buttonsApiPath());
  renderAll();
  setStatus(message);
}

async function reloadConfigAndButtons(message) {
  state.config = await api(configApiPath());
  state.buttons = await api(buttonsApiPath());
  renderAll();
  setStatus(message);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

setupSidebar();

document.querySelectorAll('.nav').forEach((button) => {
  button.onclick = () => {
    switchView(button.dataset.view);
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.body.classList.remove('sidebar-open');
      document.body.classList.add('sidebar-collapsed');
    }
  };
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshInvitesSilently();
});

setupCollapsiblePanels();
setupNoticeDropdownDismiss();

$('loginBtn').onclick = () => login();
$('showLoginBtn').onclick = () => setLoginMode('login');
$('showRegisterBtn').onclick = () => setLoginMode('register');
$('showForgotBtn').onclick = () => setLoginMode('forgot');
$('registerBtn').onclick = () => register();
$('sendResetCodeBtn').onclick = () => sendResetCode().catch((error) => setLoginMessage(error.message));
updateResetCodeCountdown();
if (Number(localStorage.getItem(RESET_CODE_COOLDOWN_KEY) || 0) > Date.now()) resetCodeCountdownTimer = setInterval(updateResetCodeCountdown, 1000);
$('resetPasswordBtn').onclick = () => resetPassword();
$('loginPassword').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') login();
});
$('registerInviteCode').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') register();
});
$('logoutBtn').onclick = () => logout();
if ($('adminThemeToggle')) $('adminThemeToggle').onclick = () => toggleAdminTheme();
$('targetUserSelect').onchange = async () => {
  state.templateMode = false;
  state.targetUserId = $('targetUserSelect').value;
  localStorage.setItem('toolbox_target_user', state.targetUserId);
  await loadAll();
};

$('saveAppBtn').onclick = () => saveApp().catch((error) => setStatus(error.message, true));
$('saveAccountBtn').onclick = () => saveAccount().catch((error) => setStatus(error.message, true));
$('saveMailBtn').onclick = () => saveMailSettings().catch((error) => setStatus(error.message, true));
$('testMailBtn').onclick = () => testMailSettings().catch((error) => setStatus(error.message, true));
$('appPasswordEnabled').onchange = () => {
  $('appPassword').disabled = !$('appPasswordEnabled').checked;
  if (!$('appPasswordEnabled').checked) $('appPassword').value = '';
};
$('addScopeBtn').onclick = () => addPosition().catch((error) => setStatus(error.message, true));
$('renameScopeBtn').onclick = () => renamePosition().catch((error) => setStatus(error.message, true));
$('moveScopeBtn').onclick = () => movePosition().catch((error) => setStatus(error.message, true));
$('deleteScopeBtn').onclick = () => deletePosition().catch((error) => setStatus(error.message, true));
$('addSectionBtn').onclick = () => addSection().catch((error) => setStatus(error.message, true));
$('renameSectionBtn').onclick = () => renameSection().catch((error) => setStatus(error.message, true));
if ($('moveSectionBtn')) $('moveSectionBtn').onclick = () => moveSection().catch((error) => setStatus(error.message, true));
$('deleteSectionBtn').onclick = () => deleteSection().catch((error) => setStatus(error.message, true));
$('addButtonBtn').onclick = () => addButton().catch((error) => setStatus(error.message, true));
$('addAction').onchange = updateAddTargetState;
$('addUserBtn').onclick = () => addUser().catch((error) => setStatus(error.message, true));
$('createInviteBtn').onclick = () => createInvite().catch((error) => setStatus(error.message, true));
if ($('downloadCurrentClientBtn')) {
  $('downloadCurrentClientBtn').onclick = () => downloadClient().catch((error) => setStatus(error.message, true));
}
$('refreshUsersBtn').onclick = async () => {
  await loadUsers();
  renderUserContext();
  setStatus('用户列表已刷新。');
};
$('saveJsonBtn').onclick = () => saveJson().catch((error) => setStatus(error.message, true));
if ($('exportConfigBtn')) $('exportConfigBtn').onclick = () => exportConfigFile().catch((error) => setStatus(error.message, true));
if ($('importConfigFileBtn')) $('importConfigFileBtn').onclick = () => importConfigFile().catch((error) => setStatus(error.message, true));
if ($('generateShareLinkBtn')) $('generateShareLinkBtn').onclick = () => generateConfigShareLink().catch((error) => setStatus(error.message, true));
if ($('copyShareLinkBtn')) $('copyShareLinkBtn').onclick = () => copyConfigShareLink().catch((error) => setStatus(error.message, true));
if ($('importCloudUrlBtn')) $('importCloudUrlBtn').onclick = () => importCloudConfig().catch((error) => setStatus(error.message, true));
if ($('importCloudUrl')) {
  $('importCloudUrl').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') importCloudConfig().catch((error) => setStatus(error.message, true));
  });
}
if ($('importConfigFile')) {
  $('importConfigFile').onchange = () => {
    const file = $('importConfigFile')?.files?.[0];
    if (file) setStatus(`已选择配置文件：${file.name}`);
  };
}
$('buttonSearch').oninput = renderButtons;
if ($('noticeBellBtn')) {
  $('noticeBellBtn').onclick = (event) => {
    event.stopPropagation();
    const box = $('noticeDropdown');
    box.hidden = !box.hidden;
  };
}
if ($('openNoticeComposerBtn')) $('openNoticeComposerBtn').onclick = () => { $('noticeComposer').hidden = false; };
if ($('closeNoticeComposerBtn')) $('closeNoticeComposerBtn').onclick = () => { $('noticeComposer').hidden = true; };
if ($('sendNoticeBtn')) $('sendNoticeBtn').onclick = () => sendNotice().catch((error) => setStatus(error.message, true));
if ($('markAllNoticeReadBtn')) $('markAllNoticeReadBtn').onclick = () => markAllNoticesRead().catch((error) => setStatus(error.message, true));
if ($('deleteAllNoticesBtn')) $('deleteAllNoticesBtn').onclick = () => deleteAllNotices().catch((error) => setStatus(error.message, true));
if ($('saveLocationSettingsBtn')) $('saveLocationSettingsBtn').onclick = () => saveSystemSettings('locations').catch((error) => setStatus(error.message, true));
if ($('saveIntegritySettingsBtn')) $('saveIntegritySettingsBtn').onclick = () => saveSystemSettings('integrity').catch((error) => setStatus(error.message, true));
bindPopupSettingsActions();
if ($('saveAgentSettingsBtn')) $('saveAgentSettingsBtn').onclick = () => saveSystemSettings('agent').catch((error) => setStatus(error.message, true));
if ($('savePaySettingsBtn')) $('savePaySettingsBtn').onclick = () => saveSystemSettings('pay').catch((error) => setStatus(error.message, true));
if ($('editTemplateBtn')) $('editTemplateBtn').onclick = () => toggleTemplateMode().catch((error) => setStatus(error.message, true));
if ($('copyCurrentToTemplateBtn')) $('copyCurrentToTemplateBtn').onclick = () => copyCurrentToTemplate().catch((error) => setStatus(error.message, true));
if ($('resetTemplateBtn')) $('resetTemplateBtn').onclick = () => resetTemplate().catch((error) => setStatus(error.message, true));
if ($('refreshOrdersBtn')) $('refreshOrdersBtn').onclick = () => refreshOrders().catch((error) => setStatus(error.message, true));

loadAll().catch((error) => handleLoadFailure(error, isAuthFailure(error)));
updateAddTargetState();



