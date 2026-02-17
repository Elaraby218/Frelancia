namespace MostaqlJobNotifier.Services
{
    public interface IJobScraperService
    {
        Task StartAsync(CancellationToken cancellationToken);
        Task StopAsync(CancellationToken cancellationToken);
    }
}
