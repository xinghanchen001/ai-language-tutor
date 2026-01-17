const { app, BrowserWindow, globalShortcut, clipboard, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 1000,
        show: false,
        frame: false, // Spotlight style
        transparent: false,
        backgroundColor: '#ffffff',
        alwaysOnTop: false, // Allow other windows to cover it
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    }

    // mainWindow.on('blur', () => {
    //     mainWindow.hide();
    // });// });
}

function registerShortcut() {

    // Helper to handle clipboard logic
    const handleShortcutTrigger = (mode) => {
        // Ensure window is hidden/doesn't have focus so Cmd+C goes to the user's app
        if (mainWindow && mainWindow.isVisible()) {
            // mainWindow.hide(); // Optional: might feel glitchy if we hide/show fast. 
            // Instead, just ensure we don't steal focus. 
            // But if user was looking at our app, they wouldn't be selecting text elsewhere.
            // Let's assume focus is correct.
        }

        // 1. Save current clipboard content
        const oldText = clipboard.readText();

        // 2. Write a marker to detect if copy actually happens
        const marker = '<<<DEEPL_MARKER_CHECK>>>';
        clipboard.writeText(marker);

        // 3. Simulate Cmd+C using Key Code 8 (more robust)
        const script = 'tell application "System Events" to key code 8 using {command down}';

        exec(`osascript -e '${script}'`, { timeout: 2000 }, (error) => {
            if (error) console.error('Failed to trigger copy:', error);

            // 4. Poll for clipboard change (wait up to 500ms)
            let attempts = 0;
            const checkClipboard = () => {
                const currentText = clipboard.readText();

                if (currentText !== marker) {
                    // Success! Content changed from marker
                    console.log(`Copied new text: ${currentText.length} chars`);
                    sendToWindow(currentText, mode);
                } else if (attempts < 10) { // 10 * 50ms = 500ms
                    attempts++;
                    setTimeout(checkClipboard, 50);
                } else {
                    // Timeout
                    console.log('Copy failed or timed out (500ms). Falling back.');

                    // Clear the marker first
                    if (oldText) {
                        clipboard.writeText(oldText);
                        sendToWindow(oldText, mode);
                    } else {
                        clipboard.clear();
                        if (mainWindow) {
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    }
                }
            };

            // Start checking immediately
            checkClipboard();
        });
    };

    const sendToWindow = (text, mode) => {
        if (mainWindow) {
            mainWindow.center();
            mainWindow.show();
            mainWindow.focus();
            const channel = mode === 'explanation' ? 'clipboard-text-explanation' : 'clipboard-text';
            mainWindow.webContents.send(channel, text);
        }
    };

    // Shortcut for Correction Mode
    const correctionShortcut = 'Option+Command+C';
    const success = globalShortcut.register(correctionShortcut, () => {
        console.log(`Shortcut ${correctionShortcut} triggered!`);
        handleShortcutTrigger('correction');
    });

    if (!success) console.log(`Failed to register ${correctionShortcut}`);
    else console.log(`Registered ${correctionShortcut}`);

    // Shortcut for Explanation Mode
    const explanationShortcut = 'Option+Command+E';
    const explanationSuccess = globalShortcut.register(explanationShortcut, () => {
        console.log(`Shortcut ${explanationShortcut} triggered!`);
        handleShortcutTrigger('explanation');
    });

    if (!explanationSuccess) console.log(`Failed to register ${explanationShortcut}`);
    else console.log(`Registered ${explanationShortcut}`);
}

app.whenReady().then(() => {
    // Check/Prompt for Accessibility Permissions
    const { systemPreferences } = require('electron');
    if (process.platform === 'darwin') {
        const trusted = systemPreferences.isTrustedAccessibilityClient(true);
        if (!trusted) {
            console.log('Accessibility permission not granted. Prompting user...');
            // The isTrustedAccessibilityClient(true) call attempts to open the prompt.
        }
    }

    createWindow();
    registerShortcut();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

ipcMain.on('hide-window', () => {
    if (mainWindow) mainWindow.hide();
});
