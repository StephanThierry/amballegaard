using Amballegaard.Simulation;
using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Tests;

public class HouseModelTests
{
    private static readonly string HousePath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "house.json"));

    private static HouseModel Load() => HouseModel.Load(HousePath);

    [Fact]
    public void Loads_all_rooms_from_floorplan()
    {
        var house = Load();
        Assert.Equal(15, house.Rooms.Count);
        Assert.Contains(house.Rooms, r => r.Id == "stue");
    }

    [Theory]
    [InlineData("stue", 4.41, 7.33)]
    [InlineData("garage", 7.62, 6.59)]
    [InlineData("v2", 3.33, 3.04)]
    [InlineData("walkin", 2.08, 2.33)]
    public void Room_sizes_match_floorplan_labels_within_tolerance(string id, double width, double depth)
    {
        var (min, max) = Load().Rooms.Single(r => r.Id == id).Bounds();
        // Polygonerne går til vægmidterlinjer, plantegningens mål er indvendige.
        Assert.InRange(max.X - min.X - width, -0.05, 0.3);
        Assert.InRange(max.Z - min.Z - depth, -0.05, 0.3);
    }

    [Fact]
    public void Rooms_do_not_overlap()
    {
        var house = Load();
        foreach (var a in house.Rooms)
        foreach (var b in house.Rooms.Where(b => b != a))
        {
            var rng = new Random(a.Id.GetHashCode() ^ b.Id.GetHashCode());
            for (var i = 0; i < 50; i++)
            {
                var p = Geometry.RandomPointIn(a, rng, 0.1);
                Assert.False(b.Contains(p), $"{a.Id} overlapper {b.Id} i {p}");
            }
        }
    }

    [Fact]
    public void Every_opening_lies_on_a_wall()
    {
        var house = Load();
        var ext = house.Exterior.Select(p => new Vec2(p[0], p[1])).ToArray();
        var segments = ext.Select((p, i) => (p, ext[(i + 1) % ext.Length]))
            .Concat(house.InteriorWalls.Select(w => (new Vec2(w.A[0], w.A[1]), new Vec2(w.B[0], w.B[1]))))
            .ToList();

        foreach (var o in house.Openings)
        {
            var onWall = segments.Any(s => DistanceToSegment(o.Position, s.Item1, s.Item2) < 0.05);
            Assert.True(onWall, $"Åbning {o.Id} ligger ikke på en væg");
        }
    }

    [Fact]
    public void Agents_walk_between_rooms_without_leaving_walkable_space()
    {
        var world = new World(Load(), Family.Create(), seed: 7);
        var visited = new HashSet<string>();
        for (var i = 0; i < 6000; i++)
        {
            world.Tick(0.1);
            foreach (var a in world.Agents)
            {
                Assert.True(world.Nav.IsWalkable(a.Position) || world.Nav.NearestWalkable(a.Position) is { } p && Vec2.Distance(p, a.Position) < 0.15,
                    $"{a.Id} står i en væg ved {a.Position}");
                visited.Add(a.Id + ":" + a.RoomId);
            }
        }
        // Mindst nogle beboere har været i et andet rum end deres eget.
        Assert.Contains(world.Agents, a => visited.Any(v => v.StartsWith(a.Id + ":") && !v.EndsWith(":" + a.HomeRoomId)));
    }

    [Fact]
    public void Path_from_stue_to_stephans_office_goes_through_doors()
    {
        var world = new World(Load(), Family.Create());
        var from = new Vec2(17.8, 12.0);
        var path = world.Nav.FindPath(from, new Vec2(21.8, 4.3));
        Assert.NotNull(path);
        var doors = world.Nav.DoorsOnPath(from, path!).Select(d => d.OpeningId).ToList();
        Assert.Contains("d-v1", doors);
    }

    [Fact]
    public void Door_opens_while_a_resident_walks_through_and_closes_after()
    {
        var world = new World(Load(), Family.Create(), seed: 3);
        var seenOpen = false;
        for (var i = 0; i < 8000 && !seenOpen; i++)
        {
            world.Tick(0.1);
            seenOpen = world.OpenDoors.Any(d => d.StartsWith("d-"));
        }
        Assert.True(seenOpen, "Ingen dør blev åbnet af en beboer");
        // Stop alle beboere: når ingen går, er ingen indvendige døre holdt åbne.
        foreach (var a in world.Agents) world.MoveAgent(a.Id, a.Position);
        Assert.DoesNotContain(world.OpenDoors, d => d.StartsWith("d-"));
    }

    [Fact]
    public void Dropped_agent_wanders_in_the_room_it_was_dropped_in()
    {
        var world = new World(Load(), Family.Create(), seed: 3);
        Assert.True(world.MoveAgent("maxemil", new Vec2(17.8, 11.8))); // stuen
        world.Tick(0.1);
        var max = world.Agents.Single(a => a.Id == "maxemil");
        Assert.Equal("stue", max.RoomId);
        Assert.Equal("stue", max.WanderRoomId);
    }

    [Fact]
    public void Agent_dropped_outdoors_stays_outside_the_house()
    {
        var house = Load();
        var world = new World(house, Family.Create(), seed: 5);
        world.SetActive("hund", true);
        Assert.True(world.MoveAgent("hund", new Vec2(4, 20)));
        var exterior = house.Exterior.Select(p => new Vec2(p[0], p[1])).ToArray();
        for (var i = 0; i < 2000; i++)
        {
            world.Tick(0.1);
            Assert.False(Geometry.PointInPolygon(world.Agents.Single(a => a.Id == "hund").Position, exterior));
        }
    }

    [Fact]
    public void Drop_on_a_wall_lands_beside_it_inside_a_room()
    {
        var world = new World(Load(), Family.Create());
        Assert.True(world.MoveAgent("lisa", new Vec2(20.07, 5.0)));
        var lisa = world.Agents.Single(a => a.Id == "lisa");
        Assert.InRange(Math.Abs(lisa.Position.X - 20.07), 0.29, 0.31);
        Assert.NotEqual("", lisa.RoomId);
    }

    [Fact]
    public void Residents_talk_with_lines_that_fit_them()
    {
        Assert.Equal(50, Speech.Lines.Count);
        var world = new World(Load(), Family.Create(), seed: 9);
        var heard = new HashSet<(string, string)>();
        for (var i = 0; i < 6000; i++)
        {
            world.Tick(0.1);
            foreach (var a in world.Agents.Where(a => a.Speech is not null)) heard.Add((a.Id, a.Speech!));
        }
        Assert.DoesNotContain(heard, h => h.Item1 == "hund"); // hunden er slået fra som standard
        Assert.DoesNotContain(heard, h => h.Item1 == "stephan" && h.Item2 == "Må jeg få noget slik?");
        Assert.DoesNotContain(heard, h => h.Item1 == "lisa" && h.Item2.Contains("bug"));
    }

    [Fact]
    public void Garage_door_toggles()
    {
        var world = new World(Load(), Family.Create());
        Assert.True(world.ToggleDoor("port-1"));
        Assert.Contains("port-1", world.OpenDoors);
        world.ToggleDoor("port-1");
        Assert.DoesNotContain("port-1", world.OpenDoors);
        Assert.False(world.ToggleDoor("findes-ikke"));
    }

    [Theory]
    [InlineData(7, 5.5, 29.5)]    // kl. 07 → næste solopgang er i morgen
    [InlineData(7, 21, 21)]       // kl. 07 → solnedgang samme dag
    [InlineData(22, 21, 45)]      // kl. 22 → solnedgang i morgen
    public void Jump_to_time_of_day_goes_forward_to_next_occurrence(double startHour, double target, double expectedHours)
    {
        var world = new World(Load(), Family.Create(), startTime: TimeSpan.FromHours(startHour));
        world.JumpToTimeOfDay(target);
        Assert.Equal(expectedHours, world.SimTime.TotalHours, 3);
    }

    [Fact]
    public void Fireplace_starts_lit_and_can_be_switched_off()
    {
        var world = new World(Load(), Family.Create());
        Assert.Contains("pejs", world.OpenDoors);
        Assert.True(world.ToggleDoor("pejs"));
        Assert.DoesNotContain("pejs", world.OpenDoors);
    }

    [Fact]
    public void Paths_go_around_furniture()
    {
        var world = new World(Load(), Family.Create());
        // En "sofa" midt i stuen mellem start og mål.
        world.SetObstacles([(new Vec2(16.5, 10.5), new Vec2(19.5, 11.5))]);
        var from = new Vec2(18, 9.2);
        var path = world.Nav.FindPath(from, new Vec2(18, 13))!;
        var a = from;
        foreach (var b in path)
        {
            for (var t = 0.0; t <= 1; t += 0.02)
            {
                var p = a + (b - a) * t;
                Assert.False(p.X > 16.5 && p.X < 19.5 && p.Z > 10.5 && p.Z < 11.5, $"ruten går gennem møblet ved {p}");
            }
            a = b;
        }
    }

    [Fact]
    public void Drop_on_furniture_lands_next_to_it()
    {
        var world = new World(Load(), Family.Create());
        world.SetObstacles([(new Vec2(16.5, 10.5), new Vec2(19.5, 11.5))]);
        Assert.True(world.MoveAgent("lisa", new Vec2(18, 11)));
        Assert.True(world.Nav.IsWalkable(world.Agents.Single(a => a.Id == "lisa").Position));
    }

    [Fact]
    public void Residents_standing_inside_new_furniture_are_moved_out()
    {
        var world = new World(Load(), Family.Create());
        var stephan = world.Agents.Single(a => a.Id == "stephan");
        var p = stephan.Position;
        world.SetObstacles([(p - new Vec2(0.5, 0.5), p + new Vec2(0.5, 0.5))]);
        Assert.True(world.Nav.IsWalkable(stephan.Position));
        Assert.True(Vec2.Distance(p, stephan.Position) > 0.5);
    }

    [Fact]
    public void Mower_mows_then_returns_to_charge_and_goes_back_out()
    {
        var world = new World(Load(), Family.Create());
        var m = world.Mower;
        var states = new List<MowerState>();
        for (var i = 0; i < 3000; i++) // 300 s
        {
            world.Tick(0.1);
            if (states.Count == 0 || states[^1] != m.State) states.Add(m.State);
        }
        Assert.Equal([MowerState.Charging, MowerState.Leaving, MowerState.Mowing, MowerState.Returning, MowerState.Charging, MowerState.Leaving], states.Take(6));
    }

    [Fact]
    public void Mower_switched_off_drives_home_and_stays_until_on()
    {
        var world = new World(Load(), Family.Create());
        var m = world.Mower;
        while (m.State != MowerState.Mowing) world.Tick(0.1);
        for (var i = 0; i < 100; i++) world.Tick(0.1);
        m.Toggle();
        Assert.Equal(MowerState.Returning, m.State);
        for (var i = 0; i < 3000; i++) world.Tick(0.1);
        Assert.Equal(MowerState.Charging, m.State);
        Assert.True(Vec2.Distance(m.Position, Mower.Dock) < 0.01);
        m.Toggle();
        for (var i = 0; i < 60; i++) world.Tick(0.1);
        Assert.NotEqual(MowerState.Charging, m.State);
    }

    [Fact]
    public void Residents_open_fridge_and_comment()
    {
        var world = new World(Load(), Family.Create(), seed: 4);
        var opened = false;
        for (var i = 0; i < 20000 && !opened; i++)
        {
            world.Tick(0.1);
            opened = world.OpenDoors.Contains("koeleskab") || world.OpenDoors.Contains("fryser");
        }
        Assert.True(opened, "Ingen åbnede køleskab eller fryser");
        Assert.Contains(world.Agents, a => a.Speech is not null &&
            (Speech.FridgeLines.Contains(a.Speech) || Speech.FreezerLines.Contains(a.Speech)));
        Assert.True(world.ToggleDoor("koeleskab"));
    }

    [Fact]
    public void Inactive_resident_does_not_move_and_can_be_switched_on()
    {
        var world = new World(Load(), Family.Create());
        var dog = world.Agents.Single(a => a.Id == "hund");
        Assert.False(dog.Active);
        var p = dog.Position;
        for (var i = 0; i < 600; i++) world.Tick(0.1);
        Assert.Equal(p, dog.Position);
        world.SetActive("hund", true);
        for (var i = 0; i < 600; i++) world.Tick(0.1);
        Assert.NotEqual(p, dog.Position);
    }

    [Fact]
    public void Bedside_lamp_cycles_off_half_full()
    {
        var world = new World(Load(), Family.Create());
        Assert.Equal(0, world.LampLevels.GetValueOrDefault("lampe-nord"));
        world.ToggleDoor("lampe-nord"); Assert.Equal(50, world.LampLevels["lampe-nord"]);
        world.ToggleDoor("lampe-nord"); Assert.Equal(100, world.LampLevels["lampe-nord"]);
        world.ToggleDoor("lampe-nord"); Assert.Equal(0, world.LampLevels["lampe-nord"]);
        Assert.DoesNotContain("lampe-nord", world.OpenDoors);
    }

    private static double DistanceToSegment(Vec2 p, Vec2 a, Vec2 b)
    {
        var ab = b - a;
        var t = Math.Clamp(((p.X - a.X) * ab.X + (p.Z - a.Z) * ab.Z) / (ab.X * ab.X + ab.Z * ab.Z), 0, 1);
        return Vec2.Distance(p, a + ab * t);
    }
}
