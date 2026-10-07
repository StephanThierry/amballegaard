/** Udseende for en figur i showcasen. */
export interface Look {
  name: string
  height: number
  skin: string
  hair: string
  hairStyle: 'short' | 'messy' | 'long' | 'ponytail'
  top: string
  bottom: string
  shoes?: string
  /** Hageskæg (kun på hagen). */
  goatee?: string
  child?: boolean
  /** Mønster på overdelen. */
  pattern?: 'plaid'
  /** Feminin kropsbygning. */
  feminine?: boolean
}

/** Stephans udseende (samme farver som i huset). */
export const STEPHAN: Look = { name: 'Stephan', height: 1.68, skin: '#f1c7a8', hair: '#9a7348', hairStyle: 'short', top: '#262c38', bottom: '#3b4252', goatee: '#a57a4f' }

export const FAMILY_LOOKS: Look[] = [
  STEPHAN,
  { name: 'Lisa', height: 1.68, skin: '#f3cfb6', hair: '#d8b77a', hairStyle: 'long', top: '#b3262e', bottom: '#3d5f8f', pattern: 'plaid', feminine: true, shoes: '#6b4a32' },
  { name: 'Mathilde', height: 1.35, skin: '#f6d6c2', hair: '#b4441f', hairStyle: 'ponytail', top: '#e2a33b', bottom: '#43506a', shoes: '#f0f0f0', child: true },
  { name: 'Max-Emil', height: 1.25, skin: '#f3d0b8', hair: '#c49a5c', hairStyle: 'messy', top: '#3f7cc4', bottom: '#2f3a4f', child: true },
]

/** Fælles afspilningsindstillinger for alle kort (muteres direkte fra UI'et; læses hver frame). */
export const controls = { speed: 1, walking: true }
