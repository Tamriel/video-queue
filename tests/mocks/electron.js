// Mock for the electron module
module.exports = {
  ipcMain: {
    handle: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  type: {
    BrowserWindow: jest.fn(),
  },
};