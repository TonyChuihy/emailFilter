// src/main/index.ts
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn, ChildProcess } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// AI 伺服器 URL
const AI_SERVER_URL = 'https://eabackend-530155207302.asia-east1.run.app/chat'

// 全局變數
let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

// 儲存所有郵件資料（累積陣列）
let allEmails: any[] = []

// Python 響應暫存
let pendingGetSinceEntryResolver: ((emails: any[]) => void) | null = null
let pendingGetRecentResolver: ((entryId: string | null) => void) | null = null

// 初始化用的「第 n 封」郵件索引（例如第 10 封）
const DEFAULT_WATCH_INDEX = 10

// Email 狀態（用於持久化）
interface EmailStateFile {
  emails: any[]
  watchedEntryId: string | null
  processedEntryId: string | null
}

const getEmailStatePath = () => {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'email-state.json')
}

let watchedEntryIdState: string | null = null
let processedEntryIdState: string | null = null

// Word lists 存儲路徑
const getWordListsPath = () => {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'word-lists.json')
}

// 初始化 word lists（從文件讀取或創建默認值）
let blockWordList: string[] = []
let alertWordList: string[] = []

function loadWordLists() {
  const filePath = getWordListsPath()
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(data)
      blockWordList = parsed.blockWordList || []
      alertWordList = parsed.alertWordList || []
    } else {
      // 創建默認空列表
      blockWordList = []
      alertWordList = []
      saveWordLists()
    }
  } catch (error) {
    console.error('讀取 word lists 失敗:', error)
    blockWordList = []
    alertWordList = []
  }
}

function saveWordLists() {
  const filePath = getWordListsPath()
  try {
    const data = {
      blockWordList,
      alertWordList
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('保存 word lists 失敗:', error)
  }
}

function loadEmailState() {
  const filePath = getEmailStatePath()
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(data) as Partial<EmailStateFile>
      allEmails = Array.isArray(parsed.emails) ? parsed.emails : []
      watchedEntryIdState = (parsed.watchedEntryId as string | null | undefined) ?? null
      processedEntryIdState = (parsed.processedEntryId as string | null | undefined) ?? null
    } else {
      allEmails = []
      watchedEntryIdState = null
      processedEntryIdState = null
    }
  } catch (error) {
    console.error('讀取 email 狀態失敗:', error)
    allEmails = []
    watchedEntryIdState = null
    processedEntryIdState = null
  }
}

function saveEmailState() {
  const filePath = getEmailStatePath()
  try {
    const data: EmailStateFile = {
      emails: allEmails,
      watchedEntryId: watchedEntryIdState,
      processedEntryId: processedEntryIdState
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    console.error('保存 email 狀態失敗:', error)
  }
}

// 檢查郵件是否包含 block word，返回觸發的詞列表
function getTriggeredBlockWords(email: any): string[] {
  if (blockWordList.length === 0) return []

  const searchText =
    `${email.subject || ''} ${email.body || ''} ${email.sender || ''}`.toLowerCase()
  const triggeredWords: string[] = []

  blockWordList.forEach((word) => {
    if (word && word.trim() !== '' && searchText.includes(word.toLowerCase())) {
      triggeredWords.push(word)
    }
  })

  return triggeredWords
}

// 調用 AI 伺服器判斷郵件狀態，返回狀態和原因
async function checkEmailWithAI(
  email: any
): Promise<{ status: 'normal' | 'alerted'; reason?: string }> {
  try {
    // 構建提醒詞列表的說明文字
    const alertWordsInfo =
      alertWordList.length > 0
        ? `\n警报詞列表（以下是客户要求的警报词，请特别注意这些关键词）: ${alertWordList.join(', ')}`
        : '\n提醒詞列表: 無'

    const message = `檢查這封郵件是否需要警報:\n主旨: ${email.subject || '無主旨'}\n寄件人: ${email.sender || '未知'}\n內容: ${email.body || email.body_preview || '無內容'}${alertWordsInfo}\n\n請根據郵件內容和提醒詞列表判斷是否需要發出警報。`

    const response = await fetch(AI_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    })

    if (!response.ok) {
      throw new Error(`AI 伺服器錯誤: ${response.status}`)
    }

    const data = await response.json()

    if (data.status === 'success' && data.response) {
      return {
        status: data.response.alerted ? 'alerted' : 'normal',
        reason: data.response.reason || undefined
      }
    }

    // 如果回應格式不符合預期，默認返回 normal
    console.warn('AI 伺服器回應格式不符合預期:', data)
    return { status: 'normal' }
  } catch (error) {
    console.error('調用 AI 伺服器失敗:', error)
    // 發生錯誤時默認返回 normal
    return { status: 'normal' }
  }
}

// 處理郵件狀態判斷
async function processEmailStatus(email: any): Promise<any> {
  // 先檢查是否包含 block word
  const triggeredBlockWords = getTriggeredBlockWords(email)
  if (triggeredBlockWords.length > 0) {
    return {
      ...email,
      status: 'block',
      triggeredBlockWords: triggeredBlockWords
    }
  }

  // 如果不包含 block word，調用 AI 伺服器判斷
  const aiResult = await checkEmailWithAI(email)
  return {
    ...email,
    status: aiResult.status,
    alertReason: aiResult.reason
  }
}

// 發送 JSON 指令給 Python
function sendToPython(command: any) {
  if (!pythonProcess || !pythonProcess.stdin) {
    console.error('Python 進程未啟動或 stdin 不可用')
    return
  }

  try {
    pythonProcess.stdin.write(JSON.stringify(command) + '\n')
  } catch (error) {
    console.error('發送指令到 Python 失敗:', error)
  }
}

// 從指定 entry_id 之後取得歷史郵件（最多 100 封，由 Python 控制）
async function getEmailsSinceEntryFromPython(entryId: string): Promise<any[]> {
  if (!entryId) return []
  if (!pythonProcess || !pythonProcess.stdin) {
    console.error('Python 進程未啟動，無法獲取歷史郵件')
    return []
  }

  return new Promise((resolve) => {
    // 目前只允許一個 pending 請求，簡化協調
    pendingGetSinceEntryResolver = (emails: any[]) => {
      resolve(emails || [])
    }

    sendToPython({
      cmd: 'get_since_entry',
      entry_id: entryId
    })
  })
}

// 取得第 n 封郵件的 EntryID（n 由主進程決定，預設為 DEFAULT_WATCH_INDEX）
async function getNthEntryIdFromPython(index: number): Promise<string | null> {
  if (!pythonProcess || !pythonProcess.stdin) {
    console.error('Python 進程未啟動，無法獲取指定郵件 EntryID')
    return null
  }

  return new Promise((resolve) => {
    pendingGetRecentResolver = (entryId: string | null) => {
      resolve(entryId ?? null)
    }

    sendToPython({
      cmd: 'get_recent',
      index
    })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    // 視窗準備好後，主動推送一次當前所有郵件給前端
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('emails-updated', allEmails)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools() // 開發時自動開 DevTools
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 啟動 Python exe
function startPythonBackend() {
  const exePath = is.dev
    ? join(__dirname, '../../python-backend/dist/main.exe')
    : join(process.resourcesPath, 'python-backend/main.exe')

  console.log(`嘗試啟動 Python exe: ${exePath}`)

  pythonProcess = spawn(exePath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' } // 強制 Python 輸出 UTF-8
  })

  let leftover = '' // 新增：用來儲存跨 chunks 的殘缺行

  pythonProcess.stdout?.on('data', (data) => {
    // 明確使用 UTF-8 解碼
    const text = Buffer.from(data).toString('utf8')

    // 預置上次的殘缺 + 當前 text
    const fullText = leftover + text

    // split 出完整行，注意 filter(Boolean) 已濾空行
    const lines = fullText.split('\n')

    // 最後一個可能殘缺，pop 出保存到下次（如果空，設 '')
    leftover = lines.pop() || ''

    // 處理完整行
    for (const line of lines) {
      if (!line.trim()) continue // 跳過空行

      try {
        const msg = JSON.parse(line)

        // 你的原邏輯
        if (msg.type === 'new_email') {
          const entryId = msg.data?.entry_id
          console.log('收到來自 Python 的新郵件通知, entry_id:', entryId)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('python-new-email', entryId)
          }
        } else if (msg.type === 'init') {
          console.log('Python 監控初始化完成')
        } else if (msg.type === 'error') {
          console.error('Python 錯誤:', msg.message.slice(0, 100))
        } else if (msg.type === 'response' && msg.cmd === 'get_since_entry') {
          if (pendingGetSinceEntryResolver) {
            pendingGetSinceEntryResolver(msg.data || [])
            pendingGetSinceEntryResolver = null
          }
        } else if (msg.type === 'response' && msg.cmd === 'get_recent') {
          if (pendingGetRecentResolver) {
            const entryId =
              msg.data && typeof msg.data.entry_id === 'string' ? msg.data.entry_id : null
            pendingGetRecentResolver(entryId)
            pendingGetRecentResolver = null
          }
        }
      } catch (e) {
        // 非 JSON 或無效，記錄
        console.log('[Python raw]', line.trim().slice(0, 100))
        console.error('Python 錯誤:', e)
      }
    }
  })

  pythonProcess.stderr?.on('data', (data) => {
    // stderr 也用 UTF-8
    const errText = Buffer.from(data).toString('utf8')
    console.error('[Python Error]', errText.trim())
  })

  pythonProcess.on('close', (code) => {
    console.log(`Python 進程結束，退出碼: ${code}`)
    pythonProcess = null
  })

  pythonProcess.on('error', (err) => {
    console.error('啟動 Python 失敗:', err)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC 測試（保留原範例）
  ipcMain.on('ping', () => console.log('pong'))

  // 載入 word lists
  loadWordLists()

  // 載入 email 狀態（emails + watched / processed entry id）
  loadEmailState()

  // IPC 處理器：獲取 block word list
  ipcMain.handle('get-block-word-list', () => {
    return blockWordList
  })

  // IPC 處理器：設置 block word list
  ipcMain.handle('set-block-word-list', (_event, words: string[]) => {
    blockWordList = words
    saveWordLists()
    return true
  })

  // IPC 處理器：獲取 alert word list
  ipcMain.handle('get-alert-word-list', () => {
    return alertWordList
  })

  // IPC 處理器：設置 alert word list
  ipcMain.handle('set-alert-word-list', (_event, words: string[]) => {
    alertWordList = words
    saveWordLists()
    return true
  })

  // 啟動 Python 後端
  startPythonBackend()

  // 取得第 n 封郵件的 EntryID（初始化 watchedEntryId 使用），僅透過 IPC 暴露給 preload / renderer
  ipcMain.handle('get-recent', async () => {
    if (!pythonProcess || !pythonProcess.stdin) {
      return { entryId: null }
    }

    try {
      const entryId = await getNthEntryIdFromPython(DEFAULT_WATCH_INDEX)

      // #region agent log      // #endregion

      return { entryId }
    } catch (error) {
      console.error('get-recent 執行失敗:', error)
      return { entryId: null }
    }
  })

  // 提供目前持久化的 email 狀態（不含 emails，本身透過 emails-updated 下發）
  ipcMain.handle('get-email-state', () => {
    return {
      watchedEntryId: watchedEntryIdState,
      processedEntryId: processedEntryIdState
    }
  })

  // 更新並持久化 watched / processed entry id
  ipcMain.handle(
    'set-email-state',
    (
      _event,
      args: {
        watchedEntryId?: string | null
        processedEntryId?: string | null
      }
    ) => {
      if ('watchedEntryId' in args) {
        watchedEntryIdState = args.watchedEntryId ?? null
      }
      if ('processedEntryId' in args) {
        processedEntryIdState = args.processedEntryId ?? null
      }
      saveEmailState()
      return true
    }
  )

  // 唯一合法的更新方法：從 watched_entry_id 開始補齊郵件，並對新郵件做 AI 檢查
  ipcMain.handle(
    'update-until',
    async (
      _event,
      args: {
        watchedEntryId?: string | null
        processedEntryId?: string | null
      }
    ) => {
      const watchedEntryId = args?.watchedEntryId ?? null

      // 同步更新主進程中的 watched 狀態（供持久化使用）
      if (watchedEntryId) {
        watchedEntryIdState = watchedEntryId
      }

      // 如果沒有 Python 或沒有 watched 標記，就直接回傳當前陣列
      if (!pythonProcess || !pythonProcess.stdin || !watchedEntryId) {
        const latestId = allEmails[0]?.entry_id ?? null
        processedEntryIdState = latestId
        saveEmailState()

        // #region agent log        // #endregion

        return {
          emails: allEmails,
          newProcessedEntryId: latestId
        }
      }

      try {
        // 從 Python 取得 watched_entry_id 之後的所有新郵件（最多 100 封）
        const historyEmails = await getEmailsSinceEntryFromPython(watchedEntryId)

        // 合併進全局 allEmails，避免重複
        for (const email of historyEmails) {
          const existIndex = allEmails.findIndex((e: any) => e.entry_id === email.entry_id)
          if (existIndex === -1) {
            const pendingEmail = {
              ...email,
              status: 'pending' as const
            }
            allEmails = [pendingEmail, ...allEmails]
          }
        }

        // 找出需要 AI 檢查的（目前標成 pending 的）
        const needCheck = allEmails.filter((e: any) => e.status === 'pending')

        await Promise.all(
          needCheck.map(async (email: any) => {
            const emailWithStatus = await processEmailStatus(email)
            const idx = allEmails.findIndex((e: any) => e.entry_id === emailWithStatus.entry_id)
            if (idx !== -1) {
              allEmails[idx] = emailWithStatus
            }
          })
        )

        // 完成後同步給 renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emails-updated', allEmails)
        }

        const latestId = allEmails[0]?.entry_id ?? null
        processedEntryIdState = latestId
        saveEmailState()

        // #region agent log
        // #endregion

        return {
          emails: allEmails,
          newProcessedEntryId: latestId
        }
      } catch (error) {
        console.error('update-until 執行失敗:', error)
        const latestId = allEmails[0]?.entry_id ?? null
        processedEntryIdState = latestId
        saveEmailState()

        // #region agent log        // #endregion

        return {
          emails: allEmails,
          newProcessedEntryId: latestId
        }
      }
    }
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 關閉應用時終止 Python
  if (pythonProcess && !pythonProcess.killed) {
    console.log('關閉應用，終止 Python 進程...')
    pythonProcess.kill()
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
