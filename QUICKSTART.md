# Quick Start Guide - SignalR Real-Time Notifications

## 🚀 3-Step Setup

### Step 1: Download SignalR Library (2 minutes)

Download the SignalR JavaScript client:
- **Direct Link**: https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js
- Save as `signalr.min.js` in the extension root folder

### Step 2: Start the Server (1 minute)

Open PowerShell/Terminal in the project folder:

```powershell
cd SignalRServer
dotnet restore
dotnet run
```

**Expected output:**
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5000
info: MostaqlJobNotifier.Services.JobScraperService[0]
      Job Scraper Service started
```

✅ Server is ready!

### Step 3: Load the Extension (1 minute)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the extension folder
5. Done! The extension auto-connects to SignalR

---

## ✅ Verify It's Working

### Check Server Console:
```
info: MostaqlJobNotifier.Hubs.JobNotificationHub[0]
      Client connected: <some-id>
```

### Check Extension Console:
1. Go to `chrome://extensions/`
2. Click **Details** on your extension
3. Click **Inspect views: service worker**
4. Look for:
```javascript
SignalR: Initializing connection to http://localhost:5000/jobNotificationHub
SignalR: Connected successfully
```

---

## 🎯 How It Works (Simple Overview)

**Old Way (Polling):**
```
Extension checks Mostaql.com every 1 minute → Slow, uses bandwidth
```

**New Way (SignalR):**
```
Server monitors Mostaql.com → Detects ASP.NET job → Pushes to Extension → Instant notification! ⚡
```

---

## 🛠️ Common Issues

### "signalr.min.js not found"
➡️ Download the library from the link in Step 1 above

### "Server not running" / Connection refused
➡️ Make sure you ran `dotnet run` in the SignalRServer folder

### "No ASP.NET jobs detected"
➡️ The server only notifies for ASP.NET Web API related jobs (keywords: asp.net, web api, c#, .net core)

---

## 📖 Full Documentation

See [SIGNALR_GUIDE.md](SIGNALR_GUIDE.md) for complete details on:
- Architecture
- Configuration
- Testing
- Troubleshooting
- Code changes

---

## 🎉 That's It!

Your extension now receives real-time notifications via SignalR! 

**No more polling** → **Server-driven** → **Instant notifications** 🚀
