using System.Globalization;

namespace Amballegaard.Simulation.Events;

/// <summary>
/// Håndterer detektering af tids-triggere i simulationens døgnrytme (jf. dagsplan-motor.md §3.1).
/// Sikrer krydsningsdetektion, daglig rearming og beskyttelse mod dobbelt-affyring ved tidsspring.
/// </summary>
public sealed class TimeTriggerTracker
{
    private int _currentDay = -1;
    private readonly HashSet<string> _firedNodeKeysForToday = new(StringComparer.Ordinal);

    /// <summary>Aktuel simuleret dag (0 = dag 1).</summary>
    public int CurrentDay => _currentDay;

    /// <summary>Antal triggers der er affyret på den nuværende dag.</summary>
    public int FiredTodayCount => _firedNodeKeysForToday.Count;

    /// <summary>
    /// Evaluerer et tidsinterval [prevSimTime, currentSimTime) og returnerer alle EventNodes,
    /// hvis klokkeslæt blev krydset i intervallet, og som ikke allerede er fyret i dag.
    /// </summary>
    public List<EventNode> EvaluateCrossing(
        TimeSpan prevSimTime,
        TimeSpan currentSimTime,
        IEnumerable<EventNode> nodes)
    {
        var triggered = new List<EventNode>();
        if (currentSimTime <= prevSimTime)
        {
            // Tiden stod stille eller sprang baglæns — ingen fremadrettede triggers fyrer
            return triggered;
        }

        var dayNow = (int)Math.Floor(currentSimTime.TotalDays);

        // Nyt døgn: Rearm alle triggers
        if (dayNow != _currentDay)
        {
            _currentDay = dayNow;
            _firedNodeKeysForToday.Clear();
        }

        foreach (var node in nodes)
        {
            if (node.Trigger.Type != "time" || string.IsNullOrWhiteSpace(node.Trigger.Value))
                continue;

            var nodeKey = $"{node.Person}:{node.Id}";
            if (_firedNodeKeysForToday.Contains(nodeKey))
                continue; // Allerede kørt i dag

            if (!TryParseTimeOfDay(node.Trigger.Value, out var triggerTimeOfDay))
                continue;

            // Beregn det absolutte tidspunkt for triggeren på den aktuelle simulerede dag
            var scheduledSimTime = TimeSpan.FromDays(dayNow) + triggerTimeOfDay;

            // Krydsningstjek: Triggeren ligger i intervallet [prevSimTime, currentSimTime]
            if (prevSimTime < scheduledSimTime && currentSimTime >= scheduledSimTime)
            {
                _firedNodeKeysForToday.Add(nodeKey);
                triggered.Add(node);
            }
        }

        return triggered;
    }

    /// <summary>
    /// Kaldes ved manuelle tidsspring (fx JumpToTimeOfDay/ShiftTime), hvor man ønsker
    /// at markere forpassede noder som overståede, så de ikke fyrer retrospektivt.
    /// </summary>
    public void FastForwardTo(TimeSpan newSimTime, IEnumerable<EventNode> nodes)
    {
        var dayNow = (int)Math.Floor(newSimTime.TotalDays);
        if (dayNow != _currentDay)
        {
            _currentDay = dayNow;
            _firedNodeKeysForToday.Clear();
        }

        var timeOfDay = newSimTime - TimeSpan.FromDays(dayNow);

        foreach (var node in nodes)
        {
            if (node.Trigger.Type != "time" || string.IsNullOrWhiteSpace(node.Trigger.Value))
                continue;

            if (TryParseTimeOfDay(node.Trigger.Value, out var t) && t <= timeOfDay)
            {
                _firedNodeKeysForToday.Add($"{node.Person}:{node.Id}");
            }
        }
    }

    public static bool TryParseTimeOfDay(string value, out TimeSpan time)
    {
        if (TimeSpan.TryParseExact(value, ["hh\\:mm", "h\\:mm", "hh\\:mm\\:ss"], CultureInfo.InvariantCulture, out time))
        {
            return true;
        }
        return TimeSpan.TryParse(value, CultureInfo.InvariantCulture, out time);
    }
}