using System.Text.Json;
using System.Text.Json.Serialization;

namespace Amballegaard.Simulation.House;

/// <summary>Husets geometri som beskrevet i data/house.json. Koordinater i meter: x mod øst (plan højre), z mod syd (plan ned).</summary>
public sealed record HouseModel
{
    public required string Name { get; init; }
    public double NorthAngleDeg { get; init; }
    public double WallHeight { get; init; } = 2.6;
    public double ExteriorWallThickness { get; init; } = 0.34;
    public double InteriorWallThickness { get; init; } = 0.12;
    public required double[][] Exterior { get; init; }
    public required List<WallDef> InteriorWalls { get; init; }
    public required List<OpeningDef> Openings { get; init; }
    public required List<RoomDef> Rooms { get; init; }
    public SiteDef? Site { get; init; }
    public List<ApplianceDef> Appliances { get; init; } = [];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    public static HouseModel Load(string path) =>
        JsonSerializer.Deserialize<HouseModel>(File.ReadAllText(path), JsonOptions)
        ?? throw new InvalidDataException($"Kunne ikke læse {path}");

    public RoomDef? RoomAt(Vec2 p) => Rooms.FirstOrDefault(r => r.Contains(p));
}

public sealed record SiteDef(double[][] Bounds);

/// <summary>Køleskab/fryser m.m. der kan åbnes; <c>StandAt</c> er hvor en beboer stiller sig for at åbne det.</summary>
public sealed record ApplianceDef(string Id, string Kind, double[] StandAt)
{
    [JsonIgnore] public Vec2 Stand => new(StandAt[0], StandAt[1]);
}

public sealed record WallDef(string Id, double[] A, double[] B, double? Thickness = null);

public sealed record OpeningDef
{
    public required string Id { get; init; }
    public required double[] At { get; init; }
    public double Width { get; init; }
    public double? Height { get; init; }
    public double? Sill { get; init; }
    public required string Type { get; init; }
    public int Leaves { get; init; } = 1;

    [JsonIgnore] public Vec2 Position => new(At[0], At[1]);
    [JsonIgnore] public bool IsPassable => Type is "door" or "frenchDoor" or "slidingDoor" or "glassDoor" or "exteriorDoor" or "frontDoor" or "garageDoor";
}

public sealed record RoomDef
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Floor { get; init; }
    public required double[][] Poly { get; init; }

    [JsonIgnore] public IReadOnlyList<Vec2> Polygon => _polygon ??= Poly.Select(p => new Vec2(p[0], p[1])).ToArray();
    private Vec2[]? _polygon;

    public bool Contains(Vec2 p) => Geometry.PointInPolygon(p, Polygon);

    public (Vec2 Min, Vec2 Max) Bounds()
    {
        var xs = Polygon.Select(p => p.X).ToArray();
        var zs = Polygon.Select(p => p.Z).ToArray();
        return (new Vec2(xs.Min(), zs.Min()), new Vec2(xs.Max(), zs.Max()));
    }
}
