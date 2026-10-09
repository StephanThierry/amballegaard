using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Events;

internal sealed class ActiveExecution
{
    public required EventNode Node { get; init; }
    public required Agent Agent { get; init; }
    public double Timer { get; set; }
    public double RepathCooldown { get; set; }
    public Vec2? LastTargetPos { get; set; }

    public double ChoreRemaining { get; set; }
    public double ChorePauseRemaining { get; set; }
    public int ChorePointIndex { get; set; }
    public string? LastInteractedAppliance { get; set; }
}

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

    public void LoadNodes(IEnumerable<EventNode> nodes)
    {
        _nodes.Clear();
        foreach (var n in nodes)
            _nodes[(n.Person, n.Id)] = n;
    }

    public void ResetDailyState()
    {
        _completedNodesToday.Clear();
        _pendingWaitFor.Clear();
    }

    public bool StartNode(EventNode node)
    {
        var agent = _world.Agents.FirstOrDefault(a => a.Id == node.Person);
        if (agent is null || !agent.Active) return false;

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

        if (node.Action.Type == "setState")
        {
            if (!string.IsNullOrWhiteSpace(node.Action.Activity))
                agent.Activity = node.Action.Activity;

            _completedNodesToday.Add((node.Person, node.Id));
            TriggerOncomplete(node, agent);
            CheckPendingWaitFors();
            return true;
        }

        if (node.Action.Type == "interact")
        {
            var targetId = node.Action.Target?.Value ?? "";
            var wantOpen = string.Equals(node.Action.State, "open", StringComparison.OrdinalIgnoreCase);
            _world.SetDoorState(targetId, wantOpen);

            _completedNodesToday.Add((node.Person, node.Id));
            TriggerOncomplete(node, agent);
            CheckPendingWaitFors();
            return true;
        }

        _world.ClearPath(agent);
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

            case "chore":
                var choreTime = exec.Node.Duration?.Min ?? (action.Duration?.Min ?? 45.0);
                exec.ChoreRemaining = choreTime;
                exec.ChorePauseRemaining = 0;
                exec.ChorePointIndex = 0;
                if (!string.IsNullOrWhiteSpace(action.Activity))
                    agent.Activity = action.Activity;
                PlanChoreStep(exec);
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

    private void PlanChoreStep(ActiveExecution exec)
    {
        var points = exec.Node.Action.Points;
        if (points is null || points.Count == 0) return;

        var ptId = points[exec.ChorePointIndex % points.Count];
        var app = _world.House.Appliances.FirstOrDefault(a => a.Id == ptId);
        if (app is not null)
        {
            var path = _world.Nav.FindPath(exec.Agent.Position, app.Stand);
            if (path is { Count: > 0 })
                _world.StartAgentPath(exec.Agent, path);
        }
    }

    public void Tick(double dt, double timeScale = 1.0)
    {
        var finished = new List<ActiveExecution>();

        foreach (var exec in _activeByPerson.Values.ToList())
        {
            if (!exec.Agent.Active)
            {
                finished.Add(exec);
                continue;
            }

            var isDone = UpdateExecution(exec, dt, timeScale);
            if (isDone)
                finished.Add(exec);
        }

        foreach (var exec in finished)
        {
            CompleteNode(exec);
        }

        CheckPendingWaitFors();
    }

    private bool UpdateExecution(ActiveExecution exec, double dt, double timeScale)
    {
        var action = exec.Node.Action;
        var agent = exec.Agent;

        switch (action.Type)
        {
            case "goto":
                if (action.Target?.Kind == "person")
                {
                    var other = _world.Agents.FirstOrDefault(a => a.Id == action.Target.Value);
                    if (other is null || !other.Active) return true;

                    var sameRoom = agent.RoomId != "" && agent.RoomId == other.RoomId;
                    var dist = Vec2.Distance(agent.Position, other.Position);
                    if (sameRoom && dist <= 1.0)
                    {
                        _world.ClearPath(agent);
                        return true;
                    }

                    exec.RepathCooldown -= dt * timeScale;
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
                    if (agent.RoomId == action.Target.Value && agent.Target is null)
                        return true;
                    return agent.Target is null;
                }

                return agent.Target is null;

            case "speak":
                // Talebobler holdes i realtid så de kan læses
                exec.Timer -= dt;
                return exec.Timer <= 0 || agent.Speech is null;

            case "wait":
                // Wait skalerer med timeScale
                exec.Timer -= dt * timeScale;
                return exec.Timer <= 0;

            case "chore":
                exec.ChoreRemaining -= dt * timeScale;
                if (exec.ChoreRemaining <= 0)
                {
                    _world.ClearPath(agent);
                    return true;
                }

                if (agent.Target is null)
                {
                    exec.ChorePauseRemaining -= dt * timeScale;
                    if (exec.ChorePauseRemaining <= 0)
                    {
                        exec.ChorePauseRemaining = 2.0;
                        exec.ChorePointIndex++;
                        PlanChoreStep(exec);
                    }
                }
                return false;

            default:
                return true;
        }
    }

    private void CompleteNode(ActiveExecution exec)
    {
        var key = (exec.Node.Person, exec.Node.Id);
        _completedNodesToday.Add(key);
        _activeByPerson.Remove(exec.Agent.Id);

        TriggerOncomplete(exec.Node, exec.Agent);
    }

    private void TriggerOncomplete(EventNode node, Agent agent)
    {
        var nextNodes = new List<EventNode>();
        foreach (var nextRef in node.Oncomplete)
        {
            if (_nodes.TryGetValue((nextRef.Person, nextRef.Id), out var nextNode))
                nextNodes.Add(nextNode);
        }

        var agentHasNext = nextNodes.Any(n => n.Person == agent.Id);
        if (!agentHasNext && !_activeByPerson.ContainsKey(agent.Id))
        {
            agent.InEvent = false;
            agent.CurrentEventChain = null;
        }

        foreach (var next in nextNodes)
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

    public void CancelAgent(string agentId)
    {
        if (_activeByPerson.Remove(agentId, out var exec))
        {
            if (exec.LastInteractedAppliance is not null)
            {
                _world.SetDoorState(exec.LastInteractedAppliance, false);
            }

            exec.Agent.InEvent = false;
            exec.Agent.CurrentEventChain = null;
            _world.ClearPath(exec.Agent);
        }
    }
}