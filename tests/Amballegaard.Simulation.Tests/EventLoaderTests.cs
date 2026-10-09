using Amballegaard.Simulation.Events;
using Xunit;

namespace Amballegaard.Simulation.Tests;

public class EventLoaderTests
{
    private static EventIndex CreateTestIndex() => new(
        Rooms: [new("kids_bathroom", "Badeværelse"), new("kitchen", "Køkken")],
        Persons: [new("stephan", "Stephan", "Adult", "master_bedroom"), new("maxemil", "Max-Emil", "Child", "kids_room")],
        Points: [new("dishwasher", "dishwasher", "kitchen")]
    );

    [Fact]
    public void ParseContent_AcceptsRawArray_AndIntIds()
    {
        const string json = """
        [
          {
            "person": "stephan",
            "id": 12,
            "trigger": { "type": "time", "value": "19:30" },
            "action": { "type": "goto", "target": { "kind": "person", "value": "maxemil" } },
            "oncomplete": [ { "person": "stephan", "id": 13 } ]
          },
          {
            "person": "stephan",
            "id": "13",
            "trigger": { "type": "passive" },
            "action": { "type": "speak", "text": "Godnat!" }
          }
        ]
        """;

        var nodes = EventLoader.ParseContent(json);
        Assert.Equal(2, nodes.Count);
        Assert.Equal("12", nodes[0].Id);
        Assert.Equal("13", nodes[1].Id);
    }

    [Fact]
    public void Validator_DetectsOrphanPassiveNode()
    {
        var nodes = new List<EventNode>
        {
            new()
            {
                Person = "stephan",
                Id = "orphan_node",
                Trigger = new() { Type = "passive" },
                Action = new() { Type = "wait", Seconds = 5 }
            }
        };

        var report = EventValidator.Validate(nodes, CreateTestIndex());
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Message.Contains("orphan"));
    }

    [Fact]
    public void Validator_DetectsDanglingReference()
    {
        var nodes = new List<EventNode>
        {
            new()
            {
                Person = "stephan",
                Id = "root",
                Trigger = new() { Type = "time", Value = "08:00" },
                Action = new() { Type = "wait", Seconds = 5 },
                Oncomplete = [new() { Person = "stephan", Id = "non_existing" }]
            }
        };

        var report = EventValidator.Validate(nodes, CreateTestIndex());
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Message.Contains("Dangling"));
    }

    [Fact]
    public void Validator_DetectsCycle()
    {
        var nodes = new List<EventNode>
        {
            new()
            {
                Person = "stephan",
                Id = "A",
                Trigger = new() { Type = "time", Value = "08:00" },
                Action = new() { Type = "wait", Seconds = 1 },
                Oncomplete = [new() { Person = "stephan", Id = "B" }]
            },
            new()
            {
                Person = "stephan",
                Id = "B",
                Trigger = new() { Type = "passive" },
                Action = new() { Type = "wait", Seconds = 1 },
                Oncomplete = [new() { Person = "stephan", Id = "A" }]
            }
        };

        var report = EventValidator.Validate(nodes, CreateTestIndex());
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Message.Contains("Cyklus"));
    }

    [Fact]
    public void Validator_FlagsTimeCollisionAsWarning()
    {
        var nodes = new List<EventNode>
        {
            new()
            {
                Person = "stephan",
                Id = "T1",
                Trigger = new() { Type = "time", Value = "08:00" },
                Action = new() { Type = "wait", Seconds = 1 }
            },
            new()
            {
                Person = "stephan",
                Id = "T2",
                Trigger = new() { Type = "time", Value = "08:00" },
                Action = new() { Type = "wait", Seconds = 1 }
            }
        };

        var report = EventValidator.Validate(nodes, CreateTestIndex());
        Assert.True(report.IsValid);
        Assert.Contains(report.Warnings, w => w.Message.Contains("Flere time-triggers"));
    }

    [Fact]
    public void Validator_ValidatesTargetsAgainstIndex()
    {
        var nodes = new List<EventNode>
        {
            new()
            {
                Person = "stephan",
                Id = "G1",
                Trigger = new() { Type = "time", Value = "08:00" },
                Action = new() { Type = "goto", Target = new("room", "non_existing_room") }
            }
        };

        var report = EventValidator.Validate(nodes, CreateTestIndex());
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Message.Contains("Rum-id 'non_existing_room' findes ikke"));
    }

    [Fact]
    public void Loader_IgnoresIndexJsonFile()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempDir);
        try
        {
            File.WriteAllText(Path.Combine(tempDir, "index.json"), "{}");
            File.WriteAllText(Path.Combine(tempDir, "stephan.json"), """
            [
              {
                "person": "stephan",
                "id": "1",
                "trigger": { "type": "time", "value": "07:00" },
                "action": { "type": "wait", "seconds": 10 }
              }
            ]
            """);

            var loaded = EventLoader.LoadDirectory(tempDir);
            Assert.Single(loaded);
            Assert.Equal("stephan", loaded[0].Person);
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }
}