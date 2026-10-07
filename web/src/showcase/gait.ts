/**
 * Gangcyklus for en biped. `phase` løber 0→2π pr. dobbeltskridt. Alle vinkler i radianer om x-aksen
 * (positiv = bagud for et nedadhængende lem), så de kan sættes direkte på rotation.x i et hierarki
 * hofte → lår → knæ → fod.
 *
 * - "pendulum": den nuværende gang i huset — stive ben og arme der svinger som penduler.
 * - "natural": knæet bøjer i svingfasen, foden holdes vandret og ruller af, hoften vipper og
 *   kroppen bobber ned i dobbeltstøtten, skuldrene roterer modsat hofterne, og albuerne bøjer.
 * - "bouncy": som natural, men med kortere, hurtigere skridt og større hop (til tegneseriestile).
 */
export type GaitStyle = 'pendulum' | 'natural' | 'bouncy'

export interface Pose {
  bob: number
  hipRoll: number
  torsoYaw: number
  legs: { hip: number; knee: number; ankle: number }[] // [venstre, højre]
  arms: { shoulder: number; elbow: number }[]
  headPitch: number
  /** Overrasket ansigt (åben mund, store øjne). */
  surprised?: boolean
}

/** Spræl i luften: ben der sparker skiftevis med bøjede knæ, arme strakt op og viftende. */
export function flailPose(t: number): Pose {
  const k = (o: number) => Math.sin(t * 16 + o)
  const leg = (o: number) => ({ hip: -0.55 * k(o) - 0.15, knee: 0.55 + 0.55 * (0.5 + 0.5 * k(o + 1.2)), ankle: 0.3 * k(o + 0.5) })
  const arm = (o: number) => ({ shoulder: -2.5 + 0.35 * Math.sin(t * 11 + o), elbow: -0.25 - 0.25 * (0.5 + 0.5 * Math.sin(t * 13 + o)) })
  return {
    bob: 0, hipRoll: 0.12 * Math.sin(t * 9), torsoYaw: 0.2 * Math.sin(t * 6), headPitch: -0.15 + 0.08 * Math.sin(t * 12),
    legs: [leg(0), leg(Math.PI)], arms: [arm(0), arm(Math.PI + 0.7)], surprised: true,
  }
}

export function gaitPose(phase: number, style: GaitStyle, amount = 1): Pose {
  const s = Math.sin(phase), c = Math.cos(phase)
  if (style === 'pendulum') {
    const sw = 0.55 * s * amount
    return {
      bob: Math.abs(c) * 0.025 * amount, hipRoll: 0, torsoYaw: 0, headPitch: 0,
      legs: [{ hip: sw, knee: 0, ankle: 0 }, { hip: -sw, knee: 0, ankle: 0 }],
      arms: [{ shoulder: -sw * 0.8, elbow: 0 }, { shoulder: sw * 0.8, elbow: 0 }],
    }
  }
  const bouncy = style === 'bouncy'
  const stride = (bouncy ? 0.38 : 0.42) * amount
  const leg = (p: number) => {
    const hip = -stride * Math.sin(p)
    // Svingfase når hoften bevæger sig fremad (dhip/dp < 0 ⇔ cos p > 0): knæet bøjer, mest midt i svinget.
    const swing = Math.max(0, Math.cos(p))
    const knee = (0.08 + 1.05 * swing * swing) * amount
    // Holdt foden vandret, med lidt hælisæt foran og tåafvikling bagved.
    const ankle = -(hip + knee) * 0.85 + 0.18 * Math.max(0, Math.sin(p)) * amount
    return { hip, knee, ankle }
  }
  const legs = [leg(phase), leg(phase + Math.PI)]
  const arm = (hip: number) => {
    const shoulder = -hip * 0.85
    // Albuen bøjer mere når armen svinger frem (negativ skulder = frem).
    const elbow = -(0.22 + 0.45 * Math.max(0, -shoulder) / stride * 0.5) * amount
    return { shoulder, elbow }
  }
  return {
    // Lavest i dobbeltstøtten (når benene er spredt), højest når det ene ben passerer det andet.
    bob: (bouncy ? 0.045 : 0.022) * (0.5 + 0.5 * Math.cos(2 * phase)) * amount,
    hipRoll: 0.05 * s * amount,
    torsoYaw: -0.12 * s * amount,
    headPitch: 0.03 * Math.cos(2 * phase) * amount,
    legs,
    // Venstre arm følger højre ben og omvendt.
    arms: [arm(legs[1].hip), arm(legs[0].hip)],
  }
}
