import './styles.css'
import React from 'react'
import VideoJS from '../window/components/VideoJS'
import videojs from 'video.js'

export default function MainContent() {
  const playerRef = React.useRef(null)

  type Video = { name: string; path: string }
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
  }

  const handlePlayerReady = (player) => {
    playerRef.current = player
    player.on('waiting', () => {
      videojs.log('player is waiting')
    })
    player.on('dispose', () => {
      videojs.log('player will dispose')
    })
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

  const setFolder = async () => {
    const folderData = await window.api.invoke('set-folder')
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
          <button className="back-btn" onClick={() => setPlayingVideo(null)}>
            Back
          </button>
          <VideoJS options={videoJsOptions} onReady={handlePlayerReady} />
        </div>
      ) : (
        <>
          {mainFolder && mainFolder.subSubfolderNames.length > 0 && (
            <div className="warning-message">
              <p>
                Warning: The folders '{mainFolder.subSubfolderNames.join(', ')}' contain subfolders. They are ignored -
                this app shows only the folders directly inside the main folder. Move these folders to the main folder
                to view them here.
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
                  <div className="video-list">
                    {subfolder.videosSeq.map((video, videoIndex) => (
                      <div className="video-item" key={videoIndex} onClick={() => playVideoFromFile(video)}>
                        <p>{video.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="folder-controls">
            <p>Main folder:</p>
            {mainFolder ? <span>'{mainFolder.path}'</span> : 'Not set'}
            <button className="set-folder-btn" onClick={setFolder}>
              Set main folder
            </button>
          </div>
        </>
      )}
    </div>
  )
}
