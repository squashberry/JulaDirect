/* =========================================================
   JULADIRECT — CENTRALIZED NETWORK & OFFLINE MANAGER
   ========================================================= */

(() => {
    "use strict";

    // Legacy pages that don't load jd-core still need the root offline worker.
    if ("serviceWorker" in navigator &&
        (location.protocol === "https:" || location.hostname === "localhost") &&
        !window.__jdOfflineWorkerRegistration) {
        window.__jdOfflineWorkerRegistration = navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .catch(error => {
                window.__jdOfflineWorkerRegistration = null;
                console.warn("[JulaDirect] offline support registration failed:", error && error.message);
                return null;
            });
    }

    // Development mode console logging helper
    const log = (msg, data = "") => {
        const isDev = window.location.hostname === "localhost" || 
                      window.location.hostname === "127.0.0.1" || 
                      window.location.protocol === "file:";
        if (isDev) {
            console.log(`[JulaDirect Network] ${msg}`, data);
        }
    };

    const isNetworkError = (error) => {
        if (!error) return false;
        const message = String(error.message || error || "").toLowerCase();
        const name = String(error.name || "").toLowerCase();

        if (name === "aborterror" || message.includes("abort") || message.includes("cancelled") || message.includes("canceled")) {
            return false;
        }

        // Privacy/storage warnings, CORS failures and application-level errors are not device-offline signals.
        if (message.includes("tracking prevention") || message.includes("blocked access to storage") ||
            message.includes("securityerror") || message.includes("database") || message.includes("rpc") ||
            message.includes("cors") || message.includes("cross-origin") || message.includes("access-control")) {
            return false;
        }

        const status = Number(error.status || error.statusCode || (error.response && error.response.status) || 0);
        if (status >= 400 && status < 600) return false;

        // navigator.onLine is only a hint; the manager confirms loss with repeated same-origin probes.
        return /failed to fetch|networkerror|network error|fetch failed|load failed|econnrefused|enotfound|err_internet_disconnected|network is unreachable|timed? out|timeout/.test(message);
    };

    class NetworkManager {
        constructor() {
            this.initialized = false;
            this.isOfflineState = false;
            this.softNoticeTimer = null;
            this.fullScreenTimer = null;
            this.pingInterval = null;
            this.pendingRequests = [];
            this.softNoticeEl = null;
            this.fullScreenEl = null;
            // Require repeated failed probes before showing an offline state.
            this.offlineTimeoutDuration = 90000; // 90 seconds after connectivity loss is confirmed
            this.softNoticeDelay = 6000; // 6 seconds after confirmation
            this.requiredConnectivityFailures = 3;
            this.failedConnectivityChecks = 0;
            this.connectivityCheckPromise = null;

            this.onOnlineBound = this.handleOnline.bind(this);
            this.onOfflineBound = this.handleOffline.bind(this);
            this.onUnhandledRejectionBound = this.handleUnhandledRejection.bind(this);
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;

            // Add global event listeners
            window.addEventListener("online", this.onOnlineBound);
            window.addEventListener("offline", this.onOfflineBound);
            window.addEventListener("unhandledrejection", this.onUnhandledRejectionBound);

            // Inject CSS styles dynamically
            this.injectStyles();

            // Override window.fetch to capture network errors
            this.setupFetchInterceptor();

            // Check initial state
            if (!navigator.onLine) {
                this.handleOffline();
            }
        }

        injectStyles() {
            if (document.getElementById("gambasket-network-styles")) return;

            const style = document.createElement("style");
            style.id = "gambasket-network-styles";
            style.textContent = `
                /* Soft Offline Toast Style */
                .gb-network-toast {
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 100005;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 18px;
                    background: rgba(30, 41, 59, 0.85);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                    color: #f1f5f9;
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 14px;
                    transform: translateY(100px);
                    opacity: 0;
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
                    pointer-events: auto;
                }
                
                @media (prefers-reduced-motion: reduce) {
                    .gb-network-toast {
                        transition: opacity 0.2s ease;
                        transform: none !important;
                    }
                }

                .gb-network-toast.show {
                    transform: translateY(0);
                    opacity: 1;
                }

                @media (max-width: 640px) {
                    .gb-network-toast {
                        bottom: 16px;
                        left: 16px;
                        right: 16px;
                        justify-content: space-between;
                    }
                }

                .gb-network-spinner {
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(241, 245, 249, 0.2);
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: gb-spin 0.8s linear infinite;
                    flex-shrink: 0;
                }

                .gb-network-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #94a3b8;
                    display: inline-block;
                    animation: gb-pulse 1.5s ease-in-out infinite;
                }

                .gb-network-toast-content {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .gb-network-toast-title {
                    font-weight: 600;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .gb-network-toast-desc {
                    font-size: 12px;
                    color: #94a3b8;
                }

                .gb-network-toast-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: 12px;
                }

                .gb-network-btn-link {
                    background: none;
                    border: none;
                    color: #3b82f6;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 6px;
                    transition: background 0.2s;
                }

                .gb-network-btn-link:hover {
                    background: rgba(59, 130, 246, 0.1);
                    color: #60a5fa;
                }

                .gb-network-btn-close {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    font-size: 16px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    transition: background 0.2s, color 0.2s;
                }

                .gb-network-btn-close:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }

                /* Full-page offline layer: the live page remains mounted underneath. */
                .gb-network-fullscreen {
                    position: fixed;
                    inset: 0;
                    z-index: 100010;
                    display: grid;
                    place-items: center;
                    overflow-y: auto;
                    padding: 24px;
                    background: rgba(248, 250, 252, .93);
                    color: #0f172a;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity .25s ease;
                }

                .gb-network-fullscreen.show {
                    opacity: 1;
                    pointer-events: auto;
                }

                .gb-network-offline-card {
                    width: min(100%, 460px);
                    padding: clamp(24px, 5vw, 38px);
                    border: 1px solid #e2e8f0;
                    border-radius: 26px;
                    background: #fff;
                    box-shadow: 0 24px 70px rgba(15, 23, 42, .16);
                    text-align: center;
                }

                .gb-network-offline-icon {
                    width: 66px;
                    height: 66px;
                    display: grid;
                    place-items: center;
                    margin: 0 auto 20px;
                    border-radius: 22px;
                    background: #eff6ff;
                    color: #2563eb;
                }

                .gb-network-offline-icon svg { width: 32px; height: 32px; }
                .gb-network-offline-eyebrow {
                    margin: 0 0 9px;
                    color: #2563eb;
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: .13em;
                }

                .gb-network-offline-title {
                    margin: 0 0 10px;
                    color: #0f172a;
                    font-size: clamp(25px, 5vw, 34px);
                    line-height: 1.15;
                    letter-spacing: -.04em;
                }

                .gb-network-offline-copy {
                    margin: 0 auto 24px;
                    max-width: 360px;
                    color: #64748b;
                    font-size: 14px;
                    line-height: 1.7;
                }

                .gb-network-fullscreen-button {
                    width: 100%;
                    min-height: 50px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 9px;
                    padding: 12px 18px;
                    border: 0;
                    border-radius: 13px;
                    background: #2563eb;
                    color: #fff;
                    font: inherit;
                    font-size: 14px;
                    font-weight: 750;
                    cursor: pointer;
                    transition: background .2s ease, transform .2s ease;
                }

                .gb-network-fullscreen-button:hover { background: #1d4ed8; transform: translateY(-1px); }
                .gb-network-fullscreen-button:disabled { cursor: wait; opacity: .78; transform: none; }
                .gb-network-offline-status {
                    min-height: 18px;
                    margin: 16px 0 0;
                    color: #64748b;
                    font-size: 12px;
                    line-height: 1.5;
                }

                .dark .gb-network-fullscreen { background: rgba(15, 23, 42, .94); color: #f8fafc; }
                .dark .gb-network-offline-card { background: #111827; border-color: #334155; }
                .dark .gb-network-offline-title { color: #f8fafc; }
                .dark .gb-network-offline-copy, .dark .gb-network-offline-status { color: #cbd5e1; }
                .dark .gb-network-offline-icon { background: rgba(37, 99, 235, .18); color: #93c5fd; }

                @media (prefers-reduced-motion: reduce) {
                    .gb-network-fullscreen, .gb-network-fullscreen-button { transition: none; }
                }

                @keyframes gb-spin {
                    to { transform: rotate(360deg); }
                }

                @keyframes gb-pulse {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 1; }
                }

                @keyframes gb-float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        setupFetchInterceptor() {
            if (typeof window.fetch !== "function") return;

            const nativeFetch = window.fetch.bind(window);
            this.nativeFetch = nativeFetch;
            window.fetch = async (...args) => {
                try {
                    return await nativeFetch(...args);
                } catch (error) {
                    if (!isNetworkError(error)) throw error;

                    log("request failed; checking actual connectivity", error);

                    // Do not turn a CORS/API failure into an offline state. Probe this origin first.
                    const online = await this.checkConnectivity();
                    if (online) {
                        if (this.isOfflineState) this.recover();
                        else this.stopPingMonitoring();
                        throw error;
                    }

                    this.handleRequestFailure(error, true);

                    // Only queue safe reads. Never silently replay payments, orders or other writes.
                    const request = args[0];
                    const init = args[1] || {};
                    const method = String(init.method || (request && request.method) || "GET").toUpperCase();
                    if (method !== "GET" && method !== "HEAD") throw error;

                    return new Promise((resolve, reject) => {
                        this.pendingRequests.push({ args, resolve, reject, nativeFetch });
                    });
                }
            };
        }

        handleUnhandledRejection(event) {
            if (isNetworkError(event.reason)) {
                log("request failed (unhandled promise rejection)", event.reason);
                this.handleRequestFailure(event.reason);
            }
        }

        handleRequestFailure(error, connectivityAlreadyFailed = false) {
            if (this.isOfflineState) return;

            // A single failed request or browser offline event is only a candidate.
            if (connectivityAlreadyFailed) {
                this.failedConnectivityChecks = Math.max(1, this.failedConnectivityChecks);
            }
            this.startPingMonitoring(connectivityAlreadyFailed);
        }

        async handleOnline() {
            log("browser reported that the connection may be restored");
            const connected = await this.checkConnectivity();
            if (connected) {
                log("connection restored");
                this.recover();
            } else {
                this.handleRequestFailure(new Error("Connection restoration could not be confirmed"), true);
            }
        }

        handleOffline() {
            log("browser reported a possible offline state; verifying it");
            this.handleRequestFailure(new Error("Browser offline event"));
        }

        confirmOffline() {
            if (this.isOfflineState) return;

            this.isOfflineState = true;
            this.clearTimers();
            log("offline state confirmed after repeated connectivity failures");

            this.softNoticeTimer = setTimeout(() => {
                this.showSoftOfflineNotice();
            }, this.softNoticeDelay);

            this.fullScreenTimer = setTimeout(() => {
                log("confirmed offline timeout reached");
                this.showOfflineScreen();
            }, this.offlineTimeoutDuration);
        }

        async recover() {
            this.isOfflineState = false;
            this.clearTimers();
            this.hideSoftOfflineNotice();
            this.hideOfflineScreen();
            this.stopPingMonitoring();

            const queue = [...this.pendingRequests];
            this.pendingRequests = [];

            log("retrying " + queue.length + " safe read request(s)");

            for (const req of queue) {
                try {
                    const response = await req.nativeFetch(...req.args);
                    req.resolve(response);
                } catch (err) {
                    if (isNetworkError(err)) {
                        this.pendingRequests.push(req);
                        this.handleRequestFailure(err, true);
                    } else {
                        req.reject(err);
                    }
                }
            }
        }

        async checkConnectivity() {
            if (this.connectivityCheckPromise) return this.connectivityCheckPromise;

            this.connectivityCheckPromise = (async () => {
                let timeout = null;
                let controller = null;
                try {
                    // Use a real, uncached same-origin request. navigator.onLine alone is unreliable.
                    const fetcher = this.nativeFetch || window.fetch.bind(window);
                    if (typeof AbortController === "function") {
                        controller = new AbortController();
                        timeout = setTimeout(() => controller.abort(), 5000);
                    }
                    const response = await fetcher("/sw.js?ping=" + Date.now(), {
                        method: "GET",
                        cache: "no-store",
                        credentials: "same-origin",
                        ...(controller ? { signal: controller.signal } : {})
                    });
                    return response.ok;
                } catch {
                    return false;
                } finally {
                    if (timeout) clearTimeout(timeout);
                    this.connectivityCheckPromise = null;
                }
            })();

            return this.connectivityCheckPromise;
        }

        startPingMonitoring(knownFailedProbe = false) {
            if (this.pingInterval) return;
            if (knownFailedProbe) this.failedConnectivityChecks = Math.max(1, this.failedConnectivityChecks);

            const check = async () => {
                log("verifying connection...");
                const online = await this.checkConnectivity();

                if (online) {
                    this.failedConnectivityChecks = 0;
                    if (this.isOfflineState || this.pendingRequests.length) {
                        this.recover();
                    } else {
                        this.stopPingMonitoring();
                    }
                    return;
                }

                this.failedConnectivityChecks += 1;
                log("connectivity probe failed", this.failedConnectivityChecks);
                if (this.failedConnectivityChecks >= this.requiredConnectivityFailures) {
                    this.confirmOffline();
                }
            };

            this.pingInterval = setInterval(check, 4000);
            if (!knownFailedProbe) check();
        }

        stopPingMonitoring() {
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }
            this.failedConnectivityChecks = 0;
        }

        clearTimers() {
            if (this.softNoticeTimer) {
                clearTimeout(this.softNoticeTimer);
                this.softNoticeTimer = null;
            }
            if (this.fullScreenTimer) {
                clearTimeout(this.fullScreenTimer);
                this.fullScreenTimer = null;
            }
        }

        showSoftOfflineNotice() {
            if (this.softNoticeEl) return;
            if (this.fullScreenEl || document.getElementById("gb-network-fullscreen")) return;
            if (document.getElementById("gb-network-toast")) return;

            const toast = document.createElement("div");
            toast.id = "gb-network-toast";
            toast.className = "gb-network-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            toast.innerHTML = `
                <div class="gb-network-spinner"></div>
                <div class="gb-network-toast-content">
                    <div class="gb-network-toast-title">
                        <span>You appear to be offline</span>
                    </div>
                    <div class="gb-network-toast-desc">Trying to reconnect…</div>
                </div>
                <div class="gb-network-toast-actions">
                    <button type="button" class="gb-network-btn-link" id="gb-toast-retry">Retry</button>
                    <button type="button" class="gb-network-btn-close" id="gb-toast-close" aria-label="Dismiss">&times;</button>
                </div>
            `;

            document.body.appendChild(toast);
            this.softNoticeEl = toast;

            requestAnimationFrame(() => {
                toast.classList.add("show");
            });

            document.getElementById("gb-toast-retry")?.addEventListener("click", () => this.retry());
            document.getElementById("gb-toast-close")?.addEventListener("click", () => this.hideSoftOfflineNotice());
        }

        hideSoftOfflineNotice() {
            const toast = this.softNoticeEl || document.getElementById("gb-network-toast");
            if (!toast) return;

            toast.classList.remove("show");
            setTimeout(() => {
                toast.remove();
                if (this.softNoticeEl === toast) {
                    this.softNoticeEl = null;
                }
            }, 400);
        }

        showOfflineScreen() {
            this.hideSoftOfflineNotice();

            let overlay = this.fullScreenEl || document.getElementById("gb-network-fullscreen");
            if (overlay && !overlay.isConnected) overlay = null;
            if (overlay) {
                if (overlay._gbRemoveTimer) clearTimeout(overlay._gbRemoveTimer);
                overlay.inert = false;
                overlay.classList.add("show");
                this.fullScreenEl = overlay;
                return;
            }

            overlay = document.createElement("div");
            overlay.id = "gb-network-fullscreen";
            overlay.className = "gb-network-fullscreen";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("aria-labelledby", "gb-network-offline-title");
            overlay.setAttribute("aria-describedby", "gb-network-offline-copy");
            overlay.innerHTML = `
                <section class="gb-network-offline-card">
                    <div class="gb-network-offline-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9a15 15 0 0 1 18 0"></path>
                            <path d="M6.5 12.5a9.5 9.5 0 0 1 11 0"></path>
                            <path d="M10 16a4 4 0 0 1 4 0"></path>
                            <path d="M12 20h.01"></path>
                            <path d="m3 3 18 18"></path>
                        </svg>
                    </div>
                    <p class="gb-network-offline-eyebrow">CONNECTION INTERRUPTED</p>
                    <h2 class="gb-network-offline-title" id="gb-network-offline-title">You're offline</h2>
                    <p class="gb-network-offline-copy" id="gb-network-offline-copy">
                        JulaDirect can't reach the marketplace right now. Your current page stays open underneath this screen, so your place and anything you've entered are preserved.
                    </p>
                    <button type="button" class="gb-network-fullscreen-button" id="gb-fullscreen-retry">
                        Retry connection
                    </button>
                    <p class="gb-network-offline-status" id="gb-fullscreen-status" role="status" aria-live="polite">
                        This screen will close automatically when your connection returns.
                    </p>
                </section>
            `;

            document.body.appendChild(overlay);
            this.fullScreenEl = overlay;
            requestAnimationFrame(() => overlay.classList.add("show"));
            document.getElementById("gb-fullscreen-retry")?.addEventListener("click", () => this.retry());
            document.getElementById("gb-fullscreen-retry")?.focus({ preventScroll: true });
        }

        hideOfflineScreen() {
            const overlay = this.fullScreenEl || document.getElementById("gb-network-fullscreen");
            if (!overlay) return;

            overlay.inert = true;
            overlay.classList.remove("show");
            if (overlay._gbRemoveTimer) clearTimeout(overlay._gbRemoveTimer);
            overlay._gbRemoveTimer = setTimeout(() => {
                if (!overlay.classList.contains("show")) {
                    overlay.remove();
                    if (this.fullScreenEl === overlay) this.fullScreenEl = null;
                }
            }, 300);
        }

        async retry() {
            log("manually retry clicked");
            this.clearTimers();

            const button = document.getElementById("gb-fullscreen-retry") || document.getElementById("gb-toast-retry");
            const status = document.getElementById("gb-fullscreen-status");
            const spinner = document.createElement("span");
            spinner.className = "gb-network-spinner";

            let originalContent = "";
            if (button) {
                originalContent = button.innerHTML;
                button.disabled = true;
                button.innerHTML = "";
                button.appendChild(spinner);
            }
            if (status) status.textContent = "Checking your connection...";

            const connected = await this.checkConnectivity();

            if (connected) {
                // Keep the current document alive: recovery only dismisses the overlay.
                await this.recover();
                return;
            }

            if (button) {
                button.disabled = false;
                button.innerHTML = originalContent;
            }
            if (status) status.textContent = "Still offline. Your current page is safe here; check your connection and retry.";

            // A manual retry is still only one failed probe; require confirmation again.
            this.isOfflineState = false;
            this.handleRequestFailure(new Error("Manual connectivity check failed"), true);
        }

        isOffline() {
            return this.isOfflineState;
        }

        startMonitoring() {
            this.init();
        }

        stopMonitoring() {
            window.removeEventListener("online", this.onOnlineBound);
            window.removeEventListener("offline", this.onOfflineBound);
            window.removeEventListener("unhandledrejection", this.onUnhandledRejectionBound);
            this.stopPingMonitoring();
            this.clearTimers();
            this.hideSoftOfflineNotice();
            this.hideOfflineScreen();
        }
    }

    // Export to global scope
    const manager = new NetworkManager();
    window.GamBasketNetwork = manager;

    // Start monitoring automatically on load
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => manager.startMonitoring());
    } else {
        manager.startMonitoring();
    }
})();
