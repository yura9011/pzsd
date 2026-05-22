import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs, { constants as fsConstants } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http-error.js';

const PZ_WORKSHOP_APP_ID = '108600';
const WORKSHOP_ID_PATTERN = /^\d{1,20}$/;
const MOD_ID_PATTERN = /^[A-Za-z0-9_.+ ()-]{1,200}$/;
const OPERATION_TTL_MS = 15 * 60 * 1000;
const STEAMCMD_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_LIMIT = 16 * 1024;
const BUILTIN_MOD_IDS = new Set([
  'Base',
  'base',
  'Farming',
  'Radio',
  'Camping',
  'Trapping',
  'Fishing',
  'Foraging',
  'Erosion',
  'Animal',
  'NPCs',
  'Seasons',
  'FireFighting',
  'FeedingTrough',
  'RainBarrel',
  'Vehicles',
  'Zombies',
  'XpSystem',
  'HealthSystem',
  'Professions',
  'Climate',
]);

export class WorkshopModInstallService {
  constructor({
    configFiles,
    systemd,
    serverDir,
    steamcmdPath,
    downloader = new SteamCmdWorkshopDownloader({ serverDir, steamcmdPath }),
    clock = () => Date.now(),
  }) {
    this.configFiles = configFiles;
    this.systemd = systemd;
    this.downloader = downloader;
    this.clock = clock;
    this.operations = new Map();
    this.activeOperationId = null;
  }

  async start(rawInput) {
    this.pruneOperations();
    if (this.activeOperationId) {
      throw new HttpError(409, 'Another Workshop mod installation is already active.');
    }

    const workshopId = parseWorkshopInput(rawInput);
    const operation = createOperation(workshopId, this.clock());
    this.operations.set(operation.id, operation);
    this.activeOperationId = operation.id;

    Promise.resolve()
      .then(() => this.downloadInitialItem(operation))
      .catch((error) => this.failOperation(operation, error));

    return this.snapshot(operation);
  }

  async status(operationId) {
    this.pruneOperations();
    return this.snapshot(this.operation(operationId));
  }

  async resolveDependencies(operationId, payload) {
    const operation = this.operation(operationId);
    this.assertInteractiveOperation(operation);
    if (!operation.rootInspection) {
      throw new HttpError(409, 'Wait until the Workshop item is inspected before selecting mods.');
    }

    operation.lastError = null;
    operation.rootSelectedModIds = normalizeRootSelection(
      payload.selectedModIds === undefined ? operation.rootSelectedModIds : payload.selectedModIds,
      operation.rootInspection,
    );

    const manualInputs = normalizeDependencyInputs(payload.dependencies);
    for (const input of manualInputs) {
      if (!operation.missingDependencies.some((dependency) => dependency.requiredModId === input.requiredModId)) {
        throw new HttpError(400, `${input.requiredModId} is not an unresolved dependency for this install.`);
      }

      await this.downloadDependencyInput(operation, input);
    }

    await this.resolveOperationDependencies(operation);
    return this.snapshot(operation);
  }

  async apply(operationId, payload) {
    const operation = this.operation(operationId);
    this.assertInteractiveOperation(operation);
    if (operation.phase !== 'ready_to_apply' || !operation.review) {
      throw new HttpError(409, 'Resolve mod selections and required dependencies before applying this install.');
    }

    if (typeof payload.revision !== 'string') {
      throw new HttpError(400, 'Install apply must include the reviewed config revision.');
    }

    const selectedMapFolders = normalizeSelectedMapFolders(payload.selectedMapFolders, operation.review.mapFolders);
    operation.phase = 'saving_config';
    operation.updatedAt = this.clock();

    const savePayload = {
      revision: payload.revision,
      workshopItems: operation.review.nextWorkshopItems,
      mods: operation.review.nextMods,
    };
    if (selectedMapFolders.length > 0) {
      savePayload.maps = uniqueList([...selectedMapFolders, ...operation.review.currentMaps]);
    }

    let saved;
    try {
      saved = await this.configFiles.saveMods(savePayload);
    } catch (error) {
      operation.phase = 'ready_to_apply';
      operation.updatedAt = this.clock();
      throw error;
    }

    operation.applyResult = {
      configSaved: true,
      saved,
      selectedMapFolders,
    };
    operation.phase = 'restarting';
    operation.updatedAt = this.clock();

    try {
      const restartStatus = await this.systemd.restart();
      operation.applyResult.restartStatus = restartStatus;
      if (!restartStatus?.online) {
        throw new HttpError(502, 'The Project Zomboid service did not return online after restart.');
      }
      operation.phase = 'complete';
      operation.updatedAt = this.clock();
      this.releaseOperation(operation);
    } catch (error) {
      this.failOperation(operation, new HttpError(
        error.status || 502,
        `Config saved, but mod activation restart failed: ${error.message || 'restart failed.'}`,
      ));
    }

    return this.snapshot(operation);
  }

  async downloadInitialItem(operation) {
    operation.phase = 'downloading';
    operation.updatedAt = this.clock();
    const inspection = await this.downloadAndInspect(operation.rootWorkshopId);
    if (inspection.mods.length === 0) {
      throw new HttpError(400, `Workshop item ${operation.rootWorkshopId} has no readable Project Zomboid Mod ID on disk.`);
    }

    operation.inspections.set(operation.rootWorkshopId, inspection);
    operation.rootInspection = inspection;
    operation.phase = 'select_mods';
    operation.updatedAt = this.clock();
  }

  async downloadDependencyInput(operation, input) {
    operation.phase = 'downloading';
    operation.updatedAt = this.clock();

    try {
      const workshopId = parseWorkshopInput(input.input);
      const inspection = await this.downloadAndInspect(workshopId);
      operation.inspections.set(workshopId, inspection);
      if (!inspection.mods.some((mod) => mod.id === input.requiredModId)) {
        throw new HttpError(400, `Workshop item ${workshopId} does not contain required Mod ID ${input.requiredModId}.`);
      }
    } catch (error) {
      operation.phase = 'needs_dependency_input';
      operation.updatedAt = this.clock();
      operation.lastError = publicError(error);
      throw error;
    }
  }

  async downloadAndInspect(workshopId) {
    await this.downloader.download(workshopId);
    return inspectWorkshopItem({
      workshopRoot: this.downloader.workshopRoot,
      workshopId,
    });
  }

  async resolveOperationDependencies(operation) {
    const current = await this.configFiles.readMods();
    operation.selectedModsByWorkshop = new Map([
      [operation.rootWorkshopId, new Set(operation.rootSelectedModIds)],
    ]);
    operation.missingDependencies = [];

    const configuredModIds = new Set(current.mods);
    const selectedNodes = new Map();
    const queue = [];

    this.enqueueSelectedMods(operation.rootInspection, operation.rootSelectedModIds, selectedNodes, queue);

    const missingById = new Map();
    while (queue.length > 0) {
      const node = queue.shift();
      for (const requiredModId of node.mod.requires) {
        if (BUILTIN_MOD_IDS.has(requiredModId) || configuredModIds.has(requiredModId)) {
          continue;
        }

        if (selectedNodes.has(requiredModId)) {
          node.requiresSelected.add(requiredModId);
          continue;
        }

        const match = await this.findLocalDependency(requiredModId, operation);
        if (!match) {
          addMissingDependency(missingById, requiredModId, node);
          continue;
        }

        this.addSelectedMod(operation, match.inspection.workshopId, requiredModId);
        this.enqueueSelectedMods(match.inspection, [requiredModId], selectedNodes, queue);
        node.requiresSelected.add(requiredModId);
      }
    }

    operation.missingDependencies = [...missingById.values()];
    if (operation.missingDependencies.length > 0) {
      operation.phase = 'needs_dependency_input';
      operation.review = null;
      operation.updatedAt = this.clock();
      return;
    }

    operation.review = buildReview(current, operation, selectedNodes);
    operation.phase = 'ready_to_apply';
    operation.updatedAt = this.clock();
  }

  enqueueSelectedMods(inspection, modIds, selectedNodes, queue) {
    for (const modId of modIds) {
      if (selectedNodes.has(modId)) {
        continue;
      }

      const mod = inspection.mods.find((candidate) => candidate.id === modId);
      if (!mod) {
        continue;
      }

      const node = {
        workshopId: inspection.workshopId,
        mod,
        requiresSelected: new Set(),
      };
      selectedNodes.set(modId, node);
      queue.push(node);
    }
  }

  addSelectedMod(operation, workshopId, modId) {
    if (!operation.selectedModsByWorkshop.has(workshopId)) {
      operation.selectedModsByWorkshop.set(workshopId, new Set());
    }
    operation.selectedModsByWorkshop.get(workshopId).add(modId);
  }

  async findLocalDependency(requiredModId, operation) {
    for (const inspection of operation.inspections.values()) {
      if (inspection.mods.some((mod) => mod.id === requiredModId)) {
        return { inspection };
      }
    }

    let entries;
    try {
      entries = await fs.readdir(this.downloader.workshopRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new HttpError(500, 'Failed to inspect downloaded Workshop content.');
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !WORKSHOP_ID_PATTERN.test(entry.name)) {
        continue;
      }
      if (operation.inspections.has(entry.name)) {
        continue;
      }

      let inspection;
      try {
        inspection = await inspectWorkshopItem({
          workshopRoot: this.downloader.workshopRoot,
          workshopId: entry.name,
        });
      } catch (error) {
        if (error.status === 404) {
          continue;
        }
        throw error;
      }
      operation.inspections.set(entry.name, inspection);
      if (inspection.mods.some((mod) => mod.id === requiredModId)) {
        return { inspection };
      }
    }

    return null;
  }

  operation(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new HttpError(404, 'Workshop mod install operation not found.');
    }
    return operation;
  }

  assertInteractiveOperation(operation) {
    if (operation.phase === 'complete' || operation.phase === 'failed') {
      throw new HttpError(409, 'This Workshop mod install operation is already finished.');
    }
    if (['downloading', 'inspecting', 'saving_config', 'restarting'].includes(operation.phase)) {
      throw new HttpError(409, 'Wait until the current Workshop installer step finishes.');
    }
  }

  pruneOperations() {
    const now = this.clock();
    for (const [id, operation] of this.operations) {
      if (now - operation.updatedAt <= OPERATION_TTL_MS) {
        continue;
      }
      this.operations.delete(id);
      if (this.activeOperationId === id) {
        this.activeOperationId = null;
      }
    }
  }

  failOperation(operation, error) {
    operation.phase = 'failed';
    operation.error = publicError(error);
    operation.updatedAt = this.clock();
    this.releaseOperation(operation);
  }

  releaseOperation(operation) {
    if (this.activeOperationId === operation.id) {
      this.activeOperationId = null;
    }
  }

  snapshot(operation) {
    return {
      id: operation.id,
      phase: operation.phase,
      rootWorkshopId: operation.rootWorkshopId,
      rootItem: publicInspection(operation.rootInspection),
      selectedModIds: [...operation.rootSelectedModIds],
      missingDependencies: operation.missingDependencies.map(publicMissingDependency),
      review: operation.review,
      applyResult: publicApplyResult(operation.applyResult),
      error: operation.error,
      lastError: operation.lastError,
      updatedAt: new Date(operation.updatedAt).toISOString(),
    };
  }
}

export class SteamCmdWorkshopDownloader {
  constructor({
    serverDir,
    steamcmdPath,
    run = runSteamcmdProcess,
    timeoutMs = STEAMCMD_TIMEOUT_MS,
  }) {
    this.serverDir = path.resolve(serverDir || '/home/steam/pz_server');
    this.steamcmdPath = path.resolve(steamcmdPath || '/usr/games/steamcmd');
    this.workshopRoot = path.join(this.serverDir, 'steamapps', 'workshop', 'content', PZ_WORKSHOP_APP_ID);
    this.run = run;
    this.timeoutMs = timeoutMs;
  }

  async download(workshopId) {
    assertWorkshopId(workshopId);
    await this.preflight();

    const args = [
      '+force_install_dir',
      this.serverDir,
      '+login',
      'anonymous',
      '+workshop_download_item',
      PZ_WORKSHOP_APP_ID,
      workshopId,
      'validate',
      '+quit',
    ];

    await this.run(this.steamcmdPath, args, {
      timeoutMs: this.timeoutMs,
      outputLimit: OUTPUT_LIMIT,
    });

    const itemPath = path.join(this.workshopRoot, workshopId);
    await assertDirectory(itemPath, `SteamCMD finished but Workshop item ${workshopId} was not downloaded.`);
    return { workshopId, itemPath };
  }

  async preflight() {
    await assertDirectory(this.serverDir, 'PZ_SERVER_DIR does not point to an existing server directory.');
    assertPathInside(this.serverDir, this.workshopRoot, 'Workshop content root must stay inside PZ_SERVER_DIR.');
    try {
      await fs.access(this.steamcmdPath, fsConstants.X_OK);
    } catch {
      throw new HttpError(503, 'PZ_STEAMCMD_PATH is missing or not executable.');
    }
  }
}

export function parseWorkshopInput(rawInput) {
  if (typeof rawInput !== 'string' || rawInput.trim() === '') {
    throw new HttpError(400, 'Workshop URL or numeric ID is required.');
  }

  const input = rawInput.trim();
  if (WORKSHOP_ID_PATTERN.test(input)) {
    return input;
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'Workshop input must be a Steam Workshop URL or numeric ID.');
  }

  const host = url.hostname.toLowerCase();
  const workshopPath = url.pathname.replace(/\/+$/, '');
  const id = url.searchParams.get('id');
  if (
    !['http:', 'https:'].includes(url.protocol)
    || (host !== 'steamcommunity.com' && host !== 'www.steamcommunity.com')
    || workshopPath !== '/sharedfiles/filedetails'
    || !WORKSHOP_ID_PATTERN.test(id || '')
  ) {
    throw new HttpError(400, 'Workshop URL must be a Steam filedetails URL with a numeric id.');
  }

  return id;
}

export async function inspectWorkshopItem({ workshopRoot, workshopId }) {
  assertWorkshopId(workshopId);
  const itemPath = path.join(path.resolve(workshopRoot), workshopId);
  assertPathInside(workshopRoot, itemPath, 'Workshop item path is outside the Workshop content root.');
  await assertDirectory(itemPath, `Downloaded Workshop item ${workshopId} was not found.`);

  const mods = [];
  const mapFolders = new Set();
  const seenModIds = new Set();
  for (const modDir of await findModDirectories(itemPath)) {
    for (const modInfoPath of await findModInfoFiles(modDir)) {
      const info = await parseModInfoFile(modInfoPath);
      if (!info.id || !isModId(info.id) || seenModIds.has(info.id)) {
        continue;
      }

      seenModIds.add(info.id);
      mods.push({
        id: info.id,
        name: info.name || info.id,
        requires: parseRequiredModIds(info.require),
      });

      for (const folder of await findMapFolders([modDir, path.dirname(modInfoPath)])) {
        mapFolders.add(folder);
      }
    }
  }

  return {
    workshopId,
    mods,
    mapFolders: [...mapFolders],
  };
}

function createOperation(rootWorkshopId, now) {
  return {
    id: randomUUID(),
    phase: 'downloading',
    rootWorkshopId,
    rootInspection: null,
    rootSelectedModIds: [],
    selectedModsByWorkshop: new Map(),
    inspections: new Map(),
    missingDependencies: [],
    review: null,
    applyResult: null,
    error: null,
    lastError: null,
    updatedAt: now,
  };
}

function normalizeRootSelection(rawModIds, inspection) {
  if (!Array.isArray(rawModIds) || rawModIds.length === 0) {
    throw new HttpError(400, 'Select at least one Mod ID from the downloaded Workshop item.');
  }

  const available = new Set(inspection.mods.map((mod) => mod.id));
  const selected = uniqueList(rawModIds.map((modId) => {
    if (typeof modId !== 'string' || !available.has(modId)) {
      throw new HttpError(400, 'Selected Mod IDs must come from the downloaded Workshop item.');
    }
    return modId;
  }));

  return selected;
}

function normalizeDependencyInputs(rawInputs) {
  if (rawInputs === undefined) {
    return [];
  }

  if (!Array.isArray(rawInputs)) {
    throw new HttpError(400, 'Dependency inputs must be an array.');
  }

  return rawInputs.map((input) => {
    if (
      !input
      || typeof input.requiredModId !== 'string'
      || !isModId(input.requiredModId)
      || typeof input.input !== 'string'
    ) {
      throw new HttpError(400, 'Each dependency input needs a required Mod ID and Workshop URL or ID.');
    }
    return {
      requiredModId: input.requiredModId,
      input: input.input,
    };
  });
}

function normalizeSelectedMapFolders(rawMapFolders, reviewMapFolders) {
  if (rawMapFolders === undefined) {
    return [...reviewMapFolders];
  }
  if (!Array.isArray(rawMapFolders)) {
    throw new HttpError(400, 'selectedMapFolders must be an array.');
  }

  const candidates = new Set(reviewMapFolders);
  return uniqueList(rawMapFolders.map((folder) => {
    if (typeof folder !== 'string' || !candidates.has(folder)) {
      throw new HttpError(400, 'Selected map folders must come from the install review.');
    }
    return folder;
  }));
}

function buildReview(current, operation, selectedNodes) {
  const orderedNodes = orderSelectedNodes(selectedNodes);
  const modsToAdd = orderedNodes
    .map((node) => node.mod.id)
    .filter((modId) => !current.mods.includes(modId));
  const nextMods = uniqueList([...current.mods, ...modsToAdd]);

  const workshopItemsToAdd = [];
  for (const node of orderedNodes) {
    if (!current.workshopItems.includes(node.workshopId) && !workshopItemsToAdd.includes(node.workshopId)) {
      workshopItemsToAdd.push(node.workshopId);
    }
  }

  const selectedWorkshopIds = new Set(orderedNodes.map((node) => node.workshopId));
  const mapFolders = [];
  for (const workshopId of selectedWorkshopIds) {
    const inspection = operation.inspections.get(workshopId);
    for (const folder of inspection?.mapFolders || []) {
      if (!current.maps.includes(folder) && !mapFolders.includes(folder)) {
        mapFolders.push(folder);
      }
    }
  }

  return {
    revision: current.revision,
    currentWorkshopItems: [...current.workshopItems],
    currentMods: [...current.mods],
    currentMaps: [...current.maps],
    workshopItemsToAdd,
    modsToAdd,
    mapFolders,
    canAddMapFolders: current.hasMapEntry,
    nextWorkshopItems: uniqueList([...current.workshopItems, ...workshopItemsToAdd]),
    nextMods,
    dependencies: orderedNodes
      .filter((node) => node.workshopId !== operation.rootWorkshopId)
      .map((node) => ({
        workshopId: node.workshopId,
        modId: node.mod.id,
        name: node.mod.name,
      })),
  };
}

function orderSelectedNodes(selectedNodes) {
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(node) {
    if (visited.has(node.mod.id)) {
      return;
    }
    if (visiting.has(node.mod.id)) {
      return;
    }
    visiting.add(node.mod.id);
    for (const requiredModId of node.requiresSelected) {
      const dependency = selectedNodes.get(requiredModId);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.delete(node.mod.id);
    visited.add(node.mod.id);
    ordered.push(node);
  }

  for (const node of selectedNodes.values()) {
    visit(node);
  }
  return ordered;
}

function addMissingDependency(missingById, requiredModId, node) {
  if (!missingById.has(requiredModId)) {
    missingById.set(requiredModId, {
      requiredModId,
      requiredBy: [],
    });
  }

  missingById.get(requiredModId).requiredBy.push({
    workshopId: node.workshopId,
    modId: node.mod.id,
    name: node.mod.name,
  });
}

async function findModDirectories(itemPath) {
  const searchRoots = [
    path.join(itemPath, 'mods'),
    path.join(itemPath, 'Contents', 'mods'),
    itemPath,
  ];
  const modDirs = [];
  const seen = new Set();
  for (const root of searchRoots) {
    const resolvedRoot = path.resolve(root);
    if (!seen.has(resolvedRoot)) {
      seen.add(resolvedRoot);
      modDirs.push(root);
    }

    for (const dir of await directoryChildren(root)) {
      const resolved = path.resolve(dir);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        modDirs.push(dir);
      }
    }
  }
  return modDirs;
}

async function findModInfoFiles(modDir) {
  const candidates = [
    path.join(modDir, 'mod.info'),
    path.join(modDir, 'common', 'mod.info'),
    path.join(modDir, '41', 'mod.info'),
  ];

  for (const versionDir of await directoryChildren(modDir)) {
    const name = path.basename(versionDir);
    if (/^42(?:\.\d+)?$/.test(name)) {
      candidates.push(path.join(versionDir, 'mod.info'));
    }
  }

  const readable = [];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        readable.push(candidate);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new HttpError(500, 'Failed to inspect downloaded mod metadata.');
      }
    }
  }
  return readable;
}

async function parseModInfoFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    throw new HttpError(500, 'Failed to read downloaded mod metadata.');
  }

  const info = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    info[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return info;
}

function parseRequiredModIds(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  return uniqueList(value
    .split(/[;,]/)
    .map((required) => required.trim().replace(/^\+/, ''))
    .filter((required) => isModId(required)));
}

async function findMapFolders(modRoots) {
  const folders = new Set();
  const mapRoots = [];
  for (const modRoot of uniqueList(modRoots.map((root) => path.resolve(root)))) {
    mapRoots.push(modRoot);
    for (const versionRoot of await directoryChildren(modRoot)) {
      if (/^(?:common|41|42(?:\.\d+)?)$/i.test(path.basename(versionRoot))) {
        mapRoots.push(versionRoot);
      }
    }
  }

  for (const modRoot of uniqueList(mapRoots)) {
    const mapsPath = path.join(modRoot, 'media', 'maps');
    for (const mapDir of await directoryChildren(mapsPath)) {
      if (await isMapFolder(mapDir)) {
        folders.add(path.basename(mapDir));
      }
    }
  }
  return [...folders];
}

async function isMapFolder(mapDir) {
  let entries;
  try {
    entries = await fs.readdir(mapDir, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => {
    if (!entry.isFile()) {
      return false;
    }
    const name = entry.name.toLowerCase();
    return name === 'objects.lua'
      || name.endsWith('.lotheader')
      || name.endsWith('.lotpack')
      || name.startsWith('world_')
      || name.startsWith('chunkdata_');
  });
}

async function directoryChildren(dirPath) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return [];
    }
    throw new HttpError(500, 'Failed to inspect downloaded Workshop folders.');
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dirPath, entry.name));
}

async function assertDirectory(dirPath, message) {
  try {
    const stat = await fs.stat(dirPath);
    if (stat.isDirectory()) {
      return;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new HttpError(500, message);
    }
  }
  throw new HttpError(404, message);
}

function assertWorkshopId(workshopId) {
  if (!WORKSHOP_ID_PATTERN.test(String(workshopId))) {
    throw new HttpError(400, 'Workshop item ID must be numeric.');
  }
}

function assertPathInside(root, child, message) {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HttpError(400, message);
  }
}

function isModId(value) {
  return typeof value === 'string' && MOD_ID_PATTERN.test(value) && !/[\0\r\n;]/.test(value);
}

function uniqueList(values) {
  return [...new Set(values)];
}

function publicInspection(inspection) {
  if (!inspection) {
    return null;
  }
  return {
    workshopId: inspection.workshopId,
    mods: inspection.mods.map((mod) => ({
      id: mod.id,
      name: mod.name,
      requires: [...mod.requires],
    })),
    mapFolders: [...inspection.mapFolders],
  };
}

function publicMissingDependency(dependency) {
  return {
    requiredModId: dependency.requiredModId,
    requiredBy: dependency.requiredBy.map((requiredBy) => ({ ...requiredBy })),
  };
}

function publicApplyResult(result) {
  if (!result) {
    return null;
  }
  return {
    configSaved: result.configSaved,
    changedKeys: result.saved?.changedKeys || [],
    selectedMapFolders: result.selectedMapFolders || [],
    restartStatus: result.restartStatus || null,
  };
}

function publicError(error) {
  return {
    message: String(error?.message || 'Workshop mod installation failed.').slice(0, 300),
    status: error?.status || error?.statusCode || 500,
  };
}

function runSteamcmdProcess(command, args, { timeoutMs, outputLimit }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const appendOutput = (chunk) => {
      output = `${output}${String(chunk)}`.slice(-outputLimit);
    };
    const timeout = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      reject(new HttpError(504, 'SteamCMD Workshop download timed out.'));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new HttpError(502, `Failed to start SteamCMD: ${error.message}`));
      }
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve({ code, output });
        return;
      }
      const detail = output.trim().split(/\r?\n/).at(-1);
      reject(new HttpError(502, `SteamCMD Workshop download failed${detail ? `: ${detail}` : ` with exit code ${code}`}.`));
    });
  });
}
