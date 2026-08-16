(function () {
  'use strict';

  // Only run on Jira issue browse pages
  const issueMatch = window.location.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)/i);
  if (!issueMatch) return;
  const issueKey = issueMatch[1].toUpperCase();

  // Prevent double-injection on SPA navigations
  if (document.getElementById('jtl-fab')) return;

  // --- Styles (scoped to jtl-* to avoid conflicts with Jira's CSS) ---
  const style = document.createElement('style');
  style.textContent = `
    #jtl-fab {
      position: fixed;
      bottom: 80px;
      right: 28px;
      z-index: 9998;
      background: #14b8a6;
      color: #fff;
      border: none;
      border-radius: 22px;
      padding: 10px 18px 10px 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 4px 16px rgba(20,184,166,0.45);
      transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
      letter-spacing: 0.01em;
    }
    #jtl-fab:hover {
      background: #0d9488;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(20,184,166,0.5);
    }
    #jtl-fab:active {
      transform: translateY(0);
    }
    #jtl-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: jtl-fade-in 0.15s ease;
    }
    @keyframes jtl-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    #jtl-modal {
      background: #ffffff;
      border-radius: 14px;
      padding: 24px;
      width: 380px;
      max-width: calc(100vw - 32px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.12);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: jtl-slide-up 0.18s ease;
    }
    @keyframes jtl-slide-up {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .jtl-modal-header {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 20px;
    }
    .jtl-modal-icon {
      width: 32px;
      height: 32px;
      background: rgba(20,184,166,0.12);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .jtl-modal-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #17213a;
      line-height: 1.2;
    }
    .jtl-modal-issue {
      font-size: 12px;
      color: #14b8a6;
      font-weight: 600;
      margin-top: 1px;
    }
    .jtl-field {
      margin-bottom: 14px;
    }
    .jtl-field label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #56637d;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 5px;
    }
    .jtl-field input,
    .jtl-field textarea {
      width: 100%;
      padding: 8px 11px;
      border: 1.5px solid #dde3ee;
      border-radius: 8px;
      font-size: 14px;
      color: #17213a;
      background: #f5f7fb;
      box-sizing: border-box;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
      -webkit-appearance: none;
    }
    .jtl-field input:focus,
    .jtl-field textarea:focus {
      border-color: #14b8a6;
      background: #fff;
      box-shadow: 0 0 0 3px rgba(20,184,166,0.15);
    }
    .jtl-field textarea {
      resize: vertical;
      min-height: 68px;
      line-height: 1.4;
    }
    .jtl-hint {
      font-size: 11px;
      color: #8793ab;
      margin-top: 3px;
    }
    .jtl-row {
      display: flex;
      gap: 10px;
    }
    .jtl-row .jtl-field {
      flex: 1;
    }
    #jtl-msg {
      font-size: 13px;
      padding: 9px 12px;
      border-radius: 8px;
      margin-bottom: 14px;
      display: none;
      line-height: 1.4;
    }
    #jtl-msg.jtl-success {
      display: block;
      background: #e4f8ea;
      color: #16a34a;
    }
    #jtl-msg.jtl-error {
      display: block;
      background: #fdeceb;
      color: #dc2626;
    }
    .jtl-actions {
      display: flex;
      gap: 8px;
    }
    #jtl-submit {
      flex: 1;
      padding: 10px;
      background: #14b8a6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }
    #jtl-submit:hover:not(:disabled) {
      background: #0d9488;
    }
    #jtl-submit:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    #jtl-cancel {
      padding: 10px 18px;
      background: #f5f7fb;
      color: #56637d;
      border: 1.5px solid #dde3ee;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;
    }
    #jtl-cancel:hover {
      background: #e7ebf4;
    }
  `;
  document.head.appendChild(style);

  // --- FAB ---
  const fab = document.createElement('button');
  fab.id = 'jtl-fab';
  fab.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
    Log Time
  `;
  document.body.appendChild(fab);
  fab.addEventListener('click', openModal);

  // Re-inject FAB on Jira SPA navigations
  let lastPath = window.location.pathname;
  const navObserver = new MutationObserver(() => {
    if (window.location.pathname === lastPath) return;
    lastPath = window.location.pathname;
    const existingFab = document.getElementById('jtl-fab');
    if (existingFab) existingFab.remove();
    const newMatch = window.location.pathname.match(/^\/browse\/([A-Z][A-Z0-9_]*-\d+)/i);
    if (newMatch) {
      const newFab = document.createElement('button');
      newFab.id = 'jtl-fab';
      newFab.innerHTML = fab.innerHTML;
      document.body.appendChild(newFab);
      newFab.addEventListener('click', () => openModalForKey(newMatch[1].toUpperCase()));
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  // --- Modal ---
  function openModal() {
    openModalForKey(issueKey);
  }

  function openModalForKey(key) {
    if (document.getElementById('jtl-backdrop')) return;

    const today = new Date().toISOString().split('T')[0];

    const backdrop = document.createElement('div');
    backdrop.id = 'jtl-backdrop';
    backdrop.innerHTML = `
      <div id="jtl-modal" role="dialog" aria-modal="true" aria-label="Log Time">
        <div class="jtl-modal-header">
          <div class="jtl-modal-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <div class="jtl-modal-title">Log Time</div>
            <div class="jtl-modal-issue">${key}</div>
          </div>
        </div>

        <div class="jtl-row">
          <div class="jtl-field">
            <label>Time Spent</label>
            <input type="text" id="jtl-time" placeholder="2h, 1h 30m, 45m" autocomplete="off" />
          </div>
          <div class="jtl-field">
            <label>Date</label>
            <input type="date" id="jtl-date" value="${today}" />
          </div>
        </div>
        <p class="jtl-hint" style="margin-top:-8px; margin-bottom:14px;">Accepted formats: 2h, 1h 30m, 45m, 1d</p>

        <div class="jtl-field">
          <label>Comment <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <textarea id="jtl-comment" placeholder="What did you work on?"></textarea>
        </div>

        <div id="jtl-msg"></div>

        <div class="jtl-actions">
          <button id="jtl-submit">Log Time</button>
          <button id="jtl-cancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.getElementById('jtl-time').focus();

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.getElementById('jtl-cancel').addEventListener('click', closeModal);
    document.getElementById('jtl-submit').addEventListener('click', () => submitLog(key));
    document.addEventListener('keydown', handleKey);
  }

  function closeModal() {
    const backdrop = document.getElementById('jtl-backdrop');
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', handleKey);
  }

  function handleKey(e) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.target && e.target.id === 'jtl-time') {
      const key = document.querySelector('.jtl-modal-issue')?.textContent;
      if (key) submitLog(key);
    }
  }

  async function submitLog(key) {
    const timeEl = document.getElementById('jtl-time');
    const dateEl = document.getElementById('jtl-date');
    const commentEl = document.getElementById('jtl-comment');
    const submitBtn = document.getElementById('jtl-submit');
    const msg = document.getElementById('jtl-msg');

    const timeSpent = timeEl.value.trim();
    const date = dateEl.value;
    const comment = commentEl.value.trim();

    msg.className = '';

    if (!timeSpent) {
      msg.textContent = 'Please enter time spent (e.g. 2h, 45m).';
      msg.className = 'jtl-error';
      timeEl.focus();
      return;
    }
    if (!date) {
      msg.textContent = 'Please select a date.';
      msg.className = 'jtl-error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging…';

    try {
      const creds = await new Promise((resolve) => {
        chrome.storage.local.get(['jiraUrl', 'email', 'token'], resolve);
      });

      if (!creds.jiraUrl || !creds.email || !creds.token) {
        throw new Error('Credentials not set — open the Jira Time Logger extension to configure them.');
      }

      // Format started timestamp at noon local time (avoids timezone-drift date shifts)
      const [yr, mo, dy] = date.split('-').map(Number);
      const d = new Date(yr, mo - 1, dy, 12, 0, 0, 0);
      const off = -d.getTimezoneOffset();
      const sign = off >= 0 ? '+' : '-';
      const absOff = Math.abs(off);
      const oh = String(Math.floor(absOff / 60)).padStart(2, '0');
      const om = String(absOff % 60).padStart(2, '0');
      const started = `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}T12:00:00.000${sign}${oh}${om}`;

      const auth = btoa(`${creds.email}:${creds.token}`);
      const body = {
        timeSpent,
        started,
        comment: {
          type: 'doc', version: 1,
          content: comment
            ? [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }]
            : [],
        },
      };

      const res = await fetch(`${creds.jiraUrl}/rest/api/3/issue/${key}/worklog`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        let detail = errText;
        try { detail = JSON.parse(errText).errorMessages?.join(' ') || errText; } catch (_) {}
        throw new Error(detail || `HTTP ${res.status}`);
      }

      // Bust the extension's persistent worklog cache so the Dashboard refreshes
      chrome.storage.local.get(null, (items) => {
        const toRemove = Object.keys(items).filter(k => k.startsWith('wlCache_'));
        if (toRemove.length > 0) chrome.storage.local.remove(toRemove);
      });

      msg.textContent = `✓ Logged ${timeSpent} to ${key}`;
      msg.className = 'jtl-success';
      submitBtn.textContent = 'Logged!';

      setTimeout(closeModal, 1800);
    } catch (err) {
      msg.textContent = err.message || 'Failed to log time. Check your connection and try again.';
      msg.className = 'jtl-error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log Time';
    }
  }
})();
