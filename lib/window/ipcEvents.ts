import { type BrowserWindow, ipcMain, dialog, shell } from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Conf } from 'electron-conf/main'

const store = new Conf()

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler)
}

export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  mainWindow.setMenuBarVisibility(false)

  function removeFileExtension(filename: string) {
    return filename.replace(/\.[^/.]+$/, '')
  }

  const loadVideosFromFolder = (folderPath: string) => {
    const files = fs.readdirSync(folderPath)
    const videoFiles = files
      .filter((f) => f.endsWith('.mp4'))
      .map((file) => ({
        name: removeFileExtension(file),
        path: path.join(folderPath, file),
      }))
    return videoFiles
  }

  const scanForSubfoldersWithVideos = (folderPath: string) => {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    const subfoldersWithVideos = entries
      .filter((entry) => entry.isDirectory())
      .map((dir) => {
        const subfolder = path.join(folderPath, dir.name)

        // Get videos in this subfolder
        const videos = loadVideosFromFolder(subfolder)

        return {
          name: dir.name,
          videosSeq: videos,
        }
      })

    return subfoldersWithVideos
  }

  const findSubSubfolderNames = (folderPath: string) => {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    const subfolders = entries.filter((entry) => entry.isDirectory())

    const subSubfolderNames: string[] = []

    for (const dir of subfolders) {
      const subfolder = path.join(folderPath, dir.name)
      const subEntries = fs.readdirSync(subfolder, { withFileTypes: true })
      const hasSubfolders = subEntries.some((entry) => entry.isDirectory())
      if (hasSubfolders) {
        subSubfolderNames.push(dir.name)
      }
    }

    return subSubfolderNames
  }

  handleIPC('set-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = result.filePaths[0]
    const videos = loadVideosFromFolder(folderPath)
    const subfoldersWithVideos = scanForSubfoldersWithVideos(folderPath)
    const subSubfolderNames = findSubSubfolderNames(folderPath)

    const folderEntry = {
      path: folderPath,
      videosSeq: videos,
      subfoldersWithVideos,
      subSubfolderNames,
    }

    // Replace any existing folder with this one
    store.set('mainFolder', folderEntry)

    return folderEntry
  })

  handleIPC('load-config', () => {
    return {
      mainFolder: store.get('mainFolder') as {
        path: string
        videosSeq: { name: string; path: string }[]
        subfoldersWithVideos: {
          name: string
          videosSeq: { name: string; path: string }[]
        }[]
        subSubfolderNames: string[]
      },
    }
  })

  handleIPC('load-video-data', async (_event, videoPath: string) => {
    const data = fs.readFileSync(videoPath)
    return data.toString('base64')
  })

  // Register window IPC
  handleIPC('init-window', () => {
    const { width, height } = mainWindow.getBounds()
    const minimizable = mainWindow.isMinimizable()
    const maximizable = mainWindow.isMaximizable()
    const platform = os.platform()

    return { width, height, minimizable, maximizable, platform }
  })

  handleIPC('is-window-minimizable', () => mainWindow.isMinimizable())
  handleIPC('is-window-maximizable', () => mainWindow.isMaximizable())
  handleIPC('window-minimize', () => mainWindow.minimize())
  handleIPC('window-maximize', () => mainWindow.maximize())
  handleIPC('window-close', () => mainWindow.close())
  handleIPC('window-maximize-toggle', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  const webContents = mainWindow.webContents
  handleIPC('web-undo', () => webContents.undo())
  handleIPC('web-redo', () => webContents.redo())
  handleIPC('web-cut', () => webContents.cut())
  handleIPC('web-copy', () => webContents.copy())
  handleIPC('web-paste', () => webContents.paste())
  handleIPC('web-delete', () => webContents.delete())
  handleIPC('web-select-all', () => webContents.selectAll())
  handleIPC('web-reload', () => webContents.reload())
  handleIPC('web-force-reload', () => webContents.reloadIgnoringCache())
  handleIPC('web-toggle-devtools', () => webContents.toggleDevTools())
  handleIPC('web-actual-size', () => webContents.setZoomLevel(0))
  handleIPC('web-zoom-in', () => webContents.setZoomLevel(webContents.zoomLevel + 0.5))
  handleIPC('web-zoom-out', () => webContents.setZoomLevel(webContents.zoomLevel - 0.5))
  handleIPC('web-toggle-fullscreen', () => mainWindow.setFullScreen(!mainWindow.fullScreen))
  handleIPC('web-open-url', (_e, url) => shell.openExternal(url))
}
