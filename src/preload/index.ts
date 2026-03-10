// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

let emails: any[] = [] // 這邊會被 main 更新

// 在 preload 中維護的狀態標記
let processedEntryId: string | null = null
let watchedEntryId: string | null = null

// 將目前的 watched / processed 狀態持久化到硬碟
function persistEmailState() {
  return ipcRenderer.invoke('set-email-state', {
    watchedEntryId,
    processedEntryId
  })
}

// 唯一合法的更新實作：呼叫 main 的 update-until，更新本地 emails / processedEntryId
async function performUpdateUntil() {
  const result = await ipcRenderer.invoke('update-until', {
    watchedEntryId,
    processedEntryId
  })

  const updatedEmails = result?.emails ?? emails
  const newProcessedId = result?.newProcessedEntryId ?? null

  if (Array.isArray(updatedEmails)) {
    emails = updatedEmails
  }
  if (newProcessedId) {
    processedEntryId = newProcessedId
  }

  // 每次合法更新後，同步持久化狀態
  void persistEmailState()

  // #region agent log
  // #endregion

  return {
    emails,
    processedEntryId,
    watchedEntryId
  }
}

// 應用初始化時的邏輯：
// 1. 先從主進程載入已持久化的 watched / processed
// 2. 如果 watchedEntryId 仍為空，透過 get-recent 取得最近 10 封
//    並把「第 10 封（或不足時的最後一封）」設為 watchedEntryId
// 3. 然後呼叫 update-until 做一次合法更新
async function initializeWatchedAndUpdate() {
  try {
    // 先讀取之前保存過的狀態
    const state = await ipcRenderer.invoke('get-email-state')
    if (state) {
      if (typeof state.watchedEntryId === 'string' || state.watchedEntryId === null) {
        watchedEntryId = state.watchedEntryId
      }
      if (typeof state.processedEntryId === 'string' || state.processedEntryId === null) {
        processedEntryId = state.processedEntryId
      }
    }

    if (!watchedEntryId) {
      const res = await ipcRenderer.invoke('get-recent')
      const entryId: string | null = res?.entryId ?? null
      if (entryId) {
        watchedEntryId = entryId
      }
    }

    // 無論最初是否有 watchedEntryId，最後都走一次 update-until
    await performUpdateUntil()
  } catch (error) {
    console.error('初始化 watchedEntryId / update-until 失敗:', error)
  }
}

// 當 Python 通知有新郵件時，自動透過 update-until 做一次合法更新
ipcRenderer.on('python-new-email', () => {
  void performUpdateUntil()
})

// 無論 renderer 是否已經註冊回調，預先監聽 emails-updated 來同步本地 emails 陣列
ipcRenderer.on('emails-updated', (_event, newEmails: any[]) => {
  if (Array.isArray(newEmails)) {
    emails = newEmails
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  // 取得當前所有 email 陣列（同步）
  getEmails: () => emails,

  // 監聽 email 更新（當 main 收到新郵件時觸發）
  onEmailsUpdate: (callback: (updatedEmails: any[]) => void) => {
    const handler = (_: any, newEmails: any[]) => {
      emails = newEmails // 同步更新本地陣列
      callback(newEmails)

      // #region agent log

      // #endregion
    }
    ipcRenderer.on('emails-updated', handler)
    return () => ipcRenderer.removeListener('emails-updated', handler)
  },

  // -------- watched / processed 狀態相關 --------
  getProcessedEntryId: () => processedEntryId,
  getWatchedEntryId: () => watchedEntryId,

  setProcessedEntryId: (id: string | null) => {
    processedEntryId = id
    void persistEmailState()
  },

  setWatchedEntryId: (id: string | null) => {
    watchedEntryId = id
    void persistEmailState()
  },

  // 將目前最新一封郵件標記為「已檢閱全部」
  markAllWatched: () => {
    if (emails.length > 0) {
      const latest = emails[0]
      if (latest && latest.entry_id) {
        watchedEntryId = latest.entry_id
        void persistEmailState()
      }
    }
    return watchedEntryId
  },

  // 唯一合法的更新方法：從 watched_entry_id 開始更新，並把 processed_entry_id 推進到最新
  updateUntil: async () => {
    return performUpdateUntil()
  },

  // 獲取 block word list
  getBlockWordList: () => ipcRenderer.invoke('get-block-word-list'),

  // 設置 block word list
  setBlockWordList: (words: string[]) => ipcRenderer.invoke('set-block-word-list', words),

  // 獲取 alert word list
  getAlertWordList: () => ipcRenderer.invoke('get-alert-word-list'),

  // 設置 alert word list
  setAlertWordList: (words: string[]) => ipcRenderer.invoke('set-alert-word-list', words)
})

// 應用啟動時執行初始化流程
void initializeWatchedAndUpdate()
