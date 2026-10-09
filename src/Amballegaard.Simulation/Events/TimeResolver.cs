using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Events;

/// <summary>
/// Analytisk tilstands-resolve ved tidsspring (jf. dagsplan-motor.md §13.2–§13.5).
/// Beregner geometrisk hvor hver beboer befinder sig på måltidspunktet ud fra event-grafen,
/// uden at simulere tick-for-tick.
/// </summary>
public static class TimeResolver
{
    private static readonly HashSet<string> ParkedActivities = new(StringComparer.OrdinalIgnoreCase)
    {
        "sleeping", "eating", "tidying"
    };

    public static void Resolve(
        World world,
        TimeSpan targetSimTime,
        IReadOnlyDictionary<(string Person, string Id), EventNode> nodes,
        Random rng)
    {
        var day = (int)Math.Floor(targetSimTime.TotalDays);
        var timeOfDay = targetSimTime - TimeSpan.FromDays(day);

        foreach (var agent in world.Agents.Where(a => a.Active))
        {
            var resolved = ResolveAgent(world, agent, day, timeOfDay, nodes);
            if (!resolved)
            {
                // §13.4 & §13.5: Fallback for frit vandrende beboere
                if (!ParkedActivities.Contains(agent.Activity))
                {
                    // Roaming (idle/walk) -> teleportér til tilfældigt gyldigt punkt, så springet ses
                    var randomRoom = world.House.Rooms[rng.Next(world.House.Rooms.Count)];
                    var pt = Geometry.RandomPointIn(randomRoom, rng);
                    agent.Position = world.Nav.NearestWalkable(pt) ?? pt;
                    agent.RoomId = randomRoom.Id;
                    agent.WanderRoomId = randomRoom.Id;
                    agent.Activity = "idle";
                    world.ClearAgentPath(agent);
                }
            }
        }
    }

    private static bool ResolveAgent(
        World world,
        Agent agent,
        int day,
        TimeSpan timeOfDay,
        IReadOnlyDictionary<(string Person, string Id), EventNode> nodes)
    {
        // Find alle tidstriggede rod-noder for denne person
        var rootNodes = nodes.Values
            .Where(n => n.Person == agent.Id && n.Trigger.Type == "time" && !string.IsNullOrWhiteSpace(n.Trigger.Value))
            .OrderBy(n => TimeTriggerTracker.TryParseTimeOfDay(n.Trigger.Value!, out var t) ? t : TimeSpan.Zero)
            .ToList();

        EventNode? activeChainRoot = null;
        TimeSpan activeChainStartTime = TimeSpan.Zero;

        foreach (var root in rootNodes)
        {
            if (TimeTriggerTracker.TryParseTimeOfDay(root.Trigger.Value!, out var scheduled) && scheduled <= timeOfDay)
            {
                activeChainRoot = root;
                activeChainStartTime = scheduled;
            }
        }

        if (activeChainRoot is null) return false;

        // Gennemløb kæden analytisk og akkumulér varigheder
        var current = activeChainRoot;
        var accumulatedTime = activeChainStartTime;
        var currentPos = agent.Position;

        while (current is not null)
        {
            var duration = EstimateNodeDuration(world, agent, current, currentPos, day, out var nextPos, out var path);

            if (timeOfDay >= accumulatedTime && timeOfDay < accumulatedTime + duration)
            {
                // Noden er aktiv ved måltidspunktet!
                ApplyActiveState(world, agent, current, accumulatedTime, timeOfDay, duration, path, currentPos, nextPos);
                return true;
            }

            accumulatedTime += duration;
            currentPos = nextPos;

            // Gå videre til næste i oncomplete (samme person)
            var nextRef = current.Oncomplete.FirstOrDefault(r => r.Person == agent.Id);
            current = (nextRef is not null && nodes.TryGetValue((nextRef.Person, nextRef.Id), out var nextNode))
                ? nextNode
                : null;
        }

        // Kæden er afsluttet før måltidspunktet
        agent.Position = currentPos;
        world.ClearAgentPath(agent);
        return true;
    }

    private static TimeSpan EstimateNodeDuration(
        World world,
        Agent agent,
        EventNode node,
        Vec2 currentPos,
        int day,
        out Vec2 nextPos,
        out List<Vec2>? path)
    {
        nextPos = currentPos;
        path = null;
        var action = node.Action;

        switch (action.Type)
        {
            case "goto":
                Vec2? goal = null;
                if (action.Target?.Kind == "room")
                {
                    var room = world.House.Rooms.FirstOrDefault(r => r.Id == action.Target.Value);
                    if (room is not null)
                    {
                        var (min, max) = room.Bounds();
                        goal = world.Nav.NearestWalkable((min + max) * 0.5);
                    }
                }
                else if (action.Target?.Kind == "point")
                {
                    var app = world.House.Appliances.FirstOrDefault(a => a.Id == action.Target.Value);
                    if (app is not null) goal = app.Stand;
                }
                else if (action.Target?.Kind == "person")
                {
                    var other = world.Agents.FirstOrDefault(a => a.Id == action.Target.Value);
                    if (other is not null) goal = other.Position;
                }

                if (goal is { } g)
                {
                    path = world.Nav.FindPath(currentPos, g);
                    nextPos = g;
                    var dist = CalculatePathDistance(currentPos, path);
                    var seconds = dist / Math.Max(0.1, agent.Speed);
                    return TimeSpan.FromSeconds(seconds);
                }
                return TimeSpan.FromSeconds(1);

            case "wait":
                var waitSec = DeterministicJitter(day, node.Person, node.Id, node.Duration?.Min ?? action.Seconds ?? 2.0, node.Duration?.Max);
                return TimeSpan.FromSeconds(waitSec);

            case "chore":
                var choreSec = DeterministicJitter(day, node.Person, node.Id, node.Duration?.Min ?? 30.0, node.Duration?.Max);
                return TimeSpan.FromSeconds(choreSec);

            case "speak":
                return TimeSpan.FromSeconds(node.Duration?.Min ?? action.Seconds ?? 3.5);

            case "setState":
            case "interact":
                return TimeSpan.Zero;

            default:
                return TimeSpan.FromSeconds(1);
        }
    }

    private static void ApplyActiveState(
        World world,
        Agent agent,
        EventNode node,
        TimeSpan startTime,
        TimeSpan targetTime,
        TimeSpan duration,
        List<Vec2>? path,
        Vec2 startPos,
        Vec2 endPos)
    {
        world.ClearAgentPath(agent);
        agent.InEvent = true;
        agent.CurrentEventChain = node.Chain;

        if (node.Action.Type == "goto" && path is { Count: > 0 } && duration.TotalSeconds > 0)
        {
            var fraction = Math.Clamp((targetTime - startTime).TotalSeconds / duration.TotalSeconds, 0, 1);
            agent.Position = InterpolateAlongPath(startPos, path, fraction);
            agent.Activity = "walk";
        }
        else
        {
            agent.Position = endPos;
            agent.Activity = node.Action.Activity ?? (node.Action.Type == "chore" ? "tidying" : "idle");
        }

        agent.RoomId = world.House.RoomAt(agent.Position)?.Id ?? "";
    }

    private static double CalculatePathDistance(Vec2 start, List<Vec2>? path)
    {
        if (path is null || path.Count == 0) return 0;
        double total = 0;
        var prev = start;
        foreach (var p in path)
        {
            total += Vec2.Distance(prev, p);
            prev = p;
        }
        return total;
    }

    private static Vec2 InterpolateAlongPath(Vec2 start, List<Vec2> path, double fraction)
    {
        var totalDist = CalculatePathDistance(start, path);
        if (totalDist <= 0.01) return path[^1];

        var targetDist = totalDist * fraction;
        double currentDist = 0;
        var prev = start;

        foreach (var p in path)
        {
            var segLen = Vec2.Distance(prev, p);
            if (currentDist + segLen >= targetDist)
            {
                var segFrac = (targetDist - currentDist) / Math.Max(1e-4, segLen);
                return prev + (p - prev) * segFrac;
            }
            currentDist += segLen;
            prev = p;
        }
        return path[^1];
    }

    private static double DeterministicJitter(int day, string person, string id, double min, double? max)
    {
        if (!max.HasValue || max.Value <= min) return min;
        var hash = HashCode.Combine(day, person, id);
        var normalized = (uint)hash / (double)uint.MaxValue;
        return min + (max.Value - min) * normalized;
    }
}