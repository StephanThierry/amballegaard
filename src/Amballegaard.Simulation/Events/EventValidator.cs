namespace Amballegaard.Simulation.Events;

public enum ValidationSeverity { Warning, Error }

public sealed record ValidationIssue(
    ValidationSeverity Severity,
    string Message,
    string? Person = null,
    string? NodeId = null);

public sealed record ValidationReport(IReadOnlyList<ValidationIssue> Issues)
{
    public bool IsValid => Issues.All(i => i.Severity != ValidationSeverity.Error);
    public IEnumerable<ValidationIssue> Errors => Issues.Where(i => i.Severity == ValidationSeverity.Error);
    public IEnumerable<ValidationIssue> Warnings => Issues.Where(i => i.Severity == ValidationSeverity.Warning);
}

public static class EventValidator
{
    public static ValidationReport Validate(IEnumerable<EventNode> nodes, EventIndex index)
    {
        var issues = new List<ValidationIssue>();
        var nodeList = nodes.ToList();

        var roomIds = index.Rooms.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
        var personIds = index.Persons.Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
        var pointIds = index.Points.Select(p => p.Id).ToHashSet(StringComparer.Ordinal);

        // 1. Unikke (person, id)-nøgler og gyldige personer
        var nodeMap = new Dictionary<(string Person, string Id), EventNode>();
        foreach (var node in nodeList)
        {
            if (!personIds.Contains(node.Person))
            {
                issues.Add(new(ValidationSeverity.Error, $"Person '{node.Person}' findes ikke i ID-indekset.", node.Person, node.Id));
            }

            var key = (node.Person, node.Id);
            if (nodeMap.ContainsKey(key))
            {
                issues.Add(new(ValidationSeverity.Error, $"Duplikeret node-id '{node.Id}' for person '{node.Person}'.", node.Person, node.Id));
            }
            else
            {
                nodeMap[key] = node;
            }

            // Schema-version tjek
            if (node.SchemaVersion.HasValue && node.SchemaVersion.Value > EventSchema.CurrentVersion)
            {
                issues.Add(new(ValidationSeverity.Error, $"Ukendt schemaVersion {node.SchemaVersion.Value} (maks {EventSchema.CurrentVersion}).", node.Person, node.Id));
            }
        }

        // 2. Tjek af triggers og tids-kollisioner
        var timeTriggersByPerson = new Dictionary<string, HashSet<string>>();
        foreach (var node in nodeList)
        {
            if (node.Trigger.Type == "time")
            {
                if (string.IsNullOrWhiteSpace(node.Trigger.Value))
                {
                    issues.Add(new(ValidationSeverity.Error, "Time-trigger mangler et klokkeslæt i 'value'.", node.Person, node.Id));
                }
                else
                {
                    if (!timeTriggersByPerson.TryGetValue(node.Person, out var times))
                    {
                        times = [];
                        timeTriggersByPerson[node.Person] = times;
                    }

                    if (!times.Add(node.Trigger.Value))
                    {
                        issues.Add(new(ValidationSeverity.Warning, $"Flere time-triggers for person '{node.Person}' på samme tidspunkt '{node.Trigger.Value}'.", node.Person, node.Id));
                    }
                }
            }
            else if (node.Trigger.Type != "passive")
            {
                issues.Add(new(ValidationSeverity.Error, $"Ugyldig trigger type '{node.Trigger.Type}'. Skal være 'time' eller 'passive'.", node.Person, node.Id));
            }
        }

        // 3. Tjek af actions mod ID-indekset
        foreach (var node in nodeList)
        {
            ValidateAction(node, roomIds, personIds, pointIds, issues);
        }

        // 4. Dangling referencer i oncomplete og waitFor
        var referencedTargets = new HashSet<(string Person, string Id)>();
        foreach (var node in nodeList)
        {
            foreach (var target in node.Oncomplete)
            {
                var targetKey = (target.Person, target.Id);
                referencedTargets.Add(targetKey);
                if (!nodeMap.ContainsKey(targetKey))
                {
                    issues.Add(new(ValidationSeverity.Error, $"Dangling oncomplete-reference til ({target.Person}, {target.Id}). Noden findes ikke.", node.Person, node.Id));
                }
            }

            if (node.WaitFor is not null)
            {
                foreach (var wait in node.WaitFor)
                {
                    var waitKey = (wait.Person, wait.Id);
                    referencedTargets.Add(waitKey);
                    if (!nodeMap.ContainsKey(waitKey))
                    {
                        issues.Add(new(ValidationSeverity.Error, $"Dangling waitFor-reference til ({wait.Person}, {wait.Id}). Noden findes ikke.", node.Person, node.Id));
                    }
                }
            }
        }

        // 5. Orphan-detektion (passive noder som intet peger på)
        foreach (var node in nodeList)
        {
            if (node.Trigger.Type == "passive")
            {
                var key = (node.Person, node.Id);
                if (!referencedTargets.Contains(key))
                {
                    issues.Add(new(ValidationSeverity.Error, $"Passiv node ({node.Person}, {node.Id}) er en orphan (ingen oncomplete eller waitFor refererer til den).", node.Person, node.Id));
                }
            }
        }

        // 6. Cykledetektion (DFS)
        DetectCycles(nodeMap, issues);

        return new ValidationReport(issues);
    }

    private static void ValidateAction(
        EventNode node,
        HashSet<string> rooms,
        HashSet<string> persons,
        HashSet<string> points,
        List<ValidationIssue> issues)
    {
        var action = node.Action;
        switch (action.Type)
        {
            case "goto":
                if (action.Target is null)
                {
                    issues.Add(new(ValidationSeverity.Error, "Goto-action mangler 'target'.", node.Person, node.Id));
                    break;
                }
                var (kind, val) = (action.Target.Kind, action.Target.Value);
                if (kind == "room" && !rooms.Contains(val))
                    issues.Add(new(ValidationSeverity.Error, $"Rum-id '{val}' findes ikke i indekset.", node.Person, node.Id));
                else if (kind == "person" && !persons.Contains(val))
                    issues.Add(new(ValidationSeverity.Error, $"Person-id '{val}' findes ikke i indekset.", node.Person, node.Id));
                else if (kind == "point" && !points.Contains(val))
                    issues.Add(new(ValidationSeverity.Error, $"Punkt-id '{val}' findes ikke i indekset.", node.Person, node.Id));
                else if (kind is not ("room" or "person" or "point"))
                    issues.Add(new(ValidationSeverity.Error, $"Ugyldig goto target kind '{kind}'.", node.Person, node.Id));
                break;

            case "interact":
                if (string.IsNullOrWhiteSpace(action.Target?.Value) && string.IsNullOrWhiteSpace(action.Target?.Kind))
                {
                    // Target kan enten være givet som target: "id" eller target: { value: "id" }
                }
                var interactTarget = action.Target?.Value;
                if (!string.IsNullOrEmpty(interactTarget) && !points.Contains(interactTarget))
                {
                    issues.Add(new(ValidationSeverity.Error, $"Interact mål '{interactTarget}' findes ikke i indeksets punkter.", node.Person, node.Id));
                }
                break;

            case "chore":
                if (action.Points is not null)
                {
                    foreach (var pt in action.Points)
                    {
                        if (!points.Contains(pt))
                        {
                            issues.Add(new(ValidationSeverity.Error, $"Chore punkt '{pt}' findes ikke i indekset.", node.Person, node.Id));
                        }
                    }
                }
                break;

            case "speak":
            case "wait":
            case "setState":
                break;

            default:
                issues.Add(new(ValidationSeverity.Error, $"Ukendt action-type '{action.Type}'.", node.Person, node.Id));
                break;
        }
    }

    private static void DetectCycles(
        Dictionary<(string Person, string Id), EventNode> nodes,
        List<ValidationIssue> issues)
    {
        var visited = new Dictionary<(string Person, string Id), int>(); // 0=Unvisited, 1=Visiting, 2=Visited

        foreach (var key in nodes.Keys)
        {
            if (!visited.ContainsKey(key))
            {
                Dfs(key, nodes, visited, [], issues);
            }
        }
    }

    private static void Dfs(
        (string Person, string Id) current,
        Dictionary<(string Person, string Id), EventNode> nodes,
        Dictionary<(string Person, string Id), int> visited,
        List<(string Person, string Id)> path,
        List<ValidationIssue> issues)
    {
        visited[current] = 1; // Gray (i stakken)
        path.Add(current);

        if (nodes.TryGetValue(current, out var node))
        {
            var neighbors = node.Oncomplete.Select(r => (r.Person, r.Id))
                .Concat(node.WaitFor?.Select(r => (r.Person, r.Id)) ?? Enumerable.Empty<(string, string)>());

            foreach (var next in neighbors)
            {
                if (!nodes.ContainsKey(next)) continue;

                if (visited.TryGetValue(next, out var state))
                {
                    if (state == 1) // Fundet cyklus
                    {
                        var cyclePath = string.Join(" -> ", path.SkipWhile(k => k != next).Concat([next]).Select(k => $"{k.Person}:{k.Id}"));
                        issues.Add(new(ValidationSeverity.Error, $"Cyklus opdaget i event-grafen: {cyclePath}", current.Person, current.Id));
                    }
                }
                else
                {
                    Dfs(next, nodes, visited, path, issues);
                }
            }
        }

        path.RemoveAt(path.Count - 1);
        visited[current] = 2; // Black
    }
}