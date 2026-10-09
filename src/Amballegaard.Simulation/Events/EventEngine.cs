using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Events;

/// <summary>Tilstand for en aktiv handling i en event-node.</summary>
internal sealed class ActiveExecution
{
    public required EventNode Node { get; init; }
    public required Agent Agent { get; init; }
    public double Timer { get; set; }
    public double RepathCooldown { get; set; }
    public Vec2? LastTargetPos { get; set; }
}

/// <summary>
/// Eksekverer dagsplan-grafer for beboerne (jf. dagsplan-motor.md §2–§6).
/// Håndterer goto, speak, wait, setState, oncomplete-kæder og waitFor fan-in.
/// </summary>
public sealed class EventEngine
{
    private readonly World _world;
    private readonly Dictionary<(string Person, string Id), EventNode> _nodes = new();
    private readonly Dictionary<string, ActiveExecution> _activeByPerson = new(StringComparer.Ordinal);
    private readonly HashSet<(string Person, string Id)> _completedNodesToday = new();
    private readonly List<EventNode> _pendingWaitFor = new();

    public IReadOnlyCollection<(string Person, string Id)> CompletedToday => _completedNodesToday;

    public EventEngine(World world)
    {
        _world = world;
    }

    /// <summary>Indlæser noder i motorens opslagstabel.</summary>
    public void LoadNodes(IEnumerable<EventNode> nodes)
    {
        _nodes.Clear();
        foreach (var n in nodes)
            _nodes[(n.Person, n.Id)] = n;
    }

    /// <summary>Nulstiller dagens gennemførte noder (kaldes ved dags-rearm).</summary>
    public void ResetDailyState()
    {
        _completedNodesToday.Clear();
        _pendingWaitFor.Clear();
    }

    /// <summary>Starter eksekvering af en node for dens aktør.</summary>
    public bool StartNode(EventNode node)
    {
        var agent = _world.Agents.FirstOrDefault(a => a.Id == node.Person);
        if (agent is null || !agent.Active) return false;

        // Tjek waitFor (fan-in): hvis forudsætningerne ikke er mødt endnu, venter vi
        if (node.WaitFor is { Count: > 0 } waits)
        {
            var allDone = waits.All(w => _completedNodesToday.Contains((w.Person, w.Id)));
            if (!allDone)
            {
                if (!_pendingWaitFor.Contains(node))
                    _pendingWaitFor.Add(node);
                return false;
            }
            _pendingWaitFor.Remove(node);
        }

        // Afbryd evt. tidligere igangværende rute og tilfældig snak
        _world.ClearAgentPath(agent);
        agent.InEvent = true;
        agent.CurrentEventChain = node.Chain;

        var exec = new ActiveExecution
        {
            Node = node,
            Agent = agent,
            Timer = 0,
            RepathCooldown = 0
        };

        InitializeAction(exec);
        _activeByPerson[agent.Id] = exec;
        return true;
    }

    private void InitializeAction(ActiveExecution exec)
    {
        var action = exec.Node.Action;
        var agent = exec.Agent;

        switch (action.Type)
        {
            case "goto":
                PlanGoto(exec);
                break;

            case "speak":
                var speechDuration = exec.Node.Duration?.Min ?? (action.Seconds ?? 3.5);
                _world.Say(agent, action.Text ?? "", speechDuration);
                exec.Timer = speechDuration;
                break;

            case "wait":
                var waitDuration = exec.Node.Duration?.Min ?? (action.Seconds ?? 1.0);
                exec.Timer = waitDuration;
                agent.Activity = "idle";
                break;

            case "setState":
                if (!string.IsNullOrWhiteSpace(action.Activity))
                    agent.Activity = action.Activity;
                // setState er øjeblikkelig (0 sekunder)
                exec.Timer = 0;
                break;
        }
    }

    private void PlanGoto(ActiveExecution exec)
    {
        var target = exec.Node.Action.Target;
        if (target is null) return;

        Vec2? goal = null;
        if (target.Kind == "room")
        {
            var room = _world.House.Rooms.FirstOrDefault(r => r.Id == target.Value);
            if (room is not null)
            {
                var (min, max) = room.Bounds();
                var center = (min + max) * 0.5;
                goal = _world.Nav.NearestWalkable(center) ?? center;
            }
        }
        else if (target.Kind == "point")
        {
            var app = _world.House.Appliances.FirstOrDefault(a => a.Id == target.Value);
            if (app is not null)
                goal = app.Stand;
        }
        else if (target.Kind == "person")
        {
            var other = _world.Agents.FirstOrDefault(a => a.Id == target.Value);
            if (other is not null)
            {
                goal = other.Position;
                exec.LastTargetPos = other.Position;
            }
        }

        if (goal is { } g)
        {
            var path = _world.Nav.FindPath(exec.Agent.Position, g);
            if (path is { Count: > 0 })
                _world.StartAgentPath(exec.Agent, path);
        }
    }

    public void Tick(double dt)
    {
        var finished = new List<ActiveExecution>();

        foreach (var exec in _activeByPerson.Values.ToList())
        {
            if (!exec.Agent.Active)
            {
                // Hvis agenten er blevet deaktiveret, dør noden jf. §6
                finished.Add(exec);
                continue;
            }

            var isDone = UpdateExecution(exec, dt);
            if (isDone)
                finished.Add(exec);
        }

        foreach (var exec in finished)
        {
            CompleteNode(exec);
        }

        // Tjek om noder med waitFor nu kan starte
        CheckPendingWaitFors();
    }

    private bool UpdateExecution(ActiveExecution exec, double dt)
    {
        var action = exec.Node.Action;
        var agent = exec.Agent;

        switch (action.Type)
        {
            case "goto":
                if (action.Target?.Kind == "person")
                {
                    var other = _world.Agents.FirstOrDefault(a => a.Id == action.Target.Value);
                    if (other is null || !other.Active) return true; // Mål forsvundet

                    // "Ved goto person skal man være i samme rum og 1m eller mindre fra personen" (jf. §4)
                    var sameRoom = agent.RoomId != "" && agent.RoomId == other.RoomId;
                    var dist = Vec2.Distance(agent.Position, other.Position);
                    if (sameRoom && dist <= 1.0)
                    {
                        _world.ClearAgentPath(agent);
                        return true;
                    }

                    // Dynamisk genberegning hvis målet har flyttet sig
                    exec.RepathCooldown -= dt;
                    if (exec.RepathCooldown <= 0)
                    {
                        exec.RepathCooldown = 0.5;
                        if (exec.LastTargetPos is null || Vec2.Distance(exec.LastTargetPos.Value, other.Position) > 0.8)
                        {
                            PlanGoto(exec);
                        }
                    }
                    return false;
                }

                if (action.Target?.Kind == "room")
                {
                    // "Ved goto værelse skal man bare være tæt på centrum / ankommet"
                    if (agent.RoomId == action.Target.Value && agent.Target is null)
                        return true;
                    return agent.Target is null;
                }

                // point eller generelt: færdig når stien er gået færdig
                return agent.Target is null;

            case "speak":
                exec.Timer -= dt;
                return exec.Timer <= 0 || agent.Speech is null;

            case "wait":
                exec.Timer -= dt;
                return exec.Timer <= 0;

            case "setState":
                return true;

            default:
                return true;
        }
    }

    private void CompleteNode(ActiveExecution exec)
    {
        var key = (exec.Node.Person, exec.Node.Id);
        _completedNodesToday.Add(key);
        _activeByPerson.Remove(exec.Agent.Id);

        // Udløs fan-out via oncomplete
        var nextNodesToStart = new List<EventNode>();
        foreach (var nextRef in exec.Node.Oncomplete)
        {
            if (_nodes.TryGetValue((nextRef.Person, nextRef.Id), out var nextNode))
                nextNodesToStart.Add(nextNode);
        }

        // Hvis agenten ikke umiddelbart fortsætter i en ny handling, frigives den
        var agentHasNextImmediate = nextNodesToStart.Any(n => n.Person == exec.Agent.Id);
        if (!agentHasNextImmediate)
        {
            exec.Agent.InEvent = false;
            exec.Agent.CurrentEventChain = null;
        }

        foreach (var next in nextNodesToStart)
        {
            StartNode(next);
        }
    }

    private void CheckPendingWaitFors()
    {
        if (_pendingWaitFor.Count == 0) return;

        var ready = _pendingWaitFor
            .Where(node => node.WaitFor?.All(w => _completedNodesToday.Contains((w.Person, w.Id))) ?? true)
            .ToList();

        foreach (var node in ready)
        {
            _pendingWaitFor.Remove(node);
            StartNode(node);
        }
    }

    /// <summary>Afbryder øjeblikkeligt en persons handling, hvis brugeren trækker i den (jf. §6).</summary>
    public void CancelAgent(string agentId)
    {
        if (_activeByPerson.Remove(agentId, out var exec))
        {
            exec.Agent.InEvent = false;
            exec.Agent.CurrentEventChain = null;
            _world.ClearAgentPath(exec.Agent);
        }
    }
}