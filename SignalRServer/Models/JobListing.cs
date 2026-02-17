namespace MostaqlJobNotifier.Models
{
    public class JobListing
    {
        public string Id { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Budget { get; set; } = string.Empty;
        public string Time { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? HiringRate { get; set; }
        public string? Status { get; set; }
        public string? Communications { get; set; }
        public string? Duration { get; set; }
        public string? RegistrationDate { get; set; }
    }

    public class JobDetails
    {
        public string Description { get; set; } = string.Empty;
        public string HiringRate { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Communications { get; set; } = string.Empty;
        public string Duration { get; set; } = string.Empty;
        public string Budget { get; set; } = string.Empty;
        public string RegistrationDate { get; set; } = string.Empty;
    }
}
