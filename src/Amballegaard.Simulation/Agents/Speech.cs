using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amballegaard.Simulation.House;

namespace Amballegaard.Simulation.Agents;

public sealed record SpeechTimeRange(string From, string To);

/// <summary>
/// En replik med kontekstuelle filtre (jf. docs/speech-spec.md).
/// </summary>
public sealed record SpeechLine(
    string Text,
    string? Speaker = null,
    string[]? Speakers = null,
    string[]? Rooms = null,
    string[]? ExcludeRooms = null,
    string? RequiresApplianceInRoom = null,
    SpeechTimeRange? TimeRange = null,
    string[]? NotWhile = null,
    IReadOnlyList<string>? Responses = null)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static SpeechLine FromJson(string json) =>
        JsonSerializer.Deserialize<SpeechLine>(json, JsonOpts) ?? throw new JsonException("Ugyldig SpeechLine JSON");

    public bool Fits(Agent a) => Fits(a, a.RoomId, null, null);

    public bool Fits(Agent a, string? roomId, TimeSpan? simTime, HouseModel? house)
    {
        if (a.Kind == AgentKind.Dog) return false;

        var currentRoom = roomId ?? a.RoomId;

        // 1. Aktivitetstjek (fx ikke snakke i søvne medmindre tilladt)
        if (NotWhile is not null && NotWhile.Contains(a.Activity, StringComparer.OrdinalIgnoreCase))
            return false;
        if (string.Equals(a.Activity, "sleeping", StringComparison.OrdinalIgnoreCase))
            return false;

        // 2. Speaker-filter
        if (!MatchesSpeaker(a, Speaker, Speakers))
            return false;

        // 3. Rum-filter (hvidliste)
        if (Rooms is not null && Rooms.Length > 0 && !Rooms.Contains(currentRoom, StringComparer.OrdinalIgnoreCase))
            return false;

        // 4. Negativt rum-filter (sortliste - fx ikke garagen for "her dufter godt")
        if (ExcludeRooms is not null && ExcludeRooms.Contains(currentRoom, StringComparer.OrdinalIgnoreCase))
            return false;

        // 5. Krævet apparat i rummet (fx tv for fjernbetjening)
        if (!string.IsNullOrEmpty(RequiresApplianceInRoom) && house is not null)
        {
            var hasApp = house.Appliances.Any(app =>
                string.Equals(app.Kind, RequiresApplianceInRoom, StringComparison.OrdinalIgnoreCase)
                && string.Equals(house.RoomAt(app.Stand)?.Id, currentRoom, StringComparison.OrdinalIgnoreCase));

            if (!hasApp && string.Equals(RequiresApplianceInRoom, "fireplace", StringComparison.OrdinalIgnoreCase))
            {
                hasApp = house.Openings.Any(o =>
                    string.Equals(o.Type, "fireplace", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(house.RoomAt(o.Position)?.Id, currentRoom, StringComparison.OrdinalIgnoreCase));
            }

            if (!hasApp) return false;
        }

        // 6. Tidsinterval (klokkeslæt på dagen)
        if (TimeRange is not null && simTime.HasValue)
        {
            var tod = simTime.Value - TimeSpan.FromDays(Math.Floor(simTime.Value.TotalDays));
            if (TimeSpan.TryParse(TimeRange.From, CultureInfo.InvariantCulture, out var from) &&
                TimeSpan.TryParse(TimeRange.To, CultureInfo.InvariantCulture, out var to))
            {
                if (from <= to)
                {
                    if (tod < from || tod > to) return false;
                }
                else
                {
                    if (tod < from && tod > to) return false;
                }
            }
        }

        return true;
    }

    private static bool MatchesSpeaker(Agent a, string? speaker, string[]? speakers)
    {
        if (speakers is not null && speakers.Length > 0)
        {
            return speakers.Any(s => MatchSingle(a, s));
        }

        if (string.IsNullOrWhiteSpace(speaker)) return true;
        return MatchSingle(a, speaker);

        static bool MatchSingle(Agent agent, string s)
        {
            if (s.Equals("Anyone", StringComparison.OrdinalIgnoreCase)) return true;
            if (s.Equals("Adult", StringComparison.OrdinalIgnoreCase)) return agent.Kind == AgentKind.Adult;
            if (s.Equals("Child", StringComparison.OrdinalIgnoreCase)) return agent.Kind == AgentKind.Child;
            if (s.Equals("Dog", StringComparison.OrdinalIgnoreCase)) return agent.Kind == AgentKind.Dog;
            return string.Equals(agent.Id, s, StringComparison.OrdinalIgnoreCase);
        }
    }
}

public sealed record ApplianceLineDef(
    string PointKind,
    string Text,
    string? Speaker = null,
    string[]? Speakers = null,
    string[]? Rooms = null)
{
    public bool Fits(Agent? a)
    {
        if (a is null) return true;
        if (Speakers is not null && Speakers.Length > 0)
        {
            return Speakers.Any(s => MatchSpeaker(a, s));
        }
        if (string.IsNullOrWhiteSpace(Speaker)) return true;
        return MatchSpeaker(a, Speaker);

        static bool MatchSpeaker(Agent agent, string s)
        {
            if (s.Equals("Anyone", StringComparison.OrdinalIgnoreCase)) return true;
            if (s.Equals("Adult", StringComparison.OrdinalIgnoreCase)) return agent.Kind == AgentKind.Adult;
            if (s.Equals("Child", StringComparison.OrdinalIgnoreCase)) return agent.Kind == AgentKind.Child;
            return string.Equals(agent.Id, s, StringComparison.OrdinalIgnoreCase);
        }
    }
}

public sealed record ReactionLineDef(
    string Trigger, // "pickedUp" | "arrivalKiss"
    string Text,
    string? Speaker = null);

public sealed record LoveLine(string Speaker, string Text);
public sealed record LoveScript(IReadOnlyList<LoveLine> Lines, bool EndsWithKiss);

/// <summary>
/// Data-drevet motor for beboernes replikker og dialoger.
/// Scanner data/speech/*.json og understøtter live hot-reload.
/// </summary>
public static class Speech
{
    private static readonly object Lock = new();
    private static FileSystemWatcher? _watcher;
    private static HouseModel? _house;

    private static List<SpeechLine> _ambientLines = [];
    private static List<SpeechLine> _conversations = [];
    private static List<ApplianceLineDef> _applianceLines = [];
    private static List<ReactionLineDef> _reactionLines = [];
    private static List<LoveScript> _loveScripts = [];
    private static List<string> _dogLines = ["Vuf!", "Vuf vuf!", "*snøfter*", "Legetid?", "*logrer med halen*", "Grrr…"];

    public static IReadOnlyList<SpeechLine> Lines
    {
        get { lock (Lock) return _ambientLines; }
    }

    public static IReadOnlyList<SpeechLine> Conversations
    {
        get { lock (Lock) return _conversations; }
    }

    public static IReadOnlyList<string> DogLines
    {
        get { lock (Lock) return _dogLines; }
    }

    public static IReadOnlyList<string> ArrivalKissLines
    {
        get
        {
            lock (Lock)
            {
                var list = _reactionLines
                    .Where(r => r.Trigger.Equals("arrivalKiss", StringComparison.OrdinalIgnoreCase))
                    .Select(r => r.Text)
                    .ToList();
                return list.Count > 0 ? list : DefaultArrivalKiss;
            }
        }
    }

    private static readonly List<string> DefaultArrivalKiss =
    [
        "Uhhh der kom min kysti - dejligt",
        "Så fik man lige en kysti, skønt",
        "Nææh en kysti kom flyvende - lækkert",
        "En kysti! Haps haps",
        "Godag bedufti!",
        "Der kom lige en bedufti som ska ha et kys!",
        "Det koster et kys at komme flyvende"
    ];

    public static void LoadFromDirectory(string speechDir, HouseModel? house = null, bool enableHotReload = true)
    {
        _house = house;
        Reload(speechDir);

        if (enableHotReload && Directory.Exists(speechDir))
        {
            _watcher?.Dispose();
            _watcher = new FileSystemWatcher(speechDir, "*.json")
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
                EnableRaisingEvents = true
            };

            var timer = new System.Timers.Timer(150) { AutoReset = false };
            timer.Elapsed += (_, _) => Reload(speechDir);

            FileSystemEventHandler onChange = (_, _) =>
            {
                timer.Stop();
                timer.Start();
            };

            _watcher.Changed += onChange;
            _watcher.Created += onChange;
            _watcher.Deleted += onChange;
            _watcher.Renamed += (_, _) => onChange(null!, null!);
        }
    }

    public static void Reload(string speechDir)
    {
        lock (Lock)
        {
            if (!Directory.Exists(speechDir)) return;

            var jsonOpts = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                ReadCommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true
            };

            var ambientPath = Path.Combine(speechDir, "ambient.json");
            if (File.Exists(ambientPath))
            {
                try
                {
                    _ambientLines = JsonSerializer.Deserialize<List<SpeechLine>>(File.ReadAllText(ambientPath), jsonOpts) ?? [];
                }
                catch (Exception ex) { Console.Error.WriteLine($"[Speech] Fejl i ambient.json: {ex.Message}"); }
            }

            var convoPath = Path.Combine(speechDir, "conversations.json");
            if (File.Exists(convoPath))
            {
                try
                {
                    var raw = JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(convoPath), jsonOpts) ?? [];
                    var parsed = new List<SpeechLine>();
                    foreach (var el in raw)
                    {
                        var text = el.TryGetProperty("starter", out var st) ? st.GetString() ?? "" : el.GetProperty("text").GetString() ?? "";
                        var speaker = el.TryGetProperty("speaker", out var sp) ? sp.GetString() : null;
                        var reqApp = el.TryGetProperty("requiresApplianceInRoom", out var ra) ? ra.GetString() : null;
                        string[]? rooms = el.TryGetProperty("rooms", out var rm) ? JsonSerializer.Deserialize<string[]>(rm.GetRawText(), jsonOpts) : null;
                        string[]? exRooms = el.TryGetProperty("excludeRooms", out var er) ? JsonSerializer.Deserialize<string[]>(er.GetRawText(), jsonOpts) : null;
                        SpeechTimeRange? tr = el.TryGetProperty("timeRange", out var trEl) ? JsonSerializer.Deserialize<SpeechTimeRange>(trEl.GetRawText(), jsonOpts) : null;
                        List<string>? responses = el.TryGetProperty("responses", out var resp) ? JsonSerializer.Deserialize<List<string>>(resp.GetRawText(), jsonOpts) : null;

                        parsed.Add(new SpeechLine(text, speaker, null, rooms, exRooms, reqApp, tr, null, responses));
                    }
                    _conversations = parsed;
                }
                catch (Exception ex) { Console.Error.WriteLine($"[Speech] Fejl i conversations.json: {ex.Message}"); }
            }

            var appPath = Path.Combine(speechDir, "appliances.json");
            if (File.Exists(appPath))
            {
                try
                {
                    _applianceLines = JsonSerializer.Deserialize<List<ApplianceLineDef>>(File.ReadAllText(appPath), jsonOpts) ?? [];
                }
                catch (Exception ex) { Console.Error.WriteLine($"[Speech] Fejl i appliances.json: {ex.Message}"); }
            }

            var reactPath = Path.Combine(speechDir, "reactions.json");
            if (File.Exists(reactPath))
            {
                try
                {
                    _reactionLines = JsonSerializer.Deserialize<List<ReactionLineDef>>(File.ReadAllText(reactPath), jsonOpts) ?? [];
                }
                catch (Exception ex) { Console.Error.WriteLine($"[Speech] Fejl i reactions.json: {ex.Message}"); }
            }

            var lovePath = Path.Combine(speechDir, "love.json");
            if (File.Exists(lovePath))
            {
                try
                {
                    _loveScripts = JsonSerializer.Deserialize<List<LoveScript>>(File.ReadAllText(lovePath), jsonOpts) ?? [];
                }
                catch (Exception ex) { Console.Error.WriteLine($"[Speech] Fejl i love.json: {ex.Message}"); }
            }
        }
    }

    public static string Appliance(string kind, Random rng) => Appliance(kind, null, rng);

    public static string Appliance(string kind, Agent? agent, Random rng)
    {
        lock (Lock)
        {
            var matching = _applianceLines
                .Where(l => string.Equals(l.PointKind, kind, StringComparison.OrdinalIgnoreCase) && l.Fits(agent))
                .ToList();

            if (matching.Count == 0)
            {
                matching = _applianceLines
                    .Where(l => string.Equals(l.PointKind, kind, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            if (matching.Count > 0)
            {
                return matching[rng.Next(matching.Count)].Text;
            }

            return kind switch
            {
                "fridge" => "Hvad mon der er at spise herinde?",
                "freezer" => "Brrr, der er koldt i fryseren!",
                "dishwasher" => "Jeg ordner lige opvaskeren.",
                _ => "Lad mig lige se..."
            };
        }
    }

    public static string PickedUp(Agent a, Random rng)
    {
        lock (Lock)
        {
            var pool = _reactionLines
                .Where(r => r.Trigger.Equals("pickedUp", StringComparison.OrdinalIgnoreCase))
                .Where(r => r.Speaker switch
                {
                    "Dog" => a.Kind == AgentKind.Dog,
                    "Child" => a.Kind == AgentKind.Child,
                    "Adult" => a.Kind == AgentKind.Adult,
                    _ => a.Kind != AgentKind.Dog
                })
                .Select(r => r.Text)
                .ToList();

            if (pool.Count == 0)
            {
                return a.Kind == AgentKind.Dog ? "Vuf?!" : "Hov! Hvor skal vi hen?!";
            }

            string line;
            do { line = pool[rng.Next(pool.Count)]; }
            while (pool.Count > 1 && line == a.Speech);
            return line;
        }
    }

    public static LoveScript RandomLoveScript(Random rng)
    {
        lock (Lock)
        {
            if (_loveScripts.Count > 0)
                return _loveScripts[rng.Next(_loveScripts.Count)];

            return new LoveScript([new LoveLine("both", "Kys")], EndsWithKiss: true);
        }
    }
}