import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
    // --- Chapter State ---
    chapters: [],
    activeChapterId: null,
    setChapters: (chapters) => set({ chapters }),
    setActiveChapterId: (id) => set({ activeChapterId: id }),
    addChapter: (chapter) => set((state) => ({ chapters: [...state.chapters, chapter] })),
    deleteChapter: (id) => set((state) => ({ chapters: state.chapters.filter((ch) => ch.id !== id) })),
    updateChapter: (id, updates) => set((state) => ({
        chapters: state.chapters.map((ch) => (ch.id === id ? { ...ch, ...updates } : ch))
    })),

    // --- UI State ---
    sidebarOpen: true,
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

    aiSidebarOpen: false,
    setAiSidebarOpen: (open) => set({ aiSidebarOpen: open }),
    toggleAiSidebar: () => set((state) => ({ aiSidebarOpen: !state.aiSidebarOpen })),

    showSettings: false,
    setShowSettings: (show) => set({ showSettings: show }),

    showSnapshots: false,
    setShowSnapshots: (show) => set({ showSnapshots: show }),

    theme: 'light',
    setTheme: (theme) => set({ theme }),

    writingMode: 'webnovel',
    setWritingMode: (mode) => set({ writingMode: mode }),

    // --- Localization & Theming ---
    language: typeof window !== 'undefined' ? localStorage.getItem('author-lang') || null : null,
    setLanguage: (lang) => set(() => {
        if (typeof window !== 'undefined') localStorage.setItem('author-lang', lang);
        return { language: lang };
    }),

    visualTheme: typeof window !== 'undefined' ? localStorage.getItem('author-visual') || null : null,
    setVisualTheme: (vTheme) => set(() => {
        if (typeof window !== 'undefined') localStorage.setItem('author-visual', vTheme);
        return { visualTheme: vTheme };
    }),

    startTour: false,
    setStartTour: (val) => set({ startTour: val }),

    // --- Toast ---
    toast: null,
    setToast: (toast) => {
        set({ toast });
        if (toast) {
            setTimeout(() => set({ toast: null }), 3000);
        }
    },
    showToast: (message, type = 'info') => get().setToast({ message, type }),

    // --- Context & Settings (RAG Preparation) ---
    contextSelection: typeof window !== 'undefined' && localStorage.getItem('author-context-selection')
        ? new Set(JSON.parse(localStorage.getItem('author-context-selection')))
        : new Set(),
    setContextSelection: (selection) => set((state) => {
        const newSelection = typeof selection === 'function' ? selection(state.contextSelection) : selection;
        if (typeof window !== 'undefined') {
            localStorage.setItem('author-context-selection', JSON.stringify(Array.from(newSelection)));
        }
        return { contextSelection: newSelection };
    }),

    contextItems: [],
    setContextItems: (items) => set({ contextItems: items }),

    settingsVersion: 0,
    incrementSettingsVersion: () => set((state) => ({ settingsVersion: state.settingsVersion + 1 })),

    // --- AI Chat & Generation State ---
    sessionStore: { activeSessionId: null, sessions: [] },
    setSessionStore: (action) => set((state) => ({ sessionStore: typeof action === 'function' ? action(state.sessionStore) : action })),

    chatStreaming: false,
    setChatStreaming: (streaming) => set({ chatStreaming: streaming }),

    generationArchive: [],
    setGenerationArchive: (archive) => set({ generationArchive: typeof archive === 'function' ? archive(get().generationArchive) : archive }),
    addGenerationArchive: (record) => set((state) => ({ generationArchive: [...state.generationArchive, record] })),
}));
