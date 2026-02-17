using Microsoft.AspNetCore.SignalR;

namespace MostaqlJobNotifier.Hubs
{
    /// <summary>
    /// SignalR Hub for real-time job notifications
    /// Clients (browser extensions) connect here to receive instant notifications
    /// </summary>
    public class JobNotificationHub : Hub
    {
        private readonly ILogger<JobNotificationHub> _logger;

        public JobNotificationHub(ILogger<JobNotificationHub> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Called when a client connects to the hub
        /// </summary>
        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation($"Client connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
            
            // Send a welcome message to confirm connection
            await Clients.Caller.SendAsync("Connected", new 
            { 
                connectionId = Context.ConnectionId,
                timestamp = DateTime.UtcNow,
                message = "Successfully connected to Job Notification Hub"
            });
        }

        /// <summary>
        /// Called when a client disconnects
        /// </summary>
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation($"Client disconnected: {Context.ConnectionId}");
            
            if (exception != null)
            {
                _logger.LogError(exception, "Client disconnected with error");
            }
            
            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Client can call this to verify the connection is alive (optional ping)
        /// </summary>
        public async Task Ping()
        {
            await Clients.Caller.SendAsync("Pong", DateTime.UtcNow);
        }
    }
}
