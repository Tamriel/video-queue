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
const {
  loadVideosFromFolder,
  playingTimeToFilename,
  extractPlayingTimeFromFilename,
  renameVideoWithPosition
} = require('../lib/window/ipcEvents');

// Create a temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'video-app-position-test-' + Date.now());
const MAIN_FOLDER = path.join(TEST_DIR, 'main');
const SUBFOLDER = path.join(MAIN_FOLDER, 'subfolder');

// Helper function to create test video files
function createVideoFile(filePath, content = 'test video content') {
  fs.writeFileSync(filePath, content);
}

// Setup test environment
beforeAll(() => {
  // Create test directories
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(MAIN_FOLDER, { recursive: true });
  fs.mkdirSync(SUBFOLDER, { recursive: true });
  
  // Create test video files
  createVideoFile(path.join(MAIN_FOLDER, 'video1.mp4'));
  createVideoFile(path.join(MAIN_FOLDER, '01:30 video2.mp4'));
  createVideoFile(path.join(SUBFOLDER, '05:45 video3.mp4'));
});

// Clean up after tests
afterAll(() => {
  // Remove test directory
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Filename position storage', () => {
  test('Should format time correctly for filenames', () => {
    expect(playingTimeToFilename(90)).toBe('01:30');
    expect(playingTimeToFilename(345)).toBe('05:45');
    expect(playingTimeToFilename(3661)).toBe('61:01');
    expect(playingTimeToFilename(0)).toBe('00:00');
  });

  test('Should extract time correctly from filenames', () => {
    const result1 = extractPlayingTimeFromFilename('01:30 video2');
    expect(result1.name).toBe('video2');
    expect(result1.position).toBe(90);

    const result2 = extractPlayingTimeFromFilename('05:45 video3');
    expect(result2.name).toBe('video3');
    expect(result2.position).toBe(345);

    const result3 = extractPlayingTimeFromFilename('video1');
    expect(result3.name).toBe('video1');
    expect(result3.position).toBeUndefined();
  });

  test('Should load videos with positions from filenames', () => {
    const videos = loadVideosFromFolder(MAIN_FOLDER);
    
    // Should find 2 videos in the main folder
    expect(videos.length).toBe(2);
    
    // Find video1 (no position in filename)
    const video1 = videos.find(v => v.name === 'video1');
    expect(video1).toBeDefined();
    expect(video1.lastPlayedPosition).toBeUndefined();
    
    // Find video2 (with position in filename)
    const video2 = videos.find(v => v.name === 'video2');
    expect(video2).toBeDefined();
    expect(video2.lastPlayedPosition).toBe(90); // 01:30 = 90 seconds
  });

  test('Should rename video file with position', () => {
    // Create a test video file
    const originalPath = path.join(MAIN_FOLDER, 'test_rename.mp4');
    createVideoFile(originalPath);
    
    // Rename with position
    const newPath = renameVideoWithPosition(originalPath, 120); // 02:00
    
    // Check that the original file no longer exists
    expect(fs.existsSync(originalPath)).toBe(false);
    
    // Check that the new file exists with the correct name
    expect(fs.existsSync(newPath)).toBe(true);
    expect(path.basename(newPath)).toBe('02:00 test_rename.mp4');
    
    // Test renaming a file that already has a position
    const positionedPath = path.join(MAIN_FOLDER, '01:30 positioned_video.mp4');
    createVideoFile(positionedPath);
    
    // Rename with a new position
    const updatedPath = renameVideoWithPosition(positionedPath, 240); // 04:00
    
    // Check that the original file no longer exists
    expect(fs.existsSync(positionedPath)).toBe(false);
    
    // Check that the new file exists with the correct name
    expect(fs.existsSync(updatedPath)).toBe(true);
    expect(path.basename(updatedPath)).toBe('04:00 positioned_video.mp4');
  });  
});