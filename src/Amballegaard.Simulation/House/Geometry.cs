namespace Amballegaard.Simulation.House;

public readonly record struct Vec2(double X, double Z)
{
    public static Vec2 operator +(Vec2 a, Vec2 b) => new(a.X + b.X, a.Z + b.Z);
    public static Vec2 operator -(Vec2 a, Vec2 b) => new(a.X - b.X, a.Z - b.Z);
    public static Vec2 operator *(Vec2 a, double s) => new(a.X * s, a.Z * s);
    public double Length => Math.Sqrt(X * X + Z * Z);
    public Vec2 Normalized => Length < 1e-9 ? default : this * (1 / Length);
    public static double Distance(Vec2 a, Vec2 b) => (a - b).Length;
    public override string ToString() => $"({X:0.##}, {Z:0.##})";
}

public static class Geometry
{
    public static bool PointInPolygon(Vec2 p, IReadOnlyList<Vec2> poly)
    {
        var inside = false;
        for (int i = 0, j = poly.Count - 1; i < poly.Count; j = i++)
        {
            var a = poly[i];
            var b = poly[j];
            if ((a.Z > p.Z) != (b.Z > p.Z) && p.X < (b.X - a.X) * (p.Z - a.Z) / (b.Z - a.Z) + a.X)
                inside = !inside;
        }
        return inside;
    }

    /// <summary>Tilfældigt punkt i polygonen med mindst <paramref name="margin"/> til kanten (rejection sampling).</summary>
    public static Vec2 RandomPointIn(RoomDef room, Random rng, double margin = 0.5)
    {
        var (min, max) = room.Bounds();
        for (var i = 0; i < 200; i++)
        {
            var p = new Vec2(
                min.X + margin + rng.NextDouble() * Math.Max(0, max.X - min.X - 2 * margin),
                min.Z + margin + rng.NextDouble() * Math.Max(0, max.Z - min.Z - 2 * margin));
            if (room.Contains(p)
                && room.Contains(p + new Vec2(margin, 0)) && room.Contains(p - new Vec2(margin, 0))
                && room.Contains(p + new Vec2(0, margin)) && room.Contains(p - new Vec2(0, margin)))
                return p;
        }
        return new Vec2((min.X + max.X) / 2, (min.Z + max.Z) / 2);
    }
}
