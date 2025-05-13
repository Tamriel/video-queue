import './styles.css'
import React from 'react'
import VideoJS from '../window/components/VideoJS'
import videojs from 'video.js'

export default function WelcomeKit() {
  const playerRef = React.useRef<videojs.Player | null>(null)
  const [videoSources, setVideoSources] = React.useState([])
  const [videoList, setVideoList] = React.useState([])
  const [selectedVideo, setSelectedVideo] = React.useState(null)

  const videoJsOptions = {
    autoplay: false,
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
  window.api.invoke('init-window')

  const isDev = process.env.NODE_ENV === 'development'
  const playVideoFromFile = async (video) => {
    if (isDev) {
      const base64 = await window.api.invoke('load-video-data', video.path)
      const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'video/mp4' })
      const blobUrl = URL.createObjectURL(blob)
      setVideoSources([{ src: blobUrl, type: 'video/mp4' }])
    } else {
      const fileUrl = `file://${video.path}`
      setVideoSources([{ src: fileUrl, type: 'video/mp4' }])
    }
    setSelectedVideo(video)
  }

  const handleSelectFolder = async () => {
    const files = await window.api.invoke('select-folder')
    setVideoList(files)
  }

  return (
    <div className="welcome-content">
      {selectedVideo ? (
        <div className="video-player-fullscreen">
          <button onClick={() => setSelectedVideo(null)}>Zurück</button>
          <VideoJS
            options={{
              autoplay: true,
              controls: true,
              responsive: true,
              fluid: true,
              sources: videoSources,
            }}
            onReady={handlePlayerReady}
          />
        </div>
      ) : (
        <>
          <button onClick={handleSelectFolder}>Select folder</button>
          <div className="video-list">
            {videoList.map((video, idx) => (
              <div key={idx} className="video-item" onClick={() => playVideoFromFile(video)}>
                <p>{video.name}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
