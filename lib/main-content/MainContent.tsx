import './styles.css'
import React from 'react'
import VideoJS from '../window/components/VideoJS'
import videojs from 'video.js'

export default function MainContent() {
  const playerRef = React.useRef<any>(null)

  type Video = { name: string; path: string; lastPlayedPosition?: number }
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

  const saveVideoPosition = (video: Video, position: number) => {
    if (!mainFolder) return
    video.lastPlayedPosition = position
    let updated = false
    if (mainFolder.videosSeq) {
      const videoIndex = mainFolder.videosSeq.findIndex((v) => v.path === video.path)
      if (videoIndex >= 0) {
        mainFolder.videosSeq[videoIndex].lastPlayedPosition = position
        updated = true
      }
    }
    if (!updated && mainFolder.subfoldersWithVideos) {
      for (const subfolder of mainFolder.subfoldersWithVideos) {
        const videoIndex = subfolder.videosSeq.findIndex((v) => v.path === video.path)
        if (videoIndex >= 0) {
          subfolder.videosSeq[videoIndex].lastPlayedPosition = position
          updated = true
          break
        }
      }
    }
    window.api.invoke('update-main-folder', mainFolder)
  }
  const isDev = process.env.NODE_ENV === 'development'
  const playVideoFromFile = async (video: Video) => {
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
  }

  const setNewFolder = async () => {
    const folderData = await window.api.invoke('set-new-folder')
    if (folderData) {
      setMainFolder(folderData)
    }
  }

  React.useEffect(() => {
    window.api.invoke('load-config').then((data) => {
      if (data?.mainFolder) {
        setMainFolder(data.mainFolder)
      }
    })
  }, [])

  return (
    <div className="main-content">
      {playingVideo ? (
        <div className="video-player-fullscreen">
          <button
            className="back-btn"
            onClick={() => {
              if (playerRef.current && playingVideo) {
                saveVideoPosition(playingVideo, playerRef.current.currentTime())
              }
              setPlayingVideo(null)
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
              {/* Main folder videos column (only if videos exist) */}
              {mainFolder.videosSeq.length > 0 && (
                <div className="folder-column">
                  <h3>Main folder videos</h3>
                  <div className="video-list">
                    {mainFolder.videosSeq.map((video, index) => (
                      <div className="video-item" key={index} onClick={() => playVideoFromFile(video)}>
                        <p>{video.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subfolder columns */}
              {mainFolder.subfoldersWithVideos.map((subfolder, index) => (
                <div className="folder-column" key={index}>
                  <h3>{subfolder.name}</h3>
                  {subfolder.videosSeq.map((video, videoIndex) => (
                    <div className="video-item" key={videoIndex} onClick={() => playVideoFromFile(video)}>
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
