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
            Exterior = [[0, 0], [20, 0], [20, 20], [0, 20]],
            InteriorWalls = [],
            Openings = [],
            Rooms = [
                new() { Id = "master_bedroom", Name = "Soveværelse", Floor = "wood", Poly = [[0, 0], [5, 0], [5, 5], [0, 5]] },
                new() { Id = "lisas_office", Name = "Kontor", Floor = "wood", Poly = [[5, 0], [10, 0], [10, 5], [5, 5]] },
                new() { Id = "maxemils_bedroom", Name = "Værelse 1", Floor = "wood", Poly = [[10, 0], [15, 0], [15, 5], [10, 5]] },
                new() { Id = "mathildes_bedroom", Name = "Værelse 2", Floor = "wood", Poly = [[15, 0], [20, 0], [20, 5], [15, 5]] },
                new() { Id = "kitchen_family_room", Name = "Køkken", Floor = "tile", Poly = [[0, 5], [10, 5], [10, 10], [0, 10]] },
                new() { Id = "kids_bathroom", Name = "Bad", Floor = "bathTile", Poly = [[10, 5], [15, 5], [15, 10], [10, 10]] }
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
        engine.StartNode(jointNode);

        var lisa = world.Agents.First(a => a.Id == "lisa");
        Assert.NotEqual("eating", lisa.Activity);

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

        world.MoveAgent("stephan", new Vec2(2, 2));

        Assert.False(stephan.InEvent);
    }

    [Fact]
    public void Interact_OpensAndCloses_Appliances()
    {
        var world = CreateTestWorld();
        world.House.Appliances.Add(new ApplianceDef("dishwasher", "dishwasher", [2, 2]));
        var engine = world.EventEngine;

        var openNode = new EventNode
        {
            Person = "lisa", Id = "I1",
            Trigger = new() { Type = "time", Value = "08:00" },
            Action = new() { Type = "interact", Target = new("point", "dishwasher"), State = "open" }
        };

        var closeNode = new EventNode
        {
            Person = "lisa", Id = "I2",
            Trigger = new() { Type = "passive" },
            Action = new() { Type = "interact", Target = new("point", "dishwasher"), State = "closed" }
        };

        engine.LoadNodes([openNode, closeNode]);

        engine.StartNode(openNode);
        engine.Tick(0.1);
        Assert.Contains("dishwasher", world.OpenDoors);

        engine.StartNode(closeNode);
        engine.Tick(0.1);
        Assert.DoesNotContain("dishwasher", world.OpenDoors);
    }

    [Fact]
    public void Chore_TidiesAndCompletes_AfterDuration()
    {
        var world = CreateTestWorld();
        world.House.Appliances.Add(new ApplianceDef("dishwasher", "dishwasher", [2, 2]));
        world.House.Appliances.Add(new ApplianceDef("sink", "tap", [3, 2]));
        var engine = world.EventEngine;

        var choreNode = new EventNode
        {
            Person = "lisa", Id = "C1",
            Trigger = new() { Type = "time", Value = "08:00" },
            Action = new()
            {
                Type = "chore",
                Points = ["dishwasher", "sink"],
                Activity = "tidying",
                Duration = new(0.5, 0.5)
            }
        };

        engine.LoadNodes([choreNode]);
        engine.StartNode(choreNode);

        var lisa = world.Agents.First(a => a.Id == "lisa");
        Assert.Equal("tidying", lisa.Activity);

        engine.Tick(0.6);

        Assert.Contains(("lisa", "C1"), engine.CompletedToday);
    }
}