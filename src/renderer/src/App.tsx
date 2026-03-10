// src/renderer/src/App.tsx
import { useState, useEffect } from 'react'
import './App.css'

interface Email {
  entry_id: string
  subject: string
  sender: string
  received_time: string
  body_preview: string
  body?: string
  status?: 'block' | 'normal' | 'alerted' | 'pending'
  triggeredBlockWords?: string[]
  alertReason?: string
}

const ITEMS_PER_PAGE = 12  // 每頁顯示 12 封

function App() {
  const [emails, setEmails] = useState<Email[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [blockWordList, setBlockWordList] = useState<string[]>([])
  const [alertWordList, setAlertWordList] = useState<string[]>([])
  const [blockWordInput, setBlockWordInput] = useState('')
  const [alertWordInput, setAlertWordInput] = useState('')

  useEffect(() => {
    // 初始取得當前陣列
    // @ts-ignore
    const initial = window.electronAPI.getEmails()
    // #region agent log
    
    // #endregion
    setEmails(initial)

    // 監聽更新
    // @ts-ignore
    const unsubscribe = window.electronAPI.onEmailsUpdate((updated: Email[]) => {
      // #region agent log
      
      // #endregion
      setEmails(updated)
      // 新郵件進來時，自動跳回第一頁（可改成保持當前頁）
      setCurrentPage(1)
    })

    // 載入 word lists
    // @ts-ignore
    window.electronAPI.getBlockWordList().then((words: string[]) => {
      setBlockWordList(words)
    })
    // @ts-ignore
    window.electronAPI.getAlertWordList().then((words: string[]) => {
      setAlertWordList(words)
    })

    return () => unsubscribe()
  }, [])

  // 「已檢閱全部」：把目前最新一封郵件標記到 watched_entry_id
  const handleMarkAllWatched = () => {
    // @ts-ignore
    window.electronAPI.markAllWatched()
  }

  // 「刷新」：唯一合法的更新方法，會補齊郵件並觸發 AI 檢查
  const handleRefresh = async () => {
    console.log('刷新開始')
    try {
      // @ts-ignore
      const result = await window.electronAPI.updateUntil()
      console.log('刷新結果', Array.isArray(result.emails))
      if (result && Array.isArray(result.emails)) {
        setEmails(result.emails)
        setCurrentPage(1)
        console.log('刷新成功', result.emails.length)
      }
    } catch (error) {
      console.error('刷新失敗:', error)
    }
  }

  // 分頁計算
  const totalPages = Math.ceil(emails.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentEmails = emails.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // 添加 block word
  const addBlockWord = () => {
    const word = blockWordInput.trim()
    if (word && !blockWordList.includes(word)) {
      const newList = [...blockWordList, word]
      setBlockWordList(newList)
      setBlockWordInput('')
      // @ts-ignore
      window.electronAPI.setBlockWordList(newList)
    }
  }

  // 刪除 block word
  const removeBlockWord = (word: string) => {
    const newList = blockWordList.filter(w => w !== word)
    setBlockWordList(newList)
    // @ts-ignore
    window.electronAPI.setBlockWordList(newList)
  }

  // 添加 alert word
  const addAlertWord = () => {
    const word = alertWordInput.trim()
    if (word && !alertWordList.includes(word)) {
      const newList = [...alertWordList, word]
      setAlertWordList(newList)
      setAlertWordInput('')
      // @ts-ignore
      window.electronAPI.setAlertWordList(newList)
    }
  }

  // 刪除 alert word
  const removeAlertWord = (word: string) => {
    const newList = alertWordList.filter(w => w !== word)
    setAlertWordList(newList)
    // @ts-ignore
    window.electronAPI.setAlertWordList(newList)
  }

  return (
    <div className="app">
      {/* 上方系統塊 - 橫向佈局 */}
      <header className="system-block">
        <div className="system-block-content">
          <h1 className="app-title">Email Alert</h1>
          <div className="system-info">
            <div className="email-overview">
              <span className="overview-item">總共 {emails.length} 封</span>
              <span className="overview-item">第 {currentPage} / {totalPages} 頁</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="settings-btn"
                onClick={handleRefresh}
              >
                刷新
              </button>
              <button 
                className="settings-btn"
                onClick={handleMarkAllWatched}
              >
                已檢閱全部
              </button>
              <button 
                className="settings-btn"
                onClick={() => setShowSettings(true)}
              >
                設置
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 設置彈窗 */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">設置</h2>
              <button 
                className="modal-close-btn"
                onClick={() => setShowSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="word-list-section">
                <h3>屏蔽詞列表 (Block Word List)</h3>
                <div className="word-input-group">
                  <input
                    type="text"
                    className="word-input"
                    placeholder="輸入屏蔽詞..."
                    value={blockWordInput}
                    onChange={(e) => setBlockWordInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addBlockWord()}
                  />
                  <button className="add-btn" onClick={addBlockWord}>添加</button>
                </div>
                <div className="word-list">
                  {blockWordList.length === 0 ? (
                    <p className="empty-list">暫無屏蔽詞</p>
                  ) : (
                    blockWordList.map((word, idx) => (
                      <span key={idx} className="word-tag">
                        {word}
                        <button className="remove-btn" onClick={() => removeBlockWord(word)}>×</button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="word-list-section">
                <h3>提醒詞列表 (Alert Word List)</h3>
                <div className="word-input-group">
                  <input
                    type="text"
                    className="word-input"
                    placeholder="輸入提醒詞..."
                    value={alertWordInput}
                    onChange={(e) => setAlertWordInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addAlertWord()}
                  />
                  <button className="add-btn" onClick={addAlertWord}>添加</button>
                </div>
                <div className="word-list">
                  {alertWordList.length === 0 ? (
                    <p className="empty-list">暫無提醒詞</p>
                  ) : (
                    alertWordList.map((word, idx) => (
                      <span key={idx} className="word-tag">
                        {word}
                        <button className="remove-btn" onClick={() => removeAlertWord(word)}>×</button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 下方電郵檢測區 */}
      <main className="email-detection-area">
        <div className="email-container">
          {emails.length === 0 ? (
            <div className="empty-state">
              <h2>目前沒有郵件</h2>
              <p>當 Outlook 收到新郵件時，將自動顯示在這裡</p>
            </div>
          ) : (
            <>
              {/* 郵件卡片 grid */}
              <div className="email-grid">
                {currentEmails.map((email, idx) => {
                  const statusClass = email.status || 'normal'
                  return (
                    <div key={idx} className={`email-card email-card-${statusClass}`}>
                      {/* 狀態標籤 */}
                      {email.status && email.status !== 'normal' && (
                        <div className={`email-status-badge status-${email.status}`}>
                          {email.status === 'block' && '已屏蔽'}
                          {email.status === 'alerted' && '需警報'}
                          {email.status === 'pending' && '處理中...'}
                        </div>
                      )}
                      
                      <h3 className="email-subject">{email.subject}</h3>
                      <div className="email-meta">
                        <span className="sender">{email.sender}</span>
                        <span className="time">{email.received_time}</span>
                      </div>
                      
                      {/* Block 詞顯示 */}
                      {email.status === 'block' && email.triggeredBlockWords && email.triggeredBlockWords.length > 0 && (
                        <div className="email-block-info">
                          <strong>觸發的屏蔽詞：</strong>
                          <div className="block-words-list">
                            {email.triggeredBlockWords.map((word, wordIdx) => (
                              <span key={wordIdx} className="block-word-tag">{word}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Alert 原因顯示 */}
                      {email.status === 'alerted' && email.alertReason && (
                        <div className="email-alert-info">
                          <strong>警報原因：</strong>
                          <p className="alert-reason">{email.alertReason}</p>
                        </div>
                      )}
                      
                      <p className="email-preview">{email.body_preview}</p>
                    </div>
                  )
                })}
              </div>

              {/* 翻頁控制 */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="page-btn"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    上一頁
                  </button>

                  <span className="page-info">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    className="page-btn"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    下一頁
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App