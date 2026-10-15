using System.Runtime.CompilerServices;
using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.Events;
using Amballegaard.Simulation.House;

[assembly: InternalsVisibleTo("Amballegaard.Simulation.Tests")]

namespace Amballegaard.Simulation;

/// <summary>
/// Den autoritative verden. Beboerne går rundt i huset via rutefinding (<see cref="NavGrid"/>), skifter
/// indimellem rum og åbner/lukker dørene undervejs. Udendørs (efter drag/drop) vandrer de frit omkring stedet.
/// </summary>
public sealed class World
{
    private const double OutdoorWanderRadius = 2.5;
    private const double WallClearance = 0.3;
    /// <summary>Hvor tæt på (m) en beboer skal være en dør på sin rute, før den åbnes — og hvor langt efter den lukkes.</summary>
    private const double DoorOpenAhead = 1.2, DoorCloseBehind = 0.9;
    /// <summary>Stephan og Lisa bliver stående tæt sammen mindst så længe, uanset hvor kort replikudvekslingen er.</summary>
    private const double LoveTogetherMinSeconds = 15;
    /// <summary>Efter et kærligheds-øjeblik går der mindst så lang tid, før en af dem siger noget tilfældigt igen —
    /// ellers kan en hverdagsreplik ("Har du husket madpakken?") overlappe med kys-stemningen lige bagefter.</summary>
    private const double LovePostPauseSeconds = 20;

    private readonly Events.TimeTriggerTracker _timeTracker = new();
    private readonly Events.EventEngine _eventEngine;
    private readonly List<Events.EventNode> _eventNodes = [];
    private Events.EventLoader? _eventLoader;

    private readonly Random _rng;
    private readonly List<Agent> _agents;
    private readonly HashSet<string> _openDoors = [];
    private readonly Dictionary<string, int> _lampLevels = [];
    private readonly IReadOnlyList<Vec2> _exterior;
    private readonly List<(Vec2 A, Vec2 B)> _walls;

    /// <summary>Kærligheds-øjeblik mellem Stephan og Lisa, se <see cref="StepLove"/>.</summary>
    private enum LovePhase { None, Walking, Together }
    private LovePhase _lovePhase = LovePhase.None;
    private double _loveCooldown;
    private double _loveTogetherTimer;
    private double _loveTogetherElapsed;
    private int _loveLineIndex;
    private LoveScript? _loveScript;
    private string? _loveEffectKind;

    public HouseModel House { get; }
    public IReadOnlyList<Agent> Agents => _agents;
    public NavGrid Nav { get; }
    public Events.EventEngine EventEngine => _eventEngine;

    /// <summary>Lysstyrke i procent (0/50/100) for dæmpbare lamper.</summary>
    public IReadOnlyDictionary<string, int> LampLevels => _lampLevels;
    public Mower Mower { get; }

    /// <summary>Åbne døre/porte og tændte pejse: dem brugeren har slået til, plus døre en beboer er ved at gå igennem.</summary>
    public IReadOnlyCollection<string> OpenDoors => _openDoors.Union(_agents.Where(a => a.Active).SelectMany(a => a.HeldDoors)).ToHashSet();

    /// <summary>Simuleret tid siden midnat dag 1.</summary>
    public TimeSpan SimTime { get; private set; }

    /// <summary>Simulerede sekunder pr. reelt sekund (standard 1x jf. §13).</summary>
    public double TimeScale { get; set; } = 1;
    public bool Paused { get; set; }

    /// <summary>"heart" eller "kiss" mens Stephan og Lisa står i et kærligheds-øjeblik sammen, ellers null.</summary>
    public string? LoveEffect => _lovePhase == LovePhase.Together ? _loveEffectKind : null;

    public World(HouseModel house, IEnumerable<Agent> agents, int seed = 1234, TimeSpan? startTime = null)
    {
        House = house;
        _rng = new Random(seed);
        _agents = agents.ToList();
        _exterior = house.Exterior.Select(p => new Vec2(p[0], p[1])).ToArray();
        _walls = _exterior.Select((p, i) => (p, _exterior[(i + 1) % _exterior.Count]))
            .Concat(house.InteriorWalls.Select(w => (new Vec2(w.A[0], w.A[1]), new Vec2(w.B[0], w.B[1]))))
            .ToList();
        SimTime = startTime ?? TimeSpan.FromHours(7);
        Nav = new NavGrid(house);
        Mower = new Mower(new Random(seed + 1));
        _eventEngine = new Events.EventEngine(this);

        foreach (var o in house.Openings.Where(o => o.Type == "fireplace"))
            _openDoors.Add(o.Id);

        foreach (var agent in _agents)
        {
            var room = house.Rooms.First(r => r.Id == agent.HomeRoomId);
            var start = Geometry.RandomPointIn(room, _rng);
            agent.Position = Nav.NearestWalkable(start) ?? start;
            agent.RoomId = room.Id;
            agent.WanderRoomId = room.Id;
            agent.IdleSeconds = _rng.NextDouble() * 3;
            agent.NextSpeechIn = 3 + _rng.NextDouble() * 20;
        }
        _loveCooldown = 20 + _rng.NextDouble() * 40;
    }

    /// <summary>
    /// Starter indlæsning og hot-reload af dagsplan-events fra data/events/ (jf. dagsplan-motor.md §7).
    /// </summary>
    public void LoadEventsFromDirectory(string eventsDir, bool enableHotReload = true)
    {
        _eventLoader?.Dispose();
        _eventLoader = new Events.EventLoader(eventsDir, () => Events.EventIndexWriter.Build(House, _agents));
        _eventLoader.EventsReloaded += (nodes, report) =>
        {
            _eventNodes.Clear();
            _eventNodes.AddRange(nodes);
            _eventEngine.LoadNodes(_eventNodes);
            if (report.IsValid)
            {
                Console.WriteLine($"[Events] Indlæst {nodes.Count} dagsplan-noder fra {eventsDir} (OK)");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"[Events] {report.Errors.Count()} valideringsfejl i dagsplan-filer:");
                foreach (var err in report.Errors)
                    Console.WriteLine($"  - [{err.Person}:{err.NodeId}] {err.Message}");
                Console.ResetColor();
            }
        };
        _eventLoader.Start(enableHotReload);
    }

public void Tick(double realDt)
    {
        foreach (var agent in _agents.Where(a => a.Active))
            StepSpeech(agent, realDt);

        StepLove(realDt);
        Mower.Tick(realDt);

        if (Paused) return;

        var prevSimTime = SimTime;
        SimTime += TimeSpan.FromSeconds(realDt * TimeScale);

        // Trin 3 + 4: Evaluér klokkeslæt og afvikl dagsplan-events
        var dueEvents = _timeTracker.EvaluateCrossing(prevSimTime, SimTime, _eventNodes);
        foreach (var evt in dueEvents)
            _eventEngine.StartNode(evt);

        // EventEngine timere skalerer med TimeScale
        _eventEngine.Tick(realDt, TimeScale);

        foreach (var agent in _agents.Where(a => a.Active))
            StepWander(agent, realDt);
    }

private void StepWander(Agent agent, double dt)
    {
        if (agent.Target is not { } target)
        {
            agent.IdleSeconds -= dt * TimeScale;
            if (!agent.InEvent) agent.Activity = "idle";
            if (agent.IdleSeconds > 0) return;

            // Hvis man taler, lytter, venter på svar eller er i event: bliv stående stille
            if (agent.InLoveMeeting || agent.InEvent || agent.PendingResponseOptions is not null || agent.ConvoWaitRemaining > 0 || agent.Speech is not null)
            {
                agent.IdleSeconds = 0.5;
                return;
            }

            if (agent.WanderRoomId is not null)
                PlanIndoorWalk(agent);
            else
                PlanOutdoorWander(agent);

            if (agent.Target is null)
                agent.IdleSeconds = 5 + _rng.NextDouble() * 10;
            return;
        }

        // Sub-stepping loop for 1×, 2×, 4× og 8× hastigheder
        var remainingStep = agent.Speed * dt * Math.Max(1.0, TimeScale);

        while (remainingStep > 0 && agent.Target is { } currentTarget)
        {
            var delta = currentTarget - agent.Position;
            var dist = delta.Length;
            agent.Activity = "walk";
            agent.Heading = Math.Atan2(delta.X, delta.Z);

            if (dist <= remainingStep)
            {
                agent.Position = currentTarget;
                agent.Travelled += dist;
                remainingStep -= dist;

                if (agent.Path is { } path && agent.PathIndex + 1 < path.Count)
                {
                    agent.PathIndex++;
                    agent.Target = path[agent.PathIndex];
                }
                else
                {
                    var app = agent.PendingAppliance;
                    ClearPath(agent);

                    // Længere ophold i rummet (20-60 sek), især i eget værelse/kontor (op til 90 sek)
                    var isHome = agent.RoomId == agent.HomeRoomId;
                    agent.IdleSeconds = isHome ? (35 + _rng.NextDouble() * 60) : (20 + _rng.NextDouble() * 40);

                    if (app is not null)
                    {
                        agent.HeldDoors.Add(app.Id);
                        agent.Heading = Math.PI;
                        agent.IdleSeconds = 8;
                        // Dynamisk replik fra appliances.json med afsæt i apparatets kind og agentens rolle
                        Say(agent, Speech.Appliance(app.Kind, agent, _rng));
                    }
                    break;
                }
            }
            else
            {
                agent.Position += delta.Normalized * remainingStep;
                agent.Travelled += remainingStep;
                remainingStep = 0;
            }
        }

        UpdateHeldDoors(agent);
        agent.RoomId = House.RoomAt(agent.Position)?.Id ?? (agent.WanderRoomId is null ? "" : agent.RoomId);
    }

    /// <summary>
    /// Relativ tidsforskydning (+/- minutter) med resolve jf. §13.
    /// Blokerer for at springe baglæns over midnat (§13.7).
    /// </summary>
    public void ShiftTime(double minutes)
    {
        var currentDayStart = TimeSpan.FromDays(Math.Floor(SimTime.TotalDays));
        var target = SimTime + TimeSpan.FromMinutes(minutes);

        // Bloker for tilbage-spring over midnat (§13.7)
        if (target < currentDayStart)
            target = currentDayStart;

        SimTime = target;
        _timeTracker.FastForwardTo(SimTime, _eventNodes);

        // Analytisk resolve af alle avatarers tilstand på måltidspunktet (§13.3)
        var nodeMap = _eventNodes.ToDictionary(n => (n.Person, n.Id));
        Events.TimeResolver.Resolve(this, SimTime, nodeMap, _rng);
    }

    /// <summary>Spring frem til næste gang klokken er hours med resolve.</summary>
    public void JumpToTimeOfDay(double hours)
    {
        hours = Math.Clamp(hours, 0, 24);
        var target = TimeSpan.FromDays(Math.Floor(SimTime.TotalDays)) + TimeSpan.FromHours(hours);
        if (target <= SimTime) target += TimeSpan.FromDays(1);
        SimTime = target;
        _timeTracker.FastForwardTo(SimTime, _eventNodes);

        var nodeMap = _eventNodes.ToDictionary(n => (n.Person, n.Id));
        Events.TimeResolver.Resolve(this, SimTime, nodeMap, _rng);
    }

    /// <summary>Møblernes fodaftryk (sendt fra klienten, som kender modellernes faktiske mål).</summary>
    public void SetObstacles(IEnumerable<(Vec2 Min, Vec2 Max)> rects)
    {
        Nav.SetObstacles(rects);
        foreach (var agent in _agents.Where(a => a.WanderRoomId is not null && !Nav.IsWalkable(a.Position)))
        {
            if (Nav.NearestWalkable(agent.Position) is not { } free) continue;
            agent.Position = free;
            ClearPath(agent);
        }
        foreach (var agent in _agents.Where(a => a.Path is not null)) ClearPath(agent);
    }

    /// <summary>Brugeren har trukket en beboer hertil. Beboeren vandrer derefter i det nye rum.</summary>
    public bool MoveAgent(string id, Vec2 to)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is null) return false;
        if (id is "stephan" or "lisa") CancelLoveMeeting();
        _eventEngine.CancelAgent(id); // Knækker igangværende dagsplan-event pænt (jf. §6)

        to = PushAwayFromWalls(ClampToSite(to));
        var room = House.RoomAt(to);
        if (room is null && Geometry.PointInPolygon(to, _exterior))
            return false;

        if (room is not null && Nav.NearestWalkable(to) is { } free) to = free;
        agent.Position = to;
        ClearPath(agent);
        agent.IdleSeconds = 1.5 + _rng.NextDouble() * 2;
        agent.RoomId = room?.Id ?? "";
        agent.WanderRoomId = room?.Id;
        agent.WanderAnchor = room is null ? to : null;

        if (room is not null && id is "stephan" or "lisa")
        {
            var other = _agents.FirstOrDefault(a => a.Id == (id == "stephan" ? "lisa" : "stephan"));
            if (other is not null && other.Active && other.RoomId == room.Id)
                StartArrivalKiss(arriving: agent, resident: other);
        }
        return true;
    }

    private void StartArrivalKiss(Agent arriving, Agent resident)
    {
        resident.InLoveMeeting = true;
        arriving.InLoveMeeting = true;
        var toArriving = arriving.Position - resident.Position;
        if (toArriving.Length > 0.01)
        {
            resident.Heading = Math.Atan2(toArriving.X, toArriving.Z);
            arriving.Heading = Math.Atan2(-toArriving.X, -toArriving.Z);
        }
        var text = Speech.ArrivalKissLines[_rng.Next(Speech.ArrivalKissLines.Count)];
        _loveScript = new LoveScript([new LoveLine(resident.Id, text)], EndsWithKiss: true);
        _loveLineIndex = 0;
        _loveTogetherTimer = 0;
        _loveTogetherElapsed = 0;
        _lovePhase = LovePhase.Together;
    }

    /// <summary>Slå en beboer til/fra.</summary>
    public bool SetActive(string id, bool active)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is null) return false;
        if (!active && id is "stephan" or "lisa") CancelLoveMeeting();
        if (!active) _eventEngine.CancelAgent(id);

        agent.Active = active;
        if (!active) { ClearPath(agent); agent.Speech = null; }
        return true;
    }

    /// <summary>Beboeren er blevet samlet op med musen.</summary>
    public void PickUp(string id)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is null) return;
        if (id is "stephan" or "lisa") CancelLoveMeeting();
        _eventEngine.CancelAgent(id);
        Say(agent, Speech.PickedUp(agent, _rng), 3.2);
    }

    private void CancelLoveMeeting()
    {
        if (_lovePhase == LovePhase.None) return;
        var stephan = _agents.FirstOrDefault(a => a.Id == "stephan");
        var lisa = _agents.FirstOrDefault(a => a.Id == "lisa");
        if (stephan is not null) stephan.InLoveMeeting = false;
        if (lisa is not null) lisa.InLoveMeeting = false;
        _lovePhase = LovePhase.None;
        _loveScript = null;
        _loveEffectKind = null;
    }

    public void Say(Agent agent, string text, double seconds = 4.5)
    {
        agent.Speech = text;
        agent.SpeechRemaining = seconds;
        agent.NextSpeechIn = 12 + _rng.NextDouble() * 30;
    }

    /// <summary>Åbn/luk en port eller tænd/sluk en pejs.</summary>
    public bool ToggleDoor(string openingId)
    {
        if (House.Openings.All(o => o.Id != openingId) && House.Appliances.All(a => a.Id != openingId)) return false;
        if (House.Appliances.FirstOrDefault(a => a.Id == openingId) is { Kind: "lamp" })
        {
            _lampLevels[openingId] = (_lampLevels.GetValueOrDefault(openingId) + 50) % 150;
            return true;
        }
        if (!_openDoors.Remove(openingId)) _openDoors.Add(openingId);
        return true;
    }

    /// <summary>Sætter en dør/hvidevares tilstand eksplicit til åben eller lukket (bruges af interact-action).</summary>
    public bool SetDoorState(string id, bool open)
    {
        var isOpen = _openDoors.Contains(id);
        if (open && !isOpen) return ToggleDoor(id);
        if (!open && isOpen) return ToggleDoor(id);
        return true;
    }

private void StepSpeech(Agent agent, double dt)
    {
        // 1. Modparten svarer: venter på at starterens replik er læst færdig
        if (agent.PendingResponseOptions is { } options)
        {
            agent.PendingResponseIn -= dt;
            if (agent.PendingResponseIn <= 0)
            {
                Say(agent, options[_rng.Next(options.Count)]);
                agent.PendingResponseOptions = null;
            }
            return;
        }

        // 2. Starteren venter på svar: tæller ConvoWaitRemaining ned
        if (agent.ConvoWaitRemaining > 0)
        {
            agent.ConvoWaitRemaining -= dt;
        }

        // 3. Aktiv taleboble tælles ned
        if (agent.Speech is not null)
        {
            agent.SpeechRemaining -= dt;
            if (agent.SpeechRemaining <= 0) agent.Speech = null;
            return;
        }

        agent.NextSpeechIn -= dt;
        if (agent.InLoveMeeting || agent.InEvent || agent.NextSpeechIn > 0 || _agents.Count(a => a.Speech is not null) >= 2) return;

        if (agent.Kind == AgentKind.Dog) { Say(agent, Speech.DogLines[_rng.Next(Speech.DogLines.Count)]); return; }

        var others = _agents.Where(a => a.Id != agent.Id && a.Active && a.Kind != AgentKind.Dog
            && a.RoomId == agent.RoomId && a.Speech is null && a.PendingResponseOptions is null && !a.InLoveMeeting && !a.InEvent).ToList();

        // Spontane replikker evalueret mod agent, rum, aktuel tid (SimTime) og husmodellen
        var pool = Speech.Lines.Where(l => l.Fits(agent, agent.RoomId, SimTime, House)).ToList();

        // Samtaler tilføjes hvis der er en modpart i rummet
        if (others.Count > 0)
        {
            pool.AddRange(Speech.Conversations.Where(c => c.Fits(agent, agent.RoomId, SimTime, House)));
        }

        if (pool.Count == 0) return;

        var line = pool[_rng.Next(pool.Count)];
        Say(agent, line.Text);

        if (line.Responses is { } responses && others.Count > 0)
        {
            // Tale-stop: Begge parter stopper op og vender ansigtet mod hinanden under samtalen
            var responder = others[_rng.Next(others.Count)];
            
            ClearPath(agent);
            ClearPath(responder);

            var toResponder = responder.Position - agent.Position;
            if (toResponder.Length > 0.01)
            {
                agent.Heading = Math.Atan2(toResponder.X, toResponder.Z);
                responder.Heading = Math.Atan2(-toResponder.X, -toResponder.Z);
            }

            // Begge parter bliver stående stille under hele dialogen
            agent.ConvoWaitRemaining = agent.SpeechRemaining + 4.5;
            agent.IdleSeconds = agent.ConvoWaitRemaining + 2.0;

            responder.PendingResponseOptions = responses;
            responder.PendingResponseIn = agent.SpeechRemaining;
            responder.IdleSeconds = agent.ConvoWaitRemaining + 2.0;
        }
    }    

    private void StepLove(double dt)
    {
        var stephan = _agents.FirstOrDefault(a => a.Id == "stephan");
        var lisa = _agents.FirstOrDefault(a => a.Id == "lisa");
        if (stephan is null || lisa is null) return;

        if (_lovePhase == LovePhase.None)
        {
            _loveCooldown -= dt;
            if (_loveCooldown > 0) return;
            _loveCooldown = 40 + _rng.NextDouble() * 70;
            if (!stephan.Active || !lisa.Active) return;
            if (stephan.RoomId == "" || stephan.RoomId != lisa.RoomId) return;
            if (stephan.Speech is not null || lisa.Speech is not null) return;
            if (stephan.HeldDoors.Count > 0 || lisa.HeldDoors.Count > 0) return;
            if (stephan.InEvent || lisa.InEvent) return;
            if (_rng.NextDouble() > 0.5) return;

            var mid = (stephan.Position + lisa.Position) * 0.5;
            var dir = lisa.Position - stephan.Position;
            var perp = dir.Length > 0.01 ? new Vec2(-dir.Z, dir.X).Normalized : new Vec2(1, 0);
            var stephanGoal = Nav.NearestWalkable(mid + perp * 0.28) ?? mid;
            var lisaGoal = Nav.NearestWalkable(mid - perp * 0.28) ?? mid;
            var stephanPath = Nav.FindPath(stephan.Position, stephanGoal);
            var lisaPath = Nav.FindPath(lisa.Position, lisaGoal);
            if (stephanPath is not { Count: > 0 } || lisaPath is not { Count: > 0 }) return;

            stephan.InLoveMeeting = true;
            lisa.InLoveMeeting = true;
            StartPath(stephan, stephanPath);
            StartPath(lisa, lisaPath);
            _loveScript = Speech.RandomLoveScript(_rng);
            _loveLineIndex = 0;
            _lovePhase = LovePhase.Walking;
            return;
        }

        if (_lovePhase == LovePhase.Walking)
        {
            if (stephan.Target is not null || lisa.Target is not null) return;
            var toLisa = lisa.Position - stephan.Position;
            stephan.Heading = Math.Atan2(toLisa.X, toLisa.Z);
            lisa.Heading = Math.Atan2(-toLisa.X, -toLisa.Z);
            _loveEffectKind = "heart";
            _loveTogetherTimer = 0;
            _loveTogetherElapsed = 0;
            _lovePhase = LovePhase.Together;
            return;
        }

        if (_loveScript is null) { _lovePhase = LovePhase.None; return; }
        _loveTogetherElapsed += dt;
        _loveTogetherTimer -= dt;
        if (_loveTogetherTimer > 0) return;

        if (_loveLineIndex > _loveScript.Lines.Count)
        {
            if (_loveTogetherElapsed < LoveTogetherMinSeconds)
            {
                _loveTogetherTimer = LoveTogetherMinSeconds - _loveTogetherElapsed;
                return;
            }
            stephan.InLoveMeeting = false;
            lisa.InLoveMeeting = false;
            stephan.IdleSeconds = 1 + _rng.NextDouble() * 2;
            lisa.IdleSeconds = 1 + _rng.NextDouble() * 2;
            stephan.NextSpeechIn = Math.Max(stephan.NextSpeechIn, LovePostPauseSeconds);
            lisa.NextSpeechIn = Math.Max(lisa.NextSpeechIn, LovePostPauseSeconds);
            _lovePhase = LovePhase.None;
            _loveScript = null;
            _loveEffectKind = null;
            return;
        }
        if (_loveLineIndex == _loveScript.Lines.Count)
        {
            _loveTogetherTimer = 1.4;
            _loveLineIndex++;
            return;
        }

        var line = _loveScript.Lines[_loveLineIndex];
        if (line.Speaker == "both") { Say(stephan, line.Text, 1.8); Say(lisa, line.Text, 1.8); }
        else Say(line.Speaker == "stephan" ? stephan : lisa, line.Text, 1.8);
        if (_loveScript.EndsWithKiss && _loveLineIndex == _loveScript.Lines.Count - 1) _loveEffectKind = "kiss";
        _loveTogetherTimer = 2.0;
        _loveLineIndex++;
    }

    private void PlanIndoorWalk(Agent agent)
    {
        agent.HeldDoors.Clear();
        var roll = _rng.NextDouble();
        var roomId = agent.WanderRoomId!;

        var visitable = House.Appliances.Where(a => a.Kind is "fridge" or "freezer").ToList();
        if (agent.Kind != AgentKind.Dog && visitable.Count > 0 && _rng.NextDouble() < 0.18)
        {
            var app = visitable[_rng.Next(visitable.Count)];
            var appRoom = House.RoomAt(app.Stand);
            var appPath = appRoom is null ? null : Nav.FindPath(agent.Position, app.Stand);
            if (appPath is { Count: > 0 })
            {
                agent.WanderRoomId = appRoom!.Id;
                agent.PendingAppliance = app;
                StartPath(agent, appPath);
                return;
            }
        }
        if (roll < 0.3)
        {
            var candidates = House.Rooms.Where(r => r.Id != roomId && r.Id is not ("technical_room" or "pantry")).ToList();
            roomId = candidates[_rng.Next(candidates.Count)].Id;
        }
        else if (roll < 0.5 && agent.WanderRoomId != agent.HomeRoomId)
            roomId = agent.HomeRoomId;

        var room = House.Rooms.First(r => r.Id == roomId);
        var goal = Geometry.RandomPointIn(room, _rng, agent.Kind == AgentKind.Dog ? 0.4 : 0.6);
        var path = Nav.FindPath(agent.Position, goal);
        if (path is null || path.Count == 0) return;

        agent.WanderRoomId = roomId;
        StartPath(agent, path);
    }

    internal void StartPath(Agent agent, List<Vec2> path)
    {
        agent.Path = path;
        agent.PathIndex = 0;
        agent.Target = path[0];
        agent.Crossings = Nav.DoorsOnPath(agent.Position, path);
        agent.Travelled = 0;
    }

    internal void StartAgentPath(Agent agent, List<Vec2> path) => StartPath(agent, path);

    private static void UpdateHeldDoors(Agent agent)
    {
        foreach (var c in agent.Crossings)
        {
            var ahead = c.Distance - agent.Travelled;
            if (ahead < DoorOpenAhead && ahead > -DoorCloseBehind) agent.HeldDoors.Add(c.OpeningId);
            else agent.HeldDoors.Remove(c.OpeningId);
        }
    }

    internal void ClearPath(Agent agent)
    {
        agent.Target = null;
        agent.Path = null;
        agent.Crossings = [];
        agent.HeldDoors.Clear();
        agent.PendingAppliance = null;
    }

    internal void ClearAgentPath(Agent agent) => ClearPath(agent);

    private Vec2 NextWanderTarget(Agent agent)
    {
        var anchor = agent.WanderAnchor ?? agent.Position;
        for (var i = 0; i < 40; i++)
        {
            var angle = _rng.NextDouble() * Math.PI * 2;
            var r = Math.Sqrt(_rng.NextDouble()) * OutdoorWanderRadius;
            var p = ClampToSite(anchor + new Vec2(Math.Cos(angle) * r, Math.Sin(angle) * r));
            if (!Geometry.PointInPolygon(p, _exterior) && !CrossesHouse(agent.Position, p))
                return p;
        }
        return agent.Position;
    }

    private Vec2 PushAwayFromWalls(Vec2 p)
    {
        for (var iter = 0; iter < 3; iter++)
        foreach (var (a, b) in _walls)
        {
            var ab = b - a;
            var t = Math.Clamp(((p.X - a.X) * ab.X + (p.Z - a.Z) * ab.Z) / (ab.X * ab.X + ab.Z * ab.Z), 0, 1);
            var closest = a + ab * t;
            var away = p - closest;
            var d = away.Length;
            if (d >= WallClearance) continue;
            var dir = d > 1e-6 ? away.Normalized : new Vec2(-ab.Z, ab.X).Normalized;
            p = closest + dir * WallClearance;
        }
        return p;
    }

    private bool CrossesHouse(Vec2 a, Vec2 b)
    {
        for (var t = 0.1; t < 1; t += 0.1)
            if (Geometry.PointInPolygon(a + (b - a) * t, _exterior)) return true;
        return false;
    }

    private Vec2 ClampToSite(Vec2 p)
    {
        if (House.Site?.Bounds is not { Length: 2 } b) return p;
        const double m = 0.5;
        return new Vec2(Math.Clamp(p.X, b[0][0] + m, b[1][0] - m), Math.Clamp(p.Z, b[0][1] + m, b[1][1] - m));
    }
    
    /// <summary>
    /// Udendørs vandring i haven og på terrassen. Efter noget tid søger beboeren ind i huset igen.
    /// </summary>
    private void PlanOutdoorWander(Agent agent)
    {
        // 25% chance for at gå ind i huset igen
        if (_rng.NextDouble() < 0.25)
        {
            var entrance = FindBestEntranceDoor(agent.Position);
            if (entrance is not null)
            {
                var insideRoom = House.RoomAt(entrance.Position);
                if (insideRoom is not null && !agent.ExcludedRooms.Contains(insideRoom.Id))
                {
                    agent.WanderRoomId = insideRoom.Id;
                    agent.WanderAnchor = null;
                    agent.Target = entrance.Position;
                    agent.IdleSeconds = 10 + _rng.NextDouble() * 20;
                    return;
                }
            }
        }

        // Ellers gå rundt i haven / på terrassen
        agent.Target = NextWanderTarget(agent);
        if (agent.Target is null)
            agent.IdleSeconds = 8 + _rng.NextDouble() * 15;
    }

    private OpeningDef? FindBestExitDoor(Vec2 pos)
    {
        var exits = House.Openings.Where(o => o.Type is "glassDoor" or "exteriorDoor" or "frontDoor").ToList();
        return exits.MinBy(o => Vec2.Distance(pos, o.Position));
    }

    private OpeningDef? FindBestEntranceDoor(Vec2 pos)
    {
        var entrances = House.Openings.Where(o => o.Type is "glassDoor" or "exteriorDoor" or "frontDoor").ToList();
        return entrances.MinBy(o => Vec2.Distance(pos, o.Position));
    }
}