There are a myriad of tools available for server administrators to customize and manage their servers.

Configuring the server game settings
Windows
Server data save locations
By default the server will look for game settings and world data named servertest inside C:\Users\YourUsername\Zomboid. If this data does not exist, the server will generate it automatically using default game settings. Use the following table for reference.

servertest.ini in C:\Users\YourUsername\Zomboid\Server
This file contains the server configuration settings. Editable with text editor.
servertest_SandboxVars.lua in C:\Users\YourUsername\Zomboid\Server
This file contains the server sandbox configuration settings. Editable with text editor.
servertest_spawnpoints.lua in C:\Users\YourUsername\Zomboid\Server
This file contains the spawnpoints available in your server. Setting custom spawn points is possible. Editable with text editor.
servertest_spawnregions.lua in C:\Users\YourUsername\Zomboid\Server
This file contains the regions available for spawning (i.e. Muldraugh, Rosewood, etc). Editable with text editor.
servertest folder in C:\Users\YourUsername\Zomboid\Saves\Multiplayer
This folder contains the generated/saved world data of the server.
Customizing settings
Customizing server settings can be accomplished in two ways.

Through the game client
Editing the relevant files in text editor
To customize settings using the game client, launch Project Zomboid and select the Host menu option followed by the Manage Settings menu option.


Added Steam Workshop-subscribed mods to the server will be downloaded automatically on connecting client machines
If the server was successfully run at least once:

Select servertest from the list of saved server settings
Click Edit Settings
Edit desired settings and save
If the server was not run at least once:

Click Create New Settings
Name these settings servertest
Edit desired settings and save
The next time the server successfully starts it will use the defined servertest.ini and lua files. The settings can be verified by using the admin command showoptions or opening servertest.ini, servertest_SandboxVars.lua, servertest_spawnpoints.lua, and servertest_spawnregions.lua in text editor.


Changes can be saved to servertest.ini while the server is running. After servertest.ini is saved, use admin command reloadoptions to make the changes live.
Customizing server name
You may customize your server's name to something other than servertest in order to either have worlds you can quickly read and identify, or to be able to switch to a new world without having to move a bunch of files on both server and client side to preserve that world.

First and foremost, be aware that player map data is stored locally client side under your IP address and port. If you don't want map information bleedover, you may need to change the port in your server settings.

If you are trying to save an existing server, you have two choices ahead of you:

Never use port 16261 for any other PZ servers.
Have anyone who has previously joined look for a file named something like 123.45.0.12_16261_a589371111b0ccerf81acc30e918f8c9 [server ip address _ server port _ something] located at C:\Users\YourUsername\Zomboid\Saves and have them put it somewhere safe or edit the folder name.
Then make a copy of whichever one you used to launch servertest normally by selecting it, right clicking, select copy, right click somewhere in empty space, paste.

Rename the new file (or don't).


The server folder
Open the file in some text editor (such as notepad) and insert:

-servername YOURSERVERNAME
after

-cp %PZ_CLASSPATH% zombie.network.GameServer
Example with server name of "pizza":

@setlocal enableextensions
@cd /d "%~dp0"
SET PZ_CLASSPATH=java/istack-commons-runtime.jar;java/jassimp.jar;java/javacord-2.0.17-shaded.jar;java/javax.activation-api.jar;java/jaxb-api.jar;java/jaxb-runtime.jar;java/lwjgl.jar;java/lwjgl-natives-windows.jar;java/lwjgl-glfw.jar;java/lwjgl-glfw-natives-windows.jar;java/lwjgl-jemalloc.jar;java/lwjgl-jemalloc-natives-windows.jar;java/lwjgl-opengl.jar;java/lwjgl-opengl-natives-windows.jar;java/lwjgl_util.jar;java/sqlite-jdbc-3.27.2.1.jar;java/trove-3.0.3.jar;java/uncommons-maths-1.2.3.jar;java/
".\jre64\bin\java.exe" -Djava.awt.headless=true -Dzomboid.steam=1 -Dzomboid.znetlog=1 -XX:+UseZGC -XX:-CreateCoredumpOnCrash -XX:-OmitStackTraceInFastThrow -Xms4g -Xmx4g -Djava.library.path=natives/;natives/win64/;. -cp %PZ_CLASSPATH% zombie.network.GameServer -servername pizza -statistic 0
PAUSE
Just running this will create a world with all the requisite files with the default settings, which you can edit later.

If you've already created a server with a name you want to use with all the settings set the way you want, use the same name as the file at C:\Users\%your username%\Zomboid\db.

Linux
Server data save locations
By default the server will look for game settings and world data named servertest inside ~/Zomboid (assuming you followed the instructions above that would be /home/pzuser/Zomboid). If this data does not exist, the server will generate it automatically using default game settings. Use the following file list for reference.

servertest.ini in ~/Zomboid/Server
This file contains the server configuration settings. Editable with text editor.
servertest_SandboxVars.lua in ~/Zomboid/Server
This file contains the server sandbox configuration settings. Editable with text editor.
servertest_spawnpoints.lua in ~/Zomboid/Server
This file contains the spawnpoints available in your server. Setting custom spawn points is possible. Editable with text editor.
servertest_spawnregions.lua in ~/Zomboid/Server
This file contains the regions available for spawning (i.e., Muldraugh, Rosewood, etc.). Editable with text editor.
servertest folder in ~/Zomboid/Saves/Multiplayer
This folder contains the generated/saved world data of the server.
Admin commands
Main article: Admin commands
The admin commands can be executed either on the server console window or in-game (preceded by a forward slash when used in-game) provided the user has admin status. For a list of commands, see admin commands.

/help command can be used to show all available commands.

Installing mods
Save all mods to a steam workshop collection
Paste collection url into PZ ID Grabber
Open your SERVERNAME.ini file
In Mods= section paste the mods into the file
In WorkshopItems= section paste the workshop Items Ids
Can't connect to own server, stuck in the loading screen (steam client version)
Verify that the saved profile for your server in the server 'favorites' tab is using your actual public IPv4 address (WhatismyIP) and that the 16261 UDP port is forwarded in your router.
Close the server using the "quit" command, verify integrity of server files, relaunch the server using only the "StartServer32.bat" or "StartServer64.bat" executable found where the server is installed. DO NOT use the Steam client to launch the server, and if you do, verify the server files again.
Connect to the server.
Character stuck in void after joining
This might happen if you are using a pre-existing profile to connect to a server which was previously hosted using the in-game "Host" function. To solve:

Disconnect from the server.
Create a new profile by changing your account name in the "add server panel", e.g., "player" becomes "player_1". Remember to "SAVE" so the client remembers your new profile.
Connect to the server. Your new character should be placed at one of the ordinary spawn positions.
Server fails to start due to "Assertion Failed: Illegal termination of worker thread" error
This error can happen if you have previously hosted a stable Build 41 server on the same machine and then install the server files for Build 42 unstable. To solve:

Verify that steam_appid.txt contains only one line with the numbers 108600. Steam_appid.txt is present in one of these places depending on if you used Steam or SteamCMD to install the server:
C:\Steam\steamapps\common\Project Zomboid Dedicated Server
Wherever you specified that SteamCMD should install the server using the force_install_dir command.
C:\SteamCMD\steamapps, but only if you did not specify an install location using force_install_dir
Only AFTER backing up any .ini, .lua, and save file settings you want to keep from your earlier server, remove the following folder in its entirety. It should be recreated when running your newer Build 42 unstable server:
C:\Users\%USERPROFILE%\Zomboid
It might be recommended to save a local copy of the entire Zomboid folder mentioned in step 2. as the folder does not take up much space, and the user might want to recreate the settings or maps that they previously played on.

--------------------------------

Startup parameters
From PZwiki

Views
Read
View source
View history
associated-pages
Page
Discussion
English • čeština • Deutsch • español • français • italiano • 日本語 • 한국어 • polski • português • português do Brasil • русский • ไทย • Türkçe • українська • Tiếng Việt • 中文（简体） • 中文（繁體）
Modding
Give your feedback on the Modding Wiki here!
Category:Modding • Scripts • Lua (API) • Java • User Interface • Modeling • Animation • Texturing • Mapping • Rendering • Translation • Modding projects

Build 42.18.0 modding news

This page has been updated to an unstable beta version (42.17.0).
For the Build 41 page, please see this archived version.
Project Zomboid has customizable startup parameters that are used to override the default options of the launcher, JVM, and game. JVM arguments must be provided first and end with -- even if there are no game arguments. Game arguments can be passed to the launcher because they are forwarded to the game itself.

From the Steam application
Right-click the game in the Steam Library, a menu will pop up.
Click Properties. A new modal window will appear.
By default the 'general' tab in the modal window should be opened, but if not, click it.
Look under Launch Options → Selected Launch Option. Add a parameter from the table below, e.g., -debug to the field.
Close window and launch the game.
Example
-Xmx8192m -Xms8192m -- -debug
From a game shortcut
Navigate to the game folder via right-clicking Project Zomboid in the Steam Library → Manage → Browse local files.
Create a shortcut of the game launcher ProjectZomboid<32/64>.exe.
Add the arguments to the Target field.
Example
"C:\ProjectZomboid64.exe" -Xmx8192m -Xms8192m -- -debug
From the StartServer64.bat parameters
This method is only for dedicated servers.

Open the StartServer64.bat script with a text editor.
Add any JVM arguments after the -Xmx line in the script.
Add any game parameters after the %1 %2 text inside the script, which is at the end of the file before PAUSE.

Here the -- is not needed because the script already separates the JVM and game arguments.
Example
-Xmx16g -Duser.home=C:\Zomboid
%1 %2 -nosteam -servername MySecondServer -adminpassword Password123
Increasing allocated memory
To increase the maximum allocated memory to 8 GB and the minimum to 8 GB, add the following to the launch options:

-Xmx8192m -Xms8192m --
Opening the game in debug mode
To open the game in debug mode, add the following to the launch options:

-debug
Disabling Steam integration
To disable Steam integration, add the following to the launch options:

-nosteam
Client & server
Arguments	Description	Example
-console_dot_txt_size_kb={int size}	Sets the maximum console.txt file size in kilobytes.	-console_dot_txt_size_kb=512000
-cachedir={str path}	Sets the absolute path for the game's cache directory.	-cachedir="C:\Zomboid"
-nosteam	This is equal to using the -Dzomboid.steam JVM property.	
Client
Arguments	Description	Example
-safemode	Launches the game with reduced resolution, texture compression, 1x tile scale, and 1x texture scale. Disables the WeatherShader and FBO support. No FBO means that offscreen rendering will not work! The game will enable safe mode if it fails to create a framebuffer object.	
-nosound	Disables the game audio. This has the side effect of disabling some aspects of the voice chat.	
-aitest	Enables the AI testing mode. It has been neglected and isn't used anywhere but to set IsoGameCharacter.isNPC.	
-novoip	Disables the VoiceManager from starting, which controls in-game voice chat.	
-debug	Launches the game in debug mode. Makes the CoopMaster coop server use debug mode.	
-debuglog={DebugType[] types}	Enables certain filters in the console log. Takes in a comma-separated list of DebugType values. Since the client doesn't have -disablelog, this allows us to specify whether to enable or disable the filter.	-debuglog=All
-debuglog=Network,-Sound
+connect {str ip}:{str port}	This is equivalent to using the -Dargs.server.connect JVM property.	+connect 127.0.0.1:16261
+password {str password}	This is equivalent to using the -Dargs.server.password JVM property.	+password ServersPassword
-debugtranslation	Enables the debug mode for the Translator class. Writes possible translation issues to cachedir/translationProblems.txt and allows for reloading translation files while holding F12 in-game.	
-modfolders {Folder[] folders}	Controls where mods load from and their load order. There are only 3 possible folders. Any folder can be unspecified to disable the game from loading mods in that directory, and rearranged to change the load order of the mods.	-modfolders workshop,steam,mods
-modfolders workshop,steam
-imgui	Launches the game in debug mode with Imgui enabled.	
-imguidebugviewports	Launches the game in debug mode with Imgui enabled in a separate window.	
Server
Arguments	Description	Example
-coop	Runs a coop server instead of a dedicated server. Disables the default admin from being accessible.	
-disablelog={DebugType[] types}	Disables certain filters in the console log. Takes in a comma-separated list of DebugType values.	-disablelog=All
-disablelog=Network,Sound
-debuglog={DebugType[] types}	Enables certain filters in the console log. Takes in a comma-separated list of DebugType values.	-debuglog=All
-debuglog=Network,Sound
-adminusername {str name}	Uses a different username for the default admin user when creating a server. It doesn't remove the previous default admin user if there is one.	-adminusername BobTheAdmin75
-adminpassword {str pass}	Set the default admin user's password automatically, bypassing the prompt if the default admin user is not found.	-adminpassword ReallySecurePassword
-ip {str ip}	Forces the server to bind to a specific IP address.	-ip 123.45.678.9
-gui	Launches the server GUI alongside the console. Another neglected argument that is unfinished, doesn't render properly, causes lots of exceptions, and uses extra memory.	
-statistic {int period}	Enables multiplayer statistics monitoring. The period is measured in seconds. Monitored statistics are saved in the cachedir/Statistic directory.	-statistic 10
-port {int port}	Overrides the DefaultPort config option in the INI file.	-port 16261
-udpport {int port}	Overrides the UDPPort config option in the INI file.	-udpport 16261
-steamvac {bool enabled}	Enables or disables Valve Anti-Cheat on the server. Overrides the option in the server INI config.	-steamvac true
-servername {str name}	Sets the internal servername to use. It affects the name of the save files that are loaded/saved.	-servername AnotherWorldSave

JVM arguments must be provided first before client/server arguments and ending with -- even if there are no game arguments. -- must be included at the ending if Java arguments are used.
Client & server
Arguments	Description	Example
-Xms{int size}{char unit}	The minimum amount of memory to allocate to the JVM. The game will not start if there is not enough memory available on the system to allocate. The unit can be g or m.	-Xms8192m
-Xmx{int size}{char unit}	The maximum amount of memory to allocate to the JVM. Setting this above the physical RAM amount of the system will end up using virtual memory. The unit can be g or m.	-Xmx8192m
-XX:+AlwaysPreTouch	Requests the VM to touch every page on the Java heap after requesting it from the operating system and before handing memory out to the application. If you are using ZGC it is officially recommended that one enables this option as of Java 21. [1]	
-Dzomboid.ConsoleDotTxtSizeKB={int size}	Sets the maximum console.txt file size in kilobytes.	-Dzomboid.ConsoleDotTxtSizeKB=512000
-Dzomboid.steam={int enabled}	Disables the game's Steam API integration, which prevents joining Steam servers or accessing Workshop content.	-Dzomboid.steam=1
-Ddeployment.user.cachedir={str path}	Sets the game's cache directory. The same as setting -cachedir. Only works on Linux.	-Ddeployment.user.cachedir="/home/user/zomboid_server"
-Dsoftreset	Forces the game to perform a soft reset. This does not work as of 41.78.19. The issue was reported and could be fixed in future versions[2].	
-Ddebug	Launches the game in debug mode. Makes the CoopMaster coop server use debug mode if enabled.	
Client
Arguments	Description	Example
-Dargs.server.connect={str ip}:{str port}	Connects to the server specified without needing to use the server browser.	-Dargs.server.connect="123.4.567.89:16261"
-Dargs.server.password={str pass}	Provides the server being connected to a password without needing to use the server browser.	-Dargs.server.password="DinoNuggetsTasteGood!!"
Client
Arguments	Description	Example
-pzexeconfig {str config}	Overrides the default launcher config ProjectZomboid64.json. An alternative to specifying args in the bat or in launch options.	-pzexeconfig ProjectZomboid64Custom.json
-pzexelog {str logfile}	Stores the logging output of the launcher ProjectZomboid64.exe. It is only useful for debugging purposes.	-pzexelog ProjectZomboid64.log

---------------------

