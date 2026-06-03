# Genshin Sim Manager

A lightweight, local browser-based graphical wrapper designed around the `gcsim` command‑line tool. It replaces complex command-line workflows with a clean, visual interface to manage your simulation projects and optimization tasks. It allows you to organize multiple projects, edit configuration files with built-in syntax highlighting, and launch simulations or substat optimizations without touching the terminal. It works intuitively not just with the main repository but also with forks like WFPSim.

⚠️ **Note:** All simulation calculations are still executed by your original `gcsim` binary — this manager simply provides a convenient UI to manage inputs, select executables, and view results.

🚀 **How to Start**

**Download the Repository:**

Click the green Code button at the top right of this GitHub page and select Download ZIP, then extract it to a folder on your computer.

Alternatively, if you use Git, clone the repo by running: `git clone https://github.com/EnigWa/Genshin-Sim-Manager.git`

**Install Node.js (Prerequisite):**
* Recommended: Node.js 16.x or newer. Download installers and official packages from https://nodejs.org/.
* Windows: Run the Windows installer and follow prompts. After installation, open PowerShell and verify:
  ```powershell
  node -v
  npm -v
  ```
* macOS: Download the macOS installer from the Node.js website or use Homebrew:
  ```bash
  brew install node
  node -v
  npm -v
  ```
* Linux (Debian/Ubuntu example): Use the NodeSource packages or your distro package manager:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node -v
  npm -v
  ```

**Launch the Application:**

Windows: Double-click Genshin Sim Manager.bat inside the extracted program folder. This self-healing script will automatically verify dependencies, install pnpm globally via npm if missing, run pnpm install, and boot up the local server.

Linux / macOS: Ensure pnpm is installed (npm install -g pnpm), then from the project root run:

Bash
pnpm install
pnpm start

**Open the UI:**
* After startup, open the manager in your browser at: `http://localhost:3000`
* The embedded local viewer (used for third-party web viewers like `gcsim.app/local`) listens on port 8381 by default: `http://localhost:8381/data`

<img width="1919" height="964" alt="image" src="https://github.com/user-attachments/assets/d60b773a-124e-473a-95d8-17e795b6c9bf" />


---

### ⚙️ Executable Management
* **Add a Binary:** Click the `+` button to manually paste the file path to your `gcsim` executable, or click **Browse** to find it via your native file explorer.
* **Hot-Swapping:** You can add multiple versions of the simulation executable and switch between them seamlessly on the fly. Easily browse, download, and switch between different official releases or use your own custom version directly from the interface.
* **Auto Installer and Updater:** On first launch, the application automatically detects your operating system (Windows, Mac, or Linux) and downloads the latest official simulation engine.

### 📂 Project Organization
* **Create:** Click **Create** and name your project to keep your configurations and output files separate and organized. Group your simulation files into distinct projects to keep different team setups or accounts separated.
* **Manage:** Switch between active workspaces using the project dropdown, or use **Delete** to wipe a project and all its associated files.
* **File Management:** Create, delete, duplicate, and rename team configuration files.
* **Bulk Import/Export:** Quickly paste entire batches of team configurations to import them all at once, or export your files into a single bundle for sharing or backup.
* **Drag-and-Drop:** Reorder your list of team setups visually using drag-and-drop in the sidebar.

### 📝 Code Editor
* **Creation:** Click `+ New` in the sidebar to generate a blank configuration.
* **Features:** Includes a built-in code editor with syntax highlighting, Simpact-eligible code formatting, renaming, duplicating, and file import/export tools. Tailored writing experience specifically customized for simulation code, complete with automatic text formatting, alignment, and spacing rules.
* **Editor Customization:** Adjustable font size via slider, screen wrapping options, and full-screen split viewer for side-by-side editing.
* **Automatic Error Checker:** Instantly scans your team code for syntax errors and highlights exactly which lines have issues before you run the simulation. Live integrated checking directly inside the editor (like in the gcsim web editor) is also planned.
* **Autosave:** Faster autosave is enabled by default to protect your progress and prevent progress loss (can be toggled off in settings).

### 📊 Running Simulations
* **Run:** Select a configuration from the sidebar and click **Run** for a standard simulation. Mass simulations can be run for a single team setup, a manually selected group, or every configuration in your project simultaneously.
* **Optimize:** Click **Optimize** to trigger the substat optimization routine. The Substat Optimizer automatically calculates and fine-tunes optimal artifact substat distributions (e.g., liquid substat limits, fixed caps) to maximize team damage.
* **Batch Execution:** Click **Run All** or **Optimize All** to queue and execute configurations. 
* **Parallel Processing:** Added ability to run simulations/optimizations in parallel, running multiple simulations at the same time by utilizing your computer's extra processor cores to save time.
* **Result Tracking:** Added ability to see last dps simulated of that config. Extracted statistics (like average Team DPS) are displayed directly next to each team configuration in your sidebar. Sort your saved teams by alphabetical order, original creation order, or by the highest recorded DPS to easily find your strongest teams.
* **Control:** View your final results directly in your default browser. Integrates seamlessly with standard web-based simulation viewers via a local simulation viewer to automatically open detailed graphical results the moment a simulation finishes. A centralized queue lets you monitor active simulations in real-time with live progress logs. Click **Stop** at any point to kill an active simulation batch instantly, or wipe out old historical simulation results to free up space with a clean history wipeout tool.

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

## 🚀 PLANNED FUTURE ADDITIONS

* **KQMs checker:** Verify if your team builds match KeqingMains community standards.
* **Enka UID fetcher:** Import your actual in-game character builds directly using your Genshin Impact UID.
* **Character build graphics:** Generate visual infographics of your simulated character builds.
* **.GOOD file support for builds:** Import character and artifact data directly from popular Genshin scanners (Genshin Optimizer, etc.).
* **Split view partition adjuster:** Dynamically adjust the partition so we can make one side bigger than the other.
* **One-Click Modification:** Quick actions to copy the selected config and set the first character to every every constellation from c1 to c6.

## 💾 Notes & Troubleshooting

* **Storage Paths:** All user configuration files are stored safely within the local `/projects` folder.
* **State Persistence:** Application settings, paths, and themes are automatically saved locally upon modification.
* **Cross-Platform Support:** Full Linux/Mac support included. Follow the standard Node.js environment installation steps for non-Windows platforms.
* **Network & Permissions:** If the app cannot download `gcsim` on first-run, ensure the host machine has an active internet connection and that outbound HTTPS traffic is allowed. If you encounter permission errors when downloading or making binaries executable on Unix-like systems, run the server under a user with write permissions to the project folder or adjust permissions accordingly.
* **Firewall Rules:** On Windows, if ports are blocked by firewall rules, allow Node.js or the specific ports (3000 and 8381) through the firewall.
