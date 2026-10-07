using System.Diagnostics;
using Amballegaard.Simulation;
using Microsoft.AspNetCore.SignalR;

namespace Amballegaard.Server;

/// <summary>Kører verdenen med fast tick (10 Hz) og sender snapshots til alle klienter (5 Hz).</summary>
public sealed class SimulationHost(World world, SimulationGate gate, IHubContext<WorldHub> hub, ILogger<SimulationHost> log)
    : BackgroundService
{
    private const double TickHz = 10;
    private const int BroadcastEvery = 2;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        log.LogInformation("Simulation startet med {Count} beboere", world.Agents.Count);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1 / TickHz));
        var clock = Stopwatch.StartNew();
        var last = clock.Elapsed.TotalSeconds;
        long tick = 0;

        while (await timer.WaitForNextTickAsync(ct))
        {
            var now = clock.Elapsed.TotalSeconds;
            WorldSnapshot? snapshot = null;
            lock (gate)
            {
                world.Tick(Math.Min(now - last, 0.5));
                if (++tick % BroadcastEvery == 0) snapshot = world.Snapshot();
            }
            last = now;

            if (snapshot is not null)
                await hub.Clients.All.SendAsync("snapshot", snapshot, ct);
        }
    }
}

/// <summary>Lås, der deles mellem simulationstråden og hub-kald.</summary>
public sealed class SimulationGate;
