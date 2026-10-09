namespace Amballegaard.Simulation.Agents;

/// <summary>Beboerne. Udseendet for de voksne er afledt af deres profilbilleder.</summary>
public static class Family
{
    public static IReadOnlyList<Agent> Create() =>
    [
        new()
        {
            Id = "stephan", Name = "Stephan", Kind = AgentKind.Adult, HomeRoomId = "master_bedroom",
            Appearance = new("#f1c7a8", "#9a7348", "shortSpiky", "#262c38", "#3b4252", 1.68, Beard: "#a57a4f"),
        },
        new()
        {
            Id = "lisa", Name = "Lisa", Kind = AgentKind.Adult, HomeRoomId = "lisas_office",
            Appearance = new("#f3cfb6", "#d8b77a", "longStraight", "#b3262e", "#3d5f8f", 1.68, Pattern: "plaid", Feminine: true),
        },
        new()
        {
            Id = "maxemil", Name = "Max-Emil", Kind = AgentKind.Child, HomeRoomId = "maxemils_bedroom",
            Appearance = new("#f3d0b8", "#c49a5c", "shortMessy", "#3f7cc4", "#2f3a4f", 1.25),
        },
        new()
        {
            Id = "mathilde", Name = "Mathilde", Kind = AgentKind.Child, HomeRoomId = "mathildes_bedroom",
            Appearance = new("#f6d6c2", "#b4441f", "ponytail", "#e2a33b", "#43506a", 1.35),
        },
        new()
        {
            Id = "hund", Name = "Hund", Kind = AgentKind.Dog, HomeRoomId = "kitchen_family_room", Active = false,
            Appearance = new("#c9a26b", "#c9a26b", "dog", "#c9a26b", "#c9a26b", 0.55),
        },
    ];
}
