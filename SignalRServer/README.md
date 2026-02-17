# Mostaql Job Notifier - SignalR Server

ASP.NET Core Web API server with SignalR for real-time job notifications.

## 🎯 Purpose

This server continuously monitors Mostaql.com for new ASP.NET Web API job postings and pushes instant notifications to connected browser extensions via SignalR.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ASP.NET Core Server                      │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │ JobScraperService│────────▶│  JobNotificationHub     │  │
│  │ (Background)     │         │  (SignalR)              │  │
│  │                  │         │                         │  │
│  │ • Scrapes        │         │ • WebSocket             │  │
│  │   Mostaql.com    │         │ • SSE Fallback          │  │
│  │ • Detects new    │         │ • Long Polling          │  │
│  │   ASP.NET jobs   │         │                         │  │
│  │ • Every 1 minute │         │                         │  │
│  └──────────────────┘         └─────────────────────────┘  │
│                                        │                    │
└────────────────────────────────────────┼────────────────────┘
                                         │
                                         ▼
                            ┌────────────────────────┐
                            │  Browser Extensions    │
                            │  (SignalR Clients)     │
                            └────────────────────────┘
```

## 📦 Components

### 1. JobNotificationHub.cs
SignalR hub that manages client connections and broadcasts notifications.

**Events:**
- `Connected` - Sent to client on successful connection
- `NewJobsDetected` - Broadcast when new jobs are found
- `Pong` - Response to client ping (heartbeat)

### 2. JobScraperService.cs
Background service that runs continuously to scrape Mostaql.com.

**Workflow:**
1. Fetch development category page
2. Parse HTML using HtmlAgilityPack
3. Filter for ASP.NET-related keywords
4. Compare against previously seen job IDs
5. Notify connected clients via SignalR

### 3. JobListing.cs
Data model representing a job posting.

**Properties:**
- Id
- Title  
- Budget
- Time
- Url
- Description (optional)

## 🚀 Getting Started

### Prerequisites
- .NET 8.0 SDK or later
- Visual Studio 2022 / VS Code / Rider (optional)

### Installation

1. **Restore dependencies:**
   ```bash
   dotnet restore
   ```

2. **Build the project:**
   ```bash
   dotnet build
   ```

3. **Run the server:**
   ```bash
   dotnet run
   ```

4. **Server starts on:**
   - HTTP: `http://localhost:5000`
   - HTTPS: `https://localhost:5001`
   - SignalR Hub: `/jobNotificationHub`

### Configuration

Edit `appsettings.json` to customize:

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

## 🔧 Development

### Run in Development Mode
```bash
dotnet run --environment Development
```

### Watch Mode (auto-reload on changes)
```bash
dotnet watch run
```

### Run Tests (if implemented)
```bash
dotnet test
```

## 📡 API Reference

### SignalR Hub Endpoint
```
ws://localhost:5000/jobNotificationHub
```

### Hub Methods

#### Client → Server

**Ping()**  
Send a heartbeat to verify connection.

```javascript
await connection.invoke('Ping');
```

#### Server → Client

**Connected(data)**  
Confirmation message sent when client connects.

```javascript
connection.on('Connected', (data) => {
  console.log('Connected:', data);
});
```

**NewJobsDetected(data)**  
Notification of new jobs.

```javascript
connection.on('NewJobsDetected', (data) => {
  console.log('New jobs:', data.jobs);
});
```

**Example Payload:**
```json
{
  "timestamp": "2026-02-17T10:30:00Z",
  "count": 2,
  "jobs": [
    {
      "id": "12345",
      "title": "تطوير Web API بـ ASP.NET Core",
      "budget": "$500 - $800",
      "time": "منذ 5 دقائق",
      "url": "https://mostaql.com/project/12345"
    }
  ]
}
```

## 🧪 Testing

### Test with Browser Console

Connect directly from browser DevTools:

```javascript
const connection = new signalR.HubConnectionBuilder()
  .withUrl("http://localhost:5000/jobNotificationHub")
  .build();

connection.on("NewJobsDetected", (data) => {
  console.log("New jobs:", data);
});

await connection.start();
console.log("Connected!");
```

### Test with Postman/Insomnia
SignalR connections can't be tested with REST clients. Use the browser extension or a SignalR test client.

## 📊 Monitoring

### View Logs
Logs are written to the console and can be configured for file/database output.

**Example Log Output:**
```
info: MostaqlJobNotifier.Services.JobScraperService[0]
      Checking for new ASP.NET Web API jobs...
info: MostaqlJobNotifier.Services.JobScraperService[0]
      Found 2 new ASP.NET Web API job(s)
info: MostaqlJobNotifier.Services.JobScraperService[0]
      Notified all clients about 2 new job(s)
```

### Performance Metrics
- **Scrape Interval**: 1 minute
- **Job Detection**: Real-time
- **Notification Latency**: < 1 second (WebSocket)
- **Fallback Latency**: < 5 seconds (SSE/Long Polling)

## 🔒 Security Considerations

### Current Setup (Development)
- ✅ CORS enabled for all origins (chrome-extension://)
- ✅ No authentication required
- ⚠️ Suitable for local development only

### Production Recommendations
- [ ] Implement JWT authentication
- [ ] Restrict CORS to specific origins
- [ ] Use HTTPS only
- [ ] Add rate limiting
- [ ] Implement Redis backplane for scaling
- [ ] Add logging to Application Insights or Serilog

## 🚀 Deployment

### Deploy to Azure App Service

1. **Publish the app:**
   ```bash
   dotnet publish -c Release -o ./publish
   ```

2. **Create Azure App Service:**
   ```bash
   az webapp create --name mostaql-notifier --resource-group MyResourceGroup --plan MyPlan
   ```

3. **Deploy:**
   ```bash
   az webapp deployment source config-zip --resource-group MyResourceGroup --name mostaql-notifier --src ./publish.zip
   ```

4. **Update client URL:**
   Edit `signalr-client.js` in the extension:
   ```javascript
   this.serverUrl = 'https://mostaql-notifier.azurewebsites.net/jobNotificationHub';
   ```

### Deploy to Docker

1. **Create Dockerfile:**
   ```dockerfile
   FROM mcr.microsoft.com/dotnet/aspnet:8.0
   WORKDIR /app
   COPY ./publish .
   ENTRYPOINT ["dotnet", "MostaqlJobNotifier.dll"]
   ```

2. **Build and run:**
   ```bash
   docker build -t mostaql-notifier .
   docker run -p 5000:80 mostaql-notifier
   ```

## 📖 Dependencies

- **Microsoft.AspNetCore.SignalR** - Real-time communication
- **HtmlAgilityPack** - HTML parsing for web scraping
- **Swashbuckle.AspNetCore** - API documentation (Swagger)

## 🛠️ Troubleshooting

### Jobs not being detected
- Check server logs for scraping errors
- Verify Mostaql.com is accessible
- Check if job titles contain ASP.NET keywords

### Clients not receiving notifications
- Verify SignalR hub is running
- Check CORS configuration
- Ensure WebSocket is not blocked by firewall

### High CPU/Memory usage
- Adjust scrape interval (increase delay)
- Reduce job history retention (currently 500 jobs)
- Implement pagination for large result sets

## 📝 License

Same as the parent project.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

**Server Version**: 1.0.0  
**Last Updated**: February 17, 2026
