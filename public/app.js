const AUTH_TOKEN_KEY = 'pz-panel-token';

const state = {
  activeFile: 'ini',
  files: new Map(),
  mods: null,
  modDraft: null,
  pendingChanges: null,
  groupStates: new Map(),
};

let isLoginShowing = false;

const elements = {
  settings: document.querySelector('#settings'),
  editorError: document.querySelector('#editor-error'),
  title: document.querySelector('#file-title'),
  configTools: document.querySelector('#config-tools'),
  search: document.querySelector('#setting-search'),
  expandGroups: document.querySelector('#expand-groups'),
  collapseGroups: document.querySelector('#collapse-groups'),
  changeCount: document.querySelector('#change-count'),
  saveNote: document.querySelector('#save-note'),
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
  loginDialog: document.querySelector('#login-dialog'),
  loginForm: document.querySelector('#login-form'),
  loginUsername: document.querySelector('#login-username'),
  loginPassword: document.querySelector('#login-password'),
  loginError: document.querySelector('#login-error'),
  loginSubmit: document.querySelector('#login-submit'),
};

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => selectFile(tab.dataset.file));
}

elements.search.addEventListener('input', applySearch);
elements.expandGroups.addEventListener('click', () => setAllGroupsOpen(true));
elements.collapseGroups.addEventListener('click', () => setAllGroupsOpen(false));
elements.reviewSave.addEventListener('click', reviewChanges);
elements.confirmSave.addEventListener('click', saveReviewedChanges);
elements.reloadFile.addEventListener('click', reloadActiveSurface);
elements.refreshBackups.addEventListener('click', () => loadBackups(backupFileForSurface(state.activeFile)));
elements.refreshStatus.addEventListener('click', loadServiceStatus);
elements.restartServer.addEventListener('click', restartServer);
elements.bannerRestart.addEventListener('click', restartServer);

function getToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* localStorage unavailable */
  }
}

function clearToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

function showLogin(message) {
  if (isLoginShowing) {
    return;
  }
  isLoginShowing = true;
  elements.loginUsername.value = '';
  elements.loginPassword.value = '';
  elements.loginError.hidden = true;
  elements.loginError.textContent = '';
  elements.loginSubmit.disabled = false;
  if (message) {
    elements.loginError.textContent = message;
    elements.loginError.hidden = false;
  }
  elements.loginDialog.showModal();
}

function hideLogin() {
  isLoginShowing = false;
  elements.loginDialog.close();
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  if (!username || !password) {
    return;
  }

  elements.loginSubmit.disabled = true;
  elements.loginError.hidden = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Login failed.');
    }
    setToken(body.token);
    hideLogin();
    initPanel();
  } catch (error) {
    elements.loginError.textContent = error.message || 'Login failed.';
    elements.loginError.hidden = false;
    elements.loginSubmit.disabled = false;
  }
});

initPanel();

async function initPanel() {
  const token = getToken();
  if (token) {
    try {
      await requestJson('/api/auth/check');
    } catch {
      return;
    }
  } else {
    showLogin();
    return;
  }

  await Promise.all([
    loadFile('ini'),
    loadFile('sandbox'),
    loadServiceStatus(),
  ]);
  await loadBackups(state.activeFile);
  renderActiveFile();
}

async function selectFile(file) {
  state.activeFile = file;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.file === file);
  });

  if (file === 'mods' && !state.mods) {
    await loadMods(true);
  } else if (file !== 'mods' && !state.files.has(file)) {
    await loadFile(file, true);
  }

  renderActiveFile();
  await loadBackups(backupFileForSurface(file));
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

async function loadMods(forceRender = false) {
  try {
    const data = await requestJson('/api/mods');
    state.mods = data;
    state.modDraft = draftFromMods(data);
    if (state.activeFile === 'mods' || forceRender) {
      hideEditorError();
      renderActiveFile();
    }
  } catch (error) {
    if (state.activeFile === 'mods' || forceRender) {
      showEditorError(error.message);
    }
  }
}

async function reloadActiveSurface() {
  state.pendingChanges = null;
  if (state.activeFile === 'mods') {
    await loadMods(true);
    await loadBackups('ini');
    return;
  }

  await loadFile(state.activeFile, true);
}

function renderActiveFile() {
  if (state.activeFile === 'mods') {
    renderMods();
    return;
  }

  const file = state.files.get(state.activeFile);
  elements.search.value = '';
  elements.configTools.hidden = false;
  elements.saveNote.textContent = 'Only existing keys are written. Mods use the dedicated editor.';
  if (!file) {
    elements.title.textContent = 'Config unavailable';
    elements.settings.innerHTML = '<p class="empty-state">The file has not loaded yet.</p>';
    updateChangeState();
    return;
  }

  elements.title.textContent = file.filename;
  const groups = groupSettings(file);
  const totalSettings = groups.reduce((count, [, settings]) => count + settings.length, 0);
  elements.settings.innerHTML = groups.map(([group, settings], index) => `
    <details class="setting-group" data-group="${escapeAttribute(group)}" ${groupOpenAttribute(state.activeFile, group, groups.length, totalSettings, index)}>
      <summary>
        <h3>${escapeHtml(group)}</h3>
        <span class="group-meta">
          <span>${settings.length} settings</span>
          <strong class="group-dirty" data-group-dirty hidden></strong>
        </span>
      </summary>
      <div class="setting-list">
        ${settings.map(([key, value, meta]) => settingRow(key, value, meta)).join('')}
      </div>
    </details>
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

  for (const group of elements.settings.querySelectorAll('.setting-group')) {
    group.addEventListener('toggle', () => {
      if (!elements.search.value.trim()) {
        setGroupOpenState(state.activeFile, group.dataset.group, group.open);
      }
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

function renderMods() {
  elements.search.value = '';
  elements.configTools.hidden = true;
  elements.saveNote.textContent = 'This write updates WorkshopItems and Mods in server.ini together.';

  if (!state.mods || !state.modDraft) {
    elements.title.textContent = 'Mods unavailable';
    elements.settings.innerHTML = '<p class="empty-state">The mods lists have not loaded yet.</p>';
    updateChangeState();
    return;
  }

  elements.title.textContent = `${state.mods.filename} mods`;
  elements.settings.innerHTML = `
    <section class="mods-editor">
      <div class="mod-warning">
        <strong>Map mods need a separate check.</strong>
        <span>This editor writes only WorkshopItems and Mods. Update Map separately when a mod requires map folders.</span>
      </div>
      <div class="mod-list-grid">
        ${modListEditor(
          'workshopItems',
          'Workshop IDs',
          'Steam Workshop items the server downloads.',
          state.modDraft.workshopItems,
        )}
        ${modListEditor(
          'mods',
          'Mod IDs',
          'Project Zomboid mod IDs the server loads.',
          state.modDraft.mods,
        )}
      </div>
    </section>
  `;

  for (const input of elements.settings.querySelectorAll('[data-mod-value]')) {
    input.addEventListener('input', () => {
      state.modDraft[input.dataset.modValue][Number(input.dataset.index)] = input.value;
      updateChangeState();
    });
  }

  for (const button of elements.settings.querySelectorAll('[data-mod-add]')) {
    button.addEventListener('click', () => addModItem(button.dataset.modAdd));
  }

  for (const input of elements.settings.querySelectorAll('[data-mod-new]')) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addModItem(input.dataset.modNew);
      }
    });
  }

  for (const button of elements.settings.querySelectorAll('[data-mod-remove]')) {
    button.addEventListener('click', () => removeModItem(button.dataset.modRemove, Number(button.dataset.index)));
  }

  for (const button of elements.settings.querySelectorAll('[data-mod-move]')) {
    button.addEventListener('click', () => {
      moveModItem(button.dataset.list, Number(button.dataset.index), button.dataset.modMove);
    });
  }

  updateChangeState();
}

function modListEditor(listName, title, description, values) {
  return `
    <section class="mod-list-panel">
      <header>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <strong>${values.length}</strong>
      </header>
      <div class="mod-items">
        ${values.length === 0
          ? '<p class="empty-state">No entries in this list.</p>'
          : values.map((value, index) => `
            <article class="mod-item">
              <label class="sr-only" for="${listName}-${index}">${escapeHtml(title)} item ${index + 1}</label>
              <input
                id="${listName}-${index}"
                data-mod-value="${listName}"
                data-index="${index}"
                value="${escapeAttribute(value)}"
                autocomplete="off"
              >
              <div class="mod-item-actions">
                <button
                  class="quiet-button"
                  data-mod-move="up"
                  data-list="${listName}"
                  data-index="${index}"
                  type="button"
                  ${index === 0 ? 'disabled' : ''}
                >Up</button>
                <button
                  class="quiet-button"
                  data-mod-move="down"
                  data-list="${listName}"
                  data-index="${index}"
                  type="button"
                  ${index === values.length - 1 ? 'disabled' : ''}
                >Down</button>
                <button
                  class="danger-button"
                  data-mod-remove="${listName}"
                  data-index="${index}"
                  type="button"
                >Remove</button>
              </div>
            </article>
          `).join('')}
      </div>
      <div class="mod-add-row">
        <label class="sr-only" for="new-${listName}">New ${escapeHtml(title)} item</label>
        <input id="new-${listName}" data-mod-new="${listName}" autocomplete="off" placeholder="Add ${escapeAttribute(title)} item">
        <button class="primary-button" data-mod-add="${listName}" type="button">Add</button>
      </div>
    </section>
  `;
}

function addModItem(listName) {
  const input = elements.settings.querySelector(`[data-mod-new="${listName}"]`);
  const value = input?.value.trim();
  if (!value) {
    showFlash('Enter a list item before adding it.', 'error');
    return;
  }

  state.modDraft[listName].push(value);
  renderMods();
}

function removeModItem(listName, index) {
  state.modDraft[listName].splice(index, 1);
  renderMods();
}

function moveModItem(listName, index, direction) {
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  const items = state.modDraft[listName];
  if (nextIndex < 0 || nextIndex >= items.length) {
    return;
  }

  [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
  renderMods();
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
        ${meta.readOnly ? '<small>Read-only in this editor</small>' : ''}
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
  if (state.activeFile === 'mods') {
    return collectModChanges();
  }

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
  if (state.activeFile !== 'mods') {
    updateGroupDirtyCounts();
  }
}

function reviewChanges() {
  if (state.activeFile === 'mods') {
    reviewModChanges();
    return;
  }

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
  if (state.activeFile === 'mods') {
    await saveReviewedMods();
    return;
  }

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
    if (state.activeFile === 'ini') {
      state.mods = null;
      state.modDraft = null;
    }
    await loadBackups(state.activeFile);
    showRestartBanner();
    showFlash(`${saved.filename} saved. ${saved.changedKeys.length} setting changes were written.`, 'ok');
  } catch (error) {
    showFlash(error.message, 'error');
  } finally {
    elements.confirmSave.disabled = false;
  }
}

function collectModChanges() {
  if (!state.mods || !state.modDraft) {
    return {};
  }

  const changes = {};
  if (!sameList(state.mods.workshopItems, state.modDraft.workshopItems)) {
    changes.workshopItems = [...state.modDraft.workshopItems];
  }
  if (!sameList(state.mods.mods, state.modDraft.mods)) {
    changes.mods = [...state.modDraft.mods];
  }
  return changes;
}

function reviewModChanges() {
  const changes = collectModChanges();
  const keys = Object.keys(changes);
  if (!state.mods || keys.length === 0) {
    return;
  }

  state.pendingChanges = {
    workshopItems: [...state.modDraft.workshopItems],
    mods: [...state.modDraft.mods],
  };
  elements.diffList.innerHTML = keys.map((key) => {
    const label = key === 'workshopItems' ? 'WorkshopItems' : 'Mods';
    return `
      <article class="diff-row">
        <div>
          <strong>${label}</strong>
          <code>server.ini</code>
        </div>
        <dl>
          <div><dt>Current</dt><dd>${modListDiffValue(state.mods[key])}</dd></div>
          <div><dt>Next</dt><dd>${modListDiffValue(state.modDraft[key])}</dd></div>
        </dl>
      </article>
    `;
  }).join('');
  elements.diffDialog.showModal();
}

async function saveReviewedMods() {
  if (!state.mods || !state.pendingChanges) {
    return;
  }

  elements.confirmSave.disabled = true;
  try {
    const saved = await requestJson('/api/mods', {
      method: 'PATCH',
      body: JSON.stringify({
        revision: state.mods.revision,
        workshopItems: state.pendingChanges.workshopItems,
        mods: state.pendingChanges.mods,
      }),
    });
    state.mods = saved;
    state.modDraft = draftFromMods(saved);
    state.pendingChanges = null;
    elements.diffDialog.close();
    renderActiveFile();
    await loadFile('ini');
    await loadBackups('ini');
    if (saved.restartRequired) {
      showRestartBanner();
    }
    const writeSummary = saved.changedKeys.length === 0
      ? 'No list changes were written.'
      : `${saved.changedKeys.length} list changes were written.`;
    showFlash(`${saved.filename} mods saved. ${writeSummary}`, 'ok');
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
    if (restored.file === 'ini') {
      state.mods = null;
      state.modDraft = null;
    }
    if (restored.file === state.activeFile) {
      renderActiveFile();
    } else if (state.activeFile === 'mods' && restored.file === 'ini') {
      await loadMods(true);
    }
    await loadBackups(backupFileForSurface(state.activeFile));
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
    const hasVisibleSetting = Boolean(group.querySelector('.setting:not([hidden])'));
    group.hidden = Boolean(search) && !hasVisibleSetting;
    if (search && hasVisibleSetting) {
      group.open = true;
    } else if (!search) {
      group.open = getGroupOpenState(state.activeFile, group.dataset.group);
    }
  }
}

function setAllGroupsOpen(open) {
  if (state.activeFile === 'mods') {
    return;
  }

  for (const group of elements.settings.querySelectorAll('.setting-group')) {
    setGroupOpenState(state.activeFile, group.dataset.group, open);
    group.open = open;
  }

  if (elements.search.value.trim()) {
    applySearch();
  }
}

function groupOpenAttribute(file, group, groupCount, totalSettings, index) {
  const stored = getGroupOpenState(file, group);
  if (stored !== undefined) {
    return stored ? 'open' : '';
  }

  const open = defaultGroupOpen(groupCount, totalSettings, index);
  setGroupOpenState(file, group, open);
  return open ? 'open' : '';
}

function defaultGroupOpen(groupCount, totalSettings, index) {
  if (groupCount <= 4 && totalSettings <= 40) {
    return true;
  }

  return index < 2;
}

function getGroupOpenState(file, group) {
  return state.groupStates.get(file)?.get(group);
}

function setGroupOpenState(file, group, open) {
  if (!state.groupStates.has(file)) {
    state.groupStates.set(file, new Map());
  }
  state.groupStates.get(file).set(group, open);
}

function updateGroupDirtyCounts() {
  const file = state.files.get(state.activeFile);
  if (!file) {
    return;
  }

  const counts = new Map();
  for (const key of Object.keys(collectChanges())) {
    const group = file.metadata[key]?.group || 'Other';
    counts.set(group, (counts.get(group) || 0) + 1);
  }

  for (const group of elements.settings.querySelectorAll('.setting-group')) {
    const count = counts.get(group.dataset.group) || 0;
    const indicator = group.querySelector('[data-group-dirty]');
    indicator.hidden = count === 0;
    indicator.textContent = `${count} pending`;
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
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  if (response.status === 401) {
    clearToken();
    showLogin('Session expired. Please log in again.');
    throw new Error('Authentication required.');
  }

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

function modListDiffValue(items) {
  return `<code>${escapeHtml(items.length === 0 ? '(empty)' : items.join(';'))}</code>`;
}

function asBoolean(value) {
  return value === true || value === 'true';
}

function draftFromMods(mods) {
  return {
    workshopItems: [...mods.workshopItems],
    mods: [...mods.mods],
  };
}

function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function backupFileForSurface(surface) {
  return surface === 'mods' ? 'ini' : surface;
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
