// ==========================================
// SignalR Client for Real-Time Job Notifications
// ==========================================

class SignalRClient {
    constructor() {
        this.connection = null;
        this.serverUrl = 'https://frelancia.runasp.net/jobNotificationHub';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000; // 5 seconds
        this.onNewJobsCallback = null;
    }

    /**
     * Initialize and connect to the SignalR hub
     */
    async connect() {
        try {
            // Prevent duplicate connections
            if (this.connection && this.isConnected) {
                console.log('SignalR: Already connected, skipping...');
                return;
            }

            // Close existing connection if any
            if (this.connection) {
                try {
                    await this.connection.stop();
                } catch (e) {
                    console.warn('SignalR: Error stopping existing connection', e);
                }
            }

            console.log('SignalR: Initializing connection to', this.serverUrl);

            // Create connection using Microsoft SignalR library
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(this.serverUrl, {
                    skipNegotiation: false,
                    transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: (retryContext) => {
                        // Exponential backoff: 0s, 2s, 10s, 30s, 60s, 60s...
                        if (retryContext.elapsedMilliseconds < 60000) {
                            return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 60000);
                        }
                        return 60000;
                    }
                })
                .configureLogging(signalR.LogLevel.Information)
                .build();

            // Register event handlers
            this.registerEventHandlers();

            // Start the connection
            await this.connection.start();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('SignalR: Connected successfully');

            // Store connection status
            await chrome.storage.local.set({ signalRConnected: true });

        } catch (error) {
            console.error('SignalR: Connection failed', error);
            this.isConnected = false;
            await chrome.storage.local.set({ signalRConnected: false });

            // Attempt to reconnect
            this.scheduleReconnect();
        }
    }

    /**
     * Register all SignalR event handlers
     */
    registerEventHandlers() {
        // Handle successful connection confirmation
        this.connection.on('Connected', (data) => {
            console.log('SignalR: Connection confirmed', data);
        });

        // Handle new job notifications from server
        this.connection.on('NewJobsDetected', async (data) => {
            console.log('SignalR: New jobs detected', data);

            try {
                // Call the registered callback to process new jobs
                if (this.onNewJobsCallback) {
                    await this.onNewJobsCallback(data.jobs);
                } else {
                    // Fallback: Process jobs using default handler
                    await this.handleNewJobs(data.jobs);
                }
            } catch (error) {
                console.error('SignalR: Error processing new jobs', error);
            }
        });

        // Handle connection closed
        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.isConnected = false;
            chrome.storage.local.set({ signalRConnected: false });
        });

        // Handle reconnecting
        this.connection.onreconnecting((error) => {
            console.log('SignalR: Reconnecting...', error);
            this.isConnected = false;
            chrome.storage.local.set({ signalRConnected: false });
        });

        // Handle reconnected
        this.connection.onreconnected((connectionId) => {
            console.log('SignalR: Reconnected', connectionId);
            this.isConnected = true;
            chrome.storage.local.set({ signalRConnected: true });
        });
    }

    /**
     * Default handler for new jobs (NO HTTP REQUESTS - just process received data)
     */
    async handleNewJobs(jobs) {
        console.log(`SignalR: Processing ${jobs.length} new job(s) [ZERO HTTP REQUESTS]`);

        // Get current settings and seen jobs
        const data = await chrome.storage.local.get(['seenJobs', 'recentJobs', 'stats', 'settings']);
        let seenJobs = data.seenJobs || [];
        let recentJobs = data.recentJobs || [];
        let stats = data.stats || { todayCount: 0, todayDate: new Date().toDateString() };
        const settings = data.settings || {};

        // Reset today count if new day
        if (stats.todayDate !== new Date().toDateString()) {
            stats.todayCount = 0;
            stats.todayDate = new Date().toDateString();
        }

        const validJobs = [];

        for (const job of jobs) {
            // Skip if already seen
            if (seenJobs.includes(job.id)) {
                console.log(`SignalR: Skipping already seen job ${job.id}`);
                continue;
            }

            // Add to seen list
            seenJobs.push(job.id);

            // Server already sent complete data, just apply filters
            if (!applyFilters(job, settings)) {
                console.log(`SignalR: Filtering out job ${job.id}`);
                continue;
            }

            // Add to recent jobs with ALL data from server
            const existingIdx = recentJobs.findIndex(rj => rj.id === job.id);
            if (existingIdx !== -1) {
                recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
            } else {
                recentJobs.unshift(job);
            }

            validJobs.push(job);
        }

        // Update storage
        stats.lastCheck = new Date().toISOString();
        stats.todayCount += validJobs.length;

        // Keep only last 500 seen jobs
        if (seenJobs.length > 500) {
            seenJobs = seenJobs.slice(-500);
        }

        // Keep only last 50 recent jobs
        recentJobs.sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idB - idA;
        });
        recentJobs = recentJobs.slice(0, 50);

        // Save to storage
        await chrome.storage.local.set({ seenJobs, stats, recentJobs });

        // Show notifications if we have valid jobs
        if (validJobs.length > 0) {
            // Check quiet hours
            if (settings.quietHoursEnabled && isQuietHour(settings)) {
                console.log('SignalR: Quiet Hours active, suppressing notifications');
                return;
            }

            console.log(`SignalR: Showing notifications for ${validJobs.length} job(s) [NO HTTP REQUESTS MADE]`);

            // Show notifications (using existing notification logic)
            showNotification(validJobs);

            if (settings.sound) {
                playSound();
            }
        } else {
            console.log('SignalR: No valid jobs to notify after filtering');
        }
    }

    /**
     * Register a callback for when new jobs are received
     */
    onNewJobs(callback) {
        this.onNewJobsCallback = callback;
    }

    /**
     * Schedule a reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('SignalR: Max reconnect attempts reached. Please restart the extension.');
            return;
        }

        this.reconnectAttempts++;
        console.log(`SignalR: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);

        setTimeout(() => {
            console.log('SignalR: Attempting to reconnect...');
            this.connect();
        }, this.reconnectDelay);
    }

    /**
     * Disconnect from the hub
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
     * Send a ping to the server (optional - for testing)
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
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            state: this.connection?.state || 'Disconnected',
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

// Helper function for quiet hours (imported from background.js logic)
function isQuietHour(settings) {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
    const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
}

// Create global instance
const signalRClient = new SignalRClient();
