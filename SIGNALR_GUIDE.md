# SignalR Real-Time Job Notification System

## 📋 Overview

This system implements a **zero-request, server-driven, real-time notification architecture** using **SignalR** for Mostaql.com job notifications.

### Key Features:
✅ **Zero HTTP Requests** - The browser extension makes ZERO HTTP requests to Mostaql.com  
✅ **Server-Driven** - The server detects new jobs, fetches complete details, and pushes data  
✅ **Real-Time** - Instant notifications via WebSockets/Server-Sent Events  
✅ **Complete Data Transfer** - Server sends ALL job details (description, hiring rate, etc.)  
✅ **Client-Side Filtering** - Extension applies user filters locally on received data  
✅ **Preserved Logic** - Existing notification and filter logic remains unchanged  

---

## 🏗️ Architecture

### Before (Polling-Based)
```
Browser Extension → Polls every 1 minute → Mostaql.com → Parse HTML → Detect New Jobs → Show Notification
```

### After (SignalR-Based)
```
ASP.NET Server → Scrapes Mostaql.com every 1 minute → Detects New Jobs → Fetches Full Details
       ↓
   SignalR Hub (sends COMPLETE job data)
       ↓
Browser Extension (Connected) → Receives Complete Data → Applies Filters Locally → Show Notification
                                     [ZERO HTTP REQUESTS]
```

---

## 📁 Project Structure

```
Frelancia/
├── SignalRServer/                    # ASP.NET Core Web API Server
│   ├── Program.cs                    # Server entry point
│   ├── Hubs/
│   │   └── JobNotificationHub.cs     # SignalR hub for real-time messaging
│   ├── Services/
│   │   ├── IJobScraperService.cs
│   │   └── JobScraperService.cs      # Background service that scrapes Mostaql
│   ├── Models/
│   │   └── JobListing.cs             # Job data model
│   ├── MostaqlJobNotifier.csproj     # Project file
│   └── appsettings.json
│
├── background.js                      # Extension service worker (modified)
├── signalr-client.js                 # SignalR client implementation (NEW)
├── signalr.min.js                    # SignalR library (to be downloaded)
├── manifest.json                      # Extension manifest (updated)
├── content.js                         # Content script (unchanged)
├── popup.js                           # Popup UI (unchanged)
└── offscreen.js                       # Offscreen document (unchanged)
```

---

## 🚀 Setup Instructions

### Step 1: Download SignalR Client Library

You need to download the Microsoft SignalR JavaScript client library:

**Option A: Direct Download**
1. Visit: https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js
2. Save the file as `signalr.min.js` in the extension root directory

**Option B: Using npm**
```bash
npm install @microsoft/signalr
# Then copy node_modules/@microsoft/signalr/dist/browser/signalr.min.js to the extension root
```

### Step 2: Setup the SignalR Server

**Option A: Use Production Server (Recommended)**

The server is already deployed at:
```
https://frelancia.runasp.net/jobNotificationHub
```

No setup needed! The extension will connect automatically.

**Option B: Run Locally for Development**

1. **Navigate to the server directory:**
   ```bash
   cd SignalRServer
   ```

2. **Restore dependencies:**
   ```bash
   dotnet restore
   ```

3. **Run the server:**
   ```bash
   dotnet run
   ```

   The server will start at:
   - HTTP: `http://localhost:5000`
   - HTTPS: `https://localhost:5001`

   You should see:
   ```
   info: MostaqlJobNotifier.Services.JobScraperService[0]
         Job Scraper Service started
   ```

4. **Update the extension to use localhost:**
   Edit `signalr-client.js` and change:
   ```javascript
   this.serverUrl = 'http://localhost:5000/jobNotificationHub';
   ```

### Step 3: Install/Reload the Extension

1. Open Chrome and navigate to: `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the extension directory (Frelancia folder)
5. The extension will load and automatically connect to SignalR

### Step 4: Verify the Connection

1. Open the extension popup
2. Check the browser console (F12) → Service Worker / Background page
3. You should see:
   ```
   SignalR: Initializing connection to https://frelancia.runasp.net/jobNotificationHub
   SignalR: Connected successfully
   SignalR: Connection confirmed
   ```

---

## 🔧 How It Works

### Server-Side Flow (JobScraperService.cs)

1. **Background Service Starts** - Runs every 1 minute
2. **Fetches ALL Jobs from Mostaql.com** - Gets the latest jobs (sorted by newest)
3. **Detects New Jobs** - Compares against previously seen job IDs
4. **Fetches Complete Details** - For each new job, scrapes the full project page:
   - Description
   - Hiring rate (معدل التوظيف)
   - Status (الحالة)
   - Communications count (التواصلات الجارية)
   - Duration (مدة التنفيذ)
   - Budget (الميزانية)
   - Registration date (تاريخ التسجيل)
5. **Sends SignalR Notification** - Broadcasts COMPLETE data to all connected clients:
   ```javascript
   {
     timestamp: "2026-02-17T10:30:00Z",
     count: 2,
     jobs: [
       { 
         id: "12345", 
         title: "تطوير Web API بـ ASP.NET", 
         budget: "$500 - $800", 
         url: "...",
         description: "نحتاج إلى تطوير...",
         hiringRate: "85%",
         status: "مفتوح",
         communications: "2",
         duration: "5 أيام",
         registrationDate: "14 فبراير 2026"
       },
       { id: "12346", title: "...", ... }
     ]
   }
   ```

### Client-Side Flow (signalr-client.js)

1. **Extension Starts** - Automatically connects to SignalR hub
2. **Listens for Events** - Waits for `NewJobsDetected` event
3. **Receives Complete Data** - Gets ALL job details from server (description, hiring rate, status, etc.)
   - **NO HTTP REQUESTS made by the extension!** ✅
   - Server already scraped and sent complete data
4. **Applies Filters Locally** - Uses existing filter logic on received data:
   - Budget filter (minBudget)
   - Hiring rate filter (minHiringRate)
   - Keyword filters (include/exclude)
   - Duration filter (maxDuration)
   - Client age filter (minClientAge)
5. **Updates Storage** - Saves to seenJobs and recentJobs
6. **Shows Notification** - Uses the existing `showNotification()` function (unchanged) ✅
7. **Plays Sound** - Uses the existing `playSound()` function (unchanged) ✅

---

## 🔍 Key Requirements Met

### ✅ Requirement 1: Zero HTTP Requests from Extension
**"The browser extension should make ZERO HTTP requests to Mostaql.com for job detection."**

**Implementation:**
- The extension connects to SignalR hub once on startup
- All scraping is done by the server
- The server fetches job listings AND complete project details
- The extension only receives data via SignalR events
- **Extension makes ABSOLUTELY ZERO HTTP requests to Mostaql.com**

See [signalr-client.js](signalr-client.js#L115-L202) - The handleNewJobs() method processes received data without any HTTP calls.

### ✅ Requirement 2: Server Scrapes and Sends Complete Data
**"The server should detect new jobs and fetch all details before sending to clients."**

**Implementation:**
- Server scrapes Mostaql.com every 1 minute
- For each new job, server fetches the full project page
- Server extracts: description, hiring rate, status, communications, duration, budget, registration date
- Server sends COMPLETE data to all clients via SignalR
- No need for client to fetch additional details

See [JobScraperService.cs](SignalRServer/Services/JobScraperService.cs#L76-L115) - FetchProjectDetailsAsync() method.

### ✅ Requirement 3: Real-Time Notification Using SignalR
**"The browser extension must only register (connect) to the SignalR hub. Not send any polling or repeated HTTP requests."**

**Implementation:**
- Extension connects once on startup: `await signalRClient.connect()`
- No polling loops
- Server pushes notifications via `NewJobsDetected` event
- Automatic reconnection if connection drops
- Extension is purely event-driven

See [signalr-client.js](signalr-client.js#L21-L55)

### ✅ Requirement 4: Client-Side Filtering
**"Client applies user-configured filters on received data."**

**Implementation:**
- Server sends ALL new jobs (no server-side filtering)
- Client receives complete data and applies filters locally:
  - Budget range (minBudget)
  - Hiring rate (minHiringRate)
  - Include/exclude keywords
  - Duration limit (maxDuration)
  - Client account age (minClientAge)
- Only jobs passing filters trigger notifications

See [signalr-client.js](signalr-client.js#L142-L145) and [background.js](background.js#L340-L398) - applyFilters() function.

### ✅ Requirement 5: Existing Notification Logic Unchanged
**"The notification system should continue working without requiring any changes to the existing notification logic."**

**Implementation:**
- The same `showNotification()` function is called
- The same `playSound()` function is used
- The same `applyFilters()` function works
- The same storage mechanism (`seenJobs`, `recentJobs`, `stats`) is preserved

See [signalr-client.js](signalr-client.js#L195-L202)

---

## 🎛️ Configuration

### Server Configuration

Edit `SignalRServer/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "MostaqlJobNotifier.Services.JobScraperService": "Debug"
    }
  },
  "Urls": "http://localhost:5000;https://localhost:5001"
}
```

To change the server port, modify the `Urls` setting.

### Extension Configuration

Edit `signalr-client.js`:

```javascript
this.serverUrl = 'https://frelancia.runasp.net/jobNotificationHub';
```

**Current Production URL**: `https://frelancia.runasp.net/jobNotificationHub`

**For Local Development**: Use `http://localhost:5000/jobNotificationHub`

Change this URL if you deploy the server elsewhere.

You can also disable SignalR in the extension settings:
```javascript
// In popup or settings
chrome.storage.local.set({ settings: { signalREnabled: false } });
```

---

## 🧪 Testing

### Test SignalR Connection

1. **Start the server:**
   ```bash
   cd SignalRServer
   dotnet run
   ```

2. **Watch server logs:**
   You should see:
   ```
   info: MostaqlJobNotifier.Hubs.JobNotificationHub[0]
         Client connected: <connection-id>
   ```

3. **Check extension console:**
   ```
   SignalR: Connected successfully
   ```

### Simulate a New Job Notification

You can manually test the notification by temporarily modifying `JobScraperService.cs` to always send a test job:

```csharp
// In CheckForNewJobsAsync(), after detecting new jobs
var testJob = new JobListing
{
    Id = "test-" + DateTime.Now.Ticks,
    Title = "اختبار - تطوير Web API بـ ASP.NET Core",
    Budget = "$500 - $800",
    Url = "https://mostaql.com/projects",
    Description = "هذا مشروع تجريبي",
    HiringRate = "85%",
    Status = "مفتوح",
    Communications = "0",
    Duration = "5 أيام",
    RegistrationDate = DateTime.Now.ToString("dd MMMM yyyy", new System.Globalization.CultureInfo("ar"))
};

await NotifyClientsAsync(new List<JobListing> { testJob });
```

---

## 📊 Performance & Scaling

### Current Configuration
- **Server Poll Interval**: 1 minute
- **Extension HTTP Requests**: ZERO (completely event-driven)
- **Server Scraping**: Fetches ALL jobs + complete details for each new job
- **Max Stored Job IDs**: 500 (both server and client)
- **Reconnect Strategy**: Exponential backoff (2s, 10s, 30s, 60s max)
- **Data Transfer**: Complete job data sent in one SignalR event

### Performance Benefits
- **Zero Client Requests**: Extension makes no HTTP calls to Mostaql.com
- **Centralized Scraping**: One server scrapes for all connected clients
- **Real-Time Delivery**: Instant notification via WebSockets/SSE
- **Efficient Filtering**: Client filters locally without additional requests
- **Reduced Load**: Mostaql.com only sees requests from one server IP

### Scaling Considerations

If you need to support multiple users:

1. **Current Deployment**: Azure App Service (https://frelancia.runasp.net)
2. **Use Redis Backplane**: For SignalR scalability across multiple servers
3. **Add Authentication**: Secure the SignalR hub with JWT tokens
4. **Database Integration**: Store job history in SQL Server or MongoDB
5. **Rate Limiting**: Implement server-side rate limiting to prevent abuse

---

## 🛠️ Troubleshooting

### "SignalR client not available"
- Ensure `signalr.min.js` is downloaded and placed in the extension root
- Check browser console for script loading errors
- Verify `importScripts` in `background.js` succeeded

### "Connection failed" or "NET::ERR_CONNECTION_REFUSED"
- Make sure the server is running: `dotnet run`
- Check the server URL matches in `signalr-client.js`
- Verify `manifest.json` has localhost permissions

### "No new jobs detected"
- The server scrapes ALL jobs from Mostaql (not filtered)
- Only NEW jobs (not previously seen) are sent to clients
- Clients filter jobs based on user settings
- Check server logs for scraping errors:
  ```bash
  dotnet run --verbosity detailed
  ```
- Verify the server is actually finding new jobs by checking logs

### Extension doesn't connect on startup
- Service workers in Chrome can be suspended
- SignalR will auto-reconnect when the service worker wakes up
- You can manually trigger a connection check from the popup

---

## 🔄 Migration from Old System

The refactored system is **completely different from polling**:

- ❌ ~~Old system: Extension polls Mostaql every minute~~
- ✅ **New system: Extension makes ZERO requests, server pushes data**
- ✅ All existing filters, settings, and UI remain unchanged
- ✅ Notification logic is preserved
- ✅ You can still disable SignalR to test (though not recommended)

To disable SignalR (fallback to nothing):
```javascript
// In background.js
const SIGNALR_ENABLED = false;
```

**Note**: Disabling SignalR means NO job notifications at all, since the extension no longer polls Mostaql.

---

## 📝 Code Changes Summary

### Files Modified:
1. **manifest.json** - Added SignalR library references
2. **background.js** - Added SignalR initialization, imports SignalR client
3. **signalr-client.js** - Created SignalR client with zero-request job handling

### Server Files:
1. **SignalRServer/Program.cs** - Server entry point with CORS and SignalR configuration
2. **SignalRServer/Services/JobScraperService.cs** - Background service that:
   - Scrapes Mostaql.com every minute
   - Fetches complete details for each new job
   - Sends full data to all connected clients
3. **SignalRServer/Hubs/JobNotificationHub.cs** - SignalR hub for real-time messaging
4. **SignalRServer/Models/JobListing.cs** - Job data model with all properties

### Files Unchanged:
- ✅ **content.js** - No changes
- ✅ **popup.js** - No changes (UI remains the same)
- ✅ **offscreen.js** - No changes
- ✅ **chatgpt.js** - No changes
- ✅ **dashboard.js** - No changes (receives data from same storage)

### Key Implementation Details:
- **Server fetches complete data**: Description, hiring rate, status, communications, duration, budget, registration date
- **Client makes ZERO requests**: Receives complete data via SignalR
- **Client-side filtering**: All user filters applied locally on received data
- **Preserved notification logic**: Same showNotification(), playSound(), applyFilters() functions

---

## 🎯 Next Steps & Future Enhancements

### Immediate Testing:
1. ✅ Download `signalr.min.js` library (if not already done)
2. ✅ Extension connects to production server automatically
3. ✅ Test notifications with real Mostaql jobs

### Future Enhancements:
- [ ] Add SignalR connection status indicator in popup UI
- [ ] Support custom server URLs in settings (currently hardcoded)
- [ ] Add server-side filtering options (e.g., only send jobs matching certain criteria)
- [ ] Implement user authentication for secure connections
- [ ] Add per-user filter preferences on server side
- [ ] Track server performance metrics (jobs scraped, notifications sent, etc.)
- [ ] Add database persistence for job history
- [ ] Implement webhooks for integration with other services
- [ ] Add API endpoint for manual job refresh
- [ ] Support multiple Mostaql categories (currently only "latest")

---

## 📞 Support & Documentation

### Key Files to Reference:
- **Architecture**: This file (SIGNALR_GUIDE.md)
- **Server Setup**: SignalRServer/Program.cs
- **Client Logic**: signalr-client.js
- **API Reference**: https://docs.microsoft.com/en-us/aspnet/core/signalr/

### Debugging Tips:
1. **Server Logs**: Watch the console output from `dotnet run`
2. **Extension Logs**: Check the service worker console in `chrome://extensions/`
3. **Network Tab**: Monitor WebSocket connections in DevTools
4. **SignalR Tracing**: Enable detailed logging in `appsettings.json`

---

## 📄 License

This project maintains the same license as the original extension.

---

**Last Updated**: February 17, 2026  
**Version**: 2.0.0 (SignalR Integration)
