using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;
using Xunit;

namespace Amballegaard.Simulation.Tests;

public class SpeechTests
{
    private static (HouseModel House, List<Agent> Agents) CreateWorldContext()
    {
        var house = new HouseModel
        {
            Name = "TestHouse",
            Exterior = [[0, 0], [20, 0], [20, 20], [0, 20]],
            InteriorWalls = [],
            Openings = [],
            Rooms = [
                new() { Id = "living_room", Name = "Stue", Floor = "wood", Poly = [[0, 0], [10, 0], [10, 10], [0, 10]] },
                new() { Id = "garage", Name = "Garage", Floor = "concrete", Poly = [[10, 0], [20, 0], [20, 10], [10, 10]] }
            ],
            Appliances = [
                new ApplianceDef("tv_living", "tv", [5, 5])
            ]
        };
        return (house, Family.Create().ToList());
    }

    [Fact]
    public void TvRemoteLine_Requires_Tv_In_Room()
    {
        var (house, agents) = CreateWorldContext();
        var stephan = agents.First(a => a.Id == "stephan");

        var tvLine = new SpeechLine(
            Text: "Har nogen set fjernbetjeningen?",
            RequiresApplianceInRoom: "tv");

        // I stuen (hvor der er et tv) -> SANDT
        Assert.True(tvLine.Fits(stephan, "living_room", TimeSpan.FromHours(19), house));

        // I garagen (hvor der ikke er tv) -> FALSKT
        Assert.False(tvLine.Fits(stephan, "garage", TimeSpan.FromHours(19), house));
    }

    [Fact]
    public void PleasantSmell_Is_Excluded_In_Garage()
    {
        var (house, agents) = CreateWorldContext();
        var stephan = agents.First(a => a.Id == "stephan");

        var smellLine = new SpeechLine(
            Text: "Her dufter godt!",
            ExcludeRooms: ["garage", "technical_room"]);

        // Stue -> SANDT
        Assert.True(smellLine.Fits(stephan, "living_room", TimeSpan.FromHours(12), house));

        // Garage -> FALSKT
        Assert.False(smellLine.Fits(stephan, "garage", TimeSpan.FromHours(12), house));
    }

    [Fact]
    public void Freezer_Defrost_Is_Adult_Only()
    {
        var agents = Family.Create();
        var maxemil = agents.First(a => a.Id == "maxemil");
        var stephan = agents.First(a => a.Id == "stephan");

        var adultDefrost = new ApplianceLineDef("freezer", "Vi skal afrime fryseren", Speaker: "Adult");

        Assert.False(adultDefrost.Fits(maxemil));
        Assert.True(adultDefrost.Fits(stephan));
    }

    [Fact]
    public void TimeRange_Filters_Out_Morning_Lines_In_Evening()
    {
        var (house, agents) = CreateWorldContext();
        var stephan = agents.First(a => a.Id == "stephan");

        var eveningLine = new SpeechLine(
            Text: "God aften",
            TimeRange: new SpeechTimeRange("18:00", "23:00"));

        // Kl. 12:00 -> FALSKT
        Assert.False(eveningLine.Fits(stephan, "living_room", TimeSpan.FromHours(12), house));

        // Kl. 20:00 -> SANDT
        Assert.True(eveningLine.Fits(stephan, "living_room", TimeSpan.FromHours(20), house));
    }
}