namespace Amballegaard.Simulation.Agents;

/// <summary>Hvem en replik passer til: alle mennesker, kun voksne, kun børn eller én bestemt beboer.</summary>
public enum SpeakerFilter { Anyone, Adult, Child, Specific }

/// <summary>
/// En replik. De fleste er "spontane udbrud" (<see cref="Responses"/> er null) som siges uden videre.
/// Har den <see cref="Responses"/>, er den i stedet en "samtale": kræver mindst én anden beboer i samme
/// rum, som så stopper op og svarer med en tilfældig replik fra listen — se World.StepSpeech.
/// <see cref="Rooms"/> (husets rum-id'er, fx "living_room"/"master_bedroom") begrænser hvor replikken kan siges; null
/// betyder alle rum (inkl. udenfor).
/// </summary>
public sealed record SpeechLine(
    string Text,
    SpeakerFilter Filter = SpeakerFilter.Anyone,
    string? AgentId = null,
    string[]? Rooms = null,
    IReadOnlyList<string>? Responses = null)
{
    public bool Fits(Agent a) => a.Kind != AgentKind.Dog && (Rooms is null || Rooms.Contains(a.RoomId)) && Filter switch
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
    private static SpeechLine InRooms(string t, params string[] rooms) => new(t, Rooms: rooms);
    private static SpeechLine Convo(string t, IReadOnlyList<string> responses, SpeakerFilter filter = SpeakerFilter.Anyone, string[]? rooms = null, string? agentId = null)
        => new(t, filter, agentId, rooms, responses);

    /// <summary>De tilfældige spontane replikker beboerne siger i hverdagen.</summary>
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
        InRooms("Hvem har slæbt mudder ind i entréen?", "laundry_room", "entrance_hall"),
        InRooms("Gad vide om der er nogen gode serier jeg skal se…", "living_room"),
        InRooms("Jeg skal tidligt i seng i dag.", "master_bedroom"),
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
        Only("stephan", "Jeg burde sætte noget HEAVY på... Henret eller Upon a Burning Body."),
        Only("stephan", "Måske jeg skulle spille Demon's Souls i aften."),
        Only("stephan", "Måske jeg skulle spille Ghost of Yōtei i aften."),
        Only("stephan", "Måske jeg skulle spille Returnal i aften."),
        Only("stephan", "Måske jeg skulle spille Horizon Forbidden West i aften."),
        Only("stephan", "Måske jeg skulle spille Bloodborne i aften."),
        Only("stephan", "Lige et sæt bænkpres mere, så er jeg klar."),
        Only("stephan", "Jeg burde få nogle af mine 3D-print lavet."),
        Only("lisa", "Hvem har flyttet rundt på puderne i sofaen?"),
        Only("lisa", "Jeg sidder på mit kontor, hvis nogen leder."),
        Only("lisa", "Jeg burde færdiggøre mit maleri."),
        Only("lisa", "Jeg glæder mig til at spille videre på Horizon i aften."),
        Only("lisa", "Hvem har rykket ved min ekstra skærm?"),
        Only("lisa", "Jeg burde gå i gang med at træne."),
        Only("lisa", "Pyha, blev der pludselig varmt herinde?!"),
        Only("lisa", "Aaaa'CHU — aaaa-chu, ACHU!"),
        Only("maxemil", "Jeg vil være YouTuber, når jeg bliver stor!"),
        Only("maxemil", "Jeg har lavet en helt ny sang på keyboardet!"),
        Only("maxemil", "Det er min Bella."),
        Only("maxemil", "Waue — en poppit!"),
        Only("mathilde", "Må jeg bestemme musikken?"),
        Only("mathilde", "Hvem har været inde på mit værelse?!"),
        Only("mathilde", "Gad godt spille Minecraft igen!"),
        Only("mathilde", "Mit værelse skal laves om — jeg har 1000 idéer!"),
    ];

    /// <summary>
    /// "Samtaler": kræver mindst én anden beboer i samme rum. Starteren siges som en almindelig replik;
    /// den tilstedeværende modpart stopper op og svarer (tilfældigt valgt fra Responses), når starterens
    /// replik er færdig — se World.StepSpeech.
    /// </summary>
    public static readonly IReadOnlyList<SpeechLine> Conversations =
    [
        Convo("Skal vi spille brætspil i aften?",
            ["Ja, det lyder hyggeligt!", "Kun hvis jeg må vælge spillet.", "Nu igen? Jeg tabte sidst…", "Først skal ungerne i seng."],
            SpeakerFilter.Adult),
        Convo("Skal vi se en film i aften?",
            ["Ja! Jeg vælger popcorn.", "Kun hvis det ikke er gyser.", "Jeg faldt i søvn sidste gang, men ja.", "Lad os se noget på Streamberry."]),
        Convo("Skal vi spille PlayStation sammen?",
            ["Jeg er midt i Demon's Souls, men okay.", "Ja! Jeg har lige fået et nyt våben i Horizon.", "Kun hvis du lader mig vinde.", "Bare ikke for længe."],
            rooms: ["living_room"]),
        Convo("Vil du spille fodbold med mig i haven?",
            ["Ja, giv mig to minutter!", "Kun hvis jeg må være målmand.", "Jeg er lidt træt, men okay.", "Spørg lige din søster også!"],
            SpeakerFilter.Child),
        Convo("Skal vi tænde op i brændeovnen?",
            ["Ja, perfekt vejr til det.", "God idé, jeg fryser.", "Kun hvis du henter brænde — LOL, det er gas."],
            rooms: ["living_room"]),
        Convo("Skal vi grille i aften?",
            ["Ja! Hvad skal vi smide på.", "Kun hvis vejret holder.", "God idé, jeg er træt af at lave mad indenfor.", "Vi mangler gas til grillen, tror jeg."]),
        Convo("Skal vi ud og nyde terrassen lidt?",
            ["Ja, det er skønt vejr!", "Lige om lidt.", "Kun hvis vi tager kaffe med.", "Er det ikke lidt koldt?"]),
        Convo("Vil du se mit nye maleri?",
            ["Ja, det vil jeg meget gerne!", "Wow, det tager sig flot ud!", "Er det snart færdigt?", "Jeg kommer om lidt."],
            SpeakerFilter.Specific, agentId: "lisa", rooms: ["lisas_office"]),
        Convo("Skal jeg sætte noget god musik på anlægget?",
            ["Ja tak, noget roligt.", "Endelig, det anlæg skal da bruges!", "Bare ikke for højt.", "Ja! Sæt noget op-tempo på."],
            SpeakerFilter.Specific, agentId: "stephan", rooms: ["living_room"]),
        Convo("Skal vi bestille pizza i aften?",
            ["JA ENDELIG!", "Igen? Men okay…", "Kun hvis børnene vælger topping.", "God idé, jeg gider ikke lave mad."]),
        Convo("Skal vi tage en gåtur?",
            ["Ja, frisk luft lyder dejligt!", "Kun en kort en, det er sent.", "Ja, jeg skal alligevel over til de gamle?", "Lige om lidt.", "Ja, så kan vi hente den pakke i SuperBrugsen."]),
        Convo("Kan du hjælpe mig med at dække bord?",
            ["Ja, kommer nu!", "To minutter, jeg er snart færdig.", "Kan ikke en anden gøre det for en gangs skyld?", "Selvfølgelig!"],
            rooms: ["kitchen_family_room"]),
        Convo("Skal vi bage sammen i weekenden?",
            ["Ja! Jeg vil gerne lave boller.", "Kun hvis jeg må slikke skålen.", "God idé, lad os finde en opskrift.", "Jeg er ikke god til at bage, men okay!"]),
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

    /// <summary>Den der allerede står i rummet siger en af disse, når Stephan eller Lisa bliver trukket
    /// hen til den anden (se World.MoveAgent). Alle ender med et kys.</summary>
    public static readonly IReadOnlyList<string> ArrivalKissLines =
    [
        "Uhhh der kom min kysti - dejligt",
        "Så fik man lige en kysti, skønt",
        "Nææh en kysti kom flyvende - lækkert",
        "En kysti! Haps haps",
        "Godag bedufti!",
        "Der kom lige en bedufti som ska ha et kys!",
        "Det koster et kys at komme flyvende",
    ];
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
        new([S("Du skal lige ha et kys!"), L("Det kan jeg ikke tage imod - du får det lige tilbage")], EndsWithKiss: true),
    ];
}
