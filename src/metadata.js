const INI_METADATA = {
  // General
  PublicName: text('General', 'Server name shown in the Steam and in-game server browser.'),
  PublicDescription: text('General', 'Description displayed in the in-game public server browser. Use <LINE> for new lines.', 'textarea'),
  Public: flag('General', 'Whether the server appears in the Steam server browser.'),
  Open: flag('General', 'Allow players to join without requiring a whitelist entry.'),
  Password: secret('General', 'Password required to join the server. Leave empty for no password.'),
  MaxPlayers: number('General', 'Maximum connected players. Above 32 may cause desync.', 1, 100),
  PauseEmpty: flag('General', 'Pause game time when no players are online.'),
  ServerWelcomeMessage: text('General', 'Welcome message shown after players connect. Use <LINE> for new lines, RGB colors supported.', 'textarea'),
  Map: text('General', 'Map the server runs on. Default is Muldraugh, KY.'),
  SaveWorldEveryMinutes: number('General', 'Auto-save world interval in minutes. 0 = never.', 0, 120),
  AnnounceDeath: flag('General', 'Broadcast a global message when a player dies.'),
  AnnounceAnimalDeath: flag('General', 'Broadcast a global message when an animal dies.'),
  Seed: text('General', 'World generation seed. Changing this requires deleting map_worldgen.bin.'),
  ServerImageLoginScreen: text('General', 'Custom login screen image. PNG, recommended 1920x1080.'),
  ServerImageLoadingScreen: text('General', 'Custom loading screen image. PNG, recommended 1920x1080.'),
  ServerImageIcon: text('General', 'Custom server icon for the browser. Square PNG, min 256x256.'),

  // Network
  DefaultPort: number('Network', 'Primary game connection port players use to join.', 1024, 65535),
  UDPPort: number('Network', 'Secondary UDP port used alongside DefaultPort.', 1024, 65535),
  UPnP: flag('Network', 'Auto-configure port forwarding via UPnP on supported routers.'),
  PingFrequency: number('Network', 'Interval in seconds between connection ping checks.', 1, 60),
  PingLimit: number('Network', 'Ping threshold in ms before kicking. 0 = disabled.', 0, 5000),
  DenyLoginOnOverloadedServer: flag('Network', 'Prevent new connections when the server is overloaded.'),
  SpeedLimit: number('Network', 'Maximum player movement speed.', 10, 200),
  UseTCPForMapDownloads: flag('Network', 'Use TCP instead of UDP for map downloads.'),
  LoginQueueEnabled: flag('Network', 'Enable a login queue when the server is full.'),
  LoginQueueConnectTimeout: number('Network', 'Seconds before a queued connection times out.', 20, 1200),
  server_browser_announced_ip: text('Network', 'IP broadcast to the server browser. For multi-IP setups.'),
  MultiplayerStatisticsPeriod: number('Network', 'Statistics update period in seconds. 0 = disabled.', 0, 10),
  MaxPacketsPerSecond: number('Network', 'Maximum network packets per second.', 100, 1000),

  // PvP
  PVP: flag('PvP', 'Allow player versus player combat globally.'),
  SafetySystem: flag('PvP', 'Let each player toggle their own PvP mode on and off.'),
  ShowSafety: flag('PvP', 'Show skull icon over players who have PvP enabled.'),
  SafetyToggleTimer: number('PvP', 'Seconds to switch PvP mode on or off.', 0, 60),
  SafetyCooldownTimer: number('PvP', 'Seconds before you can toggle PvP again.', 0, 60),
  SafetyDisconnectDelay: number('PvP', 'Seconds before safety resets on disconnect.', 0, 60),
  PVPMeleeWhileHitReaction: flag('PvP', 'Allow melee attacks during hit reaction in PvP.'),
  PVPMeleeDamageModifier: number('PvP', 'PvP melee damage multiplier in percent.', 0, 500),
  PVPFirearmDamageModifier: number('PvP', 'PvP firearm damage multiplier in percent.', 0, 500),
  PlayerBumpPlayer: flag('PvP', 'Players can bump and knock over other players when running.'),
  PVPLogToolChat: flag('PvP', 'Log PvP events to admin chat.'),
  PVPLogToolFile: flag('PvP', 'Log PvP events to a file.'),

  // Chat
  GlobalChat: flag('Chat', 'Enable /all command for server-wide chat.'),
  ChatStreams: text('Chat', 'Enabled chat streams: s=say, r=radio, a=admin, w=whisper, y=yell, sh=safehouse, f=faction.'),
  DisplayUserName: flag('Chat', 'Show player usernames above their heads and in chat.'),
  ShowFirstAndLastName: flag('Chat', 'Show character first and last name instead of username.'),
  MouseOverToSeeDisplayName: flag('Chat', 'Require mouse hover to see player display names.'),
  HidePlayersBehindYou: flag('Chat', 'Hide names of players behind your character.'),
  AllowNonAsciiUsername: flag('Chat', 'Allow non-ASCII characters (cyrillic, etc.) in usernames.'),
  BanKickGlobalSound: flag('Chat', 'Play a global sound when a player is banned or kicked.'),
  UsernameDisguises: flag('Chat', 'Allow players to disguise their username.'),
  HideDisguisedUserName: flag('Chat', 'Hide the real username of disguised players.'),
  ChatMessageCharacterLimit: number('Chat', 'Maximum characters per chat message.', 64, 1024),
  ChatMessageSlowModeTime: number('Chat', 'Seconds between allowed chat messages per player.', 1, 30),

  // Players & Accounts
  MaxAccountsPerUser: number('Players', 'Max accounts per Steam user. 0 = unlimited.', 0, 10),
  DropOffWhiteListAfterDeath: flag('Players', 'Remove player from whitelist when their character dies.'),
  KickFastPlayers: flag('Players', 'Kick players moving faster than possible. May be buggy.'),
  SpawnPoint: text('Players', 'Custom spawn coordinates (X,Y,Z). 0,0,0 for default.'),
  SpawnItems: text('Players', 'Items new characters spawn with, comma-separated.'),
  SleepAllowed: flag('Players', 'Allow players to sleep when tired.'),
  SleepNeeded: flag('Players', 'Players need to sleep when exhausted. Requires SleepAllowed.'),
  PlayerRespawnWithSelf: flag('Players', 'Allow respawning at death location.'),
  PlayerRespawnWithOther: flag('Players', 'Allow spawning at a splitscreen partner location.'),
  PlayerSaveOnDamage: flag('Players', 'Save player state when they take damage.'),
  MinutesPerPage: number('Players', 'In-game minutes to read a single page.', 0.1, 10),
  AllowCoop: flag('Players', 'Allow co-op and splitscreen players to join.'),
  KnockedDownAllowed: flag('Players', 'Allow players to be knocked down. WIP: may desync.'),
  SneakModeHideFromOtherPlayers: flag('Players', 'Players in sneak mode are hidden from other players.'),
  MapRemotePlayerVisibility: choice('Players', 'Who can see other players on the map.', [
    ['1', 'Hidden'],
    ['2', 'Friends Only'],
    ['3', 'Friends and nearby players'],
    ['4', 'Everyone'],
  ]),
  DisableScoreboard: flag('Players', 'Disable the in-game scoreboard.'),
  HideAdminsInPlayerList: flag('Players', 'Hide admin accounts from the player list.'),
  FastForwardMultiplier: number('Players', 'Time speed multiplier while players sleep.', 1, 100),

  // Factions
  Faction: flag('Players', 'Allow creation and use of factions.'),
  FactionDaySurvivedToCreate: number('Players', 'Days a player must survive to create a faction.', 0, 365),
  FactionPlayersRequiredForTag: number('Players', 'Players required in a faction to show its tag.', 1, 50),
  AllowTradeUI: flag('Players', 'Allow players to directly trade with each other.'),

  // Safehouses
  PlayerSafehouse: flag('Safehouses', 'Allow players to claim safehouses.'),
  AdminSafehouse: flag('Safehouses', 'Allow admins to have safehouses.'),
  SafehouseAllowTrepass: flag('Safehouses', 'Allow non-members to enter a safehouse without invite.'),
  SafehouseAllowFire: flag('Safehouses', 'Allow fire to damage safehouses.'),
  SafehouseAllowLoot: flag('Safehouses', 'Allow non-members to take items from safehouses.'),
  SafehouseAllowRespawn: flag('Safehouses', 'Players respawn in their safehouse if they were a member.'),
  SafehouseDaySurvivedToClaim: number('Safehouses', 'Days a player must survive before claiming a safehouse.', 0, 365),
  SafeHouseRemovalTime: number('Safehouses', 'Real-time hours of inactivity before removal from safehouse.', 0, 720),
  DisableSafehouseWhenOwnerConnected: flag('Safehouses', 'Disable safehouse protection when the owner is online.'),
  SafehouseAllowNonResidential: flag('Safehouses', 'Allow claiming non-residential buildings as safehouses.'),
  SafehouseDisableDisguises: flag('Safehouses', 'Disable username disguises inside safehouses.'),
  MaxSafezoneSize: number('Safehouses', 'Maximum tile size for safezones.', 0),
  SafehousePreventsLootRespawn: flag('Safehouses', 'Prevent loot respawn in claimed safehouses.'),

  // Loot & Items
  HoursForLootRespawn: number('Loot', 'In-game hours before loot can respawn. 0 = never.', 0, 8760),
  MaxItemsForLootRespawn: number('Loot', 'Max items in container before respawn is blocked.', 0, 100),
  ConstructionPreventsLootRespawn: flag('Loot', 'Player constructions near containers prevent loot respawn.'),
  HoursForWorldItemRemoval: number('Loot', 'Hours before items on the ground disappear. 0 = never.', 0, 8760),
  ItemNumbersLimitPerContainer: number('Loot', 'Max items per container. 0 = unlimited.', 0, 9000),
  TrashDeleteAll: flag('Loot', 'Delete all items when placed in trash.'),
  BloodSplatLifespanDays: number('Loot', 'Days before blood splats disappear. 0 = never.', 0, 365),
  RemovePlayerCorpsesOnCorpseRemoval: flag('Loot', 'Remove player corpses when corpse cleanup runs.'),
  AllowDestructionBySledgehammer: flag('Loot', 'Allow sledgehammer destruction of world objects.'),
  SledgehammerOnlyInSafehouse: flag('Loot', 'Restrict sledgehammer destruction to safehouses only.'),
  NoFire: flag('Loot', 'Disable all fire except campfires.'),

  // Mods & Workshop
  Mods: list('Mods', 'Active mod IDs. Managed in the dedicated Mods editor.', true),
  WorkshopItems: list('Mods', 'Steam Workshop item IDs. Managed in the dedicated Mods editor.', true),
  DoLuaChecksum: flag('Mods', 'Verify client Lua files match the server. Disable when using mods that alter server Lua.'),

  // Steam Integration
  SteamPort1: number('Steam', 'First Steam networking port.', 1024, 65535),
  SteamPort2: number('Steam', 'Second Steam networking port.', 1024, 65535),
  SteamScoreboard: choice('Steam', 'Show Steam names and avatars in the player list.', [
    ['true', 'Everyone'],
    ['false', 'No One'],
    ['admin', 'Admins Only'],
  ]),
  SteamVAC: flag('Steam', 'Check connecting players for VAC bans.'),

  // Voice Chat
  VoiceEnable: flag('Voice', 'Enable in-game voice chat.'),
  Voice3D: flag('Voice', 'Enable 3D directional voice chat.'),
  VoiceMinDistance: number('Voice', 'Minimum distance for voice chat to be heard.', 1, 100),
  VoiceMaxDistance: number('Voice', 'Maximum distance for voice chat to be heard.', 10, 1000),

  // Discord
  DiscordEnable: flag('Discord', 'Enable built-in Discord integration.'),
  DiscordToken: secret('Discord', 'Discord bot access token.'),
  DiscordChannel: text('Discord', 'Discord channel name for chat integration.'),
  DiscordChannelID: text('Discord', 'Discord channel ID.'),
  DiscordChatChannel: text('Discord', 'Discord channel name for game chat relay.'),
  DiscordLogChannel: text('Discord', 'Discord channel name for server logs.'),
  DiscordCommandChannel: text('Discord', 'Discord channel name for commands.'),
  WebhookAddress: text('Discord', 'Incoming webhook URL for Slack/Discord notifications.'),

  // RCON
  RCONPort: number('RCON', 'Port for RCON remote administration.', 1024, 65535),
  RCONPassword: secret('RCON', 'Password used by RCON clients to connect.'),

  // Backups
  BackupsCount: number('Backups', 'Number of backup copies to keep.', 1, 300),
  BackupsOnStart: flag('Backups', 'Create a backup when the server starts.'),
  BackupsOnVersionChange: flag('Backups', 'Create a backup when the game version changes.'),
  BackupsPeriod: number('Backups', 'Minutes between automatic backups. 0 = disabled.', 0, 1500),

  // Vehicles
  DisableVehicleTowing: flag('Vehicles', 'Disable vehicle towing.'),
  DisableTrailerTowing: flag('Vehicles', 'Disable trailer towing.'),
  DisableBurntTowing: flag('Vehicles', 'Disable towing of burnt vehicles.'),
  CarEngineAttractionModifier: number('Vehicles', 'Zombie attraction range to car engines.', 0, 10),

  // Anti-Cheat
  AntiCheatSafety: choice('Anti-Cheat', 'Anti-cheat: safety system.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatMovement: choice('Anti-Cheat', 'Anti-cheat: player movement.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatHit: choice('Anti-Cheat', 'Anti-cheat: hit detection.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatPacket: choice('Anti-Cheat', 'Anti-cheat: network packets.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatPermission: choice('Anti-Cheat', 'Anti-cheat: permissions.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatXP: choice('Anti-Cheat', 'Anti-cheat: XP validation.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatFire: choice('Anti-Cheat', 'Anti-cheat: fire checks.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatSafeHouse: choice('Anti-Cheat', 'Anti-cheat: safehouse protection.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatRecipe: choice('Anti-Cheat', 'Anti-cheat: recipe checks.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatPlayer: choice('Anti-Cheat', 'Anti-cheat: player validation.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatChecksum: choice('Anti-Cheat', 'Anti-cheat: checksum validation.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatItem: choice('Anti-Cheat', 'Anti-cheat: item checks.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),
  AntiCheatServerCustomization: choice('Anti-Cheat', 'Anti-cheat: server customization.', [
    ['1', '1 - Disabled'], ['2', '2 - Log Only'], ['3', '3 - Log + Kick'], ['4', '4 - Full Protection'],
  ]),

  // Moderation
  BadWordListFile: text('Moderation', 'Path to file with prohibited words, one per line.'),
  GoodWordListFile: text('Moderation', 'Path to file with allowed words that may contain bad words.'),
  BadWordPolicy: choice('Moderation', 'Action when a bad word is detected in chat.', [
    ['1', 'Ban'], ['2', 'Kick'], ['3', 'Record Violation'], ['4', 'Mute'],
  ]),
  BadWordReplacement: text('Moderation', 'Text that replaces bad words in chat.'),

  // Radio
  DisableRadioStaff: flag('Radio', 'Disable radio for staff access level.'),
  DisableRadioAdmin: flag('Radio', 'Disable radio for admin access level.'),
  DisableRadioGM: flag('Radio', 'Disable radio for GM access level.'),
  DisableRadioOverseer: flag('Radio', 'Disable radio for overseer access level.'),
  DisableRadioModerator: flag('Radio', 'Disable radio for moderator access level.'),
  DisableRadioInvisible: flag('Radio', 'Disable radio for invisible players.'),

  // Faction War
  War: flag('Faction War', 'Enable the faction war system.'),
  WarStartDelay: number('Faction War', 'Seconds before war starts after being declared.', 60),
  WarDuration: number('Faction War', 'War duration in seconds.', 60),
  WarSafehouseHitPoints: number('Faction War', 'Safehouse hit points during faction war.', 0),

  // Logging
  ClientCommandFilter: text('Logging', 'Commands to exclude from cmd.txt log. Prefix with - to exclude, + to include.'),
  ClientActionLogs: text('Logging', 'Actions written to ClientActionLogs.txt, semicolon-separated.'),
  PerkLogs: flag('Logging', 'Track player perk level changes in PerkLog.txt.'),

  // Advanced
  ResetID: text('Advanced', 'Removing this resets zombies and loot without affecting time.'),
  ServerPlayerID: text('Advanced', 'Identifies if a character is from another server or single player.'),
  SwitchZombiesOwnershipEachUpdate: flag('Advanced', 'Switch zombie ownership between players each tick.'),
  UltraSpeedDoesnotAffectToAnimals: flag('Advanced', 'Ultra speed mode does not affect animal simulation.'),
  UsePhysicsHitReaction: flag('Advanced', 'Use physics-based hit reactions.'),
  PhysicsDelay: number('Advanced', 'Physics update delay in milliseconds.', 100, 2000),
  ZombieUpdateMaxHighPriority: number('Advanced', 'Max high priority zombie updates per tick.', 10, 200),
  ZombieUpdateDelta: number('Advanced', 'Zombie update time delta.', 0.1, 2),
  AutoCreateUserInWhiteList: flag('Accounts', 'Create account records when players join.'),
};

const SANDBOX_METADATA = {
  // Gameplay
  Zombies: choice('Gameplay', 'Overall zombie population level. Also sets Population Multiplier in Advanced Zombie Options.', [
    ['1', 'Insane'],
    ['2', 'Very High'],
    ['3', 'High'],
    ['4', 'Normal'],
    ['5', 'Low'],
    ['6', 'None'],
  ]),
  Distribution: choice('Gameplay', 'How zombies are distributed across the map.', [
    ['1', 'Urban Focused'],
    ['2', 'Uniform'],
  ]),
  ZombieVoronoiNoise: flag('Gameplay', 'Apply randomization to zombie distribution.'),
  ZombieRespawn: choice('Gameplay', 'How frequently new zombies are added to the world.', [
    ['1', 'High'], ['2', 'Normal'], ['3', 'Low'], ['4', 'None'],
  ]),
  ZombieMigrate: flag('Gameplay', 'Zombies can migrate to empty cells.'),
  XpMultiplier: number('Gameplay', 'Overall experience point multiplier.', 0.01, 1000),
  StarterKit: flag('Gameplay', 'Spawn with chips, water bottle, backpack, bat, and hammer.'),
  Nutrition: flag('Gameplay', 'Nutritional value of food affects player condition and weight.'),
  MultiHitZombies: flag('Gameplay', 'Melee weapons can hit multiple zombies in one swing.'),
  RearVulnerability: scale('Gameplay', 'Chance of being bitten when attacked from behind.', ['Low', 'Medium', 'High']),

  // Time
  DayLength: choice('Time', 'Real-time length of one in-game day.', [
    ['1', '15 min'], ['2', '30 min'], ['3', '1 hour'], ['4', '1h 30m'],
    ['5', '2 hours'], ['6', '3 hours'], ['7', '4 hours'], ['8', '5 hours'],
    ['9', '6 hours'], ['10', '7 hours'], ['11', '8 hours'], ['12', '9 hours'],
    ['13', '10 hours'], ['14', '11 hours'], ['15', '12 hours'], ['16', '13 hours'],
    ['17', '14 hours'], ['18', '15 hours'], ['19', '16 hours'], ['20', '17 hours'],
    ['21', '18 hours'], ['22', '19 hours'], ['23', '20 hours'], ['24', '21 hours'],
    ['25', '22 hours'], ['26', '23 hours'], ['27', 'Real-time'],
  ]),
  StartYear: number('Time', 'Year the in-game calendar starts on.', 1),
  StartMonth: number('Time', 'Month the game starts in (1=Jan, 12=Dec).', 1, 12),
  StartDay: number('Time', 'Day of the month the game starts on.', 1, 28),
  StartTime: choice('Time', 'Hour of day the game starts.', [
    ['1', '7 AM'], ['2', '9 AM'], ['3', '12 PM'], ['4', '2 PM'],
    ['5', '5 PM'], ['6', '9 PM'], ['7', '12 AM'], ['8', '2 AM'], ['9', '5 AM'],
  ]),
  DayNightCycle: choice('Time', 'Whether time of day changes naturally.', [
    ['1', 'Normal'], ['2', 'Endless Day'], ['3', 'Endless Night'],
  ]),
  NightDarkness: scale('Time', 'Level of ambient lighting at night.', ['Pitch Black', 'Dark', 'Normal', 'Bright']),
  NightLength: choice('Time', 'Duration of nighttime from dusk to dawn.', [
    ['1', 'Always Night'], ['2', 'Long'], ['3', 'Normal'], ['4', 'Short'], ['5', 'Always Day'],
  ]),

  // Environment & Weather
  Temperature: scale('Weather', 'Global temperature setting.', ['Very Cold', 'Cold', 'Normal', 'Hot', 'Very Hot']),
  Rain: scale('Weather', 'How often it rains.', ['Very Dry', 'Dry', 'Normal', 'Rainy', 'Very Rainy']),
  ClimateCycle: choice('Weather', 'Whether weather changes or stays fixed.', [
    ['1', 'Normal'], ['2', 'No Weather'], ['3', 'Endless Rain'],
    ['4', 'Endless Storm'], ['5', 'Endless Snow'], ['6', 'Endless Blizzard'],
  ]),
  FogCycle: choice('Weather', 'Whether fog occurs naturally.', [
    ['1', 'Normal'], ['2', 'No Fog'], ['3', 'Endless Fog'],
  ]),
  MaxFogIntensity: choice('Weather', 'Maximum fog intensity.', [
    ['1', 'Normal'], ['2', 'Moderate'], ['3', 'Low'], ['4', 'None'],
  ]),
  MaxRainFxIntensity: choice('Weather', 'Maximum rain visual intensity.', [
    ['1', 'Normal'], ['2', 'Moderate'], ['3', 'Low'],
  ]),
  EnableSnowOnGround: flag('Weather', 'Snow accumulates on the ground.'),
  WaterShut: number('Weather', 'Day when water shuts off. -1 = never.', -1, 3650),
  ElecShut: number('Weather', 'Day when electricity shuts off. -1 = never.', -1, 3650),
  WaterShutModifier: number('Weather', 'Fine-tune water shutoff timing in days.', -1),
  ElecShutModifier: number('Weather', 'Fine-tune electricity shutoff timing in days.', -1),
  AlarmDecay: number('Weather', 'Day when alarm batteries die. -1 = never.', -1, 3650),
  AlarmDecayModifier: number('Weather', 'Fine-tune alarm decay timing in days.', -1),
  ErosionSpeed: scale('Weather', 'How fast nature reclaims the world.', ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  ErosionDays: number('Weather', 'Custom erosion duration in days. 0 = use ErosionSpeed.', 0, 36500),
  TimeSinceApo: choice('Weather', 'How long after the outbreak the game starts.', [
    ['1', '0'], ['2', '1'], ['3', '2'], ['4', '3'], ['5', '4'],
    ['6', '5'], ['7', '6'], ['8', '7'], ['9', '8'], ['10', '9'],
    ['11', '10'], ['12', '11'], ['13', '12'],
  ]),

  // Loot & Resources
  FoodLootNew: number('Loot', 'Fresh food that can rot or spoil.', 0, 4),
  CannedFoodLootNew: number('Loot', 'Canned and dried food, beverages.', 0, 4),
  LiteratureLootNew: number('Loot', 'Readable items including books, fliers, newspapers.', 0, 4),
  SkillBookLoot: number('Loot', 'Books that provide skill XP multipliers.', 0, 4),
  RecipeResourceLoot: number('Loot', 'Items that teach recipes.', 0, 4),
  MedicalLootNew: number('Loot', 'Medicine, bandages, and first aid tools.', 0, 4),
  SurvivalGearsLootNew: number('Loot', 'Fishing rods, tents, camping gear.', 0, 4),
  WeaponLootNew: number('Loot', 'Melee weapons not in other categories.', 0, 4),
  RangedWeaponLootNew: number('Loot', 'Ranged weapons and attachments.', 0, 4),
  AmmoLootNew: number('Loot', 'Loose ammo, boxes, and magazines.', 0, 4),
  MechanicsLootNew: number('Loot', 'Vehicle parts and installation tools.', 0, 4),
  ClothingLootNew: number('Loot', 'Wearable items that are not containers.', 0, 4),
  ContainerLootNew: number('Loot', 'Backpacks and wearable containers.', 0, 4),
  KeyLootNew: number('Loot', 'Keys, key rings, and locks.', 0, 4),
  MediaLootNew: number('Loot', 'VHS tapes and CDs.', 0, 4),
  MementoLootNew: number('Loot', 'Spiffo items, plushies, and keepsakes.', 0, 4),
  CookwareLootNew: number('Loot', 'Cooking items that may double as weapons.', 0, 4),
  MaterialLootNew: number('Loot', 'Crafting and building materials.', 0, 4),
  FarmingLootNew: number('Loot', 'Seeds, trowels, shovels, and farming tools.', 0, 4),
  ToolLootNew: number('Loot', 'Tools not in other categories like Mechanics or Farming.', 0, 4),
  OtherLootNew: number('Loot', 'Miscellaneous items. Also affects foraging in Town/Road zones.', 0, 4),
  RollsMultiplier: number('Loot', 'Loot table roll multiplier. Changing can affect performance.', 0.1, 100),
  LootItemRemovalList: text('Loot', 'Comma-separated item types that will not spawn as loot.'),
  RemoveStoryLoot: flag('Loot', 'Removal list items also excluded from world stories.'),
  RemoveZombieLoot: flag('Loot', 'Removal list items also excluded from zombie loot.'),
  ZombiePopLootEffect: number('Loot', 'Loot increases near zombies, multiplied by this value. 0 = disabled.', 0, 20),
  HoursForLootRespawn: number('Loot', 'Hours before containers respawn loot. 0 = never.', 0),
  MaxItemsForLootRespawn: number('Loot', 'Containers with this many items will not respawn.', 0),
  ConstructionPreventsLootRespawn: flag('Loot', 'Player constructions block loot respawn.'),
  SeenHoursPreventLootRespawn: number('Loot', 'Hours a zone must be unvisited before respawn. 0 = disabled.', 0),
  WorldItemRemovalList: text('Loot', 'Comma-separated item types removed after HoursForWorldItemRemoval.'),
  HoursForWorldItemRemoval: number('Loot', 'Hours before dropped items are removed. 0 = never.', 0),
  ItemRemovalListBlacklistToggle: flag('Loot', 'If true, items NOT in the removal list are removed instead.'),

  // Loot Rarity
  InsaneLootFactor: number('Loot Rarity', 'Spawn rate for Insane rarity items.', 0, 0.2),
  ExtremeLootFactor: number('Loot Rarity', 'Spawn rate for Extreme rarity items.', 0.05, 0.6),
  RareLootFactor: number('Loot Rarity', 'Spawn rate for Rare rarity items.', 0.2, 1),
  NormalLootFactor: number('Loot Rarity', 'Spawn rate for Normal rarity items.', 0.6, 2),
  CommonLootFactor: number('Loot Rarity', 'Spawn rate for Common rarity items.', 1, 3),
  AbundantLootFactor: number('Loot Rarity', 'Spawn rate for Abundant rarity items.', 2, 4),
  MaximumLooted: number('Loot Rarity', 'Chance a building is already looted when found.', 0, 200),
  DaysUntilMaximumLooted: number('Loot Rarity', 'Days before Max Looted chance is reached.', 0, 3650),
  RuralLooted: number('Loot Rarity', 'Chance a rural building is already looted.', 0, 2),
  MaximumDiminishedLoot: number('Loot Rarity', 'Max loot that wont spawn at peak diminished days.', 0, 100),
  DaysUntilMaximumDiminishedLoot: number('Loot Rarity', 'Days until Max Diminished Loot is reached.', 0, 3650),
  MaximumLootedBuildingRooms: number('Loot Rarity', 'Buildings with more rooms than this are not auto-looted.', 0, 200),
  BloodSplatLifespanDays: number('Loot Rarity', 'Days before blood splats disappear. 0 = never.', 0, 365),
  LiteratureCooldown: number('Loot Rarity', 'Days before a read item can provide XP again.', 1, 365),

  // Farming & Plants
  Farming: scale('Farming', 'Speed of plant growth.', ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  CompostTime: choice('Farming', 'Time for food to break down in a composter.', [
    ['1', '1 Week'], ['2', '2 Weeks'], ['3', '3 Weeks'], ['4', '4 Weeks'],
    ['5', '6 Weeks'], ['6', '8 Weeks'], ['7', '10 Weeks'], ['8', '12 Weeks'],
  ]),
  PlantResilience: scale('Farming', 'Water loss and disease resistance.', ['Very High', 'High', 'Normal', 'Low', 'Very Low']),
  PlantAbundance: scale('Farming', 'Harvest yield of plants.', ['Very Poor', 'Poor', 'Normal', 'Abundant', 'Very Abundant']),
  FarmingSpeedNew: number('Farming', 'Custom plant growth speed multiplier.', 0.1, 100),
  FarmingAmountNew: number('Farming', 'Custom harvest abundance multiplier.', 0.1, 10),
  KillInsideCrops: flag('Farming', 'Crops grown inside buildings die.'),
  PlantGrowingSeasons: flag('Farming', 'Plant growth is affected by seasons.'),
  PlaceDirtAboveground: flag('Farming', 'Allow farming above ground level. May affect performance.'),

  // Food & Cooking
  FoodRotSpeed: scale('Food', 'How fast food spoils.', ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  FridgeFactor: scale('Food', 'Fridge effectiveness at keeping food fresh.', ['Very Low', 'Low', 'Normal', 'High', 'Very High', 'No decay']),
  DaysForRottenFoodRemoval: number('Food', 'Days before rotten food is removed. -1 = never.', -1),
  EnablePoisoning: choice('Food', 'Whether poison can be added to food.', [
    ['1', 'True'], ['2', 'False'], ['3', 'Only bleach disabled'],
  ]),
  MaggotSpawn: choice('Food', 'Whether maggots spawn in corpses.', [
    ['1', 'In and Around Bodies'], ['2', 'In Bodies Only'], ['3', 'Never'],
  ]),
  LightBulbLifespan: number('Food', 'Lightbulb lifespan multiplier. 0 = never break.', 0, 1000),
  FishAbundance: scale('Food', 'Abundance of fish in rivers and lakes.', ['Very Poor', 'Poor', 'Normal', 'Abundant', 'Very Abundant']),

  // Survival & Health
  StatsDecrease: scale('Survival', 'Rate of hunger, thirst, and fatigue decrease.', ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  EndRegen: scale('Survival', 'Recovery speed from exhaustion.', ['Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  BoneFracture: flag('Survival', 'Players can get broken bones from impacts and falls.'),
  InjurySeverity: scale('Survival', 'Impact of injuries on the body and healing time.', ['Low', 'Normal', 'High']),
  HoursForCorpseRemoval: number('Survival', 'Hours before zombie corpses disappear. 0 = maggots disabled.', -1),
  DecayingCorpseHealthImpact: scale('Survival', 'Health impact from nearby decaying corpses.', ['None', 'Low', 'Normal', 'High', 'Insane']),
  ZombieHealthImpact: flag('Survival', 'Nearby living zombies also affect health and emotions.'),
  BloodLevel: scale('Survival', 'Blood spray from injuries.', ['None', 'Low', 'Normal', 'High', 'Ultra Gore']),
  ClothingDegradation: scale('Survival', 'How fast clothing degrades and gets dirty.', ['Disabled', 'Slow', 'Normal', 'Fast']),
  FireSpread: flag('Survival', 'Fires spread when started.'),
  AllowExteriorGenerator: flag('Survival', 'Generators work on exterior tiles, e.g., powering gas pumps.'),
  EnableTaintedWaterText: flag('Survival', 'Show a warning on tainted water.'),
  AttackBlockMovements: flag('Survival', 'Melee attacking slows you down.'),
  MuscleStrainFactor: number('Survival', 'Muscle strain multiplier from weapons and loads.', 0, 10),
  DiscomfortFactor: number('Survival', 'Discomfort multiplier from worn items.', 0, 10),
  WoundInfectionFactor: number('Survival', 'Damage from serious wound infections.', 0, 10),
  NoBlackClothes: flag('Survival', 'Randomized clothing tints are not too dark.'),
  EasyClimbing: flag('Survival', 'No failure chance when climbing sheet ropes or walls.'),

  // Combat & Firearms
  FirearmUseDamageChance: choice('Combat', 'Replace chance-to-hit with chance-to-damage.', [
    ['1', 'Disabled'], ['2', 'Zombies Only'], ['3', 'All Targets'],
  ]),
  FirearmNoiseMultiplier: number('Combat', 'Distance multiplier for gunshot noise.', 0.2, 2),
  FirearmJamMultiplier: number('Combat', 'Firearm jamming chance. 0 = no jams.', 0, 10),
  FirearmMoodleMultiplier: number('Combat', 'Moodle effects on hit chance. 0 = no penalty.', 0, 10),
  FirearmWeatherMultiplier: number('Combat', 'Weather effects on hit chance. 0 = no effect.', 0, 10),
  FirearmHeadGearEffect: flag('Combat', 'Headgear like welding masks affect hit chance.'),

  // World & Stories
  Helicopter: choice('World', 'How often a helicopter passes over the event zone.', [
    ['1', 'Never'], ['2', 'Once'], ['3', 'Sometimes'], ['4', 'Often'],
  ]),
  MetaEvent: choice('World', 'Frequency of zombie-attracting metagame events.', [
    ['1', 'Never'], ['2', 'Sometimes'], ['3', 'Often'],
  ]),
  SleepingEvent: choice('World', 'How often sleep events like nightmares occur.', [
    ['1', 'Never'], ['2', 'Sometimes'], ['3', 'Often'],
  ]),
  GeneratorFuelConsumption: number('World', 'Fuel consumed by generators per in-game hour.', 0, 100),
  GeneratorSpawning: scale('World', 'Chance of generators spawning.', ['None', 'Insanely Rare', 'Extremely Rare', 'Rare', 'Normal', 'Common', 'Abundant']),
  GeneratorTileRange: number('World', 'Tile range a generator provides power.', 1, 100),
  GeneratorVerticalPowerRange: number('World', 'Floors above and below a generator that get power.', 1, 15),
  AnnotatedMapChance: scale('World', 'Chance of looted maps with survivor notes.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often']),
  CharacterFreePoints: number('World', 'Free trait points during character creation.', -100, 100),
  ConstructionBonusPoints: scale('World', 'Extra hit points for player constructions.', ['Very Low', 'Low', 'Normal', 'High', 'Very High']),
  AllClothesUnlocked: flag('World', 'All clothing available in character creation.'),
  SurvivorHouseChance: scale('World', 'Chance of randomized survivor houses.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often', 'Always Tries']),
  VehicleStoryChance: scale('World', 'Chance of road story events.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often', 'Always Tries']),
  ZoneStoryChance: scale('World', 'Chance of zone-specific story events.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often', 'Always Tries']),
  NegativeTraitsPenalty: choice('World', 'Diminishing returns on negative trait points.', [
    ['1', 'None'], ['2', '1pt per 3 traits'], ['3', '1pt per 2 traits'], ['4', '1pt per trait after first'],
  ]),
  MetaKnowledge: choice('World', 'How unseen media content is displayed.', [
    ['1', 'Fully revealed'], ['2', 'Shown as ???'], ['3', 'Completely hidden'],
  ]),
  SeeNotLearntRecipe: flag('World', 'Show station recipes even if not learned yet.'),
  LevelForMediaXPCutoff: number('World', 'Skill level above which media gives no XP.', 0, 10),
  LevelForDismantleXPCutoff: number('World', 'Skill level above which scrapping gives no XP.', 0, 10),
  MaximumFireFuelHours: number('World', 'Max hours of fuel for campfires and stoves.', 1, 168),

  // Vehicles
  EnableVehicles: flag('Vehicles', 'Whether vehicles spawn in the world.'),
  CarSpawnRate: scale('Vehicles', 'How frequently vehicles are discovered.', ['None', 'Very Low', 'Low', 'Normal', 'High']),
  ZombieAttractionMultiplier: number('Vehicles', 'Engine loudness multiplier for zombie attraction.', 0, 100),
  VehicleEasyUse: flag('Vehicles', 'Found vehicles are unlocked and ready to use.'),
  InitialGas: scale('Vehicles', 'Gas level in discovered vehicles.', ['Very Low', 'Low', 'Normal', 'High', 'Very High', 'Full']),
  FuelStationGasInfinite: flag('Vehicles', 'Gas pumps never run out of fuel.'),
  FuelStationGasMin: number('Vehicles', 'Minimum fuel amount in gas pumps.', 0, 1),
  FuelStationGasMax: number('Vehicles', 'Maximum fuel amount in gas pumps.', 0, 1),
  FuelStationGasEmptyChance: number('Vehicles', 'Chance individual pumps are empty.', 0, 100),
  LockedCar: scale('Vehicles', 'How likely cars are locked.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often']),
  CarGasConsumption: number('Vehicles', 'Fuel consumption multiplier.', 0, 100),
  CarGeneralCondition: scale('Vehicles', 'General condition of discovered vehicles.', ['Very Low', 'Low', 'Normal', 'High', 'Very High']),
  CarDamageOnImpact: scale('Vehicles', 'Damage from vehicle crashes.', ['Very Low', 'Low', 'Normal', 'High', 'Very High']),
  DamageToPlayerFromHitByACar: scale('Vehicles', 'Damage received when hit by a car.', ['None', 'Low', 'Normal', 'High', 'Very High']),
  TrafficJam: flag('Vehicles', 'Traffic jams of wrecked cars appear on main roads.'),
  CarAlarm: scale('Vehicles', 'Frequency of vehicle alarms.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often']),
  PlayerDamageFromCrash: flag('Vehicles', 'Players can be injured in car accidents.'),
  SirenShutoffHours: number('Vehicles', 'Hours before a wailing siren shuts off.', 0, 168),
  ChanceHasGas: scale('Vehicles', 'Chance of finding a vehicle with gas.', ['Low', 'Normal', 'High']),
  RecentlySurvivorVehicles: scale('Vehicles', 'Chance of finding a well-maintained vehicle.', ['None', 'Low', 'Normal', 'High']),
  SirenEffectsZombies: flag('Vehicles', 'Zombies head toward vehicle sirens.'),

  // Animals
  AnimalStatsModifier: scale('Animals', 'Speed of animal stat reduction.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalMetaStatsModifier: scale('Animals', 'Animal stat reduction speed while in meta.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalPregnancyTime: scale('Animals', 'Duration of animal pregnancy.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalAgeModifier: scale('Animals', 'Speed of animal aging.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalMilkIncModifier: scale('Animals', 'Milk production rate.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalWoolIncModifier: scale('Animals', 'Wool growth rate.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalRanchChance: scale('Animals', 'Chance of finding animals on farms.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often', 'Always']),
  AnimalGrassRegrowTime: number('Animals', 'Hours for grass to regrow after being eaten or cut.', 1, 9999),
  AnimalMetaPredator: flag('Animals', 'Meta predators may attack chickens if the hutch is open at night.'),
  AnimalMatingSeason: flag('Animals', 'Animals respect mating seasons for reproduction.'),
  AnimalEggHatch: scale('Animals', 'Time before baby animals hatch from eggs.', ['Ultra Fast', 'Very Fast', 'Fast', 'Normal', 'Slow', 'Very Slow']),
  AnimalSoundAttractZombies: flag('Animals', 'Animal calls attract nearby zombies.'),
  AnimalTrackChance: scale('Animals', 'Chance of animals leaving tracks.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often']),
  AnimalPathChance: scale('Animals', 'Chance of creating paths for animal hunting.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often']),
  MaximumRatIndex: number('Animals', 'Frequency and intensity of rats in infested buildings.', 0, 50),
  DaysUntilMaximumRatIndex: number('Animals', 'Days to reach the maximum vermin index.', 0, 365),

  // World & Map
  AllowMiniMap: flag('Map', 'Enable a mini-map window.'),
  AllowWorldMap: flag('Map', 'Allow access to the world map.'),
  MapAllKnown: flag('Map', 'World map is fully revealed from the start.'),
  MapNeedsLight: flag('Map', 'Maps need a light source to be read.'),
  ClayLakeChance: number('World', 'Chance of clay floors near lakes.', 0, 1),
  ClayRiverChance: number('World', 'Chance of clay floors near rivers.', 0, 1),

  // Zombie Lore
  'ZombieLore.Speed': choice('Zombie Lore', 'Zombie movement speed.', [
    ['1', 'Sprinters'], ['2', 'Fast Shamblers'], ['3', 'Shamblers'], ['4', 'Random'],
  ]),
  'ZombieLore.Strength': choice('Zombie Lore', 'Zombie attack damage.', [
    ['1', 'Superhuman'], ['2', 'Normal'], ['3', 'Weak'], ['4', 'Random'],
  ]),
  'ZombieLore.Toughness': choice('Zombie Lore', 'Zombie durability.', [
    ['1', 'Tough'], ['2', 'Normal'], ['3', 'Fragile'], ['4', 'Random'],
  ]),
  'ZombieLore.Transmission': choice('Zombie Lore', 'How the Knox infection spreads.', [
    ['1', 'Blood and Saliva'], ['2', 'Saliva Only'],
    ['3', 'Everyone Infected'], ['4', 'None'],
  ]),
  'ZombieLore.Mortality': choice('Zombie Lore', 'How quickly infection takes effect.', [
    ['1', 'Instant'], ['2', '0-30 Seconds'], ['3', '0-1 Minutes'],
    ['4', '0-12 Hours'], ['5', '2-3 Days'], ['6', '1-2 Weeks'], ['7', 'Never'],
  ]),
  'ZombieLore.Reanimate': choice('Zombie Lore', 'How quickly corpses rise as zombies.', [
    ['1', 'Instant'], ['2', '0-30 Seconds'], ['3', '0-1 Minutes'],
    ['4', '0-12 Hours'], ['5', '2-3 Days'], ['6', '1-2 Weeks'],
  ]),
  'ZombieLore.Cognition': choice('Zombie Lore', 'Zombie intelligence and navigation.', [
    ['1', 'Navigate and Use Doors'], ['2', 'Navigate'],
    ['3', 'Basic Navigation'], ['4', 'Random'],
  ]),
  'ZombieLore.CrawlUnderVehicle': choice('Zombie Lore', 'How often zombies crawl under cars.', [
    ['1', 'Crawlers Only'], ['2', 'Extremely Rare'], ['3', 'Rare'],
    ['4', 'Sometimes'], ['5', 'Often'], ['6', 'Very Often'], ['7', 'Always'],
  ]),
  'ZombieLore.Memory': choice('Zombie Lore', 'How long zombies remember players.', [
    ['1', 'Long'], ['2', 'Normal'], ['3', 'Short'], ['4', 'None'],
    ['5', 'Random'], ['6', 'Random between Normal and None'],
  ]),
  'ZombieLore.Sight': choice('Zombie Lore', 'Zombie vision range.', [
    ['1', 'Eagle'], ['2', 'Normal'], ['3', 'Poor'],
    ['4', 'Random'], ['5', 'Random between Normal and Poor'],
  ]),
  'ZombieLore.Hearing': choice('Zombie Lore', 'Zombie hearing range.', [
    ['1', 'Pinpoint'], ['2', 'Normal'], ['3', 'Poor'],
    ['4', 'Random'], ['5', 'Random between Normal and Poor'],
  ]),
  'ZombieLore.SpottedLogic': flag('Zombie Lore', 'Advanced stealth: hiding behind cars, weather effects, etc.'),
  'ZombieLore.ThumpNoChasing': flag('Zombie Lore', 'Zombies attack doors and constructions while roaming.'),
  'ZombieLore.ThumpOnConstruction': flag('Zombie Lore', 'Zombies can destroy player constructions.'),
  'ZombieLore.ActiveOnly': choice('Zombie Lore', 'When zombies are most active.', [
    ['1', 'Both'], ['2', 'Night'], ['3', 'Day'],
  ]),
  'ZombieLore.TriggerHouseAlarm': flag('Zombie Lore', 'Zombies trigger house alarms when breaking in.'),
  'ZombieLore.ZombiesDragDown': flag('Zombie Lore', 'Multiple zombies can drag a player down.'),
  'ZombieLore.ZombiesCrawlersDragDown': flag('Zombie Lore', 'Crawler zombies contribute to drag-down chance.'),
  'ZombieLore.ZombiesFenceLunge': flag('Zombie Lore', 'Zombies lunge over fences and through windows.'),
  'ZombieLore.ZombiesArmorFactor': number('Zombie Lore', 'Zombie armor effectiveness multiplier.', 0, 100),
  'ZombieLore.ZombiesMaxDefense': number('Zombie Lore', 'Max defense % from zombie worn garments.', 0, 100),
  'ZombieLore.ChanceOfAttachedWeapon': number('Zombie Lore', 'Chance of a zombie having an attached weapon.', 0, 100),
  'ZombieLore.ZombiesFallDamage': number('Zombie Lore', 'Damage zombies take from falling.', 0, 100),
  'ZombieLore.DisableFakeDead': choice('Zombie Lore', 'Whether dead-looking zombies reanimate.', [
    ['1', 'World Zombies'], ['2', 'World and Combat Zombies'], ['3', 'Never'],
  ]),
  'ZombieLore.PlayerSpawnZombieRemoval': choice('Zombie Lore', 'Where zombies are removed at player spawn.', [
    ['1', 'Inside building and around it'], ['2', 'Inside building'],
    ['3', 'Inside room'], ['4', 'Zombies spawn anywhere'],
  ]),
  'ZombieLore.FenceThumpersRequired': number('Zombie Lore', 'Zombies needed to damage a tall fence.', -1, 100),
  'ZombieLore.FenceDamageMultiplier': number('Zombie Lore', 'Speed of fence damage by zombies.', 0.01, 100),
  'ZombieLore.SprinterPercentage': number('Zombie Lore', 'Percentage of sprinters when Speed is Random.', 0, 100),
  'ZombieLore.DoorOpeningPercentage': number('Zombie Lore', 'Chance zombies can open doors.', 0, 100),

  // Zombie Population
  'ZombieConfig.PopulationMultiplier': number('Zombie Population', 'Overall zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationStartMultiplier': number('Zombie Population', 'Starting zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationPeakMultiplier': number('Zombie Population', 'Peak day zombie population multiplier.', 0, 4),
  'ZombieConfig.PopulationPeakDay': number('Zombie Population', 'Day when population peaks.', 1, 365),
  'ZombieConfig.RespawnHours': number('Zombie Population', 'Hours before zombies can respawn in a cell. 0 = disabled.', 0, 8760),
  'ZombieConfig.RespawnUnseenHours': number('Zombie Population', 'Hours a chunk must be unseen before respawn.', 0, 8760),
  'ZombieConfig.RespawnMultiplier': number('Zombie Population', 'Fraction of population that respawns per cycle.', 0, 1),
  'ZombieConfig.RedistributeHours': number('Zombie Population', 'Hours before zombie migration. 0 = disabled.', 0, 8760),
  'ZombieConfig.FollowSoundDistance': number('Zombie Population', 'Distance zombies walk toward sounds.', 10, 1000),
  'ZombieConfig.RallyGroupSize': number('Zombie Population', 'Size of idle zombie groups. 0 = no groups.', 0, 1000),
  'ZombieConfig.RallyGroupSizeVariance': number('Zombie Population', 'Percent variance in group size.', 0, 100),
  'ZombieConfig.RallyTravelDistance': number('Zombie Population', 'Distance zombies travel to form groups.', 5, 50),
  'ZombieConfig.RallyGroupSeparation': number('Zombie Population', 'Distance between zombie groups.', 5, 25),
  'ZombieConfig.RallyGroupRadius': number('Zombie Population', 'Group member distance from leader.', 1, 10),
  'ZombieConfig.ZombiesCountBeforeDelete': number('Zombie Population', 'Zombie count threshold before deletion starts.', 10, 500),

  // XP Multipliers
  'MultiplierConfig.Global': number('XP Multipliers', 'Global skill XP rate.', 0, 1000),
  'MultiplierConfig.GlobalToggle': flag('XP Multipliers', 'All skills use the Global multiplier when enabled.'),
  'MultiplierConfig.Fitness': number('XP Multipliers', 'Fitness skill XP rate.', 0, 1000),
  'MultiplierConfig.Strength': number('XP Multipliers', 'Strength skill XP rate.', 0, 1000),
  'MultiplierConfig.Sprinting': number('XP Multipliers', 'Sprinting skill XP rate.', 0, 1000),
  'MultiplierConfig.Lightfoot': number('XP Multipliers', 'Lightfooted skill XP rate.', 0, 1000),
  'MultiplierConfig.Nimble': number('XP Multipliers', 'Nimble skill XP rate.', 0, 1000),
  'MultiplierConfig.Sneak': number('XP Multipliers', 'Sneaking skill XP rate.', 0, 1000),
  'MultiplierConfig.Axe': number('XP Multipliers', 'Axe skill XP rate.', 0, 1000),
  'MultiplierConfig.Blunt': number('XP Multipliers', 'Long Blunt skill XP rate.', 0, 1000),
  'MultiplierConfig.SmallBlunt': number('XP Multipliers', 'Short Blunt skill XP rate.', 0, 1000),
  'MultiplierConfig.LongBlade': number('XP Multipliers', 'Long Blade skill XP rate.', 0, 1000),
  'MultiplierConfig.SmallBlade': number('XP Multipliers', 'Short Blade skill XP rate.', 0, 1000),
  'MultiplierConfig.Spear': number('XP Multipliers', 'Spear skill XP rate.', 0, 1000),
  'MultiplierConfig.Maintenance': number('XP Multipliers', 'Maintenance skill XP rate.', 0, 1000),
  'MultiplierConfig.Woodwork': number('XP Multipliers', 'Carpentry skill XP rate.', 0, 1000),
  'MultiplierConfig.Cooking': number('XP Multipliers', 'Cooking skill XP rate.', 0, 1000),
  'MultiplierConfig.Farming': number('XP Multipliers', 'Farming skill XP rate.', 0, 1000),
  'MultiplierConfig.Doctor': number('XP Multipliers', 'First Aid skill XP rate.', 0, 1000),
  'MultiplierConfig.Electricity': number('XP Multipliers', 'Electrical skill XP rate.', 0, 1000),
  'MultiplierConfig.MetalWelding': number('XP Multipliers', 'Welding skill XP rate.', 0, 1000),
  'MultiplierConfig.Mechanics': number('XP Multipliers', 'Mechanics skill XP rate.', 0, 1000),
  'MultiplierConfig.Tailoring': number('XP Multipliers', 'Tailoring skill XP rate.', 0, 1000),
  'MultiplierConfig.Aiming': number('XP Multipliers', 'Aiming skill XP rate.', 0, 1000),
  'MultiplierConfig.Reloading': number('XP Multipliers', 'Reloading skill XP rate.', 0, 1000),
  'MultiplierConfig.Fishing': number('XP Multipliers', 'Fishing skill XP rate.', 0, 1000),
  'MultiplierConfig.Trapping': number('XP Multipliers', 'Trapping skill XP rate.', 0, 1000),
  'MultiplierConfig.PlantScavenging': number('XP Multipliers', 'Foraging skill XP rate.', 0, 1000),
  'MultiplierConfig.FlintKnapping': number('XP Multipliers', 'Knapping skill XP rate.', 0, 1000),
  'MultiplierConfig.Masonry': number('XP Multipliers', 'Masonry skill XP rate.', 0, 1000),
  'MultiplierConfig.Pottery': number('XP Multipliers', 'Pottery skill XP rate.', 0, 1000),
  'MultiplierConfig.Carving': number('XP Multipliers', 'Carving skill XP rate.', 0, 1000),
  'MultiplierConfig.Husbandry': number('XP Multipliers', 'Animal Care skill XP rate.', 0, 1000),
  'MultiplierConfig.Tracking': number('XP Multipliers', 'Tracking skill XP rate.', 0, 1000),
  'MultiplierConfig.Blacksmith': number('XP Multipliers', 'Blacksmithing skill XP rate.', 0, 1000),
  'MultiplierConfig.Butchering': number('XP Multipliers', 'Butchering skill XP rate.', 0, 1000),
  'MultiplierConfig.Glassmaking': number('XP Multipliers', 'Glassmaking skill XP rate.', 0, 1000),

  // Basement
  'Basement.SpawnFrequency': scale('Basements', 'How frequently basements spawn.', ['Never', 'Extremely Rare', 'Rare', 'Sometimes', 'Often', 'Very Often', 'Always']),
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
      description: known.description || defaultDescription(key),
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

function defaultDescription(key) {
  return `Server ${key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim().replace(/[A-Z]/g, (c) => c.toLowerCase())} setting.`;
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
