=== Genshin Sim Manager ===
Created by @enigwa on Discord

A simple graphical wrapper around the **gcsim** command‑line tool. It lets you organise multiple projects, edit config files with syntax highlighting, and launch simulations or sub‑stat optimisations without typing any commands. All the heavy lifting is still done by the original gcsim binary – the app just provides a convenient UI for managing inputs, selecting the executable, and viewing results in your browser.

--------------------------------------------------
HOW TO START
--------------------------------------------------

Double-click "Genshin Sim Manager.bat" in the program folder.
This will install or verify dependencies (runs npm install) and start the GUI.
Once running, open your browser and go to:

    http://localhost:3000

Keep the terminal window open while using the program.
Close the terminal to stop the server.

--------------------------------------------------
HOW TO USE
--------------------------------------------------

1. ADD YOUR SIM EXECUTABLE
   - Click "+" to type the path to your gcsim .exe, or
   - Click "Browse" to navigate your files and select it.
   - You can add multiple sim executables and switch between them.

2. CREATE A PROJECT
   - Click "Create" and give your project a name.
   - Projects keep your configs and output files organised.
   - Switch between projects using the dropdown.
   - Click "Delete" to remove a project and all its files.

3. ADD CONFIG FILES
   - Click "+ New" in the sidebar to create a new config.
   - The built-in editor supports syntax highlighting.
   - Use format, rename, copy, import, and export to manage them.
   - Autosave is on by default (can be toggled).

4. RUN OR OPTIMIZE
   - Select a config in the sidebar.
   - Click "Run" for a normal simulation, or
   - Click "Optimize" for substat optimisation.
   - Click "Run All" to run every config in the project.
   - Results open in your browser.
   - Use "Stop" to cancel at any time.

--------------------------------------------------
SETTINGS
--------------------------------------------------

Click the gear icon ⚙ to open Settings:
   - Background theme: choose between Default Dark, Pitch Black,
     Red, Blue, or Silver.
   - Text colour theme: pick text colours independently of the
     background (Light, Light Blue, Crimson, Dark).
   - Editor font size: adjust with the slider (10–24px).

--------------------------------------------------
NOTES
--------------------------------------------------

- Config files are stored in the projects/ folder.
- Output files are saved alongside your configs.
- All settings are saved automatically.