using Amballegaard.Simulation;
using Amballegaard.Simulation.House;
using Microsoft.AspNetCore.SignalR;

namespace Amballegaard.Server;

/// <summary>Klient → server: tidsstyring. Server → klient: "snapshot" (se SimulationHost).</summary>
public sealed class WorldHub(World world, SimulationGate gate) : Hub
{
    public IEnumerable<AgentInfo> GetAgents() => world.Agents.Select(a => a.ToInfo());

    public WorldSnapshot GetSnapshot()
    {
        lock (gate) return world.Snapshot();
    }

    public void SetTimeScale(double scale)
    {
        lock (gate) world.TimeScale = Math.Clamp(scale, 0, 3600);
    }

    public void SetPaused(bool paused)
    {
        lock (gate) world.Paused = paused;
    }

    public bool MoveAgent(string id, double x, double z)
    {
        lock (gate) return world.MoveAgent(id, new Vec2(x, z));
    }

    public bool SetAgentActive(string id, bool active)
    {
        lock (gate) return world.SetActive(id, active);
    }

    public void PickUpAgent(string id)
    {
        lock (gate) world.PickUp(id);
    }

    public void JumpToTimeOfDay(double hours)
    {
        lock (gate) world.JumpToTimeOfDay(hours);
    }

    public void SetObstacles(List<ObstacleRect> rects)
    {
        lock (gate) world.SetObstacles(rects.Select(r => (new Vec2(Math.Min(r.X0, r.X1), Math.Min(r.Z0, r.Z1)), new Vec2(Math.Max(r.X0, r.X1), Math.Max(r.Z0, r.Z1)))));
    }

    public bool ToggleMower()
    {
        lock (gate) { world.Mower.Toggle(); return world.Mower.On; }
    }

    public bool ToggleDoor(string openingId)
    {
        lock (gate) return world.ToggleDoor(openingId);
    }
}
