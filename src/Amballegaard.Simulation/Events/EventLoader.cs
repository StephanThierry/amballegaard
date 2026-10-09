using System.Text.Json;

namespace Amballegaard.Simulation.Events;

public sealed class EventLoader : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly object _lock = new();
    private FileSystemWatcher? _watcher;
    private readonly string _eventsDir;
    private readonly Func<EventIndex> _indexProvider;

    public IReadOnlyList<EventNode> CurrentNodes { get; private set; } = [];
    public ValidationReport? LastReport { get; private set; }

    public event Action<IReadOnlyList<EventNode>, ValidationReport>? EventsReloaded;

    public EventLoader(string eventsDir, Func<EventIndex> indexProvider)
    {
        _eventsDir = eventsDir;
        _indexProvider = indexProvider;
    }

    /// <summary>Indlæser alle event-filer én gang og initialiserer hot-reload hvis mappen findes.</summary>
    public void Start(bool enableHotReload = true)
    {
        Reload();

        if (enableHotReload && Directory.Exists(_eventsDir))
        {
            _watcher = new FileSystemWatcher(_eventsDir, "*.json")
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
                EnableRaisingEvents = true
            };

            // Debounce for at håndtere hurtige fildobbelt-skrivninger
            var timer = new System.Timers.Timer(150) { AutoReset = false };
            timer.Elapsed += (_, _) => Reload();

            FileSystemEventHandler onChange = (_, e) =>
            {
                if (Path.GetFileName(e.FullPath).Equals("index.json", StringComparison.OrdinalIgnoreCase))
                    return; // Spring altid index.json over
                timer.Stop();
                timer.Start();
            };

            _watcher.Changed += onChange;
            _watcher.Created += onChange;
            _watcher.Deleted += onChange;
            _watcher.Renamed += (_, e) => onChange(_, e);
        }
    }

    public void Reload()
    {
        lock (_lock)
        {
            var nodes = LoadDirectory(_eventsDir);
            var index = _indexProvider();
            var report = EventValidator.Validate(nodes, index);

            LastReport = report;
            CurrentNodes = nodes;

            EventsReloaded?.Invoke(CurrentNodes, report);
        }
    }

    /// <summary>Scanner mappen og parser alle event-filer, eksklusive index.json.</summary>
    public static List<EventNode> LoadDirectory(string directoryPath)
    {
        var allNodes = new List<EventNode>();
        if (!Directory.Exists(directoryPath)) return allNodes;

        foreach (var file in Directory.EnumerateFiles(directoryPath, "*.json"))
        {
            var fileName = Path.GetFileName(file);
            if (fileName.Equals("index.json", StringComparison.OrdinalIgnoreCase))
                continue;

            try
            {
                var content = File.ReadAllText(file);
                var nodes = ParseContent(content, fallbackPerson: Path.GetFileNameWithoutExtension(file));
                allNodes.AddRange(nodes);
            }
            catch (Exception ex)
            {
                // En korrupt fil må aldrig crashe loaderen – logges og springes over jf. §8
                Console.Error.WriteLine($"[EventLoader] Fejl under indlæsning af {file}: {ex.Message}");
            }
        }

        return allNodes;
    }

    /// <summary>Parser enten et array af noder eller et EventDocument-envelope objekt.</summary>
    public static List<EventNode> ParseContent(string json, string? fallbackPerson = null)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind == JsonValueKind.Array)
        {
            var list = JsonSerializer.Deserialize<List<EventNode>>(json, JsonOptions) ?? [];
            return list;
        }

        if (doc.RootElement.ValueKind == JsonValueKind.Object)
        {
            var eventDoc = JsonSerializer.Deserialize<EventDocument>(json, JsonOptions);
            if (eventDoc is null) return [];

            var person = eventDoc.Person ?? fallbackPerson;
            var result = new List<EventNode>();
            foreach (var node in eventDoc.Events)
            {
                // Sørg for at person og schemaVersion arves fra dokumentet hvis de ikke er sat
                var resolvedPerson = string.IsNullOrEmpty(node.Person) ? person ?? "" : node.Person;
                var resolvedSchema = node.SchemaVersion ?? eventDoc.SchemaVersion;
                result.Add(node with { Person = resolvedPerson, SchemaVersion = resolvedSchema });
            }
            return result;
        }

        return [];
    }

    public void Dispose()
    {
        _watcher?.Dispose();
    }
}