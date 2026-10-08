using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Agents;

public enum AgentKind { Adult, Child, Dog }

/// <summary>Udseende sendes til klienten, som bygger avatar-modellen ud fra det.</summary>
public sealed record Appearance(
    string Skin,
    string Hair,
    string HairStyle,
    string Top,
    string Bottom,
    double Height,
    string? Beard = null,
    /** Mønster på overdelen, fx "plaid" (rød/sort skovmandsskjorte). */
    string? Pattern = null,
    /** Slankere skuldre/talje og lidt bredere hofter. */
    bool Feminine = false);

public sealed class Agent
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required AgentKind Kind { get; init; }
    public required Appearance Appearance { get; init; }
    public required string HomeRoomId { get; init; }

    public Vec2 Position { get; set; }
    public double Heading { get; set; }
    public string RoomId { get; set; } = "";
    public string Activity { get; set; } = "idle";

    /// <summary>Slået til i simulationen (vises og bevæger sig). Kan slås fra i UI'et.</summary>
    public bool Active { get; set; } = true;

    /// <summary>Gå-hastighed i m/s.</summary>
    public double Speed => Kind switch { AgentKind.Dog => 1.4, AgentKind.Child => 1.1, _ => 1.0 };

    /// <summary>Det beboeren siger lige nu (taleboble), eller null.</summary>
    public string? Speech { get; set; }

    /// <summary>Rummet beboeren vandrer i; null betyder udendørs omkring <see cref="WanderAnchor"/>.</summary>
    public string? WanderRoomId { get; set; }
    public Vec2? WanderAnchor { get; set; }

    internal Vec2? Target { get; set; }

    /// <summary>Indendørs rute (waypoints) og de døre den går igennem.</summary>
    internal List<Vec2>? Path { get; set; }
    internal int PathIndex { get; set; }
    internal List<DoorCrossing> Crossings { get; set; } = [];
    internal double Travelled { get; set; }
    internal HashSet<string> HeldDoors { get; } = [];
    /// <summary>Hvidevare beboeren er på vej hen for at åbne (køleskab/fryser).</summary>
    internal ApplianceDef? PendingAppliance { get; set; }
    internal double IdleSeconds { get; set; }
    internal double SpeechRemaining { get; set; }
    internal double NextSpeechIn { get; set; }

    /// <summary>På vej til, eller står i, et "kærligheds-øjeblik" med en anden beboer (se <c>World.StepLove</c>).
    /// Mens dette er sat, overtager ikke den normale vandre-AI beboerens næste mål.</summary>
    internal bool InLoveMeeting { get; set; }
}
