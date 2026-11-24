"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
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
  LogIn,
  LogOut,
  UserPlus,
  User,
  type LucideIcon,
} from "lucide-react";

interface SourceItem {
  source?: string;
  page?: number | string;
}

interface AttachedFile {
  name: string;
  size: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachedFile?: AttachedFile | null;
  sources?: SourceItem[];
  isError?: boolean;
}

interface PromptChip {
  icon: LucideIcon;
  label: string;
  query: string;
}

const DEMO_PLACEHOLDERS: string[] = [
  "Ask anything about your business or documents...",
  "Can you summarize our latest customer contract?",
  "What were the key revenue milestones from last quarter?",
  "Find all policies mentioning employee leaves & renewals...",
];

const PROMPT_CHIPS_ROW1: PromptChip[] = [
  {
    icon: FileText,
    label: "Summarize this contract",
    query:
      "Can you provide a concise summary of the uploaded document, outlining key terms, obligations, and deadlines?",
  },
  {
    icon: Search,
    label: 'Find every customer mentioning "renewal"',
    query:
      "Find every interaction, note, or clause mentioning renewal terms, timelines, or negotiations.",
  },
];

const PROMPT_CHIPS_ROW2: PromptChip[] = [
  {
    icon: Globe,
    label: "Explain our onboarding process",
    query:
      "Explain the standard onboarding process, step-by-step checklist, and required documentation.",
  },
  {
    icon: BarChart3,
    label: "Show last month's sales insights",
    query:
      "Show key performance indicators, revenue milestones, and top insights from recent reports.",
  },
];

// Helper to format text with subtle bolding and bullet hierarchy
function formatMessageContent(content: string) {
  if (!content) return null;

  const lines = content.split("\n");

  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    const formattedParts = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={partIdx} className="font-semibold text-white">
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
  const [query, setQuery] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "uploading" | "success" | "error" | null
  >(null);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string>("");
  const [placeholderText, setPlaceholderText] = useState<string>(
    "Ask anything about your business or documents..."
  );
  const [isTypingActive, setIsTypingActive] = useState<boolean>(true);
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isNavUserMenuOpen, setIsNavUserMenuOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  const { token, authFetch, isAuthenticated, user, logout } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const navUserMenuRef = useRef<HTMLDivElement>(null);

  const hasStarted = messages.length > 0 || isLoading;

  const userInitials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  useEffect(() => {
    setMounted(true);
    window.scrollTo(0, 0);
  }, []);

  // Close nav user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        navUserMenuRef.current &&
        !navUserMenuRef.current.contains(e.target as Node)
      ) {
        setIsNavUserMenuOpen(false);
      }
    };
    if (isNavUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNavUserMenuOpen]);

  // Auto-focus search input and begin typing upon any key stroke on the main page
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if modifier keys (Ctrl, Cmd, Alt) are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;

      // Don't intercept if user is currently typing in an input, textarea, select, or editable element
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Don't intercept button activations with Space or Enter
      if (target?.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) {
        return;
      }

      // Handle Backspace if not already in input but query has characters
      if (e.key === "Backspace") {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          setQuery((prev) => prev.slice(0, -1));
          setIsTypingActive(false);
        }
        return;
      }

      // Printable single character keystrokes (alphanumeric, symbols, space)
      if (e.key.length === 1) {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          setQuery((prev) => prev + e.key);
          setIsTypingActive(false);

          requestAnimationFrame(() => {
            if (searchInputRef.current) {
              const len = searchInputRef.current.value.length;
              searchInputRef.current.setSelectionRange(len, len);
            }
          });
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  // Typewriter effect for placeholder
  useEffect(() => {
    if (query || !isTypingActive || hasStarted) return;

    let messageIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId: NodeJS.Timeout;

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
    setPlaceholderText("Ask anything about your business or documents...");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  // Load conversation messages when selecting a chat from the sidebar
  const handleSelectChat = async (selectedChatId: string) => {
    if (selectedChatId === chatId && messages.length > 0) return;

    setChatId(selectedChatId);
    setQuery("");
    setIsLoading(true);
    setAgentStatus("Loading conversation...");

    try {
      const res = await authFetch(`/api/chats/${selectedChatId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m._id || crypto.randomUUID(),
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          timestamp: m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "",
          sources: m.sources || [],
        }));
        setMessages(loadedMessages);
      } else {
        const histRes = await authFetch(`/api/chat/${selectedChatId}/history`);
        if (histRes.ok) {
          const histData = await histRes.json();
          const loaded: ChatMessage[] = (histData.messages || []).map((m: any) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role === "ai" || m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            timestamp: "",
            sources: [],
          }));
          setMessages(loaded);
        }
      }
    } catch (err) {
      console.warn("[Chat] Failed to load messages:", err);
    } finally {
      setIsLoading(false);
      setAgentStatus("");
    }
  };

  // Submit chat query to backend
  const handleSearch = async (overrideQuery?: string) => {
    const textToSearch = (overrideQuery || query).trim();
    if (!textToSearch || isLoading) return;

    const activeChatId = chatId || crypto.randomUUID();
    if (!chatId) setChatId(activeChatId);

    setIsTypingActive(false);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSearch,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      attachedFile: selectedFile
        ? { name: selectedFile.name, size: selectedFile.size }
        : null,
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsLoading(true);

    setSelectedFile(null);
    setUploadStatus(null);
    setUploadMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    const assistantMsgId = crypto.randomUUID();
    const timestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/chat/${activeChatId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question: textToSearch, message: textToSearch }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error || `Server responded with status ${res.status}`
        );
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error(
          "Streaming is not supported by your browser or server connection."
        );
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
                    m.id === assistantMsgId
                      ? { ...m, content: (m.content || "") + token }
                      : m
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
            } catch (parseErr: unknown) {
              if (
                parseErr instanceof Error &&
                parseErr.message !== "Unexpected end of JSON input"
              ) {
                console.warn("SSE parse error:", parseErr);
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "An unknown error occurred";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: m.content
                  ? m.content + `\n\n[Notice: ${errMsg}]`
                  : `Notice: ${errMsg}. You can ask general questions or attach a PDF document using "+ Attach Documents".`,
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
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/chat/${activeChatId}/upload`, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process PDF.");

      setUploadStatus("success");
      setUploadMessage(
        `Successfully queued "${file.name}" for vector indexing.`
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Upload failed.";
      setUploadStatus("error");
      setUploadMessage(errMsg);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadStatus(null);
    setUploadMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyToClipboard = (text: string, id: string) => {
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
    <div className="h-[100dvh] w-full overflow-hidden relative flex flex-row font-sans selection:bg-white/20 selection:text-white bg-[#000000]">
      {/* Background Concentric Radar Rings across entire screen passing behind the translucent glass sidebar */}
      <div className="radar-ring w-[380px] h-[380px] sm:w-[480px] sm:h-[480px] z-0" />
      <div className="radar-ring w-[660px] h-[660px] sm:w-[800px] sm:h-[800px] z-0" />
      <div className="radar-ring w-[980px] h-[980px] sm:w-[1140px] sm:h-[1140px] z-0" />
      <div className="radar-ring w-[1300px] h-[1300px] sm:w-[1500px] sm:h-[1500px] z-0" />

      {/* Floating Glassmorphic Sidebar Component */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onClose={() => setIsSidebarOpen(false)}
        activeChatId={chatId}
        onSelectChat={handleSelectChat}
        onNewChat={startNewChat}
      />

      <main className="flex-1 min-w-0 w-full h-full min-h-0 p-3.5 sm:p-6 md:p-8 relative overflow-hidden flex flex-col justify-between z-10 shadow-none border-0 rounded-none bg-transparent transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {/* Top Header Bar */}
        <header className="relative z-20 w-full max-w-5xl mx-auto flex items-center justify-end pb-2 sm:pb-3 shrink-0 px-2 sm:px-4">
          {/* Right: Signup/Login Button Container */}
          <div className="flex items-center justify-end">
            {!mounted || !isAuthenticated ? (
              <div className="flex items-center p-0.5 rounded-full bg-white/[0.06] border border-white/15 backdrop-blur-md shadow-xs">
                <Link
                  href="/signin"
                  className="px-3 py-1.5 text-xs sm:text-[13px] text-neutral-300 hover:text-white font-medium rounded-full hover:bg-white/10 transition-all whitespace-nowrap cursor-pointer"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-[13px] text-black font-semibold bg-white hover:bg-neutral-200 active:scale-95 rounded-full transition-all whitespace-nowrap shadow-xs cursor-pointer"
                >
                  <UserPlus size={13} className="shrink-0" />
                  <span>Sign up</span>
                </Link>
              </div>
            ) : (
              <div className="relative" ref={navUserMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsNavUserMenuOpen(!isNavUserMenuOpen)}
                  className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 backdrop-blur-md transition-all cursor-pointer text-white shadow-xs"
                  title={user?.fullName || user?.email || "Account"}
                >
                  <div className="w-6 h-6 rounded-full bg-white/20 border border-white/25 flex items-center justify-center text-[10px] font-semibold text-white">
                    {userInitials}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">
                    {user?.fullName?.split(" ")[0] || "Account"}
                  </span>
                </button>
                {isNavUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 p-2 rounded-2xl bg-[#0e0e12]/95 border border-white/15 backdrop-blur-2xl shadow-2xl space-y-1 z-50">
                    <div className="px-2.5 py-1.5 text-xs text-neutral-400 border-b border-white/[0.08] pb-2 mb-1">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Signed in as</span>
                      <strong className="text-white block truncate">{user?.email}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setIsNavUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Chat / Hero Area */}
        <div
          className={`relative z-20 flex-1 flex flex-col min-h-0 pt-1 pb-1 overflow-hidden transition-all duration-500 ${
            !hasStarted ? "justify-center" : "justify-between"
          }`}
        >
          {/* Header (visible on initial empty state) */}
          <div
            className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden text-center shrink-0 ${
              !hasStarted
                ? "opacity-100 max-h-[240px] sm:max-h-[280px] mb-6 sm:mb-8 md:mb-10 transform translate-y-0"
                : "opacity-0 max-h-0 mb-0 -translate-y-4 pointer-events-none"
            }`}
          >
            <div className="max-w-3xl mx-auto px-4">
              <h1 className="text-2xl sm:text-5xl lg:text-[56px] font-semibold text-white tracking-[-0.03em] leading-[1.18] sm:leading-[1.12]">
                <span className="block">Curiosity has no boundaries.</span>
              </h1>
              <p className="mt-3 sm:mt-4 text-sm sm:text-base text-neutral-400 font-normal tracking-normal max-w-xl mx-auto">
                From everyday questions to your deepest curiosities.
              </p>
            </div>
          </div>

          {/* Messages Container */}
          <div
            ref={chatScrollContainerRef}
            className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col min-h-0 ${
              hasStarted
                ? "flex-1 min-h-0 opacity-100 mb-3 overflow-y-auto"
                : "h-0 max-h-0 opacity-0 overflow-hidden pointer-events-none"
            }`}
          >
            <div className="w-full max-w-3xl mx-auto px-1 sm:px-3 space-y-4 pr-2 pb-2">
              {messages.map((msg) => (
                <div key={msg.id} className="animate-slide-down">
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[78%] bg-white/10 border border-white/15 rounded-2xl p-3.5 sm:p-4 text-white shadow-md backdrop-blur-md">
                        {/* User Query Text */}
                        <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap break-words text-white">
                          {msg.content}
                        </p>

                        {/* Attached PDF displayed BELOW query */}
                        {msg.attachedFile && (
                          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-2 text-xs text-neutral-300 bg-white/[0.05] px-2.5 py-1.5 rounded-xl border border-white/10">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-300" />
                            <span className="truncate font-medium">
                              {msg.attachedFile.name}
                            </span>
                            <span className="opacity-50 text-[10px]">
                              ({(msg.attachedFile.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Seamless non-boxy AI Assistant Response */
                    <div className="flex justify-start w-full">
                      <div className="w-full max-w-3xl py-2 px-1 text-white">
                        {/* Inline Loading indicator */}
                        {!msg.content && isLoading && (
                          <div className="flex items-center gap-2.5 text-neutral-400 text-xs sm:text-sm py-1">
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span className="font-medium animate-pulse text-neutral-300">
                              {agentStatus || "Thinking..."}
                            </span>
                          </div>
                        )}

                        {/* Response Text Content */}
                        {msg.content && (
                          <div
                            className={`text-xs sm:text-sm md:text-[14.5px] leading-relaxed space-y-2.5 text-neutral-200 ${
                              msg.isError ? "text-amber-200" : ""
                            }`}
                          >
                            {msg.isError
                              ? msg.content
                              : formatMessageContent(msg.content)}
                          </div>
                        )}

                        {/* Source Citations */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3.5 pt-2.5 flex flex-wrap gap-1.5 border-t border-white/[0.08]">
                            {msg.sources.map((src, idx) => (
                              <div
                                key={idx}
                                className="text-[11px] bg-white/[0.05] border border-white/10 px-2.5 py-1 rounded-lg text-neutral-300 flex items-center gap-1.5 hover:bg-white/[0.09] transition"
                              >
                                <FileText className="w-3 h-3 text-neutral-400" />
                                <span className="font-medium">
                                  {src.source || "document.pdf"}
                                </span>
                                {src.page && (
                                  <span className="opacity-50 text-[10px]">
                                    • p.{src.page}
                                  </span>
                                )}
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
            <div className="bg-white rounded-[20px] sm:rounded-[26px] p-2.5 sm:p-3 shadow-2xl shadow-black/40 border border-white/30 transition-all focus-within:ring-2 focus-within:ring-white/20">
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
                    <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate font-medium">
                      {selectedFile.name}
                    </span>
                    <span className="text-neutral-400 text-[11px]">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadStatus === "uploading" && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Loader2 className="w-3 h-3 animate-spin" /> Ingesting...
                      </span>
                    )}
                    {uploadStatus === "success" && (
                      <span className="flex items-center gap-1 text-neutral-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-800" /> Indexed
                      </span>
                    )}
                    {uploadStatus === "error" && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" /> Error
                      </span>
                    )}
                    <button
                      onClick={clearFile}
                      className="text-neutral-400 hover:text-neutral-600 p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 mt-0.5">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
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
                  className="bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-30 disabled:hover:bg-white/10 text-white p-2 sm:p-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center"
                  title="Send message"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Prompt Chips */}
            <div
              className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
                !hasStarted
                  ? "opacity-100 max-h-[260px] sm:max-h-[180px] mt-2 sm:mt-4 transform translate-y-0"
                  : "opacity-0 max-h-0 mt-0 pointer-events-none translate-y-4"
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
                        className="bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-neutral-300 text-xs px-3.5 py-2 rounded-full flex items-center gap-2 backdrop-blur-xs transition text-left cursor-pointer truncate active:scale-[0.98]"
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
                        className="bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-neutral-300 text-xs px-3.5 py-2 rounded-full flex items-center gap-2 backdrop-blur-xs transition text-left cursor-pointer truncate active:scale-[0.98]"
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
