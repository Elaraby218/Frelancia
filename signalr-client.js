// ==========================================
// SignalR Client for Real-Time Job Notifications
// ==========================================

/**
 * Manages the SignalR connection lifecycle, including connection,
 * reconnection via chrome.alarms, and fallback event dispatching.
 */
class SignalRClient {
    constructor() {
        this.connection = null;
        this.serverUrl = 'https://frelancia.runasp.net/jobNotificationHub';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.onNewJobsCallback = null;
        this.onFallbackActivatedCallback = null;
        this.onReconnectedCallback = null;
    }

    /**
     * Initialize and connect to the SignalR hub.
     */
    async connect() {
        try {
            if (this.connection && this.isConnected) {
                console.log('SignalR: Already connected, skipping...');
                return;
            }

            if (this.connection) {
                try {
                    await this.connection.stop();
                } catch (e) {
                    console.warn('SignalR: Error stopping existing connection', e);
                }
            }

            console.log('SignalR: Initializing connection to', this.serverUrl);

            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(this.serverUrl, {
                    skipNegotiation: false,
                    transport: signalR.HttpTransportType.WebSockets
                        | signalR.HttpTransportType.ServerSentEvents
                        | signalR.HttpTransportType.LongPolling
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: (retryContext) => {
                        if (retryContext.elapsedMilliseconds < 60000) {
                            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 60000);
                        }
                        return 60000;
                    }
                })
                .configureLogging(signalR.LogLevel.Information)
                .build();

            this.registerEventHandlers();

            await this.connection.start();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('SignalR: Connected successfully');

            await chrome.storage.local.set({
                signalRConnected: true,
                signalRFallbackActive: false
            });

            if (this.onReconnectedCallback) {
                this.onReconnectedCallback();
            }

        } catch (error) {
            console.error('SignalR: Connection failed', error);
            this.isConnected = false;
            await chrome.storage.local.set({ signalRConnected: false });
            this.scheduleReconnect();
        }
    }

    /**
     * Register all SignalR event handlers.
     */
    registerEventHandlers() {
        this.connection.on('Connected', (data) => {
            console.log('SignalR: Connection confirmed', data);
        });

        this.connection.on('NewJobsDetected', async (data) => {
            console.log('SignalR: New jobs detected', data);

            if (!data || !Array.isArray(data.jobs)) {
                console.warn('SignalR: Invalid payload received, expected data.jobs array');
                return;
            }

            try {
                if (this.onNewJobsCallback) {
                    await this.onNewJobsCallback(data.jobs);
                } else {
                    await this.handleNewJobs(data.jobs);
                }
            } catch (error) {
                console.error('SignalR: Error processing new jobs', error);
            }
        });

        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.isConnected = false;
            chrome.storage.local.set({ signalRConnected: false });
        });

        this.connection.onreconnecting((error) => {
            console.log('SignalR: Reconnecting...', error);
            this.isConnected = false;
            chrome.storage.local.set({ signalRConnected: false });
        });

        this.connection.onreconnected((connectionId) => {
            console.log('SignalR: Reconnected', connectionId);
            this.isConnected = true;
            chrome.storage.local.set({
                signalRConnected: true,
                signalRFallbackActive: false
            });

            if (this.onReconnectedCallback) {
                this.onReconnectedCallback();
            }
        });
    }

    /**
     * Default handler for new jobs (NO HTTP REQUESTS - just process received data).
     */
    async handleNewJobs(jobs) {
        console.log(`SignalR: Processing ${jobs.length} new job(s) [ZERO HTTP REQUESTS]`);

        const data = await chrome.storage.local.get(['seenJobs', 'recentJobs', 'stats', 'settings', 'notificationsEnabled']);
        let seenJobs = data.seenJobs || [];
        let recentJobs = data.recentJobs || [];
        let stats = data.stats || { todayCount: 0, todayDate: new Date().toDateString() };
        const settings = data.settings || {};

        if (stats.todayDate !== new Date().toDateString()) {
            stats.todayCount = 0;
            stats.todayDate = new Date().toDateString();
        }

        const validJobs = [];

        for (const job of jobs) {
            if (seenJobs.includes(job.id)) {
                console.log(`SignalR: Skipping already seen job ${job.id}`);
                continue;
            }

            seenJobs.push(job.id);

            if (!applyFilters(job, settings)) {
                console.log(`SignalR: Filtering out job ${job.id}`);
                continue;
            }

            const existingIdx = recentJobs.findIndex(rj => rj.id === job.id);
            if (existingIdx !== -1) {
                recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
            } else {
                recentJobs.unshift(job);
            }

            validJobs.push(job);
        }

        stats.lastCheck = new Date().toISOString();
        stats.todayCount += validJobs.length;

        if (seenJobs.length > 500) {
            seenJobs = seenJobs.slice(-500);
        }

        recentJobs.sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idB - idA;
        });
        recentJobs = recentJobs.slice(0, 50);

        await chrome.storage.local.set({ seenJobs, stats, recentJobs });

        if (validJobs.length > 0) {
            if (settings.quietHoursEnabled && isQuietHour(settings)) {
                console.log('SignalR: Quiet Hours active, suppressing notifications');
                return;
            }

            // Check if notifications are globally enabled
            const isEnabled = data.notificationsEnabled !== false;
            
            if (isEnabled) {
                console.log(`SignalR: Showing notifications for ${validJobs.length} job(s) [NO HTTP REQUESTS MADE]`);
                showNotification(validJobs);

                if (settings.sound) {
                    playSound();
                }
            } else {
                console.log('SignalR: Notifications are toggled off. Skipping alert.');
            }
        } else {
            console.log('SignalR: No valid jobs to notify after filtering');
        }
    }

    /**
     * Register a callback for when new jobs are received.
     */
    onNewJobs(callback) {
        this.onNewJobsCallback = callback;
    }

    /**
     * Register a callback for when fallback mode is activated.
     */
    onFallbackActivated(callback) {
        this.onFallbackActivatedCallback = callback;
    }

    /**
     * Register a callback for when SignalR reconnects successfully.
     */
    onReconnected(callback) {
        this.onReconnectedCallback = callback;
    }

    /**
     * Schedule a reconnection attempt using chrome.alarms (MV3-safe).
     * setTimeout is unreliable in service workers that can be suspended.
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('SignalR: Max reconnect attempts reached. Activating polling fallback.');
            chrome.storage.local.set({ signalRFallbackActive: true });

            if (this.onFallbackActivatedCallback) {
                this.onFallbackActivatedCallback();
            }
            return;
        }

        this.reconnectAttempts++;
        const delayMinutes = Math.max(this.reconnectAttempts * 0.5, 0.5);
        console.log(`SignalR: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delayMinutes} min`);

        chrome.alarms.create('signalRReconnect', { delayInMinutes: delayMinutes });
    }

    /**
     * Disconnect from the hub.
     */
    async disconnect() {
        if (this.connection) {
            try {
                await this.connection.stop();
                console.log('SignalR: Disconnected');
            } catch (error) {
                console.error('SignalR: Error disconnecting', error);
            }
        }
        this.isConnected = false;
        await chrome.storage.local.set({ signalRConnected: false });
    }

    /**
     * Send a ping to the server (for testing).
     */
    async ping() {
        if (this.isConnected && this.connection) {
            try {
                await this.connection.invoke('Ping');
                console.log('SignalR: Ping sent');
            } catch (error) {
                console.error('SignalR: Ping failed', error);
            }
        }
    }

    /**
     * Get connection status.
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            state: this.connection?.state || 'Disconnected',
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Create global instance
const signalRClient = new SignalRClient();
