/* Text Review Studio v1 – ask whether to restore or discard the previous workspace before app hydration. */
(() => {
  'use strict';

  const STORAGE_KEY = 'text-review-studio-v1';
  const LEGACY_KEYS = [
    'text-review-studio-v0.6.3',
    'text-review-studio-v0.6.2',
    'text-review-studio-v0.6.1',
    'text-review-studio-v0.6.0'
  ];
  const HISTORY_KEY = 'text-review-studio-v1-replace-history';
  const BACKUP_KEY = 'text-review-studio-v1-startup-backup';
  const KEEP_ONCE_KEY = 'text-review-studio-v1-startup-keep-once';
  const DEFAULT_DISPLAY = { showTags: false, showWhitespace: false, highlightUrls: false };
  const DEFAULT_COMPARE = { ignoreHtmlTags: true };

  function parseJSON(raw, fallback = null) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function readWorkspaceEntries() {
    const entries = [];
    [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw) entries.push([key, raw]);
    });
    return entries;
  }

  function preferredWorkspace(entries) {
    const current = entries.find(([key]) => key === STORAGE_KEY);
    const selected = current || entries[0];
    if (!selected) return null;
    const data = parseJSON(selected[1]);
    return data && typeof data === 'object' ? data : null;
  }

  function hasWorkspaceContent(data) {
    if (!data || typeof data !== 'object') return false;
    const before = typeof data.before === 'string' ? data.before : typeof data.baseline === 'string' ? data.baseline : '';
    const after = typeof data.after === 'string' ? data.after : typeof data.working === 'string' ? data.working : '';
    if (before.trim() || after.trim()) return true;
    if (Array.isArray(data.cmsHistory) && data.cmsHistory.length) return true;
    if (data.title && data.title !== '名称未設定の原稿') return true;
    return false;
  }

  function hasSessionHistory(raw) {
    const parsed = parseJSON(raw, []);
    return Array.isArray(parsed) && parsed.length > 0;
  }

  function sanitizeWorkspace(data) {
    const displaySource = data?.displayOptions || data?.display || {};
    return {
      schemaVersion: 1,
      before: '',
      after: '',
      mode: 'edit',
      compareOptions: { ...DEFAULT_COMPARE, ...(data?.compareOptions || {}) },
      displayOptions: { ...DEFAULT_DISPLAY, ...displaySource },
      updatedAt: new Date().toISOString()
    };
  }

  function loadBackup() {
    const backup = parseJSON(localStorage.getItem(BACKUP_KEY));
    if (!backup || !Array.isArray(backup.workspaceEntries)) return null;
    return backup;
  }

  function buildBackup() {
    return {
      workspaceEntries: readWorkspaceEntries(),
      historyRaw: sessionStorage.getItem(HISTORY_KEY) || '',
      createdAt: new Date().toISOString()
    };
  }

  function clearLiveWorkspace() {
    [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem(HISTORY_KEY);
  }

  function stageBackup(backup) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      clearLiveWorkspace();
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreBackup(backup) {
    clearLiveWorkspace();
    backup.workspaceEntries.forEach(([key, raw]) => {
      if (typeof key === 'string' && typeof raw === 'string') localStorage.setItem(key, raw);
    });
    if (backup.historyRaw) sessionStorage.setItem(HISTORY_KEY, backup.historyRaw);
    localStorage.removeItem(BACKUP_KEY);
  }

  function discardBackup(backup) {
    clearLiveWorkspace();
    const data = preferredWorkspace(backup.workspaceEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeWorkspace(data)));
    localStorage.removeItem(BACKUP_KEY);
  }

  function addStyles() {
    if (document.getElementById('startupHistoryStyles')) return;
    const style = document.createElement('style');
    style.id = 'startupHistoryStyles';
    style.textContent = `
      #startupHistoryDialog .dialog-card { gap:16px; }
      #startupHistoryDialog .startup-history-copy { margin:0; color:#5f6f86; font-size:12px; line-height:1.8; }
      #startupHistoryDialog .startup-history-note { margin:0; padding:10px 11px; color:#728098; border-radius:9px; font-size:10px; line-height:1.6; background:#f5f7fb; }
      #startupHistoryDialog .startup-history-delete { color:#9b3041; border-color:#e5c8cf; background:#fff; }
      #startupHistoryDialog .startup-history-delete:hover { color:#842638; border-color:#d8aeb8; background:#fff7f8; }
      @media (max-width:760px) {
        #startupHistoryDialog .dialog-actions { display:grid; grid-template-columns:1fr 1fr; }
        #startupHistoryDialog .dialog-actions button { min-height:42px; }
      }
    `;
    document.head.appendChild(style);
  }

  function showDialog(backup, staged) {
    addStyles();
    const dialog = document.createElement('dialog');
    dialog.id = 'startupHistoryDialog';
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', 'startupHistoryTitle');
    dialog.setAttribute('aria-describedby', 'startupHistoryDescription');
    dialog.innerHTML = `
      <div class="dialog-card">
        <header class="dialog-head">
          <div><small>PREVIOUS SESSION</small><h2 id="startupHistoryTitle">前回履歴を削除しますか？</h2></div>
        </header>
        <p id="startupHistoryDescription" class="startup-history-copy">前回の原稿・比較内容・操作履歴が保存されています。</p>
        <p class="startup-history-note">「残す」で前回の続きから開始。「削除する」で原稿と操作履歴だけを消し、表示設定などは引き継ぎます。</p>
        <footer class="dialog-actions">
          <button id="startupHistoryDelete" class="secondary-button startup-history-delete" type="button">削除する</button>
          <button id="startupHistoryKeep" class="primary-button" type="button">残す</button>
        </footer>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener('cancel', (event) => event.preventDefault());

    dialog.querySelector('#startupHistoryKeep').addEventListener('click', () => {
      if (staged) {
        restoreBackup(backup);
        sessionStorage.setItem(KEEP_ONCE_KEY, '1');
        window.location.reload();
        return;
      }
      dialog.close();
      dialog.remove();
    });

    dialog.querySelector('#startupHistoryDelete').addEventListener('click', () => {
      try {
        discardBackup(backup);
      } catch (_) {
        clearLiveWorkspace();
        localStorage.removeItem(BACKUP_KEY);
      }
      window.location.reload();
    });

    dialog.showModal();
    window.requestAnimationFrame(() => dialog.querySelector('#startupHistoryKeep')?.focus());
  }

  try {
    if (sessionStorage.getItem(KEEP_ONCE_KEY) === '1') {
      sessionStorage.removeItem(KEEP_ONCE_KEY);
      return;
    }

    let backup = loadBackup();
    let staged = Boolean(backup);
    if (!backup) backup = buildBackup();

    const data = preferredWorkspace(backup.workspaceEntries);
    if (!hasWorkspaceContent(data) && !hasSessionHistory(backup.historyRaw)) {
      if (staged) localStorage.removeItem(BACKUP_KEY);
      return;
    }

    if (!staged) staged = stageBackup(backup);
    showDialog(backup, staged);
  } catch (_) {
    // Storage or dialog support can be unavailable. In that case, fall back to the app's existing startup flow.
  }
})();
