using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

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

    private readonly Random _rng;
    private readonly List<Agent> _agents;
    private readonly HashSet<string> _openDoors = [];
    private readonly Dictionary<string, int> _lampLevels = [];
    private readonly IReadOnlyList<Vec2> _exterior;
    private readonly List<(Vec2 A, Vec2 B)> _walls;

    public HouseModel House { get; }
    public IReadOnlyList<Agent> Agents => _agents;
    public NavGrid Nav { get; }

    /// <summary>Lysstyrke i procent (0/50/100) for dæmpbare lamper.</summary>
    public IReadOnlyDictionary<string, int> LampLevels => _lampLevels;
    public Mower Mower { get; }

    /// <summary>Åbne døre/porte og tændte pejse: dem brugeren har slået til, plus døre en beboer er ved at gå igennem.</summary>
    public IReadOnlyCollection<string> OpenDoors => _openDoors.Union(_agents.Where(a => a.Active).SelectMany(a => a.HeldDoors)).ToHashSet();

    /// <summary>Simuleret tid siden midnat dag 1.</summary>
    public TimeSpan SimTime { get; private set; }

    /// <summary>Simulerede sekunder pr. reelt sekund.</summary>
    public double TimeScale { get; set; } = 60;
    public bool Paused { get; set; }

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

        // Pejse er tændt fra start; deres tilstand deles med dørene (OpenDoors = åbne porte / tændte pejse).
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
    }

    /// <param name="realDt">Reel tid i sekunder siden sidste tick.</param>
    public void Tick(double realDt)
    {
        // Talebobler kører i reel tid, så de kan læses uanset tidsfaktor.
        foreach (var agent in _agents.Where(a => a.Active))
            StepSpeech(agent, realDt);

        Mower.Tick(realDt);

        if (Paused) return;
        SimTime += TimeSpan.FromSeconds(realDt * TimeScale);

        foreach (var agent in _agents.Where(a => a.Active))
            StepWander(agent, realDt);
    }

    /// <summary>Møblernes fodaftryk (sendt fra klienten, som kender modellernes faktiske mål).</summary>
    public void SetObstacles(IEnumerable<(Vec2 Min, Vec2 Max)> rects)
    {
        Nav.SetObstacles(rects);
        // Beboere der allerede står inde i et møbel (fx startede i sengen) flyttes ud til nærmeste frie plads.
        foreach (var agent in _agents.Where(a => a.WanderRoomId is not null && !Nav.IsWalkable(a.Position)))
        {
            if (Nav.NearestWalkable(agent.Position) is not { } free) continue;
            agent.Position = free;
            ClearPath(agent);
        }
        // Igangværende ruter kan gå gennem de nye møbler — planlæg dem forfra.
        foreach (var agent in _agents.Where(a => a.Path is not null)) ClearPath(agent);
    }

    /// <summary>Brugeren har trukket en beboer hertil. Beboeren vandrer derefter i det nye rum (eller omkring stedet, hvis det er udenfor).</summary>
    public bool MoveAgent(string id, Vec2 to)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is null) return false;

        to = PushAwayFromWalls(ClampToSite(to));
        var room = House.RoomAt(to);
        if (room is null && Geometry.PointInPolygon(to, _exterior))
            return false; // inde i en væg — afvis hellere end at lande beboeren i murværket

        // Indendørs: sluppet oven på et møbel → nærmeste frie plads.
        if (room is not null && Nav.NearestWalkable(to) is { } free) to = free;
        agent.Position = to;
        ClearPath(agent);
        agent.IdleSeconds = 1.5 + _rng.NextDouble() * 2;
        agent.RoomId = room?.Id ?? "";
        agent.WanderRoomId = room?.Id;
        agent.WanderAnchor = room is null ? to : null;
        return true;
    }

    /// <summary>Slå en beboer til/fra. Fra = forsvinder og står stille; til = fortsætter hvor den var.</summary>
    public bool SetActive(string id, bool active)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is null) return false;
        agent.Active = active;
        if (!active) { ClearPath(agent); agent.Speech = null; }
        return true;
    }

    /// <summary>Beboeren er blevet samlet op med musen.</summary>
    public void PickUp(string id)
    {
        var agent = _agents.FirstOrDefault(a => a.Id == id);
        if (agent is not null) Say(agent, Speech.PickedUp(agent, _rng));
    }

    public void Say(Agent agent, string text, double seconds = 4.5)
    {
        agent.Speech = text;
        agent.SpeechRemaining = seconds;
        agent.NextSpeechIn = 12 + _rng.NextDouble() * 30;
    }

    /// <summary>Spring frem til næste gang klokken er <paramref name="hours"/> (fx solopgang). Tiden går aldrig baglæns.</summary>
    public void JumpToTimeOfDay(double hours)
    {
        hours = Math.Clamp(hours, 0, 24);
        var target = TimeSpan.FromDays(Math.Floor(SimTime.TotalDays)) + TimeSpan.FromHours(hours);
        if (target <= SimTime) target += TimeSpan.FromDays(1);
        SimTime = target;
    }

    /// <summary>Åbn/luk en port eller tænd/sluk en pejs.</summary>
    public bool ToggleDoor(string openingId)
    {
        if (House.Openings.All(o => o.Id != openingId) && House.Appliances.All(a => a.Id != openingId)) return false;
        // Dæmpbare lamper skifter 0 % → 50 % → 100 % → 0 %.
        if (House.Appliances.FirstOrDefault(a => a.Id == openingId) is { Kind: "lamp" })
        {
            _lampLevels[openingId] = (_lampLevels.GetValueOrDefault(openingId) + 50) % 150;
            return true;
        }
        if (!_openDoors.Remove(openingId)) _openDoors.Add(openingId);
        return true;
    }

    private void StepSpeech(Agent agent, double dt)
    {
        if (agent.Speech is not null)
        {
            agent.SpeechRemaining -= dt;
            if (agent.SpeechRemaining <= 0) agent.Speech = null;
            return;
        }
        agent.NextSpeechIn -= dt;
        // Højst to snakker ad gangen, så det ikke bliver kaos.
        if (agent.NextSpeechIn <= 0 && _agents.Count(a => a.Speech is not null) < 2)
            Say(agent, Speech.Random(agent, _rng));
    }

    private void StepWander(Agent agent, double dt)
    {
        if (agent.Target is not { } target)
        {
            agent.IdleSeconds -= dt;
            agent.Activity = "idle";
            if (agent.IdleSeconds > 0) return;
            if (agent.WanderRoomId is not null) PlanIndoorWalk(agent);
            else agent.Target = NextWanderTarget(agent);
            if (agent.Target is null) agent.IdleSeconds = 1 + _rng.NextDouble() * 2;
            return;
        }

        var delta = target - agent.Position;
        var dist = delta.Length;
        var step = agent.Speed * dt;
        agent.Activity = "walk";
        agent.Heading = Math.Atan2(delta.X, delta.Z);

        if (dist <= step)
        {
            agent.Position = target;
            agent.Travelled += dist;
            if (agent.Path is { } path && agent.PathIndex + 1 < path.Count)
            {
                agent.PathIndex++;
                agent.Target = path[agent.PathIndex];
            }
            else
            {
                var app = agent.PendingAppliance;
                ClearPath(agent);
                agent.IdleSeconds = 2 + _rng.NextDouble() * 6;
                if (app is not null)
                {
                    // Fremme ved køleskab/fryser: åbn, kig ind og kommentér. Lukkes igen ved næste tur.
                    agent.HeldDoors.Add(app.Id);
                    agent.Heading = Math.PI;
                    agent.IdleSeconds = 5;
                    Say(agent, Speech.Appliance(app.Kind, _rng));
                }
            }
        }
        else
        {
            agent.Position += delta.Normalized * step;
            agent.Travelled += step;
        }
        UpdateHeldDoors(agent);
        agent.RoomId = House.RoomAt(agent.Position)?.Id ?? (agent.WanderRoomId is null ? "" : agent.RoomId);
    }

    /// <summary>
    /// Vælg et mål indendørs: oftest et sted i det nuværende rum, ellers et andet rum eller hjem igen.
    /// Ruten findes med A*, og dørene på ruten noteres, så de kan åbnes/lukkes undervejs.
    /// </summary>
    private void PlanIndoorWalk(Agent agent)
    {
        agent.HeldDoors.Clear(); // luk køleskab/fryser efter besøget
        var roll = _rng.NextDouble();
        var roomId = agent.WanderRoomId!;

        // Indimellem: gå hen og kig i køleskabet eller fryseren.
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
            var candidates = House.Rooms.Where(r => r.Id != roomId && r.Id is not ("tek" or "vikt")).ToList();
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

    private void StartPath(Agent agent, List<Vec2> path)
    {
        agent.Path = path;
        agent.PathIndex = 0;
        agent.Target = path[0];
        agent.Crossings = Nav.DoorsOnPath(agent.Position, path);
        agent.Travelled = 0;
    }

    /// <summary>Hold de døre åbne som beboeren er ved at gå igennem; slip dem igen bagefter.</summary>
    private static void UpdateHeldDoors(Agent agent)
    {
        foreach (var c in agent.Crossings)
        {
            var ahead = c.Distance - agent.Travelled;
            if (ahead < DoorOpenAhead && ahead > -DoorCloseBehind) agent.HeldDoors.Add(c.OpeningId);
            else agent.HeldDoors.Remove(c.OpeningId);
        }
    }

    private static void ClearPath(Agent agent)
    {
        agent.Target = null;
        agent.Path = null;
        agent.Crossings = [];
        agent.HeldDoors.Clear();
        agent.PendingAppliance = null;
    }

    private Vec2 NextWanderTarget(Agent agent)
    {
        // Udendørs: tilfældigt punkt omkring stedet, uden for huset og inden for grunden.
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

    /// <summary>Skubber et punkt ud, så der er mindst <see cref="WallClearance"/> til nærmeste væg (et drop direkte på en væg lander ved siden af).</summary>
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
}
