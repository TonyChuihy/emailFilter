import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [emails, setEmails] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [sensitiveWords, setSensitiveWords] = useState({
    default: [],
    custom: [],
    all: [],
  });
  const [watchWords, setWatchWords] = useState([]);
  const [newSensitiveWord, setNewSensitiveWord] = useState("");
  const [sensitiveWordToRemove, setSensitiveWordToRemove] = useState("");
  const [newWatchWord, setNewWatchWord] = useState("");
  const [watchWordToRemove, setWatchWordToRemove] = useState("");
  const [activeTab, setActiveTab] = useState("emails");

  // Poll for email data
  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const response = await fetch(
          "http://localhost:3002/api/emails/latest?count=20"
        );
        if (response.ok) {
          const data = await response.json();
          setEmails(data.emails || []);
          setIsConnected(true);
          setLastUpdate(new Date().toLocaleTimeString());
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error("Failed to fetch emails:", error);
        setIsConnected(false);
      }
    };

    // Fetch immediately
    fetchEmails();

    // Set polling interval (every 2 seconds)
    const interval = setInterval(fetchEmails, 2000);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  // Fetch sensitive words list
  const fetchSensitiveWords = async () => {
    try {
      const response = await fetch("http://localhost:3002/api/sensitive_words");
      if (response.ok) {
        const data = await response.json();
        setSensitiveWords({
          default: data.default_words || [],
          custom: data.custom_words || [],
          all: data.all_words || [],
        });
      }
    } catch (error) {
      console.error("Failed to fetch sensitive words:", error);
    }
  };

  // Fetch watch words list
  const fetchWatchWords = async () => {
    try {
      const response = await fetch("http://localhost:3002/api/watch_words");
      if (response.ok) {
        const data = await response.json();
        setWatchWords(data.watch_words || []);
      }
    } catch (error) {
      console.error("Failed to fetch watch words:", error);
    }
  };

  // Fetch data on component load
  useEffect(() => {
    fetchSensitiveWords();
    fetchWatchWords();
  }, []);

  const clearEmails = async () => {
    try {
      const response = await fetch("http://localhost:3002/api/emails/clear", {
        method: "POST",
      });
      if (response.ok) {
        setEmails([]);
      }
    } catch (error) {
      console.error("Failed to clear emails:", error);
    }
  };

  const addSensitiveWord = async () => {
    if (!newSensitiveWord.trim()) {
      alert("Please enter a sensitive word");
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3002/api/sensitive_words",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ word: newSensitiveWord.trim() }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        setNewSensitiveWord("");
        await fetchSensitiveWords();
      } else {
        alert(`Failed to add: ${result.message}`);
      }
    } catch (error) {
      console.error("Failed to add sensitive word:", error);
      alert("Failed to add sensitive word");
    }
  };

  const removeSensitiveWord = async () => {
    if (!sensitiveWordToRemove.trim()) {
      alert("Please enter a sensitive word to remove");
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3002/api/sensitive_words",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ word: sensitiveWordToRemove.trim() }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        setSensitiveWordToRemove("");
        await fetchSensitiveWords();
      } else {
        alert(`Failed to remove: ${result.message}`);
      }
    } catch (error) {
      console.error("Failed to remove sensitive word:", error);
      alert("Failed to remove sensitive word");
    }
  };

  const resetSensitiveWords = async () => {
    if (
      window.confirm(
        "Are you sure you want to reset all custom sensitive words?"
      )
    ) {
      try {
        const response = await fetch(
          "http://localhost:3002/api/sensitive_words/reset",
          {
            method: "POST",
          }
        );

        if (response.ok) {
          await fetchSensitiveWords();
        }
      } catch (error) {
        console.error("Failed to reset sensitive words:", error);
        alert("Failed to reset sensitive words");
      }
    }
  };

  const addWatchWord = async () => {
    if (!newWatchWord.trim()) {
      alert("Please enter a watch word");
      return;
    }

    try {
      const response = await fetch("http://localhost:3002/api/watch_words", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word: newWatchWord.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setNewWatchWord("");
        await fetchWatchWords();
      } else {
        alert(`Failed to add: ${result.message}`);
      }
    } catch (error) {
      console.error("Failed to add watch word:", error);
      alert("Failed to add watch word");
    }
  };

  const removeWatchWord = async () => {
    if (!watchWordToRemove.trim()) {
      alert("Please enter a watch word to remove");
      return;
    }

    try {
      const response = await fetch("http://localhost:3002/api/watch_words", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word: watchWordToRemove.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setWatchWordToRemove("");
        await fetchWatchWords();
      } else {
        alert(`Failed to remove: ${result.message}`);
      }
    } catch (error) {
      console.error("Failed to remove watch word:", error);
      alert("Failed to remove watch word");
    }
  };

  const resetWatchWords = async () => {
    if (window.confirm("Are you sure you want to reset all watch words?")) {
      try {
        const response = await fetch(
          "http://localhost:3002/api/watch_words/reset",
          {
            method: "POST",
          }
        );

        if (response.ok) {
          await fetchWatchWords();
        }
      } catch (error) {
        console.error("Failed to reset watch words:", error);
        alert("Failed to reset watch words");
      }
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "Sensitive":
        return "#ff5252";
      case "Alert":
        return "#ff9800";
      case "Non-urgent":
        return "#4caf50";
      default:
        return "#757575";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "Sensitive":
        return "🔒";
      case "Alert":
        return "⚠️";
      case "Non-urgent":
        return "📧";
      default:
        return "📄";
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">Email Monitoring System</h1>
          <div className="connection-status">
            <span
              className={`status-indicator ${
                isConnected ? "connected" : "disconnected"
              }`}
            >
              {isConnected ? "●" : "○"}
            </span>
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
            {lastUpdate && (
              <span className="last-update">Last update: {lastUpdate}</span>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === "emails" ? "active" : ""}`}
            onClick={() => setActiveTab("emails")}
          >
            Email Monitor
          </button>
          <button
            className={`tab-button ${
              activeTab === "sensitive" ? "active" : ""
            }`}
            onClick={() => setActiveTab("sensitive")}
          >
            Sensitive Words
          </button>
          <button
            className={`tab-button ${activeTab === "watch" ? "active" : ""}`}
            onClick={() => setActiveTab("watch")}
          >
            Watch Words
          </button>
        </div>

        {/* Email Monitor Tab */}
        {activeTab === "emails" && (
          <div className="emails-tab">
            <div className="section-header">
              <h2>Email Monitor</h2>
              <button onClick={clearEmails} className="clear-button">
                Clear History
              </button>
            </div>

            {emails.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>No email records</p>
                <p className="empty-subtitle">New emails will appear here</p>
              </div>
            ) : (
              <div className="emails-grid">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    className="email-card"
                    style={{
                      borderLeft: `4px solid ${getTypeColor(email.type)}`,
                    }}
                  >
                    <div className="email-header">
                      <div
                        className="email-type-badge"
                        style={{ backgroundColor: getTypeColor(email.type) }}
                      >
                        {getTypeIcon(email.type)} {email.type}
                      </div>
                      <span className="email-time">{email.timestamp}</span>
                    </div>
                    <h3 className="email-title">{email.title}</h3>
                    <div className="email-reason">{email.reason}</div>
                    {email.matched_watch_words &&
                      email.matched_watch_words.length > 0 && (
                        <div className="watch-words-indicator">
                          <strong>Watch words matched:</strong>{" "}
                          {email.matched_watch_words.join(", ")}
                        </div>
                      )}
                    {email.body_preview && (
                      <div className="email-preview">{email.body_preview}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sensitive Words Tab */}
        {activeTab === "sensitive" && (
          <div className="settings-tab">
            <div className="section-header">
              <h2>Sensitive Words Management</h2>
              <button
                onClick={resetSensitiveWords}
                className="secondary-button"
              >
                Reset Custom Words
              </button>
            </div>

            <div className="words-section">
              <div className="words-display">
                <div className="words-category">
                  <h3>Default Sensitive Words</h3>
                  <div className="words-list">
                    {sensitiveWords.default.map((word, index) => (
                      <span key={index} className="word-tag default">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="words-category">
                  <h3>Custom Sensitive Words</h3>
                  <div className="words-list">
                    {sensitiveWords.custom.length > 0 ? (
                      sensitiveWords.custom.map((word, index) => (
                        <span key={index} className="word-tag custom">
                          {word}
                        </span>
                      ))
                    ) : (
                      <p className="no-words">No custom sensitive words</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="words-controls">
                <div className="control-group">
                  <h3>Add Sensitive Word</h3>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={newSensitiveWord}
                      onChange={(e) => setNewSensitiveWord(e.target.value)}
                      placeholder="Enter new sensitive word"
                      className="text-input"
                    />
                    <button
                      onClick={addSensitiveWord}
                      className="primary-button"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Remove Sensitive Word</h3>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={sensitiveWordToRemove}
                      onChange={(e) => setSensitiveWordToRemove(e.target.value)}
                      placeholder="Enter word to remove"
                      className="text-input"
                    />
                    <button
                      onClick={removeSensitiveWord}
                      className="secondary-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Watch Words Tab */}
        {activeTab === "watch" && (
          <div className="settings-tab">
            <div className="section-header">
              <h2>Watch Words Management</h2>
              <button onClick={resetWatchWords} className="secondary-button">
                Reset All Words
              </button>
            </div>

            <div className="words-section">
              <div className="words-display">
                <div className="words-category">
                  <h3>Current Watch Words</h3>
                  <div className="words-list">
                    {watchWords.length > 0 ? (
                      watchWords.map((word, index) => (
                        <span key={index} className="word-tag watch">
                          {word}
                        </span>
                      ))
                    ) : (
                      <p className="no-words">No watch words set</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="words-controls">
                <div className="control-group">
                  <h3>Add Watch Word</h3>
                  <p className="control-description">
                    Watch words will be included in AI analysis context
                  </p>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={newWatchWord}
                      onChange={(e) => setNewWatchWord(e.target.value)}
                      placeholder="Enter new watch word"
                      className="text-input"
                    />
                    <button onClick={addWatchWord} className="primary-button">
                      Add
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <h3>Remove Watch Word</h3>
                  <div className="input-with-button">
                    <input
                      type="text"
                      value={watchWordToRemove}
                      onChange={(e) => setWatchWordToRemove(e.target.value)}
                      placeholder="Enter word to remove"
                      className="text-input"
                    />
                    <button
                      onClick={removeWatchWord}
                      className="secondary-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>CTDL 1092: Group 15 - Email Monitoring System</p>
      </footer>
    </div>
  );
}

export default App;
