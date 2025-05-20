import { type BrowserWindow, ipcMain, dialog, shell } from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Conf } from 'electron-conf/main'

const store = new Conf()

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler)
}

export function removeFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '')
}

export function loadVideosFromFolder(folderPath: string) {
  const files = fs.readdirSync(folderPath)
  const videoFiles = files
    .filter((f) => f.endsWith('.mp4'))
    .map((file) => ({
      name: removeFileExtension(file),
      path: path.join(folderPath, file),
      lastPlayedPosition: undefined as number | undefined,
    }))
  return videoFiles
}

export function scanForSubfoldersWithVideos(folderPath: string) {
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

export function findSubSubfolderNames(folderPath: string) {
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

export function checkForNewFilesAndMigrateLastPlayedPositionsToMovedFiles(oldMainFolder: any) {
  const folderPath = oldMainFolder.path
  const fileNameToLastPlayedPositionMap = new Map<string, number>()

  if (oldMainFolder.videosSeq) {
    oldMainFolder.videosSeq.forEach((video) => {
      if (video.lastPlayedPosition !== undefined) {
        const filename = path.basename(video.path)
        fileNameToLastPlayedPositionMap.set(filename, video.lastPlayedPosition)
      }
    })
  }
  if (oldMainFolder.subfoldersWithVideos) {
    oldMainFolder.subfoldersWithVideos.forEach((subfolder) => {
      subfolder.videosSeq.forEach((video) => {
        if (video.lastPlayedPosition !== undefined) {
          const filename = path.basename(video.path)
          fileNameToLastPlayedPositionMap.set(filename, video.lastPlayedPosition)
        }
      })
    })
  }

  // Re-scan the folder structure
  const videos = loadVideosFromFolder(folderPath)
  const subfoldersWithVideos = scanForSubfoldersWithVideos(folderPath)
  const subSubfolderNames = findSubSubfolderNames(folderPath)

  // Migrate playback positions to the new structure
  videos.forEach((video) => {
    const filename = path.basename(video.path)
    if (fileNameToLastPlayedPositionMap.has(filename)) {
      video.lastPlayedPosition = fileNameToLastPlayedPositionMap.get(filename)
    }
  })
  subfoldersWithVideos.forEach((subfolder) => {
    subfolder.videosSeq.forEach((video) => {
      const filename = path.basename(video.path)
      if (fileNameToLastPlayedPositionMap.has(filename)) {
        video.lastPlayedPosition = fileNameToLastPlayedPositionMap.get(filename)
      }
    })
  })

  return {
    path: folderPath,
    videosSeq: videos,
    subfoldersWithVideos,
    subSubfolderNames,
  }
}

export const registerWindowIPC = (mainWindow: BrowserWindow) => {
  mainWindow.setMenuBarVisibility(false)

  handleIPC('set-new-folder', async () => {
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

  handleIPC('update-main-folder', (_event, updatedMainFolder) => {
    store.set('mainFolder', updatedMainFolder)
    return true
  })

  handleIPC('load-config', () => {
    const storedMainFolder = store.get('mainFolder') as {
      path: string
      videosSeq: { name: string; path: string; lastPlayedPosition?: number }[]
      subfoldersWithVideos: {
        name: string
        videosSeq: { name: string; path: string; lastPlayedPosition?: number }[]
      }[]
      subSubfolderNames: string[]
    }

    if (storedMainFolder && fs.existsSync(storedMainFolder.path)) {
      const refreshedFolder = checkForNewFilesAndMigrateLastPlayedPositionsToMovedFiles(storedMainFolder)
      store.set('mainFolder', refreshedFolder)
      return { mainFolder: refreshedFolder }
    }

    return { mainFolder: storedMainFolder }
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
