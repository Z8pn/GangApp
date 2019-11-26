const {
    app,
    BrowserWindow,
    globalShortcut
} = require('electron')
const path = require("path");
const url = require("url");
const EventEmitter = require('events');
app.setAppUserModelId(process.execPath)
class Browser extends EventEmitter {
    constructor(options, file) {
        super();
        this._setup(options, file);
    }
    _setup(options, file) {
        let self = this;
        self._page = new BrowserWindow(options)
        self._page.loadFile(__dirname + "/" + file)
        self._page.on('closed', function() {
            self.close()
        })
        self._page.setMenu(null);
        self._page.setFullScreenable(false);
    }
    get page() {
        return this.page;
    }
    dev() {
        this._page.webContents.openDevTools()
    }
    close() {
        this._page = null;
        this.emit("closing");
    }
    bind(key) {
        let self = this;
        self._shortCut = globalShortcut.register(key, () => {
            self._page.show()
        });
        if (!self._shortCut) {
            console.log('Registration failed.');
        }
    }
}

function createWindow() {
    // Create the browser window.
    let WND = new Browser({
        width: 1000,
        height: 750,
        resizable: false,
        icon : "views/img/icon.ico",
    }, "views/index.html")
    WND.bind('CommandOrControl+F7');
    //WND.dev() 
    // Emitted when the window is closed.
    WND.on('closing', function() {
        console.log("closing");
    })
}
app.on('ready', createWindow)
// Quit when all windows are closed.
app.on('window-all-closed', function() {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
app.on('activate', function() {
    if (mainWindow === null) {
        createWindow()
    }
})