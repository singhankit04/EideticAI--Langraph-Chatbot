"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Home,
  MessageSquare,
  Plus,
  Inbox,
  Search,
  ChevronDown,
  LogOut,
  Trash2,
  User as UserIcon,
  LogIn,
  UserPlus,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export interface ChatSession {
  _id?: string;
  chatId: string;
  title: string;
  isPinned?: boolean;
  lastMessageAt?: string;
  updatedAt?: string;
}

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  activeId?: string;
  onSelect?: (id: string) => void;
  activeChatId?: string;
  onSelectChat?: (chatId: string) => void;
  onNewChat?: () => void;
}

export default function Sidebar({
  isOpen = true,
  onToggle,
  onClose,
  activeId: controlledActiveId,
  onSelect,
  activeChatId,
  onSelectChat,
  onNewChat,
}: SidebarProps) {
  const { user, isAuthenticated, logout, authFetch } = useAuth();

  const [internalActiveId, setInternalActiveId] = useState("home");
  const [isChatsOpen, setIsChatsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeId = controlledActiveId ?? internalActiveId;

  // Fetch real chat conversations for authenticated user
  const fetchUserChats = useCallback(async () => {
    if (!isAuthenticated) {
      setChats([]);
      return;
    }

    try {
      setIsLoadingChats(true);
      const res = await authFetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats || []);
      }
    } catch (err) {
      console.warn("[Sidebar] Could not fetch chats:", err);
    } finally {
      setIsLoadingChats(false);
    }
  }, [isAuthenticated, authFetch]);

  useEffect(() => {
    fetchUserChats();
  }, [fetchUserChats, activeChatId]);

  const handleSelect = (id: string) => {
    setInternalActiveId(id);
    onSelect?.(id);
  };

  const handleToggle = () => {
    if (onToggle) onToggle();
    else if (onClose) onClose();
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatIdToDelete: string) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/chats/${chatIdToDelete}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setChats((prev) => prev.filter((c) => c.chatId !== chatIdToDelete));
        if (activeChatId === chatIdToDelete && onNewChat) {
          onNewChat();
        }
      }
    } catch (err) {
      console.error("[Sidebar] Delete chat error:", err);
    }
  };

  // Filter conversations by search input
  const filteredChats = chats.filter((c) =>
    (c.title || "New Conversation").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute user initials (e.g. "Ankit Kumar" -> "AK")
  const userInitials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "GU";

  return (
    <>
      {/* Mobile/Tablet Backdrop when opened as overlay */}
      {isOpen && (
        <div
          onClick={onClose || onToggle}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Responsive Container: Collapses to sleek icon rail on desktop */}
      <div
        className={`z-50 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? "md:w-[285px]" : "md:w-[78px]"
        }`}
      >
        <aside
          className={`flex flex-col rounded-[24px] text-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] backdrop-blur-xl selection:bg-white/20 select-none overflow-hidden
            fixed inset-y-3.5 left-3.5 max-w-[calc(100vw-2rem)]
            md:static md:inset-auto md:my-3.5 md:ml-3.5 md:h-[calc(100vh-1.75rem)]
            ${
              isOpen
                ? "w-[275px] p-3 translate-x-0 opacity-100 pointer-events-auto"
                : "w-[275px] md:w-[66px] p-2 -translate-x-[120%] md:translate-x-0 opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto"
            }
          `}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            backgroundImage:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%)",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow:
              "0 20px 48px -10px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.18), inset 0 0 16px rgba(255, 255, 255, 0.02)",
          }}
        >
          {/* ============================================================
              COLLAPSED RAIL VIEW (when isOpen is false on desktop)
             ============================================================ */}
          {!isOpen ? (
            <div className="hidden md:flex flex-col items-center justify-between h-full w-full py-1">
              {/* Top: EideticAI Logo / Expand Toggle */}
              <button
                type="button"
                onClick={handleToggle}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 flex items-center justify-center text-white transition-all cursor-pointer shadow-xs group"
                title="Expand EideticAI Sidebar"
                aria-label="Expand sidebar"
              >
                <MessageSquare size={18} className="text-white group-hover:scale-105 transition-transform" />
              </button>

              {/* Center Icons */}
              <div className="flex-1 flex flex-col items-center gap-2.5 pt-5 pb-2">
                {/* New Chat Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (onNewChat) onNewChat();
                  }}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-all cursor-pointer shadow-xs"
                  title="New Conversation"
                >
                  <Plus size={18} strokeWidth={2} />
                </button>

                <div className="w-6 h-[1px] bg-white/[0.08] my-0.5" />

                {/* Home */}
                <button
                  type="button"
                  onClick={() => handleSelect("home")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                    activeId === "home"
                      ? "text-white bg-white/[0.16] border border-white/25 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)]"
                      : "text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-transparent hover:border-white/10"
                  }`}
                  title="Home"
                >
                  <Home size={17} strokeWidth={activeId === "home" ? 2.1 : 1.75} />
                </button>
              </div>

              {/* Bottom: Profile Avatar */}
              <div className="pt-2 mt-auto border-t border-white/[0.08] w-full flex justify-center">
                <button
                  type="button"
                  onClick={handleToggle}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer hover:bg-white/[0.08]"
                  title={mounted && user?.fullName ? user.fullName : "User Profile"}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-[11px] font-semibold text-white">
                    {mounted && user?.fullName ? userInitials : "GU"}
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* ============================================================
                EXPANDED VIEW (when isOpen is true)
               ============================================================ */
            <div className="flex flex-col h-full w-full">
              {/* 1. Header Row: EideticAI Brand + Collapse Toggle */}
              <div className="flex items-center justify-between px-2 pt-2 pb-3.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <MessageSquare size={17} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold tracking-tight text-white block truncate">
                      EideticAI
                    </span>
                    <span className="text-[10px] text-neutral-400 block -mt-0.5 tracking-wide">
                      Knowledge Assistant
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggle}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                  aria-label="Collapse sidebar"
                >
                  <ChevronDown size={16} className="rotate-90" />
                </button>
              </div>

              {/* 2. Primary New Chat Button */}
              <div className="px-1 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (onNewChat) onNewChat();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/10 hover:bg-white/[0.16] active:scale-[0.98] border border-white/15 text-white text-xs font-medium transition-all duration-200 cursor-pointer shadow-xs group"
                  title="Start a new chat session"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                      <Plus size={13} strokeWidth={2.4} />
                    </div>
                    <span className="font-medium text-white tracking-tight">New Chat</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">
                    +
                  </span>
                </button>
              </div>

              {/* 3. Search Input */}
              <div className="px-1 mb-3">
                <div className="relative flex items-center">
                  <Search
                    size={14}
                    className="absolute left-3 text-neutral-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white/[0.04] text-xs text-white placeholder:text-neutral-500 rounded-xl border border-white/[0.08] focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/15 transition-all"
                  />
                </div>
              </div>

              {/* 3. Conversations List */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {/* Conversations Section Header */}
                <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-neutral-400 tracking-wider uppercase">
                  <span>Conversations</span>
                  <button
                    type="button"
                    onClick={() => setIsChatsOpen(!isChatsOpen)}
                    className="p-0.5 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-200 ${
                        isChatsOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                </div>

                {isChatsOpen && (
                  <div className="space-y-0.5">
                    {isLoadingChats ? (
                      <div className="flex items-center justify-center py-4 text-xs text-neutral-500 gap-2">
                        <Loader2 size={13} className="animate-spin text-neutral-400" />
                        <span>Loading chats...</span>
                      </div>
                    ) : !mounted || !isAuthenticated ? (
                      <div className="px-3 py-3 text-center rounded-xl bg-white/[0.02] border border-white/[0.05] my-1">
                        <p className="text-xs text-neutral-400 mb-2 leading-relaxed">
                          Sign in to save and manage conversation history.
                        </p>
                        <Link
                          href="/signin"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[11px] font-medium hover:bg-neutral-200 transition-colors"
                        >
                          <LogIn size={12} />
                          <span>Sign in</span>
                        </Link>
                      </div>
                    ) : filteredChats.length === 0 ? (
                      <div className="px-3 py-3 text-center text-xs text-neutral-500">
                        {searchQuery ? "No matching chats" : "No saved conversations yet"}
                      </div>
                    ) : (
                      filteredChats.map((chat) => {
                        const isCurrentActive = activeChatId === chat.chatId;

                        return (
                          <div
                            key={chat.chatId}
                            onClick={() => {
                              if (onSelectChat) onSelectChat(chat.chatId);
                            }}
                            className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                              isCurrentActive
                                ? "text-white bg-white/[0.12] border border-white/20 shadow-xs"
                                : "text-neutral-400 hover:text-white hover:bg-white/[0.05] border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                              <MessageSquare
                                size={14}
                                className={`shrink-0 ${
                                  isCurrentActive ? "text-white" : "text-neutral-500 group-hover:text-neutral-300"
                                }`}
                              />
                              <span className="truncate block font-normal">
                                {chat.title || "New Conversation"}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteChat(e, chat.chatId)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-400 transition-opacity duration-150 cursor-pointer rounded-md hover:bg-white/[0.08]"
                              title="Delete conversation"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* 4. Footer Profile Row */}
              <div className="pt-2 mt-auto border-t border-white/[0.08] relative">
                {mounted && isAuthenticated && user ? (
                  <>
                    <div
                      onClick={() => setShowProfileMenu(!showProfileMenu)}
                      className="flex items-center justify-between p-2 rounded-[16px] hover:bg-white/[0.06] border border-transparent transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                          {userInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {user.fullName}
                          </div>
                          <div className="text-[11px] text-neutral-400 truncate">
                            {user.email}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          logout();
                        }}
                        className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
                        title="Sign out"
                      >
                        <LogOut size={15} />
                      </button>
                    </div>

                    {showProfileMenu && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 p-2 rounded-2xl bg-black/90 border border-white/15 backdrop-blur-xl shadow-2xl space-y-1 z-50">
                        <div className="px-2 py-1 text-[11px] text-neutral-400 border-b border-white/[0.08] pb-1.5 mb-1 truncate">
                          Signed in as <strong className="text-white block">{user.email}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            setShowProfileMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        >
                          <LogOut size={14} />
                          <span>Sign out</span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 p-1.5">
                    <Link
                      href="/signin"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-medium text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition-all cursor-pointer"
                    >
                      <LogIn size={13} />
                      <span>Sign in</span>
                    </Link>
                    <Link
                      href="/signup"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs font-medium text-black bg-white hover:bg-neutral-200 transition-all cursor-pointer"
                    >
                      <UserPlus size={13} />
                      <span>Register</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
