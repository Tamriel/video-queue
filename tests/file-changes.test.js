const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock electron-conf
jest.mock('electron-conf/main', () => ({
  Conf: class MockConf {
    constructor() {
      this.store = {};
    }
    get(key) {
      return this.store[key];
    }
    set(key, value) {
      this.store[key] = value;
      return value;
    }
  }
}));

// Import the Conf class after mocking
const { Conf } = require('electron-conf/main');

// Import the functions directly from ipcEvents.ts
jest.mock('../lib/window/ipcEvents', () => {
  // Create a mock implementation of the functions
  const originalModule = jest.requireActual('../lib/window/ipcEvents');
  
  return {
    ...originalModule,
    // We don't need to mock these functions as we'll use the actual implementations
  };
});

const {
  loadVideosFromFolder,
  scanForSubfoldersWithVideos,
  findSubSubfolderNames,
  refreshMainFolder
} = require('../lib/window/ipcEvents');

// Create a temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'video-app-test-' + Date.now());
const MAIN_FOLDER = path.join(TEST_DIR, 'main');
const SUBFOLDER1 = path.join(MAIN_FOLDER, 'subfolder1');
const SUBFOLDER2 = path.join(MAIN_FOLDER, 'subfolder2');

// Helper function to create test video files
function createVideoFile(filePath, content = 'test video content') {
  fs.writeFileSync(filePath, content);
}

// Setup test environment
beforeAll(() => {
  // Create test directories
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(MAIN_FOLDER, { recursive: true });
  fs.mkdirSync(SUBFOLDER1, { recursive: true });
  fs.mkdirSync(SUBFOLDER2, { recursive: true });
  
  // Create test video files
  createVideoFile(path.join(MAIN_FOLDER, 'video1.mp4'));
  createVideoFile(path.join(MAIN_FOLDER, 'video2.mp4'));
  createVideoFile(path.join(SUBFOLDER1, 'video3.mp4'));
  createVideoFile(path.join(SUBFOLDER1, 'video4.mp4'));
  createVideoFile(path.join(SUBFOLDER2, 'video5.mp4'));
});

// Clean up after tests
afterAll(() => {
  // Remove test directory
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('File change handling', () => {
  test('Should handle external file changes correctly', () => {
    // Create a mock store
    const store = new Conf();
    
    // Step 1: Initial scan of the folder
    const videos = loadVideosFromFolder(MAIN_FOLDER);
    const subfoldersWithVideos = scanForSubfoldersWithVideos(MAIN_FOLDER);
    const subSubfolderNames = findSubSubfolderNames(MAIN_FOLDER);
    
    // Create initial folder structure
    const initialFolder = {
      path: MAIN_FOLDER,
      videosSeq: videos,
      subfoldersWithVideos,
      subSubfolderNames,
    };
    
    // Add playback positions to some videos
    initialFolder.videosSeq[0].lastPlayedPosition = 10; // video1.mp4
    initialFolder.videosSeq[1].lastPlayedPosition = 20; // video2.mp4
    initialFolder.subfoldersWithVideos[0].videosSeq[0].lastPlayedPosition = 30; // subfolder1/video3.mp4
    initialFolder.subfoldersWithVideos[0].videosSeq[1].lastPlayedPosition = 40; // subfolder1/video4.mp4
    initialFolder.subfoldersWithVideos[1].videosSeq[0].lastPlayedPosition = 50; // subfolder2/video5.mp4
    
    // Save to store
    store.set('mainFolder', initialFolder);
    
    // Step 2: Make external changes to files
    // Delete a file
    fs.unlinkSync(path.join(MAIN_FOLDER, 'video1.mp4'));
    
    // Add a new file
    createVideoFile(path.join(MAIN_FOLDER, 'video6.mp4'));
    
    // Rename a file
    fs.renameSync(
      path.join(MAIN_FOLDER, 'video2.mp4'),
      path.join(MAIN_FOLDER, 'video2_renamed.mp4')
    );
    
    // Move a file from one folder to another
    fs.renameSync(
      path.join(SUBFOLDER1, 'video3.mp4'),
      path.join(SUBFOLDER2, 'video3.mp4')
    );
    
    // Step 3: Simulate app restart by refreshing the folder
    const storedMainFolder = store.get('mainFolder');
    const refreshedFolder = refreshMainFolder(storedMainFolder);
    
    // Step 4: Verify the results
    
    // Check that the deleted file is missing
    const deletedVideo = refreshedFolder.videosSeq.find(v => v.name === 'video1');
    expect(deletedVideo).toBeUndefined();
    
    // Check that the added file exists
    const addedVideo = refreshedFolder.videosSeq.find(v => v.name === 'video6');
    expect(addedVideo).toBeDefined();
    
    // Check that the renamed file has lost its playback position
    const renamedVideo = refreshedFolder.videosSeq.find(v => v.name === 'video2_renamed');
    expect(renamedVideo).toBeDefined();
    expect(renamedVideo.lastPlayedPosition).toBeUndefined();
    
    // Check that the moved file retained its playback position
    const movedVideo = refreshedFolder.subfoldersWithVideos[1].videosSeq.find(v => v.name === 'video3');
    expect(movedVideo).toBeDefined();
    expect(movedVideo.lastPlayedPosition).toBe(30);
  });
});