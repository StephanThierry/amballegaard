using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation;

public enum MowerState { Charging, Leaving, Mowing, Returning }

/// <summary>
/// Robotplæneklipper (Dreame A2): klipper ca. et minut på græsset, kører hjem og lader, og kører så ud et nyt sted.
/// Slukkes den, kører den direkte hjem og bliver stående til den tændes igen. Kører i reel tid (som beboernes gang).
/// </summary>
public sealed class Mower
{
    public const double MowSeconds = 60, ChargeSeconds = 25, Speed = 0.45;

    /// <summary>Ladestation og vejen mellem den og plænen (nord om havebordet, ud vest for terrassen).</summary>
    public static readonly Vec2 Dock = new(19.35, 17.6);
    private static readonly Vec2[] RouteOut = [new(18.9, 16.55), new(12.9, 16.55), new(11.4, 16.9)];

    /// <summary>Klippeområdet: plænen vest for terrassen (A) og det store græsstykke syd for huset (B).</summary>
    private static readonly (Vec2 Min, Vec2 Max) AreaA = (new(-5.0, 16.4), new(11.6, 29.4));
    private static readonly (Vec2 Min, Vec2 Max) AreaB = (new(-5.0, 22.6), new(31.8, 29.4));
    private static readonly Vec2 Junction = new(9.0, 25.5);

    private readonly Random _rng;
    private readonly Queue<Vec2> _waypoints = new();
    private double _timer;

    public Vec2 Position { get; private set; } = Dock;
    public double Heading { get; private set; } = -Math.PI / 2;
    public MowerState State { get; private set; } = MowerState.Charging;
    public bool On { get; private set; } = true;

    public Mower(Random rng)
    {
        _rng = rng;
        _timer = 5; // kort pause ved opstart før første tur
    }

    public void Toggle()
    {
        On = !On;
        if (!On && State is MowerState.Leaving or MowerState.Mowing) StartReturn();
        if (On && State == MowerState.Charging) _timer = Math.Min(_timer, 3);
    }

    public void Tick(double dt)
    {
        switch (State)
        {
            case MowerState.Charging:
                if (!On) return;
                _timer -= dt;
                if (_timer > 0) return;
                State = MowerState.Leaving;
                foreach (var p in RouteOut) _waypoints.Enqueue(p);
                break;

            case MowerState.Leaving:
                if (Follow(dt)) { State = MowerState.Mowing; _timer = MowSeconds; NextMowTarget(); }
                break;

            case MowerState.Mowing:
                _timer -= dt;
                if (_timer <= 0) { StartReturn(); break; }
                if (Follow(dt)) NextMowTarget();
                break;

            case MowerState.Returning:
                if (Follow(dt)) { State = MowerState.Charging; _timer = ChargeSeconds; Heading = -Math.PI / 2; }
                break;
        }
    }

    private void StartReturn()
    {
        _waypoints.Clear();
        // Fra det sydlige græsstykke skal den via krydset ind på den vestlige plæne først.
        if (!In(AreaA, Position) && In(AreaB, Position)) _waypoints.Enqueue(Junction);
        if (In(AreaA, Position) || In(AreaB, Position))
            foreach (var p in RouteOut.Reverse()) _waypoints.Enqueue(p);
        else
            foreach (var p in RouteOut.Reverse().Where(p => Vec2.Distance(p, Dock) < Vec2.Distance(Position, Dock))) _waypoints.Enqueue(p);
        _waypoints.Enqueue(Dock);
        State = MowerState.Returning;
    }

    private void NextMowTarget()
    {
        var area = _rng.NextDouble() < 0.45 ? AreaA : AreaB;
        var t = new Vec2(
            area.Min.X + _rng.NextDouble() * (area.Max.X - area.Min.X),
            area.Min.Z + _rng.NextDouble() * (area.Max.Z - area.Min.Z));
        // Skift mellem de to områder via krydset, så den ikke skærer hen over terrasse/støttemur.
        var fromA = In(AreaA, Position) && !In(AreaB, Position);
        var toA = In(AreaA, t) && !In(AreaB, t);
        var fromB = In(AreaB, Position) && !In(AreaA, Position);
        var toB = In(AreaB, t) && !In(AreaA, t);
        if ((fromA && toB) || (fromB && toA)) _waypoints.Enqueue(Junction);
        _waypoints.Enqueue(t);
    }

    /// <summary>Kør mod næste waypoint. Returnerer true når køen er tom.</summary>
    private bool Follow(double dt)
    {
        var step = Speed * dt;
        while (step > 0 && _waypoints.Count > 0)
        {
            var target = _waypoints.Peek();
            var delta = target - Position;
            var dist = delta.Length;
            if (dist > 1e-6) Heading = Math.Atan2(delta.X, delta.Z);
            if (dist <= step) { Position = target; step -= dist; _waypoints.Dequeue(); }
            else { Position += delta.Normalized * step; step = 0; }
        }
        return _waypoints.Count == 0;
    }

    private static bool In((Vec2 Min, Vec2 Max) a, Vec2 p) =>
        p.X >= a.Min.X - 0.01 && p.X <= a.Max.X + 0.01 && p.Z >= a.Min.Z - 0.01 && p.Z <= a.Max.Z + 0.01;
}
