namespace Amballegaard.Simulation.Agents;

/// <summary>Hvem en replik passer til: alle mennesker, kun voksne, kun børn eller én bestemt beboer.</summary>
public enum SpeakerFilter { Anyone, Adult, Child, Specific }

public sealed record SpeechLine(string Text, SpeakerFilter Filter = SpeakerFilter.Anyone, string? AgentId = null)
{
    public bool Fits(Agent a) => a.Kind != AgentKind.Dog && Filter switch
    {
        SpeakerFilter.Adult => a.Kind == AgentKind.Adult,
        SpeakerFilter.Child => a.Kind == AgentKind.Child,
        SpeakerFilter.Specific => a.Id == AgentId,
        _ => true,
    };
}

public static class Speech
{
    private static SpeechLine Adult(string t) => new(t, SpeakerFilter.Adult);
    private static SpeechLine Child(string t) => new(t, SpeakerFilter.Child);
    private static SpeechLine Only(string id, string t) => new(t, SpeakerFilter.Specific, id);

    /// <summary>De 50 tilfældige replikker beboerne siger i hverdagen.</summary>
    public static readonly IReadOnlyList<SpeechLine> Lines =
    [
        new("Hvad skal vi have til aftensmad?"),
        new("Har nogen set fjernbetjeningen?"),
        new("Sikke et dejligt vejr i dag!"),
        new("Hvem har ladet lyset være tændt?"),
        new("Jeg tror, det bliver regn senere."),
        new("Skal vi ikke gå en tur ud i haven?"),
        new("Er der nogen, der vil have en kop te?"),
        new("Hvor er mine nøgler nu henne?"),
        new("Husk at lukke terrassedøren!"),
        new("Den brændeovn er bare så hyggelig."),
        new("Jeg er SÅ mæt."),
        new("Hvem har slæbt mudder ind i entréen?"),
        new("Uhm, det dufter godt herinde!"),
        new("Vi skal huske at købe mælk."),
        new("Det er rart at være hjemme."),
        Adult("Har du husket madpakken?"),
        Adult("Nu er det altså sengetid!"),
        Adult("Jeg har et møde om fem minutter."),
        Adult("Hvem har lånt min oplader?"),
        Adult("Skal vi tænde grillen i aften?"),
        Adult("Hækken trænger altså til at blive klippet."),
        Adult("Jeg tømmer lige opvaskeren."),
        Adult("Wi-fi'en driller igen…"),
        Adult("Hvorfor ligger der sokker midt på gulvet?"),
        Adult("Har nogen fodret hunden?"),
        Adult("Jeg sætter lige en vask over."),
        Adult("Skal vi spille et brætspil i aften?"),
        Adult("Er der mere kaffe på kanden?"),
        Child("Må jeg få noget slik?"),
        Child("Jeg keder mig!"),
        Child("Må jeg spille på iPad'en?"),
        Child("Hvornår er det weekend?"),
        Child("Det var IKKE mig!"),
        Child("Må vi få pizza i aften?"),
        Child("Jeg har lavet mine lektier… næsten."),
        Child("Kan vi ikke få en trampolin?"),
        Child("Mor! Far! Kom og se!"),
        Child("Fem minutter mere…"),
        Child("Hvorfor er himlen blå?"),
        Child("Jeg er sulten!"),
        Child("Hunden spiste min madpakke!"),
        Child("Må min ven komme over?"),
        Only("stephan", "Jeg skal lige fikse en bug."),
        Only("stephan", "Har nogen set mine høretelefoner?"),
        Only("lisa", "Hvem har flyttet rundt på puderne i sofaen?"),
        Only("lisa", "Jeg sidder på mit kontor, hvis nogen leder."),
        Only("maxemil", "Skal vi spille fodbold i haven?"),
        Only("maxemil", "Jeg vil være YouTuber, når jeg bliver stor!"),
        Only("mathilde", "Må jeg bestemme musikken?"),
        Only("mathilde", "Hvem har været inde på mit værelse?!"),
    ];

    public static readonly IReadOnlyList<string> DogLines = ["Vuf!", "Vuf vuf!", "*snøfter*", "Legetid?", "*logrer med halen*", "Grrr…"];

    /// <summary>Reaktioner når brugeren løfter en beboer op med musen.</summary>
    public static readonly IReadOnlyList<string> PickedUpLines =
    [
        "Hov! Sæt mig ned!", "Wiii!", "Hvor skal vi hen?!", "Jeg kan altså godt selv gå!", "Uha, det kilder!",
        "HVAD sker der?!", "Jeg FLYVER!", "Hjæææælp!", "Det her stod ikke i kalenderen!", "Hvem løfter mig?!",
        "Er det et jordskælv?!", "Jeg har ikke engang sko på!", "Mine fødder rører ikke jorden!", "Woooah!",
        "Det her er SÅ mærkeligt!", "Åh nej, jeg får højdeskræk!", "Ej, hvad laver du?!", "Stop, jeg bliver svimmel!",
        "Er jeg i en computer?!", "Nogen må forklare det her!", "Det havde jeg ikke set komme!", "Ahhh! Pas på lampen!",
        "Jeg svæver! Jeg SVÆVER!", "Er det her normalt?!", "Hold da op!", "Det her skal jeg fortælle nogen om!",
        "Kan vi ikke bare tage trapperne?", "Jeg er ikke en dukke!", "Okay… det her er faktisk lidt sjovt!",
    ];
    public static readonly IReadOnlyList<string> ChildPickedUpLines =
    [
        "Igen! Igen!", "Det er ligesom i Roblox!", "Jeg kan flyve som en superhelt!", "Mor! Far! Se mig!", "Wiiiii, højere!",
    ];
    public static readonly IReadOnlyList<string> DogPickedUpLines = ["Vuf?!", "*piber*", "*logrer forvirret*", "VUF VUF!", "*spræller med potterne*", "Auuuu!"];

    public static readonly IReadOnlyList<string> FridgeLines =
    [
        "Hvem har drukket den sidste mælk?!", "Uhm… rester fra i går!", "Vi mangler altså smør.", "Er den ost stadig god?",
        "Hvor er yoghurten?", "Jeg tager lige en gulerod.", "Hvem har sat en tom juicekarton tilbage?", "Der er intet at spise!",
    ];
    public static readonly IReadOnlyList<string> FreezerLines =
    [
        "Er der mere is?", "Pizza i aften? Der ligger en her!", "Brrr, koldt!", "Hvem har spist alle isvaflerne?",
        "Vi skal huske at afrime fryseren.", "Fiskefrikadeller… igen?",
    ];

    public static string Appliance(string kind, Random rng)
    {
        var pool = kind == "freezer" ? FreezerLines : FridgeLines;
        return pool[rng.Next(pool.Count)];
    }

    public static string Random(Agent a, Random rng)
    {
        if (a.Kind == AgentKind.Dog) return DogLines[rng.Next(DogLines.Count)];
        var fitting = Lines.Where(l => l.Fits(a)).ToList();
        return fitting[rng.Next(fitting.Count)].Text;
    }

    public static string PickedUp(Agent a, Random rng)
    {
        var pool = a.Kind == AgentKind.Dog ? DogPickedUpLines
            : a.Kind == AgentKind.Child ? PickedUpLines.Concat(ChildPickedUpLines).ToList()
            : PickedUpLines;
        // Sig ikke det samme to gange i træk.
        string line;
        do line = pool[rng.Next(pool.Count)]; while (pool.Count > 1 && line == a.Speech);
        return line;
    }

    public static LoveScript RandomLoveScript(Random rng) => LoveScripts.All[rng.Next(LoveScripts.All.Count)];
}

/// <summary>En replik i et kærligheds-øjeblik. Speaker er "stephan", "lisa" eller "both" (begge siger den samtidig).</summary>
public sealed record LoveLine(string Speaker, string Text);

/// <summary>Et lille skuespil Stephan og Lisa opfører, når de står helt tæt sammen. <c>EndsWithKiss</c> afgør om
/// kysse-emojien vises i stedet for hjertet på den sidste replik.</summary>
public sealed record LoveScript(IReadOnlyList<LoveLine> Lines, bool EndsWithKiss);

public static class LoveScripts
{
    private static LoveLine S(string t) => new("stephan", t);
    private static LoveLine L(string t) => new("lisa", t);
    private static LoveLine Both(string t) => new("both", t);

    public static readonly IReadOnlyList<LoveScript> All =
    [
        new([Both("Kys")], EndsWithKiss: true),
        new([S("Haps haps"), L("Uha skønt")], EndsWithKiss: false),
        new([S("Skal vi have en date-aften snart?"), L("Ja tak, bare os to!")], EndsWithKiss: false),
        new([S("Hvad ville jeg gøre uden dig?"), L("Nok rode rundt og lede efter dine nøgler for evigt.")], EndsWithKiss: false),
        new([S("Du bliver smukkere for hver dag."), L("Charmør!")], EndsWithKiss: false),
        new([S("Må jeg stjæle et kys?"), L("Kun hvis det bliver mere end ét.")], EndsWithKiss: true),
        new([L("Duftiii"), S("Bedufti"), L("Strudsekys!"), S("Uftii!")], EndsWithKiss: false),
    ];
}
