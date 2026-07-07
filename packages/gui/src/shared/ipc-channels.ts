/**
 * Single source of truth for IPC channel names, imported by preload, main and
 * (indirectly) renderer. Request/response channels pair with ipcMain.handle /
 * ipcRenderer.invoke; `taskEvent` is a main → renderer push (webContents.send).
 */
export const IPC = {
  // request / response
  projectGet: 'vespasian:project:get',
  projectSelect: 'vespasian:project:select',
  dialogDirectory: 'vespasian:dialog:directory',
  dialogFile: 'vespasian:dialog:file',
  prereqRun: 'vespasian:prereq:run',
  prereqResult: 'vespasian:prereq:result',
  initRun: 'vespasian:init:run',
  initResult: 'vespasian:init:result',
  siteRun: 'vespasian:site:run',
  siteStatus: 'vespasian:site:status',
  listPlans: 'vespasian:project:plans',
  pipelineRun: 'vespasian:pipeline:run',
  pipelineResult: 'vespasian:pipeline:result',
  qaRun: 'vespasian:qa:run',
  qaArtifacts: 'vespasian:qa:artifacts',
  qaImage: 'vespasian:qa:image',
  qaText: 'vespasian:qa:text',
  openExternal: 'vespasian:shell:open-external',
  openPath: 'vespasian:shell:open-path',
  taskSnapshot: 'vespasian:task:snapshot',
  taskCancel: 'vespasian:task:cancel',
  // main → renderer push
  taskEvent: 'vespasian:task:event',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
