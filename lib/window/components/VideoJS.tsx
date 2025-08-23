import React from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

interface VideoJSProps {
  options: {
    sources: any;
    autoplay?: boolean;
  };
  onReady?: (player: any) => void;
}

export const VideoJS = (props: VideoJSProps) => {
  const videoRef = React.useRef<HTMLDivElement>(null)
  const playerRef = React.useRef<any>(null)
  const { options, onReady } = props

  React.useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      // The Video.js player needs to be _inside_ the component el for React 18 Strict Mode.
      const videoElement = document.createElement('video-js')

      videoElement.classList.add('vjs-big-play-centered')
      if (videoRef.current) {
        videoRef.current.appendChild(videoElement)
      }

      const player = (playerRef.current = videojs(videoElement, options, () => {
        videojs.log('player is ready')
        
        // Add seeking event handler to handle large video seeking
        player.on('seeking', () => {
          const currentTime = player.currentTime();        
          // Call the global seeking handler function from MainContent
          if (window.handleVideoSeeking && typeof currentTime === 'number') {
            window.handleVideoSeeking(currentTime);
          } else {
            console.warn('handleVideoSeeking function not found or currentTime is not a number');
          }
        });
        
        onReady && onReady(player)
      }))

      // update the existing player on prop change
    } else {
      const player = playerRef.current
      console.log('Updating player source to:', options.sources)
      player.autoplay(options.autoplay)
      player.src(options.sources)
      player.load()
    }
  }, [JSON.stringify(options.sources)])

  // Dispose the Video.js player when the functional component unmounts
  React.useEffect(() => {
    const player = playerRef.current

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose()
        playerRef.current = null
      }
    }
  }, [playerRef])

  return (
    <div data-vjs-player style={{ width: '100%' }}>
      <div ref={videoRef} />
    </div>
  )
}

export default VideoJS
