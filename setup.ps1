# Automated Setup Script
# Run this script to download SignalR library and start the server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Mostaql Job Notifier - SignalR Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Download SignalR library
Write-Host "[1/3] Downloading SignalR client library..." -ForegroundColor Yellow
$signalrUrl = "https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"
$signalrPath = Join-Path $PSScriptRoot "signalr.min.js"

try {
    if (Test-Path $signalrPath) {
        Write-Host "  ✓ SignalR library already exists" -ForegroundColor Green
    } else {
        Invoke-WebRequest -Uri $signalrUrl -OutFile $signalrPath
        Write-Host "  ✓ Downloaded signalr.min.js" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✗ Failed to download SignalR library" -ForegroundColor Red
    Write-Host "  Please download manually from: $signalrUrl" -ForegroundColor Yellow
    Write-Host "  Save as: signalr.min.js in the extension root" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Check .NET SDK
Write-Host "[2/3] Checking .NET SDK..." -ForegroundColor Yellow
try {
    $dotnetVersion = dotnet --version
    Write-Host "  ✓ .NET SDK version: $dotnetVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ .NET SDK not found" -ForegroundColor Red
    Write-Host "  Please install .NET 8.0 SDK from: https://dotnet.microsoft.com/download" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 3: Start the server
Write-Host "[3/3] Starting SignalR server..." -ForegroundColor Yellow
$serverPath = Join-Path $PSScriptRoot "SignalRServer"

if (-not (Test-Path $serverPath)) {
    Write-Host "  ✗ Server directory not found: $serverPath" -ForegroundColor Red
    exit 1
}

Write-Host "  → Navigating to server directory..." -ForegroundColor Cyan
Set-Location $serverPath

Write-Host "  → Restoring dependencies..." -ForegroundColor Cyan
dotnet restore

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Starting the server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Server will be available at:" -ForegroundColor Cyan
Write-Host "  • http://localhost:5000" -ForegroundColor White
Write-Host "  • https://localhost:5001" -ForegroundColor White
Write-Host ""
Write-Host "SignalR Hub endpoint:" -ForegroundColor Cyan
Write-Host "  • http://localhost:5000/jobNotificationHub" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Run the server
dotnet run
