using Amballegaard.Simulation.Events;
using Xunit;

namespace Amballegaard.Simulation.Tests;

public class TimeTriggerTests
{
    private static EventNode CreateTimeNode(string person, string id, string time) => new()
    {
        Person = person,
        Id = id,
        Trigger = new() { Type = "time", Value = time },
        Action = new() { Type = "wait", Seconds = 1 }
    };

    [Fact]
    public void Crossing_FiresWhenTimeIsPassed()
    {
        var tracker = new TimeTriggerTracker();
        var node = CreateTimeNode("stephan", "T1", "08:00");
        var nodes = new[] { node };

        // 07:59 -> 08:01 krydser kl. 08:00
        var t0 = TimeSpan.FromHours(7.99);
        var t1 = TimeSpan.FromHours(8.01);

        var fired = tracker.EvaluateCrossing(t0, t1, nodes);

        Assert.Single(fired);
        Assert.Equal("T1", fired[0].Id);
    }

    [Fact]
    public void HighTimeScale_DoesNotMissEvent()
    {
        var tracker = new TimeTriggerTracker();
        var node = CreateTimeNode("stephan", "T1", "12:00");
        var nodes = new[] { node };

        // Kæmpe tidsspring fra kl. 08:00 til kl. 14:00 (fx 1200x speed)
        var t0 = TimeSpan.FromHours(8);
        var t1 = TimeSpan.FromHours(14);

        var fired = tracker.EvaluateCrossing(t0, t1, nodes);

        Assert.Single(fired);
        Assert.Equal("T1", fired[0].Id);
    }

    [Fact]
    public void DoesNotFireTwice_OnSameDay()
    {
        var tracker = new TimeTriggerTracker();
        var node = CreateTimeNode("stephan", "T1", "08:00");
        var nodes = new[] { node };

        // Første tick passerer kl. 08:00
        tracker.EvaluateCrossing(TimeSpan.FromHours(7.9), TimeSpan.FromHours(8.1), nodes);

        // Næste tick senere på samme dag
        var secondTick = tracker.EvaluateCrossing(TimeSpan.FromHours(8.1), TimeSpan.FromHours(8.2), nodes);

        Assert.Empty(secondTick);
    }

    [Fact]
    public void Rearms_OnNextDay()
    {
        var tracker = new TimeTriggerTracker();
        var node = CreateTimeNode("stephan", "T1", "08:00");
        var nodes = new[] { node };

        // Dag 0: Passer kl. 08:00
        var firedDay0 = tracker.EvaluateCrossing(TimeSpan.FromHours(7.9), TimeSpan.FromHours(8.1), nodes);
        Assert.Single(firedDay0);

        // Dag 1 (24 timer senere): Krydser kl. 08:00 på dag 1 (32 timer fra start)
        var tDay1Before = TimeSpan.FromDays(1) + TimeSpan.FromHours(7.9);
        var tDay1After = TimeSpan.FromDays(1) + TimeSpan.FromHours(8.1);

        var firedDay1 = tracker.EvaluateCrossing(tDay1Before, tDay1After, nodes);
        Assert.Single(firedDay1);
        Assert.Equal("T1", firedDay1[0].Id);
    }

    [Fact]
    public void PassiveNodes_AreIgnored()
    {
        var tracker = new TimeTriggerTracker();
        var passiveNode = new EventNode
        {
            Person = "stephan",
            Id = "P1",
            Trigger = new() { Type = "passive" },
            Action = new() { Type = "wait", Seconds = 1 }
        };

        var fired = tracker.EvaluateCrossing(TimeSpan.FromHours(0), TimeSpan.FromHours(23), [passiveNode]);
        Assert.Empty(fired);
    }
}