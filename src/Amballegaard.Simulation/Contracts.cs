using Amballegaard.Simulation.Agents;

namespace Amballegaard.Simulation;

/// <summary>Det klienten modtager over SignalR.</summary>
public sealed record AgentInfo(string Id, string Name, string Kind, Appearance Appearance, string HomeRoomId);

public sealed record AgentState(string Id, double X, double Z, double Heading, string RoomId, string Activity, string? Speech);

public sealed record MowerSnapshot(double X, double Z, double Heading, string State, bool On);

public sealed record WorldSnapshot(double SimSeconds, double TimeScale, bool Paused, IReadOnlyList<AgentState> Agents, IReadOnlyList<string> OpenDoors, MowerSnapshot Mower);

/// <summary>Et møbels fodaftryk på gulvet (akse-rettet, meter).</summary>
public sealed record ObstacleRect(string Id, double X0, double Z0, double X1, double Z1);

public static class WorldContracts
{
    public static AgentInfo ToInfo(this Agent a) =>
        new(a.Id, a.Name, a.Kind.ToString().ToLowerInvariant(), a.Appearance, a.HomeRoomId);

    public static WorldSnapshot Snapshot(this World w) =>
        new(w.SimTime.TotalSeconds, w.TimeScale, w.Paused,
            w.Agents.Select(a => new AgentState(
                a.Id, Math.Round(a.Position.X, 3), Math.Round(a.Position.Z, 3),
                Math.Round(a.Heading, 3), a.RoomId, a.Activity, a.Speech)).ToList(),
            w.OpenDoors.ToList(),
            new MowerSnapshot(Math.Round(w.Mower.Position.X, 3), Math.Round(w.Mower.Position.Z, 3), Math.Round(w.Mower.Heading, 3),
                w.Mower.State.ToString().ToLowerInvariant(), w.Mower.On));
}
