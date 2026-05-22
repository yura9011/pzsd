const AUTH_TOKEN_KEY = 'pz-panel-token';

const state = {
  activeFile: 'ini',
  files: new Map(),
  mods: null,
  modDraft: null,
  spawnData: null,
  spawnOriginal: null,
  liveStatus: null,
  livePlayers: null,
  livePlayersError: null,
  liveHistory: [],
  pendingChanges: null,
  groupStates: new Map(),
  applyStatuses: new Map(),
};

let isLoginShowing = false;

const elements = {
  settings: document.querySelector('#settings'),
  saveBar: document.querySelector('#save-bar'),
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
  applyStatus: document.querySelector('#apply-status'),
  applyTitle: document.querySelector('#apply-title'),
  applyDetail: document.querySelector('#apply-detail'),
  applyState: document.querySelector('#apply-state'),
  applyLive: document.querySelector('#apply-live'),
  applyRestart: document.querySelector('#apply-restart'),
  serviceUnit: document.querySelector('#service-unit'),
  serviceState: document.querySelector('#service-state'),
  serviceDetail: document.querySelector('#service-detail'),
  refreshStatus: document.querySelector('#refresh-status'),
  restartServer: document.querySelector('#restart-server'),
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
elements.applyLive.addEventListener('click', applyIniLive);
elements.applyRestart.addEventListener('click', restartServer);

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
    loadApplyStatus('ini'),
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
  } else if (file === 'spawn' && !state.spawnData) {
    await loadSpawn(true);
  } else if (file === 'live' && !state.liveStatus) {
    await loadLive(true);
  } else if (file !== 'mods' && file !== 'spawn' && file !== 'live' && !state.files.has(file)) {
    await loadFile(file, true);
  }

  await loadApplyStatus(file);
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

async function loadSpawn(forceRender = false) {
  try {
    const data = await requestJson('/api/config/spawn');
    state.spawnData = data;
    state.spawnOriginal = data.regions.map((r) => ({ ...r }));
    if (state.activeFile === 'spawn' || forceRender) {
      hideEditorError();
      renderActiveFile();
    }
  } catch (error) {
    if (state.activeFile === 'spawn' || forceRender) {
      showEditorError(error.message);
    }
  }
}

async function loadLive(forceRender = false) {
  state.livePlayersError = null;
  try {
    state.liveStatus = await requestJson('/api/live/rcon/status');
    state.livePlayers = state.liveStatus.ready
      ? await requestJson('/api/live/players')
      : null;
  } catch (error) {
    state.liveStatus = {
      available: false,
      ready: false,
      error: error.message,
    };
    state.livePlayers = null;
    state.livePlayersError = error.message;
  }

  if (state.activeFile === 'live' || forceRender) {
    hideEditorError();
    renderActiveFile();
  }
}

async function loadApplyStatus(surface) {
  if (surface === 'live') {
    renderApplyStatus();
    return;
  }

  try {
    state.applyStatuses.set(surface, await requestJson(`/api/config/apply-status?surface=${surface}`));
  } catch (error) {
    state.applyStatuses.set(surface, { surface, error: error.message });
  }

  if (surface === state.activeFile) {
    renderApplyStatus();
  }
}

async function reloadActiveSurface() {
  state.pendingChanges = null;
  if (state.activeFile === 'mods') {
    await loadMods(true);
    await loadBackups('ini');
    await loadApplyStatus('mods');
    return;
  }

  if (state.activeFile === 'spawn') {
    await loadSpawn(true);
    await loadApplyStatus('spawn');
    return;
  }

  if (state.activeFile === 'live') {
    await loadLive(true);
    return;
  }

  await loadFile(state.activeFile, true);
  await loadApplyStatus(state.activeFile);
}

function renderActiveFile() {
  renderApplyStatus();
  if (state.activeFile === 'mods') {
    renderMods();
    return;
  }

  if (state.activeFile === 'spawn') {
    renderSpawn();
    return;
  }

  if (state.activeFile === 'live') {
    renderLive();
    return;
  }

  const file = state.files.get(state.activeFile);
  elements.search.value = '';
  elements.saveBar.hidden = false;
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
  elements.saveBar.hidden = false;
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

function renderSpawn() {
  elements.search.value = '';
  elements.saveBar.hidden = false;
  elements.configTools.hidden = true;
  elements.saveNote.textContent = 'Uncheck regions to remove them. The file is rewritten with only enabled regions.';

  if (!state.spawnData) {
    elements.title.textContent = 'Spawn configuration unavailable';
    elements.settings.innerHTML = '<p class="empty-state">Spawn regions have not loaded yet.</p>';
    updateChangeState();
    return;
  }

  elements.title.textContent = state.spawnData.filename;
  const enabledCount = state.spawnData.regions.filter((r) => r.enabled).length;
  elements.settings.innerHTML = `
    <section class="spawn-shell">
      <div class="spawn-info">
        <strong>Spawn Regions</strong>
        <p>Select which regions appear in the player spawn selector. Disabled regions are removed from the file. At least one must remain enabled.</p>
      </div>
      <div class="spawn-region-list">
        ${state.spawnData.regions.map((region, index) => `
          <label class="spawn-region-item">
            <input type="checkbox" data-spawn-index="${index}" ${region.enabled ? 'checked' : ''}>
            <div>
              <strong>${escapeHtml(region.name)}</strong>
              <code>${escapeHtml(region.isServerFile ? region.file : region.file)}</code>
            </div>
            <span class="region-src">${region.isServerFile ? 'server file' : 'map file'}</span>
          </label>
        `).join('')}
      </div>
      <div class="spawn-count">
        <span><strong id="spawn-enabled-count">${enabledCount}</strong> of ${state.spawnData.regions.length} regions enabled</span>
      </div>
    </section>
  `;

  for (const checkbox of elements.settings.querySelectorAll('[data-spawn-index]')) {
    checkbox.addEventListener('change', () => {
      const index = Number(checkbox.dataset.spawnIndex);
      state.spawnData.regions[index].enabled = checkbox.checked;
      const count = state.spawnData.regions.filter((r) => r.enabled).length;
      const countEl = document.querySelector('#spawn-enabled-count');
      if (countEl) {
        countEl.textContent = String(count);
      }
      updateChangeState();
    });
  }

  updateChangeState();
}

function renderLive() {
  elements.search.value = '';
  elements.saveBar.hidden = true;
  elements.configTools.hidden = true;
  elements.title.textContent = 'Live operations';
  elements.saveNote.textContent = 'Runtime operations use RCON.';

  const status = state.liveStatus;
  const players = state.livePlayers?.players || [];
  const playerError = state.livePlayersError || status?.error || '';
  elements.settings.innerHTML = `
    <section class="live-shell">
      <div class="live-grid">
        <section class="live-panel">
          <header class="live-panel-heading">
            <div>
              <p class="eyebrow">RCON</p>
              <h3>Runtime</h3>
            </div>
            <span class="state-pill" data-state="${status?.ready ? 'online' : 'offline'}">
              ${status?.ready ? 'Ready' : 'Unavailable'}
            </span>
          </header>
          <p class="live-copy">${escapeHtml(status?.ready ? `Checked ${formatDate(status.checkedAt)}` : playerError || 'Checking RCON state')}</p>
          <button id="live-refresh" class="quiet-button" type="button">Refresh live state</button>
        </section>

        <section class="live-panel">
          <header class="live-panel-heading">
            <div>
              <p class="eyebrow">Players</p>
              <h3>Online</h3>
            </div>
            <strong class="live-count">${players.length}</strong>
          </header>
          <div class="live-player-list">
            ${players.length > 0
              ? players.map((player) => `<span>${escapeHtml(player)}</span>`).join('')
              : `<p class="empty-state">${escapeHtml(playerError || 'No online players reported.')}</p>`}
          </div>
        </section>
      </div>

      <section class="live-panel live-actions">
        <header class="live-panel-heading">
          <div>
            <p class="eyebrow">Quick actions</p>
            <h3>Server</h3>
          </div>
          <button id="live-save-world" class="primary-button" type="button">Save world</button>
        </header>
        <form id="live-broadcast-form" class="live-form">
          <label for="live-broadcast-message">Broadcast message</label>
          <div class="live-input-row">
            <input id="live-broadcast-message" autocomplete="off" maxlength="512" placeholder="Message">
            <button class="primary-button" type="submit">Send</button>
          </div>
        </form>
      </section>

      <section class="live-panel live-console">
        <header class="live-panel-heading">
          <div>
            <p class="eyebrow">RCON Console</p>
            <h3>Commands</h3>
          </div>
        </header>
        <form id="live-command-form" class="live-form">
          <label class="sr-only" for="live-command-input">RCON command</label>
          <div class="live-input-row">
            <input id="live-command-input" autocomplete="off" maxlength="1000" placeholder="players">
            <button class="primary-button" type="submit">Run</button>
          </div>
        </form>
        <div class="live-history">
          ${renderLiveHistory()}
        </div>
      </section>
    </section>
  `;

  elements.settings.querySelector('#live-refresh')?.addEventListener('click', () => loadLive(true));
  elements.settings.querySelector('#live-save-world')?.addEventListener('click', saveLiveWorld);
  elements.settings.querySelector('#live-command-form')?.addEventListener('submit', sendLiveCommand);
  elements.settings.querySelector('#live-broadcast-form')?.addEventListener('submit', broadcastLiveMessage);
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

  if (state.activeFile === 'spawn') {
    return collectSpawnChanges();
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

function collectSpawnChanges() {
  if (!state.spawnData || !state.spawnOriginal) {
    return {};
  }

  const changes = { regions: [] };
  for (let i = 0; i < state.spawnData.regions.length; i++) {
    const current = state.spawnData.regions[i];
    const original = state.spawnOriginal[i];
    if (current.enabled !== original.enabled) {
      changes.regions.push({
        index: i,
        name: current.name,
        file: current.file,
        wasEnabled: original.enabled,
        nowEnabled: current.enabled,
      });
    }
  }

  changes.hasChanges = changes.regions.length > 0;
  return changes;
}

function updateChangeState() {
  if (state.activeFile === 'live') {
    elements.changeCount.textContent = 'Runtime actions';
    elements.reviewSave.disabled = true;
    return;
  }

  const count = Object.keys(collectChanges()).length;
  elements.changeCount.textContent = count === 0
    ? 'No pending changes'
    : `${count} pending ${count === 1 ? 'change' : 'changes'}`;
  elements.reviewSave.disabled = count === 0;
  if (state.activeFile !== 'mods' && state.activeFile !== 'spawn') {
    updateGroupDirtyCounts();
  }
}

function reviewChanges() {
  if (state.activeFile === 'mods') {
    reviewModChanges();
    return;
  }

  if (state.activeFile === 'spawn') {
    reviewSpawnChanges();
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

  if (state.activeFile === 'spawn') {
    await saveReviewedSpawn();
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
    await loadApplyStatus(state.activeFile);
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

function reviewSpawnChanges() {
  const changes = collectSpawnChanges();
  if (!state.spawnData || !changes.hasChanges) {
    return;
  }

  state.pendingChanges = {
    regions: state.spawnData.regions.map((r) => ({ name: r.name, file: r.file, isServerFile: r.isServerFile, enabled: r.enabled })),
  };
  elements.diffList.innerHTML = changes.regions.map((r) => `
    <article class="diff-row">
      <div>
        <strong>${escapeHtml(r.name)}</strong>
        <code>${escapeHtml(r.file)}</code>
      </div>
      <dl>
        <div><dt>Action</dt><dd>${r.nowEnabled ? 'Region enabled' : 'Region disabled'}</dd></div>
      </dl>
    </article>
  `).join('');
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
    await loadApplyStatus('mods');
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

async function saveReviewedSpawn() {
  if (!state.spawnData || !state.pendingChanges) {
    return;
  }

  elements.confirmSave.disabled = true;
  try {
    const saved = await requestJson('/api/config/spawn', {
      method: 'PATCH',
      body: JSON.stringify({
        revision: state.spawnData.revision,
        regions: state.pendingChanges.regions,
      }),
    });
    state.spawnData = saved;
    state.spawnOriginal = saved.regions.map((r) => ({ ...r }));
    state.pendingChanges = null;
    elements.diffDialog.close();
    renderActiveFile();
    await loadApplyStatus('spawn');
    const enabledCount = saved.regions.filter((r) => r.enabled).length;
    showFlash(`${saved.filename} saved. ${enabledCount} regions enabled.`, 'ok');
  } catch (error) {
    showFlash(error.message, 'error');
  } finally {
    elements.confirmSave.disabled = false;
  }
}

async function loadBackups(file) {
  if (file === null || file === undefined) {
    elements.backups.innerHTML = '<p class="empty-state">Backups are managed per-file in the other tabs.</p>';
    return;
  }

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
    await loadApplyStatus(state.activeFile);
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
    elements.applyRestart.disabled = !status.available;
    if (!status.available && status.error) {
      showFlash(status.error, 'error');
    }
  } catch (error) {
    elements.serviceState.textContent = 'Offline';
    elements.serviceState.dataset.state = 'offline';
    elements.serviceDetail.textContent = 'systemd status unavailable';
    elements.restartServer.disabled = true;
    elements.applyRestart.disabled = true;
    showFlash(error.message, 'error');
  }
}

async function restartServer() {
  if (!window.confirm('Restart the Project Zomboid service now? Connected players may be disconnected.')) {
    return;
  }

  elements.restartServer.disabled = true;
  elements.applyRestart.disabled = true;
  try {
    const data = await requestJson('/api/server/restart', { method: 'POST' });
    showFlash(`Restart requested for ${data.status.unit}.`, 'ok');
    await loadServiceStatus();
    await loadApplyStatus(state.activeFile);
  } catch (error) {
    showFlash(error.message, 'error');
    await loadServiceStatus();
    await loadApplyStatus(state.activeFile);
  }
}

async function applyIniLive() {
  const status = state.applyStatuses.get('ini');
  if (!status?.revision) {
    return;
  }

  elements.applyLive.disabled = true;
  try {
    const data = await requestJson('/api/config/ini/apply', {
      method: 'POST',
      body: JSON.stringify({ revision: status.revision }),
    });
    state.applyStatuses.set('ini', data.status);
    renderApplyStatus();
    showFlash(
      data.applied
        ? 'Comparable server.ini runtime options match after RCON apply.'
        : 'RCON reload ran, but runtime verification is still incomplete.',
      data.applied ? 'ok' : 'error',
    );
  } catch (error) {
    showFlash(error.message, 'error');
    await loadApplyStatus('ini');
  } finally {
    elements.applyLive.disabled = false;
  }
}

async function sendLiveCommand(event) {
  event.preventDefault();
  const input = elements.settings.querySelector('#live-command-input');
  try {
    const result = await requestJson('/api/live/commands', {
      method: 'POST',
      body: JSON.stringify({ command: input?.value || '' }),
    });
    addLiveHistory(result);
    showFlash(`RCON command executed: ${result.command}`, 'ok');
    renderLive();
  } catch (error) {
    showFlash(error.message, 'error');
  }
}

async function saveLiveWorld(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await requestJson('/api/live/save', { method: 'POST' });
    addLiveHistory(result);
    showFlash('World save command sent.', 'ok');
    renderLive();
  } catch (error) {
    showFlash(error.message, 'error');
    button.disabled = false;
  }
}

async function broadcastLiveMessage(event) {
  event.preventDefault();
  const input = elements.settings.querySelector('#live-broadcast-message');
  try {
    const result = await requestJson('/api/live/broadcast', {
      method: 'POST',
      body: JSON.stringify({ message: input?.value || '' }),
    });
    addLiveHistory(result);
    showFlash('Broadcast command sent.', 'ok');
    renderLive();
  } catch (error) {
    showFlash(error.message, 'error');
  }
}

function addLiveHistory(result) {
  state.liveHistory.unshift({
    command: result.command,
    response: result.response,
    executedAt: result.executedAt,
  });
  state.liveHistory = state.liveHistory.slice(0, 20);
}

function renderLiveHistory() {
  if (state.liveHistory.length === 0) {
    return '<p class="empty-state">No commands run in this session.</p>';
  }

  return state.liveHistory.map((entry) => `
    <article class="live-history-item">
      <header>
        <code>${escapeHtml(entry.command)}</code>
        <time>${escapeHtml(formatDate(entry.executedAt))}</time>
      </header>
      <pre>${escapeHtml(entry.response || '(no response)')}</pre>
    </article>
  `).join('');
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
  if (state.activeFile === 'mods' || state.activeFile === 'live') {
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

function renderApplyStatus() {
  if (state.activeFile === 'live') {
    elements.applyStatus.hidden = true;
    return;
  }

  elements.applyStatus.hidden = false;
  const status = state.applyStatuses.get(state.activeFile);
  if (!status) {
    setApplyStatusText('Checking saved revision', 'Loading disk and runtime evidence.', 'Checking', 'pending');
    setApplyActions(false, false);
    return;
  }

  if (status.error) {
    setApplyStatusText('Application status unavailable', status.error, 'Unknown', 'offline');
    setApplyActions(false, false);
    return;
  }

  setApplyStatusText(
    applyTitle(status),
    applyDetail(status),
    applyStateLabel(status.state),
    applyStateTone(status.state),
  );
  setApplyActions(
    state.activeFile === 'ini' && status.canApplyLive && status.state !== 'runtime_matches_disk',
    status.canRestart && status.state !== 'runtime_matches_disk' && status.state !== 'loaded_after_restart',
  );
}

function setApplyStatusText(title, detail, stateLabel, tone) {
  elements.applyTitle.textContent = title;
  elements.applyDetail.textContent = detail;
  elements.applyState.textContent = stateLabel;
  elements.applyState.dataset.state = tone;
}

function setApplyActions(showLive, showRestart) {
  elements.applyLive.hidden = !showLive;
  elements.applyRestart.hidden = !showRestart;
}

function applyTitle(status) {
  if (status.state === 'runtime_matches_disk') {
    return 'Comparable server.ini runtime options match';
  }
  if (status.state === 'loaded_after_restart') {
    return `${surfaceLabel(status.surface)} loaded after restart`;
  }
  if (status.state === 'restart_required') {
    return `${surfaceLabel(status.surface)} saved on disk`;
  }
  if (status.state === 'saved_on_disk') {
    return `${surfaceLabel(status.surface)} saved on disk`;
  }
  return `${surfaceLabel(status.surface)} runtime state unknown`;
}

function applyDetail(status) {
  if (status.state === 'runtime_matches_disk') {
    return comparisonDetail(status, 'RCON showoptions matches comparable server.ini values.');
  }
  if (status.state === 'loaded_after_restart') {
    return status.surface === 'sandbox'
      ? 'The service restarted after this SandboxVars write. Exact Sandbox runtime introspection is not part of this PR.'
      : 'The service restarted after this saved file revision was written.';
  }
  if (status.state === 'restart_required') {
    return status.surface === 'sandbox'
      ? 'SandboxVars changed after this service start. Restart to load the disk change; runtime Sandbox values are not introspected here.'
      : 'This disk change is newer than the running service. Restart to load it.';
  }
  if (status.state === 'saved_on_disk' && status.surface === 'ini') {
    return comparisonDetail(status, 'Apply live with RCON or restart before treating the server.ini change as active.');
  }
  if (status.state === 'saved_on_disk') {
    return 'The disk change is saved. Start or restart the server before treating it as loaded.';
  }
  return 'Disk state exists, but the panel has no reliable runtime evidence for this surface yet.';
}

function comparisonDetail(status, fallback) {
  const mismatches = status.comparison?.mismatchedKeys?.length || 0;
  if (mismatches > 0) {
    return `${mismatches} comparable INI ${mismatches === 1 ? 'option differs' : 'options differ'} from RCON runtime. ${fallback}`;
  }
  return fallback;
}

function surfaceLabel(surface) {
  if (surface === 'ini') return 'server.ini';
  if (surface === 'sandbox') return 'SandboxVars.lua';
  if (surface === 'mods') return 'Mods lists';
  if (surface === 'spawn') return 'Spawn regions';
  return 'Config';
}

function applyStateLabel(state) {
  if (state === 'runtime_matches_disk') return 'Runtime match';
  if (state === 'loaded_after_restart') return 'Restart loaded';
  if (state === 'restart_required') return 'Restart required';
  if (state === 'saved_on_disk') return 'Saved';
  return 'Unknown';
}

function applyStateTone(state) {
  if (state === 'runtime_matches_disk' || state === 'loaded_after_restart') {
    return 'online';
  }
  if (state === 'saved_on_disk' || state === 'restart_required') {
    return 'pending';
  }
  return 'offline';
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
  if (surface === 'mods') return 'ini';
  if (surface === 'spawn' || surface === 'live') return null;
  return surface;
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
