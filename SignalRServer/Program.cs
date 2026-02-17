using Microsoft.AspNetCore.SignalR;
using MostaqlJobNotifier.Hubs;
using MostaqlJobNotifier.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add SignalR
builder.Services.AddSignalR();

// Add CORS for browser extension and local testing
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowExtension", policy =>
    {
        policy.SetIsOriginAllowed(_ => true) // Allow all origins (dev mode)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Add background job scraper service
builder.Services.AddHostedService<JobScraperService>();
builder.Services.AddSingleton<IJobScraperService, JobScraperService>();

// Add HttpClient for web scraping
builder.Services.AddHttpClient();

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Disable HTTPS redirection for SignalR to work with HTTP connections
// app.UseHttpsRedirection();
app.UseCors("AllowExtension");
app.UseAuthorization();

app.MapControllers();
app.MapHub<JobNotificationHub>("/jobNotificationHub");

app.Run();
