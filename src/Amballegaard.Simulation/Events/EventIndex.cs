using System.Text.Json;
using System.Text.Json.Serialization;
using Amballegaard.Simulation.Agents;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Events;

/// <summary>Ét rum, med dets id og navn, som det fremgår af <c>data/house.json</c>.</summary>
public sealed record RoomEntry(string Id, string Name);

/// <summary>Én beboer, med dens id, navn, art og hjemmerum, som i <see cref="Family.Create"/>.</summary>
public sealed record PersonEntry(string Id, string Name, string Kind, string HomeRoomId);

/// <summary>Et navngivet interaktionspunkt (i dag kun apparaters <c>standAt</c>) og hvilket rum det ligger i.</summary>
public sealed record PointEntry(string Id, string Kind, string? RoomId);

/// <summary>
/// Dagsplan-motorens ID-indeks (<c>docs/dagsplan-motor.md</c> §9.2): alle id'er en event-fil kan
/// referere til. En uafhængig LLM-session slår op her i stedet for at læse husets geometrifil eller
/// C#-koden.
/// </summary>
public sealed record EventIndex(
    IReadOnlyList<RoomEntry> Rooms,
    IReadOnlyList<PersonEntry> Persons,
    IReadOnlyList<PointEntry> Points);

/// <summary>
/// Afleder <see cref="EventIndex"/> af <see cref="HouseModel"/> og beboerne — genereres altid, skrives
/// aldrig i hånden, så den ikke kan gå ud af sync med <c>data/house.json</c>/<see cref="Family"/>
/// (jf. CLAUDE.md's regel om at holde ID-indekset ajour).
/// </summary>
public static class EventIndexWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static EventIndex Build(HouseModel house, IEnumerable<Agent> agents)
    {
        var rooms = house.Rooms
            .Select(r => new RoomEntry(r.Id, r.Name))
            .OrderBy(r => r.Id, StringComparer.Ordinal)
            .ToList();

        var persons = agents
            .Select(a => new PersonEntry(a.Id, a.Name, a.Kind.ToString(), a.HomeRoomId))
            .OrderBy(p => p.Id, StringComparer.Ordinal)
            .ToList();

        // Kun apparater har i dag et navngivet standAt-punkt; udvides efterhånden som flere
        // interaktionspunkter (jf. plan-dokumentets afsnit 9.2) får brug for et.
        var points = house.Appliances
            .Select(a => new PointEntry(a.Id, a.Kind, house.RoomAt(a.Stand)?.Id))
            .OrderBy(p => p.Id, StringComparer.Ordinal)
            .ToList();

        return new EventIndex(rooms, persons, points);
    }

    /// <summary>Bygger indekset og skriver det til <paramref name="path"/> (opretter mappen om nødvendigt).</summary>
    public static void Write(HouseModel house, IEnumerable<Agent> agents, string path)
    {
        var index = Build(house, agents);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        File.WriteAllText(path, JsonSerializer.Serialize(index, JsonOptions));
    }
}
