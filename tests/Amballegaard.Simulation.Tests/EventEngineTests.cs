using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.Events;
using Amballegaard.Simulation.House;
using Xunit;

namespace Amballegaard.Simulation.Tests;

public class EventEngineTests
{
    private static World CreateTestWorld()
    {
        var house = new HouseModel
        {
            Name = "TestHouse",
            Exterior = [[0, 0], [10, 0], [10, 10], [0, 10]],
            InteriorWalls = [],
            Openings = [],
            Rooms = [
                new() { Id = "master_bedroom", Name = "Soveværelse", Floor = "wood", Poly = [[0, 0], [5, 0], [5, 10], [0, 10]] },
                new() { Id = "kids_bathroom", Name = "Bad", Floor = "tile", Poly = [[5, 0], [10, 0], [10, 10], [5, 10]] }
            ]
        };
        return new World(house, Family.Create());
    }

    [Fact]
    public void Sequence_Executes_Wait_And_SetState_Across_Agents()
    {
        var world = CreateTestWorld();
        var engine = world.EventEngine;

        var node1 = new EventNode
        {
            Person = "stephan",
            Id = "N1",
            Trigger = new() { Type = "time", Value = "08:00" },
            Action = new() { Type = "wait", Seconds = 0.2 },
            Oncomplete = [new() { Person = "maxemil", Id = "N2" }]
        };

        var node2 = new EventNode
        {
            Person = "maxemil",
            Id = "N2",
            Trigger = new() { Type = "passive" },
            Action = new() { Type = "setState", Activity = "sleeping" }
        };

        engine.LoadNodes([node1, node2]);
        engine.StartNode(node1);

        var stephan = world.Agents.First(a => a.Id == "stephan");
        var maxemil = world.Agents.First(a => a.Id == "maxemil");

        Assert.True(stephan.InEvent);

        // Tick 0.3s (passerer wait-tiden)
        engine.Tick(0.3);

        Assert.False(stephan.InEvent);
        Assert.Equal("sleeping", maxemil.Activity);
        Assert.Contains(("maxemil", "N2"), engine.CompletedToday);
    }

    [Fact]
    public void WaitFor_WaitsUntilAllDependenciesAreDone()
    {
        var world = CreateTestWorld();
        var engine = world.EventEngine;

        var stephanDone = new EventNode
        {
            Person = "stephan", Id = "S1",
            Trigger = new() { Type = "time", Value = "08:00" },
            Action = new() { Type = "wait", Seconds = 0.5 }
        };

        var jointNode = new EventNode
        {
            Person = "lisa", Id = "L1",
            Trigger = new() { Type = "passive" },
            Action = new() { Type = "setState", Activity = "eating" },
            WaitFor = [new() { Person = "stephan", Id = "S1" }]
        };

        engine.LoadNodes([stephanDone, jointNode]);
        engine.StartNode(stephanDone);
        engine.StartNode(jointNode); // Prøver at starte L1 før S1 er færdig

        var lisa = world.Agents.First(a => a.Id == "lisa");
        Assert.NotEqual("eating", lisa.Activity);

        // Tick 0.6s -> S1 færdiggøres -> L1 låses op og kører
        engine.Tick(0.6);

        Assert.Equal("eating", lisa.Activity);
    }

    [Fact]
    public void DragDrop_Cancels_EventChain_Cleanly()
    {
        var world = CreateTestWorld();
        var engine = world.EventEngine;

        var node = new EventNode
        {
            Person = "stephan", Id = "LONG_WAIT",
            Trigger = new() { Type = "time", Value = "08:00" },
            Action = new() { Type = "wait", Seconds = 60.0 }
        };

        engine.LoadNodes([node]);
        engine.StartNode(node);

        var stephan = world.Agents.First(a => a.Id == "stephan");
        Assert.True(stephan.InEvent);

        // Brugeren flytter Stephan
        world.MoveAgent("stephan", new Vec2(2, 2));

        Assert.False(stephan.InEvent);
    }
}