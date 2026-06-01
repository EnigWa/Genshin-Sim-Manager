### Genshin Sim Manager

A lightweight, local browser-based graphical wrapper designed around the gcsim command‑line tool. It allows you to organize multiple projects, edit configuration files with built-in syntax highlighting, and launch simulations or substat optimizations without touching the terminal. It works intuitively not just with the main repository but also with forks like WFPSim.

⚠️ Note: All simulation calculations are still executed by your original gcsim binary — this manager simply provides a convenient UI to manage inputs, select executables, and view results.

🚀 How to Start

Download the Repository:

Click the green Code button at the top right of this GitHub page and select Download ZIP, then extract it to a folder on your computer.

Alternatively, if you use Git, clone the repo by running: git clone [https://github.com/EnigWa/Genshin-Sim-Manager.git](https://github.com/EnigWa/Genshin-Sim-Manager.git)

Launch the Application: Double-click Genshin Sim Manager.bat inside the extracted program folder.

This script will automatically verify dependencies, run npm install if necessary, and boot up the local server.

<img width="1919" height="960" alt="image" src="https://github.com/user-attachments/assets/9b4ac146-e2c6-4399-ae3d-df7a785af800" />

---

### ⚙️ Executable Management
* **Add a Binary:** Click the `+` button to manually paste the file path to your `gcsim` executable, or click **Browse** to find it via your native file explorer.
* **Hot-Swapping:** You can add multiple versions of the simulation executable and switch between them seamlessly on the fly.

### 📂 Project Organization
* **Create:** Click **Create** and name your project to keep your configurations and output files separate and organized.
* **Manage:** Switch between active workspaces using the project dropdown, or use **Delete** to wipe a project and all its associated files.

### 📝 Code Editor
* **Creation:** Click `+ New` in the sidebar to generate a blank configuration.
* **Features:** Includes a built-in code editor with syntax highlighting, Simpact-eligible code formatting, renaming, duplicating, and file import/export tools.
* **Autosave:** Enabled by default to protect your progress (can be toggled off in settings).

### 📊 Running Simulations
* **Run:** Select a configuration from the sidebar and click **Run** for a standard simulation.
* **Optimize:** Click **Optimize** to trigger the substat optimization routine.
* **Batch Execution:** Click **Run All** to queue and execute every configuration file within the active project sequentially.
* **Control:** View your final results directly in your default browser. Click **Stop** at any point to kill an active simulation.

---

## 🎨 Personalization & Settings
<img width="1919" height="971" alt="image" src="https://github.com/user-attachments/assets/c36e9fb2-eeb9-4bba-b867-a55f5eda5526" />

Click the **Gear Icon (⚙)** to customize your workspace environment:

| Setting | Options Available |
| :--- | :--- |
| **Background Theme** | Default Dark, Pitch Black, Red, Blue, Silver |
| **Text Color Theme** | Light, Light Blue, Crimson, Dark *(Independent of background)* |
| **Editor Typography** | Adjustable font size via slider (10px – 24px) |

---
MASSIVE UPDATE:

•  Split Viewer
•  Faster autosave
•  Bug fixes
•  Added optimize all
•  Added gcsim auto installer and updater
•  Fixed order
•  Added ability to run simulations/optimizations in parallel
•  Added ability to see last dps simulated of that config
•  Added linux/mac support
•  Updated how to use

PLANNED:

•  KQMs checker
•  Enka UID fetcher
•  Automatic error checker (like in the gcsim web editor)
•  Character build graphics
•  .GOOD file support for builds
•  Split view partition adjuster (so we can make one side bigger than the other)
•  Copy the selected config and set the first character to C6

## 💾 Notes

* **Storage Paths:** All user configuration files are stored safely within the local `/projects` folder.
* **State Persistence:** Application settings, paths, and themes are automatically saved locally upon modification.
