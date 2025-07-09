import { type BrowserWindow, ipcMain, dialog, shell } from 'electron'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Conf } from 'electron-conf/main'

const store = new Conf()

const handleIPC = (channel: string, handler: (...args: any[]) => void) => {
  ipcMain.handle(channel, handler)
}

export function playingTimeToFilename(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function extractOrderAndPlayingTimeFromFilename(filename: string): {
  name: string
  position?: number
  index?: number
} {
  // Check for index prefix
  let indexMatch = filename.match(/^(\d+)\s+(.+)$/)
  let remainingName = filename
  let index: number | undefined = undefined

  if (indexMatch) {
    index = parseInt(indexMatch[1], 10)
    remainingName = indexMatch[2]
  }

  // Then check for time prefix in the remaining name
  const timeMatch = remainingName.match(/^(\d{2}):(\d{2})\s+(.+)$/)

  if (timeMatch) {
    const minutes = parseInt(timeMatch[1], 10)
    const seconds = parseInt(timeMatch[2], 10)
    const name = timeMatch[3]
    const position = minutes * 60 + seconds

    return { name, position, index }
  }

  return { name: indexMatch ? remainingName : filename, index }
}

export function removeFileExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, '')
}

export function loadVideosFromFolder(folderPath: string) {
  const files = fs.readdirSync(folderPath)
  const videoFiles = files
    .filter((f) => f.endsWith('.mp4'))
    .map((file) => {
      const fullPath = path.join(folderPath, file)
      const { name: extractedName, position, index } = extractOrderAndPlayingTimeFromFilename(removeFileExtension(file))

      return {
        name: extractedName,
        path: fullPath,
        lastPlayedPosition: position,
        index,
      }
    })
  return videoFiles
}

export function renameVideoWithPosition(videoPath: string, position: number): string {
  const directory = path.dirname(videoPath)
  const filename = path.basename(videoPath)
  const extension = path.extname(filename)
  const nameWithoutExt = filename.slice(0, filename.length - extension.length)

  // Extract index if it exists
  const indexMatch = nameWithoutExt.match(/^(\d+)\s+(.+)$/)
  const indexPrefix = indexMatch ? `${indexMatch[1]} ` : ''

  // Get the clean name (without time prefix and index prefix)
  let cleanName = nameWithoutExt
  if (indexMatch) {
    cleanName = indexMatch[2]
  }
  cleanName = cleanName.replace(/^\d{2}:\d{2}\s+/, '')

  // Create new filename with time prefix and preserve index if it exists
  const timePrefix = playingTimeToFilename(position)
  const newFilename = `${indexPrefix}${timePrefix} ${cleanName}${extension}`
  const newPath = path.join(directory, newFilename)

  // Rename the file
  fs.renameSync(videoPath, newPath)

  return newPath
}

export function updateVideoIndex(videoPath: string, index: number): string {
  const directory = path.dirname(videoPath)
  const filename = path.basename(videoPath)
  const extension = path.extname(filename)
  const nameWithoutExt = filename.slice(0, filename.length - extension.length)

  // Remove any existing index prefix
  const cleanName = nameWithoutExt.replace(/^\d+\s+/, '')

  // Create new filename with index prefix
  const newFilename = `${index} ${cleanName}${extension}`
  const newPath = path.join(directory, newFilename)

  // Rename the file
  fs.renameSync(videoPath, newPath)

  return newPath
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
    store.set('mainFolder', { path: folderPath })

    return folderEntry
  })

  handleIPC('update-main-folder', (_event, updatedMainFolder) => {
    store.set('mainFolder', { path: updatedMainFolder.path })
    return true
  })

  handleIPC('load-config', () => {
    const storedMainFolder = store.get('mainFolder') as { path: string }

    if (storedMainFolder && fs.existsSync(storedMainFolder.path)) {
      // Re-scan the folder to get the current structure with positions from filenames
      const videos = loadVideosFromFolder(storedMainFolder.path)
      const subfoldersWithVideos = scanForSubfoldersWithVideos(storedMainFolder.path)
      const subSubfolderNames = findSubSubfolderNames(storedMainFolder.path)

      const refreshedFolder = {
        path: storedMainFolder.path,
        videosSeq: videos,
        subfoldersWithVideos,
        subSubfolderNames,
      }

      return { mainFolder: refreshedFolder }
    }

    return { mainFolder: storedMainFolder }
  })

  handleIPC('load-video-data', async (_event, videoPath: string) => {
    const data = fs.readFileSync(videoPath)
    return data.toString('base64')
  })

  handleIPC('rename-video-with-position', (_event, videoPath: string, position: number) => {
    return renameVideoWithPosition(videoPath, position)
  })

  handleIPC('update-video-index', (_event, videoPath: string, index: number) => {
    return updateVideoIndex(videoPath, index)
  })

  handleIPC('move-video-between-folders', (_event, videoPath: string, targetFolderName: string) => {
    const mainFolderPath = path.dirname(path.dirname(videoPath))
    const targetFolderPath = path.join(mainFolderPath, targetFolderName)
    const filename = path.basename(videoPath)
    const newPath = path.join(targetFolderPath, filename)
    fs.renameSync(videoPath, newPath)
    return newPath
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
