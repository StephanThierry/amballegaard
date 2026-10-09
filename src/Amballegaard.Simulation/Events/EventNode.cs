using System.Text.Json;
using System.Text.Json.Serialization;

namespace Amballegaard.Simulation.Events;

/// <summary>Gør at target kan skrives både som simpel streng ("dishwasher") eller objekt ({ kind, value }).</summary>
public sealed class ActionTargetConverter : JsonConverter<ActionTarget>
{
    public override ActionTarget? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString() ?? "";
            return new ActionTarget("point", str);
        }

        if (reader.TokenType == JsonTokenType.StartObject)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            var kind = root.TryGetProperty("kind", out var k) ? k.GetString() ?? "point" : "point";
            var val = root.TryGetProperty("value", out var v) ? v.GetString() ?? "" : "";
            return new ActionTarget(kind, val);
        }

        return null;
    }

    public override void Write(Utf8JsonWriter writer, ActionTarget value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString("kind", value.Kind);
        writer.WriteString("value", value.Value);
        writer.WriteEndObject();
    }
}

/// <summary>Understøttet schema-version for event-definitioner.</summary>
public static class EventSchema
{
    public const int CurrentVersion = 1;
}

/// <summary>Læser både int og string som string fra JSON (så id: 16 og id: "16" begge accepteres).</summary>
public sealed class FlexibleStringConverter : JsonConverter<string>
{
    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.String => reader.GetString(),
            JsonTokenType.Number => reader.TryGetInt64(out var l) ? l.ToString() : reader.GetDouble().ToString(),
            _ => throw new JsonException($"Forventede streng eller tal, men modtog {reader.TokenType}")
        };
    }

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value);
}

/// <summary>Reference til en node i en persons graf: (person, id).</summary>
public sealed record EventRef
{
    public required string Person { get; init; }

    [JsonConverter(typeof(FlexibleStringConverter))]
    public required string Id { get; init; }
}

/// <summary>Tidsinterval i sekunder for jitrede handlinger ({ min, max }).</summary>
public sealed record DurationRange(double Min, double Max);

/// <summary>Trigger-betingelse for en node: time (rod) eller passive (følgenode).</summary>
public sealed record EventTrigger
{
    public required string Type { get; init; } // "time" | "passive"
    public string? Value { get; init; }        // fx "20:30"
}

/// <summary>Mål for en goto-handling (rum, person eller interaktionspunkt).</summary>
public sealed record ActionTarget(string Kind, string Value);

/// <summary>Handlingsvokabular jf. specifikationens §4.</summary>
public sealed record EventAction
{
    public required string Type { get; init; } // goto, speak, wait, setState, interact, chore
    public ActionTarget? Target { get; init; }
    public string? Text { get; init; }
    public string? LineRef { get; init; }
    public double? Seconds { get; init; }
    public string? Activity { get; init; }
    public string? Pose { get; init; }
    public string? State { get; init; }        // "open" | "closed"
    public List<string>? Points { get; init; }
    public DurationRange? Duration { get; init; }
    public int? Cycles { get; init; }
}

/// <summary>Én node i dagsplan-grafen jf. dagsplan-motor.md §3.</summary>
public sealed record EventNode
{
    public required string Person { get; init; }

    [JsonConverter(typeof(FlexibleStringConverter))]
    public required string Id { get; init; }

    public required EventTrigger Trigger { get; init; }
    public required EventAction Action { get; init; }
    public DurationRange? Duration { get; init; }
    public List<EventRef> Oncomplete { get; init; } = [];
    public string? Chain { get; init; }
    public List<EventRef>? WaitFor { get; init; }
    public int? SchemaVersion { get; init; }
}

/// <summary>Valgfri envelope-indpakning af en person-fil med schemaVersion og metadata.</summary>
public sealed record EventDocument
{
    public int SchemaVersion { get; init; } = EventSchema.CurrentVersion;
    public string? Person { get; init; }
    public List<EventNode> Events { get; init; } = [];
}