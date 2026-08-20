/* Text Review Studio v1 – show the restored previous workspace behind a startup keep/discard dialog. */
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

  function preferredWorkspace(entries = readWorkspaceEntries()) {
    const current = entries.find(([key]) => key === STORAGE_KEY);
    const selected = current || entries[0];
    if (!selected) return null;
    const data = parseJSON(selected[1]);
    return data && typeof data === 'object' ? data : null;
  }

  function workspaceText(data) {
    if (!data || typeof data !== 'object') return { before: '', after: '' };
    return {
      before: typeof data.before === 'string' ? data.before : typeof data.baseline === 'string' ? data.baseline : '',
      after: typeof data.after === 'string' ? data.after : typeof data.working === 'string' ? data.working : ''
    };
  }

  function hasWorkspaceContent(data) {
    const { before, after } = workspaceText(data);
    if (before.trim() || after.trim()) return true;
    if (Array.isArray(data?.cmsHistory) && data.cmsHistory.length) return true;
    if (data?.title && data.title !== '名称未設定の原稿') return true;
    return false;
  }

  function hasSessionHistory() {
    const parsed = parseJSON(sessionStorage.getItem(HISTORY_KEY), []);
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

  function recoverStagedBackup() {
    const backup = parseJSON(localStorage.getItem(BACKUP_KEY));
    if (!backup || !Array.isArray(backup.workspaceEntries)) {
      localStorage.removeItem(BACKUP_KEY);
      sessionStorage.removeItem(KEEP_ONCE_KEY);
      return;
    }

    /*
      Older startup-history-v1.js temporarily removed the live workspace before
      app hydration. Restore it immediately so the normal app hydrate() can paint
      the previous draft in the background before this dialog is shown.
    */
    [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
    backup.workspaceEntries.forEach(([key, raw]) => {
      if (typeof key === 'string' && typeof raw === 'string') localStorage.setItem(key, raw);
    });
    if (typeof backup.historyRaw === 'string' && backup.historyRaw) {
      sessionStorage.setItem(HISTORY_KEY, backup.historyRaw);
    }
    localStorage.removeItem(BACKUP_KEY);
    sessionStorage.removeItem(KEEP_ONCE_KEY);
  }

  function discardPreviousWork() {
    const data = preferredWorkspace();
    [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(BACKUP_KEY);
    sessionStorage.removeItem(KEEP_ONCE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeWorkspace(data)));
  }

  function addStyles() {
    if (document.getElementById('startupHistoryStyles')) return;
    const style = document.createElement('style');
    style.id = 'startupHistoryStyles';
    style.textContent = `
      #startupHistoryDialog {
        width:min(420px,calc(100vw - 32px));
        margin:86px 24px auto auto;
      }
      #startupHistoryDialog::backdrop {
        background:rgba(14,26,49,.12);
      }
      #startupHistoryDialog .dialog-card {
        gap:14px;
        padding:17px;
      }
      #startupHistoryDialog .startup-history-copy {
        margin:0;
        color:#53657f;
        font-size:12px;
        line-height:1.75;
      }
      #startupHistoryDialog .startup-history-note {
        margin:0;
        padding:9px 10px;
        color:#687993;
        border:1px solid #e5eaf2;
        border-radius:9px;
        font-size:10px;
        line-height:1.6;
        background:rgba(248,250,253,.96);
      }
      #startupHistoryDialog .startup-history-delete {
        color:#9b3041;
        border-color:#e5c8cf;
        background:#fff;
      }
      #startupHistoryDialog .startup-history-delete:hover {
        color:#842638;
        border-color:#d8aeb8;
        background:#fff7f8;
      }
      @media (max-width:760px) {
        #startupHistoryDialog {
          width:calc(100vw - 18px);
          margin:auto 9px 9px;
          border-radius:16px;
        }
        #startupHistoryDialog::backdrop {
          background:rgba(14,26,49,.08);
        }
        #startupHistoryDialog .dialog-actions {
          display:grid;
          grid-template-columns:1fr;
        }
        #startupHistoryDialog .dialog-actions button {
          min-height:44px;
        }
        #startupHistoryKeep { order:-1; }
      }
    `;
    document.head.appendChild(style);
  }

  function showDialog() {
    if (document.getElementById('startupHistoryDialog')) return;

    const data = preferredWorkspace();
    if (!hasWorkspaceContent(data) && !hasSessionHistory()) return;

    addStyles();
    const dialog = document.createElement('dialog');
    dialog.id = 'startupHistoryDialog';
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', 'startupHistoryTitle');
    dialog.setAttribute('aria-describedby', 'startupHistoryDescription');
    dialog.innerHTML = `
      <div class="dialog-card">
        <header class="dialog-head">
          <div><small>PREVIOUS SESSION</small><h2 id="startupHistoryTitle">前回の内容をどうしますか？</h2></div>
        </header>
        <p id="startupHistoryDescription" class="startup-history-copy">前回の原稿を背景に表示しています。内容を確認して選択してください。</p>
        <p class="startup-history-note">「このまま残す」で続きから開始。「削除して新しく始める」で原稿と操作履歴だけを消します。表示設定は引き継ぎます。</p>
        <footer class="dialog-actions">
          <button id="startupHistoryDelete" class="secondary-button startup-history-delete" type="button">削除して新しく始める</button>
          <button id="startupHistoryKeep" class="primary-button" type="button">このまま残す</button>
        </footer>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener('cancel', (event) => event.preventDefault());

    dialog.querySelector('#startupHistoryKeep').addEventListener('click', () => {
      dialog.close();
      dialog.remove();
    });

    dialog.querySelector('#startupHistoryDelete').addEventListener('click', () => {
      try {
        discardPreviousWork();
      } catch (_) {
        [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
        sessionStorage.removeItem(HISTORY_KEY);
        localStorage.removeItem(BACKUP_KEY);
        sessionStorage.removeItem(KEEP_ONCE_KEY);
      }
      window.location.reload();
    });

    dialog.showModal();
    window.requestAnimationFrame(() => dialog.querySelector('#startupHistoryKeep')?.focus());
  }

  function scheduleDialogAfterAppBoot() {
    const schedule = () => window.setTimeout(showDialog, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
    else schedule();
  }

  try {
    recoverStagedBackup();
    scheduleDialogAfterAppBoot();
  } catch (_) {
    // Storage or dialog support can be unavailable. The app remains usable with its normal startup flow.
  }
})();
