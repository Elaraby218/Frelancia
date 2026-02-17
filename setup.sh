#!/bin/bash

# Mostaql Job Notifier - SignalR Setup Script (Linux/Mac)

echo "========================================"
echo "Mostaql Job Notifier - SignalR Setup"
echo "========================================"
echo ""

# Step 1: Download SignalR library
echo "[1/3] Downloading SignalR client library..."
SIGNALR_URL="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"
SIGNALR_PATH="$(dirname "$0")/signalr.min.js"

if [ -f "$SIGNALR_PATH" ]; then
    echo "  ✓ SignalR library already exists"
else
    if curl -sSL "$SIGNALR_URL" -o "$SIGNALR_PATH"; then
        echo "  ✓ Downloaded signalr.min.js"
    else
        echo "  ✗ Failed to download SignalR library"
        echo "  Please download manually from: $SIGNALR_URL"
        echo "  Save as: signalr.min.js in the extension root"
        exit 1
    fi
fi

echo ""

# Step 2: Check .NET SDK
echo "[2/3] Checking .NET SDK..."
if command -v dotnet &> /dev/null; then
    DOTNET_VERSION=$(dotnet --version)
    echo "  ✓ .NET SDK version: $DOTNET_VERSION"
else
    echo "  ✗ .NET SDK not found"
    echo "  Please install .NET 8.0 SDK from: https://dotnet.microsoft.com/download"
    exit 1
fi

echo ""

# Step 3: Start the server
echo "[3/3] Starting SignalR server..."
SERVER_PATH="$(dirname "$0")/SignalRServer"

if [ ! -d "$SERVER_PATH" ]; then
    echo "  ✗ Server directory not found: $SERVER_PATH"
    exit 1
fi

echo "  → Navigating to server directory..."
cd "$SERVER_PATH"

echo "  → Restoring dependencies..."
dotnet restore

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Starting the server..."
echo ""
echo "Server will be available at:"
echo "  • http://localhost:5000"
echo "  • https://localhost:5001"
echo ""
echo "SignalR Hub endpoint:"
echo "  • http://localhost:5000/jobNotificationHub"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Run the server
dotnet run
