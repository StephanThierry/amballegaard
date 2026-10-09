using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.Events;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Tests;

public class EventIndexTests
{
    private static readonly string HousePath = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "data", "house.json"));

    private static EventIndex Build() => EventIndexWriter.Build(HouseModel.Load(HousePath), Family.Create());

    [Fact]
    public void Includes_every_room_with_its_name()
    {
        var index = Build();
        var house = HouseModel.Load(HousePath);
        Assert.Equal(house.Rooms.Count, index.Rooms.Count);
        Assert.Contains(index.Rooms, r => r.Id == "badN" && r.Name == "Badeværelse");
    }

    [Fact]
    public void Includes_every_agent_with_kind_and_home_room()
    {
        var index = Build();
        Assert.Equal(Family.Create().Count, index.Persons.Count);
        Assert.Contains(index.Persons, p => p.Id == "maxemil" && p.Kind == "Child" && p.HomeRoomId == "v2");
        Assert.Contains(index.Persons, p => p.Id == "stephan" && p.Kind == "Adult");
    }

    [Fact]
    public void Includes_every_appliance_as_a_point_with_its_room()
    {
        var index = Build();
        var house = HouseModel.Load(HousePath);
        Assert.Equal(house.Appliances.Count, index.Points.Count);

        var dishwasher = Assert.Single(index.Points, p => p.Id == "koekkenoe-opvask");
        Assert.Equal("dishwasher", dishwasher.Kind);
        Assert.NotNull(dishwasher.RoomId);
    }

    [Fact]
    public void Write_produces_a_json_file_with_all_three_sections()
    {
        var path = Path.Combine(Path.GetTempPath(), $"amballegaard-event-index-{Guid.NewGuid():N}.json");
        try
        {
            EventIndexWriter.Write(HouseModel.Load(HousePath), Family.Create(), path);
            var json = File.ReadAllText(path);
            Assert.Contains("\"rooms\"", json);
            Assert.Contains("\"persons\"", json);
            Assert.Contains("\"points\"", json);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
