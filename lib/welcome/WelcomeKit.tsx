import './styles.css';
import React from 'react';
import VideoJS from '../window/components/VideoJS';
import videojs from 'video.js';

export default function WelcomeKit() {
  const playerRef = React.useRef<videojs.Player | null>(null);
  const [videoSources, setVideoSources] = React.useState([]);

  const videoJsOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: true,
    sources: videoSources
  };
  

  const handlePlayerReady = (player) => {
    playerRef.current = player;
    player.on('waiting', () => {
      videojs.log('player is waiting');
    });
    player.on('dispose', () => {
      videojs.log('player will dispose');
    });
  };window.api.invoke('init-window')

  const handleSelectFolder = async () => {
    const files = await window.api.invoke('select-folder');
    const firstVideo = files.find(f => f.isVideo);
    if (firstVideo) {
      const base64 = await window.api.invoke('load-video-data', firstVideo.path);
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      setVideoSources([{ src: blobUrl, type: 'video/mp4' }]);
    }
  };  

  return (
    <div className="welcome-content">
      <p>hello</p>
      <VideoJS options={videoJsOptions} onReady={handlePlayerReady} />
      <button onClick={handleSelectFolder}>Select folder</button>
    </div>
  );
}