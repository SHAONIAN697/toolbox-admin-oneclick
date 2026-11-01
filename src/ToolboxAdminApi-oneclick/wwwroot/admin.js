// Copyright (c) 2026 少年科技工作室. All rights reserved.
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
  builtinFunctions: [],
  menuIcons: [],
  menuIconLibraryError: '',
  templateMode: false,
  notices: [],
  announcements: [],
  announcementUnreadCount: 0,
  announcementPopupItems: [],
  announcementPopupNewItems: [],
  announcementPopupMarking: false,
  config: null,
  buttons: [],
  inviteCurrency: 'CNY',
  noticePopupShownIds: new Set(),
  activeView: localStorage.getItem('toolbox_active_view') || 'overview',
  clientDownloading: false,
  clientBuildTimer: null,
  clientBuildStartedAt: 0,
  clientBuildReturnFocus: null,
  inviteRefreshTimer: null,
  inviteRefreshBusy: false,
  inviteSnapshot: '',
  auditRefreshTimer: null,
  auditRefreshBusy: false,
  auditItems: [],
  cloudResolver: { config: null, entitlement: null, tasks: [], resources: [], sources: [], adminPlans: [], agentCodes: [], agentSales: [] },
  cloudResolverPendingPickerIds: new Set(),
  cloudResolverPollTimer: null,
  cloudResolverPollBusy: false,
  cloudResolverPollRequested: false,
  cloudResolverParseTimer: null,
  cloudResolverParseCloseTimer: null,
  cloudResolverParseStartedAt: 0,
  cloudResolverParseActive: false,
  cloudOrderSelectedIds: new Set(),
  cloudResolverAdminSelectedOrderIds: new Set(),
  cloudUserEntitlements: {},
  cloudResolverPromoExpiredKeys: new Set(),
  editingCloudPlanId: ''
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
const XINGGUI_DEFAULT_COVER_URL = '/xinggui-version-cover.png';
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
    id: 'audio',
    label: '音频工具箱火山版',
    badge: '火山源码界面',
    description: '深色图标侧栏、红色分类标题、五列圆角按钮和底部下载状态栏，按钮与下载统一由后台配置。',
    preview: 'audio'
  },
  {
    id: 'portal',
    label: '导航首页版',
    badge: '推荐资源中心',
    description: '首页横幅、导航侧栏和资源卡片布局，适合软件中心、常用链接和下载资源站。',
    preview: 'portal'
  },
  {
    id: 'vst76', label: '调音师工具箱旗舰版', badge: '对接中',
    description: '复刻 VST615 的旗舰版桌面布局，使用共享软件目录、页面锁和下载任务。', preview: 'vst76'
  },
  {
    id: 'xinggui', label: '星轨工具箱', badge: '全新版本',
    description: '深色导航、首页横幅与紧凑工具入口，认证和下载沿用后台现有配置。', preview: 'xinggui'
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
  audit: '▧',
  system: '⚙',
  json: '▤',
  exchange: '⇄',
  dock: '⌘',
  announcements: '◉',
  'cloud-resolver': '⇩'
};

const VIEW_TITLES = {
  overview: ['后台管理', '编辑标题、网址、下载按钮和系统工具配置。'],
  account: ['账号资料', '修改当前账号的基础信息和登录密码。'],
  buttons: ['按钮管理', '配置工具箱里的页面、分组、按钮和动作。'],
  users: ['用户管理', '管理账号、邀请码和用户专属对接地址。'],
  audit: ['操作日志', '查看所有账号的后台登录和操作记录。'],
  system: ['系统管理', '配置邮箱、通知、支付、模板和隐藏入口。'],
  json: ['JSON 管理', '直接编辑当前用户的完整配置 JSON。'],
  exchange: ['配置交换', '导出、导入配置文件，或生成云端链接分享给别人。'],
  dock: ['工具箱对接', '选择工具箱 UI 版本并下载当前用户专属 EXE。'],
  announcements: ['更新公告', '查看管理后台的功能更新、问题修复和系统通知。'],
  'cloud-resolver': ['网盘资源', '解析分享链接、管理个人资源并配置多线路下载。']
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
  const systemNav = sidebar.querySelector('.nav[data-view="system"]');
  if (systemNav && !sidebar.querySelector('.nav[data-view="audit"]')) {
    const auditNav = document.createElement('button');
    auditNav.className = 'nav super-only';
    auditNav.dataset.view = 'audit';
    auditNav.type = 'button';
    auditNav.textContent = '操作日志';
    systemNav.insertAdjacentElement('afterend', auditNav);
  }

  sidebar.querySelectorAll('.nav').forEach((button) => {
    const view = button.dataset.view || '';
    const text = view === 'announcements' ? '更新公告' : button.textContent.trim();
    button.innerHTML = `<span class="nav-icon">${NAV_ICONS[view] || '•'}</span><span class="nav-text">${escapeHtml(text)}</span>`;
    if (view === 'announcements') button.insertAdjacentHTML('beforeend', '<span id="announcementUnreadBadge" class="nav-badge" hidden>0</span>');
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
    <div id="clientBuildDialog" class="client-build-dialog" role="dialog" aria-modal="true" aria-labelledby="clientBuildTitle" tabindex="-1">
      <div class="client-build-ring"><span></span></div>
      <h2 id="clientBuildTitle">正在生成工具箱 EXE</h2>
      <p id="clientBuildText" aria-live="polite">正在准备编译环境...</p>
      <div class="client-build-meter" role="progressbar" aria-label="客户端生成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="12"><i id="clientBuildMeter"></i></div>
      <div class="client-build-meta">
        <span id="clientBuildElapsed">已用时 00:00</span>
        <span id="clientBuildHint">首次生成通常需要 10-60 秒</span>
      </div>
      <button id="clientBuildClose" type="button" hidden>关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('clientBuildClose').onclick = () => closeClientBuildDialog();
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('clientBuildClose').hidden) {
      event.preventDefault();
      closeClientBuildDialog();
      return;
    }
    if (event.key !== 'Tab') return;
    const close = $('clientBuildClose');
    if (!close.hidden) {
      event.preventDefault();
      close.focus();
    } else {
      event.preventDefault();
      $('clientBuildDialog').focus();
    }
  });
  return overlay;
}

function openClientBuildDialog(message = '正在编译客户端，请稍等...') {
  const overlay = ensureClientBuildDialog();
  state.clientBuildReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.clientBuildStartedAt = Date.now();
  overlay.classList.remove('done', 'error');
  overlay.classList.add('show');
  $('clientBuildTitle').textContent = '正在生成工具箱 EXE';
  $('clientBuildText').textContent = message;
  $('clientBuildHint').textContent = '首次生成通常需要 10-60 秒，缓存命中会更快';
  $('clientBuildMeter').style.width = '12%';
  document.querySelector('.client-build-meter')?.setAttribute('aria-valuenow', '12');
  $('clientBuildClose').hidden = true;
  $('clientBuildDialog').setAttribute('aria-busy', 'true');
  $('clientBuildDialog').focus();
  window.clearInterval(state.clientBuildTimer);
  state.clientBuildTimer = window.setInterval(() => {
    const elapsed = Date.now() - state.clientBuildStartedAt;
    $('clientBuildElapsed').textContent = `已用时 ${formatElapsed(elapsed)}`;
    const pct = Math.min(88, 12 + Math.floor(elapsed / 900));
    $('clientBuildMeter').style.width = `${pct}%`;
    document.querySelector('.client-build-meter')?.setAttribute('aria-valuenow', String(pct));
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
    document.querySelector('.client-build-meter')?.setAttribute('aria-valuenow', '100');
    $('clientBuildDialog').setAttribute('aria-busy', 'false');
  } else if (type === 'error') {
    window.clearInterval(state.clientBuildTimer);
    $('clientBuildTitle').textContent = '生成失败';
    $('clientBuildText').textContent = message || '请检查登录状态或服务器编译环境。';
    $('clientBuildHint').textContent = '刷新重新登录后可再次尝试';
    $('clientBuildMeter').style.width = '100%';
    document.querySelector('.client-build-meter')?.setAttribute('aria-valuetext', '生成失败');
    $('clientBuildClose').hidden = false;
    $('clientBuildDialog').setAttribute('aria-busy', 'false');
    $('clientBuildClose').focus();
  } else {
    $('clientBuildText').textContent = message;
  }
}

function closeClientBuildDialog() {
  window.clearInterval(state.clientBuildTimer);
  const overlay = $('clientBuildOverlay');
  if (overlay) overlay.classList.remove('show', 'done', 'error');
  const returnFocus = state.clientBuildReturnFocus;
  state.clientBuildReturnFocus = null;
  if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') {
    returnFocus.focus();
  }
}

function ensureCloudResolverParseDialog() {
  let overlay = $('cloudResolverParseOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'cloudResolverParseOverlay';
  overlay.className = 'client-build-overlay';
  overlay.innerHTML = `
    <div class="client-build-dialog" role="dialog" aria-modal="true" aria-labelledby="cloudResolverParseTitle">
      <div class="client-build-ring"><span></span></div>
      <h2 id="cloudResolverParseTitle">正在解析网盘资源</h2>
      <p id="cloudResolverParseText">正在连接解析服务并读取分享内容...</p>
      <div class="client-build-meter"><i id="cloudResolverParseMeter"></i></div>
      <div class="client-build-meta">
        <span id="cloudResolverParseElapsed">已用时 00:00</span>
        <span id="cloudResolverParseHint">解析时间取决于上游响应和文件数量</span>
      </div>
      <button id="cloudResolverParseClose" type="button" hidden>关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);
  $('cloudResolverParseClose').onclick = closeCloudResolverParseDialog;
  return overlay;
}

function openCloudResolverParseDialog() {
  const overlay = ensureCloudResolverParseDialog();
  window.clearTimeout(state.cloudResolverParseCloseTimer);
  window.clearInterval(state.cloudResolverParseTimer);
  state.cloudResolverParseStartedAt = Date.now();
  state.cloudResolverParseActive = true;
  overlay.classList.remove('done', 'error');
  overlay.classList.add('show');
  $('cloudResolverParseTitle').textContent = '正在解析网盘资源';
  $('cloudResolverParseText').textContent = '正在连接解析服务并读取分享内容...';
  $('cloudResolverParseHint').textContent = '解析时间取决于上游响应和文件数量';
  $('cloudResolverParseElapsed').textContent = '已用时 00:00';
  $('cloudResolverParseMeter').style.width = '12%';
  $('cloudResolverParseClose').hidden = true;
  if ($('cloudResolverParseBtn')) $('cloudResolverParseBtn').disabled = true;
  state.cloudResolverParseTimer = window.setInterval(() => {
    const elapsed = Date.now() - state.cloudResolverParseStartedAt;
    $('cloudResolverParseElapsed').textContent = `已用时 ${formatElapsed(elapsed)}`;
    const pct = Math.min(88, 12 + Math.floor(elapsed / 900));
    $('cloudResolverParseMeter').style.width = `${pct}%`;
  }, 1000);
}

function updateCloudResolverParseDialog(type, message) {
  const overlay = ensureCloudResolverParseDialog();
  const done = type === 'done';
  const failed = type === 'error';
  window.clearInterval(state.cloudResolverParseTimer);
  state.cloudResolverParseTimer = null;
  state.cloudResolverParseActive = false;
  overlay.classList.toggle('done', done);
  overlay.classList.toggle('error', failed);
  $('cloudResolverParseTitle').textContent = done ? '网盘资源解析完成' : '网盘资源解析失败';
  $('cloudResolverParseText').textContent = message || (done ? '正在打开文件选择窗口...' : '请检查分享链接后重试。');
  $('cloudResolverParseHint').textContent = done ? '即将打开文件选择窗口' : '任务已保留在解析失败列表中';
  $('cloudResolverParseMeter').style.width = '100%';
  $('cloudResolverParseClose').hidden = !failed;
  if ($('cloudResolverParseBtn')) $('cloudResolverParseBtn').disabled = false;
}

function closeCloudResolverParseDialog() {
  window.clearInterval(state.cloudResolverParseTimer);
  window.clearTimeout(state.cloudResolverParseCloseTimer);
  state.cloudResolverParseTimer = null;
  state.cloudResolverParseCloseTimer = null;
  state.cloudResolverParseActive = false;
  const overlay = $('cloudResolverParseOverlay');
  if (overlay) overlay.classList.remove('show', 'done', 'error');
  if ($('cloudResolverParseBtn')) $('cloudResolverParseBtn').disabled = false;
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
    await loadAdminAnnouncementsSafe();
    await loadBuiltinFunctions();
    await loadClientVariants();
    state.config = await api(configApiPath());
    state.buttons = await api(buttonsApiPath());
    await loadCloudResolver();
    renderAll();
    if (viewToRestore) switchView(viewToRestore);
    const paymentReturn = await handlePaymentReturnStatus();
    if (!paymentReturn) {
      showUnreadNoticePopup();
      showAdminAnnouncementPopup();
    }
    showToast('配置读取成功。', 'success');
    loadMenuIcons().then(() => {
      renderMenuIcons();
      if (state.activeView === 'buttons') renderManagedSections();
    }).catch((error) => {
      state.menuIcons = [];
      state.menuIconLibraryError = error.message || '图标库读取失败。';
      renderMenuIcons();
    });
  } catch (error) {
    handleLoadFailure(error, isAuthFailure(error));
  }
}

function handleLoadFailure(error, silent = false) {
  if (!silent) {
    const message = error?.message || '配置读取失败，请刷新后重试。';
    setStatus(message, true);
    showToast(message, 'error');
    return;
  }
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

const CLOUD_ERROR_MESSAGES = {
  USER_ENTITLEMENT_REQUIRED: '当前账号尚未开通网盘解析，请购买套餐或兑换激活码。',
  PROVIDER_DISABLED: '当前网盘平台暂未开放。',
  INVALID_SHARE_URL: '网盘分享链接格式不正确。',
  ACCESS_CODE_REQUIRED: '该分享需要访问码，请填写正确的访问码后重试。',
  ACCESS_CODE_INVALID: '访问码错误，请重新输入。',
  SHARE_NOT_FOUND: '天翼云分享链接不存在、已失效或分享码不正确。',
  LOGIN_REQUIRED_FOR_DOWNLOAD: '天翼云已识别文件，但官方直链下载需要登录天翼云账号；请打开分享页登录或转存后下载。',
  BROWSER_DOWNLOAD_REQUIRED: '文件需要打开官方页面完成下载。',
  PROVIDER_RESPONSE_INVALID: '天翼云返回的数据格式异常，请稍后重试。',
  PROVIDER_BAD_RESPONSE: '网盘返回的数据格式异常，请稍后重试。',
  OFFICIAL_API_UNSUPPORTED: '当前平台暂不支持正规解析下载。',
  SHARE_PAGE_UNSUPPORTED: '蓝奏云分享页面格式暂不兼容。',
  SHARE_FILES_UNAVAILABLE: '蓝奏云文件列表暂时不可用，请稍后重试。',
  DOWNLOAD_URL_UNAVAILABLE: '网盘暂未返回下载地址，请重试或打开官方分享页查看。',
  FEIJI_LOGIN_REQUIRED: '该文件需要在小飞机官方页面登录，并满足会员或官方授权条件后下载。',
  WEIYUN_LOGIN_REQUIRED: '腾讯微云文件已识别，下载需要登录微云；请打开官方下载页，登录后选择文件下载。',
  WEIYUN_VERIFICATION_REQUIRED: '腾讯微云要求身份或安全验证，请在官方分享页完成验证后重试。',
  SHARE_EXPIRED: '分享链接已失效、被取消或不存在，请检查链接后重试。',
  PROVIDER_UNAVAILABLE: '网盘服务暂时不可用，请稍后重试。',
  PROVIDER_HOST_BLOCKED: '下载地址域名不在允许范围内。',
  PROVIDER_REDIRECT_BLOCKED: '下载服务返回了不安全的跳转地址，已拦截。',
  QAIU_API_KEY_REQUIRED: '尚未配置聚合解析服务 API Key，请联系总管理员。',
  QAIU_API_KEY_INVALID: '聚合解析服务 API Key 无效，请检查系统设置。',
  QAIU_QUOTA_EXHAUSTED: '聚合解析服务额度不足或当前密钥无解析权限。',
  QAIU_LINK_UNSUPPORTED: '聚合解析服务暂不支持此分享链接，或链接格式有误。',
  QAIU_PARSE_FAILED: '聚合解析失败，请检查分享是否有效或稍后重试。',
  QAIU_DOWNLOAD_URL_UNAVAILABLE: '聚合解析服务没有返回有效下载地址。',
  QAIU_BAD_DOWNLOAD_URL: '聚合解析服务返回的下载地址无效，已拦截。',
  RESOURCE_NOT_FOUND: '资源不存在。',
  RESOURCE_FORBIDDEN: '没有权限访问该资源。',
  DAILY_QUOTA_EXCEEDED: '今日解析次数已用完。',
  PARSE_QUOTA_EXCEEDED: '套餐解析次数已用完。',
  TRAFFIC_QUOTA_EXCEEDED: '下载流量额度已用完。',
  ALL_DOWNLOAD_SOURCES_FAILED: '所有下载线路均不可用，请稍后重试。',
  DUPLICATE_DOWNLOAD_SOURCE: '该下载线路已经存在。',
  AMBIGUOUS_BUTTON_MATCH: '检测到多个同名按钮，请选择要合并的按钮。'
};

const CLOUD_PROVIDER_LABELS = {
  lanzou: '蓝奏云', '蓝奏云优享': '蓝奏云', tianyi: '天翼云盘', '天翼云盘': '天翼云盘',
  '123pan': '123 云盘', xiaofeiji: '小飞机网盘', weiyun: '腾讯微云', qaiu: '其他网盘', mock: '测试平台', 'Mock Provider': '测试平台'
};
const CLOUD_STATUS_LABELS = {
  pending: '等待中', parsed: '已解析', failed: '失败', browser: '浏览器下载', cancelled: '已取消', active: '启用', enabled: '启用',
  disabled: '停用', draft: '草稿', assigned: '代理库存', sold: '已销售', redeemed: '已兑换', used: '已使用', available: '可用',
  unavailable: '不可用', expired: '已过期', processing: '处理中', done: '已完成'
};
const CLOUD_SOURCE_LABELS = {
  admin_grant: '管理员授权', admin_renew: '管理员续期', purchase: '套餐购买', redeem: '激活码兑换',
  agent_sale: '代理销售', system: '系统', user: '用户操作'
};
function cloudProviderLabel(value, fallback = '未知平台') {
  const text = String(value || '').trim();
  return CLOUD_PROVIDER_LABELS[text] || CLOUD_PROVIDER_LABELS[text.toLowerCase()] || fallback;
}
function cloudStatusLabel(value, fallback = '未知状态') {
  const text = String(value || '').trim();
  return CLOUD_STATUS_LABELS[text.toLowerCase()] || fallback;
}
function cloudDateTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}
function cloudSourceLabel(value) {
  const text = String(value || '').trim();
  return CLOUD_SOURCE_LABELS[text] || text || '未记录';
}

function cloudErrorMessage(error) {
  const raw = String(error?.message || error || '网盘资源操作失败。');
  const code = raw.match(/[A-Z][A-Z0-9_]{3,}/)?.[0];
  return CLOUD_ERROR_MESSAGES[code] || raw;
}

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function cloudPromoExpiryForSave(priceId, basePriceId, expiryId, label) {
  const promo = Number($(priceId).value || 0);
  const base = Number($(basePriceId).value || 0);
  if (!(promo > 0 && promo < base)) return '';
  const expiresAt = isoDateTimeValue($(expiryId).value);
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) throw new Error(`${label}需要设置一个未来的截止时间。`);
  return expiresAt;
}

function planPromoStatus(plan, priceKey, expiryKey, baseKey) {
  const promo = Number(plan[priceKey] || 0);
  const base = Number(plan[baseKey] || 0);
  if (!(promo > 0 && promo < base)) return null;
  if (!plan[expiryKey]) return { active: true, missingDeadline: true, label: '未设置截止时间' };
  const timestamp = Date.parse(plan[expiryKey]);
  if (!Number.isFinite(timestamp)) return { active: false, invalidDeadline: true, label: '截止时间无效' };
  const active = timestamp > Date.now();
  const deadline = new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  return { active, expired: !active, deadline, label: active ? `截止时间：${deadline}` : '活动已结束' };
}

function planPromoLabel(plan, priceKey, expiryKey, baseKey) {
  return planPromoStatus(plan, priceKey, expiryKey, baseKey)?.label || '';
}

function cloudPlanCards(plans, mode = 'purchase') {
  if (mode !== 'agent' && isAgent()) mode = 'agent';
  const channels = state.cloudResolver.paymentChannels || [];
  return (plans || []).length ? plans.map((plan) => {
    const memberPrice = Number(plan.memberPrice || 0);
    const promoPrice = Number(plan.promoPrice || 0);
    const memberPromoStatus = planPromoStatus(plan, 'promoPrice', 'promoExpiresAt', 'memberPrice');
    const agentPromoStatus = planPromoStatus(plan, 'agentPromoPrice', 'agentPromoExpiresAt', 'agentWholesalePrice');
    const memberPromoLabel = memberPromoStatus?.label || '';
    const agentPromoLabel = agentPromoStatus?.label || '';
    const memberPromoActive = memberPromoStatus?.active === true;
    const agentPromoActive = agentPromoStatus?.active === true;
    const hasPromo = mode !== 'agent' && memberPromoActive;
    const effectivePrice = hasPromo ? promoPrice : memberPrice;
    const agentPrice = agentPromoActive ? Number(plan.agentPromoPrice || 0) : Number(plan.agentWholesalePrice || 0);
    const price = Number((mode === 'agent' ? agentPrice : effectivePrice) || 0).toFixed(2);
    const days = Number(plan.durationDays || 0);
    const quota = Number(plan.parseQuota);
    const paid = Number(price) > 0;
    const unavailable = mode === 'agent' ? !paid : paid && !channels.length;
    const priceNote = hasPromo
      ? `<span class="resolver-plan-price-note"><span>会员活动价</span><small>${escapeHtml(memberPromoLabel)}</small><del>原价 ¥${memberPrice.toFixed(2)}</del></span>`
      : mode === 'agent' && agentPromoActive
        ? `<span class="resolver-plan-price-note"><span>代理活动价</span><small>${escapeHtml(agentPromoLabel)}</small><del>原价 ¥${Number(plan.agentWholesalePrice || 0).toFixed(2)}</del></span>`
        : mode === 'agent' && agentPromoStatus
          ? `<span class="resolver-plan-price-note"><small class="cloud-plan-promo-expired">${escapeHtml(agentPromoLabel)}</small></span>`
          : memberPromoStatus && !memberPromoActive
            ? `<span class="resolver-plan-price-note"><small class="cloud-plan-promo-expired">${escapeHtml(memberPromoLabel)}</small></span>`
      : '<span>人民币 / 套</span>';
    const unavailableTitle = mode === 'agent' && !paid ? '管理员尚未配置代理拿货价' : '管理员尚未配置可用支付通道';
    return `<article class="resolver-plan-card"><div class="resolver-plan-heading"><h3>${escapeHtml(plan.name || '网盘套餐')}</h3>${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ''}</div><div class="resolver-plan-price"><strong>¥${price}</strong>${priceNote}</div><dl class="resolver-plan-benefits"><div><dt>有效期</dt><dd>${days.toLocaleString('zh-CN')} 天</dd></div><div><dt>解析额度</dt><dd>${quota < 0 ? '不限' : `${quota.toLocaleString('zh-CN')} 次`}</dd></div>${Number(plan.dailyParseLimit) ? `<div><dt>每日额度</dt><dd>${Number(plan.dailyParseLimit) < 0 ? '不限' : `${Number(plan.dailyParseLimit).toLocaleString('zh-CN')} 次`}</dd></div>` : ''}${Number(plan.trafficQuota) ? `<div><dt>下载流量</dt><dd>${Number(plan.trafficQuota) < 0 ? '不限' : `${Number(plan.trafficQuota).toLocaleString('zh-CN')} MB`}</dd></div>` : ''}</dl><button type="button" class="resolver-plan-buy" data-cloud-buy="${escapeAttr(plan.id)}" data-cloud-buy-mode="${escapeAttr(mode)}" ${unavailable ? `disabled title="${unavailableTitle}"` : ''}>${unavailable ? '暂不可购买' : mode === 'renew' ? '选择续费方式' : paid ? '立即购买' : '免费开通'}</button></article>`;
  }).join('') : '<p class="empty-cell">暂无可用套餐，请联系管理员配置。</p>';
}

function renderAdminCloudPlanRows(plans) {
  return (plans || []).map((plan) => {
    const memberPrice = Number(plan.memberPrice || 0);
    const promoPrice = Number(plan.promoPrice || 0);
    const memberPromo = planPromoStatus(plan, 'promoPrice', 'promoExpiresAt', 'memberPrice');
    const agentPromo = planPromoStatus(plan, 'agentPromoPrice', 'agentPromoExpiresAt', 'agentWholesalePrice');
    const memberNoteClass = memberPromo?.active ? 'cloud-plan-pricing-note' : 'cloud-plan-promo-expired';
    const agentNoteClass = agentPromo?.active ? 'cloud-plan-pricing-note' : 'cloud-plan-promo-expired';
    const pricing = `<strong>¥${memberPrice.toFixed(2)}</strong>${memberPromo ? `<small class="${memberNoteClass}">会员活动价 ¥${promoPrice.toFixed(2)} · ${escapeHtml(memberPromo.label)}</small>` : ''}`;
    const agentPricing = `<strong>¥${Number(plan.agentWholesalePrice || 0).toFixed(2)}</strong>${agentPromo ? `<small class="${agentNoteClass}">代理活动价 ¥${Number(plan.agentPromoPrice || 0).toFixed(2)} · ${escapeHtml(agentPromo.label)}</small>` : ''}`;
    return `<tr><td>${escapeHtml(plan.name)}</td><td>${pricing}</td><td>${agentPricing}</td><td>${Number(plan.sortOrder || 0)}</td><td>${Number(plan.durationDays || 0)} 天</td><td>${Number(plan.parseQuota) < 0 ? '不限' : Number(plan.parseQuota || 0)}</td><td>${plan.enabled === false ? '停用' : '启用'}</td><td><button type="button" data-cloud-plan-edit="${escapeAttr(plan.id)}">编辑</button> <button type="button" data-cloud-plan-disable="${escapeAttr(plan.id)}" ${plan.enabled === false ? 'disabled' : ''}>${plan.enabled === false ? '已停用' : '停用'}</button>${plan.enabled === false ? ` <button type="button" class="danger" data-cloud-plan-delete="${escapeAttr(plan.id)}">删除</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-cell">暂无套餐</td></tr>';
}

function publicPaymentMethod(channel) {
  const type = String(channel.paymentType || '').toLowerCase();
  return type === 'wxpay' ? { key: 'wechat', label: '微信支付', mark: '微' }
    : type === 'alipay' ? { key: 'alipay', label: '支付宝', mark: '支' }
      : { key: 'other', label: '在线支付', mark: '付' };
}

function renderAgentPlanCards(plans) {
  const host = $('cloudResolverAgentPlanCards');
  if (!host) return;
  const previous = host.scrollTop;
  host.innerHTML = cloudPlanCards(plans, 'agent');
  host.scrollTop = previous;
}

async function loadCloudResolver() {
  const feature = state.cloudResolver;
  feature.error = '';
  try { feature.config = await api('/api/cloud-resolver/config'); } catch (error) { feature.error = cloudErrorMessage(error); }
  try { feature.entitlement = await api('/api/cloud-resolver/entitlement'); } catch (error) { feature.error = cloudErrorMessage(error); }
  try { feature.plans = (await api('/api/cloud-resolver/plans')).plans || []; } catch (error) { feature.plans = []; feature.error = feature.error || cloudErrorMessage(error); }
  try { feature.paymentChannels = (await api('/api/cloud-resolver/payment-channels')).channels || []; } catch { feature.paymentChannels = []; }
  try {
    feature.orders = (await api(isSuper() ? '/api/super/orders?scope=cloud_resolver' : '/api/cloud-resolver/orders')).orders || [];
  } catch { feature.orders = []; }
  if (feature.entitlement?.allowed) {
    try {
      const resources = await api('/api/cloud-resolver/resources');
      feature.resources = resources.resources || [];
      feature.sources = resources.sources || [];
      const tasks = await api('/api/cloud-resolver/parse-tasks');
      feature.tasks = tasks.tasks || [];
    } catch (error) { feature.error = cloudErrorMessage(error); }
  } else {
    feature.tasks = []; feature.resources = []; feature.sources = [];
  }
  if (isSuper()) {
    try { feature.admin = await api('/api/admin/cloud-resolver/settings'); } catch { feature.admin = null; }
    try { feature.adminPlans = (await api('/api/admin/cloud-resolver/plans')).plans || []; } catch { feature.adminPlans = []; }
    try { feature.codes = (await api('/api/admin/cloud-resolver/codes')).codes || []; } catch { feature.codes = []; }
    await loadUserCloudEntitlements();
  }
  if (isAgent()) {
    try { feature.agentCodes = (await api('/api/agent/cloud-resolver/code-inventory')).codes || []; } catch { feature.agentCodes = []; }
    try { feature.agentSales = (await api('/api/agent/cloud-resolver/sales')).sales || []; } catch { feature.agentSales = []; }
    try { feature.agentCodeOrders = (await api('/api/agent/cloud-resolver/code-orders')).orders || []; } catch { feature.agentCodeOrders = []; }
  }
}

function cloudOrderStatus(status) {
  return ({pending: '待支付', paid: '已支付', done: '已完成', cancelled: '已取消', expired: '已过期'})[status] || '未知状态';
}
function cloudRemaining(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return '已失效';
  const days = Math.floor(value / 86400); const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60); const secs = value % 60;
  return `${days ? days + '天 ' : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function cloudOrderContent(order) {
  const detail = String(order.detail || '').trim();
  if (detail && !['cloud_resolver_plan_purchase', 'cloud_resolver_code_generate'].includes(detail)) return detail;
  if (order.action === 'cloud_resolver_code_generate') {
    return `生成网盘激活码 × ${Math.max(1, Number(order.request?.count || 1))}`;
  }
  if (order.action === 'cloud_resolver_plan_purchase') {
    return `网盘解析套餐 ${order.request?.planName || order.request?.planId || ''}`.trim();
  }
  return detail || '网盘解析订单';
}
function renderCloudOrders() {
  const rows = $('cloudResolverOrderRows'); if (!rows) return;
  const orders = state.cloudResolver.orders || [];
  const adminView = isSuper();
  const title = $('cloudResolverOrdersTitle');
  if (title) title.textContent = adminView ? '所有用户网盘解析订单' : '我的订单';
  const adminActions = $('cloudResolverAdminOrderActions');
  if (adminActions) adminActions.hidden = !adminView;
  const personalRefresh = $('cloudResolverOrdersRefreshBtn');
  if (personalRefresh) personalRefresh.hidden = adminView;
  const selectHeader = $('cloudResolverSelectAllOrders')?.closest('th');
  if (selectHeader) selectHeader.hidden = !adminView;
  document.querySelectorAll('.cloud-order-owner').forEach((cell) => { cell.hidden = !adminView; });
  const visibleIds = new Set(orders.map((order) => String(order.id || '')).filter(Boolean));
  state.cloudResolverAdminSelectedOrderIds = new Set(
    [...state.cloudResolverAdminSelectedOrderIds].filter((id) => visibleIds.has(id))
  );
  const updateSelectionControls = () => {
    const selectedCount = state.cloudResolverAdminSelectedOrderIds.size;
    const deleteSelected = $('cloudResolverDeleteSelectedOrdersBtn');
    if (deleteSelected) deleteSelected.disabled = selectedCount === 0;
    const selectAll = $('cloudResolverSelectAllOrders');
    if (selectAll) {
      selectAll.checked = orders.length > 0 && selectedCount === orders.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < orders.length;
    }
  };
  rows.innerHTML = orders.length ? orders.map((order) => {
    const plans = adminView ? (state.cloudResolver.adminPlans || []) : (state.cloudResolver.plans || []);
    const planName = adminView
      ? (order.detail || (plans.find((plan) => plan.id === order.request?.planId)?.name) || order.request?.planId || '网盘套餐')
      : (order.request?.planId ? (plans.find((plan) => plan.id === order.request.planId)?.name || order.request.planId) : order.detail || '网盘套餐');
    const canPay = !adminView && order.status === 'pending' && !order.isExpired && Number(order.remainingSeconds || 0) > 0 && order.paymentUrl;
    const account = `${order.displayName || order.username || order.userId || ''}${order.username && order.displayName !== order.username ? `（${order.username}）` : ''}`;
    const orderId = String(order.id || '');
    const canMarkDone = order.action !== 'cloud_resolver_code_generate' || !!order.fulfilledAt;
    const actions = adminView
      ? `<div class="actions"><button type="button" data-cloud-resolver-order-status="done" data-order-id="${escapeAttr(orderId)}"${canMarkDone ? '' : ' disabled title="未付款发卡订单不能标记为已处理"'}>已处理</button><button type="button" class="danger" data-cloud-resolver-order-status="cancelled" data-order-id="${escapeAttr(orderId)}">取消</button><button type="button" class="danger" data-cloud-resolver-order-delete="${escapeAttr(orderId)}">删除</button></div>`
      : canPay ? `<button type="button" data-cloud-continue-order="${escapeAttr(orderId)}">继续支付</button>` : order.status === 'expired' ? '请重新购买' : '-';
    return `<tr>${adminView ? `<td><input type="checkbox" data-cloud-resolver-order-select="${escapeAttr(orderId)}" aria-label="选择订单 ${escapeAttr(orderId)}"${state.cloudResolverAdminSelectedOrderIds.has(orderId) ? ' checked' : ''}></td><td>${escapeHtml(account)}</td>` : ''}<td>${escapeHtml(adminView ? cloudOrderContent(order) : planName)}</td><td>¥${Number(order.amount || 0).toFixed(2)}</td><td>${escapeHtml(cloudOrderStatus(order.status))}</td><td>${order.status === 'pending' ? cloudRemaining(order.remainingSeconds) : order.status === 'expired' ? '已失效' : '-'}</td><td>${escapeHtml(cloudDateTime(order.createdAt))}</td><td>${actions}</td></tr>`;
  }).join('') : `<tr><td colspan="${adminView ? 8 : 6}" class="empty-cell">暂无订单</td></tr>`;
  if (adminView) {
    rows.querySelectorAll('[data-cloud-resolver-order-status]').forEach((button) => {
      button.onclick = () => updateOrderStatus(button.dataset.orderId, button.dataset.cloudResolverOrderStatus)
        .catch((error) => setStatus(error.message, true));
    });
    rows.querySelectorAll('[data-cloud-resolver-order-delete]').forEach((button) => {
      button.onclick = () => deleteCloudResolverOrder(button.dataset.cloudResolverOrderDelete)
        .catch((error) => setStatus(error.message, true));
    });
    rows.querySelectorAll('[data-cloud-resolver-order-select]').forEach((checkbox) => {
      checkbox.onchange = () => {
        const id = checkbox.dataset.cloudResolverOrderSelect || '';
        if (checkbox.checked) state.cloudResolverAdminSelectedOrderIds.add(id);
        else state.cloudResolverAdminSelectedOrderIds.delete(id);
        updateSelectionControls();
      };
    });
  }
  updateSelectionControls();
}

async function loadUserCloudEntitlements() {
  if (!isSuper()) return;
  const rows = await Promise.all((state.users || []).map(async (user) => {
    try { return [user.id, await api(`/api/admin/users/${encodeURIComponent(user.id)}/cloud-entitlement`)]; }
    catch { return [user.id, { allowed: false, entitlement: null }]; }
  }));
  state.cloudUserEntitlements = Object.fromEntries(rows);
}

function entitlementSummary(entitlement) {
  if (!entitlement) return '未授权';
  const quota = Number(entitlement.parseQuota) < 0 ? '解析不限' : `解析 ${Math.max(0, Number(entitlement.parseQuota || 0) - Number(entitlement.parseUsed || 0))} 次`;
  const traffic = Number(entitlement.trafficQuota) < 0 ? '流量不限' : `流量 ${Math.max(0, Number(entitlement.trafficQuota || 0) - Number(entitlement.trafficUsed || 0))} 兆字节`;
  return `${cloudStatusLabel(entitlement.status, entitlement.status === 'active' ? '已启用' : '已停用')} · ${quota} · ${traffic} · 到期 ${entitlement.expiresAt || entitlement.expiredAt ? cloudDateTime(entitlement.expiresAt || entitlement.expiredAt) : '长期'}`;
}

async function grantUserCloudEntitlement(userId, renew = false) {
  const plans = state.cloudResolver.adminPlans || [];
  const hint = plans.map((plan) => `${plan.id}: ${plan.name}（${plan.durationDays}天/${plan.parseQuota < 0 ? '不限' : plan.parseQuota + '次'}）`).join('\n');
  const planId = window.prompt(`选择套餐编号：\n${hint}`, plans[0]?.id || '');
  if (!planId) return;
  await api(`/api/admin/users/${encodeURIComponent(userId)}/cloud-entitlement/${renew ? 'renew' : 'grant'}`, { method: 'POST', body: JSON.stringify({ planId, renewExisting: true }) });
  await loadCloudResolver(); renderAll(); showToast(renew ? '用户网盘权益已续期。' : '用户网盘权益已授权。', 'success');
}

async function revokeUserCloudEntitlement(userId) {
  if (!window.confirm('确认撤销该用户的网盘解析权益吗？')) return;
  await api(`/api/admin/users/${encodeURIComponent(userId)}/cloud-entitlement/revoke`, { method: 'POST', body: '{}' });
  await loadCloudResolver(); renderAll(); showToast('用户网盘权益已撤销。', 'success');
}

async function showUserCloudEntitlementHistory(userId) {
  const result = await api(`/api/admin/users/${encodeURIComponent(userId)}/cloud-entitlement/history`);
  const rows = (result.items || []).slice(0, 10).map((item) => `${cloudDateTime(item.createdAt)} · ${cloudSourceLabel(item.source)} · +${item.addedDays || 0}天 · ${item.expiredAt ? cloudDateTime(item.expiredAt) : '长期'}`).join('\n');
  window.alert(rows || '暂无授权历史。');
}

function renderCloudAgentPanel() {
  const panel = $('cloudResolverAgentPanel');
  if (!panel) return;
  panel.hidden = !isAgent();
  if (!isAgent()) return;
  const feature = state.cloudResolver || {};
  const plans = feature.plans || [];
  renderAgentPlanCards(plans);
  const codeRows = $('cloudResolverAgentCodeRows');
  const codes = feature.agentCodes || [];
  const members = (state.users || []).filter((user) => user.parentAgentId === state.currentUser?.id && user.active !== false);
  const planSelect = $('cloudResolverAgentCodePlan');
  if (planSelect) {
    const selectedPlanId = planSelect.value;
    planSelect.innerHTML = plans.map((plan) => `<option value="${escapeAttr(plan.id)}">${escapeHtml(plan.name || '网盘套餐')}</option>`).join('') || '<option value="">暂无可用套餐</option>';
    if (plans.some((plan) => plan.id === selectedPlanId)) planSelect.value = selectedPlanId;
    renderAgentCloudCodePrice();
    renderAgentPlanCards(plans);
  }
  const codeSelect = $('cloudResolverAgentCodeSelect');
  const userSelect = $('cloudResolverAgentUserSelect');
  if (codeSelect) codeSelect.innerHTML = codes.filter((code) => code.redeemable !== false).map((code) => `<option value="${escapeAttr(code.inventoryId || '')}">${escapeHtml(code.maskedCode || code.inventoryId || '')} · ${escapeHtml(plans.find((plan) => plan.id === code.planId)?.name || code.planId || '')}</option>`).join('') || '<option value="">暂无可售库存</option>';
  if (userSelect) userSelect.innerHTML = members.map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(displayNameOf(user, user.username))}</option>`).join('') || '<option value="">暂无下级成员</option>';
  if (codeRows) codeRows.innerHTML = codes.map((code) => {
    const value = code.code || code.maskedCode || code.inventoryId || '';
    const copy = code.code ? `<button type="button" data-cloud-copy-agent-code="${escapeAttr(code.code)}">复制</button>` : '完整卡密仅在生成时提供';
    return `<tr><td><input class="cloud-code-input" type="text" readonly value="${escapeAttr(value)}" title="${code.code ? '完整卡密' : '此库存卡密由总管理员分配，未提供明文'}"></td><td>${escapeHtml(plans.find((plan) => plan.id === code.planId)?.name || code.planId || '')}</td><td>${escapeHtml(cloudStatusLabel(code.status))}</td><td>${Number(code.usedCount || 0)} / ${Number(code.maxUses || 1)}</td><td>${copy}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-cell">暂无代理卡密</td></tr>';
  const salesRows = $('cloudResolverAgentSalesRows');
  if (salesRows) salesRows.innerHTML = (feature.agentSales || []).map((sale) => `<tr><td>${escapeHtml(plans.find((plan) => plan.id === sale.planId)?.name || sale.planId || '')}</td><td>${escapeHtml(userNameFromId(sale.soldTo, sale.soldTo || ''))}</td><td>${escapeHtml(cloudDateTime(sale.soldAt))}</td><td>${escapeHtml(cloudStatusLabel(sale.status))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell">暂无销售记录</td></tr>';
  renderAgentCloudOrders();
}

function renderAgentCloudOrders() {
  const orderRows = $('cloudResolverAgentOrderRows');
  if (orderRows) orderRows.innerHTML = (state.cloudResolver?.agentCodeOrders || []).map((order) => {
    const canPay = order.status === 'pending' && !order.isExpired && Number(order.remainingSeconds || 0) > 0 && order.paymentUrl;
    return `<tr><td>${escapeHtml(order.detail || '生成网盘激活码')}</td><td>¥${Number(order.amount || 0).toFixed(2)}</td><td>${escapeHtml(cloudOrderStatus(order.status))}</td><td>${order.status === 'pending' ? cloudRemaining(order.remainingSeconds) : '-'}</td><td>${escapeHtml(cloudDateTime(order.createdAt))}</td><td>${canPay ? `<button type="button" data-agent-cloud-continue-order="${escapeAttr(order.id)}">继续支付</button>` : '-'}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-cell">暂无卡密订单</td></tr>';
}

function renderAgentCloudCodePrice() {
  const label = $('cloudResolverAgentCodePrice');
  const selectedId = $('cloudResolverAgentCodePlan')?.value;
  const plan = (state.cloudResolver?.plans || []).find((item) => item.id === selectedId);
  if (label) {
    const active = plan && planPromoStatus(plan, 'agentPromoPrice', 'agentPromoExpiresAt', 'agentWholesalePrice');
    const price = active?.active ? Number(plan.agentPromoPrice || 0) : Number(plan?.agentWholesalePrice || 0);
    label.textContent = plan ? `代理拿货价：¥${price.toFixed(2)} / 张${active ? `（${active.label}）` : ''}` : '请选择套餐查看拿货价';
  }
}

async function sellCloudAgentCode() {
  const inventoryId = $('cloudResolverAgentCodeSelect')?.value || '';
  const userId = $('cloudResolverAgentUserSelect')?.value || '';
  if (!inventoryId || !userId) throw new Error('请选择可售卡密和下级成员。');
  await api('/api/agent/cloud-resolver/sell-code', { method: 'POST', body: JSON.stringify({ inventoryId, userId }) });
  await loadCloudResolver(); renderCloudResolver(); renderCloudAgentPanel(); showToast('卡密已销售给下级成员。', 'success');
}

function renderCloudResolver() {
  const feature = state.cloudResolver || {};
  const entitlement = feature.entitlement && feature.entitlement.entitlement;
  const status = $('cloudResolverStatus');
  if (!status) return;
  const allowed = !!(feature.entitlement && feature.entitlement.allowed);
  renderCloudOrders();
  status.textContent = feature.error ? feature.error : (allowed ? '已启用' : '需要授权');
  status.className = 'status-chip ' + (allowed ? 'is-ok' : 'is-warning');
  $('cloudResolverEntitlement').innerHTML = entitlement ? '<span>解析额度 <b>' + (entitlement.parseQuota < 0 ? '不限' : (entitlement.parseUsed || 0) + ' / ' + entitlement.parseQuota) + '</b></span><span>每日额度 <b>' + (entitlement.dailyParseLimit < 0 ? '不限' : (entitlement.dailyParseUsed || 0) + ' / ' + entitlement.dailyParseLimit) + '</b></span><span>流量额度 <b>' + (entitlement.trafficQuota < 0 ? '不限' : (entitlement.trafficUsed || 0) + ' / ' + entitlement.trafficQuota) + '</b></span><span>有效期 <b>' + escapeHtml(entitlement.expiresAt || entitlement.expiredAt ? cloudDateTime(entitlement.expiresAt || entitlement.expiredAt) : '长期') + '</b></span>' : '<span>当前账号没有网盘解析授权，可购买套餐或兑换激活码。</span>';
  const plansPanel = $('cloudResolverPlansPanel');
  if (plansPanel) plansPanel.hidden = allowed;
  const redeemPanel = $('cloudResolverRedeemPanel');
  if (redeemPanel) redeemPanel.hidden = allowed;
  const renewPanel = $('cloudResolverRenewPanel');
  if (renewPanel) renewPanel.hidden = !allowed;
  const planCards = $('cloudResolverPlanCards');
  if (planCards) planCards.innerHTML = cloudPlanCards(feature.plans || []);
  const renewCards = $('cloudResolverRenewCards');
  if (renewCards) renewCards.innerHTML = cloudPlanCards(feature.plans || [], 'renew');
  ['cloudResolverParsePanel', 'cloudResolverTasksPanel', 'cloudResolverFailedPanel', 'cloudResolverButtonManagerPanel'].forEach((id) => { const el = $(id); if (el) el.hidden = !allowed; });
  $('cloudResolverProviders').innerHTML = (feature.config && feature.config.providers || []).map(function(provider) { return '<span class="provider-pill ' + (provider.enabled ? 'is-ok' : 'is-off') + '"><b>' + escapeHtml(cloudProviderLabel(provider.id || provider.key || provider.name, provider.name || '未知平台')) + '</b> ' + escapeHtml(cloudStatusLabel(provider.status, provider.status || '未知状态')) + '</span>'; }).join('');
  const pages = state.config && state.config.pages || {};
  const scopeSelect = $('cloudResolverScopeId');
  const sectionSelect = $('cloudResolverSectionIndex');
  if (scopeSelect) {
    const currentScope = scopeSelect.value;
    scopeSelect.innerHTML = Object.keys(pages).map(function(id) { return '<option value="' + escapeAttr(id) + '">' + escapeHtml((pages[id] || {}).title || id) + '</option>'; }).join('');
    if (pages[currentScope]) scopeSelect.value = currentScope;
  }
  if (sectionSelect) {
    const scope = pages[(scopeSelect && scopeSelect.value) || Object.keys(pages)[0]] || {};
    const currentSection = sectionSelect.value;
    sectionSelect.innerHTML = (scope.sections || []).map(function(section, index) { return '<option value="' + index + '">' + escapeHtml(section.title || ('分组 ' + (index + 1))) + '</option>'; }).join('');
    if (currentSection !== '') sectionSelect.value = currentSection;
  }
  const taskRows = $('cloudResolverTaskRows');
  // Render official-page actions separately from direct-download actions.
  taskRows.innerHTML = feature.tasks && feature.tasks.length ? feature.tasks.map(function(task) { return '<tr><td>' + escapeHtml(task.providerName || cloudProviderLabel(task.provider)) + '</td><td class="mono-cell">' + escapeHtml(task.shareUrl || '') + '</td><td>' + escapeHtml(cloudStatusLabel(task.status)) + (task.errorCode ? '<small>' + escapeHtml(cloudErrorMessage({ message: task.errorCode })) + '</small>' : '') + '</td><td>' + (task.files || []).length + '</td><td>' + escapeHtml(cloudDateTime(task.createdAt)) + '</td><td>' + (task.status === 'parsed' ? '<button type="button" data-cloud-assign="' + escapeAttr(task.id) + '">预览并加入按钮</button>' : task.status === 'failed' ? '<button type="button" data-cloud-retry="' + escapeAttr(task.id) + '">重试</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="empty-cell">暂无解析任务</td></tr>';
  (feature.tasks || []).forEach(function(task, index) {
    if (!((task.provider === 'xiaofeiji' && task.status === 'failed') || task.provider === 'weiyun')) return;
    let url;
    try { url = new URL(task.shareUrl); } catch { return; }
    if (url.protocol !== 'https:' || !(task.provider === 'weiyun' ? url.hostname === 'share.weiyun.com' : /(^|\.)feijipan\.com$/i.test(url.hostname))) return;
    const cell = taskRows.rows[index]?.lastElementChild;
    if (!cell) return;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '打开官方下载页';
    cell.append(' ', link);
  });
  const sources = feature.sources || [];
  const resourceRows = $('cloudResolverResourceRows');
  if (resourceRows) resourceRows.innerHTML = sources.length ? sources.map(function(source) { return '<tr><td>' + escapeHtml(source.fileName || '') + '</td><td>' + escapeHtml(source.providerName || cloudProviderLabel(source.provider)) + '</td><td>' + escapeHtml(cloudStatusLabel(source.status)) + '</td><td>' + Number(source.priority || 0) + (source.isPrimary ? '（主线路）' : '') + '</td><td><button type="button" data-cloud-download="' + escapeAttr(source.id) + '">下载任务</button> <button type="button" data-cloud-refresh-source="' + escapeAttr(source.id) + '">刷新</button> <button type="button" class="danger" data-cloud-delete-source="' + escapeAttr(source.id) + '">删除</button></td></tr>'; }).join('') : '<tr><td colspan="5" class="empty-cell">暂无个人资源</td></tr>';
  const admin = $('cloudResolverAdminPanel');
  if (admin) { admin.hidden = !isSuper(); if (feature.admin) { $('cloudResolverEnabled').checked = feature.admin.enabled !== false; $('cloudResolverDailyLimit').value = feature.admin.settings && feature.admin.settings.dailyParseLimit != null ? feature.admin.settings.dailyParseLimit : 20; $('cloudResolverRetries').value = feature.admin.settings && feature.admin.settings.maxRetries != null ? feature.admin.settings.maxRetries : 2; $('cloudResolverQaiuApiBase').value = feature.admin.qaiuApiBase || ''; if (!$('cloudResolverQaiuApiKey').value) $('cloudResolverQaiuApiKey').placeholder = feature.admin.qaiuApiKeySet ? '密钥已配置；留空保持不变' : '总管理员填写服务 API Key'; } }
  const adminPlans = $('cloudResolverPlanRows');
  if (adminPlans) adminPlans.innerHTML = (feature.adminPlans || []).map((plan) => `<tr><td>${escapeHtml(plan.name)}</td><td>¥${Number(plan.memberPrice || 0).toFixed(2)}</td><td>${Number(plan.durationDays || 0)} 天</td><td>${Number(plan.parseQuota) < 0 ? '不限' : Number(plan.parseQuota || 0)}</td><td>${plan.enabled === false ? '停用' : '启用'}</td><td><button type="button" data-cloud-plan-disable="${escapeAttr(plan.id)}">${plan.enabled === false ? '已停用' : '停用'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">暂无套餐</td></tr>';
  const systemPlans = $('cloudResolverSystemPlanRows');
  if (systemPlans) systemPlans.innerHTML = renderAdminCloudPlanRows(feature.adminPlans || []);
  const codePlan = $('cloudResolverCodePlan');
  if (codePlan) codePlan.innerHTML = (feature.adminPlans || []).filter((plan) => plan.enabled !== false).map((plan) => `<option value="${escapeAttr(plan.id)}">${escapeHtml(plan.name)}</option>`).join('');
  const codeRows = $('cloudResolverCodeRows');
  if (codeRows) codeRows.innerHTML = (feature.codes || []).map((code) => {
    const codeId = code.id || code.codeId || code.codeHashPrefix || '';
    const value = code.code || code.maskedCode || '已隐藏';
    const canCopy = Boolean(code.code);
    const copyButton = canCopy
      ? `<button type="button" data-cloud-copy-code="${escapeAttr(code.code)}">复制</button>`
      : '<button type="button" disabled title="历史卡密未保存明文，无法恢复">无法复制</button>';
    const statusAction = code.status === 'disabled' ? 'enable' : 'disable';
    const statusLabel = statusAction === 'enable' ? '启用' : '停用';
    const selected = (state.cloudSelectedCodeIds || []).includes(codeId) ? ' checked' : '';
    return `<tr><td><input type="checkbox" class="cloud-code-check" value="${escapeAttr(codeId)}" aria-label="选择卡密"${selected}></td><td><input class="cloud-code-input" type="text" readonly value="${escapeAttr(value)}" title="${canCopy ? '完整卡密' : '历史记录仅保留遮罩值'}"></td><td>${escapeHtml((feature.adminPlans || []).find((plan) => plan.id === code.planId)?.name || code.planId || '')}</td><td>${escapeHtml(cloudStatusLabel(code.status))}</td><td>${Number(code.usedCount || 0)} / ${Number(code.maxUses || 1)}</td><td>${escapeHtml(code.assignedAgentId || '未分配')}</td><td>${copyButton} <button type="button" data-cloud-code-status="${statusAction}" data-cloud-code-id="${escapeAttr(codeId)}">${statusLabel}</button> <button type="button" class="danger" data-cloud-delete-code="${escapeAttr(codeId)}">删除</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty-cell">暂无激活码</td></tr>';
  const selectAll = $('cloudResolverSelectAllCodes');
  if (selectAll) selectAll.checked = Boolean((feature.codes || []).length) && (feature.codes || []).every((code) => (state.cloudSelectedCodeIds || []).includes(code.id || code.codeId || code.codeHashPrefix || ''));
  renderCloudAgentPanel();
}

function cloudTaskStatus(status) {
  return ({processing:'正在解析',pending:'等待解析',parsed:'解析成功，待处理',completed:'处理完成',failed:'解析失败',archived:'已归档',cancelled:'已取消'})[status] || '状态未知';
}
function renderCloudTaskTables(feature) {
  const tasks = feature.tasks || [];
  const active = tasks.filter((task) => !['failed','completed','archived'].includes(task.status));
  const failed = tasks.filter((task) => task.status === 'failed');
  const taskRows = $('cloudResolverTaskRows');
  if (taskRows) taskRows.innerHTML = active.length ? active.map((task) => `<tr><td><input type="checkbox" class="cloud-task-check" value="${escapeAttr(task.id)}"></td><td>${escapeHtml(task.providerName || cloudProviderLabel(task.provider))}</td><td class="mono-cell cloud-url-cell" title="${escapeAttr(task.shareUrl || '')}">${escapeHtml(task.shareUrl || '')}</td><td>${cloudTaskStatus(task.status)}</td><td>${(task.files || []).length}</td><td>${escapeHtml(cloudDateTime(task.createdAt))}</td><td>${escapeHtml(cloudDateTime(task.updatedAt))}</td><td>${task.status === 'parsed' ? `<button type="button" data-cloud-assign="${escapeAttr(task.id)}">选择文件</button>` : ''} <button type="button" data-cloud-archive="${escapeAttr(task.id)}">归档</button> <button type="button" class="danger" data-cloud-delete-task="${escapeAttr(task.id)}">删除</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-cell">暂无待处理任务</td></tr>';
  const failedRows = $('cloudResolverFailedRows');
  if (failedRows) failedRows.innerHTML = failed.length ? failed.map((task) => `<tr><td><input type="checkbox" class="cloud-failed-check" value="${escapeAttr(task.id)}"></td><td>${escapeHtml(task.providerName || cloudProviderLabel(task.provider))}</td><td class="mono-cell cloud-url-cell" title="${escapeAttr(task.shareUrl || '')}">${escapeHtml(task.shareUrl || '')}</td><td>${escapeHtml(cloudErrorMessage({message: task.errorCode || '解析失败'}))}</td><td>${escapeHtml(cloudDateTime(task.createdAt))}</td><td><button type="button" data-cloud-retry="${escapeAttr(task.id)}">重试</button> <button type="button" class="danger" data-cloud-delete-task="${escapeAttr(task.id)}">删除</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">暂无失败任务</td></tr>';
  const taskTitle = $('cloudResolverTasksTitle'); if (taskTitle) taskTitle.textContent = `解析任务（${active.length}）`;
  const failedTitle = $('cloudResolverFailedTitle'); if (failedTitle) failedTitle.textContent = `解析失败（${failed.length}）`;
}
async function cloudTaskBatch(action, ids) {
  if (!ids.length) throw new Error('请先选择解析任务。');
  const result = await api('/api/cloud-resolver/parse-tasks/batch', {method:'POST', body:JSON.stringify({action, ids})});
  await loadAndRenderCloudResolver();
  const prefix = action === 'retry' ? '已提交重试' : '操作完成';
  showToast(`${prefix}：成功 ${Number(result.succeeded || 0)} 项，失败 ${Number(result.failed || 0)} 项。`, result.failed ? 'error' : 'success');
}
function finishCloudResolverPickerTasks() {
  if (state.activeView !== 'cloud-resolver') return;
  const tasks = state.cloudResolver.tasks || [];
  for (const task of tasks) {
    if (!state.cloudResolverPendingPickerIds.has(task.id)) continue;
    if (task.status === 'parsed') {
      state.cloudResolverPendingPickerIds.delete(task.id);
      const fileCount = (task.files || []).length;
      updateCloudResolverParseDialog('done', `解析完成，共获取 ${fileCount} 个文件。`);
      state.cloudResolverParseCloseTimer = window.setTimeout(() => {
        closeCloudResolverParseDialog();
        if (state.activeView === 'cloud-resolver') openCloudFilePicker(task);
      }, 900);
    } else if (task.status === 'failed') {
      state.cloudResolverPendingPickerIds.delete(task.id);
      updateCloudResolverParseDialog('error', cloudErrorMessage({ message: task.errorCode || '解析失败' }));
    } else if (task.status === 'cancelled' || task.status === 'archived') {
      state.cloudResolverPendingPickerIds.delete(task.id);
      updateCloudResolverParseDialog('error', task.status === 'cancelled' ? '解析任务已取消。' : '解析任务已归档。');
    }
  }
}
function finishCloudResolverPoll() {
  state.cloudResolverPollBusy = false;
  if (state.cloudResolverPollRequested) {
    state.cloudResolverPollRequested = false;
    refreshCloudResolverTaskStatuses().catch(() => {});
  } else {
    scheduleCloudResolverTaskPoll();
  }
}
function scheduleCloudResolverTaskPoll() {
  const feature = state.cloudResolver || {};
  const processing = (feature.tasks || []).some((task) => ['pending', 'processing'].includes(task.status));
  const awaitingPicker = state.cloudResolverPendingPickerIds.size > 0;
  if (!state.token || (!processing && !awaitingPicker)) {
    if (state.cloudResolverPollTimer) clearTimeout(state.cloudResolverPollTimer);
    state.cloudResolverPollTimer = null;
    return;
  }
  if (state.cloudResolverPollTimer) return;
  state.cloudResolverPollTimer = setTimeout(async () => {
    state.cloudResolverPollTimer = null;
    if (state.cloudResolverPollBusy) { state.cloudResolverPollRequested = true; return; }
    state.cloudResolverPollBusy = true;
    try {
      const result = await api('/api/cloud-resolver/parse-tasks');
      state.cloudResolver.tasks = result.tasks || [];
      renderCloudResolver();
      renderCloudTaskTables(state.cloudResolver);
      finishCloudResolverPickerTasks();
    } catch {
      if (state.cloudResolverParseActive && $('cloudResolverParseText')) {
        $('cloudResolverParseText').textContent = '连接暂时中断，正在自动重试查询解析状态...';
      }
    } finally { finishCloudResolverPoll(); }
  }, 1000);
}
async function refreshCloudResolverTaskStatuses() {
  if (state.cloudResolverPollBusy) { state.cloudResolverPollRequested = true; return; }
  state.cloudResolverPollBusy = true;
  try {
    const result = await api('/api/cloud-resolver/parse-tasks');
    state.cloudResolver.tasks = result.tasks || [];
    renderCloudResolver();
    renderCloudTaskTables(state.cloudResolver);
    finishCloudResolverPickerTasks();
  } catch (error) {
    if (state.cloudResolverParseActive && $('cloudResolverParseText')) {
      $('cloudResolverParseText').textContent = '连接暂时中断，正在自动重试查询解析状态...';
    }
    throw error;
  } finally { finishCloudResolverPoll(); }
}
async function loadAndRenderCloudResolver() {
  await loadCloudResolver();
  renderCloudResolver();
  renderCloudTaskTables(state.cloudResolver || {});
  finishCloudResolverPickerTasks();
  scheduleCloudResolverTaskPoll();
}
setInterval(() => {
  const feature = state.cloudResolver || {};
  const plans = [...(feature.plans || []), ...(feature.adminPlans || [])];
  const newlyExpired = plans.some((plan) => {
    const memberPromo = planPromoStatus(plan, 'promoPrice', 'promoExpiresAt', 'memberPrice');
    const agentPromo = planPromoStatus(plan, 'agentPromoPrice', 'agentPromoExpiresAt', 'agentWholesalePrice');
    const keys = [
      memberPromo?.expired ? `${plan.id}:member` : '',
      agentPromo?.expired ? `${plan.id}:agent` : '',
    ].filter(Boolean);
    const changed = keys.some((key) => !state.cloudResolverPromoExpiredKeys.has(key));
    keys.forEach((key) => state.cloudResolverPromoExpiredKeys.add(key));
    return changed;
  });
  if (newlyExpired) {
    renderCloudResolver();
    renderCloudAgentPanel();
  }
  const orders = [...(feature.orders || []), ...(feature.agentCodeOrders || [])];
  if (!orders.length) return;
  orders.forEach((order) => {
    if (order.status !== 'pending') return;
    if (Number(order.remainingSeconds || 0) > 0) order.remainingSeconds = Number(order.remainingSeconds) - 1;
    if (Number(order.remainingSeconds || 0) <= 0 && order.pendingExpiresAt) {
      order.status = 'expired';
      order.isExpired = true;
    }
  });
  renderCloudOrders();
  renderAgentCloudOrders();
}, 1000);
setInterval(() => {
  let changed = false;
  (state.orders || []).forEach((order) => {
    if (!['cloud_resolver_plan_purchase', 'cloud_resolver_code_generate'].includes(order.action) || order.status !== 'pending') return;
    if (Number(order.remainingSeconds || 0) > 0) {
      order.remainingSeconds = Number(order.remainingSeconds) - 1;
      if (order.remainingSeconds <= 0) {
        order.status = 'expired';
        order.isExpired = true;
      }
      changed = true;
    } else if (order.pendingExpiresAt) {
      order.status = 'expired';
      order.isExpired = true;
      changed = true;
    }
  });
  if (changed) renderOrders();
}, 1000);
async function buyCloudPlan(planId, renew = false) {
  const plan = (state.cloudResolver.plans || []).find((item) => item.id === planId);
  if (!plan) throw new Error('套餐不存在。');
  const memberPrice = Number(plan.memberPrice || 0);
  const promoPrice = Number(plan.promoPrice || 0);
  const promoLabel = planPromoLabel(plan, 'promoPrice', 'promoExpiresAt', 'memberPrice');
  const amount = promoLabel && promoLabel !== '活动已结束' && promoPrice > 0 && promoPrice < memberPrice ? promoPrice : memberPrice;
  let paymentChannel = '';
  let paymentType = '';
  if (amount > 0) {
    const quote = { total: amount, price: amount, balance: state.currentUser?.balance || 0, currency: state.inviteCurrency || 'CNY', request: { count: 1 }, channels: state.cloudResolver.paymentChannels || [], balanceEnough: false };
    const choice = await showInvitePaymentDialog(quote, { title: renew ? '选择续费方式' : '选择支付方式', itemName: plan.name || '套餐', quantitySuffix: '套', hideBalance: true });
    if (!choice) return;
    paymentChannel = choice.paymentChannel;
    paymentType = choice.paymentType;
  }
  const result = await api('/api/cloud-resolver/orders', { method: 'POST', body: JSON.stringify({ planId, paymentChannel, paymentType, renew }) });
  if (result.paymentUrl) { window.location.href = result.paymentUrl; return; }
  await loadAndRenderCloudResolver();
  showToast(result.message || (renew ? '续费已完成。' : '套餐已开通。'), 'success');
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cloud-continue-order]');
  if (!button) return;
  const order = (state.cloudResolver.orders || []).find((item) => item.id === button.dataset.cloudContinueOrder);
  if (order?.paymentUrl) window.location.href = order.paymentUrl;
  else showToast('该订单暂时没有可用支付地址，请重新购买。', 'error');
});
async function redeemCloudCode(inputId) {
  const input = $(inputId);
  const code = input?.value.trim();
  if (!code) throw new Error('请输入激活码。');
  await api('/api/cloud-resolver/activate', { method: 'POST', body: JSON.stringify({ code }) });
  input.value = '';
  await loadAndRenderCloudResolver();
  showToast('激活码兑换成功。', 'success');
}
async function createCloudPlan() {
  if (!$('cloudResolverSystemPlanDescription')) $('cloudResolverSystemPlanName')?.insertAdjacentHTML('afterend', '<label class="wide">套餐备注/使用说明<textarea id="cloudResolverSystemPlanDescription" maxlength="500" rows="2" placeholder="前台套餐卡片中显示的使用说明"></textarea></label>');
  const payload = {
    name: $('cloudResolverSystemPlanName').value.trim(), description: $('cloudResolverSystemPlanDescription').value.trim(), memberPrice: Number($('cloudResolverSystemPlanPrice').value || 0),
    promoPrice: Number($('cloudResolverSystemPlanPromoPrice').value || 0), promoExpiresAt: cloudPromoExpiryForSave('cloudResolverSystemPlanPromoPrice', 'cloudResolverSystemPlanPrice', 'cloudResolverSystemPlanPromoExpiresAt', '会员活动价'),
    agentWholesalePrice: Number($('cloudResolverSystemPlanAgentPrice').value || 0), agentPromoPrice: Number($('cloudResolverSystemPlanAgentPromoPrice').value || 0), agentPromoExpiresAt: cloudPromoExpiryForSave('cloudResolverSystemPlanAgentPromoPrice', 'cloudResolverSystemPlanAgentPrice', 'cloudResolverSystemPlanAgentPromoExpiresAt', '代理活动价'), sortOrder: Number($('cloudResolverSystemPlanSortOrder').value || 0), durationDays: Number($('cloudResolverSystemPlanDays').value || 30),
    parseQuota: Number($('cloudResolverSystemPlanQuota').value || -1),
    trafficQuota: Number($('cloudResolverSystemPlanTraffic').value || -1)
  };
  const dailyValue = $('cloudResolverSystemPlanDaily').value.trim();
  if (dailyValue) payload.dailyParseLimit = Number(dailyValue);
  const editingId = state.editingCloudPlanId;
  if (!editingId) payload.allowedProviders = ['mock', 'tianyi', 'lanzou', '123pan', 'xiaofeiji', 'weiyun'];
  const result = editingId ? await api('/api/admin/cloud-resolver/plans/' + encodeURIComponent(editingId), { method: 'PATCH', body: JSON.stringify(payload) }) : await api('/api/admin/cloud-resolver/plans', { method: 'POST', body: JSON.stringify(payload) });
  resetCloudPlanEditor();
  await loadAndRenderCloudResolver();
  showToast(`套餐“${result.name}”已${editingId ? '保存' : '创建'}。`, 'success');
}
function resetCloudPlanEditor() {
  state.editingCloudPlanId = '';
  if (!$('cloudResolverSystemPlanDescription')) $('cloudResolverSystemPlanName')?.insertAdjacentHTML('afterend', '<label class="wide">套餐备注/使用说明<textarea id="cloudResolverSystemPlanDescription" maxlength="500" rows="2" placeholder="前台套餐卡片中显示的使用说明"></textarea></label>');
  $('cloudResolverPlanEditorTitle').textContent = '网盘授权套餐';
  $('cloudResolverSystemCreatePlanBtn').textContent = '创建套餐';
  $('cloudResolverSystemCancelPlanBtn').hidden = true;
  ['Name','Description','Price','PromoPrice','PromoExpiresAt','AgentPrice','AgentPromoPrice','AgentPromoExpiresAt','SortOrder','Days','Quota','Daily','Traffic'].forEach((key) => { const el = $('cloudResolverSystemPlan' + key); if (el) el.value = key === 'Days' ? '30' : key === 'Quota' ? '20' : key === 'Traffic' ? '-1' : key === 'Name' || key === 'Description' || key === 'Daily' || key === 'PromoExpiresAt' || key === 'AgentPromoExpiresAt' ? '' : '0'; });
}
function editCloudPlan(planId) {
  const plan = (state.cloudResolver.adminPlans || []).find((item) => item.id === planId); if (!plan) return;
  if (!$('cloudResolverSystemPlanDescription')) $('cloudResolverSystemPlanName')?.insertAdjacentHTML('afterend', '<label class="wide">套餐备注/使用说明<textarea id="cloudResolverSystemPlanDescription" maxlength="500" rows="2"></textarea></label>');
  $('cloudResolverSystemPlanDescription').value = plan.description || '';
  state.editingCloudPlanId = plan.id;
  $('cloudResolverPlanEditorTitle').textContent = `编辑套餐：${plan.name || ''}`;
  $('cloudResolverSystemCreatePlanBtn').textContent = '保存修改'; $('cloudResolverSystemCancelPlanBtn').hidden = false;
  $('cloudResolverSystemPlanName').value = plan.name || ''; $('cloudResolverSystemPlanPrice').value = Number(plan.memberPrice || 0); $('cloudResolverSystemPlanPromoPrice').value = Number(plan.promoPrice || 0); $('cloudResolverSystemPlanPromoExpiresAt').value = localDateTimeValue(plan.promoExpiresAt); $('cloudResolverSystemPlanAgentPrice').value = Number(plan.agentWholesalePrice || 0); $('cloudResolverSystemPlanAgentPromoPrice').value = Number(plan.agentPromoPrice || 0); $('cloudResolverSystemPlanAgentPromoExpiresAt').value = localDateTimeValue(plan.agentPromoExpiresAt); $('cloudResolverSystemPlanSortOrder').value = Number(plan.sortOrder || 0); $('cloudResolverSystemPlanDays').value = Number(plan.durationDays || 30); $('cloudResolverSystemPlanQuota').value = Number(plan.parseQuota ?? 20); $('cloudResolverSystemPlanDaily').value = plan.dailyParseLimit == null ? '' : Number(plan.dailyParseLimit); $('cloudResolverSystemPlanTraffic').value = Number(plan.trafficQuota ?? -1);
}
async function generateCloudCodes() {
  const planId = $('cloudResolverCodePlan').value;
  if (!planId) throw new Error('请先创建并选择套餐。');
  const result = await api('/api/admin/cloud-resolver/codes', { method: 'POST', body: JSON.stringify({
    planId, count: Number($('cloudResolverCodeCount').value || 1), maxUses: Number($('cloudResolverCodeUses').value || 1), assignedAgentId: $('cloudResolverCodeAgent')?.value || ''
  }) });
  await loadAndRenderCloudResolver();
  openCloudCodeResultDialog(result.codes || []);
}
async function generateAgentCloudCodes() {
  const payload = {
    planId: $('cloudResolverAgentCodePlan')?.value || '',
    count: Number($('cloudResolverAgentCodeCount')?.value || 1),
    maxUses: Number($('cloudResolverAgentCodeUses')?.value || 1),
  };
  if (!payload.planId) throw new Error('请先选择套餐。');
  const quote = await api('/api/agent/cloud-resolver/codes/quote', {
    method: 'POST', body: JSON.stringify(payload),
  });
  state.inviteCurrency = quote.currency || state.inviteCurrency || 'CNY';
  if (state.currentUser) state.currentUser.balance = quote.balance;
  renderUserContext();
  const choice = await showInvitePaymentDialog(quote, { title: '网盘激活码付款', quantitySuffix: '张' });
  if (!choice) return;
  const result = await api('/api/agent/cloud-resolver/codes', {
    method: 'POST', body: JSON.stringify({ ...payload, ...choice }),
  });
  if (result.paymentUrl || result.order?.paymentUrl) {
    window.location.href = result.paymentUrl || result.order.paymentUrl;
    return;
  }
  if (!result.codes?.length) throw new Error('付款完成，但服务器没有返回激活码，请刷新订单后重试。');
  if (state.currentUser && typeof result.balance !== 'undefined') state.currentUser.balance = result.balance;
  await loadAndRenderCloudResolver();
  renderUserContext();
  openCloudCodeResultDialog(result.codes);
  showToast(result.message || '付款成功，激活码已生成。', 'success');
}
async function copyCloudCodes(codes) {
  const values = (codes || []).map((code) => code.code || '').filter(Boolean);
  if (!values.length) throw new Error('当前没有可复制的完整卡密。历史卡密仅保存了遮罩值。');
  await copyText(values.join('\r\n'));
}
function exportSelectedCloudCodes() {
  const selected = new Set(state.cloudSelectedCodeIds || []);
  const codes = (state.cloudResolver.codes || []).filter((code) => selected.has(code.id || code.codeId || code.codeHashPrefix || '')).map((code) => code.code || '').filter(Boolean);
  if (!selected.size) throw new Error('请先勾选要导出的卡密。');
  if (!codes.length) throw new Error('所选卡密没有可导出的明文；旧卡密无法从哈希恢复。');
  const blob = new Blob([codes.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `网盘卡密-${Date.now()}.txt`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已导出 ${codes.length} 个卡密。`);
}
async function deleteCloudCodes(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) throw new Error('请先勾选要删除的卡密。');
  if (!window.confirm(`确定删除选中的 ${uniqueIds.length} 个卡密吗？此操作不可撤销。`)) return;
  const result = await api('/api/admin/cloud-resolver/codes', { method: 'DELETE', body: JSON.stringify({ ids: uniqueIds }) });
  state.cloudSelectedCodeIds = [];
  await loadAndRenderCloudResolver();
  showToast(`已删除 ${Number(result.deleted || 0)} 个卡密。`, 'success');
}
async function setCloudCodeStatus(codeId, action) {
  if (!codeId || !['disable', 'enable'].includes(action)) return;
  await api(`/api/admin/cloud-resolver/codes/${encodeURIComponent(codeId)}/${action}`, { method: 'POST', body: '{}' });
  await loadAndRenderCloudResolver();
  showToast(action === 'disable' ? '卡密已停用。' : '卡密已启用。', 'success');
}
function ensureCloudCodeResultDialog() {
  let overlay = $('cloudCodeResultOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'cloudCodeResultOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal-card invite-result-card" role="dialog" aria-modal="true" aria-labelledby="cloudCodeResultTitle">
      <div class="modal-head">
        <h2 id="cloudCodeResultTitle">卡密已生成</h2>
        <button id="closeCloudCodeResultBtn" type="button" aria-label="关闭">×</button>
      </div>
      <div id="cloudCodeResultList" class="invite-result-list"></div>
      <div class="invite-result-actions">
        <button id="copyCloudCodeResultAllBtn" type="button">复制全部</button>
        <button id="closeCloudCodeResultBtn2" type="button">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (event) => {
    if (event.target === overlay) closeCloudCodeResultDialog();
  };
  $('closeCloudCodeResultBtn').onclick = closeCloudCodeResultDialog;
  $('closeCloudCodeResultBtn2').onclick = closeCloudCodeResultDialog;
  return overlay;
}
function closeCloudCodeResultDialog() {
  const overlay = $('cloudCodeResultOverlay');
  if (overlay) overlay.hidden = true;
}
function openCloudCodeResultDialog(codes) {
  const overlay = ensureCloudCodeResultDialog();
  const list = $('cloudCodeResultList');
  const values = (codes || []).map((code) => typeof code === 'string' ? code : code.code || '').filter(Boolean);
  list.innerHTML = values.length ? values.map((code) => `
    <div class="invite-result-row">
      <input readonly value="${escapeAttr(code)}">
      <button type="button" data-copy-cloud-result-code="${escapeAttr(code)}">复制</button>
    </div>
  `).join('') : '<p class="invite-pay-note">卡密已生成，可在激活码管理列表中查看。</p>';
  $('copyCloudCodeResultAllBtn').disabled = !values.length;
  $('copyCloudCodeResultAllBtn').onclick = () => copyText(values.join('\r\n'));
  list.querySelectorAll('[data-copy-cloud-result-code]').forEach((button) => {
    button.onclick = () => copyText(button.dataset.copyCloudResultCode || '');
  });
  overlay.hidden = false;
}
async function parseCloudResolver() {
  const rawInput = $('cloudResolverUrl').value.trim();
  const accessInput = $('cloudResolverAccessCode').value.trim();
  const embeddedCode = rawInput.match(/(?:密码|访问码|提取码|pwd|pass(?:word)?)\s*[:：=]\s*([^\s,，;；]+)/i);
  const url = (embeddedCode ? rawInput.slice(0, embeddedCode.index) : rawInput)
    .replace(/[（(]\s*$/, '').replace(/[）)\]}>，,；;。.!！?？]+$/, '').trim();
  const accessCode = accessInput || (embeddedCode ? embeddedCode[1].replace(/[）)\]}>，,；;。.!！?？]+$/, '').trim() : '');
  if (!url) throw new Error('请先填写网盘分享链接。');
  if (state.cloudResolverParseActive) return;
  openCloudResolverParseDialog();
  try {
    const result = await api('/api/cloud-resolver/parse', { method: 'POST', body: JSON.stringify({ links: [{ url: url, provider: $('cloudResolverProvider').value, accessCode: accessCode, version: $('cloudResolverVersion').value, platform: $('cloudResolverPlatform').value, architecture: $('cloudResolverArchitecture').value, language: $('cloudResolverLanguage').value, remark: $('cloudResolverRemark').value }] }) });
    $('cloudResolverAccessCode').value = '';
    const tasks = result.tasks || [];
    if (!tasks.length) throw new Error('服务器没有创建解析任务。');
    for (const task of tasks) state.cloudResolverPendingPickerIds.add(task.id);
    const taskIds = new Set(tasks.map((task) => task.id));
    state.cloudResolver.tasks = [...tasks, ...(state.cloudResolver.tasks || []).filter((task) => !taskIds.has(task.id))];
    renderCloudResolver();
    renderCloudTaskTables(state.cloudResolver);
    $('cloudResolverParseText').textContent = '任务已提交，正在后台获取文件信息...';
    scheduleCloudResolverTaskPoll();
    refreshCloudResolverTaskStatuses().catch(() => {});
  } catch (error) {
    updateCloudResolverParseDialog('error', cloudErrorMessage(error));
  }
}
async function assignCloudTask(taskId) {
  const task = state.cloudResolver.tasks.find(function(item) { return item.id === taskId; }); if (!task) return;
  const unavailable = task.provider === 'xiaofeiji' && (task.files || []).filter(function(file) { return file.type !== 'folder' && !String(file.downloadUrl || '').trim(); });
  if (unavailable && unavailable.length) throw new Error(cloudErrorMessage(task.errorCode || unavailable[0].errorCode || 'DOWNLOAD_URL_UNAVAILABLE'));
  openCloudFilePicker(task);
}
function openCloudFilePicker(task) {
  let overlay = $('cloudFilePickerOverlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'cloudFilePickerOverlay'; overlay.className = 'modal-overlay cloud-file-picker-overlay'; overlay.hidden = true;
    overlay.innerHTML = `<div class="modal-card cloud-file-picker" role="dialog" aria-modal="true" aria-labelledby="cloudFilePickerTitle"><div class="modal-head"><div><h2 id="cloudFilePickerTitle">解析成功，请选择要添加的文件</h2><p id="cloudFilePickerMeta"></p></div><button type="button" data-cloud-picker-close aria-label="关闭">×</button></div><div class="cloud-file-tools"><input id="cloudFileSearch" type="search" placeholder="搜索文件名"><select id="cloudFileType"><option value="all">全部文件类型</option><option value="file">文件</option><option value="folder">文件夹</option></select><button type="button" data-cloud-picker-select="all">全选</button><button type="button" data-cloud-picker-select="none">取消全选</button><button type="button" data-cloud-picker-select="invert">反选</button><span id="cloudFileSelectionCount"></span></div><div id="cloudFilePickerRows" class="cloud-file-picker-rows"></div><div class="cloud-file-target"><label>目标页面<select id="cloudFileTargetPage"></select></label><label>目标分组<select id="cloudFileTargetSection"></select></label><label>添加方式<select id="cloudFileTargetMode"><option value="existing">加入已有按钮（作为备用链接）</option><option value="create">新增按钮</option></select></label></div><div class="invite-result-actions"><button type="button" data-cloud-picker-close>取消</button><button type="button" id="cloudFilePickerConfirm">添加所选文件</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target.closest('[data-cloud-picker-close]')) closeCloudFilePicker(); });
    overlay.querySelector('#cloudFileTargetPage').onchange = renderCloudPickerSections;
    overlay.querySelector('#cloudFileTargetMode').onchange = renderCloudPickerRows;
    overlay.querySelector('#cloudFileTargetSection').onchange = renderCloudPickerRows;
    overlay.querySelector('#cloudFileSearch').oninput = renderCloudPickerRows;
    overlay.querySelector('#cloudFileType').onchange = renderCloudPickerRows;
    overlay.querySelector('#cloudFilePickerRows').onchange = (event) => { if (event.target.type !== 'checkbox') return; const id = event.target.value; const selected = new Set(state.cloudPickerSelection || []); event.target.checked ? selected.add(id) : selected.delete(id); state.cloudPickerSelection = [...selected]; renderCloudPickerCount(); };
    overlay.querySelectorAll('[data-cloud-picker-select]').forEach((button) => button.onclick = () => { const all = (state.cloudPickerTask?.files || []).map((file) => file.id); const selected = new Set(state.cloudPickerSelection || []); if (button.dataset.cloudPickerSelect === 'all') all.forEach((id) => selected.add(id)); else if (button.dataset.cloudPickerSelect === 'none') all.forEach((id) => selected.delete(id)); else all.forEach((id) => selected.has(id) ? selected.delete(id) : selected.add(id)); state.cloudPickerSelection = [...selected]; renderCloudPickerRows(); });
    overlay.querySelector('#cloudFilePickerConfirm').onclick = () => commitCloudPicker().catch((error) => setStatus(cloudErrorMessage(error), true));
  }
  state.cloudPickerTask = task; state.cloudPickerSelection = (task.files || []).filter((file) => file.type !== 'folder').map((file) => file.id); state.cloudPickerButtonTargets = {}; state.cloudPickerButtonNames = {};
  const pageSelect = overlay.querySelector('#cloudFileTargetPage'); const pages = state.config?.pages || {}; const pageIds = Object.keys(pages);
  if (!pageIds.length) throw new Error('当前配置没有可用页面。');
  pageSelect.innerHTML = pageIds.map((id) => `<option value="${escapeAttr(id)}">${escapeHtml(pages[id].title || id)}</option>`).join('');
  overlay.querySelector('#cloudFilePickerMeta').textContent = `${cloudProviderLabel(task.provider)} · ${task.shareUrl || ''}`;
  renderCloudPickerSections(); renderCloudPickerRows(); overlay.hidden = false; document.body.classList.add('modal-open');
}
function renderCloudPickerSections() { const select = $('cloudFileTargetSection'); const page = state.config?.pages?.[$('cloudFileTargetPage')?.value] || {}; if (select) select.innerHTML = (page.sections || []).map((section, index) => `<option value="${index}">${escapeHtml(section.title || `分组 ${index + 1}`)}</option>`).join(''); }
function renderCloudPickerRows() {
  const task = state.cloudPickerTask; const rows = $('cloudFilePickerRows'); if (!task || !rows) return;
  const search = $('cloudFileSearch').value.trim().toLowerCase(); const type = $('cloudFileType').value;
  const selected = new Set(state.cloudPickerSelection || []); const mode = $('cloudFileTargetMode')?.value || 'existing';
  const page = state.config?.pages?.[$('cloudFileTargetPage')?.value] || {};
  const section = page.sections?.[Number($('cloudFileTargetSection')?.value || 0)] || {};
  const buttons = section.buttons || [];
  rows.innerHTML = (task.files || []).filter((file) => (type === 'all' || file.type === type) && String(file.name || '').toLowerCase().includes(search)).map((file) => {
    const link = file.resolvedUrl || file.downloadUrl || file.browserUrl || task.shareUrl || '';
    const match = buttons.find((button) => String(button.name || '').trim().toLowerCase() === String(file.name || '').trim().toLowerCase());
    const rememberedId = state.cloudPickerButtonTargets?.[file.id] || '';
    const preferredId = buttons.some((button) => String(button.id) === String(rememberedId)) ? rememberedId : (match?.id || '');
    if (preferredId) state.cloudPickerButtonTargets[file.id] = preferredId;
    const defaultName = String(file.name || '未命名文件');
    const customName = state.cloudPickerButtonNames?.[file.id] ?? defaultName;
    const options = mode === 'existing' ? `<select class="cloud-file-target-button" data-file-target="${escapeAttr(file.id)}"><option value="">选择已有按钮</option>${buttons.map((button) => `<option value="${escapeAttr(button.id)}"${String(button.id) === String(preferredId) ? ' selected' : ''}>${escapeHtml(button.name || '未命名按钮')}</option>`).join('')}</select>` : `<label class="cloud-file-name-editor">按钮名称<input type="text" maxlength="120" value="${escapeAttr(customName)}" data-file-name="${escapeAttr(file.id)}"></label>`;
    return `<div class="cloud-file-row"><input type="checkbox" value="${escapeAttr(file.id)}"${selected.has(file.id) ? ' checked' : ''}><span><strong>${escapeHtml(defaultName)}</strong><small class="cloud-resolved-url" title="${escapeAttr(link)}">解析链接：${link ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>` : '暂未返回直链'}</small>${options}</span><small>${file.type === 'folder' ? '文件夹' : (Number(file.size || 0) ? `${(Number(file.size) / 1048576).toFixed(2)} MB` : '大小未知')}</small></div>`;
  }).join('') || '<p class="empty-cell">没有符合条件的文件</p>';
  rows.querySelectorAll('[data-file-target]').forEach((select) => { select.onchange = () => { state.cloudPickerButtonTargets[select.dataset.fileTarget] = select.value; }; });
  rows.querySelectorAll('[data-file-name]').forEach((input) => { input.oninput = () => { state.cloudPickerButtonNames[input.dataset.fileName] = input.value; }; });
  renderCloudPickerCount();
}
function renderCloudPickerCount() { const count = $('cloudFileSelectionCount'); if (count) count.textContent = `已选 ${new Set(state.cloudPickerSelection || []).size} 项`; }
function closeCloudFilePicker() { if ($('cloudFilePickerOverlay')) $('cloudFilePickerOverlay').hidden = true; document.body.classList.remove('modal-open'); }
async function commitCloudPicker() {
  const task = state.cloudPickerTask; const fileIds = [...new Set(state.cloudPickerSelection || [])]; if (!fileIds.length) throw new Error('请至少选择一个文件。');
  const scopeId = $('cloudFileTargetPage').value; const sectionIndex = Number($('cloudFileTargetSection').value || 0); const buttonTargets = {};
  if ($('cloudFileTargetMode')?.value === 'existing') { Object.assign(buttonTargets, state.cloudPickerButtonTargets || {}); const missing = fileIds.filter((id) => !buttonTargets[id]); if (missing.length) throw new Error('当前分组没有可用按钮，请选择新增按钮或先创建按钮。'); }
  const assignment = {taskId:task.id,fileIds,scopeType:'page',scopeId,sectionIndex,buttonTargets,buttonNames:state.cloudPickerButtonNames || {},createNewButton:$('cloudFileTargetMode')?.value === 'create'};
  const preview = await api('/api/cloud-resolver/assign/preview', {method:'POST',body:JSON.stringify(assignment)}); const ambiguous = (preview.preview || []).filter((item) => item.action === 'ambiguous');
  if (ambiguous.length) throw new Error('存在同名且无法确定的按钮：' + ambiguous.map((item) => item.name).join('、'));
  const needsTarget = (preview.preview || []).filter((item) => item.action === 'target_required' || item.action === 'target_not_found');
  if (needsTarget.length) throw new Error('请为每个文件选择要加入的已有按钮；只有明确选择“新增按钮”时才会创建按钮。');
  const committed = await api('/api/cloud-resolver/assign/commit', {method:'POST',body:JSON.stringify(assignment)});
  const rejected = (committed.results || []).filter((item) => ['target_required','target_not_found','ambiguous'].includes(item.status));
  if (rejected.length) throw new Error('部分文件未加入：请确认每个文件都选择了正确的已有按钮。');
  closeCloudFilePicker(); await loadAndRenderCloudResolver(); state.config = await api(configApiPath()); state.buttons = await api(buttonsApiPath()); renderAll(); showToast('所选文件已加入按钮配置。', 'success');
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('cloudFilePickerOverlay') && !$('cloudFilePickerOverlay').hidden) closeCloudFilePicker(); });
/*
  const assignment = { taskId: taskId, fileIds: fileIds, scopeType: 'page', scopeId: scopeId, sectionIndex: sectionIndex };
  const preview = await api('/api/cloud-resolver/assign/preview', { method: 'POST', body: JSON.stringify(assignment) });
  const ambiguous = (preview.preview || []).filter(function(item) { return item.action === 'ambiguous'; });
  if (ambiguous.length) throw new Error(CLOUD_ERROR_MESSAGES.AMBIGUOUS_BUTTON_MATCH + ' ' + ambiguous.map(function(item) { return item.name; }).join('、'));
  if (!window.confirm('将 ' + fileIds.length + ' 个文件加入页面“' + ((state.config.pages[scopeId] || {}).title || scopeId) + '”第一分组，继续吗？')) return;
  await api('/api/cloud-resolver/assign/commit', { method: 'POST', body: JSON.stringify(assignment) });
  await loadAndRenderCloudResolver(); state.config = await api(configApiPath()); state.buttons = await api(buttonsApiPath()); renderAll(); showToast('资源已加入按钮配置。', 'success');
*/
async function startCloudDownload(sourceId) {
  const task = await api('/api/cloud-resolver/download-task', { method: 'POST', body: JSON.stringify({ sourceId: sourceId }) });
  await loadAndRenderCloudResolver();
  if (task.browserOnly && task.browserUrl) {
    const link = document.createElement('a');
    link.href = task.browserUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.click();
    showToast(task.message || '已打开天翼云分享页，请登录或转存后下载。', 'success');
  } else if (task.downloadUrl) {
    const link = document.createElement('a'); link.href = task.downloadUrl; link.target = '_blank'; link.rel = 'noreferrer'; link.click(); showToast('已开始下载。', 'success');
  } else {
    showToast('下载地址暂不可用，请刷新线路后重试。', 'error');
  }
}
async function refreshCloudSource(sourceId) { await api('/api/cloud-resolver/sources/' + encodeURIComponent(sourceId) + '/refresh', { method: 'POST', body: '{}' }); await loadAndRenderCloudResolver(); }
async function deleteCloudSource(sourceId) { if (!window.confirm('删除这条备用线路吗？')) return; await api('/api/cloud-resolver/sources/' + encodeURIComponent(sourceId), { method: 'DELETE' }); await loadAndRenderCloudResolver(); }

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
  renderAdminAnnouncements();
  ensureButtonsPagePanels();
  renderStats();
  renderManageControls();
  renderPageAccessControls();
  renderSelectors();
  renderButtons();
  renderClientVariants();
  renderExchangeControls();
  renderCloudResolver();
  renderCloudTaskTables(state.cloudResolver || {});
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
    superDisabled: invite.superDisabled === true,
    canDelete: invite.canDelete !== false,
    canToggle: invite.canToggle !== false,
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
  const result = await api('/api/super/orders?scope=cloud_resolver');
  state.orders = result.orders || [];
}

async function handlePaymentReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  if (!payment) return false;
  const orderId = params.get('order') || '';
  if (!orderId) {
    setStatus('支付返回缺少订单号，无法读取生成结果。', true);
    return true;
  }
  try {
    // 支付状态和卡密必须以已登录账号可访问的服务端订单为准。
    let order = await api(isSuper() || isAgent()
      ? `/api/super/orders/${encodeURIComponent(orderId)}`
      : `/api/cloud-resolver/orders/${encodeURIComponent(orderId)}`);
    let orderData = order.order || order;
    if (orderData.action === 'cloud_resolver_code_generate' && isAgent()) {
      order = await api(`/api/agent/cloud-resolver/code-orders/${encodeURIComponent(orderId)}`);
      orderData = order.order || order;
    }
    if (orderData.action === 'cloud_resolver_code_generate') {
      if (!['paid', 'done'].includes(orderData.status) || !orderData.fulfilledAt || !(order.codes || []).length) {
        setStatus('订单尚未完成发卡，请稍后刷新重试；已支付请勿重复购买。', true);
        return true;
      }
      const codes = order.codes || [];
      await loadAndRenderCloudResolver();
      openCloudCodeResultDialog(codes);
      params.delete('payment');
      params.delete('order');
      const query = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      setStatus(`支付成功，已生成 ${codes.length} 张网盘激活码。`);
      return true;
    }
    const resolvedOrder = orderData;
    if (resolvedOrder.action === 'cloud_resolver_plan_purchase') {
      if (!['paid', 'done'].includes(resolvedOrder.status) || !resolvedOrder.fulfilledAt) {
        setStatus('网盘套餐订单尚未完成，请稍后刷新重试；已支付请勿重复购买。', true);
        return true;
      }
      await loadAndRenderCloudResolver();
      params.delete('payment');
      params.delete('order');
      const query = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      setStatus('支付成功，网盘解析套餐已开通。');
      showToast('网盘解析套餐已开通。', 'success');
      return true;
    }
    if (resolvedOrder.action === 'recharge_balance') {
      if (!['paid', 'done'].includes(resolvedOrder.status) || !resolvedOrder.fulfilledAt) {
        setStatus('充值订单尚未完成入账，请稍后刷新重试；已支付请勿重复充值。', true);
        return true;
      }
      const me = await api('/api/admin/me');
      state.currentUser = me.user;
      state.targetUser = me.targetUser;
      renderUserContext();
      params.delete('payment');
      params.delete('order');
      const query = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      const balance = formatMoney(state.currentUser?.balance, resolvedOrder.currency || state.inviteCurrency || 'CNY');
      setStatus(`充值成功，当前代理余额为 ${balance}。`);
      showToast('充值金额已到账。', 'success');
      return true;
    }
    const fulfilledCodes = resolvedOrder.fulfilledInviteCodes || [];
    if (!['paid', 'done'].includes(resolvedOrder.status) || !resolvedOrder.fulfilledAt || !fulfilledCodes.length) {
      setStatus('订单尚未完成发卡，请稍后刷新重试；已支付请勿重复购买。', true);
      return true;
    }
    if (isSuper()) {
      await refreshOrders(false);
    } else if (isAgent()) {
      await loadInvites();
      renderInvites();
      switchView('users');
    }
    openInviteResultDialog(fulfilledCodes.map((code) => ({ code })), fulfilledCodes.length);
    params.delete('payment');
    params.delete('order');
    const query = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    setStatus(`支付成功，订单 ${orderId} 已完成，已生成 ${fulfilledCodes.length} 个邀请码。`);
  } catch (error) {
    setStatus(`支付已返回，但结果暂时读取失败：${error.message}。请刷新重试。`, true);
  }
  return true;
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
  const rechargeButton = $('agentRechargeBtn');
  if (rechargeButton) rechargeButton.hidden = !isAgent();

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
  renderNewUserAgentLevel();
  const addUserPanel = $('addUserBtn')?.closest('.panel');
  if (addUserPanel) addUserPanel.hidden = !superMode;
}

function switchView(view) {
  if (view === 'audit' && isSuper()) ensureAuditView();
  if ((view === 'system' || view === 'audit') && !isSuper()) {
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
  if (view === 'audit' && isSuper()) loadAuditLog().catch(error => setStatus(error.message, true));
  if (view === 'cloud-resolver') loadAndRenderCloudResolver().catch(error => setStatus(cloudErrorMessage(error), true));
  syncAuditAutoRefresh(view);
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

function renderXingguiHome() {
  const host = $('xingguiHomeEditors');
  if (!host || !state.config) return;
  const page = state.config.pages?.xinggui_home || {};
  const disabled = isTemplateMode();
  $('saveXingguiHomeBtn').disabled = disabled;
  $('xingguiHomeScope').textContent = disabled
    ? '当前为新用户模板视图，请切换到用户后配置该用户的首页。'
    : `正在配置：${displayNameOf(state.targetUser || state.currentUser)} · 此首页仅保存到该用户。`;
  host.replaceChildren();
  [0, 1].forEach((index) => {
    const section = page.sections?.[index] || { title: index ? '业务范围' : '远程下载', buttons: [] };
    const column = document.createElement('section');
    column.className = 'xinggui-home-editor';
    column.dataset.xingguiSide = String(index);
    column.innerHTML = `<div class="panel-head"><h3>${index ? '右侧按钮' : '左侧按钮'}</h3><button type="button" data-xinggui-add ${disabled ? 'disabled' : ''}>添加按钮</button></div><label>区域标题<input data-xinggui-title value="${escapeAttr(section.title || '')}" ${disabled ? 'disabled' : ''}></label><div data-xinggui-rows></div>`;
    const rows = column.querySelector('[data-xinggui-rows]');
    (section.buttons || []).forEach((item) => appendXingguiButton(rows, item, disabled));
    column.querySelector('[data-xinggui-add]').onclick = () => appendXingguiButton(rows, { name: '新按钮', action: 'link', enabled: true, sort: rows.children.length * 10 + 10 });
    host.appendChild(column);
  });
}

function appendXingguiButton(host, item, disabled = false) {
  const row = document.createElement('article');
  row.className = 'xinggui-home-button-editor';
  row.xingguiOriginal = item;
  const action = item.action || 'link';
  const target = item.target || item.download_url || item.url || item.command || item.script_id || item.package_id || '';
  row.innerHTML = `<div class="form-grid compact"><label>按钮文字<input data-field="name" value="${escapeAttr(item.name || '')}"></label><label>排序<input type="number" data-field="sort" value="${Number(item.sort || 0)}"></label><label>动作<select data-field="action">${ACTIONS.map(([value, label]) => `<option value="${value}" ${action === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="checkline"><input data-field="enabled" type="checkbox" ${item.enabled !== false ? 'checked' : ''}> 显示按钮</label><label class="wide">说明<input data-field="description" value="${escapeAttr(item.description || '')}"></label><label class="wide">动作内容（留空仅显示文字）<div class="target-control">${targetControlHtml(action, target, item)}</div><small class="target-note"></small></label><label class="wide">按钮图标（可选）<div class="icon-field xinggui-icon-field"><span class="icon-preview"><img data-icon-preview src="${escapeAttr(item.icon || '')}" alt="" ${item.icon ? '' : 'hidden'}></span><div class="xinggui-icon-controls"><input data-field="icon" value="${escapeAttr(item.icon || '')}" placeholder="图标地址"><button type="button" class="icon-picker-trigger" data-icon-picker-open>选择图标</button><div class="icon-picker-popover" data-icon-picker-popup hidden></div></div></div></label></div><details><summary>点击验证与确认</summary>${buttonGuardHtml(item)}</details><div class="xinggui-home-row-actions"><button type="button" data-xinggui-up>上移</button><button type="button" data-xinggui-down>下移</button><button type="button" class="danger" data-xinggui-remove>删除按钮</button></div>`;
  const iconInput = row.querySelector('[data-field="icon"]');
  const iconPreview = row.querySelector('[data-icon-preview]');
  iconInput.oninput = () => { iconPreview.src = iconInput.value.trim(); iconPreview.hidden = !iconInput.value.trim(); };
  initButtonIconPicker(row, iconInput, iconPreview);
  bindScriptTargetControl(row);
  bindDownloadControl(row);
  row.querySelector('[data-field="action"]').onchange = () => {
    const nextAction = row.querySelector('[data-field="action"]').value;
    row.querySelector('.target-control').innerHTML = targetControlHtml(nextAction, '', {});
    bindScriptTargetControl(row); bindDownloadControl(row);
  };
  row.querySelector('[data-guard-password-toggle]').onclick = () => {
    const input = row.querySelector('[data-guard-password-value]');
    input.type = input.type === 'password' ? 'text' : 'password';
  };
  row.querySelector('[data-xinggui-remove]').onclick = () => row.remove();
  const move = (direction) => {
    const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) host.insertBefore(row, sibling); else host.insertBefore(sibling, row);
    [...host.children].forEach((child, index) => { child.querySelector('[data-field="sort"]').value = (index + 1) * 10; });
  };
  row.querySelector('[data-xinggui-up]').onclick = () => move(-1);
  row.querySelector('[data-xinggui-down]').onclick = () => move(1);
  if (disabled) row.querySelectorAll('input, select, button, textarea').forEach((control) => { control.disabled = true; });
  host.appendChild(row);
}

async function saveXingguiHome() {
  if (isTemplateMode()) return;
  const sections = [...document.querySelectorAll('[data-xinggui-side]')].map((column) => ({
    title: column.querySelector('[data-xinggui-title]').value.trim(),
    buttons: [...column.querySelector('[data-xinggui-rows]').children].map((row) => {
      const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value.trim() || '';
      const item = { id: row.xingguiOriginal?.id || '', name: value('name'), sort: Number(value('sort') || 0), description: value('description'), icon: value('icon'), action: value('action'), target: readRowTarget(row), enabled: row.querySelector('[data-field="enabled"]').checked, guard: readButtonGuard(row, row.xingguiOriginal || {}) };
      if (!item.name) throw new Error('请填写按钮文字。');
      if (item.action === 'download') Object.assign(item, readDownloadConfig(row));
      return item;
    })
  }));
  const targetUserId = state.targetUserId || state.currentUser?.id;
  const button = $('saveXingguiHomeBtn');
  button.disabled = true;
  try {
    const saved = await api('/api/admin/xinggui-home', { method: 'PATCH', targetUserId, body: JSON.stringify({ sections }) });
    if (targetUserId === (state.targetUserId || state.currentUser?.id) && !isTemplateMode()) {
      state.config = saved;
      state.buttons = await api(buttonsApiPath(), { targetUserId });
      renderAll();
      setStatus('当前用户的星轨首页已保存，工具箱将自动同步。');
    }
  } finally { button.disabled = isTemplateMode(); }
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
  renderButtonContentLayout(app.button_content_layout, app.button_content_layout_rules);
  $('appLogo').value = app.logo_text || '';
  $('appIcon').value = app.icon || app.icon_url || '';
  $('appHomeBannerUrl').value = app.home_banner_url || '';
  refreshImageUrlPreviews();
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
  $('appPassword').value = app.password_plain || '';
  $('appPassword').disabled = !$('appPasswordEnabled').checked;
  const updateVariants = app.update_variants || {};
  CLIENT_VARIANTS.forEach((variant) => {
    const settings = updateVariants[variant.id] || (variant.id === 'original' ? {
      version: app.version || '', url: app.update_url || '', title: app.update_title || '工具箱更新',
      button: app.update_button || '下载最新版', minVersion: app.update_min_version || '', force: app.update_force === true
    } : {});
    const card = document.querySelector(`[data-update-variant="${variant.id}"]`);
    if (!card) return;
    card.querySelector('[data-update-field="version"]').value = settings.version || '';
    card.querySelector('[data-update-field="url"]').value = settings.url || '';
    card.querySelector('[data-update-field="title"]').value = settings.title || '工具箱更新';
    card.querySelector('[data-update-field="button"]').value = settings.button || '下载最新版';
    card.querySelector('[data-update-field="minVersion"]').value = settings.minVersion || '';
    card.querySelector('[data-update-field="force"]').checked = settings.force === true;
  });
  $('appExeTitle').value = app.exe_title || app.title || '';
  $('appExeDescription').value = app.exe_description || app.subtitle || '';
  $('appExeProduct').value = app.exe_product || app.title || '';
  $('appExeCompany').value = cleanExeMetadata(app.exe_company);
  $('appExeCopyright').value = cleanExeMetadata(app.exe_copyright);
  $('appExeVersion').value = app.exe_version || app.version || '1.0.0.0';
}

function normalizeAdminTheme(value) {
  const theme = String(value || '').toLowerCase();
  return ['light', 'dark', 'dayblue'].includes(theme) ? theme : 'light';
}

function applyAdminTheme(theme = localStorage.getItem(ADMIN_THEME_STORAGE_KEY)) {
  const mode = normalizeAdminTheme(theme);
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-dayblue');
  document.body.classList.add(`theme-${mode}`);
  const toggle = $('adminThemeToggle');
  const loginToggle = $('loginThemeToggle');
  const text = $('adminThemeToggleText');
  const loginText = $('loginThemeToggleText');
  const themeLabels = { light: '青绿', dark: '夜间', dayblue: '日间蓝' };
  const nextTheme = { light: '夜间主题', dark: '日间蓝主题', dayblue: '青绿主题' };
  if (toggle) {
    toggle.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
    toggle.title = `当前：${themeLabels[mode]}；点击切换至${nextTheme[mode]}`;
    toggle.setAttribute('aria-label', `当前主题：${themeLabels[mode]}。${toggle.title}`);
  }
  if (text) text.textContent = themeLabels[mode];
  if (loginToggle) {
    loginToggle.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
    loginToggle.title = `当前：${themeLabels[mode]}；点击切换至${nextTheme[mode]}`;
    loginToggle.setAttribute('aria-label', `当前主题：${themeLabels[mode]}。${loginToggle.title}`);
  }
  if (loginText) loginText.textContent = themeLabels[mode];
}

function toggleAdminTheme() {
  const current = normalizeAdminTheme(localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
  const next = { light: 'dark', dark: 'dayblue', dayblue: 'light' }[current];
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
  ensureDownloadCleanupBasicField(grid);

  const stats = view.querySelector('.stats');
  const passwordPanel = createOverviewPanel('启动密码', 'appPasswordPanel', 'saveAppPasswordBtn', '保存启动密码');
  const loginPanel = createOverviewPanel('登录页设置', 'appLoginPanel', 'saveAppLoginBtn', '保存登录页');
  const propertyPanel = createOverviewPanel('EXE 属性', 'appPropertyPanel', 'saveAppExeBtn', '保存 EXE');
  const pageAccessPanel = ensurePageAccessPanel();
  const updatePanel = createOverviewPanel('更新入口', 'appUpdatePanel', 'saveAppUpdateBtn', '保存更新入口');
  updatePanel.classList.add('collapsible-panel', 'is-collapsed');
  updatePanel.dataset.collapsiblePanel = '';
  updatePanel.dataset.defaultCollapsed = '1';
  const popupPanel = createPopupOverviewPanel();
  view.insertBefore(loginPanel, stats);
  view.insertBefore(passwordPanel, stats);
  view.insertBefore(propertyPanel, stats);
  view.insertBefore(updatePanel, stats);
  view.insertBefore(pageAccessPanel, stats);
  view.insertBefore(popupPanel, stats);
  setupCollapsiblePanels();
  bindOverviewSaveActions();
  bindPopupSettingsActions();

  moveLabels(grid, loginPanel.querySelector('.form-grid'), ['loginTitleInput', 'loginHintInput']);
  moveLabels(grid, passwordPanel.querySelector('.form-grid'), ['appPasswordEnabled', 'appPassword']);
  moveLabels(grid, propertyPanel.querySelector('.form-grid'), ['appExeTitle', 'appExeDescription', 'appExeProduct', 'appExeVersion', 'appExeCompany', 'appExeCopyright']);
  const updateVariants = $('appUpdateVariants');
  if (updateVariants) updatePanel.querySelector('.form-grid').appendChild(updateVariants);
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

const AUDIT_FILTER_STORAGE_KEY = 'toolbox_audit_filters';
const AUDIT_FILTER_IDS = ['auditUserFilter', 'auditIpFilter', 'auditKeywordFilter', 'auditActionFilter', 'auditRiskFilter', 'auditStartFilter', 'auditEndFilter'];

function ensureAuditView() {
  if ($('view-audit')) return;
  const view = document.createElement('section');
  view.id = 'view-audit';
  view.className = 'view';
  view.innerHTML = `<div class="panel audit-panel">
    <div class="panel-head"><div><h2>后台操作日志</h2><div id="auditResultCount" class="muted">正在读取日志...</div></div><div class="audit-head-actions"><button id="refreshAuditBtn" type="button">刷新</button><button id="clearFilteredAuditBtn" type="button" class="danger">清理筛选结果</button><button id="clearAuditBtn" type="button" class="danger">清空日志</button></div></div>
    <div class="audit-filters">
      <input id="auditUserFilter" type="search" list="auditUserOptions" autocomplete="off" placeholder="搜索或选择用户"><datalist id="auditUserOptions"></datalist>
      <input id="auditIpFilter" type="search" placeholder="筛选 IP 地址"><input id="auditKeywordFilter" type="search" placeholder="搜索全部日志信息">
      <select id="auditActionFilter"><option value="">全部操作类型</option><option value="login">登录记录</option><option value="POST">新增操作</option><option value="PATCH">修改操作</option><option value="PUT">保存操作</option><option value="DELETE">删除操作</option></select>
      <select id="auditRiskFilter"><option value="">全部风险</option><option value="high">高风险</option><option value="medium">需关注</option><option value="low">无风险</option></select>
      <label>开始时间<input id="auditStartFilter" type="datetime-local"></label><label>结束时间<input id="auditEndFilter" type="datetime-local"></label>
      <button id="resetAuditFiltersBtn" type="button" class="secondary">清除筛选</button>
    </div>
    <div class="table-wrap audit-table-wrap"><table class="audit-table"><thead><tr><th>用户</th><th>操作日志</th><th>时间</th><th>IP 地址</th><th>风险评估</th></tr></thead><tbody id="auditLogRows"><tr><td colspan="5">正在读取日志...</td></tr></tbody></table></div>
  </div>`;
  document.querySelector('main').appendChild(view);
  const announcementCreate = $('announcementCreateBtn');
  const announcementStats = $('announcementStats');
  if (announcementCreate) announcementCreate.hidden = !isSuper();
  if (announcementStats) announcementStats.hidden = !isSuper();
  $('refreshAuditBtn').onclick = () => loadAuditLog().catch(error => setStatus(error.message, true));
  $('clearAuditBtn').onclick = () => clearAuditLog().catch(error => setStatus(error.message, true));
  $('clearFilteredAuditBtn').onclick = () => clearFilteredAuditLog().catch(error => setStatus(error.message, true));
  try {
    const filters = JSON.parse(localStorage.getItem(AUDIT_FILTER_STORAGE_KEY) || '{}');
    AUDIT_FILTER_IDS.forEach((id) => { if ($(id) && typeof filters[id] === 'string') $(id).value = filters[id]; });
  } catch (_) {}
  AUDIT_FILTER_IDS.forEach((id) => {
    const apply = () => { localStorage.setItem(AUDIT_FILTER_STORAGE_KEY, JSON.stringify(Object.fromEntries(AUDIT_FILTER_IDS.map((key) => [key, $(key)?.value || ''])))); renderAuditLog(); };
    $(id).addEventListener('input', apply); $(id).addEventListener('change', apply);
  });
  $('resetAuditFiltersBtn').onclick = () => { AUDIT_FILTER_IDS.forEach((id) => { $(id).value = ''; }); localStorage.removeItem(AUDIT_FILTER_STORAGE_KEY); renderAuditLog(); };
}

async function clearAuditLog() {
  if (!confirm('确定清空全部操作日志吗？清空后无法恢复。')) return;
  const currentPassword = prompt('请输入当前管理员密码以确认清空日志：') || '';
  if (!currentPassword) return;
  const result = await api('/api/super/audit', { method: 'DELETE', body: JSON.stringify({ currentPassword }) });
  await loadAuditLog();
  setStatus(`已清理 ${Number(result.cleared || 0)} 条操作日志。`);
}

async function clearFilteredAuditLog() {
  const hasFilter = AUDIT_FILTER_IDS.some((id) => ($(id)?.value || '').trim());
  if (!hasFilter) { setStatus('请先设置筛选条件，再清理筛选结果。', true); return; }
  const items = filteredAuditItems();
  if (!items.length) { setStatus('当前筛选没有可清理的日志。', true); return; }
  if (!confirm(`确定清理当前筛选出的 ${items.length} 条日志吗？清理后无法恢复。`)) return;
  const currentPassword = prompt('请输入当前管理员密码以确认清理筛选日志：') || '';
  if (!currentPassword) return;
  const result = await api('/api/super/audit', {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword, filtered: true, eventKeys: items.map((item) => item.eventKey).filter(Boolean) })
  });
  await loadAuditLog();
  setStatus(`已清理 ${Number(result.cleared || 0)} 条筛选日志。`);
}

async function loadAuditLog() {
  if (state.auditRefreshBusy) return;
  state.auditRefreshBusy = true;
  ensureAuditView();
  try {
    const data = await api('/api/super/audit');
    state.auditItems = data.items || [];
    updateAuditUserOptions();
    renderAuditLog();
  } finally { state.auditRefreshBusy = false; }
}

function auditAccount(item) {
  const actor = String(item.actor || item.username || '');
  if (actor) return actor;

  const target = String(item.target || '');
  const isRealUser = state.users.some(
    (user) => String(user.username || '') === target
  );

  return String(item.action || '').startsWith('login_') && isRealUser
    ? target
    : '未知用户';
}
function auditPath(item) { const value = String(item?.details?.path || item.path || item.target || ''); return value.startsWith('/api/') ? value : String(item?.details?.path || item.path || ''); }
function updateAuditUserOptions() {
  const options = $('auditUserOptions');
  const users = [...new Set(state.users.flatMap((user) => [user.displayName, user.username, user.email]
    .map((value) => String(value || '').trim()).filter(Boolean)))].sort();

  const signature = JSON.stringify(users);
  if (!options || options.dataset.optionsSignature === signature) return;

  options.replaceChildren(
    ...users.map((name) => new Option(name, name))
  );
  options.dataset.optionsSignature = signature;
}

function auditUserSearchText(item) {
  const account = auditAccount(item);
  const user = state.users.find(
    (entry) => entry.username === account || entry.id === item.actorId
  );
  return `${item.actorDisplayName || user?.displayName || ''} ${item.actor || user?.username || account} ${item.actorEmail || user?.email || ''}`;
}

function auditUserLabel(item) {
  const account = auditAccount(item);
  const user = state.users.find((entry) => entry.username === account || entry.id === item.actorId);
  const displayName = String(item.actorDisplayName || user?.displayName || '').trim();
  const username = String(item.actor || user?.username || account || '').trim();
  const email = String(item.actorEmail || user?.email || '').trim();
  return `<strong>${escapeHtml(displayName || username || '未知用户')}</strong>${username && username !== displayName ? `<div class="muted audit-user-username">用户名：${escapeHtml(username)}</div>` : ''}${email ? `<div class="muted audit-user-email">邮箱：${escapeHtml(email)}</div>` : ''}`;
}

function auditDetailValue(value) {
  if (value === true) return '已开启';
  if (value === false) return '已关闭';
  if (value === null || value === undefined || value === '') return '未设置';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function ensureAuditDetailDialog() {
  let overlay = $('auditDetailOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'auditDetailOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal-card audit-detail-card" role="dialog" aria-modal="true" aria-labelledby="auditDetailTitle">
    <div class="panel-head"><div><h2 id="auditDetailTitle">日志详情</h2><div id="auditDetailSubtitle" class="muted"></div></div><button id="auditDetailClose" type="button">关闭</button></div>
    <div id="auditDetailBody" class="audit-detail-body"></div>
  </div>`;
  document.body.appendChild(overlay);
  $('auditDetailClose').onclick = () => { overlay.hidden = true; };
  overlay.onclick = (event) => { if (event.target === overlay) overlay.hidden = true; };
  return overlay;
}

function openAuditDetail(item) {
  if (!item) return;
  const overlay = ensureAuditDetailDialog();
  const details = item.details && typeof item.details === 'object' ? item.details : {};
  const changes = Array.isArray(details.changes) ? details.changes : [];
  const level = auditRisk(item);
  const riskLabels = { high: '高风险', medium: '需关注', low: '无风险' };
  const address = String(item.ipAddress || '').trim();
  $('auditDetailTitle').textContent = describeAuditEntry(item);
  $('auditDetailSubtitle').textContent = `${formatDateTime(item.time)} · ${riskLabels[level]}`;
  const changeMarkup = changes.length ? `<section class="audit-detail-section"><h3>本次操作的具体变化</h3><div class="audit-change-list">${changes.map((change) => `<div class="audit-change-row"><strong>${escapeHtml(change.field || '配置项')}</strong><div><span class="audit-before">${escapeHtml(auditDetailValue(change.before))}</span><b>→</b><span class="audit-after">${escapeHtml(auditDetailValue(change.after))}</span></div></div>`).join('')}</div></section>` : '<section class="audit-detail-section"><h3>操作内容</h3><p class="muted">这条旧日志没有保存字段级变化，只保留了基础操作信息。</p></section>';
  const extraDetails = Object.entries(details).filter(([key]) => !['title', 'category', 'method', 'path', 'changes', 'itemName', 'operation'].includes(key));
  $('auditDetailBody').innerHTML = `
    <div class="audit-detail-grid">
      <section class="audit-detail-section"><h3>操作账号与联系方式</h3><div class="audit-detail-user">${auditUserLabel(item)}</div></section>
      <section class="audit-detail-section"><h3>请求信息</h3><dl><dt>操作类型</dt><dd>${escapeHtml(details.method || String(item.action || '').replace(/^backend_/, '').toUpperCase() || '未记录')}</dd><dt>接口</dt><dd>${escapeHtml(auditPath(item) || '未记录')}</dd><dt>IP 地址</dt><dd>${escapeHtml(item.ip || '未记录')}</dd>${address ? `<dt>IP 归属地</dt><dd>${escapeHtml(address)}</dd>` : ''}<dt>执行结果</dt><dd>${item.success === false ? '失败' : '成功'}</dd></dl></section>
    </div>
    ${changeMarkup}
    ${extraDetails.length ? `<section class="audit-detail-section"><h3>补充信息</h3><dl>${extraDetails.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(auditDetailValue(value))}</dd>`).join('')}</dl></section>` : ''}
    <section class="audit-detail-section audit-raw-info"><h3>日志标识</h3><div>${escapeHtml(item.eventKey || '未记录')}</div></section>`;
  overlay.hidden = false;
}

function auditRisk(item) {
  const action = String(item.action || ''); const path = auditPath(item);
  if (item.success === false || action.includes('delete') || action.includes('blocked') || action.includes('reauth_failed')) return 'high';
  if (/(account|users|system|mail|template)/.test(path) && /(?:patch|put|post|update|reset)/.test(action)) return 'high';
  if (/^backend_(patch|put|post)$/.test(action) || /(?:update|reset|requested)/.test(action)) return 'medium';
  return 'low';
}

function describeAuditEntry(item) {
  const action = String(item.action || ''); const path = auditPath(item); const detailTitle = String(item?.details?.title || '').trim();
  const fixed = { login_success: '登录后台成功', login_failed: '登录后台失败（账号或密码错误）', login_blocked: '登录尝试过多，已临时拦截', register_success: '注册后台账号成功', register_failed: '注册后台账号失败', account_self_update: '修改自己的账号资料', account_admin_update: '管理员修改用户资料', user_delete: '删除用户', users_batch_delete: '批量删除用户', password_reset_requested: '申请重置密码', password_reset_completed: '完成密码重置', config_basic_update: '修改基础信息', contact_settings_update: '修改联系方式' };
  if (detailTitle && detailTitle !== '后台操作') return `${detailTitle}${item.success === false ? '失败' : ''}`;
  if (fixed[action]) return fixed[action];
  const method = String(item?.details?.method || action.replace(/^backend_/, '')).toUpperCase();
  const methods = { POST: '新增', PUT: '保存', PATCH: '修改', DELETE: '删除' };
  const targets = [[/\/register$/, '注册后台账号'], [/\/super\/users/, '后台账号'], [/\/buttons$/, '按钮'], [/\/account$/, '账号资料'], [/\/app$/, '基础信息'], [/\/popup$/, '联系方式'], [/\/config/, '后台配置'], [/\/announcements/, '更新公告'], [/\/users/, '用户'], [/\/invites/, '邀请码'], [/\/mail/, '邮箱设置'], [/\/system/, '系统设置'], [/\/template/, '用户模板'], [/\/orders/, '订单']];
  const target = targets.find(([pattern]) => pattern.test(path))?.[1] || '后台数据';
  return `${methods[method] || '执行'}${target}${item.success === false ? '失败' : '成功'}`;
}

function filteredAuditItems() {
  const user = ($('auditUserFilter')?.value || '').trim().toLowerCase(); const ip = ($('auditIpFilter')?.value || '').trim().toLowerCase();
  const keyword = ($('auditKeywordFilter')?.value || '').trim().toLowerCase(); const actionType = $('auditActionFilter')?.value || ''; const risk = $('auditRiskFilter')?.value || '';
  const start = $('auditStartFilter')?.value ? new Date($('auditStartFilter').value).getTime() : 0; const end = $('auditEndFilter')?.value ? new Date($('auditEndFilter').value).getTime() : 0;
  return state.auditItems.filter((item) => {
    const account = auditAccount(item); const description = describeAuditEntry(item); const itemTime = new Date(item.time).getTime(); const action = String(item.action || '');
    if (user && !auditUserSearchText(item).toLowerCase().includes(user)) return false;
    if (ip && !`${item.ip || ''} ${item.ipAddress || ''}`.toLowerCase().includes(ip)) return false;
    const riskLabel = { high: '高风险', medium: '需关注', low: '无风险' }[auditRisk(item)];
    const searchable = `${auditUserSearchText(item)} ${description} ${action} ${auditPath(item)} ${item.ip || ''} ${formatDateTime(item.time)} ${riskLabel} ${JSON.stringify(item)}`;
    if (keyword && !searchable.toLowerCase().includes(keyword)) return false;
    const itemMethod = String(item?.details?.method || action.replace(/^backend_/, '')).toUpperCase();
    if (actionType === 'login' && !action.startsWith('login_')) return false;
    if (actionType && actionType !== 'login' && itemMethod !== actionType) return false;
    if (risk && auditRisk(item) !== risk) return false;
    if (start && itemTime < start) return false; if (end && itemTime > end) return false; return true;
  });
}

function renderAuditLog() {
  const items = filteredAuditItems();
  const visible = items.slice(0, 1000); const labels = { high: '高风险', medium: '需关注', low: '无风险' };
  $('auditResultCount').textContent = `匹配 ${items.length} 条，当前显示 ${visible.length} 条，共读取 ${state.auditItems.length} 条；筛选条件会自动保存`;
  const rows = $('auditLogRows');
  const signature = JSON.stringify(visible.map((item) => [item.eventKey, item.time, item.action, item.actorId, item.actorDisplayName, item.actorEmail, item.ip, item.ipAddress, item.success, item.details]));
  if (rows.auditRenderSignature === signature) return;
  rows.auditRenderSignature = signature;
  rows.innerHTML = visible.map((item, index) => { const level = auditRisk(item); const address = String(item.ipAddress || '').trim(); const changeCount = Array.isArray(item?.details?.changes) ? item.details.changes.length : 0; return `<tr class="audit-log-row" data-audit-index="${index}" tabindex="0" title="点击查看本条日志详情"><td>${auditUserLabel(item)}</td><td><strong>${escapeHtml(describeAuditEntry(item))}</strong>${changeCount ? `<div class="muted audit-change-count">包含 ${changeCount} 项具体变化</div>` : '<div class="muted audit-change-count">点击查看详情</div>'}</td><td>${escapeHtml(formatDateTime(item.time))}</td><td><div>${escapeHtml(item.ip || '未记录')}</div>${address ? `<div class="muted audit-ip-address">${escapeHtml(address)}</div>` : ''}</td><td><span class="audit-risk ${level}">${labels[level]}</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty-cell">没有符合当前筛选条件的日志</td></tr>';
  rows.querySelectorAll('[data-audit-index]').forEach((row) => {
    const open = () => openAuditDetail(visible[Number(row.dataset.auditIndex || 0)]);
    row.onclick = open;
    row.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
  });
}

function syncAuditAutoRefresh(view) {
  if (state.auditRefreshTimer) { clearInterval(state.auditRefreshTimer); state.auditRefreshTimer = null; }
  if (view !== 'audit' || !isSuper()) return;
  state.auditRefreshTimer = setInterval(() => { if (state.activeView === 'audit' && document.visibilityState === 'visible') loadAuditLog().catch(() => {}); }, 2000);
}

function ensureDownloadCleanupBasicField(grid) {
  if (!grid || $('deleteDownloadsOnExit')) return;
  const label = document.createElement('label');
  label.className = 'toggle-line';
  label.innerHTML = '关闭时自动删除已下载文件<span><input id="deleteDownloadsOnExit" type="checkbox"> 开启</span>';
  grid.appendChild(label);
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
    ['appExeCompany', 'EXE 公司名称', '可留空；不要填写工作室署名'],
    ['appExeCopyright', 'EXE 版权', '可留空；不要填写工作室署名']
  ];
  fields.forEach(([id, labelText, placeholder]) => {
    const label = document.createElement('label');
    label.innerHTML = `${labelText}<input id="${id}" placeholder="${placeholder}">`;
    grid.appendChild(label);
  });
}

function cleanExeMetadata(value) {
  const text = String(value || '').trim();
  return text.includes('少年科技工作室') ? '' : text;
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

function allowedImageUrl(value) {
  try {
    const text = String(value || '').trim();
    if (!text || text.length > 2048 || /[\s\\\x00-\x1f\x7f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(text)) return false;
    const url = new URL(text);
    return /^https:\/\//i.test(text) && url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function refreshImageUrlPreviews() {
  document.querySelectorAll('[data-image-url-field]').forEach((field) => {
    const input = field.querySelector('input');
    const image = field.querySelector('img');
    if (!input || !image) return;
    const value = input.value.trim();
    image.hidden = true;
    image.removeAttribute('src');
    if (allowedImageUrl(value)) {
      image.onload = () => { image.hidden = false; };
      image.onerror = () => { image.hidden = true; image.removeAttribute('src'); };
      image.src = value;
    }
  });
}

function handleImageUrlAction(event) {
  const previewButton = event.target.closest('[data-image-preview]');
  const clearButton = event.target.closest('[data-image-clear]');
  const button = previewButton || clearButton;
  if (!button) return;
  const input = $(button.dataset.imagePreview || button.dataset.imageClear);
  const field = input?.closest('[data-image-url-field]');
  const image = field?.querySelector('img');
  if (!input || !field || !image) return;
  if (clearButton) {
    input.value = '';
    image.hidden = true;
    image.removeAttribute('src');
    return;
  }
  if (!allowedImageUrl(input.value)) {
    setStatus('图片地址必须是有效的 HTTPS 链接。', true);
    return;
  }
  image.onload = () => { image.hidden = false; setStatus('图片预览已加载。'); };
  image.onerror = () => { image.hidden = true; image.removeAttribute('src'); setStatus('图片加载失败，请检查图床地址或图片格式。', true); };
  image.src = input.value.trim();
}

function ensureUpdateFields() {
  if ($('appUpdateVariants')) return;
  const grid = $('appPassword')?.closest('.form-grid');
  if (!grid) return;
  const wrap = document.createElement('div');
  wrap.id = 'appUpdateVariants';
  wrap.className = 'update-variant-list';
  wrap.innerHTML = CLIENT_VARIANTS.map((variant) => `<section class="update-variant-card" data-update-variant="${escapeAttr(variant.id)}">
    <h3>${escapeHtml(variant.label)}</h3>
    <div class="form-grid compact">
      <label>当前最新版<input data-update-field="version" placeholder="例如：4.0"></label>
      <label>最低可用版本<input data-update-field="minVersion" placeholder="例如：3.0"></label>
      <label class="wide">更新链接<input data-update-field="url" placeholder="新版 EXE、网盘或网页地址"></label>
      <label>弹窗标题<input data-update-field="title" placeholder="工具箱更新"></label>
      <label>更新按钮文字<input data-update-field="button" placeholder="下载最新版"></label>
      <label class="toggle-line wide">强制更新<span><input data-update-field="force" type="checkbox"> 低于最低版本时禁止使用</span></label>
    </div>
  </section>`).join('');
  grid.appendChild(wrap);
}

function renderAccount() {
  const user = state.currentUser || {};
  $('accountUsername').value = user.username || '';
  $('accountEmail').value = user.email || '';
  $('accountDisplayName').value = user.displayName || '';
  $('accountCurrentPassword').value = '';
  $('accountNewPassword').value = '';
  let ip = $('accountLastLoginIp');
  if (!ip) {
    const label = document.createElement('label');
    label.innerHTML = '最后登录 IP<input id="accountLastLoginIp" readonly>';
    $('accountDisplayName').closest('.form-grid').appendChild(label);
    ip = $('accountLastLoginIp');
  }
  const last = user.lastLoginIp || {};
  ip.value = last.ip ? `${last.ip} · ${last.address || '未知位置'}` : '暂无记录';
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
  const emailChanged = body.email.toLowerCase() !== String(state.currentUser?.email || '').toLowerCase();
  if (newPassword || emailChanged) {
    body.currentPassword = $('accountCurrentPassword').value;
    if (!body.currentPassword) {
      setStatus('修改邮箱或密码前请输入当前密码。', true);
      return;
    }
  }
  if (newPassword) {
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
  ensureUserBatchTools(panel);
  const query = ($('userListSearch')?.value || '').trim().toLowerCase();
  const visibleUsers = state.users.filter((user) => !query ||
    [user.displayName, user.username, user.email].some((value) =>
      String(value || '').toLowerCase().includes(query)));
  const counterText = query ? `${visibleUsers.length}/${state.users.length}` : state.users.length;
  setPanelCounter(panel, 'userTotalCount', counterText);
  const selectAll = $('userSelectAll');
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
  let cards = $('userCards');
  if (!cards && panel) {
    cards = document.createElement('div');
    cards.id = 'userCards';
    cards.className = 'user-card-list';
    panel.appendChild(cards);
  }
  if (!cards) return;
  cards.classList.add('collapsible-body');
  cards.hidden = !!panel?.classList.contains('is-collapsed');
  cards.innerHTML = '';

  if (!visibleUsers.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-cell';
    empty.textContent = query ? '未找到匹配的用户。' : '暂无用户。';
    cards.appendChild(empty);
  }

  visibleUsers.forEach((user) => {
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
          <small>上次登录：${escapeHtml(formatDateTime(user.lastLoginAt))}${user.lastLoginIp?.ip ? ` · ${escapeHtml(user.lastLoginIp.ip)} · ${escapeHtml(user.lastLoginIp.address || '未知位置')}` : ''}${user.parentAgentName ? ` · 归属代理：${escapeHtml(user.parentAgentName)}` : ''}</small>
        </div>
        <span class="pill">${escapeHtml(user.roleLabel || (user.role === 'super' ? '总管理员' : (user.role === 'agent' ? '代理' : '普通用户')))}</span>
        <span class="pill ${user.active === false ? 'danger-pill' : ''}">${user.active === false ? '已停用' : '正常'}</span>
        <span class="pill ${user.canViewJson === false ? 'muted-pill' : ''}">JSON ${user.canViewJson === false ? '不可见' : '可见'}</span>
        ${user.role === 'agent' ? `
          <div class="agent-card-meta">
            <span class="pill agent-level-pill">${escapeHtml(user.agentLevelName || '默认代理级别')}</span>
            <span class="pill">邀请码 ${Number(user.agentInviteCount || 0)}</span>
            <span class="pill">推广用户 ${Number(user.promotedUserCount || 0)}</span>
            <label class="inline-balance">
              <span>代理余额</span>
              <input data-field="balance" type="number" step="0.01" value="${Number(user.balance || 0)}" ${!isSuper() ? 'disabled' : ''}>
              <button data-action="save-balance" type="button" ${!isSuper() ? 'disabled' : ''}>保存余额</button>
            </label>
          </div>
        ` : ''}
      </div>
      <div class="user-card-detail" hidden>
        ${isSuper() ? `<div class="cloud-user-entitlement"><strong>网盘解析权益</strong><span>${escapeHtml(entitlementSummary(state.cloudUserEntitlements?.[user.id]?.entitlement))}</span><div class="card-actions"><button data-action="cloud-grant" type="button">授权</button><button data-action="cloud-renew" type="button">续期</button><button data-action="cloud-edit" type="button">修改额度/到期</button><button data-action="cloud-revoke" type="button" class="danger">撤销</button><button data-action="cloud-history" type="button">历史</button></div></div>` : ''}
        <div class="login-ip-history"><strong>最近三次登录 IP</strong>${(user.loginIpHistory || []).map(item => `<div>${escapeHtml(formatDateTime(item.time))} · ${escapeHtml(item.ip || '')} · ${escapeHtml(item.address || '未知位置')}</div>`).join('') || '<div>暂无记录</div>'}</div>
        <div class="form-grid">
          <label>账号<input data-field="username" value="${escapeAttr(user.username || '')}"><small>${escapeHtml(user.id || '')}</small></label>
          <label>邮箱<input data-field="email" type="email" value="${escapeAttr(user.email || '')}"></label>
          <label>显示名称<input data-field="displayName" value="${escapeAttr(user.displayName || '')}"></label>
          <label>角色
            <select data-field="role" ${!isSuper() || user.role === 'super' ? 'disabled' : ''}>
              ${user.role === 'super'
                ? '<option value="super" selected>总管理员（系统保留）</option>'
                : `<option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option><option value="agent" ${user.role === 'agent' ? 'selected' : ''}>代理</option>`}
            </select>
          </label>
          <label>代理级别
            <select data-field="agentLevelId" ${!isSuper() || user.role !== 'agent' ? 'disabled' : ''}>
              ${user.role === 'agent' ? agentLevelOptionsHtml(user.agentLevelId || '') : '<option value="">仅代理账号可选</option>'}
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
    const roleInput = card.querySelector('[data-field="role"]');
    const levelInput = card.querySelector('[data-field="agentLevelId"]');
    if (roleInput && levelInput) {
      roleInput.onchange = () => {
        const isAgentRole = roleInput.value === 'agent';
        levelInput.innerHTML = isAgentRole ? agentLevelOptionsHtml(levelInput.value || '') : '<option value="">仅代理账号可选</option>';
        levelInput.disabled = !isSuper() || !isAgentRole;
      };
    }
    card.querySelector('[data-action="download"]').onclick = () => downloadClient(user.id);
    card.querySelector('[data-action="save"]').onclick = () => saveUser(user.id, card)
      .catch((error) => setStatus(error.message || '保存用户失败。', true));
    const saveBalanceBtn = card.querySelector('[data-action="save-balance"]');
    if (saveBalanceBtn) saveBalanceBtn.onclick = () => saveAgentBalance(user.id, card)
      .catch((error) => setStatus(error.message || '保存代理余额失败。', true));
    const promoteBtn = card.querySelector('[data-action="promote-agent"]');
    if (promoteBtn) promoteBtn.onclick = () => promoteUserAgent(user.id)
      .catch((error) => setStatus(error.message || '设置代理失败。', true));
    const cancelAgentBtn = card.querySelector('[data-action="cancel-agent"]');
    if (cancelAgentBtn) cancelAgentBtn.onclick = () => cancelUserAgent(user.id)
      .catch((error) => setStatus(error.message || '取消代理失败。', true));
    const viewAgentOrdersBtn = card.querySelector('[data-action="view-agent-orders"]');
    if (viewAgentOrdersBtn) viewAgentOrdersBtn.onclick = () => jumpToAgentOrders(user.id);
    const cloudGrant = card.querySelector('[data-action="cloud-grant"]');
    if (cloudGrant) cloudGrant.onclick = () => grantUserCloudEntitlement(user.id).catch((error) => setStatus(cloudErrorMessage(error), true));
    const cloudRenew = card.querySelector('[data-action="cloud-renew"]');
    if (cloudRenew) cloudRenew.onclick = () => grantUserCloudEntitlement(user.id, true).catch((error) => setStatus(cloudErrorMessage(error), true));
    const cloudRevoke = card.querySelector('[data-action="cloud-revoke"]');
    if (cloudRevoke) cloudRevoke.onclick = () => revokeUserCloudEntitlement(user.id).catch((error) => setStatus(cloudErrorMessage(error), true));
    const cloudHistory = card.querySelector('[data-action="cloud-history"]');
    if (cloudHistory) cloudHistory.onclick = () => showUserCloudEntitlementHistory(user.id).catch((error) => setStatus(cloudErrorMessage(error), true));
    const cloudEdit = card.querySelector('[data-action="cloud-edit"]');
    if (cloudEdit) cloudEdit.onclick = async () => {
      const entitlement = state.cloudUserEntitlements?.[user.id]?.entitlement;
      if (!entitlement) { setStatus('该用户当前没有可修改的权益，请先授权。', true); return; }
      const expiry = window.prompt('输入新的到期时间（ISO格式，如 2027-01-01T00:00:00+00:00）：', entitlement.expiresAt || entitlement.expiredAt || '');
      if (expiry == null) return;
      const parseQuota = window.prompt('解析总额度（-1 表示不限）：', String(entitlement.parseQuota ?? -1));
      if (parseQuota == null) return;
      const trafficQuota = window.prompt('流量总额度（兆字节，-1 表示不限）：', String(entitlement.trafficQuota ?? -1));
      if (trafficQuota == null) return;
      await api(`/api/admin/users/${encodeURIComponent(user.id)}/cloud-entitlement`, { method: 'PATCH', body: JSON.stringify({ expiresAt: expiry, parseQuota: Number(parseQuota), trafficQuota: Number(trafficQuota) }) });
      await loadCloudResolver(); renderUsers(); showToast('用户网盘权益已修改。', 'success');
    };
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
    <input id="userListSearch" type="search" autocomplete="off"
      placeholder="搜索昵称、用户名或邮箱">
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
  $('userListSearch').oninput = () => renderUsers();
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
    const canDelete = invite.canDelete === true || (invite.canDelete == null && isSuper());
    const canToggle = invite.canToggle === true || (invite.canToggle == null && !inviteUsed && (isSuper() || !invite.superDisabled));
    const toggleAction = canToggle
      ? `<button data-invite-action="toggle">${invite.active ? '停用' : '启用'}</button>`
      : (invite.superDisabled && !isSuper() && !inviteUsed ? '<span class="invite-lock-note">总管理员已停用</span>' : '');
    const deleteAction = canDelete ? '<button data-invite-action="delete" class="danger">删除</button>' : '';
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
        ${toggleAction}
        ${deleteAction}
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
  list.innerHTML = state.notices.map((notice) => {
    const isAnnouncement = notice.refType === 'announcement' || String(notice.id || '').startsWith('announcement:');
    return `
    <div class="notice-item ${notice.read ? 'is-read' : ''}" data-notice-id="${escapeAttr(notice.id || '')}" data-order-id="${escapeAttr(orderIdFromNotice(notice))}">
      <div class="notice-item-head">
        <strong>${escapeHtml(notice.title || '通知')}</strong>
        ${isSuper() && !isAnnouncement ? '<div class="notice-item-actions"><button class="notice-mail-one" type="button">邮箱推送</button><button class="notice-delete-one" type="button">删除</button></div>' : ''}
      </div>
      <p>${escapeHtml(notice.content || '')}</p>
      <small>${escapeHtml(noticeAuthorName(notice))} · ${escapeHtml(formatDateTime(notice.createdAt))}</small>
    </div>
  `; }).join('');
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
  if (String(noticeId || '').startsWith('announcement:')) {
    const announcementId = String(noticeId).slice('announcement:'.length);
    closeNoticeDropdown();
    switchView('announcements');
    await openAnnouncementDetail(announcementId);
    const notice = state.notices.find((item) => item.id === noticeId);
    if (notice) notice.read = true;
    renderNotices();
    return;
  }
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
  ensureIpLocationPanel();
  const ipLocation = state.system.ipLocation || {};
  document.querySelectorAll('[data-ip-provider]').forEach(input => { input.checked = (ipLocation.providers || ['system']).includes(input.value); });
  if ($('ipLocationMode')) $('ipLocationMode').value = ipLocation.mode || 'consensus';
  if ($('ipLocationThreshold')) $('ipLocationThreshold').value = Number(ipLocation.threshold || 2);
  if ($('ipUnifiedChinese')) $('ipUnifiedChinese').checked = ipLocation.unifiedChinese !== false;
  if ($('ipAmapKey')) $('ipAmapKey').value = ipLocation.amapKey || '';
  if ($('ipBaiduKey')) $('ipBaiduKey').value = ipLocation.baiduKey || '';
  if ($('ipTencentKey')) $('ipTencentKey').value = ipLocation.tencentKey || '';
  if ($('ipAmapSecret')) $('ipAmapSecret').value = ipLocation.amapSecret || '';
  if ($('ipTencentSecret')) $('ipTencentSecret').value = ipLocation.tencentSecret || '';
  if ($('systemNoticeTitle')) $('systemNoticeTitle').value = locations.noticeAreaTitle || '全部未读';
  if ($('systemMenuName')) $('systemMenuName').value = locations.adminSystemName || '系统管理';
  if ($('systemFrontendGlow')) $('systemFrontendGlow').checked = locations.frontendActiveGlow !== false;
  if ($('systemFrontendGroupCount')) $('systemFrontendGroupCount').checked = locations.frontendShowGroupCount !== false;
  if ($('integrityEnabled')) $('integrityEnabled').checked = integrity.enabled !== false;
  if ($('integrityTokenTtl')) $('integrityTokenTtl').value = Number(integrity.tokenTtlMinutes || 10080);
  if ($('integrityRotateSecret')) $('integrityRotateSecret').checked = false;
  const agentLevels = Array.isArray(agent.levels) && agent.levels.length
    ? agent.levels
    : [{ id: 'level-default', name: '默认代理级别', price: Number(agent.invitePrice || 0), sort: 10, enabled: true }];
  agent.levels = agentLevels;
  if ($('agentCurrency')) $('agentCurrency').value = agent.currency || 'CNY';
  if ($('agentCloudCodePrice')) $('agentCloudCodePrice').value = Number(agent.cloudCodePrice || 0);
  if ($('agentOrderCooldown')) $('agentOrderCooldown').value = Number(agent.orderCooldownMinutes ?? 30);
  if ($('cloudResolverOrderExpiryMinutes')) $('cloudResolverOrderExpiryMinutes').value = Number(state.system.cloudResolverOrderExpiryMinutes ?? 30);
  if ($('cloudResolverDiagnosticsEnabled')) $('cloudResolverDiagnosticsEnabled').checked = state.system.cloudResolverDiagnosticsEnabled === true;
  if ($('cloudResolverDiagnosticsStatus')) $('cloudResolverDiagnosticsStatus').textContent = state.system.cloudResolverDiagnosticsEnabled === true ? '已开启' : '已关闭';
  if ($('agentAllowNegative')) $('agentAllowNegative').checked = !!agent.allowNegativeBalance;
  renderAgentLevelRows();
  if ($('payWechatChannel')) $('payWechatChannel').value = pay.wechatChannel || 'disabled';
  if ($('payAlipayChannel')) $('payAlipayChannel').value = pay.alipayChannel || 'disabled';
  if ($('payWechatOrder')) $('payWechatOrder').value = Number(pay.wechatOrder || 10);
  if ($('payAlipayOrder')) $('payAlipayOrder').value = Number(pay.alipayOrder || 20);
  renderPayGatewayCards();
  renderClientVariantSettings();
  renderEsportsAudioModuleSettings();
  renderOrders();
  renderBuiltinFunctions();
  renderMenuIcons();
}

async function loadMenuIcons() {
  const result = await api('/api/admin/menu-icons');
  state.menuIcons = result.icons || [];
  state.menuIconLibraryError = result.libraryError || '';
  if (!state.system) state.system = {};
  state.system.menuIconFolders = Array.isArray(result.folders) && result.folders.length ? result.folders : [{ id: 'default', name: '默认', sort: 0 }];
}

function renderMenuIcons() {
  const root = $('menuIconRows');
  if (!root || !isSuper()) return;
  const icons = Array.isArray(state.system?.menuIcons) ? state.system.menuIcons : [];
  const folders = [...(state.system?.menuIconFolders || [{id:'default', name:'默认', sort:0}])].sort((a,b)=>(a.sort||0)-(b.sort||0));
  const targetSelect = $('globalMenuIconTargetFolder');
  if (targetSelect) {
    const selectedTarget = targetSelect.value || state.menuIconFolderView || 'default';
    targetSelect.innerHTML = folders.map(folder => `<option value="${escapeAttr(folder.id)}">${escapeHtml(folder.name)}</option>`).join('');
    targetSelect.value = folders.some(folder => folder.id === selectedTarget) ? selectedTarget : (folders[0]?.id || 'default');
  }
  const activeId = state.menuIconFolderView || '';
  const active = folders.find(folder => folder.id === activeId);
  const visibleIcons = icons.map((item,index) => ({ item, index })).filter(row => (row.item.folderId || 'default') === (activeId || 'default')).sort((a,b) => (a.item.sort || 0) - (b.item.sort || 0));
  const crumbs = `<div class="menu-icon-breadcrumb"><button type="button" data-menu-folder-home>首页</button><span>/</span><strong>图标库</strong>${active ? `<span>/</span><strong>${escapeHtml(active.name)}</strong>` : ''}</div>`;
  const folderCards = !active ? folders.map(folder => `<button class="menu-icon-card folder-card" type="button" data-menu-folder-open="${escapeAttr(folder.id)}"><span class="folder-glyph" aria-hidden="true"></span><strong>${escapeHtml(folder.name)}</strong><small>${icons.filter(item => (item.folderId || 'default') === folder.id).length} 个图标</small></button>`).join('') : '';
  const iconCards = active ? visibleIcons.map(({item,index}) => `<article class="menu-icon-card image-card" data-menu-icon-index="${index}"><div class="menu-icon-thumb"><img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.name)}"></div><input data-menu-icon-name value="${escapeAttr(item.name)}" aria-label="图标名称"><input data-menu-icon-sort type="number" value="${escapeAttr(item.sort || 0)}" aria-label="排序"><select data-menu-icon-folder aria-label="移动到文件夹">${folders.map(target=>`<option value="${escapeAttr(target.id)}" ${target.id === (item.folderId || 'default') ? 'selected' : ''}>移动到：${escapeHtml(target.name)}</option>`).join('')}</select><button class="danger" data-menu-icon-delete type="button">删除</button></article>`).join('') : '';
  root.innerHTML = `${crumbs}<div class="menu-icon-grid">${folderCards}${iconCards || (!folderCards ? '<p class="empty">此文件夹暂无图片。</p>' : '')}</div>`;
  root.querySelector('[data-menu-folder-home]').onclick = () => { state.menuIconFolderView = ''; if ($('globalMenuIconTargetFolder')) $('globalMenuIconTargetFolder').value = 'default'; renderMenuIcons(); };
  root.querySelectorAll('[data-menu-folder-open]').forEach(button => button.onclick = () => { state.menuIconFolderView = button.dataset.menuFolderOpen; if ($('globalMenuIconTargetFolder')) $('globalMenuIconTargetFolder').value = state.menuIconFolderView; renderMenuIcons(); });
  root.querySelectorAll('[data-menu-icon-delete]').forEach(button => button.onclick = () => { icons.splice(Number(button.closest('[data-menu-icon-index]').dataset.menuIconIndex), 1); renderMenuIcons(); });
  root.querySelectorAll('[data-menu-icon-name]').forEach(input => input.onchange = () => { icons[Number(input.closest('[data-menu-icon-index]').dataset.menuIconIndex)].name = input.value.trim(); });
  root.querySelectorAll('[data-menu-icon-sort]').forEach(input => input.onchange = () => { icons[Number(input.closest('[data-menu-icon-index]').dataset.menuIconIndex)].sort = Number(input.value || 0); });
  root.querySelectorAll('[data-menu-icon-folder]').forEach(input => input.onchange = () => { icons[Number(input.closest('[data-menu-icon-index]').dataset.menuIconIndex)].folderId = input.value; renderMenuIcons(); });
  if ($('menuIconLibraryStatus') && !state.menuIconLibraryError) $('menuIconLibraryStatus').textContent = `项目图库现有 ${icons.length} 个图标，所有用户均可看图选择。`;
}

function addMenuIconFolder() {
  const name = $('globalMenuIconFolderName').value.trim();
  if (!name) throw new Error('请填写文件夹名称。');
  state.system.menuIconFolders = state.system.menuIconFolders || [{id:'default', name:'默认', sort:0}];
  if (state.system.menuIconFolders.some(folder => String(folder.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('文件夹名称已存在，请换一个名称。');
  state.system.menuIconFolders.push({id:`folder_${Date.now().toString(36)}`, name, sort:state.system.menuIconFolders.length});
  $('globalMenuIconFolderName').value = ''; renderMenuIcons();
}

function menuIconOptionsHtml(selected = '') {
  const folders = [...(state.system?.menuIconFolders || [{ id: 'default', name: '默认', sort: 0 }])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return `<option value="">不使用默认图标</option>${folders.map(folder => `<optgroup label="${escapeAttr(folder.name)}">${(state.menuIcons || []).filter(item => (item.folderId || 'default') === folder.id).sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(item => `<option value="${escapeAttr(item.url)}" ${item.url === selected ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</optgroup>`).join('')}`;
}

async function uploadImage(input, endpoint) {
  const file = input?.files?.[0];
  if (!file) throw new Error('请先选择图片。');
  if (file.size > 2 * 1024 * 1024) throw new Error('图标图片不能超过 2MB。');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return api(endpoint, { method: 'POST', body: JSON.stringify({ dataUrl }) });
}

async function uploadMenuIconFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error(`${file.name} 超过 2MB。`);
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let result;
  try {
    result = await api('/api/super/system/menu-icon', { method: 'POST', body: JSON.stringify({ dataUrl, folderId: $('globalMenuIconTargetFolder')?.value || state.menuIconFolderView || 'default', relativePath: file.webkitRelativePath || '' }), signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${file.name} 上传超时。`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return { id: `icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.[^.]+$/, ''), url: result.url, folderId: $('globalMenuIconTargetFolder')?.value || state.menuIconFolderView || 'default', sort: 0 };
}

async function uploadMenuIconFolder() {
  const input = $('globalMenuIconFolder');
  const uploadButton = $('uploadMenuIconFolderBtn');
  let files = [...(input?.files || []), ...(Array.from($('globalMenuIconFiles')?.files || []))].filter((file) => /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/i.test(file.type) || /\.(png|jpe?g|webp|gif|ico)$/i.test(file.name));
  if (!files.length) throw new Error('请选择图片或包含图片的文件夹。');
  if (files.length > 500) throw new Error('一次最多上传 500 个图标。');
  if (!Array.isArray(state.system.menuIcons)) state.system.menuIcons = [];
  const normalizedName = (value) => String(value || '').trim().toLocaleLowerCase();
  const selectedByName = new Map();
  files.forEach((file) => selectedByName.set(normalizedName(file.name.replace(/\.[^.]+$/, '')), file));
  files = [...selectedByName.values()];
  const existingNames = new Set(state.system.menuIcons.map((item) => normalizedName(item.name)));
  const duplicateNames = files.map((file) => file.name.replace(/\.[^.]+$/, '')).filter((name) => existingNames.has(normalizedName(name)));
  const overwrite = duplicateNames.length ? window.confirm(`发现 ${duplicateNames.length} 个同名图标：\n${duplicateNames.slice(0, 12).join('、')}${duplicateNames.length > 12 ? '…' : ''}\n\n确定：覆盖重复图标\n取消：跳过重复图标`) : false;
  const skipped = overwrite ? 0 : duplicateNames.length;
  if (!overwrite) files = files.filter((file) => !existingNames.has(normalizedName(file.name.replace(/\.[^.]+$/, ''))));
  if (!files.length) {
    if ($('menuIconLibraryStatus')) $('menuIconLibraryStatus').textContent = `没有需要上传的图标，已跳过 ${skipped} 个重复项。`;
    return;
  }
  uploadButton.disabled = true;
  const total = files.length;
  let completed = 0;
  const queue = [...files];
  const uploaded = [];
  const failures = [];
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift();
      try { uploaded.push(await uploadMenuIconFile(file)); }
      catch (error) { failures.push(`${file.name}：${error.message || '上传失败'}`); }
      finally { completed++; if ($('menuIconLibraryStatus')) $('menuIconLibraryStatus').textContent = `正在处理 ${completed}/${total}，成功 ${uploaded.length}，失败 ${failures.length}…`; }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
    uploaded.forEach((item) => {
      const index = state.system.menuIcons.findIndex((current) => normalizedName(current.name) === normalizedName(item.name));
      if (index >= 0 && overwrite) state.system.menuIcons[index] = item;
      else if (index < 0) state.system.menuIcons.push(item);
    });
    input.value = '';
    if ($('globalMenuIconFiles')) $('globalMenuIconFiles').value = '';
    if (uploaded.length) {
      await saveMenuIcons();
      await loadMenuIcons();
      renderMenuIcons();
    }
    const summary = `处理完成：成功 ${uploaded.length}，跳过 ${skipped}，失败 ${failures.length}。`;
    if ($('menuIconLibraryStatus')) $('menuIconLibraryStatus').textContent = failures.length ? `${summary} ${failures.slice(0, 3).join('；')}` : summary;
    setStatus(summary, failures.length > 0);
  } finally {
    uploadButton.disabled = false;
  }
}

async function saveMenuIcons() {
  const icons = Array.isArray(state.system?.menuIcons) ? state.system.menuIcons : [];
  document.querySelectorAll('[data-menu-icon-index]').forEach(row => { const item = icons[Number(row.dataset.menuIconIndex)]; if (!item) return; item.name = row.querySelector('[data-menu-icon-name]')?.value.trim() || item.name; item.folderId = row.querySelector('[data-menu-icon-folder]')?.value || item.folderId || 'default'; item.sort = Number(row.querySelector('[data-menu-icon-sort]')?.value || 0); });
  document.querySelectorAll('.menu-icon-folder[data-menu-folder]').forEach(row => { const item=(state.system.menuIconFolders||[]).find(folder=>folder.id===row.dataset.menuFolder); if(item)item.sort=Number(row.querySelector('[data-folder-sort]')?.value||0); });
  state.system = await api('/api/super/system', { method: 'PATCH', body: JSON.stringify({ menuIcons: icons, menuIconFolders: state.system.menuIconFolders }) });
  renderMenuIcons();
  state.menuIconLibraryError = '';
  setStatus('项目图标库已保存。');
}

function renderBuiltinFunctions() {
  const root = $('builtinFunctionRows');
  if (!root || !isSuper()) return;
  const rows = state.system?.builtinFunctions || [];
  root.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>名称</th><th>动作</th><th>状态</th><th>类型</th><th>操作</th></tr></thead><tbody>${rows.map((item, index) => `
    <tr data-builtin-index="${index}">
      <td><strong>${escapeHtml(item.name || '')}</strong></td>
      <td>${escapeHtml(ACTION_LABELS[item.action || (item.builtIn ? 'script' : 'download')] || '内置功能')}</td>
      <td>${item.enabled !== false ? '启用' : '停用'}</td>
      <td>${item.builtIn ? '系统内置' : '自定义'}</td>
      <td class="actions"><button data-builtin-edit type="button">编辑</button>${item.builtIn ? '' : '<button class="danger" data-builtin-delete type="button">删除</button>'}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="empty">暂无全局内置功能。</p>';
  root.querySelectorAll('[data-builtin-edit]').forEach((button) => button.onclick = () => renderBuiltinEditRow(Number(button.closest('tr').dataset.builtinIndex)));
  root.querySelectorAll('[data-builtin-delete]').forEach((button) => button.onclick = () => {
    rows.splice(Number(button.closest('tr').dataset.builtinIndex), 1);
    renderBuiltinFunctions();
  });
}

function renderBuiltinEditRow(index) {
  const item = state.system?.builtinFunctions?.[index];
  const row = document.querySelector(`#builtinFunctionRows tr[data-builtin-index="${index}"]`);
  if (!item || !row) return;
  const action = item.action || (item.builtIn ? 'script' : 'download');
  row.className = 'button-edit-row';
  row.innerHTML = `<td colspan="5"><div class="button-edit-panel">
    <div class="button-edit-title"><strong>编辑功能：${escapeHtml(item.name || '')}</strong><span>${item.builtIn ? '系统内置功能' : '总管理员自定义功能'}</span></div>
    <div class="button-edit-grid">
      <label>功能名称<input data-builtin-name value="${escapeAttr(item.name || '')}"></label>
      <label>动作<select data-builtin-action>${ACTIONS.map(([value, label]) => `<option value="${value}" ${value === action ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="toggle-line">状态<span><input data-builtin-enabled type="checkbox" ${item.enabled !== false ? 'checked' : ''}> 启用</span></label>
    </div>
    <label class="button-edit-target"><span data-builtin-target-label>${action === 'download' ? '私密下载链接' : '目标内容'}</span><input data-builtin-target value="${escapeAttr(item.target || item.downloadUrl || '')}" placeholder="${action === 'script' ? '系统内置功能可留空' : '填写网址、命令或软件包 ID'}"></label>
    <div class="button-edit-actions"><button data-builtin-apply type="button">确定</button><button data-builtin-cancel type="button">取消</button></div>
  </div></td>`;
  const actionSelect = row.querySelector('[data-builtin-action]');
  actionSelect.onchange = () => {
    row.querySelector('[data-builtin-target-label]').textContent = actionSelect.value === 'download' ? '私密下载链接（仅总管理员可见）' : '目标内容';
  };
  row.querySelector('[data-builtin-apply]').onclick = () => {
    item.name = row.querySelector('[data-builtin-name]').value.trim();
    item.action = actionSelect.value;
    item.target = row.querySelector('[data-builtin-target]').value.trim();
    item.downloadUrl = item.action === 'download' ? item.target : '';
    item.enabled = row.querySelector('[data-builtin-enabled]').checked;
    renderBuiltinFunctions();
  };
  row.querySelector('[data-builtin-cancel]').onclick = renderBuiltinFunctions;
}

function addBuiltinFunctionRow() {
  if (!state.system) return;
  const rows = state.system.builtinFunctions || (state.system.builtinFunctions = []);
  rows.push({ id: `builtin_${Date.now().toString(36)}`, name: '新内置功能', action: 'download', target: '', downloadUrl: '', enabled: true, builtIn: false });
  renderBuiltinFunctions();
  renderBuiltinEditRow(rows.length - 1);
}

async function saveBuiltinFunctions() {
  const functions = (state.system?.builtinFunctions || []).map((item) => ({
    id: item.id, name: item.name, action: item.action,
    target: item.target || item.downloadUrl || '', enabled: item.enabled !== false
  }));
  state.system = await api('/api/super/system', {
    method: 'PATCH',
    body: JSON.stringify({ builtinFunctions: functions })
  });
  await loadBuiltinFunctions();
  renderAll();
  setStatus('全局内置功能已保存。');
}

async function loadBuiltinFunctions() {
  const result = await api('/api/admin/builtin-functions');
  state.builtinFunctions = result.functions || [];
}

async function loadClientVariants() {
  const result = await api('/api/admin/client/variants');
  const clientVariants = {};
  (result.variants || []).forEach((variant) => {
    if (variant?.id) clientVariants[variant.id] = variant;
  });
  if (!state.system) state.system = {};
  state.system.clientVariants = clientVariants;
  state.system.esportsAudioModule = result.esportsAudioModule || {};
}

function variantSettings(variant) {
  return state.system?.clientVariants?.[variant.id] || {};
}

function renderEsportsAudioModuleSettings() {
  const module = state.system?.esportsAudioModule || {};
  if ($('esportsAudioEnabled')) $('esportsAudioEnabled').checked = module.enabled === true;
  if ($('esportsAudioDisplayName')) $('esportsAudioDisplayName').value = module.displayName || '调音师工具箱电竞音频版';
  if ($('esportsAudioVersion')) $('esportsAudioVersion').value = module.version || '';
  if ($('esportsAudioDownloadUrl')) $('esportsAudioDownloadUrl').value = module.downloadUrl || '';
  if ($('esportsAudioBackupUrl')) $('esportsAudioBackupUrl').value = module.backupUrl || '';
  if ($('esportsAudioFileName')) $('esportsAudioFileName').value = module.fileName || '';
  if ($('esportsAudioSha256')) $('esportsAudioSha256').value = module.sha256 || '';
  if ($('esportsAudioMinimumSystem')) $('esportsAudioMinimumSystem').value = module.minimumSystem || 'Windows 10 22H2 x64';
  if ($('esportsAudioRequiresAdmin')) $('esportsAudioRequiresAdmin').checked = module.requiresAdmin === true;
  if ($('esportsAudioAdminPrompt')) $('esportsAudioAdminPrompt').value = module.adminPrompt || '';
  if ($('esportsAudioUpdateNotes')) $('esportsAudioUpdateNotes').value = module.updateNotes || '';
}

async function saveEsportsAudioModule() {
  const value = (id) => $(id)?.value.trim() || '';
  const module = {
    enabled: $('esportsAudioEnabled')?.checked === true,
    displayName: value('esportsAudioDisplayName'),
    version: value('esportsAudioVersion'),
    platform: 'windows-x64',
    downloadUrl: value('esportsAudioDownloadUrl'),
    backupUrl: value('esportsAudioBackupUrl'),
    fileName: value('esportsAudioFileName'),
    sha256: value('esportsAudioSha256'),
    minimumSystem: value('esportsAudioMinimumSystem'),
    requiresAdmin: $('esportsAudioRequiresAdmin')?.checked === true,
    adminPrompt: value('esportsAudioAdminPrompt'),
    updateNotes: value('esportsAudioUpdateNotes')
  };
  state.system = await api('/api/super/system', { method: 'PATCH', body: JSON.stringify({ esportsAudioModule: module }) });
  await loadClientVariants();
  renderSystemSettings();
  renderClientVariants();
  setStatus('调音师工具箱电竞音频版模块配置已保存。');
}

function renderClientVariantSettings() {
  const wrap = $('clientVariantSettings');
  if (!wrap || !isSuper()) return;
  wrap.innerHTML = CLIENT_VARIANTS.map((variant) => {
    const config = variantSettings(variant);
    const mode = config.coverMode || 'default';
    const coverControls = variant.id === 'xinggui'
      ? `<label class="wide variant-cover-url">封面图床链接<input data-variant-field="coverUrl" value="${escapeAttr(config.coverUrl || '')}" placeholder="https://example.com/xinggui-cover.webp"></label><div class="image-url-actions wide"><button type="button" data-variant-cover-preview>预览</button><button type="button" class="secondary-btn" data-variant-cover-clear>清除</button></div>`
      : `<label>封面来源<select data-variant-field="coverMode"><option value="default" ${mode === 'default' ? 'selected' : ''}>默认封面</option><option value="upload" ${mode === 'upload' ? 'selected' : ''}>上传服务器</option><option value="url" ${mode === 'url' ? 'selected' : ''}>图床地址</option></select></label>
        <label class="wide variant-cover-url">图床 / 封面地址<input data-variant-field="coverUrl" value="${escapeAttr(config.coverUrl || '')}" placeholder="https://example.com/cover.png"></label>
        <div class="variant-upload-row"><input data-variant-upload type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon,.ico"><button data-variant-upload-btn type="button">上传图片</button></div>`;
    return `<article class="variant-setting" data-variant-setting="${escapeAttr(variant.id)}">
      <div class="variant-setting-preview" data-variant-cover-preview-host>${config.coverUrl && (variant.id === 'xinggui' || mode !== 'default') ? `<img src="${escapeAttr(config.coverUrl)}" alt="${escapeAttr(config.name || variant.label)}">` : clientPreviewMarkup(variant.preview)}</div>
      <div class="variant-setting-fields">
        <label>名称<input data-variant-field="name" value="${escapeAttr(config.name || variant.label)}"></label>
        <label>角标<input data-variant-field="badge" value="${escapeAttr(config.badge || variant.badge)}"></label>
        <label class="wide">介绍<textarea data-variant-field="description" rows="3">${escapeHtml(config.description || variant.description)}</textarea></label>
        ${coverControls}
      </div>
    </article>`;
  }).join('');
  wrap.querySelectorAll('[data-variant-upload-btn]').forEach((button) => {
    button.onclick = () => uploadVariantCover(button.closest('[data-variant-setting]')).catch((error) => setStatus(error.message, true));
  });
  wrap.querySelectorAll('[data-variant-cover-preview]').forEach((button) => {
    button.onclick = () => previewVariantCover(button.closest('[data-variant-setting]'));
  });
  wrap.querySelectorAll('[data-variant-cover-clear]').forEach((button) => {
    button.onclick = () => clearVariantCover(button.closest('[data-variant-setting]'));
  });
}

function previewVariantCover(card) {
  const input = card?.querySelector('[data-variant-field="coverUrl"]');
  const host = card?.querySelector('[data-variant-cover-preview-host]');
  if (!input || !host) return;
  if (!allowedImageUrl(input.value)) {
    setStatus('图片地址必须是有效的 HTTPS 链接。', true);
    return;
  }
  const image = document.createElement('img');
  image.alt = '星轨工具箱封面预览';
  image.onload = () => setStatus('星轨工具箱封面预览已加载。');
  image.onerror = () => { host.innerHTML = clientPreviewMarkup('xinggui'); setStatus('封面图片加载失败。', true); };
  image.src = input.value.trim();
  host.replaceChildren(image);
}

function clearVariantCover(card) {
  const input = card?.querySelector('[data-variant-field="coverUrl"]');
  const host = card?.querySelector('[data-variant-cover-preview-host]');
  if (input) input.value = '';
  if (host) host.innerHTML = clientPreviewMarkup('xinggui');
}

async function uploadVariantCover(card) {
  const file = card?.querySelector('[data-variant-upload]')?.files?.[0];
  if (!file) throw new Error('请先选择封面图片。');
  if (file.size > 5 * 1024 * 1024) throw new Error('封面图片不能超过 5MB。');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const result = await api('/api/super/system/variant-cover', { method: 'POST', body: JSON.stringify({ variantId: card.dataset.variantSetting, dataUrl }) });
  card.querySelector('[data-variant-field="coverMode"]').value = 'upload';
  card.querySelector('[data-variant-field="coverUrl"]').value = result.url;
  if (!state.system) state.system = {};
  if (!state.system.clientVariants) state.system.clientVariants = {};
  state.system.clientVariants[card.dataset.variantSetting] = {
    ...(state.system.clientVariants[card.dataset.variantSetting] || {}),
    coverMode: 'upload',
    coverUrl: result.url
  };
  const preview = card.querySelector('.variant-setting-preview');
  if (preview) preview.innerHTML = `<img src="${escapeAttr(result.url)}" alt="封面预览">`;
  setStatus('封面已上传，请点击保存。');
}

async function saveClientVariants() {
  const clientVariants = {};
  document.querySelectorAll('[data-variant-setting]').forEach((card) => {
    const value = (field) => card.querySelector(`[data-variant-field="${field}"]`)?.value.trim() || '';
    const variantId = card.dataset.variantSetting;
    const coverMode = variantId === 'xinggui' ? 'url' : value('coverMode');
    const coverUrl = value('coverUrl');
    if (variantId === 'xinggui' && coverUrl && coverUrl !== XINGGUI_DEFAULT_COVER_URL && !allowedImageUrl(coverUrl)) throw new Error('星轨工具箱封面地址必须是 HTTPS 链接。');
    clientVariants[variantId] = { name: value('name'), badge: value('badge'), description: value('description'), coverMode, coverUrl };
  });
  state.system = await api('/api/super/system', { method: 'PATCH', body: JSON.stringify({ clientVariants }) });
  await loadClientVariants();
  renderSystemSettings(); renderClientVariants(); setStatus('工具箱封面与介绍已保存。');
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
  if (type === 'xinggui') {
    return `<div class="client-preview xinggui-preview"><div class="preview-window-bar"><span>星轨工具箱</span><i></i><i></i><i></i></div><div class="xinggui-preview-body"><aside><b>星</b><em class="active">首页</em><em>软件资源</em><em>系统工具</em><em>下载管理</em><em>设置</em></aside><main><section class="xinggui-preview-hero"><strong>星轨工具箱</strong><span>工具与资源，一处管理</span></section><h4>常用工具</h4><div class="xinggui-preview-grid"><i>设备管理</i><i>系统清理</i><i>软件资源</i><i>常用链接</i></div></main></div></div>`;
  }
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
  if (type === 'audio') {
    return `
      <div class="client-preview tuner-preview">
        <div class="preview-window-bar tuner-window-bar"><span>音频工具箱火山版</span><i></i><i></i><i></i></div>
        <div class="tuner-preview-body">
          <aside style="max-width:52px;background:#232b31">
            <div class="tuner-brand"><b>Y</b></div>
            <em class="active">⚙</em><em>◉</em><em>▦</em><em>✣</em>
          </aside>
          <main>
            <section class="tuner-section">
              <h4 style="color:#f00">宿主插件类:</h4>
              <div class="tuner-buttons"><span>插件列表</span><span>Waves 清理</span><span>插件残留清理</span><span>扫描重置</span><span>效果备份</span></div>
            </section>
            <section class="tuner-section">
              <h4 style="color:#f00">系统优化类:</h4>
              <div class="tuner-buttons"><span>系统工具箱</span><span>系统激活</span><span>系统更新设置</span><span>系统防护开关</span><span>电源高性能</span></div>
            </section>
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
  if (type === 'vst76') {
    return `<div class="client-preview vst76-preview"><div class="preview-window-bar"><span>调音师工具箱旗舰版</span><b>锁屏</b><b>☀</b><b>微信</b><i></i><i></i></div><div class="vst76-preview-body"><aside><strong>T</strong><em class="active">软件首页</em><em>系统工具</em><em>系统软件</em><em>声卡驱动</em><em>宿主插件</em><em>常用网址</em></aside><main><div class="vst76-metrics">${['CPU', 'GPU', '内存', 'C 盘'].map((name, index) => `<span><b>${name}</b><strong>${[24, 38, 51, 67][index]}%</strong><i style="width:${[24, 38, 51, 67][index]}%"></i></span>`).join('')}</div><div class="vst76-lower"><section><b>电脑信息</b><small>Windows 11 专业版</small><small>处理器与音频设备状态</small></section><section><b>快捷资源</b><button>打开</button><button>下载</button></section></div></main></div></div>`;
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
  const cards = CLIENT_VARIANTS.map((variant) => {
    const config = variantSettings(variant);
    const validCover = variant.id === 'xinggui' ? (config.coverUrl && (config.coverUrl.startsWith('/') || allowedImageUrl(config.coverUrl))) : true;
    const cover = config.coverMode !== 'default' && config.coverUrl && validCover ? `<div class="client-preview custom-client-cover"><img src="${escapeAttr(config.coverUrl)}" alt="${escapeAttr(config.name || variant.label)}"></div>` : clientPreviewMarkup(variant.preview);
    return `
    <article class="client-variant-card" data-client-variant="${escapeAttr(variant.id)}">
      ${cover}
      <div class="client-variant-info">
        <div>
          <strong>${escapeHtml(config.name || variant.label)}</strong>
          <span>${escapeHtml(config.badge || variant.badge)}</span>
        </div>
        <p>${escapeHtml(config.description || variant.description)}</p>
        <div class="client-variant-download-count">已下载 ${Number(config.downloadCount || 0)} 次</div>
        <button type="button" data-action="download-client-variant" data-variant="${escapeAttr(variant.id)}" ${editing ? 'disabled' : ''}>
          ${editing ? '模板不能下载' : '下载这个版本'}
        </button>
      </div>
    </article>
  `; }).join('');
  const module = state.system?.esportsAudioModule || {};
  const moduleCard = module.enabled === true ? `
    <article class="client-variant-card esports-audio-module-card" data-client-module="esports-audio">
      <div class="client-preview esports-audio-module-preview"><strong>电竞音频</strong><span>React + Tauri 独立桌面模块</span></div>
      <div class="client-variant-info">
        <div><strong>${escapeHtml(module.displayName || '调音师工具箱电竞音频版')}</strong><span>Windows x64 · ${escapeHtml(module.version || '未标版本')}</span></div>
        <p>保留完整独立桌面界面及原生功能。最低系统：${escapeHtml(module.minimumSystem || 'Windows 10 22H2 x64')}。${escapeHtml(module.adminPrompt || '')}</p>
        ${module.updateNotes ? `<p>${escapeHtml(module.updateNotes)}</p>` : ''}
        <div class="button-pair">
          <button type="button" data-action="download-esports-audio" data-url="${escapeAttr(module.downloadUrl || '')}" data-file-name="${escapeAttr(module.fileName || '')}">下载安装器 EXE</button>
          ${module.backupUrl ? `<button type="button" data-action="download-esports-audio" data-url="${escapeAttr(module.backupUrl)}" data-file-name="${escapeAttr(module.fileName || '')}">备用下载</button>` : ''}
        </div>
      </div>
    </article>` : '';
  grid.innerHTML = cards + moduleCard;
  grid.querySelectorAll('[data-action="download-client-variant"]').forEach((button) => {
    button.onclick = () => downloadClient('', button.dataset.variant || 'original').catch((error) => setStatus(error.message, true));
  });
  grid.querySelectorAll('[data-action="download-esports-audio"]').forEach((button) => {
    button.onclick = () => openEsportsAudioPackage(button.dataset.url || '', button.dataset.fileName || '').catch((error) => setStatus(error.message, true));
  });
}

async function openEsportsAudioPackage(url, fileName) {
  let parsed;
  try { parsed = new URL(url, window.location.href); } catch { throw new Error('电竞音频版下载地址无效。'); }
  if (parsed.protocol !== 'https:') throw new Error('电竞音频版模块包只允许使用 HTTPS 下载地址。');
  const link = document.createElement('a');
  link.href = parsed.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setStatus('已打开调音师工具箱电竞音频版安装器 EXE 下载。');
}

function renderOrders() {
  const tbody = $('orderRows');
  if (!tbody) return;
  const orders = (state.orders || []).filter((order) => ['cloud_resolver_plan_purchase', 'cloud_resolver_code_generate'].includes(order.action));
  const visibleIds = new Set(orders.map((order) => String(order.id || '')).filter(Boolean));
  state.cloudOrderSelectedIds = new Set([...state.cloudOrderSelectedIds].filter((id) => visibleIds.has(id)));
  const updateSelectionControls = () => {
    const selectedCount = state.cloudOrderSelectedIds.size;
    const deleteSelected = $('deleteSelectedCloudOrdersBtn');
    if (deleteSelected) deleteSelected.disabled = selectedCount === 0;
    const selectAll = $('selectAllCloudOrders');
    if (selectAll) {
      selectAll.checked = orders.length > 0 && selectedCount === orders.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < orders.length;
    }
  };
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">暂无网盘解析订单</td></tr>';
    updateSelectionControls();
    return;
  }
  const paymentLabels = { balance: '余额支付', manual: '人工审核', interface: '接口支付' };
  const orderStatusLabels = { pending: '待支付', paid: '已支付', done: '已完成', cancelled: '已取消', expired: '已失效' };
  tbody.innerHTML = orders.map((order) => `
    <tr data-order-id="${escapeAttr(order.id || '')}" data-order-agent-id="${escapeAttr(order.userId || order.agentId || '')}">
      <td><input type="checkbox" data-cloud-order-select="${escapeAttr(order.id || '')}" aria-label="选择订单 ${escapeAttr(order.id || '')}"${state.cloudOrderSelectedIds.has(String(order.id || '')) ? ' checked' : ''}></td>
      <td>${escapeHtml(order.id || '')}<br><small>${escapeHtml(formatDateTime(order.createdAt))}</small></td>
      <td>${escapeHtml(order.displayName || order.agentDisplayName || userNameFromId(order.userId || order.agentId, order.username || order.agentUsername || ''))}</td>
      <td>${Number(order.amount || 0).toFixed(2)} ${escapeHtml(order.currency || 'CNY')}</td>
      <td>${escapeHtml(orderStatusLabels[order.status] || order.status || '待处理')}</td>
      <td>${order.status === 'pending' && order.remainingSeconds ? cloudRemaining(order.remainingSeconds) : (order.status === 'pending' || order.status === 'expired' ? '已失效' : '-')}</td>
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
  tbody.querySelectorAll('[data-cloud-order-select]').forEach((checkbox) => {
    checkbox.onchange = () => {
      const id = checkbox.dataset.cloudOrderSelect || '';
      if (checkbox.checked) state.cloudOrderSelectedIds.add(id);
      else state.cloudOrderSelectedIds.delete(id);
      updateSelectionControls();
    };
  });
  updateSelectionControls();
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
      ['notifyUrl', '支付宝异步通知地址（应为 /api/payment/callback）'],
      ['returnUrl', '支付宝支付返回地址（应为 /api/payment/return）'],
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
      ['mapiUrl', '自定义扫码支付URL'],
      ['pcScan', 'PC端扫码支付', 'checkbox'],
      ['notifyUrl', '支付通知回调地址'],
      ['returnUrl', '支付完成返回地址']
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
      ['mapiUrl', '自定义扫码支付URL'],
      ['pcScan', 'PC端扫码支付', 'checkbox'],
      ['notifyUrl', '支付通知回调地址'],
      ['returnUrl', '支付完成返回地址']
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

function ensurePageLockGroups() {
  if (!state.config.page_lock_groups || typeof state.config.page_lock_groups !== 'object' || Array.isArray(state.config.page_lock_groups)) {
    state.config.page_lock_groups = {};
  }
  if (!state.config.page_lock_groups.default || typeof state.config.page_lock_groups.default !== 'object' || Array.isArray(state.config.page_lock_groups.default)) {
    state.config.page_lock_groups.default = { title: '合并页面密码', enabled: false, password: '', pages: [] };
  }
  const group = state.config.page_lock_groups.default;
  if (!Array.isArray(group.pages)) group.pages = [];
  if (!group.title) group.title = '合并页面密码';
  return state.config.page_lock_groups;
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
      <label class="toggle-line">工具箱资源搜索<span><input id="resourceSearchEnabled" type="checkbox"> 开启</span></label>
    </div>
    <div class="page-lock-group-box">
      <div class="page-lock-group-head">
        <div class="page-lock-group-title"><strong>合并页面密码</strong><label class="checkline"><input id="mergedPageLockEnabled" type="checkbox"> 启用</label></div>
        <small>从现有页面中逐个选择；这些页面输入一次密码后全部解锁。</small>
      </div>
      <div class="password-field"><input id="mergedPageLockPassword" type="password" autocomplete="new-password" placeholder="输入合并密码"><button type="button" data-password-toggle="mergedPageLockPassword">显示</button></div>
      <div id="mergedPageLockSelectors" class="page-lock-group-selectors"></div>
      <button id="addMergedPageLockBtn" class="page-lock-group-add" type="button">＋ 添加页面</button>
      <label class="checkline page-lock-independent-toggle"><input id="showIndependentPageLocks" type="checkbox"> 设置独立页面密码</label>
    </div>
    <div id="independentPageLockArea" hidden>
      <div class="table-wrap page-lock-wrap">
        <table class="page-lock-table">
          <thead><tr><th>页面</th><th>类型</th><th>访问限制</th><th>页面密码</th><th>状态</th></tr></thead>
          <tbody id="pageLockRows"></tbody>
        </table>
      </div>
      <p class="page-lock-note">开启上锁后，用户进入对应页面必须输入该页面的密码；密码留空表示不修改已保存密码。</p>
    </div>
  `;
  const saveButton = panel.querySelector('#savePageAccessBtn');
  if (saveButton) saveButton.onclick = () => savePageAccess().catch((error) => setStatus(error.message, true));
  return panel;
}

function renderMergedPageLockSelectors(pages, locks, mergedGroup) {
  const host = $('mergedPageLockSelectors');
  const addButton = $('addMergedPageLockBtn');
  if (!host || !addButton) return;
  const validIds = new Set(pages.map((page) => page.id));
  mergedGroup.pages = [...new Set([
    ...mergedGroup.pages.map((id) => String(id || '')),
    ...Object.entries(locks).filter(([, lock]) => lock?.group === 'default').map(([id]) => id)
  ])].filter((id) => !id || validIds.has(id));
  if (!mergedGroup.pages.length) mergedGroup.pages.push('');

  const draw = () => {
    host.innerHTML = mergedGroup.pages.map((selectedId, index) => {
      const used = new Set(mergedGroup.pages.filter((id, itemIndex) => itemIndex !== index && id));
      const options = pages.filter((page) => !used.has(page.id)).map((page) =>
        `<option value="${escapeAttr(page.id)}" ${page.id === selectedId ? 'selected' : ''}>${escapeHtml(page.title)}</option>`
      ).join('');
      return `
        <div class="page-lock-group-row" data-merged-page-row="${index}">
          <select data-merged-page-select><option value="">请选择页面</option>${options}</select>
          <button data-remove-merged-page type="button" title="移除此页面">删除</button>
        </div>
      `;
    }).join('');
    host.querySelectorAll('[data-merged-page-row]').forEach((row) => {
      const index = Number(row.dataset.mergedPageRow);
      row.querySelector('[data-merged-page-select]')?.addEventListener('change', (event) => {
        mergedGroup.pages[index] = event.target.value;
        draw();
        refreshMergedPageLockRows(locks, mergedGroup);
      });
      row.querySelector('[data-remove-merged-page]')?.addEventListener('click', () => {
        mergedGroup.pages.splice(index, 1);
        draw();
        refreshMergedPageLockRows(locks, mergedGroup);
      });
    });
    const selected = new Set(mergedGroup.pages.filter(Boolean));
    addButton.disabled = selected.size >= pages.length;
  };

  addButton.onclick = () => {
    mergedGroup.pages.push('');
    draw();
  };
  draw();
}

function refreshMergedPageLockRows(locks, mergedGroup) {
  const mergedPages = new Set(mergedGroup.enabled === true ? mergedGroup.pages.filter(Boolean) : []);
  const hasMergedPassword = !!mergedGroup.password || !!$('mergedPageLockPassword')?.value.trim();
  document.querySelectorAll('[data-page-lock-id]').forEach((row) => {
    const pageId = row.dataset.pageLockId || '';
    const merged = mergedPages.has(pageId);
    const enabled = row.querySelector('[data-page-lock-enabled]');
    const password = row.querySelector('[data-page-lock-password]');
    const status = row.querySelector('[data-page-lock-status]');
    const hasIndependentPassword = !!locks[pageId]?.password;
    if (enabled) {
      if (merged && row.dataset.pageLockMerged !== '1') row.dataset.independentEnabled = enabled.checked ? '1' : '0';
      if (merged) enabled.checked = true;
      if (!merged && row.dataset.pageLockMerged === '1') enabled.checked = row.dataset.independentEnabled === '1';
      enabled.disabled = merged;
    }
    row.dataset.pageLockMerged = merged ? '1' : '0';
    if (password) password.disabled = merged;
    if (status) {
      status.className = (merged ? hasMergedPassword : hasIndependentPassword) ? 'muted-pill' : 'danger-pill';
      status.textContent = merged
        ? (hasMergedPassword ? '使用合并密码' : '合并密码未设置')
        : (hasIndependentPassword ? '已设置独立密码' : '未设置独立密码');
    }
  });
}

function renderPageAccessControls() {
  const panel = ensurePageAccessPanel();
  if (!panel || !state.config) return;
  const features = ensureFeatureSettings();
  const locks = ensurePageLocks();
  const groups = ensurePageLockGroups();
  const mergedGroup = groups.default;
  const lockablePages = getLockablePages();
  const hasExistingIndependentLocks = Object.entries(locks).some(([, lock]) => lock && lock.group !== 'default' && (lock.enabled === true || !!lock.password));
  const showIndependent = typeof mergedGroup.show_independent === 'boolean' ? mergedGroup.show_independent : hasExistingIndependentLocks;
  const showIndependentToggle = $('showIndependentPageLocks');
  const independentArea = $('independentPageLockArea');
  if (showIndependentToggle) {
    showIndependentToggle.checked = showIndependent;
    showIndependentToggle.onchange = () => {
      if (independentArea) independentArea.hidden = !showIndependentToggle.checked;
    };
  }
  if (independentArea) independentArea.hidden = !showIndependent;
  const mergedPassword = $('mergedPageLockPassword');
  const mergedEnabled = $('mergedPageLockEnabled');
  if (mergedEnabled) {
    mergedEnabled.checked = mergedGroup.enabled === true;
    mergedEnabled.onchange = () => { mergedGroup.enabled = mergedEnabled.checked; refreshMergedPageLockRows(locks, mergedGroup); };
  }
  if (mergedPassword) {
    mergedPassword.value = mergedGroup.password_plain || '';
    mergedPassword.placeholder = mergedGroup.password ? '已设置，留空不修改' : '输入合并密码';
  }
  const softwareEnabled = $('softwareCatalogEnabled');
  if (softwareEnabled) softwareEnabled.checked = features.software_catalog_enabled !== false;
  const resourceSearchEnabled = $('resourceSearchEnabled');
  if (resourceSearchEnabled) resourceSearchEnabled.checked = features.resource_search_enabled === true;
  const deleteDownloadsOnExit = $('deleteDownloadsOnExit');
  if (deleteDownloadsOnExit) deleteDownloadsOnExit.checked = features.delete_downloads_on_exit === true;
  const tbody = $('pageLockRows');
  if (!tbody) return;
  tbody.innerHTML = lockablePages.map((page) => {
    const lock = locks[page.id] && typeof locks[page.id] === 'object' ? locks[page.id] : {};
    const enabled = lock.enabled === true;
    const hasPassword = !!lock.password;
    return `
      <tr data-page-lock-id="${escapeAttr(page.id)}" data-page-lock-title="${escapeAttr(page.title)}" data-independent-enabled="${enabled ? '1' : '0'}">
        <td><strong>${escapeHtml(page.title)}</strong></td>
        <td>${escapeHtml(page.type)}</td>
        <td><label class="checkline"><input data-page-lock-enabled type="checkbox" ${enabled ? 'checked' : ''}> 必须输入密码</label></td>
        <td><div class="password-field"><input id="pageLockPassword_${escapeAttr(page.id)}" data-page-lock-password type="password" value="${escapeAttr(lock.password_plain || '')}" placeholder="输入独立密码"><button type="button" data-password-toggle="pageLockPassword_${escapeAttr(page.id)}">显示</button></div></td>
        <td><span data-page-lock-status class="${hasPassword ? 'muted-pill' : 'danger-pill'}">${hasPassword ? '已设置独立密码' : '未设置独立密码'}</span></td>
      </tr>
    `;
  }).join('');
  renderMergedPageLockSelectors(lockablePages, locks, mergedGroup);
  refreshMergedPageLockRows(locks, mergedGroup);
}

async function savePageAccess() {
  const features = ensureFeatureSettings();
  features.software_catalog_enabled = $('softwareCatalogEnabled')?.checked !== false;
  features.resource_search_enabled = $('resourceSearchEnabled')?.checked === true;

  const locks = ensurePageLocks();
  const groups = ensurePageLockGroups();
  const mergedGroup = groups.default;
  mergedGroup.enabled = $('mergedPageLockEnabled')?.checked === true;
  const mergedPassword = $('mergedPageLockPassword')?.value.trim() || '';
  mergedGroup.password = mergedPassword;
  mergedGroup.password_plain = mergedPassword;
  mergedGroup.title = '合并页面密码';
  const showIndependent = $('showIndependentPageLocks')?.checked === true;
  mergedGroup.show_independent = showIndependent;
  const validPageIds = new Set(getLockablePages().map((page) => page.id));
  const mergedPages = [...new Set(mergedGroup.pages.map((id) => String(id || '')).filter((id) => validPageIds.has(id)))];
  const mergedPageSet = new Set(mergedPages);
  let missingPasswordFor = '';
  document.querySelectorAll('[data-page-lock-id]').forEach((row) => {
    if (missingPasswordFor) return;
    const pageId = row.dataset.pageLockId || '';
    const title = row.dataset.pageLockTitle || pageId;
    const current = locks[pageId] && typeof locks[pageId] === 'object' ? locks[pageId] : {};
    const next = { ...current };
    const password = row.querySelector('[data-page-lock-password]')?.value.trim() || '';
    const merged = mergedGroup.enabled && mergedPageSet.has(pageId);
    next.enabled = merged || (showIndependent && row.querySelector('[data-page-lock-enabled]')?.checked === true);
    next.title = title;
    if (merged) {
      next.group = 'default';
    } else {
      delete next.group;
      if (showIndependent) { next.password = password; next.password_plain = password; }
    }
    locks[pageId] = next;
  });
  mergedGroup.pages = mergedPages;

  if (missingPasswordFor) {
    setStatus(`请先填写「${missingPasswordFor}」。`, true);
    return;
  }

  await saveWholeConfig('页面权限已保存；合并组内页面输入一次密码即可全部解锁。');
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

  scope.onchange = () => { renderManagedSections(); syncLinkedButtonSelectors('manageScope'); };
  renderManagedSections();
  bindButtonLinkageToggle();
}

let syncingButtonSelectors = false;

function buttonLinkageEnabled() {
  return $('buttonLinkageEnabled')?.checked === true;
}

function bindButtonLinkageToggle() {
  const toggle = $('buttonLinkageEnabled');
  if (!toggle) return;
  toggle.checked = state.config?.app?.button_linkage_enabled === true;
  if (toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.onchange = async () => {
    const previous = !toggle.checked;
    state.config.app = state.config.app || {};
    state.config.app.button_linkage_enabled = toggle.checked;
    try {
      await saveWholeConfig(toggle.checked ? '联动按钮选择已启用。' : '联动按钮选择已关闭。');
      if (toggle.checked) syncLinkedButtonSelectors('manageScope');
    } catch (error) {
      toggle.checked = previous;
      state.config.app.button_linkage_enabled = previous;
      setStatus(error.message || '联动按钮设置保存失败。', true);
    }
  };
}

function syncLinkedButtonSelectors(source) {
  if (!buttonLinkageEnabled() || syncingButtonSelectors) return;
  syncingButtonSelectors = true;
  try {
    if (source === 'buttonAreaFilter') {
      const match = getPositions().find((item) => item.name === $('buttonAreaFilter')?.value);
      if (match && $('manageScope') && $('addScope')) {
        $('manageScope').value = match.value;
        $('addScope').value = match.value;
        renderManagedSections();
        renderSectionSelector($('manageSection')?.value || '');
      }
    } else if (source === 'buttonSectionFilter') {
      const position = parsePositionValue($('manageScope')?.value || '');
      const wanted = $('buttonSectionFilter')?.value || '';
      const sectionIndex = position ? ensureSections(position.container).findIndex((item) => (item.title || '') === wanted) : -1;
      if (sectionIndex >= 0) {
        $('manageSection').value = String(sectionIndex);
        $('addSection').value = String(sectionIndex);
        renderManagedSectionName();
      }
    } else if (source === 'manageScope' && $('addScope') && $('manageScope')) {
      $('addScope').value = $('manageScope').value;
      renderSectionSelector($('manageSection')?.value || '');
    } else if (source === 'addScope' && $('addScope') && $('manageScope')) {
      $('manageScope').value = $('addScope').value;
      renderManagedSections();
      $('manageSection').value = $('addSection').value;
      renderManagedSectionName();
    }
    if (source === 'manageSection' && $('addSection') && $('manageSection')) {
      $('addSection').value = $('manageSection').value;
    } else if (source === 'addSection' && $('addSection') && $('manageSection')) {
      $('manageSection').value = $('addSection').value;
      renderManagedSectionName();
    }
    const position = parsePositionValue($('manageScope')?.value || $('addScope')?.value || '');
    const areaFilter = $('buttonAreaFilter');
    if (position?.name && areaFilter && [...areaFilter.options].some((option) => option.value === position.name)) {
      areaFilter.value = position.name;
      renderButtonFilterOptions();
      areaFilter.value = position.name;
    }
    if ($('buttonSectionFilter') && $('manageSection') && position) {
      const section = ensureSections(position.container)[$('manageSection').value];
      const sectionFilter = $('buttonSectionFilter');
      const sectionName = section?.title || '';
      if (sectionName && [...sectionFilter.options].some((option) => option.value === sectionName)) sectionFilter.value = sectionName;
    }
    renderButtons();
  } finally {
    syncingButtonSelectors = false;
  }
}

function renderScopeIconPicker(iconUrl, enabled) {
  const picker = $('scopeIconPicker');
  const trigger = $('openScopeIconPickerBtn');
  const preset = $('manageScopeIconPreset');
  const preview = $('scopeIconPickerPreview');
  const label = $('scopeIconPickerLabel');
  if (!picker || !trigger || !preset || !preview || !label) return;
  const selected = state.menuIcons.find((item) => item.url === iconUrl);
  preview.src = selected?.url || '';
  preview.hidden = !selected;
  label.textContent = selected?.name || '选择图标';
  trigger.disabled = !enabled;
  let folderId = '';
  let query = '';
  const renderPicker = () => {
    const folders = [...(state.system?.menuIconFolders || [{ id: 'default', name: '默认', sort: 0 }])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const allIcons = state.menuIcons.slice();
    const icons = allIcons.filter(item => (item.folderId || 'default') === (folderId || 'default'));
    const filtered = query ? allIcons.filter(item => String(item.name || '').toLocaleLowerCase().includes(query.toLocaleLowerCase())) : icons;
    const active = folders.find(item => item.id === folderId);
    picker.innerHTML = `<div class="icon-picker-head"><button type="button" data-scope-picker-back ${folderId ? '' : 'hidden'}>返回文件夹</button><strong>${escapeHtml(active?.name || '选择图标')}</strong><input data-scope-picker-search type="search" placeholder="搜索图片名称" value="${escapeAttr(query)}"></div><div class="icon-picker-grid">${query ? filtered.map(item => `<button class="icon-picker-item" data-icon-picker-value="${escapeAttr(item.url)}" type="button"><img src="${escapeAttr(item.url)}" alt=""><strong>${escapeHtml(item.name)}</strong></button>`).join('') : !folderId ? `<button class="icon-picker-item${selected ? '' : ' is-selected'}" data-icon-picker-value="" type="button"><span class="icon-picker-built-in">内置</span><strong>使用内置图标</strong></button>${folders.map(item => `<button class="icon-picker-item" data-scope-picker-folder="${escapeAttr(item.id)}" type="button"><span class="folder-glyph"></span><strong>${escapeHtml(item.name)}</strong></button>`).join('')}` : icons.map(item => `<button class="icon-picker-item${selected?.url === item.url ? ' is-selected' : ''}" data-icon-picker-value="${escapeAttr(item.url)}" type="button"><img src="${escapeAttr(item.url)}" alt=""><strong>${escapeHtml(item.name)}</strong></button>`).join('')}</div>`;
    const updateScopeSearch = (event) => {
      const caret = event.target.selectionStart ?? event.target.value.length;
      query = event.target.value.trim();
      renderPicker();
      const search = picker.querySelector('[data-scope-picker-search]');
      search.focus();
      search.setSelectionRange(caret, caret);
    };
    const scopeSearch = picker.querySelector('[data-scope-picker-search]');
    let composingScopeSearch = false;
    scopeSearch.oncompositionstart = () => { composingScopeSearch = true; };
    scopeSearch.oncompositionend = (event) => { composingScopeSearch = false; setTimeout(() => updateScopeSearch(event), 0); };
    scopeSearch.oninput = (event) => { if (!composingScopeSearch && !event.isComposing) updateScopeSearch(event); };
    scopeSearch.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        updateScopeSearch(event);
      }
    };
    scopeSearch.onkeyup = (event) => {
      if (!composingScopeSearch && !event.isComposing && scopeSearch.value.trim() !== query) updateScopeSearch(event);
    };
    scopeSearch.onchange = (event) => { if (!composingScopeSearch) updateScopeSearch(event); };
    picker.querySelector('[data-scope-picker-back]')?.addEventListener('click', () => { folderId = ''; renderPicker(); });
    picker.querySelectorAll('[data-scope-picker-folder]').forEach(row => row.onclick = () => { folderId = row.dataset.scopePickerFolder; renderPicker(); });
    picker.querySelectorAll('[data-icon-picker-value]').forEach(button => button.onclick = () => { const value = button.dataset.iconPickerValue || ''; const item = state.menuIcons.find(row => row.url === value); preset.value = value; if ($('manageScopeIconUrl')) $('manageScopeIconUrl').value = ''; preview.src = item?.url || ''; preview.hidden = !item; label.textContent = item?.name || '选择图标'; picker.hidden = true; });
  };
  trigger.onclick = () => { if (enabled) picker.hidden = !picker.hidden; };
  renderPicker();
  picker.hidden = true;
}

function renderManagedSections() {
  const pos = parsePositionValue($('manageScope')?.value || '');
  const sectionSelect = $('manageSection');
  if (!pos || !sectionSelect) return;

  $('manageScopeName').value = pos.name || '';
  if ($('manageScopeOrder')) $('manageScopeOrder').value = Number(pos.orderIndex || 0) + 1;
  const sidebarItem = pos.scope === 'page' ? (state.config.sidebar || []).find(item => item.id === pos.pageId) : null;
  const iconUrl = sidebarItem?.icon || '';
  const preset = $('manageScopeIconPreset');
  if (preset) {
    preset.value = state.menuIcons.some(item => item.url === iconUrl) ? iconUrl : '';
    preset.disabled = pos.scope !== 'page';
    renderScopeIconPicker(iconUrl, pos.scope === 'page');
  }
  if ($('manageScopeIconUrl')) {
    $('manageScopeIconUrl').value = state.menuIcons.some((item) => item.url === iconUrl) ? '' : iconUrl;
    $('manageScopeIconUrl').disabled = pos.scope !== 'page';
    $('manageScopeIconUrl').oninput = () => { if ($('manageScopeIconUrl').value.trim()) { preset.value = ''; renderScopeIconPicker('', pos.scope === 'page'); } };
  }
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

  sectionSelect.onchange = () => { renderManagedSectionName(); syncLinkedButtonSelectors('manageSection'); };
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
  const previousScope = scope.value;
  const previousSection = $('addSection')?.value || '';
  scope.innerHTML = '';

  const positions = getPositions();
  positions.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    scope.appendChild(opt);
  });

  if (positions.some((item) => item.value === previousScope)) {
    scope.value = previousScope;
  }
  scope.onchange = () => { renderSectionSelector(); syncLinkedButtonSelectors('addScope'); };
  renderSectionSelector(previousSection);
  bindButtonLinkageToggle();
  if (buttonLinkageEnabled()) syncLinkedButtonSelectors('manageScope');
}

function renderSectionSelector(preferredSection = '') {
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

  if ([...section.options].some((option) => option.value === preferredSection)) {
    section.value = preferredSection;
  }
  section.onchange = () => syncLinkedButtonSelectors('addSection');
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

function initButtonIconPicker(root, input, preview) {
  const trigger = root.querySelector('[data-icon-picker-open]');
  const picker = root.querySelector('[data-icon-picker-popup]');
  if (!trigger || !picker) return;
  let folderId = '';
  let query = '';
  const render = () => {
    const folders = [...(state.system?.menuIconFolders || [{ id: 'default', name: '默认', sort: 0 }])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const active = folders.find(item => item.id === folderId);
    const allIcons = (state.menuIcons || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const icons = allIcons.filter(item => (item.folderId || 'default') === (folderId || 'default'));
    const filtered = query ? allIcons.filter(item => String(item.name || '').toLocaleLowerCase().includes(query.toLocaleLowerCase())) : icons;
    picker.innerHTML = `<div class="icon-picker-head"><button type="button" data-icon-picker-back ${folderId ? '' : 'hidden'}>返回文件夹</button><strong>${escapeHtml(active?.name || '选择图标')}</strong><input data-icon-picker-search type="search" placeholder="搜索图片名称" value="${escapeAttr(query)}"></div><div class="icon-picker-grid">${query ? filtered.map(item => `<button class="icon-picker-item" data-icon-picker-value="${escapeAttr(item.url)}" type="button"><img src="${escapeAttr(item.url)}" alt=""><strong>${escapeHtml(item.name)}</strong></button>`).join('') : !folderId ? folders.map(item => `<button class="icon-picker-item" data-icon-picker-folder="${escapeAttr(item.id)}" type="button"><span class="folder-glyph"></span><strong>${escapeHtml(item.name)}</strong></button>`).join('') : icons.map(item => `<button class="icon-picker-item" data-icon-picker-value="${escapeAttr(item.url)}" type="button"><img src="${escapeAttr(item.url)}" alt=""><strong>${escapeHtml(item.name)}</strong></button>`).join('')}</div>`;
    const updateIconSearch = (event) => {
      const caret = event.target.selectionStart ?? event.target.value.length;
      query = event.target.value.trim();
      render();
      const search = picker.querySelector('[data-icon-picker-search]');
      search.focus();
      search.setSelectionRange(caret, caret);
    };
    const iconSearch = picker.querySelector('[data-icon-picker-search]');
    let composingIconSearch = false;
    iconSearch.oncompositionstart = () => { composingIconSearch = true; };
    iconSearch.oncompositionend = (event) => { composingIconSearch = false; setTimeout(() => updateIconSearch(event), 0); };
    iconSearch.oninput = (event) => { if (!composingIconSearch && !event.isComposing) updateIconSearch(event); };
    iconSearch.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        updateIconSearch(event);
      }
    };
    iconSearch.onkeyup = (event) => {
      if (!composingIconSearch && !event.isComposing && iconSearch.value.trim() !== query) updateIconSearch(event);
    };
    iconSearch.onchange = (event) => { if (!composingIconSearch) updateIconSearch(event); };
    picker.querySelector('[data-icon-picker-back]')?.addEventListener('click', () => { folderId = ''; render(); });
    picker.querySelectorAll('[data-icon-picker-folder]').forEach(row => row.onclick = () => { folderId = row.dataset.iconPickerFolder; render(); });
    picker.querySelectorAll('[data-icon-picker-value]').forEach(row => row.onclick = () => { input.value = row.dataset.iconPickerValue; input.dispatchEvent(new Event('input', { bubbles: true })); if (preview.tagName === 'IMG') { preview.src = input.value; preview.hidden = false; } picker.hidden = true; });
  };
  trigger.onclick = () => { picker.hidden = !picker.hidden; if (!picker.hidden) { folderId = ''; render(); } };
}

function renderButtonEditRow(tr, button) {
  const icon = button.icon || button.raw?.icon || '';
  const isScript = button.action === 'script';
  const enabled = button.enabled !== false;
  const moveScopeValue = positionValueForButton(button);
  tr.className = enabled ? 'button-edit-row' : 'button-edit-row button-disabled-row';
  tr.innerHTML = `<td colspan="8"><div class="button-edit-panel">
    <div class="button-edit-title"><strong>编辑按钮：${escapeHtml(button.name || '未命名')}</strong><span>${escapeHtml(button.area || '')} / ${escapeHtml(button.section || '')}</span></div>
    <div class="button-edit-grid">
      <label>页面<select data-field="moveScope">${positionOptionsHtml(moveScopeValue)}</select></label>
      <label>分组<select data-field="moveSection">${sectionOptionsHtml(moveScopeValue, button.sectionIndex)}</select></label>
      <label>排序<input class="sort-input" type="number" value="${escapeAttr(button.sort ?? button.raw?.sort ?? 0)}" data-field="sort" title="数字越小越靠前"></label>
      <label>按钮名称<input value="${escapeAttr(button.name || '')}" data-field="name"></label>
      <label>图标<div class="icon-field"><span class="icon-preview" title="${icon ? '图标预览，双击清空' : '暂无图标'}">${icon ? `<img src="${escapeAttr(icon)}" alt="">` : '<b>预览</b>'}</span><input value="${escapeAttr(icon)}" data-field="icon" placeholder="图床图片链接"><button type="button" data-icon-picker-open>选择图标</button><div class="icon-picker-popover" data-icon-picker-popup hidden></div></div></label>
      <label>说明<input value="${escapeAttr(button.raw?.description || button.raw?.intro || button.raw?.remark || '')}" data-field="description" placeholder="鼠标悬停说明"></label>
      <label>动作<select data-field="action">${ACTIONS.map(([action, label]) => `<option value="${action}" ${action === button.action ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
    <label class="button-edit-target">下载 / 目标<span class="target-control">${targetControlHtml(button.action, button.target, button.raw || button)}</span><small class="target-note"></small></label>${buttonGuardHtml(button.raw || button)}
    <div class="button-edit-actions"><button data-action="save">保存</button><button data-action="cancel">取消</button><button data-action="toggle-enabled" class="${enabled ? 'danger' : ''}">${enabled ? '停用' : '启用'}</button>${isScript ? '<span class="muted-action">内置功能不可删除</span>' : '<button class="danger" data-action="delete">删除</button>'}</div>
  </div></td>`;

  updateRowTargetState(tr, button);
  const guardToggle = tr.querySelector('[data-guard-password-toggle]');
  if (guardToggle) guardToggle.onclick = () => { const input = tr.querySelector('[data-guard-password-value]'); input.type = input.type === 'password' ? 'text' : 'password'; guardToggle.textContent = input.type === 'password' ? '显示' : '隐藏'; };
  tr.querySelector('[data-field="moveScope"]').onchange = () => syncRowSectionOptions(tr);
  tr.querySelector('[data-field="action"]').onchange = () => updateRowTargetState(tr, button);
  tr.querySelector('[data-field="icon"]').oninput = () => updateIconPreview(tr);
  initButtonIconPicker(tr, tr.querySelector('[data-field="icon"]'), tr.querySelector('.icon-preview img') || tr.querySelector('.icon-preview'));
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
  area.onchange = () => { renderButtons(); syncLinkedButtonSelectors('buttonAreaFilter'); };
  section.onchange = () => { renderButtons(); syncLinkedButtonSelectors('buttonSectionFilter'); };
  action.onchange = renderButtons;
}

function renderButtonFilterOptions() {
  const area = $('buttonAreaFilter');
  const section = $('buttonSectionFilter');
  const action = $('buttonActionFilter');
  if (!area || !section || !action) return;
  fillFilterOptions(area, '全部位置', orderedButtonAreas());
  fillFilterOptions(section, '全部分组', orderedButtonSections(area.value));
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

function orderedButtonAreas() {
  const present = new Set(state.buttons.map((button) => button.area || '').filter(Boolean));
  const result = [];
  getPositions().forEach((position) => { if (present.has(position.name) && !result.includes(position.name)) result.push(position.name); });
  state.buttons.slice().sort((a, b) => Number(a.areaOrder ?? 0) - Number(b.areaOrder ?? 0)).forEach((button) => { if (button.area && !result.includes(button.area)) result.push(button.area); });
  return result;
}

function orderedButtonSections(areaFilter = '') {
  const result = [];
  state.buttons.slice().filter((button) => !areaFilter || button.area === areaFilter).sort((a, b) => Number(a.areaOrder ?? 0) - Number(b.areaOrder ?? 0) || Number(a.sectionOrder ?? a.sectionIndex ?? 0) - Number(b.sectionOrder ?? b.sectionIndex ?? 0)).forEach((button) => { if (button.section && !result.includes(button.section)) result.push(button.section); });
  return result;
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
    const catalogItem = state.builtinFunctions.find((item) => item.id === scriptId || `builtin:${item.id}` === scriptId);
    if (catalogItem) return catalogItem.name;
    if (scriptId.startsWith('builtin:')) {
      return state.builtinFunctions.find((item) => `builtin:${item.id}` === scriptId)?.name || '全局内置功能';
    }
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
    `<option value="${escapeAttr(value)}" ${value === effectiveValue ? 'selected' : ''}>${escapeHtml(state.builtinFunctions.find((item) => item.id === value)?.name || label)}</option>`
  ).join('');
  const customSelected = effectiveValue && !SCRIPT_LABELS[effectiveValue] && !effectiveValue.startsWith('builtin:') ? 'selected' : '';
  const globalOptions = state.builtinFunctions.filter((item) => !item.builtIn).map((item) => {
    const value = `builtin:${item.id}`;
    return `<option value="${escapeAttr(value)}" ${value === effectiveValue ? 'selected' : ''}>${escapeHtml(item.name)}</option>`;
  }).join('');
  const globals = globalOptions ? `<option value="" disabled>── 总管理员提供 ──</option>${globalOptions}` : '';
  return `<option value="${CUSTOM_SCRIPT_VALUE}" ${customSelected}>自定义内置功能</option>${globals}<option value="" disabled>── 系统功能 ──</option>${options}`;
}

function downloadFileRowHtml(file = {}, index = 0, radioName = '') {
  const group = radioName || `download-primary-${Date.now()}-${Math.random()}`;
  return `<div class="download-file-row">
    <input data-download-url value="${escapeAttr(file.url || '')}" placeholder="文件下载地址">
    <input data-download-backup-url value="${escapeAttr(file.backup_url || file.backup_download_url || '')}" placeholder="备用下载地址（可选）">
    <input data-download-backup-page value="${escapeAttr(file.backup_page_url || file.backup_webpage || '')}" placeholder="备用网页地址（可选）">
    <label class="download-primary" title="全部文件下载完成后自动运行此文件"><input type="radio" data-download-primary name="${escapeAttr(group)}" ${file.primary || index === 0 ? 'checked' : ''}> 完成后运行</label>
    <button type="button" class="danger" data-remove-download title="删除此文件">×</button>
  </div>`;
}

function downloadControlHtml(target = '', data = {}) {
  const files = Array.isArray(data.files) && data.files.length ? data.files : [{ name: '', url: target || '', primary: true }];
  const primaryIndex = files.findIndex((file) => file && file.primary === true);
  const normalizedFiles = files.map((file, index) => ({ ...file, primary: primaryIndex >= 0 ? index === primaryIndex : index === 0 }));
  const radioName = `download-primary-${Date.now()}-${Math.random()}`;
  const multiple = data.download_mode === 'multiple' || files.length > 1;
  const downloadDirectory = data.download_directory || data.download_path || '';
  const deleteOnExit = data.download_delete_on_exit === true || data.delete_download_on_exit === true;
  const configuredBackups = Array.isArray(data.backup_urls) ? data.backup_urls : (Array.isArray(data.backupUrls) ? data.backupUrls : (data.backup_url ? [data.backup_url] : []));
  const backupUrls = configuredBackups.slice();
  while (backupUrls.length < 2) backupUrls.push('');
  return `<div class="download-target-control">
    <select data-download-mode><option value="single" ${multiple ? '' : 'selected'}>单文件</option><option value="multiple" ${multiple ? 'selected' : ''}>多文件安装包</option></select>
    <div data-download-single ${multiple ? 'hidden' : ''}>
      <input data-field="target" value="${escapeAttr(target || files[0]?.url || '')}" placeholder="主下载地址">
      <div class="download-backup-list" data-download-backups>${backupUrls.map((url) => `<div class="download-backup-row"><input data-field="backup-url-item" value="${escapeAttr(url)}" placeholder="备用下载地址"><button type="button" data-remove-backup>删除</button></div>`).join('')}</div>
      <button type="button" data-add-backup>＋ 添加备用链接</button>
      <input data-field="backup-page-url" value="${escapeAttr(data.backup_page_url || data.backup_webpage || '')}" placeholder="备用网页地址（下载失败时打开）">
    </div>
    <div class="download-multiple" data-download-multiple ${multiple ? '' : 'hidden'}>
      <input data-package-name value="${escapeAttr(data.package_name || data.name || '')}" placeholder="安装包文件夹名称">
      <div data-download-files>${normalizedFiles.map((file, index) => downloadFileRowHtml(file, index, radioName)).join('')}</div>
      <button type="button" data-add-download>＋ 添加文件</button>
      <small>所有文件下载到同一目录；全部成功后运行标记为主程序的文件。</small>
    </div>
    <div class="download-custom-options">
      <label>自定义下载位置<input data-download-directory value="${escapeAttr(downloadDirectory)}" placeholder="留空使用工具箱默认下载目录"></label>
      <label class="checkline"><input type="checkbox" data-download-delete-on-exit ${deleteOnExit ? 'checked' : ''}> 关闭工具箱时删除此按钮下载的文件</label>
    </div>
  </div>`;
}

function buttonGuardHtml(data = {}) {
  const guard = data.guard || {};
  return `<div class="button-guard-control"><label class="checkline"><input type="checkbox" data-guard-password ${guard.requirePassword ? 'checked' : ''}> 点击前输入单独密码</label><div class="password-field"><input type="password" data-guard-password-value value="${escapeAttr(guard.password_plain || '')}" placeholder="${guard.passwordHash ? '留空保持原密码' : '输入按钮密码'}"><button type="button" data-guard-password-toggle>显示</button></div><label class="checkline"><input type="checkbox" data-guard-confirm ${guard.requireConfirm ? 'checked' : ''}> 点击前显示确认信息框</label><input data-guard-message value="${escapeAttr(guard.confirmMessage || '确定要继续执行此操作吗？')}" placeholder="确认提示内容"></div>`;
}

function readButtonGuard(root, existing = {}) {
  const old = existing.guard || {};
  const password = root.querySelector('[data-guard-password-value]')?.value.trim() || '';
  const result = { requirePassword: root.querySelector('[data-guard-password]')?.checked === true, passwordHash: old.passwordHash || '', requireConfirm: root.querySelector('[data-guard-confirm]')?.checked === true, confirmMessage: root.querySelector('[data-guard-message]')?.value.trim() || '确定要继续执行此操作吗？' };
  if (password) result.password = password;
  return result;
}

function bindDownloadControl(root) {
  const control = root.querySelector('.download-target-control');
  if (!control || control.dataset.ready) return;
  control.dataset.ready = '1';
  const mode = control.querySelector('[data-download-mode]');
  const single = control.querySelector('[data-download-single]');
  const multiple = control.querySelector('[data-download-multiple]');
  const directory = control.querySelector('[data-download-directory]');
  const deleteOnExit = control.querySelector('[data-download-delete-on-exit]');
  const sync = () => { single.hidden = mode.value !== 'single'; multiple.hidden = mode.value !== 'multiple'; };
  const syncCleanup = () => {
    if (!directory || !deleteOnExit) return;
    const enabled = !!directory.value.trim();
    deleteOnExit.disabled = !enabled;
    if (!enabled) deleteOnExit.checked = false;
  };
  const bindRows = () => {
    [...control.querySelectorAll('.download-file-row')].forEach((row) => {
      row.querySelector('[data-remove-download]').onclick = () => {
        if (control.querySelectorAll('.download-file-row').length <= 1) return;
        const wasPrimary = row.querySelector('[data-download-primary]').checked;
        row.remove();
        if (wasPrimary) control.querySelector('[data-download-primary]')?.click();
      };
      row.querySelector('[data-download-primary]').onchange = (event) => {
        if (!event.target.checked) return;
        control.querySelectorAll('[data-download-primary]').forEach((radio) => { if (radio !== event.target) radio.checked = false; });
      };
    });
  };
  mode.onchange = sync;
  directory?.addEventListener('input', syncCleanup);
  control.querySelector('[data-add-download]').onclick = () => {
    const radioName = control.querySelector('[data-download-primary]')?.name || '';
    control.querySelector('[data-download-files]').insertAdjacentHTML('beforeend', downloadFileRowHtml({}, 1, radioName));
    bindRows();
  };
  control.querySelector('[data-add-backup]')?.addEventListener('click', () => {
    control.querySelector('[data-download-backups]')?.insertAdjacentHTML('beforeend', '<div class="download-backup-row"><input data-field="backup-url-item" placeholder="备用下载地址"><button type="button" data-remove-backup>删除</button></div>');
    bindBackupRows();
  });
  const bindBackupRows = () => control.querySelectorAll('[data-remove-backup]').forEach((button) => { button.onclick = () => button.closest('.download-backup-row')?.remove(); });
  bindBackupRows();
  bindRows(); sync(); syncCleanup();
}

function readDownloadConfig(root) {
  const control = root.querySelector('.download-target-control');
  if (!control) return {};
  const downloadDirectory = control.querySelector('[data-download-directory]')?.value.trim() || '';
  const deleteOnExit = control.querySelector('[data-download-delete-on-exit]')?.checked === true;
  const result = { download_directory: downloadDirectory, download_delete_on_exit: deleteOnExit };
  const backupUrls = [...control.querySelectorAll('[data-field="backup-url-item"]')].map((input) => input.value.trim()).filter(Boolean);
  const backupPageUrl = control.querySelector('[data-field="backup-page-url"]')?.value.trim() || '';
  if (backupUrls.length) { result.backup_urls = backupUrls; result.backup_url = backupUrls[0]; }
  if (backupPageUrl) result.backup_page_url = backupPageUrl;
  if (control.querySelector('[data-download-mode]').value !== 'multiple') return result;
  const files = [...control.querySelectorAll('.download-file-row')].map((row) => ({ url: row.querySelector('[data-download-url]').value.trim(), backup_url: row.querySelector('[data-download-backup-url]')?.value.trim() || '', backup_page_url: row.querySelector('[data-download-backup-page]')?.value.trim() || '', primary: row.querySelector('[data-download-primary]').checked })).filter((file) => file.url);
  let primaryIndex = files.findIndex((file) => file.primary);
  if (primaryIndex < 0) primaryIndex = 0;
  files.forEach((file, index) => { file.primary = index === primaryIndex; });
  return { ...result, download_mode: 'multiple', package_name: control.querySelector('[data-package-name]').value.trim(), files };
}

function targetControlHtml(action, target = '', data = {}) {
  if (action === 'script') {
    const scriptId = normalizeScriptTarget(target);
    const effectiveScriptId = scriptId || SCRIPT_OPTIONS[0]?.value || '';
    const custom = effectiveScriptId && !SCRIPT_LABELS[effectiveScriptId] && !effectiveScriptId.startsWith('builtin:');
    return `
      <div class="script-target-control">
        <select class="target-input" data-field="target">${scriptOptionsHtml(effectiveScriptId)}</select>
        <input class="target-input custom-script-input" data-field="custom-script" value="${custom ? escapeAttr(effectiveScriptId) : ''}" placeholder="输入要执行的命令" ${custom ? '' : 'hidden'}>
      </div>
    `;
  }
  if (action === 'download') return downloadControlHtml(target, data);
  return `<input class="target-input" value="${escapeAttr(target || '')}" data-field="target" title="${escapeAttr(target || '')}">`;
}

function updateRowTargetState(row, button) {
  const action = row.querySelector('[data-field="action"]').value;
  const holder = row.querySelector('.target-control');
  const note = row.querySelector('.target-note');
  const currentTarget = readRowTarget(row) || button.target || '';
  if (holder) holder.innerHTML = targetControlHtml(action, currentTarget, button.raw || button);
  bindScriptTargetControl(row);
  bindDownloadControl(row);
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
  label.classList.toggle('download-config-field', action === 'download');
  if (action === 'download') {
    const current = target?.value?.trim() || '';
    label.innerHTML = `下载配置${downloadControlHtml(current, {})}`;
    const singleInput = label.querySelector('[data-field="target"]');
    if (singleInput) singleInput.id = 'addTarget';
    bindDownloadControl(label);
    if (help) help.hidden = true;
  } else if (action === 'script') {
    const selected = normalizeScriptTarget(readAddTarget()) || SCRIPT_OPTIONS[0]?.value || '';
    const custom = selected && !SCRIPT_LABELS[selected] && !selected.startsWith('builtin:');
    label.innerHTML = `
      内置功能
      <div id="addScriptControl" class="script-target-control">
        <select id="addTarget">${scriptOptionsHtml(selected)}</select>
        <input id="addCustomScript" value="${custom ? escapeAttr(selected) : ''}" placeholder="输入要执行的命令" ${custom ? '' : 'hidden'}>
      </div>
    `;
    bindAddScriptTargetControl();
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) label.firstChild.textContent = '内置功能';
  } else if (label.querySelector('.download-target-control')) {
    label.innerHTML = '网址 / 内容<input id="addTarget" placeholder="粘贴网页或下载地址">';
    if (help) help.hidden = true;
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
  const downloadControl = $('addTarget')?.closest('label')?.querySelector('.download-target-control');
  if ($('addAction')?.value === 'download' && downloadControl?.querySelector('[data-download-mode]')?.value === 'multiple') return downloadControl.querySelector('[data-download-url]')?.value.trim() || '';
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
  for (const id of ['appHomeBannerUrl']) {
    const value = $(id)?.value.trim() || '';
    if (value && !allowedImageUrl(value)) throw new Error('图片地址必须是有效的 HTTPS 链接。');
  }
  const deleteDownloadsOnExit = $('deleteDownloadsOnExit')?.checked === true;
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
    home_banner_url: $('appHomeBannerUrl').value.trim(),
    window_width: Number($('appWidth').value || 1080),
    window_height: Number($('appHeight').value || 700),
    delete_downloads_on_exit: deleteDownloadsOnExit
  }, '基础信息已保存。');
}

function ensureIpLocationPanel() {
  if ($('ipLocationPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'ipLocationPanel'; panel.className = 'panel collapsible-panel is-collapsed'; panel.dataset.collapsiblePanel = '';
  panel.innerHTML = `<div class="panel-head"><h2>IP 定位接口</h2><button id="saveIpLocationBtn" type="button">保存设置</button></div>
    <div class="ip-location-settings"><div class="form-grid compact"><label>定位模式<select id="ipLocationMode"><option value="consensus">智能一致性（推荐）</option><option value="first">单接口优先</option><option value="system">仅系统自带</option></select></label><label>一致性阈值<input id="ipLocationThreshold" type="number" min="1" max="8" value="2"></label><label class="toggle-line">统一输出中文<span><input id="ipUnifiedChinese" type="checkbox"> 开启</span></label></div>
    <div class="ip-provider-grid"><label class="checkline"><input data-ip-provider value="amap" type="checkbox"> 高德</label><label class="checkline"><input data-ip-provider value="tencent" type="checkbox"> 腾讯</label><label class="checkline"><input data-ip-provider value="baidu" type="checkbox"> 百度</label><label class="checkline"><input data-ip-provider value="system" type="checkbox"> 系统自带</label><label class="checkline"><input data-ip-provider value="ip-api" type="checkbox"> ip-api.com</label><label class="checkline"><input data-ip-provider value="ipapi-co" type="checkbox"> ipapi.co</label><label class="checkline"><input data-ip-provider value="ip-sb" type="checkbox"> ip.sb</label><label class="checkline"><input data-ip-provider value="pconline" type="checkbox"> 太平洋 IP</label></div>
    <div class="form-grid compact"><label>高德 Key<input id="ipAmapKey"></label><label>高德签名密钥<input id="ipAmapSecret"></label><label>腾讯 Key<input id="ipTencentKey"></label><label>腾讯 Secret Key<input id="ipTencentSecret"></label><label>百度 AK<input id="ipBaiduKey"></label></div>
    <div class="ip-test-row"><input id="ipLocationTestInput" placeholder="输入要测试的 IPv4/IPv6"><button id="testIpLocationBtn" type="button">测试</button><span id="ipLocationTestResult"></span></div></div>`;
  $('view-system').prepend(panel); setupCollapsiblePanels();
  $('saveIpLocationBtn').onclick = () => saveSystemSettings('ipLocation').catch(e => setStatus(e.message, true));
  $('testIpLocationBtn').onclick = async () => { const result = await api('/api/super/ip-location/test', { method: 'POST', body: JSON.stringify({ ip: $('ipLocationTestInput').value.trim() }) }); $('ipLocationTestResult').textContent = `${result.ip} · ${result.address}`; };
}

function normalizeButtonContentLayout(value) {
  return value === 'none' ? 'none' : (value === 'icon_top' ? 'icon_top' : 'icon_left');
}

function buttonLayoutPages() {
  const fixedPages = new Set(['system_overview', 'xinggui_home']);
  const rows = [];
  const seen = new Set();
  (state.config?.sidebar || []).forEach((item) => {
    if (!item?.id || item.id === 'settings' || fixedPages.has(item.id) || seen.has(item.id)) return;
    seen.add(item.id);
    rows.push({ id: item.id, name: item.name || state.config?.pages?.[item.id]?.title || item.id });
  });
  Object.entries(state.config?.pages || {}).forEach(([id, page]) => {
    if (!id || id === 'settings' || fixedPages.has(id) || seen.has(id)) return;
    seen.add(id);
    rows.push({ id, name: page?.title || page?.name || id });
  });
  return rows;
}

function normalizedButtonLayoutRules(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(['icon_left', 'icon_top'].map((id) => [id, {
    enabled: source[id]?.enabled === true,
    pages: Array.isArray(source[id]?.pages) ? [...new Set(source[id].pages.filter(Boolean).map(String))] : []
  }]));
}

function canEditOwnButtonLayout() {
  return !isTemplateMode() && (!state.targetUserId || state.targetUserId === state.currentUser?.id);
}

function renderButtonContentLayout(value, rulesValue = state.config?.app?.button_content_layout_rules) {
  const normalized = normalizeButtonContentLayout(value);
  const rules = normalizedButtonLayoutRules(rulesValue);
  document.querySelectorAll('input[name="buttonContentLayout"]').forEach((input) => {
    input.checked = input.value === normalized;
    input.disabled = !canEditOwnButtonLayout();
    const option = input.closest('.button-layout-option');
    if (!option) return;
    if (input.value === 'none') return;
    let picker = option.querySelector('.button-layout-page-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.className = 'button-layout-page-picker';
      option.appendChild(picker);
    }
    const rule = rules[input.value];
    const pages = buttonLayoutPages();
    const disabled = !canEditOwnButtonLayout();
    const selectedNames = pages.filter((page) => rule.pages.includes(page.id)).map((page) => page.name);
    picker.innerHTML = `<label class="button-layout-scope-toggle"><input data-layout-scope-enabled type="checkbox" ${rule.enabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}> 仅指定页面</label>
      <details class="button-layout-page-dropdown" ${rule.enabled && rule.pages.length ? 'open' : ''}>
        <summary>${selectedNames.length ? `已选择 ${selectedNames.length} 个页面` : '选择页面（未选择默认全部）'}</summary>
        <div class="button-layout-page-options">${pages.map((page) => `<label><input data-layout-page type="checkbox" value="${escapeAttr(page.id)}" ${rule.pages.includes(page.id) ? 'checked' : ''} ${disabled || !rule.enabled ? 'disabled' : ''}> ${escapeHtml(page.name)}</label>`).join('') || '<small>暂无可选页面</small>'}</div>
      </details>`;
    picker.onclick = (event) => event.stopPropagation();
    picker.querySelector('[data-layout-scope-enabled]').onchange = () => saveButtonLayoutRule(input.value, picker).catch((error) => setStatus(error.message, true));
    picker.querySelectorAll('[data-layout-page]').forEach((box) => box.onchange = () => saveButtonLayoutRule(input.value, picker).catch((error) => setStatus(error.message, true)));
  });
}

async function saveButtonLayoutRule(layoutId, picker) {
  if (!canEditOwnButtonLayout()) throw new Error('按钮排列只能由每个用户修改自己的配置，不能修改全局模板或其他用户。');
  const rules = normalizedButtonLayoutRules(state.config?.app?.button_content_layout_rules);
  rules[layoutId] = {
    enabled: picker.querySelector('[data-layout-scope-enabled]').checked,
    pages: [...picker.querySelectorAll('[data-layout-page]:checked')].map((box) => box.value)
  };
  const saved = await api(appApiPath(), { method: 'PATCH', body: JSON.stringify({ button_content_layout_rules: rules }) });
  state.config = saved;
  renderButtonContentLayout(saved.app?.button_content_layout, saved.app?.button_content_layout_rules);
  setStatus(rules[layoutId].enabled && rules[layoutId].pages.length ? '按钮排列页面范围已保存。' : '未限定页面，将对全部页面生效。');
}

let savingButtonContentLayout = false;
async function saveButtonContentLayout(nextValue) {
  if (savingButtonContentLayout) return;
  if (!canEditOwnButtonLayout()) {
    renderButtonContentLayout(state.config.app?.button_content_layout, state.config.app?.button_content_layout_rules);
    setStatus('按钮排列只能由每个用户修改自己的配置，不能修改全局模板或其他用户。', true);
    return;
  }
  const previous = normalizeButtonContentLayout(state.config.app?.button_content_layout);
  const next = normalizeButtonContentLayout(nextValue);
  if (next === previous) return;
  const status = $('buttonContentLayoutStatus');
  savingButtonContentLayout = true;
  document.querySelectorAll('input[name="buttonContentLayout"]').forEach((input) => { input.disabled = true; });
  if (status) {
    status.classList.remove('error', 'success');
    status.textContent = '正在保存按钮布局……';
  }
  try {
    const saved = await api(appApiPath(), { method: 'PATCH', body: JSON.stringify({ button_content_layout: next }) });
    state.config = saved;
    renderButtonContentLayout(saved.app?.button_content_layout, saved.app?.button_content_layout_rules);
    if (status) {
      status.classList.add('success');
      status.textContent = '按钮布局已保存，工具箱将在 5 秒内同步。';
    }
  } catch (error) {
    renderButtonContentLayout(previous);
    if (status) {
      status.classList.add('error');
      status.textContent = `按钮布局保存失败：${error.message}`;
    }
  } finally {
    savingButtonContentLayout = false;
    document.querySelectorAll('input[name="buttonContentLayout"]').forEach((input) => { input.disabled = !canEditOwnButtonLayout(); });
  }
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
  const patch = {
    password_enabled: passwordEnabled,
    password: newPassword
  };
  await saveAppPatch(patch, '启动密码已保存。');
}

async function saveAppExeSettings() {
  await saveAppPatch({
    exe_title: $('appExeTitle')?.value.trim() || '',
    exe_description: $('appExeDescription')?.value.trim() || '',
    exe_product: $('appExeProduct')?.value.trim() || '',
    exe_company: cleanExeMetadata($('appExeCompany')?.value),
    exe_copyright: cleanExeMetadata($('appExeCopyright')?.value),
    exe_version: $('appExeVersion')?.value.trim() || ''
  }, 'EXE 属性已保存。');
}

async function saveAppUpdateSettings() {
  const updateVariants = {};
  document.querySelectorAll('[data-update-variant]').forEach((card) => {
    const value = (field) => card.querySelector(`[data-update-field="${field}"]`)?.value.trim() || '';
    const settings = {
      version: value('version'), minVersion: value('minVersion'), url: value('url'),
      title: value('title') || '工具箱更新', button: value('button') || '下载最新版',
      force: card.querySelector('[data-update-field="force"]')?.checked === true
    };
    if (settings.force && !settings.url) throw new Error(`${CLIENT_VARIANTS.find((item) => item.id === card.dataset.updateVariant)?.label || '工具箱'}开启强制更新前必须填写更新链接。`);
    updateVariants[card.dataset.updateVariant] = settings;
  });
  const original = updateVariants.original || {};
  await saveAppPatch({
    update_variants: updateVariants,
    // The global version belongs to 基础信息. Saving update-entry settings must
    // not overwrite it with the original variant's update target version.
    version: $('appVersion')?.value.trim() || state.config?.app?.version || '',
    update_url: original.url || '',
    update_title: original.title || '工具箱更新',
    update_button: original.button || '下载最新版',
    update_min_version: original.minVersion || '',
    update_force: original.force === true
  }, '四个工具箱版本的更新设置已保存。');
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

async function savePositionIcon() {
  const pos = parsePositionValue($('manageScope').value);
  if (!pos || pos.scope !== 'page') throw new Error('工具箱标签不使用左侧菜单图标。');
  const sidebarItem = (state.config.sidebar || []).find(item => item.id === pos.pageId);
  if (!sidebarItem) throw new Error('当前页面不在左侧菜单中。');
  sidebarItem.icon = $('manageScopeIconPreset').value || $('manageScopeIconUrl').value.trim();
  await saveWholeConfig('菜单图标已保存。');
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
  if ($('manageSection')) {
    $('manageSection').value = String(desired - 1);
    renderManagedSectionName();
  }
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
  request.button.guard = { requirePassword: $('addGuardPassword')?.checked === true, password: $('addGuardPasswordValue')?.value.trim() || '', requireConfirm: $('addGuardConfirm')?.checked === true, confirmMessage: $('addGuardMessage')?.value.trim() || '确定要继续执行此操作吗？' };
  if (action === 'download') Object.assign(request.button, readDownloadConfig($('addTarget').closest('label')));
  if (request.button.download_mode === 'multiple' && request.button.files.length < 2) { setStatus('多文件安装包请至少填写两个有效下载地址。', true); return; }

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
  if ($('addGuardPassword')) $('addGuardPassword').checked = false;
  if ($('addGuardConfirm')) $('addGuardConfirm').checked = false;
  if ($('addGuardPasswordValue')) $('addGuardPasswordValue').value = '';
  const addTargetLabel = $('addTarget')?.closest('label');
  if (addTargetLabel && $('addAction').value === 'download') { addTargetLabel.innerHTML = '网址 / 内容<input id="addTarget" placeholder="粘贴网页或下载地址">'; updateAddTargetState(); }
  else if ($('addTarget')) $('addTarget').value = '';
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
  if (request.button.action === 'download') Object.assign(request.button, readDownloadConfig(row));
  request.button.guard = readButtonGuard(row, ref.raw || {});

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
  return target?.value.trim() || row.querySelector('[data-download-url]')?.value.trim() || '';
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
  request.button.guard = ref.raw?.guard || {};
  if (ref.action === 'download') { request.button.download_mode = ref.raw?.download_mode || 'single'; request.button.package_name = ref.raw?.package_name || ''; request.button.files = ref.raw?.files || []; request.button.download_directory = ref.raw?.download_directory || ref.raw?.download_path || ''; request.button.download_delete_on_exit = ref.raw?.download_delete_on_exit === true || ref.raw?.delete_download_on_exit === true; request.button.backup_url = ref.raw?.backup_url || ref.raw?.backup_download_url || ''; request.button.backup_page_url = ref.raw?.backup_page_url || ref.raw?.backup_webpage || ''; }

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
  const agentLevelId = $('newUserAgentLevel')?.value || '';
  const balance = Number($('newUserBalance')?.value || 0);

  if (!username || !password) {
    setStatus('用户名和初始密码不能为空。', true);
    return;
  }

  await api('/api/super/users', {
    method: 'POST',
    body: JSON.stringify({ username, email, displayName, password, role, balance, agentLevelId })
  });

  $('newUsername').value = '';
  $('newUserEmail').value = '';
  $('newDisplayName').value = '';
  $('newUserPassword').value = '';
  if ($('newUserRole')) $('newUserRole').value = 'user';
  renderNewUserAgentLevel();
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
  (overlay._background || []).forEach(([node, inert]) => { node.inert = inert; });
  overlay._background = [];
  document.body.style.overflow = overlay._overflow || '';
  if (overlay._returnFocus?.isConnected) overlay._returnFocus.focus();
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
      <fieldset class="payment-methods-fieldset"><legend>支付方式</legend><div id="invitePaymentActions" class="invite-payment-actions payment-method-grid" role="radiogroup" aria-label="支付方式"></div></fieldset>
      <p id="invitePaymentHint" class="invite-pay-note" role="status"></p>
      <div class="payment-dialog-footer"><button id="cancelInvitePaymentBtn" type="button">取消</button><button id="confirmInvitePaymentBtn" type="button" class="payment-confirm" disabled>确认支付</button></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (event) => {
    if (event.target === overlay) closeInvitePaymentDialog();
  };
  $('closeInvitePaymentBtn').onclick = () => closeInvitePaymentDialog();
  $('cancelInvitePaymentBtn').onclick = () => closeInvitePaymentDialog();
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeInvitePaymentDialog(); }
    if (event.key !== 'Tab') return;
    const nodes = [...overlay.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length);
    const first = nodes[0]; const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return overlay;
}

function paymentMethodButton(channel, onSelect, suffix = '') {
  const method = publicPaymentMethod(channel);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `payment-method payment-method-${method.key}`;
  button.setAttribute('aria-label', method.label + suffix);
  button.innerHTML = `<span class="payment-method-mark" aria-hidden="true">${method.mark}</span><span class="payment-method-copy"><strong>${method.label}${escapeHtml(suffix)}</strong><small>在线支付</small></span><span class="payment-method-check" aria-hidden="true">✓</span>`;
  button.onclick = () => onSelect(button);
  return button;
}

function showInvitePaymentDialog(quote, options = {}) {
  const overlay = ensureInvitePaymentDialog();
  if (!overlay.hidden) return Promise.resolve(null);
  const title = options.title || '邀请码付款';
  const itemName = options.itemName || '单个价格';
  const quantitySuffix = options.quantitySuffix || '个';
  $('invitePaymentTitle').textContent = title;
  const currency = quote.currency || 'CNY';
  const channels = quote.channels || [];
  const canPayBalance = quote.balanceEnough === true;
  $('invitePaymentSummary').innerHTML = `
    <div class="invite-pay-grid">
      <div class="payment-total"><span>本次需付</span><strong>${escapeHtml(formatMoney(quote.total, currency))}</strong></div>
      ${options.hideBalance ? '' : `<div><span>账户余额</span><strong>${escapeHtml(formatMoney(quote.balance, currency))}</strong></div>`}
      <div><span>${escapeHtml(itemName)}</span><strong>${escapeHtml(formatMoney(quote.price, currency))}</strong></div>
      <div><span>生成数量</span><strong>${Number(quote.request?.count || 1)} ${escapeHtml(quantitySuffix)}</strong></div>
    </div>
  `;
  const actions = $('invitePaymentActions');
  actions.innerHTML = '';
  const confirmButton = $('confirmInvitePaymentBtn');
  confirmButton.disabled = true;
  confirmButton.textContent = `确认支付 ${formatMoney(quote.total, currency)}`;
  let choice = null;
  const select = (button, value) => {
    choice = value;
    actions.querySelectorAll('[role="radio"]').forEach((node) => {
      const active = node === button;
      node.setAttribute('aria-checked', String(active));
      node.tabIndex = active ? 0 : -1;
    });
    confirmButton.disabled = false;
  };
  const addMethod = (button, value) => {
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.tabIndex = -1;
    button.onclick = () => select(button, value);
    actions.appendChild(button);
  };
  if (!options.hideBalance) {
    const balanceBtn = paymentMethodButton({}, () => {});
    balanceBtn.className = 'payment-method payment-method-balance';
    balanceBtn.setAttribute('aria-label', canPayBalance ? '余额支付' : '余额支付，余额不足');
    balanceBtn.innerHTML = `<span class="payment-method-mark" aria-hidden="true">余</span><span class="payment-method-copy"><strong>余额支付</strong><small>${canPayBalance ? '直接扣除账户余额' : '余额不足'}</small></span><span class="payment-method-check" aria-hidden="true">✓</span>`;
    balanceBtn.disabled = !canPayBalance;
    addMethod(balanceBtn, { paymentMethod: 'balance' });
  }
  const methodCounts = {};
  channels.forEach((channel) => {
    const key = publicPaymentMethod(channel).key;
    const count = (methodCounts[key] || 0) + 1; methodCounts[key] = count;
    const btn = paymentMethodButton(channel, () => {}, count > 1 ? `（通道 ${count}）` : '');
    addMethod(btn, { paymentMethod: 'interface', paymentChannel: channel.key, paymentType: channel.paymentType || '' });
  });
  const enabled = [...actions.querySelectorAll('button:not(:disabled)')];
  if (enabled.length) enabled[0].tabIndex = 0;
  actions.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = enabled.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + enabled.length) % enabled.length;
    enabled[next]?.click(); enabled[next]?.focus();
  };
  $('invitePaymentHint').textContent = !enabled.length ? '暂无可用支付方式，请联系管理员。' : !channels.length ? '在线支付暂不可用，可使用账户余额支付。' : '选择支付方式后确认，在线支付将前往付款页面。';
  confirmButton.onclick = () => { if (choice) { confirmButton.disabled = true; closeInvitePaymentDialog(choice); } };
  overlay._returnFocus = document.activeElement;
  overlay._overflow = document.body.style.overflow;
  overlay._background = [...document.body.children].filter((node) => node !== overlay && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)).map((node) => [node, node.inert]);
  overlay._background.forEach(([node]) => { node.inert = true; });
  document.body.style.overflow = 'hidden';
  overlay.hidden = false;
  (enabled[0] || $('closeInvitePaymentBtn')).focus();
  return new Promise((resolve) => {
    overlay._resolve = resolve;
  });
}

function closeBalanceRechargeDialog() {
  const overlay = $('balanceRechargeOverlay');
  if (overlay) overlay.hidden = true;
}

function ensureBalanceRechargeDialog() {
  let overlay = $('balanceRechargeOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'balanceRechargeOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal-card invite-payment-card" role="dialog" aria-modal="true" aria-labelledby="balanceRechargeTitle">
      <div class="modal-head">
        <h2 id="balanceRechargeTitle">代理余额充值</h2>
        <button id="closeBalanceRechargeBtn" type="button" aria-label="关闭">×</button>
      </div>
      <div class="balance-recharge-form">
        <div class="invite-pay-grid">
          <div><span>当前余额</span><strong id="balanceRechargeCurrent"></strong></div>
          <div><span>充值后余额</span><strong id="balanceRechargeAfter">输入金额后显示</strong></div>
        </div>
        <label>充值金额
          <input id="balanceRechargeAmount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" placeholder="请输入充值金额">
        </label>
        <p id="balanceRechargeMessage" class="invite-pay-note">充值将通过总管理员已启用的支付宝或微信支付接口完成。</p>
        <div id="balanceRechargeActions" class="invite-payment-actions">
          <button id="loadBalanceRechargeChannelsBtn" type="button">选择支付方式</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (event) => {
    if (event.target === overlay) closeBalanceRechargeDialog();
  };
  $('closeBalanceRechargeBtn').onclick = closeBalanceRechargeDialog;
  $('balanceRechargeAmount').oninput = () => {
    const currency = overlay.dataset.currency || state.inviteCurrency || 'CNY';
    const current = Number(state.currentUser?.balance || 0);
    const amount = Number($('balanceRechargeAmount').value || 0);
    $('balanceRechargeAfter').textContent = amount > 0 ? formatMoney(current + amount, currency) : '输入金额后显示';
    $('balanceRechargeMessage').textContent = '充值将通过总管理员已启用的支付宝或微信支付接口完成。';
    $('balanceRechargeActions').innerHTML = '<button id="loadBalanceRechargeChannelsBtn" type="button">选择支付方式</button>';
    $('loadBalanceRechargeChannelsBtn').onclick = loadBalanceRechargeChannels;
  };
  $('loadBalanceRechargeChannelsBtn').onclick = loadBalanceRechargeChannels;
  return overlay;
}

function openBalanceRechargeDialog() {
  if (!isAgent()) return;
  const overlay = ensureBalanceRechargeDialog();
  const currency = state.inviteCurrency || 'CNY';
  overlay.dataset.currency = currency;
  $('balanceRechargeCurrent').textContent = formatMoney(state.currentUser?.balance, currency);
  $('balanceRechargeAfter').textContent = '输入金额后显示';
  $('balanceRechargeAmount').value = '';
  $('balanceRechargeMessage').textContent = '充值将通过总管理员已启用的支付宝或微信支付接口完成。';
  $('balanceRechargeActions').innerHTML = '<button id="loadBalanceRechargeChannelsBtn" type="button">选择支付方式</button>';
  $('loadBalanceRechargeChannelsBtn').onclick = loadBalanceRechargeChannels;
  overlay.hidden = false;
  window.setTimeout(() => $('balanceRechargeAmount')?.focus(), 0);
}

async function loadBalanceRechargeChannels() {
  const amount = Number($('balanceRechargeAmount')?.value || 0);
  if (!Number.isFinite(amount) || amount < 0.01) {
    $('balanceRechargeMessage').textContent = '请输入不少于 0.01 的充值金额。';
    $('balanceRechargeAmount')?.focus();
    return;
  }
  const actions = $('balanceRechargeActions');
  const loadButton = $('loadBalanceRechargeChannelsBtn');
  if (loadButton) loadButton.disabled = true;
  try {
    const quote = await api('/api/super/balance/quote', {
      method: 'POST',
      body: JSON.stringify({ amount })
    });
    state.inviteCurrency = quote.currency || state.inviteCurrency || 'CNY';
    if (state.currentUser) state.currentUser.balance = quote.balance;
    renderUserContext();
    $('balanceRechargeCurrent').textContent = formatMoney(quote.balance, quote.currency);
    $('balanceRechargeAfter').textContent = formatMoney(Number(quote.balance || 0) + Number(quote.amount || 0), quote.currency);
    actions.innerHTML = '';
    (quote.channels || []).forEach((channel) => {
      const button = paymentMethodButton(channel, () => submitBalanceRecharge(quote, channel));
      actions.appendChild(button);
    });
    if (!(quote.channels || []).length) {
      $('balanceRechargeMessage').textContent = '总管理员尚未启用可用的支付宝或微信支付接口，请联系总管理员配置。';
      actions.innerHTML = '<button type="button" disabled>暂无可用支付方式</button>';
      return;
    }
    $('balanceRechargeMessage').textContent = '请选择支付方式，点击后将直接前往支付页面。';
  } catch (error) {
    $('balanceRechargeMessage').textContent = error.message || '读取支付方式失败。';
    if (loadButton) loadButton.disabled = false;
  }
}

let paymentFlowPending = false;
async function runPaymentFlow(button, action) {
  if (paymentFlowPending) return;
  paymentFlowPending = true;
  const wasDisabled = button?.disabled;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { return await action(); }
  finally { paymentFlowPending = false; if (button?.isConnected) { button.disabled = !!wasDisabled; button.removeAttribute('aria-busy'); } }
}

async function submitBalanceRecharge(quote, channel) {
  const actions = $('balanceRechargeActions');
  actions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  $('balanceRechargeMessage').textContent = '正在创建充值订单，请稍候…';
  try {
    const result = await api('/api/super/balance/recharge', {
      method: 'POST',
      body: JSON.stringify({
        amount: quote.amount,
        paymentChannel: channel.key,
        paymentType: channel.paymentType || ''
      })
    });
    const paymentUrl = result.paymentUrl || result.order?.paymentUrl;
    if (!paymentUrl) throw new Error('支付接口没有返回付款地址。');
    window.location.href = paymentUrl;
  } catch (error) {
    $('balanceRechargeMessage').textContent = error.message || '创建充值订单失败。';
    actions.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  }
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
      if (result.paymentUrl || result.payment_url || result.order.paymentUrl || result.order.payment_url) {
        window.location.href = result.paymentUrl || result.payment_url || result.order.paymentUrl || result.order.payment_url;
        return;
      }
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
  const deleteSelected = $('deleteSelectedInvitesBtn');
  if (deleteSelected) deleteSelected.hidden = !isSuper();
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
  const balanceInput = row.querySelector('[data-field="detailBalance"]') || row.querySelector('[data-field="balance"]');
  const body = {
    id: userId,
    username: row.querySelector('[data-field="username"]').value.trim(),
    email: row.querySelector('[data-field="email"]').value.trim(),
    displayName: row.querySelector('[data-field="displayName"]').value.trim(),
    role: row.querySelector('[data-field="role"]').value,
    agentLevelId: row.querySelector('[data-field="agentLevelId"]')?.value || '',
    canViewJson: row.querySelector('[data-field="canViewJson"]')?.checked !== false,
    balance: Number(balanceInput?.value || 0)
  };
  const password = row.querySelector('[data-field="password"]').value.trim();
  if (password) body.password = password;
  const oldUser = state.users.find((item) => item.id === userId);
  const sensitive = Boolean(password) || (oldUser && body.email.toLowerCase() !== String(oldUser.email || '').toLowerCase());
  if (sensitive) {
    body.currentPassword = prompt('请输入当前管理员密码以确认敏感账号修改：') || '';
    if (!body.currentPassword) return;
  }

  await api('/api/super/users', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });

  await loadUsers();
  renderUserContext();
  setStatus('用户已保存。');
}

async function saveAgentBalance(userId, row) {
  const balance = Number(row.querySelector('[data-field="detailBalance"]')?.value || row.querySelector('[data-field="balance"]')?.value || 0);
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
  const levels = agentLevelRows().filter((level) => level.enabled !== false);
  const levelHint = levels.map((level) => `${level.id}：${level.name}（${Number(level.price || 0).toFixed(2)}）`).join('\n');
  const selectedLevelId = window.prompt(`请输入代理级别编号：\n${levelHint}`, user.agentLevelId || levels[0]?.id || '') || '';
  if (!levels.some((level) => level.id === selectedLevelId)) {
    setStatus('请选择有效的代理级别。', true);
    return;
  }
  const useDefaultBalance = confirm(`把「${user.displayName || user.username}」设为代理，并写入系统默认代理余额吗？\n选择“取消”会设为代理但余额保留为 0 或当前值。`);
  await api('/api/super/users/agent', {
    method: 'POST',
    body: JSON.stringify({ id: userId, action: 'promote', useDefaultBalance, agentLevelId: selectedLevelId })
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
  const body = { ids, action };
  if (action === 'delete') {
    body.currentPassword = prompt('请输入当前管理员密码以确认批量删除：') || '';
    if (!body.currentPassword) return;
  }
  await api('/api/super/users/batch', {
    method: 'POST',
    body: JSON.stringify(body)
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
  const usable = (key) => key !== 'wechatOfficial' && enabled(key);
  const currentWechat = $('payWechatChannel')?.value || pay.wechatChannel || 'disabled';
  const currentAlipay = $('payAlipayChannel')?.value || pay.alipayChannel || 'disabled';
  if ($('payWechatChannel')) {
    $('payWechatChannel').value = usable(currentWechat) ? currentWechat : (usable('easypay') ? 'easypay' : (usable('easypay2') ? 'easypay2' : 'disabled'));
  }
  if ($('payAlipayChannel')) {
    $('payAlipayChannel').value = usable(currentAlipay) ? currentAlipay : (usable('alipayOfficial') ? 'alipayOfficial' : (usable('easypay') ? 'easypay' : (usable('easypay2') ? 'easypay2' : 'disabled')));
  }
}

function agentLevelRows() {
  const rows = Array.isArray(state.system?.agent?.levels) ? state.system.agent.levels : [];
  return rows.length ? rows : [{ id: 'level-default', name: '默认代理级别', price: Number(state.system?.agent?.invitePrice || 0), sort: 10, enabled: true }];
}

function agentLevelOptionsHtml(selected = '') {
  return agentLevelRows().filter((level) => level.enabled !== false).map((level) =>
    `<option value="${escapeAttr(level.id)}" ${level.id === selected ? 'selected' : ''}>${escapeHtml(level.name)}（${Number(level.price || 0).toFixed(2)}）</option>`
  ).join('');
}

function renderAgentLevelRows() {
  const root = $('agentLevelRows');
  if (!root || !state.system) return;
  const rows = agentLevelRows();
  state.system.agent.levels = rows;
  root.innerHTML = rows.map((level, index) => `
    <div class="agent-level-row" data-agent-level-row data-index="${index}">
      <input data-agent-level-name value="${escapeAttr(level.name || '')}" placeholder="级别名称">
      <input data-agent-level-price type="number" min="0" step="0.01" value="${Number(level.price || 0)}" placeholder="邀请码单价">
      <input data-agent-level-sort type="number" step="1" value="${Number(level.sort || (index + 1) * 10)}" placeholder="排序">
      <label class="checkline"><input data-agent-level-enabled type="checkbox" ${level.enabled !== false ? 'checked' : ''}> 启用</label>
      <button type="button" class="danger" data-agent-level-remove ${rows.length <= 1 ? 'disabled' : ''}>删除</button>
    </div>
  `).join('');
  root.querySelectorAll('[data-agent-level-remove]').forEach((button) => {
    button.onclick = () => {
      const row = button.closest('[data-agent-level-row]');
      state.system.agent.levels.splice(Number(row?.dataset.index || 0), 1);
      renderAgentLevelRows();
      renderNewUserAgentLevel();
    };
  });
}

function readAgentLevelRowsFromForm() {
  const rows = [...document.querySelectorAll('[data-agent-level-row]')].map((row, index) => ({
    id: agentLevelRows()[index]?.id || `level-${Date.now().toString(36)}-${index}`,
    name: row.querySelector('[data-agent-level-name]')?.value.trim() || `代理级别 ${index + 1}`,
    price: Number(row.querySelector('[data-agent-level-price]')?.value || 0),
    sort: Number(row.querySelector('[data-agent-level-sort]')?.value || (index + 1) * 10),
    enabled: row.querySelector('[data-agent-level-enabled]')?.checked !== false
  }));
  return rows.length ? rows : agentLevelRows();
}

function renderNewUserAgentLevel() {
  const select = $('newUserAgentLevel');
  const role = $('newUserRole')?.value || 'user';
  if (!select) return;
  const previous = select.value || agentLevelRows()[0]?.id || '';
  select.innerHTML = role === 'agent' ? agentLevelOptionsHtml(previous) : '<option value="">仅代理账号可选</option>';
  select.value = role === 'agent' && [...select.options].some((option) => option.value === previous) ? previous : (role === 'agent' ? (select.options[0]?.value || '') : '');
  select.disabled = role !== 'agent' || !isSuper();
}

async function loadCloudResolverDiagnostics() {
  if (!isSuper()) throw new Error('只有总管理员可以查看诊断日志。');
  const result = await api('/api/super/cloud-resolver-diagnostics');
  if (state.system) state.system.cloudResolverDiagnosticsEnabled = result.enabled === true;
  if ($('cloudResolverDiagnosticsEnabled')) $('cloudResolverDiagnosticsEnabled').checked = result.enabled === true;
  if ($('cloudResolverDiagnosticsStatus')) $('cloudResolverDiagnosticsStatus').textContent = result.enabled === true ? '已开启' : '已关闭';
  const content = $('cloudResolverDiagnosticsContent');
  if (content) {
    content.textContent = result.content || '当前没有诊断日志。';
    content.hidden = false;
  }
  const size = Number(result.sizeBytes || 0);
  if ($('cloudResolverDiagnosticsSummary')) {
    $('cloudResolverDiagnosticsSummary').textContent = `共 ${Number(result.events || 0)} 条，当前显示 ${Number(result.shown || 0)} 条，日志大小 ${(size / 1024).toFixed(1)} KB`;
  }
  return result;
}

async function saveCloudResolverDiagnostics() {
  if (!isSuper()) throw new Error('只有总管理员可以修改诊断日志设置。');
  const enabled = $('cloudResolverDiagnosticsEnabled')?.checked === true;
  const result = await api('/api/super/cloud-resolver-diagnostics', {
    method: 'PATCH', body: JSON.stringify({ enabled })
  });
  if (state.system) state.system.cloudResolverDiagnosticsEnabled = result.enabled === true;
  if ($('cloudResolverDiagnosticsStatus')) $('cloudResolverDiagnosticsStatus').textContent = result.enabled ? '已开启' : '已关闭';
  setStatus(result.enabled ? '网盘解析诊断日志已开启。复现问题后请及时关闭。' : '网盘解析诊断日志已关闭。');
  return result;
}

async function downloadCloudResolverDiagnostics() {
  if (!isSuper()) throw new Error('只有总管理员可以下载诊断日志。');
  const response = await fetch('/api/super/cloud-resolver-diagnostics/export', { headers: authHeaders() });
  if (!response.ok) {
    let message = `下载日志失败：HTTP ${response.status}`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '网盘解析诊断日志.jsonl';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('诊断日志已下载。');
}

async function copyCloudResolverDiagnostics() {
  const content = $('cloudResolverDiagnosticsContent');
  if (!content || content.hidden) await loadCloudResolverDiagnostics();
  await navigator.clipboard.writeText($('cloudResolverDiagnosticsContent')?.textContent || '');
  setStatus('当前显示的诊断日志已复制。');
}

async function clearCloudResolverDiagnostics() {
  if (!isSuper()) throw new Error('只有总管理员可以清空诊断日志。');
  if (!window.confirm('确认清空服务器上的全部网盘解析诊断日志吗？此操作不可恢复。')) return;
  const currentPassword = window.prompt('请输入当前总管理员密码以确认清空日志：');
  if (currentPassword === null) return;
  await api('/api/super/cloud-resolver-diagnostics', {
    method: 'DELETE', body: JSON.stringify({ currentPassword })
  });
  const content = $('cloudResolverDiagnosticsContent');
  if (content) { content.textContent = '当前没有诊断日志。'; content.hidden = false; }
  if ($('cloudResolverDiagnosticsSummary')) $('cloudResolverDiagnosticsSummary').textContent = '日志已清空。';
  setStatus('网盘解析诊断日志已清空。');
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
    const levels = readAgentLevelRowsFromForm();
    body.agent = {
      invitePrice: Number(levels[0]?.price || 0),
      cloudCodePrice: Number($('agentCloudCodePrice')?.value || 0),
      currency: $('agentCurrency').value.trim() || 'CNY',
      orderCooldownMinutes: Number($('agentOrderCooldown')?.value || 0),
      allowNegativeBalance: $('agentAllowNegative').checked,
      levels
    };
  }
  if (section === 'cloudResolverOrderExpiry') {
    body.cloudResolverOrderExpiryMinutes = Number($('cloudResolverOrderExpiryMinutes')?.value || 30);
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
  if (section === 'ipLocation') {
    body.ipLocation = {
      providers: [...document.querySelectorAll('[data-ip-provider]:checked')].map(x => x.value),
      mode: $('ipLocationMode').value, threshold: Number($('ipLocationThreshold').value || 2), unifiedChinese: $('ipUnifiedChinese').checked,
      amapKey: $('ipAmapKey').value.trim(), amapSecret: $('ipAmapSecret').value.trim(), baiduKey: $('ipBaiduKey').value.trim(),
      tencentKey: $('ipTencentKey').value.trim(), tencentSecret: $('ipTencentSecret').value.trim()
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
  const result = await api('/api/super/orders?scope=cloud_resolver');
  state.orders = result.orders || [];
  if (state.cloudResolver) {
    state.cloudResolver.orders = state.orders;
    renderCloudOrders();
  }
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

async function deleteCloudOrderGroup(filter, selectedOrders = state.cloudOrderSelectedIds) {
  const labels = { all: '全部网盘解析订单', completed: '已完成网盘解析订单', expired: '已失效网盘解析订单', selected: '选中的网盘解析订单' };
  const label = labels[filter] || '网盘解析订单';
  const ids = filter === 'selected' ? [...selectedOrders] : [];
  if (filter === 'selected' && !ids.length) {
    setStatus('请先勾选要删除的网盘订单。', true);
    return;
  }
  if (!confirm(`确定删除${label}吗？删除后无法恢复。`)) return;
  const result = await api('/api/super/orders', {
    method: 'DELETE',
    body: JSON.stringify({ cloudResolverFilter: filter, ids })
  });
  selectedOrders.clear();
  await refreshOrders(false);
  setStatus(`已删除 ${Number(result.deleted || 0)} 笔${label}。`);
}

async function deleteCloudResolverOrder(orderId) {
  if (!orderId || !confirm(`确定删除网盘解析订单「${orderId}」吗？此操作不可恢复。`)) return;
  await api('/api/super/orders', {
    method: 'DELETE',
    body: JSON.stringify({ cloudResolverFilter: 'selected', ids: [orderId] }),
  });
  state.cloudResolverAdminSelectedOrderIds.delete(orderId);
  state.cloudOrderSelectedIds.delete(orderId);
  await refreshOrders(false);
  setStatus('网盘解析订单已删除。');
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
  const currentPassword = prompt('请输入当前管理员密码以确认重置：') || '';
  if (!currentPassword) return;

  await api('/api/super/users', {
    method: 'PATCH',
    body: JSON.stringify({ id: userId, resetApiKey: true, currentPassword })
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
  const currentPassword = prompt('请输入当前管理员密码以确认删除：') || '';
  if (!currentPassword) return;

  await api('/api/super/users', {
    method: 'DELETE',
    body: JSON.stringify({ id: userId, currentPassword })
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
    await loadClientVariants();
    renderClientVariants();
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
    await loadCloudResolver();
  renderAll();
  setStatus(message);
}

async function loadAdminAnnouncementsSafe() {
  try {
    const [list, popup] = await Promise.all([
      api('/api/admin/announcements'),
      api('/api/admin/announcements/unread')
    ]);
    state.announcements = Array.isArray(list?.announcements) ? list.announcements : [];
    state.announcementUnreadCount = Number(list?.unreadCount || 0);
    state.announcementPopupNewItems = (popup?.announcements || []).filter((item) => item.popup_enabled !== false);
    state.announcementPopupItems = state.announcementPopupNewItems.length
      ? state.announcements.filter(announcementCanAppearInPopupHistory)
      : [];
    state.announcementPopupMarking = false;
  } catch (error) {
    console.warn('更新公告读取失败：', error);
    state.announcements = [];
    state.announcementUnreadCount = 0;
    state.announcementPopupItems = [];
    state.announcementPopupNewItems = [];
    state.announcementPopupMarking = false;
  }
}

function ensureAdminAnnouncementView() {
  let view = $('view-announcements');
  if (view) return view;
  view = document.createElement('section');
  view.id = 'view-announcements';
  view.className = 'view announcement-view';
  view.innerHTML = `
    <div class="announcement-toolbar panel">
      <div class="announcement-heading"><h2>更新公告</h2><span id="announcementUnreadText"></span></div>
      <div class="announcement-filters">
        <select id="announcementStatusFilter" aria-label="状态筛选"><option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="withdrawn">已撤回</option></select>
        <select id="announcementTypeFilter" aria-label="类型筛选"><option value="">全部类型</option>${['功能更新','问题修复','系统通知','重要公告','维护公告'].map((x) => `<option>${x}</option>`).join('')}</select>
        <input id="announcementSearch" type="search" placeholder="搜索公告标题">
        <button id="announcementReadAllBtn" type="button">全部标为已读</button>
        <button id="announcementCreateBtn" class="super-only" type="button">新建公告</button>
      </div>
      <div id="announcementStats" class="announcement-stats super-only"></div>
    </div>
    <div id="announcementList" class="announcement-list"></div>`;
  document.querySelector('main').appendChild(view);
  ['announcementStatusFilter', 'announcementTypeFilter', 'announcementSearch'].forEach((id) => { $(id).oninput = renderAdminAnnouncements; });
  $('announcementReadAllBtn').onclick = () => markAllAdminAnnouncementsRead().catch((error) => showToast(error.message, 'error'));
  // This view is created after the initial role pass, so apply the super-admin
  // visibility rule here as well. The API enforces the same permission server-side.
  $('announcementCreateBtn').hidden = !isSuper();
  $('announcementStats').hidden = !isSuper();
  $('announcementCreateBtn').onclick = () => {
    if (isSuper()) openAnnouncementEditor();
  };
  return view;
}

function announcementStatusLabel(value) {
  return { draft: '草稿', published: '已发布', withdrawn: '已撤回' }[value] || value || '草稿';
}

function safeAnnouncementMarkdown(source) {
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  let html = '';
  let list = '';
  const inline = (value) => escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[color=(red|orange|green|blue|highlight)\]([\s\S]*?)\[\/color\]/g, '<span class="notice-color-$1">$2</span>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const closeList = () => { if (list) { html += `</${list}>`; list = ''; } };
  lines.forEach((line) => {
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (heading) { closeList(); html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; return; }
    if (ordered || unordered) {
      const kind = ordered ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        list = kind;
        if (ordered) {
          // Preserve the number typed by the author when a nested bullet list
          // or a blank line starts a new ordered-list segment.
          const start = Math.max(1, Math.min(10000, Number(ordered[1]) || 1));
          html += `<ol start="${start}">`;
        } else {
          html += '<ul>';
        }
      }
      html += `<li>${inline(ordered ? ordered[2] : unordered[1])}</li>`;
      return;
    }
    closeList();
    if (line.trim()) html += `<p>${inline(line)}</p>`;
  });
  closeList();
  return html;
}

function renderAdminAnnouncements() {
  ensureAdminAnnouncementView();
  const badge = $('announcementUnreadBadge');
  if (badge) { badge.textContent = String(state.announcementUnreadCount); badge.hidden = state.announcementUnreadCount <= 0; }
  $('announcementUnreadText').textContent = state.announcementUnreadCount ? `${state.announcementUnreadCount} 条未读` : '全部已读';
  const drafts = state.announcements.filter((x) => x.status === 'draft').length;
  const published = state.announcements.filter((x) => x.status === 'published').length;
  $('announcementStats').textContent = `草稿 ${drafts} · 已发布 ${published}`;
  const status = $('announcementStatusFilter').value;
  const type = $('announcementTypeFilter').value;
  const keyword = $('announcementSearch').value.trim().toLowerCase();
  const rows = state.announcements.filter((item) => (!status || item.status === status) && (!type || item.type === type) && (!keyword || String(item.title || '').toLowerCase().includes(keyword)));
  $('announcementList').innerHTML = rows.length ? rows.map((item) => `
    <article class="announcement-row ${item.read ? '' : 'unread'}" data-announcement-id="${escapeAttr(item.id)}">
      <button class="announcement-row-main" type="button" data-announcement-open="${escapeAttr(item.id)}">
        <span class="announcement-unread-dot" aria-hidden="true"></span>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.summary || '暂无摘要')}</small></span>
      </button>
      <div class="announcement-meta"><span>${escapeHtml(item.version || '无版本号')}</span><span>${escapeHtml(item.type)}</span><span>${escapeHtml(item.importance)}</span><span>${escapeHtml(announcementStatusLabel(item.status))}</span><span>${escapeHtml(formatDateTime(item.publish_time || item.updated_time))}</span><span>${escapeHtml(item.author || '')}</span>${isSuper() && item.readCount != null ? `<span>已读 ${item.readCount} 人${item.readUsers?.length ? `：${escapeHtml(item.readUsers.map(x => x.username || x.userId).join('、'))}` : ''}</span>` : ''}</div>
      ${isSuper() ? `<div class="announcement-admin-actions"><button type="button" data-announcement-edit="${escapeAttr(item.id)}">编辑</button>${item.status === 'published' ? `<button type="button" data-announcement-withdraw="${escapeAttr(item.id)}">撤回</button>` : `<button type="button" data-announcement-publish="${escapeAttr(item.id)}">发布</button>`}<button class="danger" type="button" data-announcement-delete="${escapeAttr(item.id)}">删除</button>${announcementMailButton(item)}</div>` : ''}
    </article>`).join('') : '<div class="announcement-empty panel">没有符合条件的公告</div>';
  document.querySelectorAll('[data-announcement-open]').forEach((button) => { button.onclick = () => openAnnouncementDetail(button.dataset.announcementOpen); });
  document.querySelectorAll('[data-announcement-edit]').forEach((button) => { button.onclick = () => openAnnouncementEditor(state.announcements.find((x) => x.id === button.dataset.announcementEdit)); });
  document.querySelectorAll('[data-announcement-publish]').forEach((button) => { button.onclick = () => announcementAction(button.dataset.announcementPublish, 'publish'); });
  document.querySelectorAll('[data-announcement-withdraw]').forEach((button) => { button.onclick = () => announcementAction(button.dataset.announcementWithdraw, 'withdraw'); });
  document.querySelectorAll('[data-announcement-delete]').forEach((button) => { button.onclick = () => deleteAdminAnnouncement(button.dataset.announcementDelete); });
  document.querySelectorAll('[data-announcement-mail]').forEach((button) => { button.onclick = () => openAnnouncementMail(button.dataset.announcementMail); });
}

function announcementMailState(item) {
  if (!item || item.status === 'draft') return '草稿公告不可推送。';
  if (item.status === 'withdrawn') return '公告已撤回，暂不可推送。';
  if (item.status !== 'published') return '公告未发布，暂不可推送。';
  if (item.enabled === false) return '公告已停用，暂不可推送。';
  const publish = Date.parse(item.publish_time || '');
  if (Number.isFinite(publish) && publish > Date.now()) return '公告尚未到发布时间。';
  const expire = Date.parse(item.expire_time || '');
  if (Number.isFinite(expire) && expire <= Date.now()) return '公告已过期，暂不可推送。';
  return '';
}

function announcementMailButton(item) {
  const reason = announcementMailState(item);
  return `<button type="button" data-announcement-mail="${escapeAttr(item.id)}" ${reason ? `disabled title="${escapeAttr(reason)}"` : ''}>邮箱推送</button>`;
}

function announcementMailUserState(user) {
  if (user?.active === false) return '账号已停用';
  const email = String(user?.email || '').trim();
  if (!email) return '未绑定邮箱';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱地址无效';
  return '';
}

function ensureAnnouncementMailModal() {
  let overlay = $('announcementMailOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'announcementMailOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal-card announcement-mail-card" role="dialog" aria-modal="true" aria-labelledby="announcementMailTitle">
    <div class="panel-head"><div><h2 id="announcementMailTitle">邮箱推送</h2><small id="announcementMailStatus"></small></div><button id="announcementMailClose" type="button">关闭</button></div>
    <div class="announcement-mail-tools"><input id="announcementMailSearch" type="search" placeholder="搜索用户名、显示名称或邮箱"><button id="announcementMailSelectAll" type="button">全选当前结果</button><button id="announcementMailClear" type="button">全部取消</button></div>
    <div id="announcementMailUsers" class="announcement-mail-users"></div>
    <div id="announcementMailResult" class="announcement-mail-result" hidden></div>
    <div class="announcement-mail-footer"><strong id="announcementMailCount">已选择 0 人，可发送 0 个邮箱</strong><div class="button-pair"><button id="announcementMailCancel" type="button">取消</button><button id="announcementMailConfirm" type="button" disabled>确认推送</button></div></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay._selected = new Set();
  overlay._busy = false;
  overlay._completed = false;
  const close = () => { if (!overlay._busy) overlay.hidden = true; };
  $('announcementMailClose').onclick = close;
  $('announcementMailCancel').onclick = close;
  $('announcementMailSearch').oninput = renderAnnouncementMailUsers;
  $('announcementMailSelectAll').onclick = () => {
    announcementMailVisibleUsers().forEach((user) => { if (!announcementMailUserState(user)) overlay._selected.add(user.id); });
    renderAnnouncementMailUsers();
  };
  $('announcementMailClear').onclick = () => { overlay._selected.clear(); renderAnnouncementMailUsers(); };
  $('announcementMailConfirm').onclick = () => confirmAnnouncementMail();
  return overlay;
}

function announcementMailVisibleUsers() {
  const query = String($('announcementMailSearch')?.value || '').trim().toLowerCase();
  return state.users.filter((user) => !query || `${user.username || ''} ${user.displayName || ''} ${user.email || ''}`.toLowerCase().includes(query));
}

function renderAnnouncementMailUsers() {
  const overlay = ensureAnnouncementMailModal();
  const rows = announcementMailVisibleUsers();
  $('announcementMailUsers').innerHTML = rows.length ? rows.map((user) => {
    const reason = announcementMailUserState(user);
    const email = String(user.email || '').trim();
    return `<label class="announcement-mail-user ${reason ? 'is-disabled' : ''}">
      <input type="checkbox" data-announcement-mail-user="${escapeAttr(user.id)}" ${overlay._selected.has(user.id) ? 'checked' : ''} ${reason || overlay._busy || overlay._completed ? 'disabled' : ''}>
      <span><strong>${escapeHtml(user.username || '')}</strong><small>用户名</small></span>
      <span><strong>${escapeHtml(user.displayName || user.username || '')}</strong><small>显示名称</small></span>
      <span><strong>${escapeHtml(email || '未绑定邮箱')}</strong><small>${escapeHtml(reason || '邮箱')}</small></span>
      <span><strong>${escapeHtml(user.roleLabel || (user.role === 'super' ? '总管理员' : (user.role === 'agent' ? '代理' : '普通用户')))}</strong><small>账号角色</small></span>
    </label>`;
  }).join('') : '<div class="announcement-mail-empty">没有符合条件的用户</div>';
  $('announcementMailUsers').querySelectorAll('[data-announcement-mail-user]').forEach((input) => {
    input.onchange = () => { if (input.checked) overlay._selected.add(input.dataset.announcementMailUser); else overlay._selected.delete(input.dataset.announcementMailUser); renderAnnouncementMailUsers(); };
  });
  const count = overlay._selected.size;
  $('announcementMailCount').textContent = `已选择 ${count} 人，可发送 ${count} 个邮箱`;
  $('announcementMailConfirm').disabled = count === 0 || overlay._busy || overlay._completed;
  $('announcementMailSelectAll').disabled = overlay._busy || overlay._completed;
  $('announcementMailClear').disabled = overlay._busy || overlay._completed || count === 0;
  $('announcementMailSearch').disabled = overlay._busy || overlay._completed;
  $('announcementMailClose').disabled = overlay._busy;
  $('announcementMailCancel').disabled = overlay._busy;
}

async function openAnnouncementMail(id) {
  if (!isSuper()) return;
  const item = state.announcements.find((entry) => entry.id === id);
  const reason = announcementMailState(item);
  if (!item || reason) { showToast(reason || '公告不存在。', 'error'); return; }
  if (!state.users.length) await loadUsers();
  const overlay = ensureAnnouncementMailModal();
  overlay.dataset.announcementId = id;
  overlay._selected = new Set();
  overlay._busy = false;
  overlay._completed = false;
  $('announcementMailTitle').textContent = item.title || '更新公告';
  $('announcementMailStatus').textContent = `公告状态：${announcementStatusLabel(item.status)}`;
  $('announcementMailSearch').value = '';
  $('announcementMailResult').hidden = true;
  $('announcementMailResult').innerHTML = '';
  $('announcementMailConfirm').textContent = '确认推送';
  renderAnnouncementMailUsers();
  overlay.hidden = false;
}

async function confirmAnnouncementMail() {
  const overlay = ensureAnnouncementMailModal();
  if (overlay._busy || overlay._completed || !overlay._selected.size) return;
  const item = state.announcements.find((entry) => entry.id === overlay.dataset.announcementId);
  const userIds = [...overlay._selected];
  if (!item || !window.confirm(`确定将《${item.title || '更新公告'}》推送给 ${userIds.length} 位用户吗？`)) return;
  overlay._busy = true;
  $('announcementMailConfirm').textContent = '推送中...';
  renderAnnouncementMailUsers();
  try {
    const result = await api(`/api/admin/announcements/${encodeURIComponent(item.id)}/mail`, { method: 'POST', body: JSON.stringify({ userIds }) });
    overlay._completed = true;
    const failures = Array.isArray(result.failures) ? result.failures : [];
    $('announcementMailResult').innerHTML = `<strong>${escapeHtml(result.message || '')}</strong>${failures.length ? `<ul>${failures.map((failure) => { const user = state.users.find((entry) => entry.id === failure.userId); return `<li>${escapeHtml(user?.username || failure.userId)}：${escapeHtml(failure.reason || '发送失败')}</li>`; }).join('')}</ul>` : ''}`;
    $('announcementMailResult').hidden = false;
    showToast(result.message || '邮件推送完成。', result.failed ? 'warn' : 'success');
  } catch (error) {
    $('announcementMailResult').textContent = error.message || '邮件推送失败，请稍后重试。';
    $('announcementMailResult').hidden = false;
    showToast(error.message || '邮件推送失败。', 'error');
  } finally {
    overlay._busy = false;
    $('announcementMailConfirm').textContent = overlay._completed ? '推送完成' : '确认推送';
    renderAnnouncementMailUsers();
  }
}

function ensureAnnouncementDetailModal() {
  let overlay = $('announcementDetailOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'announcementDetailOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal-card announcement-detail-card" role="dialog" aria-modal="true" aria-labelledby="announcementDetailTitle" tabindex="-1"><div class="panel-head"><div><h2 id="announcementDetailTitle">更新公告</h2><p>公告详情</p></div><button type="button" data-close aria-label="关闭公告详情">关闭</button></div><div id="announcementDetailBody"></div></div>`;
  document.body.appendChild(overlay);
  wireAnnouncementDialog(overlay, '[data-close]');
  overlay.querySelector('[data-close]').onclick = () => closeAnnouncementDialog(overlay);
  return overlay;
}

async function openAnnouncementDetail(id) {
  const item = state.announcements.find((x) => x.id === id);
  if (!item) return;
  const overlay = ensureAnnouncementDetailModal();
  $('announcementDetailBody').innerHTML = `<div class="announcement-detail-head"><span>${escapeHtml(item.type)}</span><span>${escapeHtml(item.importance)}</span><span>${escapeHtml(item.version || '无版本号')}</span></div><h2>${escapeHtml(item.title)}</h2><small>${escapeHtml(formatDateTime(item.publish_time || item.updated_time))} · ${escapeHtml(item.author || '')}</small><p class="announcement-summary">${escapeHtml(item.summary || '')}</p><div class="announcement-content">${safeAnnouncementMarkdown(item.content)}</div>`;
  openAnnouncementDialog(overlay, '[data-close]');
  if (!item.read) await markAdminAnnouncementRead(id);
}

function wireAnnouncementDialog(overlay, initialFocusSelector) {
  if (overlay._announcementDialogWired) return;
  overlay._announcementDialogWired = true;
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAnnouncementDialog(overlay);
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = overlay.querySelector('[role="dialog"]');
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  overlay._announcementInitialFocus = initialFocusSelector;
}

function openAnnouncementDialog(overlay, initialFocusSelector = '[data-close]') {
  overlay._announcementReturnFocus = document.activeElement;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.querySelector(initialFocusSelector)?.focus());
}

function closeAnnouncementDialog(overlay) {
  overlay.hidden = true;
  const returnFocus = overlay._announcementReturnFocus;
  if (returnFocus?.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
}

function applyAnnouncementFormat(prefix, suffix = prefix) {
  const input = $('announcementContentInput');
  const start = input.selectionStart; const end = input.selectionEnd;
  input.setRangeText(`${prefix}${input.value.slice(start, end)}${suffix}`, start, end, 'select');
  updateAnnouncementPreview(); input.focus();
}

function ensureAnnouncementEditor() {
  let overlay = $('announcementEditorOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'announcementEditorOverlay';
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="modal-card announcement-editor-card" role="dialog" aria-modal="true" aria-labelledby="announcementEditorTitle" tabindex="-1"><div class="announcement-editor-head"><div class="panel-head"><div><h2 id="announcementEditorTitle">新建公告</h2><p>填写公告信息、编写更新内容并检查预览</p></div><button type="button" data-close aria-label="关闭公告编辑器">关闭</button></div></div><div class="announcement-editor-scroll"><section class="announcement-editor-fields" aria-label="公告基本信息">
    <label class="announcement-title-field">公告标题<input id="announcementTitleInput" maxlength="160" autocomplete="off"></label><label>版本号<input id="announcementVersionInput" maxlength="80" autocomplete="off"></label>
    <label>公告类型<select id="announcementTypeInput">${['功能更新','问题修复','系统通知','重要公告','维护公告'].map((x) => `<option>${x}</option>`).join('')}</select></label><label>重要程度<select id="announcementImportanceInput"><option>普通</option><option>重要</option><option>紧急</option></select></label>
    <label class="announcement-summary-field">简短摘要<textarea id="announcementSummaryInput" rows="2" maxlength="500"></textarea></label>
    <label class="toggle-line announcement-popup-toggle"><input id="announcementPopupInput" type="checkbox" checked> 登录后自动弹出（每位用户仅一次）</label><p class="announcement-popup-hint">已展示的公告仍可在公告列表中查看。</p>
    <label>发布时间<input id="announcementPublishTimeInput" type="datetime-local"></label><label>过期时间<input id="announcementExpireTimeInput" type="datetime-local"></label>
  </section><section class="announcement-editor-workspace" aria-label="公告正文编辑与预览"><div class="announcement-editor-compose"><div class="announcement-editor-section-head"><label for="announcementContentInput">更新内容</label><span>支持 Markdown 格式</span></div>
    <div class="announcement-editor-tools" role="toolbar" aria-label="正文格式工具"><button type="button" data-format="heading">小标题</button><button type="button" data-format="bold" aria-label="加粗"><b>B</b></button><button type="button" data-format="ordered">有序列表</button><button type="button" data-format="unordered">无序列表</button><button type="button" data-format="link">链接</button><button type="button" class="announcement-color-red" data-format="color-red">红色重点</button><button type="button" class="announcement-color-orange" data-format="color-orange">橙色重点</button><button type="button" class="announcement-color-green" data-format="color-green">绿色重点</button><button type="button" class="announcement-color-blue" data-format="color-blue">蓝色重点</button><button type="button" class="announcement-color-highlight" data-format="color-highlight">文字高亮</button></div>
    <textarea id="announcementContentInput" rows="16" aria-label="更新公告正文" placeholder="写下本次更新内容"></textarea></div><div class="announcement-editor-preview-wrap"><div class="announcement-editor-section-head"><strong>预览</strong><span>发布后的显示效果</span></div><div id="announcementPreview" class="announcement-content announcement-preview" role="region" aria-label="公告预览"></div></div>
  </section></div><div class="announcement-editor-footer"><span>发布前请检查标题、版本和正文内容</span><div class="button-pair"><button id="announcementSaveDraftBtn" type="button">保存草稿</button><button id="announcementPublishBtn" type="button">发布公告</button></div></div></div>`;
  document.body.appendChild(overlay);
  wireAnnouncementDialog(overlay, '#announcementTitleInput');
  overlay.querySelector('[data-close]').onclick = () => closeAnnouncementDialog(overlay);
  $('announcementContentInput').oninput = updateAnnouncementPreview;
  overlay.querySelectorAll('[data-format]').forEach((button) => { button.onclick = () => {
    const type = button.dataset.format;
    if (type === 'heading') applyAnnouncementFormat('## ', '');
    if (type === 'bold') applyAnnouncementFormat('**');
    if (type === 'ordered') applyAnnouncementFormat('1. ', '');
    if (type === 'unordered') applyAnnouncementFormat('- ', '');
    if (type === 'link') applyAnnouncementFormat('[', '](https://)');
    if (type.indexOf('color-') === 0) applyAnnouncementFormat(`[color=${type.slice(6)}]`, '[/color]');
  }; });
  $('announcementSaveDraftBtn').onclick = () => saveAdminAnnouncement(false).catch((error) => showToast(error.message, 'error'));
  $('announcementPublishBtn').onclick = () => saveAdminAnnouncement(true).catch((error) => showToast(error.message, 'error'));
  return overlay;
}

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function openAnnouncementEditor(item = null) {
  if (!isSuper()) {
    showToast('只有总管理员可以发布更新公告。', 'error');
    return;
  }
  const overlay = ensureAnnouncementEditor();
  overlay.dataset.announcementId = item?.id || '';
  $('announcementEditorTitle').textContent = item ? '编辑公告' : '新建公告';
  $('announcementTitleInput').value = item?.title || '';
  $('announcementVersionInput').value = item?.version || '';
  $('announcementTypeInput').value = item?.type || '功能更新';
  $('announcementImportanceInput').value = item?.importance || '普通';
  $('announcementSummaryInput').value = item?.summary || '';
  $('announcementPopupInput').checked = item?.popup_enabled !== false;
  $('announcementPublishTimeInput').value = localDateTimeValue(item?.publish_time);
  $('announcementExpireTimeInput').value = localDateTimeValue(item?.expire_time);
  $('announcementContentInput').value = item?.content || '';
  updateAnnouncementPreview(); openAnnouncementDialog(overlay, '#announcementTitleInput');
}

function updateAnnouncementPreview() { $('announcementPreview').innerHTML = safeAnnouncementMarkdown($('announcementContentInput').value); }

function announcementEditorPayload() {
  return { title: $('announcementTitleInput').value.trim(), version: $('announcementVersionInput').value.trim(), type: $('announcementTypeInput').value, importance: $('announcementImportanceInput').value, summary: $('announcementSummaryInput').value.trim(), content: $('announcementContentInput').value.trim(), popup_enabled: $('announcementPopupInput').checked, force_popup: false, publish_time: $('announcementPublishTimeInput').value ? new Date($('announcementPublishTimeInput').value).toISOString() : '', expire_time: $('announcementExpireTimeInput').value ? new Date($('announcementExpireTimeInput').value).toISOString() : '' };
}

async function saveAdminAnnouncement(publish) {
  if (!isSuper()) throw new Error('只有总管理员可以发布更新公告。');
  const overlay = ensureAnnouncementEditor(); const id = overlay.dataset.announcementId || ''; const payload = announcementEditorPayload();
  if (!payload.title || !payload.content) throw new Error('公告标题和更新内容不能为空。');
  const current = state.announcements.find((x) => x.id === id);
  if (id && current?.status === 'published') payload.renotify = window.confirm('是否将本次修改作为新通知，再次提醒所有管理员？');
  const saved = id ? await api(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }) : await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify(payload) });
  if (publish && saved.status !== 'published') await api(`/api/admin/announcements/${encodeURIComponent(saved.id)}/publish`, { method: 'POST', body: JSON.stringify({ publish_time: payload.publish_time }) });
  closeAnnouncementDialog(overlay); await refreshAdminAnnouncements(); showToast(publish ? '公告已发布。' : '公告已保存。', 'success');
}

async function announcementAction(id, action) {
  if (!isSuper()) throw new Error('只有总管理员可以修改公告。');
  await api(`/api/admin/announcements/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });
  await refreshAdminAnnouncements(); showToast(action === 'publish' ? '公告已发布。' : '公告已撤回。', 'success');
}

async function deleteAdminAnnouncement(id) {
  if (!isSuper()) throw new Error('只有总管理员可以删除公告。');
  if (!window.confirm('删除后无法恢复，确定删除该公告吗？')) return;
  await api(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await refreshAdminAnnouncements(); showToast('公告已删除。', 'success');
}

async function markAdminAnnouncementRead(id) {
  await api(`/api/admin/announcements/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
  const item = state.announcements.find((x) => x.id === id); if (item && !item.read) { item.read = true; state.announcementUnreadCount = Math.max(0, state.announcementUnreadCount - 1); }
  renderAdminAnnouncements();
}

async function markAllAdminAnnouncementsRead() {
  await api('/api/admin/announcements/read-all', { method: 'POST', body: '{}' });
  state.announcements.forEach((item) => { if (item.status === 'published') item.read = true; }); state.announcementUnreadCount = 0; renderAdminAnnouncements(); showToast('已全部标为已读。', 'success');
}

async function refreshAdminAnnouncements() { await loadAdminAnnouncementsSafe(); renderAdminAnnouncements(); }

function announcementCanAppearInPopupHistory(item) {
  if (!item || item.status !== 'published' || item.enabled === false || item.popup_enabled === false) return false;
  const publishedAt = Date.parse(item.publish_time || '');
  if (Number.isFinite(publishedAt) && publishedAt > Date.now()) return false;
  const expiresAt = Date.parse(item.expire_time || '');
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function ensureAdminAnnouncementPopup() {
  let overlay = $('adminAnnouncementPopup'); if (overlay) return overlay;
  overlay = document.createElement('div'); overlay.id = 'adminAnnouncementPopup'; overlay.className = 'modal-overlay'; overlay.hidden = true;
  overlay.innerHTML = `<div class="modal-card announcement-popup-card" role="dialog" aria-modal="true" aria-labelledby="announcementPopupTitle" tabindex="-1"><div class="announcement-popup-head"><div class="panel-head"><div><h2 id="announcementPopupTitle">版本更新公告</h2><p id="announcementPopupSummary"></p></div><button id="announcementPopupClose" type="button" aria-label="关闭公告">关闭</button></div></div><div id="announcementPopupBody"></div><div class="announcement-popup-actions"><span>公告弹出后自动记为已读，之后仍可在“更新公告”中查看。</span><button id="announcementPopupRead" type="button">我知道了</button></div></div>`;
  document.body.appendChild(overlay);
  wireAnnouncementDialog(overlay, '#announcementPopupRead');
  const closePopup = () => closeAnnouncementDialog(overlay);
  $('announcementPopupClose').onclick = closePopup;
  $('announcementPopupRead').onclick = closePopup;
  return overlay;
}

function renderAdminAnnouncementPopup() {
  const overlay = ensureAdminAnnouncementPopup();
  if (!state.announcementPopupNewItems.length || !state.announcementPopupItems.length) { overlay.hidden = true; return; }
  const newIds = new Set(state.announcementPopupNewItems.map((item) => item.id));
  $('announcementPopupSummary').textContent = `发现 ${state.announcementPopupNewItems.length} 条新公告，已合并展示未登录期间的全部更新`;
  $('announcementPopupBody').innerHTML = `<div class="announcement-popup-list">${state.announcementPopupItems.map((item) => {
    const isNew = newIds.has(item.id);
    return `<article class="announcement-popup-entry ${isNew ? 'is-new' : ''}">
      <div class="announcement-popup-version"><span class="announcement-popup-dot" aria-hidden="true"></span><strong>${escapeHtml(item.version || item.title || '更新公告')}</strong>${isNew ? '<em>本次未读</em>' : '<span>历史公告</span>'}</div>
      <div class="announcement-popup-entry-body">
        <div class="announcement-detail-head"><span>${escapeHtml(item.type)}</span><span>${escapeHtml(item.importance)}</span><span>${escapeHtml(formatDateTime(item.publish_time || item.updated_time))}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.summary ? `<p class="announcement-summary">${escapeHtml(item.summary)}</p>` : ''}
        <div class="announcement-content">${safeAnnouncementMarkdown(item.content)}</div>
      </div>
    </article>`;
  }).join('')}</div>`;
  openAnnouncementDialog(overlay, '#announcementPopupRead');
}

async function markAdminAnnouncementPopupShown() {
  if (state.announcementPopupMarking || !state.announcementPopupNewItems.length) return;
  const shown = state.announcementPopupNewItems.map((item) => ({ id: item.id, notification_revision: item.notification_revision || 1 }));
  state.announcementPopupMarking = true;
  try {
    await api('/api/admin/announcements/read-batch', { method: 'POST', body: JSON.stringify({ announcements: shown }) });
    const shownIds = new Set(shown.map((item) => item.id));
    let changed = 0;
    state.announcements.forEach((item) => { if (shownIds.has(item.id) && !item.read) { item.read = true; changed++; } });
    state.announcementUnreadCount = Math.max(0, state.announcementUnreadCount - changed);
    state.announcementPopupNewItems = [];
    renderAdminAnnouncements();
  } catch (error) {
    console.warn('更新公告自动已读失败：', error);
  } finally {
    state.announcementPopupMarking = false;
  }
}

function showAdminAnnouncementPopup() {
  if (!state.token || !state.announcementPopupNewItems.length || !state.announcementPopupItems.length) return;
  const existingNotice = $('unreadNoticeOverlay');
  if (existingNotice && !existingNotice.hidden) {
    window.setTimeout(showAdminAnnouncementPopup, 500);
    return;
  }
  renderAdminAnnouncementPopup();
  markAdminAnnouncementPopupShown();
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
if ($('loginThemeToggle')) $('loginThemeToggle').onclick = () => toggleAdminTheme();
$('targetUserSelect').onchange = async () => {
  state.templateMode = false;
  state.targetUserId = $('targetUserSelect').value;
  localStorage.setItem('toolbox_target_user', state.targetUserId);
  await loadAll();
};

$('saveAppBtn').onclick = () => saveApp().catch((error) => setStatus(error.message, true));
document.addEventListener('click', handleImageUrlAction);
$('saveAccountBtn').onclick = () => saveAccount().catch((error) => setStatus(error.message, true));
$('saveMailBtn').onclick = () => saveMailSettings().catch((error) => setStatus(error.message, true));
$('testMailBtn').onclick = () => testMailSettings().catch((error) => setStatus(error.message, true));
$('appPasswordEnabled').onchange = () => {
  $('appPassword').disabled = !$('appPasswordEnabled').checked;
};
$('toggleAppPassword').onclick = () => {
  const input = $('appPassword');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  $('toggleAppPassword').textContent = visible ? '显示' : '隐藏';
};
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-password-toggle]');
  if (!button) return;
  const input = $(button.dataset.passwordToggle);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.textContent = visible ? '显示' : '隐藏';
});
$('addScopeBtn').onclick = () => addPosition().catch((error) => setStatus(error.message, true));
$('renameScopeBtn').onclick = () => renamePosition().catch((error) => setStatus(error.message, true));
if ($('saveScopeIconBtn')) $('saveScopeIconBtn').onclick = () => savePositionIcon().catch((error) => setStatus(error.message, true));
$('moveScopeBtn').onclick = () => movePosition().catch((error) => setStatus(error.message, true));
$('deleteScopeBtn').onclick = () => deletePosition().catch((error) => setStatus(error.message, true));
$('addSectionBtn').onclick = () => addSection().catch((error) => setStatus(error.message, true));
$('renameSectionBtn').onclick = () => renameSection().catch((error) => setStatus(error.message, true));
if ($('moveSectionBtn')) $('moveSectionBtn').onclick = () => moveSection().catch((error) => setStatus(error.message, true));
$('deleteSectionBtn').onclick = () => deleteSection().catch((error) => setStatus(error.message, true));
$('addButtonBtn').onclick = () => addButton().catch((error) => setStatus(error.message, true));
$('addAction').onchange = updateAddTargetState;
$('addUserBtn').onclick = () => addUser().catch((error) => setStatus(error.message, true));
$('newUserRole').onchange = renderNewUserAgentLevel;
$('addAgentLevelBtn').onclick = () => {
  if (!state.system) return;
  const levels = agentLevelRows();
  levels.push({ id: `level-${Date.now().toString(36)}`, name: `代理级别 ${levels.length + 1}`, price: 0, sort: (levels.length + 1) * 10, enabled: true });
  state.system.agent.levels = levels;
  renderAgentLevelRows();
  renderNewUserAgentLevel();
};
$('createInviteBtn').onclick = (event) => runPaymentFlow(event.currentTarget, createInvite).catch((error) => setStatus(error.message, true));
if ($('agentRechargeBtn')) $('agentRechargeBtn').onclick = openBalanceRechargeDialog;
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
if ($('cloudResolverParseBtn')) $('cloudResolverParseBtn').onclick = () => parseCloudResolver().catch((error) => setStatus(error.message, true));
if ($('cloudResolverRefreshBtn')) $('cloudResolverRefreshBtn').onclick = () => loadAndRenderCloudResolver().catch((error) => setStatus(error.message, true));
if ($('cloudResolverResourceRefreshBtn')) $('cloudResolverResourceRefreshBtn').onclick = () => loadAndRenderCloudResolver().catch((error) => setStatus(error.message, true));
if ($('cloudResolverButtonManagerBtn')) $('cloudResolverButtonManagerBtn').onclick = () => switchView('buttons');
if ($('cloudTaskSelectAllBtn')) $('cloudTaskSelectAllBtn').onclick = () => { document.querySelectorAll('.cloud-task-check').forEach((node) => node.checked = true); };
if ($('cloudTaskSelectNoneBtn')) $('cloudTaskSelectNoneBtn').onclick = () => { document.querySelectorAll('.cloud-task-check').forEach((node) => node.checked = false); };
if ($('cloudTaskInvertBtn')) $('cloudTaskInvertBtn').onclick = () => { document.querySelectorAll('.cloud-task-check').forEach((node) => node.checked = !node.checked); };
if ($('cloudTaskBatchArchiveBtn')) $('cloudTaskBatchArchiveBtn').onclick = () => cloudTaskBatch('archive', [...document.querySelectorAll('.cloud-task-check:checked')].map((node) => node.value)).catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudTaskBatchRetryBtn')) $('cloudTaskBatchRetryBtn').onclick = () => cloudTaskBatch('retry', [...document.querySelectorAll('.cloud-task-check:checked')].map((node) => node.value)).catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudTaskBatchDeleteBtn')) $('cloudTaskBatchDeleteBtn').onclick = () => { const ids = [...document.querySelectorAll('.cloud-task-check:checked')].map((node) => node.value); if (ids.length && window.confirm('确认删除选中的解析任务吗？删除后无法从任务列表恢复，但不会删除已经添加到按钮中的下载线路。')) cloudTaskBatch('delete', ids).catch((error) => setStatus(cloudErrorMessage(error), true)); };
if ($('cloudFailedSelectAllBtn')) $('cloudFailedSelectAllBtn').onclick = () => { document.querySelectorAll('.cloud-failed-check').forEach((node) => node.checked = true); };
if ($('cloudFailedSelectNoneBtn')) $('cloudFailedSelectNoneBtn').onclick = () => { document.querySelectorAll('.cloud-failed-check').forEach((node) => node.checked = false); };
if ($('cloudFailedBatchRetryBtn')) $('cloudFailedBatchRetryBtn').onclick = () => cloudTaskBatch('retry', [...document.querySelectorAll('.cloud-failed-check:checked')].map((node) => node.value)).catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudFailedBatchDeleteBtn')) $('cloudFailedBatchDeleteBtn').onclick = () => { const ids = [...document.querySelectorAll('.cloud-failed-check:checked')].map((node) => node.value); if (ids.length && window.confirm('确认删除选中的失败任务吗？此操作不可恢复。')) cloudTaskBatch('delete', ids).catch((error) => setStatus(cloudErrorMessage(error), true)); };
if ($('cloudFailedRetryAllBtn')) $('cloudFailedRetryAllBtn').onclick = () => cloudTaskBatch('retry', (state.cloudResolver.tasks || []).filter((task) => task.status === 'failed').map((task) => task.id)).catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudFailedClearBtn')) $('cloudFailedClearBtn').onclick = () => { const ids = (state.cloudResolver.tasks || []).filter((task) => task.status === 'failed').map((task) => task.id); if (ids.length && window.confirm('确认清空全部失败任务吗？清空后无法恢复。')) cloudTaskBatch('delete', ids).catch((error) => setStatus(cloudErrorMessage(error), true)); };
if ($('cloudResolverPlansRefreshBtn')) $('cloudResolverPlansRefreshBtn').onclick = () => loadAndRenderCloudResolver().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverOrdersRefreshBtn')) $('cloudResolverOrdersRefreshBtn').onclick = () => loadAndRenderCloudResolver().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverRedeemBtn')) $('cloudResolverRedeemBtn').onclick = () => redeemCloudCode('cloudResolverRedeemCode').catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverAuthorizedRedeemBtn')) $('cloudResolverAuthorizedRedeemBtn').onclick = () => redeemCloudCode('cloudResolverAuthorizedRedeemCode').catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverRenewToggleBtn')) $('cloudResolverRenewToggleBtn').onclick = () => { $('cloudResolverRenewBody').hidden = !$('cloudResolverRenewBody').hidden; };
if ($('cloudResolverRedeemToggleBtn')) $('cloudResolverRedeemToggleBtn').onclick = () => { $('cloudResolverAuthorizedRedeemBody').hidden = !$('cloudResolverAuthorizedRedeemBody').hidden; };
if ($('cloudResolverSystemCreatePlanBtn')) $('cloudResolverSystemCreatePlanBtn').onclick = () => createCloudPlan().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('saveCloudResolverOrderExpiryBtn')) $('saveCloudResolverOrderExpiryBtn').onclick = () => saveSystemSettings('cloudResolverOrderExpiry').catch((error) => setStatus(error.message, true));
if ($('cloudResolverGenerateCodesBtn')) $('cloudResolverGenerateCodesBtn').onclick = () => generateCloudCodes().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverCopyCodesBtn')) $('cloudResolverCopyCodesBtn').onclick = () => copyCloudCodes(state.cloudResolver.codes || []).catch((error) => setStatus(error.message, true));
if ($('cloudResolverExportCodesBtn')) $('cloudResolverExportCodesBtn').onclick = () => { try { exportSelectedCloudCodes(); } catch (error) { setStatus(error.message, true); } };
if ($('cloudResolverDeleteCodesBtn')) $('cloudResolverDeleteCodesBtn').onclick = () => deleteCloudCodes(state.cloudSelectedCodeIds || []).catch((error) => setStatus(error.message, true));
if ($('cloudResolverSelectAllCodes')) $('cloudResolverSelectAllCodes').onchange = (event) => {
  state.cloudSelectedCodeIds = event.target.checked ? (state.cloudResolver.codes || []).map((code) => code.id || code.codeId || code.codeHashPrefix || '').filter(Boolean) : [];
  renderCloudResolver();
};
document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('.cloud-code-check');
  if (!checkbox) return;
  const selected = new Set(state.cloudSelectedCodeIds || []);
  if (checkbox.checked) selected.add(checkbox.value); else selected.delete(checkbox.value);
  state.cloudSelectedCodeIds = [...selected];
  const selectAll = $('cloudResolverSelectAllCodes');
  if (selectAll) selectAll.checked = (state.cloudResolver.codes || []).length > 0 && (state.cloudResolver.codes || []).every((code) => selected.has(code.id || code.codeId || code.codeHashPrefix || ''));
});
if ($('cloudResolverAgentSellBtn')) $('cloudResolverAgentSellBtn').onclick = () => sellCloudAgentCode().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverAgentRefreshBtn')) $('cloudResolverAgentRefreshBtn').onclick = () => loadAndRenderCloudResolver().catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverAgentGenerateCodesBtn')) $('cloudResolverAgentGenerateCodesBtn').onclick = (event) => runPaymentFlow(event.currentTarget, generateAgentCloudCodes).catch((error) => setStatus(cloudErrorMessage(error), true));
if ($('cloudResolverAgentCodePlan')) $('cloudResolverAgentCodePlan').onchange = renderAgentCloudCodePrice;
document.addEventListener('click', (event) => {
  const buy = event.target.closest('[data-cloud-buy]');
  if (buy) runPaymentFlow(buy, async () => {
    if (buy.dataset.cloudBuyMode === 'agent') {
      $('cloudResolverAgentCodePlan').value = buy.dataset.cloudBuy;
      renderAgentCloudCodePrice();
      await generateAgentCloudCodes();
    } else await buyCloudPlan(buy.dataset.cloudBuy, buy.dataset.cloudBuyMode === 'renew');
  }).catch((error) => setStatus(cloudErrorMessage(error), true));
  const agentOrder = event.target.closest('[data-agent-cloud-continue-order]');
  if (agentOrder) {
    const order = (state.cloudResolver.agentCodeOrders || []).find((item) => item.id === agentOrder.dataset.agentCloudContinueOrder);
    if (order?.paymentUrl) window.location.href = order.paymentUrl;
    else showToast('该订单暂时没有可用支付地址，请重新生成。', 'error');
  }
  const editPlan = event.target.closest('[data-cloud-plan-edit]');
  if (editPlan) editCloudPlan(editPlan.dataset.cloudPlanEdit);
  const cancelPlanEdit = event.target.closest('#cloudResolverSystemCancelPlanBtn');
  if (cancelPlanEdit) resetCloudPlanEditor();
  const disable = event.target.closest('[data-cloud-plan-disable]');
  if (disable && disable.textContent !== '已停用') api('/api/admin/cloud-resolver/plans/' + encodeURIComponent(disable.dataset.cloudPlanDisable), { method: 'PATCH', body: JSON.stringify({ enabled: false }) }).then(loadAndRenderCloudResolver).catch((error) => setStatus(cloudErrorMessage(error), true));
  const deletePlan = event.target.closest('[data-cloud-plan-delete]');
  if (deletePlan && window.confirm('确认删除该已停用套餐吗？')) api('/api/admin/cloud-resolver/plans/' + encodeURIComponent(deletePlan.dataset.cloudPlanDelete), { method: 'DELETE' }).then(loadAndRenderCloudResolver).catch((error) => setStatus(cloudErrorMessage(error), true));
  const cloudCopy = event.target.closest('[data-cloud-copy-code]');
  if (cloudCopy && cloudCopy.dataset.cloudCopyCode) copyText(cloudCopy.dataset.cloudCopyCode).catch((error) => setStatus(error.message, true));
  const agentCodeCopy = event.target.closest('[data-cloud-copy-agent-code]');
  if (agentCodeCopy && agentCodeCopy.dataset.cloudCopyAgentCode) copyText(agentCodeCopy.dataset.cloudCopyAgentCode).catch((error) => setStatus(error.message, true));
  const codeStatus = event.target.closest('[data-cloud-code-status]');
  if (codeStatus) setCloudCodeStatus(codeStatus.dataset.cloudCodeId, codeStatus.dataset.cloudCodeStatus).catch((error) => setStatus(cloudErrorMessage(error), true));
  const deleteCode = event.target.closest('[data-cloud-delete-code]');
  if (deleteCode) deleteCloudCodes([deleteCode.dataset.cloudDeleteCode]).catch((error) => setStatus(cloudErrorMessage(error), true));
});
if ($('cloudResolverScopeId')) $('cloudResolverScopeId').onchange = () => renderCloudResolver();
if ($('cloudResolverSaveSettingsBtn')) $('cloudResolverSaveSettingsBtn').onclick = async () => {
  const payload = { enabled: $('cloudResolverEnabled').checked, qaiuApiBase: $('cloudResolverQaiuApiBase').value.trim(), settings: { dailyParseLimit: Number($('cloudResolverDailyLimit').value), maxRetries: Number($('cloudResolverRetries').value) } };
  const apiKey = $('cloudResolverQaiuApiKey').value.trim();
  if (apiKey) payload.qaiuApiKey = apiKey;
  else if ($('cloudResolverClearQaiuApiKey').checked) payload.clearQaiuApiKey = true;
  try { await api('/api/admin/cloud-resolver/settings', { method: 'PATCH', body: JSON.stringify(payload) }); $('cloudResolverQaiuApiKey').value = ''; $('cloudResolverClearQaiuApiKey').checked = false; await loadAndRenderCloudResolver(); showToast('网盘解析设置已保存。', 'success'); } catch (error) { setStatus(cloudErrorMessage(error), true); }
};
document.addEventListener('click', (event) => {
  const assign = event.target.closest('[data-cloud-assign]'); if (assign) assignCloudTask(assign.dataset.cloudAssign).catch((error) => setStatus(error.message, true));
  const retry = event.target.closest('[data-cloud-retry]'); if (retry) api('/api/cloud-resolver/parse-tasks/' + encodeURIComponent(retry.dataset.cloudRetry) + '/retry', { method: 'POST', body: '{}' }).then(loadAndRenderCloudResolver).catch((error) => setStatus(error.message, true));
  const archive = event.target.closest('[data-cloud-archive]'); if (archive) api('/api/cloud-resolver/parse-tasks/' + encodeURIComponent(archive.dataset.cloudArchive) + '/archive', { method: 'POST', body: '{}' }).then(loadAndRenderCloudResolver).catch((error) => setStatus(cloudErrorMessage(error), true));
  const deleteTask = event.target.closest('[data-cloud-delete-task]'); if (deleteTask && window.confirm('确认删除这个解析任务吗？已添加到按钮中的下载线路不会被删除。')) api('/api/cloud-resolver/parse-tasks/' + encodeURIComponent(deleteTask.dataset.cloudDeleteTask), { method: 'DELETE' }).then(loadAndRenderCloudResolver).catch((error) => setStatus(cloudErrorMessage(error), true));
  const download = event.target.closest('[data-cloud-download]'); if (download) startCloudDownload(download.dataset.cloudDownload).catch((error) => setStatus(error.message, true));
  const refresh = event.target.closest('[data-cloud-refresh-source]'); if (refresh) refreshCloudSource(refresh.dataset.cloudRefreshSource).catch((error) => setStatus(error.message, true));
  const remove = event.target.closest('[data-cloud-delete-source]'); if (remove) deleteCloudSource(remove.dataset.cloudDeleteSource).catch((error) => setStatus(error.message, true));
});
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
if ($('saveCloudResolverDiagnosticsBtn')) $('saveCloudResolverDiagnosticsBtn').onclick = () => saveCloudResolverDiagnostics().catch((error) => setStatus(error.message, true));
if ($('loadCloudResolverDiagnosticsBtn')) $('loadCloudResolverDiagnosticsBtn').onclick = () => loadCloudResolverDiagnostics().catch((error) => setStatus(error.message, true));
if ($('downloadCloudResolverDiagnosticsBtn')) $('downloadCloudResolverDiagnosticsBtn').onclick = () => downloadCloudResolverDiagnostics().catch((error) => setStatus(error.message, true));
if ($('copyCloudResolverDiagnosticsBtn')) $('copyCloudResolverDiagnosticsBtn').onclick = () => copyCloudResolverDiagnostics().catch((error) => setStatus(error.message, true));
if ($('clearCloudResolverDiagnosticsBtn')) $('clearCloudResolverDiagnosticsBtn').onclick = () => clearCloudResolverDiagnostics().catch((error) => setStatus(error.message, true));
if ($('addBuiltinFunctionBtn')) $('addBuiltinFunctionBtn').onclick = addBuiltinFunctionRow;
if ($('saveBuiltinFunctionsBtn')) $('saveBuiltinFunctionsBtn').onclick = () => saveBuiltinFunctions().catch((error) => setStatus(error.message, true));
if ($('saveClientVariantsBtn')) $('saveClientVariantsBtn').onclick = () => saveClientVariants().catch((error) => setStatus(error.message, true));
if ($('saveEsportsAudioModuleBtn')) $('saveEsportsAudioModuleBtn').onclick = () => saveEsportsAudioModule().catch((error) => setStatus(error.message, true));
if ($('uploadMenuIconFolderBtn')) $('uploadMenuIconFolderBtn').onclick = () => uploadMenuIconFolder().catch((error) => setStatus(error.message, true));
if ($('saveMenuIconsBtn')) $('saveMenuIconsBtn').onclick = () => saveMenuIcons().catch((error) => setStatus(error.message, true));
if ($('addIconPicker')) initButtonIconPicker(document, $('addIcon'), $('addIcon'));
if ($('addMenuIconFolderBtn')) $('addMenuIconFolderBtn').onclick = () => { try { addMenuIconFolder(); } catch (error) { setStatus(error.message, true); } };
if ($('saveIntegritySettingsBtn')) $('saveIntegritySettingsBtn').onclick = () => saveSystemSettings('integrity').catch((error) => setStatus(error.message, true));
bindPopupSettingsActions();
if ($('saveAgentSettingsBtn')) $('saveAgentSettingsBtn').onclick = () => saveSystemSettings('agent').catch((error) => setStatus(error.message, true));
if ($('savePaySettingsBtn')) $('savePaySettingsBtn').onclick = () => saveSystemSettings('pay').catch((error) => setStatus(error.message, true));
if ($('editTemplateBtn')) $('editTemplateBtn').onclick = () => toggleTemplateMode().catch((error) => setStatus(error.message, true));
if ($('copyCurrentToTemplateBtn')) $('copyCurrentToTemplateBtn').onclick = () => copyCurrentToTemplate().catch((error) => setStatus(error.message, true));
if ($('resetTemplateBtn')) $('resetTemplateBtn').onclick = () => resetTemplate().catch((error) => setStatus(error.message, true));
if ($('refreshOrdersBtn')) $('refreshOrdersBtn').onclick = () => refreshOrders().catch((error) => setStatus(error.message, true));
if ($('cloudResolverAdminRefreshOrdersBtn')) $('cloudResolverAdminRefreshOrdersBtn').onclick = () => refreshOrders().catch((error) => setStatus(error.message, true));
if ($('selectAllCloudOrders')) $('selectAllCloudOrders').onchange = (event) => {
  const ids = (state.orders || []).filter((order) => ['cloud_resolver_plan_purchase', 'cloud_resolver_code_generate'].includes(order.action)).map((order) => String(order.id || '')).filter(Boolean);
  state.cloudOrderSelectedIds = event.target.checked ? new Set(ids) : new Set();
  renderOrders();
};
if ($('deleteAllCloudOrdersBtn')) $('deleteAllCloudOrdersBtn').onclick = () => deleteCloudOrderGroup('all').catch((error) => setStatus(error.message, true));
if ($('deleteCompletedCloudOrdersBtn')) $('deleteCompletedCloudOrdersBtn').onclick = () => deleteCloudOrderGroup('completed').catch((error) => setStatus(error.message, true));
if ($('deleteExpiredCloudOrdersBtn')) $('deleteExpiredCloudOrdersBtn').onclick = () => deleteCloudOrderGroup('expired').catch((error) => setStatus(error.message, true));
if ($('deleteSelectedCloudOrdersBtn')) $('deleteSelectedCloudOrdersBtn').onclick = () => deleteCloudOrderGroup('selected').catch((error) => setStatus(error.message, true));
if ($('cloudResolverSelectAllOrders')) $('cloudResolverSelectAllOrders').onchange = (event) => {
  const ids = (state.cloudResolver?.orders || []).map((order) => String(order.id || '')).filter(Boolean);
  state.cloudResolverAdminSelectedOrderIds = event.target.checked ? new Set(ids) : new Set();
  renderCloudOrders();
};
if ($('cloudResolverDeleteAllOrdersBtn')) $('cloudResolverDeleteAllOrdersBtn').onclick = () => deleteCloudOrderGroup('all', state.cloudResolverAdminSelectedOrderIds).catch((error) => setStatus(error.message, true));
if ($('cloudResolverDeleteCompletedOrdersBtn')) $('cloudResolverDeleteCompletedOrdersBtn').onclick = () => deleteCloudOrderGroup('completed', state.cloudResolverAdminSelectedOrderIds).catch((error) => setStatus(error.message, true));
if ($('cloudResolverDeleteExpiredOrdersBtn')) $('cloudResolverDeleteExpiredOrdersBtn').onclick = () => deleteCloudOrderGroup('expired', state.cloudResolverAdminSelectedOrderIds).catch((error) => setStatus(error.message, true));
if ($('cloudResolverDeleteSelectedOrdersBtn')) $('cloudResolverDeleteSelectedOrdersBtn').onclick = () => deleteCloudOrderGroup('selected', state.cloudResolverAdminSelectedOrderIds).catch((error) => setStatus(error.message, true));
document.querySelectorAll('input[name="buttonContentLayout"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (input.checked) saveButtonContentLayout(input.value);
  });
});

loadAll().catch((error) => handleLoadFailure(error, isAuthFailure(error)));
updateAddTargetState();
