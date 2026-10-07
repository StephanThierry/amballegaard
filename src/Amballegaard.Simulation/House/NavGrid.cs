namespace Amballegaard.Simulation.House;

/// <summary>En dør som en rute går igennem: dørens id og hvor langt henne ad ruten (i meter) den krydses.</summary>
public sealed record DoorCrossing(string OpeningId, Vec2 At, double Distance);

/// <summary>
/// Gangbart gitter (10 cm celler) over husets indre, genereret fra vægge og åbninger i house.json.
/// Vægge blokerer med en sikkerhedsafstand; døre (alle gangbare åbningstyper) skæres ud som passager.
/// Udenfor huset er alt blokeret — udendørs bevægelse håndteres separat i <see cref="World"/>.
/// </summary>
public sealed class NavGrid
{
    public const double Cell = 0.1;
    private const double Clearance = 0.2;

    /// <summary>Sikkerhedsafstand omkring møbler (en beboers "radius").</summary>
    private const double FurnitureClearance = 0.16;

    private readonly bool[] _walkable;
    /// <summary>Gangbart fra vægge alene — møbler lægges ovenpå i <see cref="_walkable"/>.</summary>
    private readonly bool[] _baseWalkable;
    private readonly int _w, _h;
    private readonly double _x0, _z0;
    private readonly List<(OpeningDef Opening, Vec2 A, Vec2 B)> _doors = [];

    public NavGrid(HouseModel house)
    {
        var ext = house.Exterior.Select(p => new Vec2(p[0], p[1])).ToArray();
        _x0 = ext.Min(p => p.X); _z0 = ext.Min(p => p.Z);
        _w = (int)Math.Ceiling((ext.Max(p => p.X) - _x0) / Cell) + 1;
        _h = (int)Math.Ceiling((ext.Max(p => p.Z) - _z0) / Cell) + 1;
        _walkable = new bool[_w * _h];

        var walls = ext.Select((p, i) => (A: p, B: ext[(i + 1) % ext.Length], T: house.ExteriorWallThickness))
            .Concat(house.InteriorWalls.Select(w => (A: new Vec2(w.A[0], w.A[1]), B: new Vec2(w.B[0], w.B[1]), T: w.Thickness ?? house.InteriorWallThickness)))
            .ToList();

        // Dørpassager: find væggen hver gangbar åbning sidder i, så vi kender dens retning og tykkelse.
        var passages = new List<(Vec2 Center, Vec2 Dir, double HalfWidth, double HalfDepth)>();
        foreach (var o in house.Openings.Where(o => o.IsPassable))
        {
            var wall = walls.MinBy(w => DistanceToSegment(o.Position, w.A, w.B));
            var dir = (wall.B - wall.A).Normalized;
            passages.Add((o.Position, dir, o.Width / 2 - 0.06, wall.T / 2 + Clearance + 0.05));
            _doors.Add((o, o.Position - dir * (o.Width / 2), o.Position + dir * (o.Width / 2)));
        }

        for (var j = 0; j < _h; j++)
        for (var i = 0; i < _w; i++)
        {
            var p = CellCenter(i, j);
            if (!Geometry.PointInPolygon(p, ext)) continue;
            var blocked = walls.Any(w => DistanceToSegment(p, w.A, w.B) < w.T / 2 + Clearance);
            if (blocked && passages.Any(d => InPassage(p, d))) blocked = false;
            _walkable[j * _w + i] = !blocked;
        }
        _baseWalkable = (bool[])_walkable.Clone();
    }

    /// <summary>Møblernes fodaftryk (akse-rettede rektangler i meter). Erstatter tidligere forhindringer.</summary>
    public void SetObstacles(IEnumerable<(Vec2 Min, Vec2 Max)> rects)
    {
        Array.Copy(_baseWalkable, _walkable, _walkable.Length);
        foreach (var (min, max) in rects)
        {
            var (i0, j0) = ToCell(new Vec2(min.X - FurnitureClearance, min.Z - FurnitureClearance));
            var (i1, j1) = ToCell(new Vec2(max.X + FurnitureClearance, max.Z + FurnitureClearance));
            for (var j = Math.Max(0, j0); j <= Math.Min(_h - 1, j1); j++)
            for (var i = Math.Max(0, i0); i <= Math.Min(_w - 1, i1); i++)
                _walkable[j * _w + i] = false;
        }
    }

    public bool IsWalkable(Vec2 p)
    {
        var (i, j) = ToCell(p);
        return i >= 0 && j >= 0 && i < _w && j < _h && _walkable[j * _w + i];
    }

    /// <summary>Nærmeste gangbare punkt (søger udad i ringe), eller null hvis intet inden for 1,5 m.</summary>
    public Vec2? NearestWalkable(Vec2 p)
    {
        if (IsWalkable(p)) return p;
        var (ci, cj) = ToCell(p);
        for (var r = 1; r <= 15; r++)
        for (var dj = -r; dj <= r; dj++)
        for (var di = -r; di <= r; di++)
        {
            if (Math.Max(Math.Abs(di), Math.Abs(dj)) != r) continue;
            int i = ci + di, j = cj + dj;
            if (i >= 0 && j >= 0 && i < _w && j < _h && _walkable[j * _w + i]) return CellCenter(i, j);
        }
        return null;
    }

    /// <summary>A* med 8 naboer og efterfølgende udglatning (line-of-sight). Returnerer waypoints uden startpunktet.</summary>
    public List<Vec2>? FindPath(Vec2 from, Vec2 to)
    {
        if (NearestWalkable(from) is not { } s || NearestWalkable(to) is not { } g) return null;
        var start = ToCell(s); var goal = ToCell(g);
        int Idx((int I, int J) c) => c.J * _w + c.I;

        var gScore = new Dictionary<int, double> { [Idx(start)] = 0 };
        var came = new Dictionary<int, int>();
        var open = new PriorityQueue<(int I, int J), double>();
        open.Enqueue(start, 0);
        var closed = new HashSet<int>();
        double H((int I, int J) c) => Math.Sqrt((c.I - goal.I) * (c.I - goal.I) + (c.J - goal.J) * (c.J - goal.J));

        while (open.TryDequeue(out var cur, out _))
        {
            var ci = Idx(cur);
            if (!closed.Add(ci)) continue;
            if (cur == goal) break;
            for (var dj = -1; dj <= 1; dj++)
            for (var di = -1; di <= 1; di++)
            {
                if (di == 0 && dj == 0) continue;
                var n = (I: cur.I + di, J: cur.J + dj);
                if (n.I < 0 || n.J < 0 || n.I >= _w || n.J >= _h || !_walkable[Idx(n)]) continue;
                // Ingen diagonal genvej hen over et hjørne.
                if (di != 0 && dj != 0 && (!_walkable[cur.J * _w + n.I] || !_walkable[n.J * _w + cur.I])) continue;
                var ng = gScore[ci] + (di != 0 && dj != 0 ? 1.4142 : 1);
                var ni = Idx(n);
                if (gScore.TryGetValue(ni, out var old) && old <= ng) continue;
                gScore[ni] = ng; came[ni] = ci;
                open.Enqueue(n, ng + H(n));
            }
        }
        if (!came.ContainsKey(Idx(goal)) && start != goal) return null;

        var cells = new List<Vec2>();
        for (var c = Idx(goal); ; c = came[c])
        {
            cells.Add(CellCenter(c % _w, c / _w));
            if (!came.ContainsKey(c)) break;
        }
        cells.Reverse();
        cells[^1] = g;

        // Udglatning: spring waypoints over så længe der er frit udsyn.
        var path = new List<Vec2>();
        var anchor = s;
        for (var k = 1; k < cells.Count; k++)
        {
            if (!LineOfSight(anchor, cells[k]))
            {
                path.Add(cells[k - 1]);
                anchor = cells[k - 1];
            }
        }
        path.Add(g);
        return path;
    }

    /// <summary>Døre som ruten (fra <paramref name="from"/> gennem waypoints) krydser, i rækkefølge.</summary>
    public List<DoorCrossing> DoorsOnPath(Vec2 from, IReadOnlyList<Vec2> path)
    {
        var result = new List<DoorCrossing>();
        var travelled = 0.0;
        var a = from;
        foreach (var b in path)
        {
            foreach (var (o, da, db) in _doors)
                if (SegmentIntersection(a, b, da, db) is { } t)
                    result.Add(new DoorCrossing(o.Id, a + (b - a) * t, travelled + Vec2.Distance(a, b) * t));
            travelled += Vec2.Distance(a, b);
            a = b;
        }
        return result.OrderBy(c => c.Distance).ToList();
    }

    private bool LineOfSight(Vec2 a, Vec2 b)
    {
        var len = Vec2.Distance(a, b);
        // Tætte prøver + lille margen til siderne, så en lige linje aldrig snitter et blokeret hjørne.
        var steps = Math.Max(1, (int)(len / (Cell * 0.25)));
        const double m = 0.045;
        for (var k = 0; k <= steps; k++)
        {
            var p = a + (b - a) * (k / (double)steps);
            if (!IsWalkable(p) || !IsWalkable(p + new Vec2(m, 0)) || !IsWalkable(p - new Vec2(m, 0))
                || !IsWalkable(p + new Vec2(0, m)) || !IsWalkable(p - new Vec2(0, m))) return false;
        }
        return true;
    }

    private (int I, int J) ToCell(Vec2 p) => ((int)Math.Floor((p.X - _x0) / Cell), (int)Math.Floor((p.Z - _z0) / Cell));
    private Vec2 CellCenter(int i, int j) => new(_x0 + (i + 0.5) * Cell, _z0 + (j + 0.5) * Cell);

    private static bool InPassage(Vec2 p, (Vec2 Center, Vec2 Dir, double HalfWidth, double HalfDepth) d)
    {
        var rel = p - d.Center;
        var along = rel.X * d.Dir.X + rel.Z * d.Dir.Z;
        var across = -rel.X * d.Dir.Z + rel.Z * d.Dir.X;
        return Math.Abs(along) <= d.HalfWidth && Math.Abs(across) <= d.HalfDepth;
    }

    private static double DistanceToSegment(Vec2 p, Vec2 a, Vec2 b)
    {
        var ab = b - a;
        var t = Math.Clamp(((p.X - a.X) * ab.X + (p.Z - a.Z) * ab.Z) / (ab.X * ab.X + ab.Z * ab.Z), 0, 1);
        return Vec2.Distance(p, a + ab * t);
    }

    /// <summary>Parameter t∈[0,1] på p1→p2 hvor den skærer q1→q2, eller null.</summary>
    private static double? SegmentIntersection(Vec2 p1, Vec2 p2, Vec2 q1, Vec2 q2)
    {
        var r = p2 - p1; var s = q2 - q1;
        var den = r.X * s.Z - r.Z * s.X;
        if (Math.Abs(den) < 1e-9) return null;
        var qp = q1 - p1;
        var t = (qp.X * s.Z - qp.Z * s.X) / den;
        var u = (qp.X * r.Z - qp.Z * r.X) / den;
        return t is >= 0 and <= 1 && u is >= 0 and <= 1 ? t : null;
    }
}
