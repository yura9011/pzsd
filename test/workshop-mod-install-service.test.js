import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigFileService } from '../src/lib/config-file-service.js';
import {
  inspectWorkshopItem,
  parseWorkshopInput,
  SteamCmdWorkshopDownloader,
  WorkshopModInstallService,
} from '../src/lib/workshop-mod-install-service.js';

test('Workshop installer parses Steam Workshop IDs and filedetails URLs only', () => {
  assert.equal(parseWorkshopInput('3728357493'), '3728357493');
  assert.equal(
    parseWorkshopInput('https://steamcommunity.com/sharedfiles/filedetails/?id=3728357493'),
    '3728357493',
  );

  assert.throws(
    () => parseWorkshopInput('https://example.test/sharedfiles/filedetails/?id=3728357493'),
    (error) => error.status === 400 && /Steam filedetails URL/.test(error.message),
  );
  assert.throws(
    () => parseWorkshopInput('https://steamcommunity.com/workshop/?id=nope'),
    (error) => error.status === 400,
  );
});

test('Workshop inspector reads B42 mod.info variants, require lists, and valid map folders', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-workshop-inspect-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workshopRoot = path.join(root, 'steamapps', 'workshop', 'content', '108600');

  await writeMod(workshopRoot, '100', 'Primary', '42.1', [
    'name=Primary B42',
    'id=PrimaryMod',
    'require=DependencyOne; +DependencyTwo, Base',
  ]);
  await fs.mkdir(path.join(workshopRoot, '100', 'mods', 'Primary', '42.1', 'media', 'maps', 'Playable Map'), { recursive: true });
  await fs.writeFile(path.join(workshopRoot, '100', 'mods', 'Primary', '42.1', 'media', 'maps', 'Playable Map', 'objects.lua'), '-- map');
  await fs.mkdir(path.join(workshopRoot, '100', 'mods', 'Primary', '42.1', 'media', 'maps', 'Overlay Only'), { recursive: true });
  await fs.writeFile(path.join(workshopRoot, '100', 'mods', 'Primary', '42.1', 'media', 'maps', 'Overlay Only', 'spawnpoints.lua'), '-- no tiles');
  await writeMod(workshopRoot, '100', 'Variant', 'common', [
    'name=Optional Variant',
    'id=OptionalVariant',
  ]);
  await fs.writeFile(path.join(workshopRoot, '100', 'mod.info'), 'name=Root Layout\nid=RootLayout\n');

  const inspection = await inspectWorkshopItem({ workshopRoot, workshopId: '100' });
  assert.deepEqual(inspection.mods.map((mod) => mod.id), ['PrimaryMod', 'OptionalVariant', 'RootLayout']);
  assert.deepEqual(inspection.mods[0].requires, ['DependencyOne', 'DependencyTwo', 'Base']);
  assert.deepEqual(inspection.mapFolders, ['Playable Map']);
});

test('SteamCMD downloader uses fixed Workshop arguments and verifies downloaded content', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-steamcmd-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const steamcmdPath = path.join(root, process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd');
  const serverDir = path.join(root, 'pz-server');
  await fs.mkdir(serverDir, { recursive: true });
  await fs.writeFile(steamcmdPath, '');
  if (process.platform !== 'win32') {
    await fs.chmod(steamcmdPath, 0o755);
  }

  let command;
  let args;
  const downloader = new SteamCmdWorkshopDownloader({
    serverDir,
    steamcmdPath,
    async run(nextCommand, nextArgs) {
      command = nextCommand;
      args = nextArgs;
      await fs.mkdir(path.join(serverDir, 'steamapps', 'workshop', 'content', '108600', '555'), { recursive: true });
    },
  });

  await downloader.download('555');
  assert.equal(command, path.resolve(steamcmdPath));
  assert.deepEqual(args, [
    '+force_install_dir',
    path.resolve(serverDir),
    '+login',
    'anonymous',
    '+workshop_download_item',
    '108600',
    '555',
    'validate',
    '+quit',
  ]);

  const missingDownload = new SteamCmdWorkshopDownloader({
    serverDir,
    steamcmdPath,
    async run() {},
  });
  await assert.rejects(
    missingDownload.download('556'),
    (error) => error.status === 404 && /was not downloaded/.test(error.message),
  );
});

test('Workshop install serializes dependency downloads inside an active operation', async (t) => {
  const env = await createInstallEnv(t);
  let releaseDependency;
  const dependencyGate = new Promise((resolve) => {
    releaseDependency = resolve;
  });
  let dependencyStarted;
  const dependencyStartedPromise = new Promise((resolve) => {
    dependencyStarted = resolve;
  });
  const installer = new WorkshopModInstallService({
    configFiles: env.configFiles,
    downloader: {
      workshopRoot: env.workshopRoot,
      async download(workshopId) {
        if (workshopId === '650') {
          await writeMod(env.workshopRoot, workshopId, 'SerialParent', '42', [
            'id=SerialParent',
            'require=SerialDependency',
          ]);
        }
        if (workshopId === '651') {
          dependencyStarted();
          await dependencyGate;
          await writeMod(env.workshopRoot, workshopId, 'SerialDependency', '42', ['id=SerialDependency']);
        }
      },
    },
    systemd: { async restart() { return { online: true }; } },
  });

  let operation = await installer.start('650');
  operation = await waitForPhase(installer, operation.id, 'select_mods');
  operation = await installer.resolveDependencies(operation.id, { selectedModIds: ['SerialParent'] });
  assert.equal(operation.phase, 'needs_dependency_input');

  const pendingDownload = installer.resolveDependencies(operation.id, {
    selectedModIds: ['SerialParent'],
    dependencies: [{ requiredModId: 'SerialDependency', input: '651' }],
  });
  await dependencyStartedPromise;
  await assert.rejects(
    installer.resolveDependencies(operation.id, {
      selectedModIds: ['SerialParent'],
      dependencies: [{ requiredModId: 'SerialDependency', input: '651' }],
    }),
    (error) => error.status === 409 && /current Workshop installer step/.test(error.message),
  );

  releaseDependency();
  operation = await pendingDownload;
  assert.equal(operation.phase, 'ready_to_apply');
});

test('Workshop install blocks missing dependencies then saves reviewed config and restarts', async (t) => {
  const env = await createInstallEnv(t);
  const downloads = [];
  const downloader = {
    workshopRoot: env.workshopRoot,
    async download(workshopId) {
      downloads.push(workshopId);
      if (workshopId === '700') {
        await writeMod(env.workshopRoot, workshopId, 'Parent', '42', [
          'name=Parent',
          'id=ParentMod',
          'require=LibraryMod',
        ]);
        await fs.mkdir(path.join(env.workshopRoot, workshopId, 'mods', 'Parent', '42', 'media', 'maps', 'Parent Map'), { recursive: true });
        await fs.writeFile(path.join(env.workshopRoot, workshopId, 'mods', 'Parent', '42', 'media', 'maps', 'Parent Map', 'world_1_1.lotpack'), 'map');
      }
      if (workshopId === '701') {
        await writeMod(env.workshopRoot, workshopId, 'Wrong', '42', ['id=OtherMod']);
      }
      if (workshopId === '702') {
        await writeMod(env.workshopRoot, workshopId, 'Library', 'common', [
          'name=Library',
          'id=LibraryMod',
          'require=NestedMod',
        ]);
      }
      if (workshopId === '703') {
        await writeMod(env.workshopRoot, workshopId, 'Nested', '42', [
          'name=Nested',
          'id=NestedMod',
        ]);
      }
    },
  };
  let restartCount = 0;
  const installer = new WorkshopModInstallService({
    configFiles: env.configFiles,
    downloader,
    systemd: {
      async restart() {
        restartCount += 1;
        return { unit: 'project-zomboid.service', online: true, activeState: 'active', subState: 'running' };
      },
    },
  });

  let operation = await installer.start('700');
  operation = await waitForPhase(installer, operation.id, 'select_mods');
  operation = await installer.resolveDependencies(operation.id, { selectedModIds: ['ParentMod'] });
  assert.equal(operation.phase, 'needs_dependency_input');
  assert.deepEqual(operation.missingDependencies.map((dependency) => dependency.requiredModId), ['LibraryMod']);

  await assert.rejects(
    installer.resolveDependencies(operation.id, {
      selectedModIds: ['ParentMod'],
      dependencies: [{ requiredModId: 'LibraryMod', input: '701' }],
    }),
    (error) => error.status === 400 && /does not contain required Mod ID LibraryMod/.test(error.message),
  );

  operation = await installer.resolveDependencies(operation.id, {
    selectedModIds: ['ParentMod'],
    dependencies: [{ requiredModId: 'LibraryMod', input: '702' }],
  });
  assert.equal(operation.phase, 'needs_dependency_input');
  assert.deepEqual(operation.missingDependencies.map((dependency) => dependency.requiredModId), ['NestedMod']);

  operation = await installer.resolveDependencies(operation.id, {
    selectedModIds: ['ParentMod'],
    dependencies: [{ requiredModId: 'NestedMod', input: '703' }],
  });
  assert.equal(operation.phase, 'ready_to_apply');
  assert.deepEqual(operation.review.modsToAdd, ['NestedMod', 'LibraryMod', 'ParentMod']);
  assert.deepEqual(operation.review.workshopItemsToAdd, ['703', '702', '700']);
  assert.deepEqual(operation.review.mapFolders, ['Parent Map']);

  operation = await installer.apply(operation.id, {
    revision: operation.review.revision,
    selectedMapFolders: ['Parent Map'],
  });
  assert.equal(operation.phase, 'complete');
  assert.equal(operation.applyResult.configSaved, true);
  assert.equal(restartCount, 1);
  assert.deepEqual(downloads, ['700', '701', '702', '703']);

  const saved = await fs.readFile(path.join(env.configDir, 'servertest.ini'), 'utf8');
  assert.match(saved, /WorkshopItems=12345;98765;703;702;700/);
  assert.match(saved, /Mods=CoreMod;MapMod;NestedMod;LibraryMod;ParentMod/);
  assert.match(saved, /Map=Parent Map;Muldraugh, KY/);
  assert.equal((await env.configFiles.listBackups('ini')).length, 1);
});

test('Workshop install resolves already downloaded dependency content without manual input', async (t) => {
  const env = await createInstallEnv(t);
  await writeMod(env.workshopRoot, '810', 'ReadyLibrary', '42', ['id=ReadyLibrary']);
  const installer = new WorkshopModInstallService({
    configFiles: env.configFiles,
    downloader: {
      workshopRoot: env.workshopRoot,
      async download(workshopId) {
        await writeMod(env.workshopRoot, workshopId, 'NeedsReadyLibrary', '42', [
          'id=NeedsReadyLibrary',
          'require=ReadyLibrary',
        ]);
      },
    },
    systemd: { async restart() { return { online: true }; } },
  });

  let operation = await installer.start('811');
  operation = await waitForPhase(installer, operation.id, 'select_mods');
  operation = await installer.resolveDependencies(operation.id, { selectedModIds: ['NeedsReadyLibrary'] });
  assert.equal(operation.phase, 'ready_to_apply');
  assert.deepEqual(operation.review.workshopItemsToAdd, ['810', '811']);
  assert.deepEqual(operation.review.modsToAdd, ['ReadyLibrary', 'NeedsReadyLibrary']);
});

test('Workshop install reports a saved config when restart does not return online', async (t) => {
  const env = await createInstallEnv(t);
  const installer = new WorkshopModInstallService({
    configFiles: env.configFiles,
    downloader: {
      workshopRoot: env.workshopRoot,
      async download(workshopId) {
        await writeMod(env.workshopRoot, workshopId, 'RestartCase', '42', ['id=RestartCase']);
      },
    },
    systemd: {
      async restart() {
        return { unit: 'project-zomboid.service', online: false, activeState: 'failed', subState: 'failed' };
      },
    },
  });

  let operation = await installer.start('900');
  operation = await waitForPhase(installer, operation.id, 'select_mods');
  operation = await installer.resolveDependencies(operation.id, { selectedModIds: ['RestartCase'] });
  operation = await installer.apply(operation.id, { revision: operation.review.revision, selectedMapFolders: [] });

  assert.equal(operation.phase, 'failed');
  assert.equal(operation.applyResult.configSaved, true);
  assert.match(operation.error.message, /Config saved, but mod activation restart failed/);
});

async function createInstallEnv(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pz-workshop-install-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configDir = path.join(root, 'Server');
  const backupDir = path.join(root, 'backups');
  const serverDir = path.join(root, 'pz-server');
  const workshopRoot = path.join(serverDir, 'steamapps', 'workshop', 'content', '108600');
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(workshopRoot, { recursive: true });
  await fs.copyFile(new URL('./fixtures/server.ini', import.meta.url), path.join(configDir, 'servertest.ini'));
  await fs.appendFile(path.join(configDir, 'servertest.ini'), '\nMap=Muldraugh, KY\n');
  return {
    configDir,
    workshopRoot,
    configFiles: new ConfigFileService({ configDir, backupDir, serverName: 'servertest' }),
  };
}

async function writeMod(workshopRoot, workshopId, modFolder, versionFolder, lines) {
  const folder = path.join(workshopRoot, workshopId, 'mods', modFolder, versionFolder);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'mod.info'), `${lines.join('\n')}\n`);
}

async function waitForPhase(installer, operationId, phase) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const operation = await installer.status(operationId);
    if (operation.phase === phase || operation.phase === 'failed') {
      assert.equal(operation.phase, phase, operation.error?.message);
      return operation;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Operation ${operationId} did not reach ${phase}.`);
}
