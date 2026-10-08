/**
 * Tv-shows der kan afspilles på husets fladskærme.
 *
 * Et show er en liste af "cues": enten en replik fra scenen eller en regianvisning for publikum
 * ([cheers and applause], [laughter] …). Replikkerne vises som talebobler fra tv'et — præcis som
 * beboernes — og publikumsreaktionerne driver både boblen og publikum nede på skærmen.
 *
 * Afspilningspositionen ligger i en modul-global tabel pr. skærm-id, så et slukket tv står stille
 * og fortsætter nøjagtig hvor man kom til, når det tændes igen.
 */

export type Reaction = 'applause' | 'laughter'

export interface Cue {
  kind: 'line' | 'reaction'
  /** Teksten i boblen. For reaktioner er det regianvisningen, som den står i manuskriptet. */
  text: string
  /** Kun på reaktioner: hvad publikum gør. */
  reaction?: Reaction
  /** Lille kursiv note over replikken, fx en stemmeangivelse ("as Andy Rooney"). */
  note?: string
}

export interface Show {
  /** Streamingtjenesten — tegnes som logo når skærmen tændes. */
  service: string
  title: string
  host: string
  kicker: string
  cues: Cue[]
}

const say = (text: string, note?: string): Cue => ({ kind: 'line', text, note })
const applause = (text = '[cheers and applause]'): Cue => ({ kind: 'reaction', text, reaction: 'applause' })
const laugh = (text = '[laughter]'): Cue => ({ kind: 'reaction', text, reaction: 'laughter' })

/**
 * "Honorable Primate" — Tim Cardigans stand-up special. Stærkt forkortet udgave af manuskriptet:
 * de bedste numre klippet ned til replikker der kan være i en taleboble.
 */
const HONORABLE_PRIMATE: Show = {
  service: 'STREAMBERRY',
  title: 'Honorable Primate',
  host: 'Tim Cardigan',
  kicker: 'Stand-up special · 1 t 2 min',
  cues: [
    say(`Ladies and gentlemen — Tim Cardigan!`, `Announcer`),
    applause(),
    say(`Thank you! Thank you so much.`),
    say(`Oh my gosh, you make me feel only 20 pounds overweight.`),
    laugh(),
    say(`"Oh, look at his beard." He's got quite a beard.`),
    say(`"He looks like an out-of-shape Civil War general."`),
    laugh(),
    say(`My dearest Peggy… it has been a fortnight since I have had a salad.`),
    laugh(),
    applause(),
    say(`I love my beard. You grow a beard and strangers are fascinated.`),
    say(`But you can only ask about facial hair, right?`),
    say(`You can't walk up and go: "Hey, how long have you had the man boobs?"`),
    laugh(),
    say(`"Are they natural?" …Now you're looking at my man boobs.`),
    laugh(),
    say(`To me they're beautiful. When do I get a Dove commercial?`),
    laugh(),
    applause(),

    say(`It has been a crazy year. In April we found out my wife had a brain tumor.`),
    say(`It was removed. She's great. Everything's good.`),
    applause(),
    say(`I didn't remove it. I was in the other room soiling myself.`),
    laugh(),
    say(`The tumor is gone — along with my ability to ever win another argument.`),
    laugh(),
    say(`It's not like I was winning a lot before. But now I'm retired.`),
    laugh(),
    applause(),
    say(`The surgeon told me the tumor was the size of a pear.`),
    say(`Which is scary. But also confusing.`),
    say(`I was like: "Did he go to med school, or a farmer's market?"`),
    laugh(),
    say(`Tumors are always compared to fruit. A pear, a lemon, a grapefruit.`),
    say(`Interesting fact: worst tumor — grapefruit. Worst fruit — grapefruit.`),
    laugh(),
    say(`A grapefruit looks more like a tumor than it looks like a fruit.`),
    say(`I feel sorry for grapefruit. "Yeah, we can't win, you know?"`),
    say(`"We're already the worst fruit, now we're the worst tumor?"`),
    laugh(),
    say(`"Well… at least we help old people poop."`),
    laugh(),
    applause(),
    say(`That is the worst impression of a grapefruit ever.`),
    laugh(),
    say(`It's unfortunate there is a much smaller fruit called a "grape."`),
    say(`"We found a tumor. It's the size of a grape…" — "Thank God!"`),
    say(`"I didn't finish. Grapefruit." — "Oh. That's… that's very different."`),
    laugh(),
    applause(),
    say(`You ever notice tumors look like fruit?`, `as Andy Rooney`),
    laugh(),
    say(`If you don't know who Andy Rooney is, you're a child.`, `normal voice`),
    say(`And if you do know who he is, you should probably eat more grapefruit.`),
    laugh(),
    applause(),

    say(`We spent two weeks in the hospital. People who work in hospitals are amazing.`),
    { kind: 'reaction', text: `[cheering]`, reaction: 'applause' },
    say(`They are. So nice, so supportive. It makes you suspicious, right?`),
    laugh(),
    say(`Are they stealing the drugs? They're a little too excited to be around sick people in pajamas.`),
    laugh(),
    say(`And that hospital lighting. Everyone looks sick in that lighting.`),
    say(`I walked in and they went: "We should get you to the ER."`),
    say(`"I'm just here to see my wife." — "Well, you have jaundice."`),
    laugh(),
    say(`Oh my gosh — I have jaundice too! We all have jaundice!`),
    laugh(),
    applause(),
    say(`Hospitals have the most cutting-edge medical equipment…`),
    say(`…and they're still serving food like it's The Shawshank Redemption.`),
    laugh(),
    say(`How about selling an MRI machine and getting a pasta station?`),
    laugh(),
    say(`"Tim, you're a monster."`),
    laugh(),
    say(`There's the Emergency Room. There's the Intensive Care Unit.`),
    say(`Why would anyone want to stay anywhere but the Intensive Care Unit?`),
    say(`It implies the rest of the hospital is like: "Look, we care…`),
    say(`…but we're not going to be a spaz about it."`),
    laugh(),
    say(`"I get a phone call, I'm gonna take it." We're the Mediocre Care Unit.`),
    laugh(),
    say(`Which is better than the We Couldn't Care Less Unit.`),
    laugh(),
    applause(),

    say(`My wife was in surgery for ten hours.`),
    say(`Beforehand the surgeon goes: "Halfway through I'll probably stop and get lunch."`),
    laugh(),
    say(`I don't need to know that! Why even tell me that?`),
    say(`Was he afraid I'd run into him in the cafeteria? "What are you doing here?!"`),
    laugh(),
    say(`We learned later he's the best brain surgeon. I don't know how they determine that.`),
    say(`Maybe there's a competition. "America's Got Tumors."`),
    laugh(),
    applause(),
    say(`Isn't it enough that someone is a brain surgeon?`),
    say(`And we go, "Yeah, but are they any good?" They're a brain surgeon!`),
    laugh(),
    say(`Can you imagine the pressure? At no point in their workday can they say…`),
    say(`…"Hey, it ain't brain surgery." Because it is ALWAYS brain surgery!`),
    laugh(),
    say(`"What'd you do at work, honey?" — "Brain surgery."`),
    say(`"That's fun. You want some fruit?" — "NEVER!"`),
    laugh(),
    applause(),

    say(`She also had an ear, nose and throat doctor.`),
    say(`Which kind of sounds like they didn't make the cut for brain surgeon.`),
    laugh(),
    say(`"I want to be a brain surgeon." — "Let's stick with ears, nose and throat."`),
    say(`"You'd be better with the things surrounding the brain."`),
    laugh(),
    say(`And those doctors must look at dentists and think: "Just teeth? That's it?"`),
    say(`"I mostly scrape stuff off teeth… while I listen to '80s music."`),
    laugh(),
    applause(),

    say(`I did figure out what kind of doctor I'd want to be: an anesthesiologist.`),
    say(`Just once I'd like to walk into a room and go: "Hi, I'm Dr. Cardigan."`),
    say(`"I'm going to give you drugs so you can't talk or move…`),
    say(`…and then one of these strangers is going to cut you open. Good luck."`),
    laugh(),
    applause(),
    say(`You ever see the anesthesiologist during surgery? Just sitting there…`),
    say(`"I don't even know why I have to be here. Anyone got the WiFi password?"`),
    laugh(),

    say(`Unless we're sick, we listen to absolutely nothing doctors tell us.`),
    say(`"You should lose weight." — "Never going to happen. What else you got?"`),
    laugh(),
    say(`"You should exercise." — "Does eating French fries count?"`),
    say(`"Get out of my office."`),
    laugh(),
    applause(),

    say(`I work out at the Chinatown YMCA.`),
    say(`People hear that and think, "That's not a serious place to work out."`),
    say(`And it's not. It's not at all.`),
    laugh(),
    say(`Watching a 90-year-old on an elliptical really inspires me to die in my 70s.`),
    laugh(),
    applause(),
    say(`At a normal gym it's, "Look how much weight that guy is lifting."`),
    say(`At my Y it's, "Oh my gosh, that guy's smoking… on a treadmill. In dress pants."`),
    laugh(),
    say(`My Y doesn't have the normal health club distractions.`),
    say(`No loud music. No people that are in shape.`),
    laugh(),
    say(`Maybe I should teach a class. "Welcome to Advanced Elliptical."`),
    say(`"We are not going to raise our heart rate. Step on, pick a show…`),
    say(`…and think about what we're going to eat. Who's having a burger?"`),
    laugh(),
    applause(),
    say(`The only people who approach me are personal trainers.`),
    say(`"You looking for a personal trainer?" — "Uh, no." — "You should be."`),
    laugh(),
    say(`So now I just act like they're hitting on me. "I'm married."`),
    say(`"Uh, I don't think you unders—" — "I understand perfectly."`),
    laugh(),
    applause(),

    say(`I performed in Japan for the first time this year.`),
    applause(),
    say(`The Japanese are just better at being human. Can we admit that?`),
    say(`More polite. Better at design. The Japanese toilet.`),
    say(`They took the most disgusting experience of human existence and fixed it.`),
    laugh(),
    say(`It washes you, it dries you, it does your taxes…`),
    say(`…and that is in a Tokyo airport bathroom.`),
    laugh(),
    applause(),
    say(`You leave a Japanese public restroom cleaner than when you walked in.`),
    say(`You leave an American public restroom with PTSD.`),
    laugh(),

    say(`In London I walked through Piccadilly Circus.`),
    say(`Which, for the record, is a horrible circus. There are no animals.`),
    laugh(),
    say(`And I saw that they had an M&M store.`),
    say(`I thought about everything the British gave us. The language. Shakespeare. The Magna Carta.`),
    say(`And I looked at that M&M store and I thought: "Now we're even."`),
    laugh(),
    applause(),
    say(`Has anyone, at any point in their life, thought: "When are they opening an M&M store?"`),
    laugh(),
    say(`Sure, I can buy M&Ms absolutely anywhere. But I like to buy in bulk…`),
    say(`…in a pro-M&M environment.`),
    laugh(),
    say(`We don't even need different coloured M&Ms. They all taste the same.`),
    say(`They're just bits of chocolate shaped like Advil. With an M on it.`),
    laugh(),
    say(`They're not even M&Ms. They're Ms!`),
    laugh(),
    say(`We don't do that with anything else. "You want some raisin & raisins?"`),
    laugh(),
    applause(),
    say(`And this store is three levels. Which makes sense:`),
    say(`First level, you buy M&Ms. Second level, you buy more M&Ms.`),
    say(`Third level, you jump to your death because you wasted time in an M&M store… in London.`),
    laugh(),
    applause(),

    say(`Some people relax in a hot sauna.`),
    say(`And who doesn't love recreating the feeling of being trapped inside an active volcano?`),
    laugh(),
    say(`Here is every experience I have ever had in a sauna:`),
    say(`"Okay. I'm going to get a sweat going. This is going to be really good for me. Here we go."`),
    say(`"…It's time to get out. I don't want to overdo it."`),
    laugh(),
    applause(),
    say(`I always look at the rocks like: "Whoever is cooking the rocks — they're done."`),
    laugh(),
    say(`"That's a wrap on the rock cooking."`),
    laugh(),
    say(`And you are always seated next to a naked 80-year-old man.`),
    say(`I look around the sauna like: "Wow… so THIS is why we wear clothes."`),
    laugh(),
    applause(),
    say(`In Finland, where they invented the sauna, they drink vodka in the sauna.`),
    say(`Which might explain why we have never read any Finnish literature.`),
    laugh(),
    say(`Drinking vodka in a sauna — you know what kind of ideas you come up with?`),
    say(`An M&M store.`),
    laugh(),
    applause(),

    say(`People who enjoy winter seem mentally unstable.`),
    say(`Some of those winter activities should get you committed.`),
    say(`"Look, we love you. We're just worried."`),
    laugh(),
    say(`"Yesterday we caught you walking through the woods with tennis rackets tied to your feet."`),
    laugh(),
    say(`"This morning we saw you sweeping the frozen lake."`),
    laugh(),
    say(`"What's next? You sitting in a sled being pulled by dogs? Get some help."`),
    laugh(),
    applause(),

    say(`You have been wonderful. Thank you so much. Good night!`),
    applause(),
  ],
}

export const SHOWS: Record<string, Show> = { primate: HONORABLE_PRIMATE }

/** Hvor længe en boble står. Replikker får læsetid efter længde; reaktioner er korte. */
export function cueSeconds(c: Cue) {
  return c.kind === 'reaction' ? 2.1 : Math.min(7.5, 1.7 + c.text.length / 19)
}

export interface Playback {
  /** Indeks i `show.cues`. */
  cue: number
  /** Sekunder inde i den aktuelle cue. */
  t: number
}

/**
 * Afspilningspositioner pr. skærm-id. De ligger uden for React, så de overlever at skærmen
 * afmonteres (slukket tv, skift af grafikniveau) — showet fortsætter hvor man kom til.
 */
const positions = new Map<string, Playback>()

export function playbackOf(id: string): Playback {
  let p = positions.get(id)
  if (!p) positions.set(id, (p = { cue: 0, t: 0 }))
  return p
}

/** Skruer showet frem. Kaldes kun mens skærmen er tændt. Showet går om forfra når det er slut. */
export function advance(p: Playback, show: Show, dt: number) {
  p.t += dt
  // While-løkke, så et stort tidsspring ikke efterlader os midt i en cue der for længst er overstået.
  for (let guard = 0; guard < 64; guard++) {
    const len = cueSeconds(show.cues[p.cue] ?? show.cues[0])
    if (p.t < len) break
    p.t -= len
    p.cue = (p.cue + 1) % show.cues.length
  }
}

/** 0–1 gennem showet, til afspillerens statuslinje. */
export const progressOf = (p: Playback, show: Show) => (p.cue + 0.5) / show.cues.length
