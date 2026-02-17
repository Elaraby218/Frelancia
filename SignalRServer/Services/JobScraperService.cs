using Microsoft.AspNetCore.SignalR;
using MostaqlJobNotifier.Hubs;
using MostaqlJobNotifier.Models;
using HtmlAgilityPack;

namespace MostaqlJobNotifier.Services
{
    /// <summary>
    /// Background service that scrapes Mostaql.com for new ASP.NET Web API jobs
    /// When new jobs are detected, notifies all connected clients via SignalR
    /// </summary>
    public class JobScraperService : BackgroundService, IJobScraperService
    {
        private readonly ILogger<JobScraperService> _logger;
        private readonly IHubContext<JobNotificationHub> _hubContext;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly HashSet<string> _seenJobIds = new();
        private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(1); // Check every minute

        public JobScraperService(
            ILogger<JobScraperService> logger,
            IHubContext<JobNotificationHub> hubContext,
            IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _hubContext = hubContext;
            _httpClientFactory = httpClientFactory;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Job Scraper Service started");

            // Wait a bit before first check to allow server to fully start
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CheckForNewJobsAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during job scraping cycle");
                }

                // Wait for the next check interval
                await Task.Delay(_checkInterval, stoppingToken);
            }

            _logger.LogInformation("Job Scraper Service stopped");
        }

        private async Task CheckForNewJobsAsync()
        {
            _logger.LogInformation("Checking for new jobs on Mostaql...");

            try
            {
                // Fetch ALL jobs from Mostaql (sorted by latest)
                const string url = "https://mostaql.com/projects?sort=latest";
                var jobs = await FetchJobsAsync(url);

                // Detect new jobs (not previously seen) - NO FILTERING, ALL JOBS
                var newJobs = jobs.Where(job => !_seenJobIds.Contains(job.Id)).ToList();

                if (newJobs.Any())
                {
                    _logger.LogInformation($"Found {newJobs.Count} new job(s)");

                    // Mark jobs as seen
                    foreach (var job in newJobs)
                    {
                        _seenJobIds.Add(job.Id);
                    }

                    // *** NEW: Fetch full details for each job BEFORE sending to clients ***
                    _logger.LogInformation("Fetching full details for new jobs...");
                    var enrichedJobs = new List<JobListing>();
                    
                    foreach (var job in newJobs)
                    {
                        try
                        {
                            var details = await FetchProjectDetailsAsync(job.Url);
                            if (details != null)
                            {
                                // Enrich job with full details
                                job.Description = details.Description;
                                job.HiringRate = details.HiringRate;
                                job.Status = details.Status;
                                job.Communications = details.Communications;
                                job.Duration = details.Duration;
                                job.RegistrationDate = details.RegistrationDate;
                                
                                if (string.IsNullOrEmpty(job.Budget) || job.Budget == "غير محدد")
                                {
                                    job.Budget = details.Budget;
                                }
                            }
                            enrichedJobs.Add(job);
                            _logger.LogInformation($"Enriched job {job.Id}: {job.Title}");
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, $"Error fetching details for job {job.Id}");
                            // Still add job even if details fetch fails
                            enrichedJobs.Add(job);
                        }
                    }

                    // Notify all connected clients with COMPLETE data
                    await NotifyClientsAsync(enrichedJobs);
                }
                else
                {
                    _logger.LogInformation("No new jobs found");
                }

                // Cleanup: Keep only last 500 job IDs to prevent memory growth
                if (_seenJobIds.Count > 500)
                {
                    var toRemove = _seenJobIds.Take(_seenJobIds.Count - 500).ToList();
                    foreach (var id in toRemove)
                    {
                        _seenJobIds.Remove(id);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking for new jobs");
            }
        }

        private async Task<List<JobListing>> FetchJobsAsync(string url)
        {
            var jobs = new List<JobListing>();
            var client = _httpClientFactory.CreateClient();
            
            // Add headers to mimic a browser request
            client.DefaultRequestHeaders.Add("User-Agent", 
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            client.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            client.DefaultRequestHeaders.Add("Accept-Language", "ar,en;q=0.9");

            // Add cache buster
            var fetchUrl = $"{url}&_cb={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

            var response = await client.GetAsync(fetchUrl);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning($"HTTP request failed with status {response.StatusCode}");
                return jobs;
            }

            var html = await response.Content.ReadAsStringAsync();
            
            // Parse HTML using HtmlAgilityPack
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            // Strategy 1: Table rows (classic view)
            var rows = doc.DocumentNode.SelectNodes("//tr[.//a[contains(@href, '/project/')]]");
            if (rows != null)
            {
                foreach (var row in rows)
                {
                    var link = row.SelectSingleNode(".//a[contains(@href, '/project/')]");
                    if (link != null)
                    {
                        var href = link.GetAttributeValue("href", "");
                        var idMatch = System.Text.RegularExpressions.Regex.Match(href, @"/project/(\d+)");
                        
                        if (idMatch.Success)
                        {
                            var id = idMatch.Groups[1].Value;
                            var title = link.InnerText.Trim();
                            
                            var budgetCell = row.SelectSingleNode(".//td[4]");
                            var budget = budgetCell?.InnerText.Trim() ?? "غير محدد";
                            
                            var timeCell = row.SelectSingleNode(".//td[5]");
                            var time = timeCell?.InnerText.Trim() ?? "";

                            jobs.Add(new JobListing
                            {
                                Id = id,
                                Title = CleanText(title),
                                Budget = CleanText(budget),
                                Time = CleanText(time),
                                Url = href.StartsWith("http") ? href : $"https://mostaql.com{href}"
                            });
                        }
                    }
                }
            }

            // Strategy 2: Cards (grid view) - if no rows found
            if (jobs.Count == 0)
            {
                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class, 'card') or contains(@class, 'project')]//a[contains(@href, '/project/')]");
                if (cards != null)
                {
                    foreach (var link in cards)
                    {
                        var href = link.GetAttributeValue("href", "");
                        var idMatch = System.Text.RegularExpressions.Regex.Match(href, @"/project/(\d+)");
                        
                        if (idMatch.Success)
                        {
                            var id = idMatch.Groups[1].Value;
                            var title = link.InnerText.Trim();
                            
                            if (title.Length > 5) // Ensure it's a real title, not an icon
                            {
                                jobs.Add(new JobListing
                                {
                                    Id = id,
                                    Title = CleanText(title),
                                    Budget = "غير محدد",
                                    Time = "",
                                    Url = href.StartsWith("http") ? href : $"https://mostaql.com{href}"
                                });
                            }
                        }
                    }
                }
            }

            return jobs.DistinctBy(j => j.Id).ToList();
        }

        private async Task<JobDetails?> FetchProjectDetailsAsync(string url)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Add("User-Agent", 
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                client.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                client.DefaultRequestHeaders.Add("Accept-Language", "ar,en;q=0.9");

                var response = await client.GetAsync(url);
                
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                var html = await response.Content.ReadAsStringAsync();
                var doc = new HtmlDocument();
                doc.LoadHtml(html);

                var details = new JobDetails();

                // Extract Status
                var statusLabel = doc.DocumentNode.SelectSingleNode("//span[contains(@class, 'label-prj')]");
                details.Status = statusLabel?.InnerText.Trim() ?? "غير معروف";

                // Extract Description
                var descriptionEl = doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'project-post__body')]");
                details.Description = descriptionEl?.InnerText.Trim() ?? "";

                // Extract metadata from table rows
                var metaRows = doc.DocumentNode.SelectNodes("//tr[contains(@class, 'meta-row')] | //table[contains(@class, 'table-meta')]//tr");
                if (metaRows != null)
                {
                    foreach (var row in metaRows)
                    {
                        var text = row.InnerText;
                        var valueCell = row.SelectSingleNode(".//td[contains(@class, 'meta-value')] | .//td[last()]");
                        
                        if (valueCell == null) continue;

                        if (text.Contains("التواصلات الجارية"))
                        {
                            details.Communications = valueCell.InnerText.Trim();
                        }
                        else if (text.Contains("معدل التوظيف"))
                        {
                            details.HiringRate = valueCell.InnerText.Trim();
                        }
                        else if (text.Contains("مدة التنفيذ"))
                        {
                            details.Duration = valueCell.InnerText.Trim();
                        }
                        else if (text.Contains("الميزانية"))
                        {
                            details.Budget = valueCell.InnerText.Trim();
                        }
                        else if (text.Contains("تاريخ التسجيل"))
                        {
                            details.RegistrationDate = valueCell.InnerText.Trim();
                        }
                    }
                }

                return details;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching project details from {url}");
                return null;
            }
        }

        private bool IsAspNetWebApiJob(JobListing job)
        {
            // Check for ASP.NET Web API related keywords
            var keywords = new[]
            {
                "asp.net",
                "asp .net",
                "aspnet",
                "web api",
                "webapi",
                ".net core",
                "dotnet",
                "c#",
                "csharp"
            };

            var searchText = (job.Title + " " + (job.Description ?? "")).ToLower();
            
            return keywords.Any(keyword => searchText.Contains(keyword));
        }

        private async Task NotifyClientsAsync(List<JobListing> newJobs)
        {
            try
            {
                // Send notification to all connected clients
                await _hubContext.Clients.All.SendAsync("NewJobsDetected", new
                {
                    timestamp = DateTime.UtcNow,
                    count = newJobs.Count,
                    jobs = newJobs.Select(j => new
                    {
                        id = j.Id,
                        title = j.Title,
                        budget = j.Budget,
                        time = j.Time,
                        url = j.Url,
                        description = j.Description,
                        hiringRate = j.HiringRate,
                        status = j.Status,
                        communications = j.Communications,
                        duration = j.Duration,
                        registrationDate = j.RegistrationDate
                    })
                });

                _logger.LogInformation($"Notified all clients about {newJobs.Count} new job(s)");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error notifying clients");
            }
        }

        private string CleanText(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return text;

            return System.Net.WebUtility.HtmlDecode(text)
                .Replace("\n", " ")
                .Replace("\r", " ")
                .Replace("\t", " ")
                .Trim();
        }
    }
}
