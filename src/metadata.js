const INI_METADATA = {
  PublicName: text('General', 'Server name shown in the browser.'),
  PublicDescription: text('General', 'Server description shown in the browser.', 'textarea'),
  Public: flag('General', 'Whether the server appears in the Steam server browser.'),
  Open: flag('General', 'Allow players to join without a whitelist entry.'),
  Password: secret('General', 'Password required to join the server.'),
  MaxPlayers: number('General', 'Maximum connected players.', 1, 100),
  PauseEmpty: flag('General', 'Pause simulation while the server is empty.'),
  ServerWelcomeMessage: text('General', 'Message shown after players connect.', 'textarea'),
  Map: text('General', 'Map list used by the server.'),
  SaveWorldEveryMinutes: number('General', 'Automatic world save interval in minutes.', 0, 120),
  AnnounceDeath: flag('General', 'Broadcast player deaths.'),
  DefaultPort: number('Network', 'Primary game connection port.', 1024, 65535),
  UDPPort: number('Network', 'Secondary UDP port when present.', 1024, 65535),
  UPnP: flag('Network', 'Ask a local gateway to create port mappings.'),
  PingFrequency: number('Network', 'Connection ping check interval in seconds.', 1, 60),
  PingLimit: number('Network', 'Ping threshold in milliseconds.', 0, 5000),
  RCONPort: number('RCON', 'RCON port for server administration.', 1024, 65535),
  RCONPassword: secret('RCON', 'Password used by RCON clients.'),
  PVP: flag('PvP', 'Allow player versus player combat.'),
  SafetySystem: flag('PvP', 'Allow players to toggle the PvP safety system.'),
  SteamVAC: flag('Security', 'Enable Steam VAC checks.'),
  AutoCreateUserInWhiteList: flag('Accounts', 'Create account records when players join.'),
  Mods: list('Mods', 'Active mod IDs. Managed in the dedicated Mods editor.', true),
  WorkshopItems: list('Mods', 'Steam Workshop item IDs. Managed in the dedicated Mods editor.', true),
};

const SANDBOX_METADATA = {
  Zombies: choice('Gameplay', 'Overall zombie count preset.', [
    ['0', 'None'],
    ['1', 'Insane'],
    ['2', 'Very High'],
    ['3', 'High'],
    ['4', 'Normal'],
    ['5', 'Low'],
  ]),
  Distribution: choice('Gameplay', 'Zombie distribution pattern.', [
    ['1', 'Urban Focused'],
    ['2', 'Uniform'],
  ]),
  DayLength: choice('Time', 'Real-time length of one in-game day.', [
    ['1', '15 minutes'],
    ['2', '30 minutes'],
    ['3', '1 hour'],
    ['4', '2 hours'],
    ['5', '3 hours'],
    ['6', '4 hours'],
    ['7', '5 hours'],
    ['8', '6 hours'],
    ['9', '7 hours'],
    ['10', '8 hours'],
    ['11', '9 hours'],
    ['12', '10 hours'],
    ['13', '11 hours'],
    ['14', '12 hours'],
  ]),
  StartYear: number('Time', 'World start year.', 1),
  StartMonth: number('Time', 'World start month.', 1, 12),
  StartDay: number('Time', 'World start day.', 1, 31),
  XpMultiplier: number('Gameplay', 'Experience multiplier.', 0.01, 1000),
  Temperature: scale('World', 'World temperature modifier.', ['Very Cold', 'Cold', 'Normal', 'Hot', 'Very Hot']),
  Rain: scale('World', 'Rain frequency modifier.', ['Very Dry', 'Dry', 'Normal', 'Rainy', 'Very Rainy']),
  WaterShut: number('World', 'Day when water shuts off. -1 means never.', -1, 3650),
  ElecShut: number('World', 'Day when electricity shuts off. -1 means never.', -1, 3650),
  'ZombieLore.Speed': choice('Zombie Lore', 'Zombie movement speed.', [
    ['1', 'Sprinters'],
    ['2', 'Fast Shamblers'],
    ['3', 'Shamblers'],
    ['4', 'Random'],
  ]),
  'ZombieLore.Strength': scale('Zombie Lore', 'Zombie combat strength.', ['Superhuman', 'Normal', 'Weak']),
  'ZombieLore.Toughness': scale('Zombie Lore', 'Zombie toughness.', ['Tough', 'Normal', 'Fragile']),
  'ZombieLore.Transmission': choice('Zombie Lore', 'Infection transmission rule.', [
    ['1', 'Blood and Saliva'],
    ['2', 'Saliva Only'],
    ['3', 'Everyone Infected'],
    ['4', 'None'],
  ]),
  'ZombieConfig.PopulationMultiplier': number('Zombie Population', 'Overall zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationStartMultiplier': number('Zombie Population', 'Day one zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationPeakMultiplier': number('Zombie Population', 'Peak zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationPeakDay': number('Zombie Population', 'Day when population reaches its peak.', 1, 3650),
  'ZombieConfig.RespawnHours': number('Zombie Population', 'Hours before zombies can respawn.', 0, 8760),
  'ZombieConfig.RespawnUnseenHours': number('Zombie Population', 'Hours a cell must be unseen before respawn.', 0, 8760),
  'ZombieConfig.RespawnMultiplier': number('Zombie Population', 'Fraction of zombies that respawn.', 0, 1),
};

export function metadataForSettings(kind, settings) {
  const catalog = kind === 'ini' ? INI_METADATA : SANDBOX_METADATA;

  return Object.fromEntries(Object.entries(settings).map(([key, value]) => {
    const known = catalog[key] || {};
    const inferredType = known.type || inferType(kind, value);
    const sensitive = known.sensitive || isSensitiveKey(key);
    const readOnly = known.readOnly || (kind === 'ini' && (key === 'Mods' || key === 'WorkshopItems'));

    return [key, {
      label: known.label || key,
      group: known.group || inferGroup(kind, key),
      description: known.description || 'Existing setting from the server config file.',
      type: inferredType,
      sensitive,
      readOnly,
      options: known.options,
      min: known.min,
      max: known.max,
    }];
  }));
}

export function isSensitiveKey(key) {
  return /password|secret|token/i.test(key);
}

function inferType(kind, value) {
  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (kind === 'ini' && typeof value === 'string') {
    if (value === 'true' || value === 'false') {
      return 'boolean';
    }

    if (/^-?\d+(?:\.\d+)?$/.test(value)) {
      return 'number';
    }
  }

  return 'string';
}

function inferGroup(kind, key) {
  if (kind === 'ini') {
    return 'Other';
  }

  const [section] = key.split('.');
  return section === key ? 'Other' : section;
}

function text(group, description, type = 'string') {
  return { type, group, description };
}

function secret(group, description) {
  return { type: 'string', group, description, sensitive: true };
}

function flag(group, description) {
  return { type: 'boolean', group, description };
}

function number(group, description, min = undefined, max = undefined) {
  return { type: 'number', group, description, min, max };
}

function list(group, description, readOnly = false) {
  return { type: 'string', group, description, readOnly };
}

function choice(group, description, pairs) {
  return {
    type: 'enum',
    group,
    description,
    options: pairs.map(([value, label]) => ({ value, label })),
  };
}

function scale(group, description, labels) {
  return choice(group, description, labels.map((label, index) => [String(index + 1), label]));
}
