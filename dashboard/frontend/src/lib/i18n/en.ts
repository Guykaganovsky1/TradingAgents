/**
 * All UI strings in one place. No hard-coded strings in components.
 */
export const t = {
  // App
  appName: "TradingAgents",
  appTagline: "AI-powered market analysis",

  // Nav
  nav: {
    overview: "Overview",
    run: "Run Analysis",
    watchlist: "Watchlist",
    history: "History",
    settings: "Settings",
  },

  // Overview
  overview: {
    // Page title — matches the sidebar nav label so the user always knows
    // which page they're on. (Previously this returned a time-of-day
    // greeting, but the user prefers the page name as the heading.)
    // Signature preserves the optional-name arg for callsite compatibility.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    greeting: (name?: string) => "Overview",
    activeSignals: "Active Signals",
    analysesToday: "Analyses Today",
    tokensUsed: "Tokens Used",
    topSignal: "Top Signal",
    watchlistSignals: "Watchlist Signals",
    tokenUsage7d: "Token Usage (7 days)",
    quickRun: "Quick Run",
    quickRunPlaceholder: "Ticker (e.g. AAPL)",
    analyze: "Analyze →",
    acrossNTickers: (n: number) => `Across ${n} ticker${n !== 1 ? "s" : ""}`,
    nBuyNHold: (buy: number, hold: number, sell: number) =>
      [
        buy > 0 ? `${buy} BUY` : "",
        hold > 0 ? `${hold} HOLD` : "",
        sell > 0 ? `${sell} SELL` : "",
      ]
        .filter(Boolean)
        .join(" · "),
  },

  // Run
  run: {
    title: "Run Analysis",
    subtitle: "Configure and launch a new agent analysis",
    configuration: "Configuration",
    tickerSymbol: "Ticker Symbol",
    tickerPlaceholder: "e.g. AAPL",
    analysisDate: "Analysis Date",
    analystsToInclude: "Analysts to Include",
    llmProvider: "LLM Provider",
    model: "Model",
    startAnalysis: "Start Analysis",
    agentPipeline: "Agent Pipeline",
    liveOutput: "Live Output",
    validating: "Validating…",
    invalidTicker: "Ticker not found",
    connectionError: "Backend unreachable",
    runStarted: "Analysis started",
    viewRun: "View run",
  },

  // Analysts
  analysts: {
    market: "Market",
    news: "News",
    social: "Social",
    fundamentals: "Fundamentals",
  },

  // Watchlist
  watchlist: {
    title: "Watchlist",
    subtitle: "Manage tracked tickers and scheduled analyses",
    addTicker: "+ Add Ticker",
    ticker: "Ticker",
    signal: "Signal",
    confidence: "Confidence",
    analysts: "Analysts",
    schedule: "Schedule",
    lastRun: "Last Run",
    actions: "",
    runNow: "Run",
    edit: "Edit",
    delete: "Delete",
    manual: "Manual",
    addToWatchlist: "Track your first ticker",
    addToWatchlistBody:
      "Add a stock ticker to your watchlist to track signals and schedule analyses.",
    addTickerCta: "+ Add Ticker",
    editTicker: "Edit Ticker",
    deleteTicker: "Remove from watchlist",
    deleteConfirm: "This will also delete all schedules for this ticker.",
    notes: "Notes",
    notesPlaceholder: "Optional notes about this ticker",
    tickerLabel: "Ticker Symbol",
    tickerValidating: "Checking ticker…",
    tickerValid: (name: string) => `✓ ${name}`,
    tickerInvalid: "Ticker not found on yfinance",
  },

  // History
  history: {
    title: "Analysis History",
    subtitle: "Browse past reports and agent decisions",
    nAnalyses: (n: number) => `${n} ${n === 1 ? "analysis" : "analyses"}`,
    emptyTitle: "No analyses yet",
    emptyBody: "Run your first analysis to see results here.",
    runFirst: "Run Analysis",
    loadMore: "Load more",
    decisionBy: "Portfolio Manager decision",
    confidence: "confidence",
    report: {
      market: "Market Report",
      news: "News Report",
      sentiment: "Sentiment Report",
      fundamentals: "Fundamentals Report",
      investment_debate_state: "Investment Debate",
      trader_investment_decision: "Trader Plan",
      risk_debate_state: "Risk Debate",
      final_trade_decision: "Final Decision",
    },
    deleteRun: "Delete run",
    deleteConfirm: "This will permanently remove this analysis and all reports.",
  },

  // Settings
  settings: {
    title: "Settings",
    subtitle: "Configure LLM providers, API keys, and behaviour",
    llmConfig: "LLM Configuration",
    deepThinkProvider: "Deep Think Provider",
    deepThinkModel: "Deep Think Model",
    quickThinkProvider: "Quick Think Provider",
    backendUrl: "Backend URL",
    apiKeys: "API Keys",
    openaiKey: "OpenAI API Key",
    anthropicKey: "Anthropic API Key",
    alphaVantageKey: "Alpha Vantage Key",
    configured: "Configured",
    notConfigured: "Not configured",
    behaviour: "Behaviour",
    autoSave: "Auto-save results",
    autoSaveDesc: "Write analysis to ./results/ after every run",
    codexPlanner: "Codex Coding Planner",
    codexPlannerDesc: "Enable the code-generation agent in the pipeline",
    outputLanguage: "Output Language",
    outputLanguageDesc: "Language for analyst reports and final decision",
    testLlm: "Test LLM",
    testLlmTesting: "Testing…",
    testLlmSuccess: "LLM connected",
    testLlmFail: "Connection failed",
    saveSettings: "Save Settings",
    saved: "Settings saved",
    theme: "Theme",
    themeDesc: "Dark mode default, light mode available",
    darkMode: "Dark Mode",
    ollamaBaseUrl: "Ollama Base URL",
    ollamaBaseUrlDesc: "Base URL for Ollama (default: http://localhost:11434)",
  },

  // Signals
  signals: {
    BUY: "BUY",
    HOLD: "HOLD",
    SELL: "SELL",
  },

  // Agent statuses
  agent: {
    pending: "Waiting",
    running: "Running…",
    done: "Complete",
    error: "Error",
  },

  // Connection
  connection: {
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    disconnected: "Disconnected",
  },

  // Scan
  scan: {
    title: "Market Scanner",
    subtitle: "Pre-filter the universe — top candidates for TradingAgents",
    navLabel: "Scan",
    configure: "Configure",
    universes: "Universe",
    universesDesc: "Choose which symbols to scan",
    topN: "Top N results",
    scanNow: "⚡ Scan Now",
    cancel: "Cancel Scan",
    cancelConfirm: "Cancel this scan?",

    // Universe labels
    universe: {
      watchlist: "Watchlist",
      sp500: "S&P 500",
      nasdaq100: "Nasdaq 100",
      crypto: "Crypto",
    },

    // Progress
    progress: "Live Progress",
    scanning: (n: number) => `Scanning ${n} symbols…`,
    factor: {
      technical: "Technical",
      news: "News",
      sentiment: "Sentiment",
      fundamental: "Fundamentals",
    },
    factorStatus: {
      pending: "Pending",
      running: "Running…",
      done: "Done",
      error: "Error",
    },

    // Results
    results: "Top Candidates",
    rank: (n: number) => `#${n}`,
    compositeScore: "Score",
    assetClass: {
      stock: "📈 Stock",
      crypto: "🪙 Crypto",
    },
    runCta: "▶ Run TradingAgents →",
    noFactorData: "No data",

    // History
    history: "Scan History",
    historyEmpty: "No scans yet",
    historyEmptyCta: "⚡ Scan Now to get started",
    historyShow: "Show history",
    historyHide: "Hide history",
    historyStatusComplete: "Complete",
    historyStatusRunning: "Running",
    historyStatusError: "Error",
    historyStatusQueued: "Queued",
    historyRestore: "Restore results",

    // Empty state
    emptyTitle: "No scans yet",
    emptyBody: "Configure the universe above and click ⚡ Scan Now to get started.",

    // Errors
    startError: "Failed to start scan",
    cancelError: "Failed to cancel scan",
    loadError: "Failed to load scan history",
    retryLabel: "Retry",
    scanError: "Scan failed",
  },

  // Generic
  loading: "Loading…",
  retry: "Retry",
  cancel: "Cancel",
  save: "Save",
  confirm: "Confirm",
  close: "Close",
  error: "Error",
  backendError: "Could not reach backend. Check that the backend is running.",
  unknownError: "An unexpected error occurred.",
  noData: "No data available.",
} as const;
