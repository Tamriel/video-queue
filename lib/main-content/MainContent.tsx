import './styles.css'
import React from 'react'
import VideoJS from '../window/components/VideoJS'
import videojs from 'video.js'

export default function MainContent() {
  const playerRef = React.useRef<any>(null)

  type Video = { name: string; path: string; lastPlayedPosition?: number; index?: number }
  type Subfolder = { name: string; videosSeq: Video[] }
  type MainFolder = {
    path: string
    videosSeq: Video[]
    subfoldersWithVideos: Subfolder[]
    subSubfolderNames: string[]
  }

  const [videoSources, setVideoSources] = React.useState<Array<{ src: string; type: string }>>([])
  const [mainFolder, setMainFolder] = React.useState<MainFolder | null>(null)
  const [playingVideo, setPlayingVideo] = React.useState<Video | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [selectedVideoIndex, setSelectedVideoIndex] = React.useState<number>(-1)
  const [selectedFolderIndex, setSelectedFolderIndex] = React.useState<number>(-1)

  const videoJsOptions = {
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    sources: videoSources,
    controlBar: {
      pictureInPictureToggle: false,
    },
  }

  const handlePlayerReady = (player) => {
    playerRef.current = player

    if (playingVideo && playingVideo.lastPlayedPosition) {
      player.currentTime(playingVideo.lastPlayedPosition)
    }

    player.on('waiting', () => {
      videojs.log('player is waiting')
    })

    player.on('pause', () => {
      // Save position when video is paused
      if (playingVideo) {
        saveVideoPosition(playingVideo, player.currentTime())
      }
    })

    player.on('dispose', () => {
      videojs.log('player will dispose')
      if (playingVideo) {
        saveVideoPosition(playingVideo, player.currentTime())
      }
    })
  }

  const saveVideoPosition = async (video: Video, position: number) => {
    if (!mainFolder) return

    try {
      // Rename the file to include the position in the filename
      const newPath = await window.api.invoke('rename-video-with-position', video.path, position)
      const oldPath = video.path

      // Update the video path in memory
      video.path = newPath
      video.lastPlayedPosition = position

      let updated = false
      if (mainFolder.videosSeq) {
        const videoIndex = mainFolder.videosSeq.findIndex((v) => v.path === oldPath)
        if (videoIndex >= 0) {
          mainFolder.videosSeq[videoIndex].path = newPath
          mainFolder.videosSeq[videoIndex].lastPlayedPosition = position
          updated = true
        }
      }

      if (!updated && mainFolder.subfoldersWithVideos) {
        for (const subfolder of mainFolder.subfoldersWithVideos) {
          const videoIndex = subfolder.videosSeq.findIndex((v) => v.path === oldPath)
          if (videoIndex >= 0) {
            subfolder.videosSeq[videoIndex].path = newPath
            subfolder.videosSeq[videoIndex].lastPlayedPosition = position
            updated = true
            break
          }
        }
      }

      await window.api.invoke('update-main-folder', { path: mainFolder.path })
    } catch (error) {
      setErrorMessage(`Failed to save video position: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const isDev = process.env.NODE_ENV === 'development'

  const playVideoFromFile = async (video: Video) => {
    try {
      if (isDev) {
        const base64 = await window.api.invoke('load-video-data', video.path)
        const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' })
        const blobUrl = URL.createObjectURL(blob)
        setVideoSources([{ src: blobUrl, type: 'video/mp4' }])
      } else {
        const fileUrl = `file://${video.path}`
        setVideoSources([{ src: fileUrl, type: 'video/mp4' }])
      }
      setPlayingVideo(video)
    } catch (error) {
      setErrorMessage(`Failed to load video: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const setNewFolder = async () => {
    try {
      const folderData = await window.api.invoke('set-new-folder')
      if (folderData) {
        setMainFolder(folderData)
      }
    } catch (error) {
      setErrorMessage(`Failed to set new folder: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleVideoClick = (videoIndex: number, folderIndex: number) => {
    setSelectedVideoIndex(videoIndex)
    setSelectedFolderIndex(folderIndex)
  }

  const handleVideoDoubleClick = (video: Video) => {
    playVideoFromFile(video)
  }

  const findNextNonEmptyFolderIndex = (currentIndex: number): number => {
    if (!mainFolder) return -1

    let nextIndex = currentIndex + 1
    while (nextIndex < mainFolder.subfoldersWithVideos.length) {
      if (mainFolder.subfoldersWithVideos[nextIndex].videosSeq.length > 0) {
        return nextIndex
      }
      nextIndex++
    }
    return -1 // No next non-empty folder found
  }

  const findPrevNonEmptyFolderIndex = (currentIndex: number): number => {
    if (!mainFolder) return -1

    let prevIndex = currentIndex - 1
    while (prevIndex >= 0) {
      if (mainFolder.subfoldersWithVideos[prevIndex].videosSeq.length > 0) {
        return prevIndex
      }
      prevIndex--
    }
    return -1 // No previous non-empty folder found
  }

  const findFirstNonEmptyFolderIndex = (): number => {
    if (!mainFolder) return -1
    return mainFolder.subfoldersWithVideos.findIndex((subfolder) => subfolder.videosSeq.length > 0)
  }

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (!mainFolder) return

    // Handle arrow keys for navigation
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()

      const hasNonEmptyFolders = mainFolder.subfoldersWithVideos.some((subfolder) => subfolder.videosSeq.length > 0)
      if (!hasNonEmptyFolders) return

      // If no valid folder is selected or the selected folder is empty, select the first non-empty folder
      if (
        selectedFolderIndex === -1 ||
        selectedFolderIndex >= mainFolder.subfoldersWithVideos.length ||
        mainFolder.subfoldersWithVideos[selectedFolderIndex].videosSeq.length === 0
      ) {
        const firstNonEmptyIndex = findFirstNonEmptyFolderIndex()
        if (firstNonEmptyIndex !== -1) {
          setSelectedFolderIndex(firstNonEmptyIndex)
          setSelectedVideoIndex(0)
        }
        return
      }

      const currentFolder = mainFolder.subfoldersWithVideos[selectedFolderIndex]

      if (e.key === 'ArrowUp') {
        if (selectedVideoIndex > 0) {
          // Move to previous video in current folder
          setSelectedVideoIndex(selectedVideoIndex - 1)
        } else {
          // Move to last video in previous non-empty folder
          const prevFolderIndex = findPrevNonEmptyFolderIndex(selectedFolderIndex)
          if (prevFolderIndex !== -1) {
            const prevFolder = mainFolder.subfoldersWithVideos[prevFolderIndex]
            setSelectedFolderIndex(prevFolderIndex)
            setSelectedVideoIndex(prevFolder.videosSeq.length - 1)
          }
        }
      } else if (e.key === 'ArrowDown') {
        if (selectedVideoIndex < currentFolder.videosSeq.length - 1) {
          // Move to next video in current folder
          setSelectedVideoIndex(selectedVideoIndex + 1)
        } else {
          // Move to first video in next non-empty folder
          const nextFolderIndex = findNextNonEmptyFolderIndex(selectedFolderIndex)
          if (nextFolderIndex !== -1) {
            setSelectedFolderIndex(nextFolderIndex)
            setSelectedVideoIndex(0)
          }
        }
      }

      // Handle Ctrl+Arrow for reordering
      if (e.ctrlKey) {
        const currentVideos = currentFolder.videosSeq
        let newIndex = selectedVideoIndex

        if (e.key === 'ArrowUp' && selectedVideoIndex > 0) {
          newIndex = selectedVideoIndex - 1
        } else if (e.key === 'ArrowDown' && selectedVideoIndex < currentVideos.length - 1) {
          newIndex = selectedVideoIndex + 1
        } else {
          return // Can't move beyond boundaries
        }

        const videos = [...currentVideos]
        const [movedVideo] = videos.splice(selectedVideoIndex, 1)
        videos.splice(newIndex, 0, movedVideo)

        // Update the state
        const updatedSubfolders = [...mainFolder.subfoldersWithVideos]
        updatedSubfolders[selectedFolderIndex] = {
          ...updatedSubfolders[selectedFolderIndex],
          videosSeq: videos,
        }
        setMainFolder({
          ...mainFolder,
          subfoldersWithVideos: updatedSubfolders,
        })

        // First update the selected index to maintain selection during async operations
        setSelectedVideoIndex(newIndex)

        // Update the indices in filenames and update the model with new paths
        try {
          const updatedVideos = [...videos] // Create a copy to store updated videos

          for (let i = 0; i < videos.length; i++) {
            const video = videos[i]
            // Use i+1 to start indexing from 1 instead of 0
            const newPath = await window.api.invoke('update-video-index', video.path, i + 1)

            // Update the video path in the model
            updatedVideos[i] = {
              ...video,
              path: newPath,
            }
          }

          // Update the state with the new paths
          const updatedSubfoldersWithPaths = [...mainFolder.subfoldersWithVideos]
          updatedSubfoldersWithPaths[selectedFolderIndex] = {
            ...updatedSubfoldersWithPaths[selectedFolderIndex],
            videosSeq: updatedVideos,
          }

          // Use a callback to ensure we're working with the latest state
          setMainFolder((prevFolder) => {
            if (!prevFolder) return null
            return {
              ...prevFolder,
              subfoldersWithVideos: updatedSubfoldersWithPaths,
            }
          })
        } catch (error) {
          setErrorMessage(`Failed to update video order: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    // Handle Enter key to play selected video
    if (e.key === 'Enter') {
      if (
        selectedFolderIndex >= 0 &&
        selectedFolderIndex < mainFolder.subfoldersWithVideos.length &&
        selectedVideoIndex >= 0 &&
        selectedVideoIndex < mainFolder.subfoldersWithVideos[selectedFolderIndex].videosSeq.length
      ) {
        const selectedVideo = mainFolder.subfoldersWithVideos[selectedFolderIndex].videosSeq[selectedVideoIndex]
        playVideoFromFile(selectedVideo)
      }
    }
  }

  // Add global keyboard event listener
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard events when not in an input field
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          (document.activeElement as HTMLElement).hasAttribute('contenteditable'))
      ) {
        return
      }

      handleKeyDown(e)
    }

    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [mainFolder, selectedFolderIndex, selectedVideoIndex]) // Re-add when these dependencies change

  React.useEffect(() => {
    window.api
      .invoke('load-config')
      .then((data) => {
        if (data?.mainFolder) {
          setMainFolder(data.mainFolder)
          // Directly initialize selection with the data from the config
          // This ensures we don't need to wait for the state update
          if (data.mainFolder.subfoldersWithVideos) {
            const firstNonEmptyIndex = data.mainFolder.subfoldersWithVideos.findIndex(
              (subfolder) => subfolder.videosSeq.length > 0
            )

            if (firstNonEmptyIndex >= 0) {
              setTimeout(() => {
                setSelectedFolderIndex(firstNonEmptyIndex)
                setSelectedVideoIndex(0)
              }, 100)
            }
          }
        }
      })
      .catch((error) => {
        setErrorMessage(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`)
      })
  }, [])

  return (
    <div className="main-content">
      {errorMessage && (
        <div className="error-message">
          <p>{errorMessage}</p>
          <div className="error-actions">
            <button className="error-btn" onClick={() => setErrorMessage(null)}>
              OK
            </button>
          </div>
        </div>
      )}
      {playingVideo ? (
        <div className="video-player-fullscreen">
          <button
            className="back-btn"
            onClick={async () => {
              try {
                if (playerRef.current && playingVideo) {
                  await saveVideoPosition(playingVideo, playerRef.current.currentTime())
                }
                setPlayingVideo(null)
              } catch (error) {
                setErrorMessage(
                  `Failed to save video position: ${error instanceof Error ? error.message : String(error)}`
                )
              }
            }}
          >
            ←
          </button>
          <div className="video-container">
            <VideoJS options={videoJsOptions} onReady={handlePlayerReady} />
          </div>
        </div>
      ) : (
        <>
          {mainFolder && mainFolder.subSubfolderNames.length > 0 && (
            <div className="warning-message">
              <p>
                Warning: The folders '{mainFolder.subSubfolderNames.join(', ')}' contain subfolders. They are ignored -
                this app shows only the folders directly inside the main folder. Move these folders to the main folder
                to have them displayed.
              </p>
            </div>
          )}
          {mainFolder && (
            <div className="folders-container">
              {/* Subfolder columns */}
              {mainFolder.subfoldersWithVideos.map((subfolder, index) => (
                <div className="folder-column" key={index}>
                  <h3>{subfolder.name}</h3>
                  {subfolder.videosSeq.map((video, videoIndex) => (
                    <div
                      className={`video-item ${selectedFolderIndex === index && selectedVideoIndex === videoIndex ? 'selected' : ''}`}
                      key={videoIndex}
                      onClick={() => handleVideoClick(videoIndex, index)}
                      onDoubleClick={() => handleVideoDoubleClick(video)}
                    >
                      <p>{video.name}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="folder-controls">
            <p>Main folder:</p>
            {mainFolder ? <span>'{mainFolder.path}'</span> : 'Not set'}
            <button className="set-folder-btn" onClick={setNewFolder}>
              Set new main folder
            </button>
          </div>
        </>
      )}
    </div>
  )
}
