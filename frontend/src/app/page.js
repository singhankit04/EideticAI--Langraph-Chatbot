"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  Plus,
  Paperclip,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  BarChart3,
  X,
  Check,
  Copy,
  ArrowUp,
  Bot,
} from "lucide-react";

const DEMO_PLACEHOLDERS = [
  "Ask anything about your business or documents...",
  "Can you summarize our latest customer contract?",
  "What were the key revenue milestones from last quarter?",
  "Find all policies mentioning employee leaves & renewals...",
];

const PROMPT_CHIPS_ROW1 = [
  {
    icon: FileText,
    label: "Summarize this contract",
    query: "Can you provide a concise summary of the uploaded document, outlining key terms, obligations, and deadlines?",
  },
  {
    icon: Search,
    label: 'Find every customer mentioning "renewal"',
    query: 'Find every interaction, note, or clause mentioning renewal terms, timelines, or negotiations.',
  },
];

const PROMPT_CHIPS_ROW2 = [
  {
    icon: Globe,
    label: "Explain our onboarding process",
    query: "Explain the standard onboarding process, step-by-step checklist, and required documentation.",
  },
  {
    icon: BarChart3,
    label: "Show last month's sales insights",
    query: "Show key performance indicators, revenue milestones, and top insights from recent reports.",
  },
];

// Helper to format text with subtle bolding and bullet hierarchy
function formatMessageContent(content) {
  if (!content) return null;

  // Split into lines
  const lines = content.split("\n");

  return lines.map((line, lineIdx) => {
    // If line has **text**, split and render bold tags cleanly
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    const formattedParts = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={partIdx} className="font-semibold text-emerald-300">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    return (
      <span key={lineIdx} className="block min-h-[1.25em]">
        {formattedParts}
      </span>
    );
  });
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [chatId, setChatId] = useState("");
  const [placeholderText, setPlaceholderText] = useState("");
  const [isTypingActive, setIsTypingActive] = useState(true);
  const [agentStatus, setAgentStatus] = useState("");

  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const chatScrollContainerRef = useRef(null);

  const hasStarted = messages.length > 0 || isLoading;

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, []);

  // Typewriter effect for placeholder
  useEffect(() => {
    if (query || !isTypingActive || hasStarted) return;

    let messageIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId;

    const typeLoop = () => {
      const current = DEMO_PLACEHOLDERS[messageIndex];

      if (!isDeleting) {
        charIndex++;
        setPlaceholderText(current.slice(0, charIndex));
        if (charIndex === current.length) {
          isDeleting = true;
          timeoutId = setTimeout(typeLoop, 2200);
          return;
        }
        timeoutId = setTimeout(typeLoop, 45);
      } else {
        charIndex--;
        setPlaceholderText(current.slice(0, charIndex));
        if (charIndex === 0) {
          isDeleting = false;
          messageIndex = (messageIndex + 1) % DEMO_PLACEHOLDERS.length;
          timeoutId = setTimeout(typeLoop, 450);
          return;
        }
        timeoutId = setTimeout(typeLoop, 22);
      }
    };

    timeoutId = setTimeout(typeLoop, 400);
    return () => clearTimeout(timeoutId);
  }, [isTypingActive, query, hasStarted]);

  // Auto-scroll chat container
  useEffect(() => {
    if (chatScrollContainerRef.current && hasStarted) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading, hasStarted]);

  const startNewChat = () => {
    setChatId(crypto.randomUUID());
    setQuery("");
    setMessages([]);
    setIsLoading(false);
    setSelectedFile(null);
    setUploadStatus(null);
    setUploadMessage("");
    setIsTypingActive(true);
    setPlaceholderText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // Submit chat query to backend
  const handleSearch = async (overrideQuery) => {
    const textToSearch = (overrideQuery || query).trim();
    if (!textToSearch || isLoading) return;

    const activeChatId = chatId || crypto.randomUUID();
    if (!chatId) setChatId(activeChatId);

    setIsTypingActive(false);

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSearch,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachedFile: selectedFile ? { name: selectedFile.name, size: selectedFile.size } : null,
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsLoading(true);

    setSelectedFile(null);
    setUploadStatus(null);
    setUploadMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    const assistantMsgId = crypto.randomUUID();
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Initialize assistant message container
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        sources: [],
        timestamp,
      },
    ]);

    setAgentStatus("Thinking...");

    try {
      const res = await fetch(`/api/chat/${activeChatId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ question: textToSearch, message: textToSearch }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Streaming is not supported by your browser or server connection.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEvent = "";
            continue;
          }

          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.replace(/^event:\s*/, "");
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const dataStr = trimmed.replace(/^data:\s*/, "");
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);

              // 1. Status event: update thinking state indicator
              if (currentEvent === "status" || parsed.message) {
                setAgentStatus(parsed.message || "Working...");
              }

              // 2. Token event: append streaming word directly
              if (currentEvent === "token" || parsed.token) {
                const token = parsed.token || "";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: (m.content || "") + token } : m
                  )
                );
              }

              // 3. Citations & sources event
              if (currentEvent === "sources" || parsed.sources) {
                const sources = parsed.sources || [];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, sources } : m
                  )
                );
              }

              // 4. Error event sent over stream
              if (currentEvent === "error" || parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (parseErr) {
              if (parseErr.message !== "Unexpected end of JSON input") {
                console.warn("SSE parse error:", parseErr);
              }
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: m.content
                  ? m.content + `\n\n[Notice: ${err.message}]`
                  : `Notice: ${err.message}. You can ask general questions or attach a PDF document using "+ Attach Documents".`,
                isError: true,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setAgentStatus("");
    }
  };

  // Upload PDF to backend
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setUploadStatus("error");
      setUploadMessage("Please select a valid PDF file.");
      return;
    }

    const activeChatId = chatId || crypto.randomUUID();
    if (!chatId) setChatId(activeChatId);

    setSelectedFile(file);
    setUploadStatus("uploading");
    setUploadMessage(`Ingesting "${file.name}"...`);

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch(`/api/chat/${activeChatId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process PDF.");

      setUploadStatus("success");
      setUploadMessage(`Successfully queued "${file.name}" for vector indexing.`);
    } catch (err) {
      setUploadStatus("error");
      setUploadMessage(err.message || "Upload failed.");
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadStatus(null);
    setUploadMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPlaceholderText = () => {
    if (hasStarted) return "Ask a follow-up question or search...";
    if (isTypingActive) return placeholderText;
    return "Ask anything about your business or documents...";
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden relative flex flex-col font-sans selection:bg-[#38624a] selection:text-white bg-[#13271d]">
      <main className="w-full h-full min-h-0 hero-card p-3.5 sm:p-7 md:p-8 relative overflow-hidden flex flex-col justify-between z-10 shadow-none border-0 rounded-none">
        <div className="radar-ring w-[380px] h-[380px] sm:w-[480px] sm:h-[480px]" />
        <div className="radar-ring w-[660px] h-[660px] sm:w-[800px] sm:h-[800px]" />
        <div className="radar-ring w-[980px] h-[980px] sm:w-[1140px] sm:h-[1140px]" />
        <div className="radar-ring w-[1300px] h-[1300px] sm:w-[1500px] sm:h-[1500px]" />

        {/* Navigation Bar */}
        <nav className="relative z-20 w-full max-w-3xl mx-auto flex items-center justify-between pb-2.5 sm:pb-4 shrink-0 px-1 sm:px-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5 shrink-0 text-[#eaf4ee]">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2a10 10 0 0 0-10 10c0 5.52 4.48 10 10 10s10-4.48 10-10A10 10 0 0 0 12 2z" strokeOpacity="0.3" />
                <path d="M12 5v14M5 12h14" strokeOpacity="0.5" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">EideticAI</span>
          </div>

          <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[9px] font-mono tracking-wider text-[#bad4c4]/60 uppercase select-none">
            POWERED BY LANGGRAPH
          </div>

          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 text-xs sm:text-sm bg-white/10 hover:bg-white/20 active:scale-95 text-[#eaf4ee] font-medium px-4 py-2 rounded-full border border-white/20 transition shadow-sm cursor-pointer"
            title="Start a new chat session"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>New Chat</span>
          </button>
        </nav>

        {/* Chat / Hero Area */}
        <div className={`relative z-20 flex-1 flex flex-col min-h-0 pt-1 pb-1 overflow-hidden transition-all duration-500 ${!hasStarted ? "justify-center" : "justify-between"}`}>
          {/* Header (visible on initial empty state) */}
          <div className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden text-center shrink-0 ${!hasStarted ? "opacity-100 max-h-[240px] sm:max-h-[280px] mb-6 sm:mb-8 md:mb-10 transform translate-y-0" : "opacity-0 max-h-0 mb-0 -translate-y-4 pointer-events-none"}`}>
            <div className="max-w-3xl mx-auto px-4">
              <h1 className="text-2xl sm:text-5xl lg:text-[56px] font-semibold text-white tracking-[-0.03em] leading-[1.18] sm:leading-[1.12]">
                <span className="block">Curiosity has no boundaries.</span>
              </h1>
              <p className="mt-3 sm:mt-4 text-sm sm:text-base text-[#bad4c4]/80 font-normal tracking-normal max-w-xl mx-auto">
                From everyday questions to your deepest curiosities.
              </p>
            </div>
          </div>

          {/* Messages Container */}
          <div
            ref={chatScrollContainerRef}
            className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col min-h-0 ${
              hasStarted ? "flex-1 min-h-0 opacity-100 mb-3 overflow-y-auto" : "h-0 max-h-0 opacity-0 overflow-hidden pointer-events-none"
            }`}
          >
            <div className="w-full max-w-3xl mx-auto px-1 sm:px-3 space-y-4 pr-2 pb-2">
              {messages.map((msg) => (
                <div key={msg.id} className="animate-slide-down">
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[78%] bg-white/12 border border-white/20 rounded-2xl rounded-tr-xs p-3.5 sm:p-4 text-white shadow-md backdrop-blur-md">
                        {msg.attachedFile && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-300 mb-2 pb-1.5 border-b border-white/10">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{msg.attachedFile.name}</span>
                          </div>
                        )}
                        <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] sm:max-w-[85%] bg-[#12241b]/95 border border-white/12 rounded-2xl rounded-tl-xs p-4 sm:p-5 text-white shadow-xl backdrop-blur-md">
                        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.08]">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
                              <Bot className="w-3 h-3" />
                            </div>
                            <span className="text-xs font-mono tracking-wide text-[#9fc2ab] font-medium">EideticAI</span>
                          </div>
                          <div>
                            {msg.content && (
                              <button
                                onClick={() => copyToClipboard(msg.content, msg.id)}
                                className="text-xs text-[#bad4c4]/70 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 transition cursor-pointer"
                                title="Copy answer"
                              >
                                {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span className="text-[10px]">{copiedId === msg.id ? "Copied" : "Copy"}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Content or Inline Loading indicator inside the single bubble */}
                        {!msg.content && isLoading && (
                          <div className="flex items-center gap-2.5 text-[#b7d6c3] text-xs sm:text-sm py-1">
                            <Loader2 className="w-4 h-4 animate-spin text-[#4ade80]" />
                            <span className="font-medium animate-pulse">{agentStatus || "Thinking..."}</span>
                          </div>
                        )}

                        {msg.content && (
                          <div className={`text-xs sm:text-sm leading-relaxed ${msg.isError ? "text-amber-200" : "text-[#eaf4ee]"}`}>
                            {msg.isError ? msg.content : formatMessageContent(msg.content)}
                          </div>
                        )}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex flex-wrap gap-1.5">
                            {msg.sources.map((src, idx) => (
                              <div key={idx} className="text-[11px] bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-[#d6e8dc] flex items-center gap-1.5 hover:bg-white/10 transition">
                                <FileText className="w-3 h-3 text-[#4ade80]" />
                                <span className="font-medium">{src.source || "document.pdf"}</span>
                                {src.page && <span className="opacity-60 text-[10px]">• p.{src.page}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Search Input Island */}
          <div className="w-full max-w-2xl sm:max-w-3xl mx-auto shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] pb-0 sm:pb-1">
            <div className="bg-white rounded-[20px] sm:rounded-[26px] p-2.5 sm:p-3 shadow-2xl shadow-black/40 border border-white/30 transition-all focus-within:ring-2 focus-within:ring-[#4e9471]/40">
              <div className="relative">
                <textarea
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (isTypingActive) setIsTypingActive(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  rows={1}
                  placeholder={getPlaceholderText()}
                  className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm sm:text-base text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-0 leading-normal max-h-24 sm:max-h-36 overflow-y-auto"
                />
              </div>

              {selectedFile && (
                <div className="my-1.5 flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2 truncate text-neutral-700">
                    <FileText className="w-3.5 h-3.5 text-[#3b7457] shrink-0" />
                    <span className="truncate font-medium">{selectedFile.name}</span>
                    <span className="text-neutral-400 text-[11px]">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadStatus === "uploading" && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Loader2 className="w-3 h-3 animate-spin" /> Ingesting...
                      </span>
                    )}
                    {uploadStatus === "success" && (
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Indexed
                      </span>
                    )}
                    {uploadStatus === "error" && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" /> Error
                      </span>
                    )}
                    <button onClick={clearFile} className="text-neutral-400 hover:text-neutral-600 p-0.5 rounded cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 mt-0.5">
                <div>
                  <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-medium px-3 sm:px-3.5 py-1.5 rounded-full border border-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Paperclip className="w-3 h-3 text-neutral-500" />
                    <span>+ Attach Documents</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isLoading || !query.trim()}
                  onClick={() => handleSearch()}
                  className="bg-[#38624a] hover:bg-[#2e523e] disabled:opacity-40 disabled:hover:bg-[#38624a] text-white p-2 sm:p-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center"
                  title="Send message"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Prompt Chips */}
            <div
              className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
                !hasStarted ? "opacity-100 max-h-[260px] sm:max-h-[180px] mt-2 sm:mt-4 transform translate-y-0" : "opacity-0 max-h-0 mt-0 pointer-events-none translate-y-4"
              }`}
            >
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PROMPT_CHIPS_ROW1.map((chip, idx) => {
                    const IconComponent = chip.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSearch(chip.query)}
                        className="bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-[#d8eae0] text-xs px-3.5 py-2 rounded-full flex items-center gap-2 backdrop-blur-xs transition text-left cursor-pointer truncate active:scale-[0.98]"
                      >
                        <IconComponent className="w-3 h-3 opacity-75 shrink-0" />
                        <span className="truncate">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PROMPT_CHIPS_ROW2.map((chip, idx) => {
                    const IconComponent = chip.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSearch(chip.query)}
                        className="bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-[#d8eae0] text-xs px-3.5 py-2 rounded-full flex items-center gap-2 backdrop-blur-xs transition text-left cursor-pointer truncate active:scale-[0.98]"
                      >
                        <IconComponent className="w-3 h-3 opacity-75 shrink-0" />
                        <span className="truncate">{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
