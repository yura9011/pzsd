const state = {
  activeFile: 'ini',
  files: new Map(),
  pendingChanges: null,
};

const elements = {
  settings: document.querySelector('#settings'),
  editorError: document.querySelector('#editor-error'),
  title: document.querySelector('#file-title'),
  search: document.querySelector('#setting-search'),
  changeCount: document.querySelector('#change-count'),
  reviewSave: document.querySelector('#review-save'),
  reloadFile: document.querySelector('#reload-file'),
  backups: document.querySelector('#backups'),
  refreshBackups: document.querySelector('#refresh-backups'),
  diffDialog: document.querySelector('#diff-dialog'),
  diffList: document.querySelector('#diff-list'),
  confirmSave: document.querySelector('#confirm-save'),
  flash: document.querySelector('#flash'),
  restartBanner: document.querySelector('#restart-banner'),
  serviceUnit: document.querySelector('#service-unit'),
  serviceState: document.querySelector('#service-state'),
  serviceDetail: document.querySelector('#service-detail'),
  refreshStatus: document.querySelector('#refresh-status'),
  restartServer: document.querySelector('#restart-server'),
  bannerRestart: document.querySelector('#banner-restart'),
};

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => selectFile(tab.dataset.file));
}

elements.search.addEventListener('input', applySearch);
elements.reviewSave.addEventListener('click', reviewChanges);
elements.confirmSave.addEventListener('click', saveReviewedChanges);
elements.reloadFile.addEventListener('click', () => loadFile(state.activeFile, true));
elements.refreshBackups.addEventListener('click', () => loadBackups(state.activeFile));
elements.refreshStatus.addEventListener('click', loadServiceStatus);
elements.restartServer.addEventListener('click', restartServer);
elements.bannerRestart.addEventListener('click', restartServer);

await Promise.all([
  loadFile('ini'),
  loadFile('sandbox'),
  loadServiceStatus(),
]);
await loadBackups(state.activeFile);
renderActiveFile();

async function selectFile(file) {
  state.activeFile = file;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.file === file);
  });
  if (!state.files.has(file)) {
    await loadFile(file, true);
  }
  renderActiveFile();
  await loadBackups(file);
}

async function loadFile(file, forceRender = false) {
  try {
    const data = await requestJson(`/api/config/${file}`);
    state.files.set(file, data);
    if (file === state.activeFile || forceRender) {
      hideEditorError();
      renderActiveFile();
    }
  } catch (error) {
    if (file === state.activeFile || forceRender) {
      showEditorError(error.message);
    }
  }
}

function renderActiveFile() {
  const file = state.files.get(state.activeFile);
  elements.search.value = '';
  if (!file) {
    elements.title.textContent = 'Config unavailable';
    elements.settings.innerHTML = '<p class="empty-state">The file has not loaded yet.</p>';
    updateChangeState();
    return;
  }

  elements.title.textContent = file.filename;
  const groups = groupSettings(file);
  elements.settings.innerHTML = groups.map(([group, settings]) => `
    <section class="setting-group">
      <header>
        <h3>${escapeHtml(group)}</h3>
        <span>${settings.length} settings</span>
      </header>
      <div class="setting-list">
        ${settings.map(([key, value, meta]) => settingRow(key, value, meta)).join('')}
      </div>
    </section>
  `).join('');

  for (const input of elements.settings.querySelectorAll('[data-key]')) {
    input.addEventListener('input', () => {
      input.dataset.dirty = 'true';
      updateChangeState();
    });
    input.addEventListener('change', () => {
      input.dataset.dirty = 'true';
      updateChangeState();
    });
  }

  updateChangeState();
}

function groupSettings(file) {
  const groups = new Map();
  for (const [key, value] of Object.entries(file.settings)) {
    const meta = file.metadata[key];
    const group = meta.group || 'Other';
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push([key, value, meta]);
  }
  return [...groups.entries()];
}

function settingRow(key, value, meta) {
  const searchText = `${meta.label} ${key} ${meta.description} ${meta.group}`.toLowerCase();
  return `
    <article class="setting" data-search="${escapeAttribute(searchText)}">
      <div class="setting-copy">
        <label for="${controlId(key)}">${escapeHtml(meta.label)}</label>
        <code>${escapeHtml(key)}</code>
        <p>${escapeHtml(meta.description)}</p>
      </div>
      <div class="setting-control">
        ${controlFor(key, value, meta)}
        ${meta.readOnly ? '<small>Read-only in V1</small>' : ''}
        ${meta.sensitive ? `<small>${meta.hasValue ? 'Existing value is hidden until replaced.' : 'No value is set.'}</small>` : ''}
      </div>
    </article>
  `;
}

function controlFor(key, value, meta) {
  const attributes = [
    `id="${controlId(key)}"`,
    `data-key="${escapeAttribute(key)}"`,
    meta.readOnly ? 'disabled' : '',
  ].filter(Boolean).join(' ');

  if (meta.type === 'boolean') {
    return `
      <label class="toggle">
        <input type="checkbox" ${attributes} ${asBoolean(value) ? 'checked' : ''}>
        <span>${asBoolean(value) ? 'Enabled' : 'Disabled'}</span>
      </label>
    `;
  }

  if (meta.type === 'enum') {
    const currentValue = String(value);
    const options = meta.options.some((option) => option.value === currentValue)
      ? meta.options
      : [{ value: currentValue, label: `Current value: ${currentValue}` }, ...meta.options];
    return `
      <select ${attributes}>
        ${options.map((option) => `
          <option value="${escapeAttribute(option.value)}" ${currentValue === option.value ? 'selected' : ''}>
            ${escapeHtml(option.label)}
          </option>
        `).join('')}
      </select>
    `;
  }

  if (meta.type === 'textarea') {
    return `<textarea rows="3" ${attributes}>${escapeHtml(String(value ?? ''))}</textarea>`;
  }

  const type = meta.sensitive ? 'password' : meta.type === 'number' ? 'number' : 'text';
  const numeric = meta.type === 'number'
    ? `${meta.min !== undefined ? `min="${meta.min}"` : ''} ${meta.max !== undefined ? `max="${meta.max}"` : ''} step="any"`
    : '';
  const placeholder = meta.sensitive && meta.hasValue ? 'Leave blank to keep current value' : '';
  const visibleValue = meta.sensitive ? '' : String(value ?? '');
  return `<input type="${type}" value="${escapeAttribute(visibleValue)}" placeholder="${escapeAttribute(placeholder)}" ${numeric} ${attributes}>`;
}

function collectChanges() {
  const file = state.files.get(state.activeFile);
  if (!file) {
    return {};
  }

  const changes = {};
  for (const control of elements.settings.querySelectorAll('[data-key]')) {
    const key = control.dataset.key;
    const meta = file.metadata[key];
    if (meta.readOnly) {
      continue;
    }

    const value = readControlValue(control, meta);
    if (meta.sensitive) {
      if (control.dataset.dirty === 'true') {
        changes[key] = value;
      }
      continue;
    }

    if (!sameValue(value, file.settings[key], meta)) {
      changes[key] = value;
    }
  }

  return changes;
}

function updateChangeState() {
  const count = Object.keys(collectChanges()).length;
  elements.changeCount.textContent = count === 0
    ? 'No pending changes'
    : `${count} pending ${count === 1 ? 'change' : 'changes'}`;
  elements.reviewSave.disabled = count === 0;
}

function reviewChanges() {
  const file = state.files.get(state.activeFile);
  const changes = collectChanges();
  const keys = Object.keys(changes);
  if (!file || keys.length === 0) {
    return;
  }

  state.pendingChanges = changes;
  elements.diffList.innerHTML = keys.map((key) => {
    const meta = file.metadata[key];
    return `
      <article class="diff-row">
        <div>
          <strong>${escapeHtml(meta.label)}</strong>
          <code>${escapeHtml(key)}</code>
        </div>
        <dl>
          <div><dt>Current</dt><dd>${diffValue(file.settings[key], meta, false)}</dd></div>
          <div><dt>Next</dt><dd>${diffValue(changes[key], meta, true)}</dd></div>
        </dl>
      </article>
    `;
  }).join('');
  elements.diffDialog.showModal();
}

async function saveReviewedChanges() {
  const file = state.files.get(state.activeFile);
  if (!file || !state.pendingChanges) {
    return;
  }

  elements.confirmSave.disabled = true;
  try {
    const saved = await requestJson(`/api/config/${state.activeFile}`, {
      method: 'PATCH',
      body: JSON.stringify({
        revision: file.revision,
        changes: state.pendingChanges,
      }),
    });
    state.files.set(state.activeFile, saved);
    state.pendingChanges = null;
    elements.diffDialog.close();
    renderActiveFile();
    await loadBackups(state.activeFile);
    showRestartBanner();
    showFlash(`${saved.filename} saved. ${saved.changedKeys.length} setting changes were written.`, 'ok');
  } catch (error) {
    showFlash(error.message, 'error');
  } finally {
    elements.confirmSave.disabled = false;
  }
}

async function loadBackups(file) {
  try {
    const data = await requestJson(`/api/config/backups?file=${file}`);
    renderBackups(data.backups);
  } catch (error) {
    elements.backups.innerHTML = `<p class="error-copy">${escapeHtml(error.message)}</p>`;
  }
}

function renderBackups(backups) {
  if (backups.length === 0) {
    elements.backups.innerHTML = '<p class="empty-state">No backups for this file yet.</p>';
    return;
  }

  elements.backups.innerHTML = backups.map((backup) => `
    <article class="backup-item">
      <div>
        <strong>${escapeHtml(formatDate(backup.createdAt))}</strong>
        <code>${escapeHtml(backup.id)}</code>
        <span>${formatBytes(backup.size)}</span>
      </div>
      <button type="button" class="quiet-button" data-restore="${escapeAttribute(backup.id)}">Restore</button>
    </article>
  `).join('');

  for (const button of elements.backups.querySelectorAll('[data-restore]')) {
    button.addEventListener('click', () => restoreBackup(button.dataset.restore));
  }
}

async function restoreBackup(backupId) {
  if (!window.confirm('Restore this config backup? The current file will be backed up first.')) {
    return;
  }

  try {
    const restored = await requestJson(`/api/config/backups/${encodeURIComponent(backupId)}/restore`, {
      method: 'POST',
    });
    state.files.set(restored.file, restored);
    if (restored.file === state.activeFile) {
      renderActiveFile();
    }
    await loadBackups(state.activeFile);
    showRestartBanner();
    showFlash(`${restored.filename} restored from backup.`, 'ok');
  } catch (error) {
    showFlash(error.message, 'error');
  }
}

async function loadServiceStatus() {
  try {
    const status = await requestJson('/api/server/status');
    elements.serviceUnit.textContent = status.unit;
    elements.serviceState.textContent = status.online ? 'Online' : 'Offline';
    elements.serviceState.dataset.state = status.online ? 'online' : 'offline';
    elements.serviceDetail.textContent = status.available
      ? `systemd: ${status.activeState} / ${status.subState}`
      : 'systemd status unavailable';
    elements.restartServer.disabled = !status.available;
    elements.bannerRestart.disabled = !status.available;
    if (!status.available && status.error) {
      showFlash(status.error, 'error');
    }
  } catch (error) {
    elements.serviceState.textContent = 'Offline';
    elements.serviceState.dataset.state = 'offline';
    elements.serviceDetail.textContent = 'systemd status unavailable';
    elements.restartServer.disabled = true;
    elements.bannerRestart.disabled = true;
    showFlash(error.message, 'error');
  }
}

async function restartServer() {
  if (!window.confirm('Restart the Project Zomboid service now? Connected players may be disconnected.')) {
    return;
  }

  elements.restartServer.disabled = true;
  elements.bannerRestart.disabled = true;
  try {
    const data = await requestJson('/api/server/restart', { method: 'POST' });
    elements.restartBanner.hidden = true;
    showFlash(`Restart requested for ${data.status.unit}.`, 'ok');
    await loadServiceStatus();
  } catch (error) {
    showFlash(error.message, 'error');
    await loadServiceStatus();
  }
}

function readControlValue(control, meta) {
  if (meta.type === 'boolean') {
    return control.checked;
  }
  if (meta.type === 'number') {
    return control.value;
  }
  return control.value;
}

function sameValue(left, right, meta) {
  if (meta.type === 'boolean') {
    return asBoolean(left) === asBoolean(right);
  }

  if (meta.type === 'number' && left !== '' && right !== '') {
    return Number(left) === Number(right);
  }

  return String(left ?? '') === String(right ?? '');
}

function applySearch() {
  const search = elements.search.value.trim().toLowerCase();
  for (const setting of elements.settings.querySelectorAll('.setting')) {
    setting.hidden = Boolean(search) && !setting.dataset.search.includes(search);
  }
  for (const group of elements.settings.querySelectorAll('.setting-group')) {
    group.hidden = !group.querySelector('.setting:not([hidden])');
  }
}

function showRestartBanner() {
  elements.restartBanner.hidden = false;
}

function showEditorError(message) {
  elements.editorError.textContent = message;
  elements.editorError.hidden = false;
}

function hideEditorError() {
  elements.editorError.hidden = true;
  elements.editorError.textContent = '';
}

function showFlash(message, tone) {
  elements.flash.textContent = message;
  elements.flash.dataset.tone = tone;
  elements.flash.hidden = false;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `${response.status} ${response.statusText}`);
  }
  return body;
}

function diffValue(value, meta, next) {
  if (meta.sensitive) {
    return next ? '<span class="secret">replacement hidden</span>' : '<span class="secret">existing value hidden</span>';
  }
  return `<code>${escapeHtml(String(value ?? ''))}</code>`;
}

function asBoolean(value) {
  return value === true || value === 'true';
}

function controlId(key) {
  return `setting-${key.replaceAll('.', '-')}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
