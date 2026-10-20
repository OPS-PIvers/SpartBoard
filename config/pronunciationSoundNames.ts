import type { SpeakLanguage } from '@/types';

// Plain names, example words and hints for every sound Speak can mark (plan §4.5, F10); students never see IPA.

export type SoundNameLocale = 'en' | 'es' | 'de' | 'fr';

type SoundText = readonly [name: string, hint: string];
type LocalizedSound = Readonly<Record<SoundNameLocale, SoundText>>;

export const SOUND_NAME_LOCALES: readonly SoundNameLocale[] = [
  'en',
  'es',
  'de',
  'fr',
];

/** Shared across languages; `LANGUAGE_SOUNDS` overrides a token whose name or advice differs. */
const BASE_SOUNDS: Readonly<Record<string, LocalizedSound>> = {
  a: {
    en: ['Open a', 'Open your mouth wide and drop your jaw.'],
    es: ['a abierta', 'Abre bien la boca y baja la mandíbula.'],
    de: ['Offenes a', 'Öffne den Mund weit und senke den Kiefer.'],
    fr: ['a ouvert', 'Ouvre grand la bouche et baisse la mâchoire.'],
  },
  aː: {
    en: ['Long a', 'Open your mouth wide and hold the sound longer.'],
    es: ['a larga', 'Abre bien la boca y alarga el sonido.'],
    de: ['Langes a', 'Öffne den Mund weit und halte den Laut länger.'],
    fr: ['a long', 'Ouvre grand la bouche et tiens le son plus longtemps.'],
  },
  ɑː: {
    en: ['Long ah', 'Open your mouth wide and hold the sound.'],
    es: ['a larga profunda', 'Abre bien la boca y mantén el sonido.'],
    de: ['Langes a (hinten)', 'Öffne den Mund weit und halte den Laut.'],
    fr: ['a long', 'Ouvre grand la bouche et tiens le son.'],
  },
  ɑ: {
    en: ['Short ah', 'Open your mouth wide and keep it short.'],
    es: ['a corta profunda', 'Abre bien la boca y que sea breve.'],
    de: ['Kurzes a (hinten)', 'Öffne den Mund weit und sprich ihn kurz.'],
    fr: ['a bref', 'Ouvre grand la bouche et garde le son court.'],
  },
  ɑ̃: {
    en: ['Nasal ah', 'Say ah and let air flow through your nose.'],
    es: ['a nasal', 'Di a y deja salir el aire por la nariz.'],
    de: ['Nasales a', 'Sag a und lass die Luft durch die Nase strömen.'],
    fr: ['a nasal', "Dis a et laisse l'air passer par le nez."],
  },
  ɔ̃: {
    en: ['Nasal o', 'Say o and let air flow through your nose.'],
    es: ['o nasal', 'Di o y deja salir el aire por la nariz.'],
    de: ['Nasales o', 'Sag o und lass die Luft durch die Nase strömen.'],
    fr: ['o nasal', "Dis o et laisse l'air passer par le nez."],
  },
  æ: {
    en: ['Short a', 'Drop your jaw and spread your lips.'],
    es: ['a corta abierta', 'Baja la mandíbula y estira los labios.'],
    de: ['Kurzes ä', 'Senke den Kiefer und ziehe die Lippen auseinander.'],
    fr: ['a bref ouvert', 'Baisse la mâchoire et étire les lèvres.'],
  },
  e: {
    en: ['Clear e', "Keep your tongue still. Don't slide into ee."],
    es: ['e clara', 'Mantén la lengua quieta. No la deslices hacia i.'],
    de: ['Klares e', 'Halte die Zunge ruhig. Gleite nicht zu i weiter.'],
    fr: ['e net', 'Garde la langue immobile. Ne glisse pas vers i.'],
  },
  eː: {
    en: ['Long e', 'Smile a little and hold a steady e.'],
    es: ['e larga', 'Sonríe un poco y mantén una e firme.'],
    de: ['Langes e', 'Lächle ein wenig und halte ein gleichmäßiges e.'],
    fr: ['e long', 'Souris un peu et tiens un e stable.'],
  },
  ɛ: {
    en: ['Short e', 'Open your mouth halfway and relax your tongue.'],
    es: ['e corta', 'Abre la boca a la mitad y relaja la lengua.'],
    de: ['Kurzes e', 'Öffne den Mund halb und entspanne die Zunge.'],
    fr: ['e bref', 'Ouvre la bouche à moitié et détends la langue.'],
  },
  ɛː: {
    en: ['Long ä', 'Open your mouth halfway and hold the sound.'],
    es: ['ä larga', 'Abre la boca a la mitad y alarga el sonido.'],
    de: ['Langes ä', 'Öffne den Mund halb und halte den Laut.'],
    fr: ['ä long', 'Ouvre la bouche à moitié et tiens le son.'],
  },
  i: {
    en: ['Short ee', 'Smile and keep the sound short.'],
    es: ['i corta', 'Sonríe y que el sonido sea breve.'],
    de: ['Kurzes i', 'Lächle und sprich den Laut kurz.'],
    fr: ['i bref', 'Souris et garde le son court.'],
  },
  iː: {
    en: ['Long ee', 'Smile and hold a steady ee.'],
    es: ['i larga', 'Sonríe y mantén una i firme.'],
    de: ['Langes i', 'Lächle und halte ein gleichmäßiges i.'],
    fr: ['i long', 'Souris et tiens un i stable.'],
  },
  ɪ: {
    en: ['Short i', "Relax your tongue. It's shorter than ee."],
    es: ['i relajada', 'Relaja la lengua. Es más breve y suave que la i.'],
    de: [
      'Kurzes, offenes i',
      'Entspanne die Zunge. Es ist kürzer und lockerer als ein langes i.',
    ],
    fr: ['i relâché', "Détends la langue. C'est plus court qu'un i."],
  },
  ᵻ: {
    en: ['Weak i', 'Say a quick, relaxed i.'],
    es: ['i débil', 'Di una i rápida y relajada.'],
    de: ['Schwaches i', 'Sag ein kurzes, entspanntes i.'],
    fr: ['i faible', 'Dis un i rapide et détendu.'],
  },
  o: {
    en: ['Clear o', 'Round your lips and keep them still.'],
    es: ['o clara', 'Redondea los labios y mantenlos quietos.'],
    de: ['Klares o', 'Runde die Lippen und halte sie ruhig.'],
    fr: ['o net', 'Arrondis les lèvres et garde-les immobiles.'],
  },
  oː: {
    en: ['Long o', 'Round your lips and hold a steady o.'],
    es: ['o larga', 'Redondea los labios y mantén una o firme.'],
    de: ['Langes o', 'Runde die Lippen und halte ein gleichmäßiges o.'],
    fr: ['o long', 'Arrondis les lèvres et tiens un o stable.'],
  },
  ɔ: {
    en: ['Open o', 'Round your lips loosely and drop your jaw.'],
    es: ['o abierta', 'Redondea los labios sin apretar y baja la mandíbula.'],
    de: ['Offenes o', 'Runde die Lippen locker und senke den Kiefer.'],
    fr: [
      'o ouvert',
      'Arrondis les lèvres sans les serrer et baisse la mâchoire.',
    ],
  },
  ɔː: {
    en: ['Long aw', 'Round your lips loosely and hold the sound.'],
    es: [
      'o larga abierta',
      'Redondea los labios sin apretar y alarga el sonido.',
    ],
    de: ['Langes offenes o', 'Runde die Lippen locker und halte den Laut.'],
    fr: [
      'o long ouvert',
      'Arrondis les lèvres sans les serrer et tiens le son.',
    ],
  },
  u: {
    en: ['Clear u', 'Round your lips tightly, like for a whistle.'],
    es: ['u clara', 'Redondea bien los labios, como para silbar.'],
    de: ['Klares u', 'Runde die Lippen eng, wie zum Pfeifen.'],
    fr: ['ou net', 'Arrondis bien les lèvres, comme pour siffler.'],
  },
  uː: {
    en: ['Long oo', 'Round your lips tightly and hold the sound.'],
    es: ['u larga', 'Redondea bien los labios y alarga el sonido.'],
    de: ['Langes u', 'Runde die Lippen eng und halte den Laut.'],
    fr: ['ou long', 'Arrondis bien les lèvres et tiens le son.'],
  },
  ʊ: {
    en: ['Short oo', 'Round your lips loosely and keep it short.'],
    es: ['u relajada', 'Redondea los labios sin apretar y que sea breve.'],
    de: ['Kurzes u', 'Runde die Lippen locker und sprich es kurz.'],
    fr: [
      'ou bref',
      'Arrondis les lèvres sans les serrer et garde le son court.',
    ],
  },
  y: {
    en: ['Short ü', 'Say i, then round your lips without moving your tongue.'],
    es: ['ü corta', 'Di i y luego redondea los labios sin mover la lengua.'],
    de: [
      'Kurzes ü',
      'Sag i und runde dann die Lippen, ohne die Zunge zu bewegen.',
    ],
    fr: ['ü bref', 'Dis i, puis arrondis les lèvres sans bouger la langue.'],
  },
  yː: {
    en: ['Long ü', 'Say ee, then round your lips and hold it.'],
    es: ['ü larga', 'Di i, luego redondea los labios y mantén el sonido.'],
    de: ['Langes ü', 'Sag i, runde dann die Lippen und halte den Laut.'],
    fr: ['ü long', 'Dis i, puis arrondis les lèvres et tiens le son.'],
  },
  ø: {
    en: ['Short ö', 'Say e, then round your lips.'],
    es: ['ö corta', 'Di e y luego redondea los labios.'],
    de: ['Kurzes ö', 'Sag e und runde dann die Lippen.'],
    fr: ['ö bref', 'Dis é, puis arrondis les lèvres.'],
  },
  øː: {
    en: ['Long ö', 'Say e, then round your lips and hold it.'],
    es: ['ö larga', 'Di e, luego redondea los labios y mantén el sonido.'],
    de: ['Langes ö', 'Sag e, runde dann die Lippen und halte den Laut.'],
    fr: ['ö long', 'Dis é, puis arrondis les lèvres et tiens le son.'],
  },
  œ: {
    en: ['Open ö', 'Say the e in bed, then round your lips.'],
    es: ['ö abierta', 'Di una e abierta y luego redondea los labios.'],
    de: ['Offenes ö', 'Sag das e in Bett und runde dann die Lippen.'],
    fr: ['ö ouvert', 'Dis le e de « mer », puis arrondis les lèvres.'],
  },
  ə: {
    en: ['Weak uh', 'Say a short, relaxed uh.'],
    es: ['vocal débil', 'Di una vocal corta y relajada, como una e muy suave.'],
    de: ['Schwaches e', 'Sag ein kurzes, entspanntes e.'],
    fr: ['e neutre', 'Dis un « euh » court et détendu.'],
  },
  ɐ: {
    en: ['Weak uh', 'Say a short, relaxed uh.'],
    es: ['vocal débil', 'Di una vocal corta y relajada, como una a muy suave.'],
    de: ['Schwaches e', 'Sag ein kurzes, entspanntes e.'],
    fr: ['e neutre', 'Dis un « euh » court et détendu.'],
  },
  ɜ: {
    en: ['Soft -er ending', 'Relax your mouth and say a soft uh, with no r.'],
    es: ['final -er suave', 'Relaja la boca y di una vocal suave, sin r.'],
    de: [
      'Weiche -er-Endung',
      'Entspanne den Mund und sag ein weiches e, ohne r.',
    ],
    fr: [
      'finale -er douce',
      'Détends la bouche et dis un « euh » doux, sans r.',
    ],
  },
  ɜː: {
    en: ['er sound', 'Curl your tongue back a little and hold the sound.'],
    es: [
      'sonido er',
      'Curva un poco la lengua hacia atrás y alarga el sonido.',
    ],
    de: ['er-Laut', 'Biege die Zunge ein wenig zurück und halte den Laut.'],
    fr: ['son er', "Recourbe un peu la langue vers l'arrière et tiens le son."],
  },
  ɚ: {
    en: ['Weak er', 'Say a short er with your tongue curled back.'],
    es: ['er débil', 'Di una er breve con la lengua curvada hacia atrás.'],
    de: ['Schwaches er', 'Sag ein kurzes er mit zurückgebogener Zunge.'],
    fr: [
      'er faible',
      "Dis un er court en recourbant la langue vers l'arrière.",
    ],
  },
  ʌ: {
    en: ['Short uh', 'Open your mouth a little and say a short uh.'],
    es: [
      'a corta relajada',
      'Abre un poco la boca y di una a breve y relajada.',
    ],
    de: [
      'Kurzes dumpfes a',
      'Öffne den Mund ein wenig und sag ein kurzes, dumpfes a.',
    ],
    fr: [
      'a bref détendu',
      'Ouvre un peu la bouche et dis un a court et détendu.',
    ],
  },
  ərɜ: {
    en: ['-erer ending', 'Say a soft e, a light r, then a soft uh.'],
    es: ['final -erer', 'Di una e suave, una r ligera y una vocal suave.'],
    de: [
      '-erer-Endung',
      'Sag ein weiches e, ein leichtes r und dann ein weiches e.',
    ],
    fr: ['finale -erer', 'Dis un e doux, un r léger, puis un « euh » doux.'],
  },
  əl: {
    en: [
      '-le ending',
      'Say a soft uh, then touch your tongue behind your teeth.',
    ],
    es: [
      'final -le',
      'Di una vocal suave y toca con la lengua detrás de los dientes.',
    ],
    de: [
      '-le-Endung',
      'Sag ein weiches e und lege dann die Zunge hinter die Zähne.',
    ],
    fr: [
      'finale -le',
      'Dis un « euh » doux, puis pose la langue derrière les dents.',
    ],
  },
  n̩: {
    en: ['-n ending', 'Go straight to n with no vowel before it.'],
    es: ['final -n', 'Pasa directo a la n, sin vocal antes.'],
    de: ['-n-Endung', 'Geh direkt zu n über, ohne Vokal davor.'],
    fr: ['finale -n', 'Va tout de suite au n, sans voyelle avant.'],
  },
  ʔ: {
    en: ['Throat stop', 'Close your throat for a moment, like in uh-oh.'],
    es: [
      'parada de garganta',
      'Cierra la garganta un momento, como entre las dos partes de ¡uh-oh!',
    ],
    de: ['Knacklaut', 'Schließe kurz die Kehle, wie bei „Oh-oh“.'],
    fr: ['coup de glotte', 'Ferme la gorge un instant, comme dans « euh-oh ».'],
  },
  aɪ: {
    en: ['eye sound', 'Start at ah and slide to ee.'],
    es: ['sonido ai', 'Empieza en a y desliza hacia i.'],
    de: ['ai-Laut', 'Beginne bei a und gleite zu i.'],
    fr: ['son aï', 'Commence par a et glisse vers i.'],
  },
  aʊ: {
    en: ['ow sound', 'Start at ah and slide to oo.'],
    es: ['sonido au', 'Empieza en a y desliza hacia u.'],
    de: ['au-Laut', 'Beginne bei a und gleite zu u.'],
    fr: ['son aou', 'Commence par a et glisse vers ou.'],
  },
  eɪ: {
    en: ['ay sound', 'Start at e and slide to ee.'],
    es: ['sonido ei', 'Empieza en e y desliza hacia i.'],
    de: ['ei-Laut (e-i)', 'Beginne bei e und gleite zu i.'],
    fr: ['son eï', 'Commence par é et glisse vers i.'],
  },
  ɛɪ: {
    en: ['ay sound', 'Start at e and slide to ee.'],
    es: ['sonido ei', 'Empieza en e y desliza hacia i.'],
    de: ['ei-Laut (e-i)', 'Beginne bei e und gleite zu i.'],
    fr: ['son eï', 'Commence par é et glisse vers i.'],
  },
  eʊ: {
    en: ['eu sound', 'Start at e and slide to oo.'],
    es: ['sonido eu', 'Empieza en e y desliza hacia u.'],
    de: ['eu-Laut (e-u)', 'Beginne bei e und gleite zu u.'],
    fr: ['son eu', 'Commence par é et glisse vers ou.'],
  },
  oɪ: {
    en: ['oy sound', 'Start at o and slide to ee.'],
    es: ['sonido oi', 'Empieza en o y desliza hacia i.'],
    de: ['oi-Laut', 'Beginne bei o und gleite zu i.'],
    fr: ['son oï', 'Commence par o et glisse vers i.'],
  },
  ɔɪ: {
    en: ['oy sound', 'Start at o and slide to ee.'],
    es: ['sonido oi', 'Empieza en o y desliza hacia i.'],
    de: ['oi-Laut', 'Beginne bei o und gleite zu i.'],
    fr: ['son oï', 'Commence par o et glisse vers i.'],
  },
  ɔø: {
    en: ['eu sound', 'Start at o and slide to ü.'],
    es: ['sonido eu alemán', 'Empieza en o y desliza hacia ü.'],
    de: ['eu-Laut', 'Beginne bei o und gleite zu ü.'],
    fr: ['son eu', 'Commence par o et glisse vers ü.'],
  },
  oʊ: {
    en: ['Long o', 'Start at o and slide to oo.'],
    es: ['o larga', 'Empieza en o y desliza hacia u.'],
    de: ['Langes o (gleitend)', 'Beginne bei o und gleite zu u.'],
    fr: ['o long', 'Commence par o et glisse vers ou.'],
  },
  aɪə: {
    en: ['eye-uh', 'Say the eye sound, then a soft uh.'],
    es: ['ai y vocal suave', 'Di el sonido ai y luego una vocal suave.'],
    de: ['ai-e', 'Sag den ai-Laut und dann ein weiches e.'],
    fr: ['aï-e', 'Dis le son aï, puis un « euh » doux.'],
  },
  aɪɚ: {
    en: ['eye-er', 'Say the eye sound, then a soft er.'],
    es: ['ai y er', 'Di el sonido ai y luego una er suave.'],
    de: ['ai-er', 'Sag den ai-Laut und dann ein weiches er.'],
    fr: ['aï-er', 'Dis le son aï, puis un er doux.'],
  },
  iə: {
    en: ['ee-uh', 'Say ee, then a soft uh.'],
    es: ['i y vocal suave', 'Di i y luego una vocal suave.'],
    de: ['i-e', 'Sag i und dann ein weiches e.'],
    fr: ['i-e', 'Dis i, puis un « euh » doux.'],
  },
  ɪɹ: {
    en: ['eer sound', 'Say a short i, then curl into r.'],
    es: ['sonido ir', 'Di una i breve y luego curva la lengua hacia la r.'],
    de: ['ir-Laut', 'Sag ein kurzes i und biege die Zunge dann zum r.'],
    fr: ['son ir', 'Dis un i court, puis recourbe la langue vers le r.'],
  },
  ɛɹ: {
    en: ['air sound', 'Say a short e, then curl into r.'],
    es: [
      'sonido er abierto',
      'Di una e breve y luego curva la lengua hacia la r.',
    ],
    de: [
      'er-Laut (wie in air)',
      'Sag ein kurzes e und biege die Zunge dann zum r.',
    ],
    fr: ['son er', 'Dis un e court, puis recourbe la langue vers le r.'],
  },
  ʊɹ: {
    en: ['oor sound', 'Say a short oo, then curl into r.'],
    es: ['sonido ur', 'Di una u breve y luego curva la lengua hacia la r.'],
    de: ['ur-Laut', 'Sag ein kurzes u und biege die Zunge dann zum r.'],
    fr: ['son our', 'Dis un ou court, puis recourbe la langue vers le r.'],
  },
  ɑːɹ: {
    en: ['ar sound', 'Open wide for ah, then curl into r.'],
    es: [
      'sonido ar',
      'Abre bien la boca para la a y luego curva la lengua hacia la r.',
    ],
    de: [
      'ar-Laut',
      'Öffne den Mund weit für a und biege die Zunge dann zum r.',
    ],
    fr: ['son ar', 'Ouvre grand pour a, puis recourbe la langue vers le r.'],
  },
  ɔːɹ: {
    en: ['or sound', 'Round your lips for aw, then curl into r.'],
    es: [
      'sonido or',
      'Redondea los labios para la o y luego curva la lengua hacia la r.',
    ],
    de: ['or-Laut', 'Runde die Lippen für o und biege die Zunge dann zum r.'],
    fr: [
      'son or',
      'Arrondis les lèvres pour o, puis recourbe la langue vers le r.',
    ],
  },
  oːɹ: {
    en: ['or sound', 'Round your lips for o, then curl into r.'],
    es: [
      'sonido or',
      'Redondea los labios para la o y luego curva la lengua hacia la r.',
    ],
    de: ['or-Laut', 'Runde die Lippen für o und biege die Zunge dann zum r.'],
    fr: [
      'son or',
      'Arrondis les lèvres pour o, puis recourbe la langue vers le r.',
    ],
  },
  ee: {
    en: ['Double e', 'Say e twice, smoothly.'],
    es: ['e doble', 'Di e dos veces, sin cortar.'],
    de: ['Doppeltes e', 'Sag e zweimal, ohne Pause.'],
    fr: ['e double', 'Dis e deux fois, sans coupure.'],
  },
  oe: {
    en: ['o then e', 'Say o, then e, with no stop.'],
    es: ['o y luego e', 'Di o y luego e, sin parar.'],
    de: ['o dann e', 'Sag o und dann e, ohne Pause.'],
    fr: ['o puis e', "Dis o, puis e, sans t'arrêter."],
  },
  ie: {
    en: ['i then e', 'Say i, then e, with no stop.'],
    es: ['i y luego e', 'Di i y luego e, sin parar.'],
    de: ['i dann e', 'Sag i und dann e, ohne Pause.'],
    fr: ['i puis e', "Dis i, puis e, sans t'arrêter."],
  },
  ai: {
    en: ['a then i', 'Say a, then i, with no stop.'],
    es: ['a y luego i', 'Di a y luego i, sin parar.'],
    de: ['a dann i', 'Sag a und dann i, ohne Pause.'],
    fr: ['a puis i', "Dis a, puis i, sans t'arrêter."],
  },
  au: {
    en: ['a then u', 'Say a, then u, with no stop.'],
    es: ['a y luego u', 'Di a y luego u, sin parar.'],
    de: ['a dann u', 'Sag a und dann u, ohne Pause.'],
    fr: ['a puis u', "Dis a, puis u, sans t'arrêter."],
  },
  ui: {
    en: ['u then i', 'Say u, then i, with no stop.'],
    es: ['u y luego i', 'Di u y luego i, sin parar.'],
    de: ['u dann i', 'Sag u und dann i, ohne Pause.'],
    fr: ['u puis i', "Dis u, puis i, sans t'arrêter."],
  },
  uo: {
    en: ['u then o', 'Say u, then o, with no stop.'],
    es: ['u y luego o', 'Di u y luego o, sin parar.'],
    de: ['u dann o', 'Sag u und dann o, ohne Pause.'],
    fr: ['u puis o', "Dis u, puis o, sans t'arrêter."],
  },
  ja: {
    en: ['ya sound', 'Slide quickly from ee into a.'],
    es: ['sonido ya', 'Desliza rápido de i a a.'],
    de: ['ja-Laut', 'Gleite schnell von j zu a.'],
    fr: ['son ya', 'Glisse vite de i vers a.'],
  },
  ju: {
    en: ['yu sound', 'Slide quickly from ee into oo.'],
    es: ['sonido yu', 'Desliza rápido de i a u.'],
    de: ['ju-Laut', 'Gleite schnell von j zu u.'],
    fr: ['son you', 'Glisse vite de i vers ou.'],
  },
  pː: {
    en: ['Held p', 'Close your lips and hold them a moment.'],
    es: ['p sostenida', 'Cierra los labios y mantenlos así un momento.'],
    de: ['Gehaltenes p', 'Schließe die Lippen und halte sie einen Moment.'],
    fr: ['p tenu', 'Ferme les lèvres et garde-les fermées un instant.'],
  },
  p: {
    en: ['p', 'Close your lips and let them pop open.'],
    es: ['p', 'Cierra los labios y ábrelos de golpe.'],
    de: ['p', 'Schließe die Lippen und lass sie aufspringen.'],
    fr: ['p', "Ferme les lèvres et laisse-les s'ouvrir d'un coup."],
  },
  pʰ: {
    en: ['p with a puff', 'Pop your lips open with a small puff of air.'],
    es: [
      'p con soplo',
      'Abre los labios de golpe con un pequeño soplo de aire.',
    ],
    de: [
      'p mit Lufthauch',
      'Lass die Lippen mit einem kleinen Lufthauch aufspringen.',
    ],
    fr: [
      'p soufflé',
      "Ouvre les lèvres d'un coup avec un petit souffle d'air.",
    ],
  },
  t: {
    en: ['t', 'Tap your tongue just behind your top teeth.'],
    es: ['t', 'Toca con la lengua justo detrás de los dientes de arriba.'],
    de: ['t', 'Tippe mit der Zunge knapp hinter die oberen Zähne.'],
    fr: ['t', 'Touche la langue juste derrière les dents du haut.'],
  },
  tʰ: {
    en: ['t with a puff', 'Tap behind your teeth with a small puff of air.'],
    es: [
      't con soplo',
      'Toca detrás de los dientes con un pequeño soplo de aire.',
    ],
    de: [
      't mit Lufthauch',
      'Tippe hinter die Zähne und lass einen kleinen Lufthauch folgen.',
    ],
    fr: ['t soufflé', "Touche derrière les dents avec un petit souffle d'air."],
  },
  k: {
    en: ['k', 'Lift the back of your tongue, then let it go.'],
    es: ['k', 'Levanta la parte de atrás de la lengua y suéltala.'],
    de: ['k', 'Hebe den hinteren Teil der Zunge und lass ihn dann los.'],
    fr: ['k', "Lève l'arrière de la langue, puis relâche."],
  },
  kʰ: {
    en: [
      'k with a puff',
      'Release the back of your tongue with a small puff of air.',
    ],
    es: [
      'k con soplo',
      'Suelta la parte de atrás de la lengua con un pequeño soplo de aire.',
    ],
    de: [
      'k mit Lufthauch',
      'Löse den hinteren Zungenteil mit einem kleinen Lufthauch.',
    ],
    fr: [
      'k soufflé',
      "Relâche l'arrière de la langue avec un petit souffle d'air.",
    ],
  },
  b: {
    en: ['b', 'Close your lips and use your voice.'],
    es: ['b', 'Cierra los labios y usa la voz.'],
    de: ['b', 'Schließe die Lippen und nutze deine Stimme.'],
    fr: ['b', 'Ferme les lèvres et fais vibrer ta voix.'],
  },
  β: {
    en: ['Soft b', "Bring your lips close, but don't let them touch."],
    es: ['b suave', 'Acerca los labios, pero sin que se toquen.'],
    de: [
      'Weiches b',
      'Bring die Lippen nah zusammen, aber lass sie sich nicht berühren.',
    ],
    fr: ['b doux', 'Rapproche les lèvres sans les faire se toucher.'],
  },
  d: {
    en: ['d', 'Tap behind your top teeth and use your voice.'],
    es: ['d', 'Toca detrás de los dientes de arriba y usa la voz.'],
    de: ['d', 'Tippe hinter die oberen Zähne und nutze deine Stimme.'],
    fr: ['d', 'Touche derrière les dents du haut et fais vibrer ta voix.'],
  },
  ð: {
    en: ['Voiced th', 'Put your tongue between your teeth and use your voice.'],
    es: ['th sonora', 'Pon la lengua entre los dientes y usa la voz.'],
    de: [
      'Stimmhaftes th',
      'Lege die Zunge zwischen die Zähne und nutze deine Stimme.',
    ],
    fr: [
      'th sonore',
      'Place la langue entre les dents et fais vibrer ta voix.',
    ],
  },
  ɡ: {
    en: ['g', 'Lift the back of your tongue and use your voice.'],
    es: ['g', 'Levanta la parte de atrás de la lengua y usa la voz.'],
    de: ['g', 'Hebe den hinteren Teil der Zunge und nutze deine Stimme.'],
    fr: ['g', "Lève l'arrière de la langue et fais vibrer ta voix."],
  },
  ɣ: {
    en: ['Soft g', "Lift the back of your tongue close, but don't touch."],
    es: ['g suave', 'Acerca la parte de atrás de la lengua, pero sin tocar.'],
    de: [
      'Weiches g',
      'Hebe den hinteren Teil der Zunge nah heran, aber ohne Berührung.',
    ],
    fr: [
      'g doux',
      "Rapproche l'arrière de la langue du palais sans le toucher.",
    ],
  },
  f: {
    en: ['f', 'Rest your top teeth on your bottom lip and blow.'],
    es: ['f', 'Apoya los dientes de arriba en el labio de abajo y sopla.'],
    de: ['f', 'Lege die oberen Zähne auf die Unterlippe und blase.'],
    fr: ['f', 'Pose les dents du haut sur la lèvre du bas et souffle.'],
  },
  v: {
    en: ['v', 'Rest your top teeth on your bottom lip and use your voice.'],
    es: ['v', 'Apoya los dientes de arriba en el labio de abajo y usa la voz.'],
    de: [
      'w',
      'Lege die oberen Zähne auf die Unterlippe und nutze deine Stimme.',
    ],
    fr: [
      'v',
      'Pose les dents du haut sur la lèvre du bas et fais vibrer ta voix.',
    ],
  },
  s: {
    en: ['s', 'Keep your tongue behind your teeth and hiss.'],
    es: ['s', 'Mantén la lengua detrás de los dientes y deja salir el aire.'],
    de: ['s', 'Halte die Zunge hinter den Zähnen und zische.'],
    fr: ['s', 'Garde la langue derrière les dents et siffle.'],
  },
  z: {
    en: ['z', 'Hiss like s and use your voice.'],
    es: ['z sonora', 'Haz una s y usa la voz.'],
    de: ['Stimmhaftes s', 'Zische wie bei s und nutze deine Stimme.'],
    fr: ['z', 'Siffle comme un s et fais vibrer ta voix.'],
  },
  θ: {
    en: ['th sound', 'Put your tongue between your teeth and blow.'],
    es: ['th sorda', 'Pon la lengua entre los dientes y sopla.'],
    de: ['th-Laut', 'Lege die Zunge zwischen die Zähne und blase.'],
    fr: ['son th', 'Place la langue entre les dents et souffle.'],
  },
  ʃ: {
    en: ['sh sound', 'Round your lips and push air over your tongue.'],
    es: ['sonido sh', 'Redondea los labios y empuja el aire sobre la lengua.'],
    de: ['sch-Laut', 'Runde die Lippen und presse Luft über die Zunge.'],
    fr: ['son ch', "Arrondis les lèvres et pousse l'air sur la langue."],
  },
  ʒ: {
    en: ['zh sound', 'Say sh and use your voice.'],
    es: ['sonido zh', 'Di sh y usa la voz.'],
    de: ['Stimmhaftes sch', 'Sag sch und nutze deine Stimme.'],
    fr: ['son j', 'Dis ch et fais vibrer ta voix.'],
  },
  tʃ: {
    en: ['ch sound', 'Start with t and let it go into sh.'],
    es: ['sonido ch', 'Empieza con t y deja que pase a sh.'],
    de: ['tsch-Laut', 'Beginne mit t und lass es in sch übergehen.'],
    fr: ['son tch', 'Commence par t et enchaîne avec ch.'],
  },
  dʒ: {
    en: ['j sound', 'Start with d and let it go into zh.'],
    es: ['sonido y fuerte', 'Empieza con d y deja que pase a zh.'],
    de: [
      'dsch-Laut',
      'Beginne mit d und lass es in stimmhaftes sch übergehen.',
    ],
    fr: ['son dj', 'Commence par d et enchaîne avec j.'],
  },
  ts: {
    en: ['ts sound', 'Say t and s together, quickly.'],
    es: ['sonido ts', 'Di t y s juntas, rápido.'],
    de: ['z-Laut', 'Sag t und s schnell zusammen.'],
    fr: ['son ts', 'Dis t et s ensemble, vite.'],
  },
  tsh: {
    en: ['ts sound', 'Say t and s together, quickly.'],
    es: ['sonido ts', 'Di t y s juntas, rápido.'],
    de: ['z-Laut', 'Sag t und s schnell zusammen.'],
    fr: ['son ts', 'Dis t et s ensemble, vite.'],
  },
  pf: {
    en: ['pf sound', 'Close your lips, then let them go into f.'],
    es: ['sonido pf', 'Cierra los labios y suéltalos hacia una f.'],
    de: ['pf-Laut', 'Schließe die Lippen und lass sie in f übergehen.'],
    fr: ['son pf', 'Ferme les lèvres, puis enchaîne avec f.'],
  },
  th: {
    en: ['t then h', 'Say t, then breathe out an h.'],
    es: ['t y luego h', 'Di t y luego suelta el aire como una h.'],
    de: ['t dann h', 'Sag t und hauche dann ein h.'],
    fr: ['t puis h', 'Dis t, puis souffle un h.'],
  },
  ph: {
    en: ['p then h', 'Say p, then breathe out an h.'],
    es: ['p y luego h', 'Di p y luego suelta el aire como una h.'],
    de: ['p dann h', 'Sag p und hauche dann ein h.'],
    fr: ['p puis h', 'Dis p, puis souffle un h.'],
  },
  kh: {
    en: ['k then h', 'Say k, then breathe out an h.'],
    es: ['k y luego h', 'Di k y luego suelta el aire como una h.'],
    de: ['k dann h', 'Sag k und hauche dann ein h.'],
    fr: ['k puis h', 'Dis k, puis souffle un h.'],
  },
  h: {
    en: ['h sound', 'Breathe out gently from your throat.'],
    es: ['sonido h', 'Suelta el aire suavemente desde la garganta.'],
    de: ['h-Laut', 'Hauche sanft aus der Kehle.'],
    fr: ['h soufflé', 'Souffle doucement depuis la gorge.'],
  },
  x: {
    en: [
      'ch as in Bach',
      'Raise the back of your tongue and push air through.',
    ],
    es: [
      'ch como en Bach',
      'Levanta la parte de atrás de la lengua y deja pasar el aire.',
    ],
    de: [
      'ch wie in Bach',
      'Hebe den hinteren Teil der Zunge und presse Luft hindurch.',
    ],
    fr: ['ch de Bach', "Lève l'arrière de la langue et fais passer l'air."],
  },
  ç: {
    en: ['ch as in ich', 'Smile, raise your tongue, and push air out softly.'],
    es: [
      'ch como en ich',
      'Sonríe, levanta la lengua y deja salir el aire suavemente.',
    ],
    de: [
      'ch wie in ich',
      'Lächle, hebe die Zunge und blase die Luft sanft hinaus.',
    ],
    fr: ['ch de ich', "Souris, lève la langue et pousse doucement l'air."],
  },
  ʁ: {
    en: ['German r', 'Make a soft gargle at the back of your throat.'],
    es: ['r alemana', 'Haz un gargarismo suave al fondo de la garganta.'],
    de: ['Deutsches r', 'Mache ein sanftes Gurgeln hinten im Hals.'],
    fr: ['r allemand', 'Fais un petit gargouillis au fond de la gorge.'],
  },
  r: {
    en: ['Rolled r', 'Let the tip of your tongue flutter.'],
    es: ['r vibrante', 'Deja que la punta de la lengua vibre.'],
    de: ['Gerolltes r', 'Lass die Zungenspitze flattern.'],
    fr: ['r roulé', 'Laisse le bout de la langue vibrer.'],
  },
  ɾ: {
    en: ['Tapped r', 'Tap the tip of your tongue once, quickly.'],
    es: ['r simple', 'Toca una sola vez, rápido, con la punta de la lengua.'],
    de: ['Geschlagenes r', 'Schlage mit der Zungenspitze einmal schnell an.'],
    fr: ['r battu', 'Touche une seule fois, vite, avec le bout de la langue.'],
  },
  ɹ: {
    en: [
      'English r',
      'Curl your tongue back without touching the roof of your mouth.',
    ],
    es: ['r inglesa', 'Curva la lengua hacia atrás sin tocar el paladar.'],
    de: [
      'Englisches r',
      'Biege die Zunge zurück, ohne den Gaumen zu berühren.',
    ],
    fr: [
      'r anglais',
      "Recourbe la langue vers l'arrière sans toucher le palais.",
    ],
  },
  l: {
    en: [
      'l',
      'Touch behind your top teeth and let air flow around your tongue.',
    ],
    es: [
      'l',
      'Toca detrás de los dientes de arriba y deja pasar el aire por los lados de la lengua.',
    ],
    de: [
      'l',
      'Berühre die Stelle hinter den oberen Zähnen und lass die Luft seitlich an der Zunge vorbeiströmen.',
    ],
    fr: [
      'l',
      "Touche derrière les dents du haut et laisse l'air passer autour de la langue.",
    ],
  },
  ʎ: {
    en: [
      'll sound',
      'Press the middle of your tongue up, like l and y together.',
    ],
    es: [
      'sonido ll',
      'Presiona el centro de la lengua hacia arriba, como una l y una y juntas.',
    ],
    de: ['ll-Laut', 'Drücke die Zungenmitte nach oben, wie l und j zusammen.'],
    fr: [
      'son ll',
      'Appuie le milieu de la langue vers le haut, comme l et y ensemble.',
    ],
  },
  ʝ: {
    en: [
      'y sound',
      'Press your tongue close to the roof of your mouth and use your voice.',
    ],
    es: ['sonido y', 'Acerca la lengua al paladar y usa la voz.'],
    de: [
      'j-Laut (weich)',
      'Bring die Zunge nah an den Gaumen und nutze deine Stimme.',
    ],
    fr: ['son y', 'Rapproche la langue du palais et fais vibrer ta voix.'],
  },
  j: {
    en: ['y sound', 'Glide quickly, like the start of yes.'],
    es: ['sonido y', 'Desliza rápido, como al empezar la palabra ya.'],
    de: ['j-Laut', 'Gleite schnell, wie am Anfang von „ja“.'],
    fr: ['son y', 'Glisse vite, comme au début de « yeux ».'],
  },
  w: {
    en: ['w sound', 'Round your lips and glide quickly.'],
    es: [
      'sonido u corto',
      'Redondea los labios y desliza rápido, como en la u de huevo.',
    ],
    de: ['w-Laut (englisch)', 'Runde die Lippen und gleite schnell weiter.'],
    fr: ['son w', 'Arrondis les lèvres et glisse vite, comme dans « oui ».'],
  },
  m: {
    en: ['m', 'Close your lips and hum.'],
    es: ['m', 'Cierra los labios y zumba.'],
    de: ['m', 'Schließe die Lippen und summe.'],
    fr: ['m', 'Ferme les lèvres et fais vibrer ta voix.'],
  },
  n: {
    en: ['n', 'Touch behind your top teeth and hum.'],
    es: ['n', 'Toca detrás de los dientes de arriba y zumba.'],
    de: ['n', 'Berühre die Stelle hinter den oberen Zähnen und summe.'],
    fr: ['n', 'Touche derrière les dents du haut et fais vibrer ta voix.'],
  },
  ɲ: {
    en: ['ñ', 'Press the middle of your tongue up, like n and y together.'],
    es: [
      'ñ',
      'Presiona el centro de la lengua hacia arriba, como una n y una y juntas.',
    ],
    de: ['ñ', 'Drücke die Zungenmitte nach oben, wie n und j zusammen.'],
    fr: [
      'ñ',
      'Appuie le milieu de la langue vers le haut, comme n et y ensemble.',
    ],
  },
  ŋ: {
    en: ['ng sound', 'Lift the back of your tongue and hum through your nose.'],
    es: [
      'sonido ng',
      'Levanta la parte de atrás de la lengua y zumba por la nariz.',
    ],
    de: [
      'ng-Laut',
      'Hebe den hinteren Teil der Zunge und summe durch die Nase.',
    ],
    fr: [
      'son ng',
      "Lève l'arrière de la langue et fais vibrer ta voix par le nez.",
    ],
  },
};

const LANGUAGE_SOUNDS: Readonly<
  Record<SpeakLanguage, Readonly<Record<string, LocalizedSound>>>
> = {
  es: {
    p: {
      en: ['p', 'Close your lips and open them with no puff of air.'],
      es: ['p', 'Cierra los labios y ábrelos sin soplo de aire.'],
      de: ['p', 'Schließe die Lippen und öffne sie ohne Lufthauch.'],
      fr: ['p', "Ferme les lèvres et ouvre-les sans souffle d'air."],
    },
    t: {
      en: ['t', 'Touch the back of your top teeth, with no puff of air.'],
      es: ['t', 'Toca detrás de los dientes de arriba, sin soplo de aire.'],
      de: ['t', 'Berühre die Rückseite der oberen Zähne, ohne Lufthauch.'],
      fr: ['t', "Touche l'arrière des dents du haut, sans souffle d'air."],
    },
    k: {
      en: [
        'k',
        'Lift the back of your tongue and let go, with no puff of air.',
      ],
      es: [
        'k',
        'Levanta la parte de atrás de la lengua y suéltala, sin soplo de aire.',
      ],
      de: [
        'k',
        'Hebe den hinteren Teil der Zunge und lass los, ohne Lufthauch.',
      ],
      fr: ['k', "Lève l'arrière de la langue et relâche, sans souffle d'air."],
    },
    d: {
      en: [
        'd',
        'Press your tongue against the back of your top teeth and use your voice.',
      ],
      es: [
        'd',
        'Presiona la lengua contra la parte de atrás de los dientes de arriba y usa la voz.',
      ],
      de: [
        'd',
        'Drücke die Zunge gegen die Rückseite der oberen Zähne und nutze deine Stimme.',
      ],
      fr: [
        'd',
        "Appuie la langue contre l'arrière des dents du haut et fais vibrer ta voix.",
      ],
    },
    ð: {
      en: [
        'Soft d',
        'Touch your top teeth lightly with your tongue, like a soft th.',
      ],
      es: [
        'd suave',
        'Toca ligeramente los dientes de arriba con la lengua, como una d muy suave.',
      ],
      de: [
        'Weiches d',
        'Berühre die oberen Zähne leicht mit der Zunge, wie bei einem weichen th.',
      ],
      fr: [
        'd doux',
        'Touche légèrement les dents du haut avec la langue, comme un th doux.',
      ],
    },
    x: {
      en: [
        'j sound (jota)',
        'Raise the back of your tongue and push air through.',
      ],
      es: [
        'sonido de la j (jota)',
        'Levanta la parte de atrás de la lengua y deja pasar el aire.',
      ],
      de: [
        'j-Laut (jota)',
        'Hebe den hinteren Teil der Zunge und presse Luft hindurch.',
      ],
      fr: ['son j (jota)', "Lève l'arrière de la langue et fais passer l'air."],
    },
    θ: {
      en: ['Spanish z (Spain)', 'Put your tongue between your teeth and blow.'],
      es: ['z española (España)', 'Pon la lengua entre los dientes y sopla.'],
      de: [
        'Spanisches z (Spanien)',
        'Lege die Zunge zwischen die Zähne und blase.',
      ],
      fr: [
        'z espagnol (Espagne)',
        'Place la langue entre les dents et souffle.',
      ],
    },
    w: {
      en: ['u glide', 'Slide quickly from u into the next vowel.'],
      es: ['deslizamiento de u', 'Desliza rápido de u a la vocal siguiente.'],
      de: ['u-Gleitlaut', 'Gleite schnell von u in den nächsten Vokal.'],
      fr: ['u glissé', 'Glisse vite de u vers la voyelle suivante.'],
    },
    j: {
      en: ['i glide', 'Slide quickly from i into the next vowel.'],
      es: ['deslizamiento de i', 'Desliza rápido de i a la vocal siguiente.'],
      de: ['i-Gleitlaut', 'Gleite schnell von i in den nächsten Vokal.'],
      fr: ['i glissé', 'Glisse vite de i vers la voyelle suivante.'],
    },
    ə: {
      en: ['Weak uh', 'Spanish vowels stay full. Say each one clearly.'],
      es: [
        'vocal débil',
        'Las vocales del español se dicen completas. Di cada una con claridad.',
      ],
      de: [
        'Schwaches e',
        'Spanische Vokale bleiben voll. Sprich jeden deutlich.',
      ],
      fr: [
        'e neutre',
        'Les voyelles espagnoles restent pleines. Dis chacune clairement.',
      ],
    },
    oʊ: {
      en: ['o with a glide', 'Spanish o stays pure. Keep your lips still.'],
      es: [
        'o con deslizamiento',
        'La o del español es pura. Mantén los labios quietos.',
      ],
      de: [
        'o mit Gleitlaut',
        'Das spanische o bleibt rein. Halte die Lippen ruhig.',
      ],
      fr: ['o glissé', 'Le o espagnol reste pur. Garde les lèvres immobiles.'],
    },
    eɪ: {
      en: ['ei sound', 'Start at e and slide to i.'],
      es: ['sonido ei', 'Empieza en e y desliza hacia i.'],
      de: ['ei-Laut', 'Beginne bei e und gleite zu i.'],
      fr: ['son ei', 'Commence par e et glisse vers i.'],
    },
    ɛ: {
      en: ['Open e', 'Open your mouth a little more than for e.'],
      es: ['e abierta', 'Abre la boca un poco más que para la e.'],
      de: ['Offenes e', 'Öffne den Mund etwas mehr als bei e.'],
      fr: ['e ouvert', 'Ouvre un peu plus la bouche que pour e.'],
    },
  },
  de: {
    v: {
      en: [
        'German w',
        'Rest your top teeth on your bottom lip and use your voice.',
      ],
      es: [
        'w alemana',
        'Apoya los dientes de arriba en el labio de abajo y usa la voz.',
      ],
      de: [
        'Deutsches w',
        'Lege die oberen Zähne auf die Unterlippe und nutze deine Stimme.',
      ],
      fr: [
        'w allemand',
        'Pose les dents du haut sur la lèvre du bas et fais vibrer ta voix.',
      ],
    },
    z: {
      en: ['German s before a vowel', 'Hiss like s and use your voice.'],
      es: ['s alemana antes de vocal', 'Haz una s y usa la voz.'],
      de: ['Deutsches s vor Vokal', 'Zische wie bei s und nutze deine Stimme.'],
      fr: [
        's allemand devant voyelle',
        'Siffle comme un s et fais vibrer ta voix.',
      ],
    },
    ts: {
      en: ['German z', 'Say t and s together, quickly.'],
      es: ['z alemana', 'Di t y s juntas, rápido.'],
      de: ['Deutsches z', 'Sag t und s schnell zusammen.'],
      fr: ['z allemand', 'Dis t et s ensemble, vite.'],
    },
    tsh: {
      en: ['German z', 'Say t and s together, quickly.'],
      es: ['z alemana', 'Di t y s juntas, rápido.'],
      de: ['Deutsches z', 'Sag t und s schnell zusammen.'],
      fr: ['z allemand', 'Dis t et s ensemble, vite.'],
    },
    j: {
      en: ['German j', 'Glide quickly, like the start of yes.'],
      es: ['j alemana', 'Desliza rápido, como al empezar la palabra ya.'],
      de: ['Deutsches j', 'Gleite schnell, wie am Anfang von „ja“.'],
      fr: ['j allemand', 'Glisse vite, comme au début de « yeux ».'],
    },
    ja: {
      en: ['ja sound', 'Slide quickly from ee into a.'],
      es: ['sonido ja', 'Desliza rápido de i a a.'],
      de: ['ja-Laut', 'Gleite schnell von j zu a.'],
      fr: ['son ja', 'Glisse vite de i vers a.'],
    },
    r: {
      en: ['German r', 'Make a soft gargle at the back of your throat.'],
      es: ['r alemana', 'Haz un gargarismo suave al fondo de la garganta.'],
      de: ['Deutsches r', 'Mache ein sanftes Gurgeln hinten im Hals.'],
      fr: ['r allemand', 'Fais un petit gargouillis au fond de la gorge.'],
    },
    ɾ: {
      en: ['German r', 'Make a soft gargle at the back of your throat.'],
      es: ['r alemana', 'Haz un gargarismo suave al fondo de la garganta.'],
      de: ['Deutsches r', 'Mache ein sanftes Gurgeln hinten im Hals.'],
      fr: ['r allemand', 'Fais un petit gargouillis au fond de la gorge.'],
    },
    aɪ: {
      en: ['ei sound', 'Start at ah and slide to ee.'],
      es: ['sonido ei', 'Empieza en a y desliza hacia i.'],
      de: ['ei-Laut', 'Beginne bei a und gleite zu i.'],
      fr: ['son ei', 'Commence par a et glisse vers i.'],
    },
    aʊ: {
      en: ['au sound', 'Start at ah and slide to oo.'],
      es: ['sonido au', 'Empieza en a y desliza hacia u.'],
      de: ['au-Laut', 'Beginne bei a und gleite zu u.'],
      fr: ['son au', 'Commence par a et glisse vers ou.'],
    },
    ʃ: {
      en: ['sch sound', 'Round your lips and push air over your tongue.'],
      es: [
        'sonido sch',
        'Redondea los labios y empuja el aire sobre la lengua.',
      ],
      de: ['sch-Laut', 'Runde die Lippen und presse Luft über die Zunge.'],
      fr: ['son sch', "Arrondis les lèvres et pousse l'air sur la langue."],
    },
    tʃ: {
      en: ['tsch sound', 'Start with t and let it go into sch.'],
      es: ['sonido tsch', 'Empieza con t y deja que pase a sch.'],
      de: ['tsch-Laut', 'Beginne mit t und lass es in sch übergehen.'],
      fr: ['son tsch', 'Commence par t et enchaîne avec sch.'],
    },
    ɐ: {
      en: ['Soft -er ending', 'Relax your mouth and say a soft uh, with no r.'],
      es: ['final -er suave', 'Relaja la boca y di una vocal suave, sin r.'],
      de: [
        'Weiche -er-Endung',
        'Entspanne den Mund und sag ein weiches e, ohne r.',
      ],
      fr: [
        'finale -er douce',
        'Détends la bouche et dis un « euh » doux, sans r.',
      ],
    },
    əl: {
      en: [
        '-el ending',
        'Say a soft uh, then touch your tongue behind your teeth.',
      ],
      es: [
        'final -el',
        'Di una vocal suave y toca con la lengua detrás de los dientes.',
      ],
      de: [
        '-el-Endung',
        'Sag ein weiches e und lege dann die Zunge hinter die Zähne.',
      ],
      fr: [
        'finale -el',
        'Dis un « euh » doux, puis pose la langue derrière les dents.',
      ],
    },
    ə: {
      en: ['Weak e', 'Say a short, relaxed uh.'],
      es: ['e débil', 'Di una e corta y relajada.'],
      de: ['Schwaches e', 'Sag ein kurzes, entspanntes e.'],
      fr: ['e faible', 'Dis un « euh » court et détendu.'],
    },
  },
  en: {
    ɾ: {
      en: ['Quick t or d', 'Tap your tongue once, quickly, like a soft d.'],
      es: [
        't o d rápida',
        'Toca una sola vez, rápido, con la lengua, como una d suave.',
      ],
      de: [
        'Schnelles t oder d',
        'Schlage mit der Zunge einmal schnell an, wie bei einem weichen d.',
      ],
      fr: [
        't ou d rapide',
        'Touche une seule fois, vite, avec la langue, comme un d doux.',
      ],
    },
    i: {
      en: ['ee at the end', 'Smile and keep the sound short.'],
      es: ['i final', 'Sonríe y que el sonido sea breve.'],
      de: ['i am Wortende', 'Lächle und sprich den Laut kurz.'],
      fr: ['i final', 'Souris et garde le son court.'],
    },
    r: {
      en: ['Rolled r', 'Let the tip of your tongue flutter.'],
      es: ['r vibrante', 'Deja que la punta de la lengua vibre.'],
      de: ['Gerolltes r', 'Lass die Zungenspitze flattern.'],
      fr: ['r roulé', 'Laisse le bout de la langue vibrer.'],
    },
    x: {
      en: [
        'ch as in Bach',
        'Raise the back of your tongue and push air through.',
      ],
      es: [
        'ch como en Bach',
        'Levanta la parte de atrás de la lengua y deja pasar el aire.',
      ],
      de: [
        'ch wie in Bach',
        'Hebe den hinteren Teil der Zunge und presse Luft hindurch.',
      ],
      fr: ['ch de Bach', "Lève l'arrière de la langue et fais passer l'air."],
    },
  },
};

/** An example word per sound in the language being learned; the keys are every sound its references use. */
export const SPEAK_SOUND_EXAMPLES: Readonly<
  Record<SpeakLanguage, Readonly<Record<string, string>>>
> = {
  es: {
    a: 'casa',
    e: 'mesa',
    i: 'sí',
    o: 'ojo',
    u: 'tú',
    s: 'sol',
    n: 'no',
    t: 'taza',
    k: 'queso',
    l: 'luna',
    m: 'mamá',
    p: 'papá',
    ð: 'nada',
    j: 'tiene',
    θ: 'hacer',
    d: 'dónde',
    β: 'lobo',
    b: 'barco',
    r: 'perro',
    f: 'foto',
    x: 'jota',
    ɛ: 'cuenta',
    ɣ: 'lago',
    w: 'cuando',
    ja: 'hacia',
    ɡ: 'gato',
    ʎ: 'llave',
    ʝ: 'yo',
    tʃ: 'mucho',
    ɲ: 'año',
    ŋ: 'tengo',
    aʊ: 'causa',
    aɪ: 'hay',
    pː: 'septiembre',
    eɪ: 'rey',
    eʊ: 'Europa',
    oɪ: 'hoy',
    ee: 'lee',
    ʃ: 'show',
    ts: 'pizza',
    oe: 'héroe',
    ie: 'ríe',
    ai: 'estáis',
    uo: 'dúo',
    ju: 'ciudad',
    au: 'cláusula',
    əl: 'Google',
    h: 'hardware',
    ɾ: 'pero',
    ui: 'arruinar',
  },
  de: {
    n: 'nein',
    ə: 'bitte',
    t: 'Tag',
    l: 'Lampe',
    ɾ: 'war',
    ɛ: 'Bett',
    a: 'Mann',
    ɪ: 'Kind',
    k: 'kalt',
    f: 'Fisch',
    s: 'das',
    ɡ: 'gut',
    m: 'Meer',
    b: 'Ball',
    iː: 'Liebe',
    r: 'rot',
    d: 'du',
    ʃ: 'Schule',
    eː: 'Tee',
    oː: 'Boot',
    ɑː: 'Vater',
    ɜ: 'aber',
    aɪ: 'mein',
    v: 'wie',
    ʊ: 'Hund',
    p: 'Papa',
    ts: 'Zeit',
    z: 'Hase',
    ç: 'ich',
    ɔ: 'Sonne',
    ŋ: 'lang',
    h: 'Hand',
    uː: 'Schuh',
    aʊ: 'Haus',
    j: 'ja',
    y: 'müssen',
    yː: 'über',
    x: 'Bach',
    ɑ: 'damals',
    əl: 'Titel',
    ɛː: 'später',
    ɔø: 'heute',
    øː: 'schön',
    œ: 'können',
    tʃ: 'Deutsch',
    pf: 'Kopf',
    th: 'enthalten',
    aɪə: 'Reihe',
    ərɜ: 'anderer',
    ɛɪ: 'okay',
    ph: 'abholen',
    dʒ: 'Job',
    ja: 'Japan',
    ʒ: 'Massage',
    kh: 'Krankheit',
    ɑ̃: 'Chance',
    w: 'Web',
    i: 'Region',
    tsh: 'Gerichtshof',
    ɔ̃: 'Saison',
    aː: 'Staat',
    ʁ: 'Rad',
    ɐ: 'Lehrer',
  },
  en: {
    n: 'no',
    ɪ: 'sit',
    s: 'sun',
    t: 'top',
    k: 'kite',
    ɹ: 'red',
    d: 'dog',
    l: 'like',
    ə: 'support',
    m: 'man',
    ɛ: 'bed',
    p: 'pen',
    z: 'zoo',
    æ: 'cat',
    ɚ: 'other',
    eɪ: 'day',
    b: 'big',
    ᵻ: 'before',
    f: 'fish',
    ŋ: 'sing',
    i: 'happy',
    iː: 'see',
    ɑː: 'father',
    v: 'very',
    ʃ: 'ship',
    aɪ: 'my',
    oʊ: 'go',
    əl: 'people',
    ʌ: 'but',
    ɾ: 'better',
    uː: 'food',
    ɡ: 'get',
    dʒ: 'jump',
    w: 'we',
    h: 'hat',
    ɐ: 'about',
    j: 'yes',
    ɜː: 'her',
    tʃ: 'chair',
    ts: 'its',
    ɑːɹ: 'car',
    ɛɹ: 'there',
    aʊ: 'now',
    θ: 'think',
    ɔːɹ: 'for',
    oːɹ: 'more',
    ɔː: 'law',
    iə: 'idea',
    ʊ: 'book',
    ɪɹ: 'here',
    ɔ: 'on',
    ɔɪ: 'boy',
    ʊɹ: 'sure',
    ʒ: 'vision',
    ð: 'this',
    aɪə: 'science',
    aɪɚ: 'fire',
    ʔ: 'kitten',
    n̩: 'button',
    th: 'lighthouse',
    x: 'Bach',
    kh: 'Stockholm',
    pf: 'helpful',
    ph: 'uphold',
  },
};

/** Sounds a student may say in place of the right one (group pairs); named but with no example word. */
export const SPEAK_HEARD_ONLY_SOUNDS: Readonly<
  Record<SpeakLanguage, readonly string[]>
> = {
  es: ['ə', 'ɹ', 'kʰ', 'pʰ', 'tʰ', 'oʊ'],
  de: ['o', 'ɜː', 'u', 'e', 'ø', 'ɹ', 'ɚ'],
  en: ['r', 'ʁ', 'pʰ', 'tʰ', 'kʰ'],
};

const FALLBACK: LocalizedSound = {
  en: ['This sound', ''],
  es: ['Este sonido', ''],
  de: ['Dieser Laut', ''],
  fr: ['Ce son', ''],
};

export interface SpeakSoundName {
  name: string;
  hint: string;
  example: string | null;
  known: boolean;
}

/** UI locale from an i18n language tag such as `es-MX`; anything unsupported reads English. */
export function soundNameLocale(
  uiLanguage: string | null | undefined
): SoundNameLocale {
  const primary = (uiLanguage ?? '').trim().split(/[-_]/)[0].toLowerCase();
  return SOUND_NAME_LOCALES.find((locale) => locale === primary) ?? 'en';
}

export function isKnownSpeakSound(
  language: SpeakLanguage,
  token: string
): boolean {
  return (
    Object.hasOwn(SPEAK_SOUND_EXAMPLES[language], token) ||
    SPEAK_HEARD_ONLY_SOUNDS[language].includes(token)
  );
}

/** An unlisted token reads "This sound" with no hint (`known: false`), so a mark never shows a symbol. */
export function speakSoundName(
  language: SpeakLanguage,
  token: string,
  uiLanguage: string | null | undefined
): SpeakSoundName {
  const locale = soundNameLocale(uiLanguage);
  const known = isKnownSpeakSound(language, token);
  const own = <T>(table: Readonly<Record<string, T>>): T | undefined =>
    Object.hasOwn(table, token) ? table[token] : undefined;
  const entry = known
    ? (own(LANGUAGE_SOUNDS[language]) ?? own(BASE_SOUNDS) ?? FALLBACK)
    : FALLBACK;
  const [name, hint] = entry[locale];
  return {
    name,
    hint,
    example: own(SPEAK_SOUND_EXAMPLES[language]) ?? null,
    known: known && entry !== FALLBACK,
  };
}
