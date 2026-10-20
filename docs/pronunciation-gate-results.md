# Speak corpus gate results

Run 2026-10-20 on 488 main and 355 heldout clips and 20 controls, model `wav2vec2-xlsr-53-espeak-cv-ft-q4`, likelihood scorer (swap 3.5, required group 1, forgiven group -1, window 5), 30 es / 70 de / 82 en native variants, unclear cut-off 0.4, 360 s.

References: espeak-ng plus 8 es / 8 de / 8 en Cloud TTS voices per word (`tests/fixtures/pronunciation-corpus/voice-refs.json`).

**Not measured:** the another-word check has no pass mark (wrongWordAcceptedMax).

Gate not enforced: 15 checks below their pass mark.

## Tuning set

The words the scorer cut-offs were picked on (`words.json`).

| Check                                  | Result | Pass mark |          |
| -------------------------------------- | ------ | --------- | -------- |
| de: natives pass Beginner              | 93.1%  | ≥ 95.0%   | **fail** |
| de: natives pass Advanced              | 84.0%  | ≥ 85.0%   | **fail** |
| de: natives unclear                    | 1.1%   | ≤ 2.0%    | pass     |
| de: high-load mutations caught         | 92.3%  | ≥ 80.0%   | pass     |
| de: group pairs caught under require   | 88.9%  | ≥ 80.0%   | pass     |
| de: group pairs Accepted under forgive | 89.8%  | ≥ 90.0%   | **fail** |
| de: another word accepted (Beginner)   | 1.4%   | none set  | n/a      |
| en: natives pass Beginner              | 96.4%  | ≥ 95.0%   | pass     |
| en: natives pass Advanced              | 89.9%  | ≥ 85.0%   | pass     |
| en: natives unclear                    | 1.8%   | ≤ 2.0%    | pass     |
| en: high-load mutations caught         | 91.7%  | ≥ 80.0%   | pass     |
| en: group pairs caught under require   | 93.2%  | ≥ 80.0%   | pass     |
| en: group pairs Accepted under forgive | 95.5%  | ≥ 90.0%   | pass     |
| en: another word accepted (Beginner)   | 2.0%   | none set  | n/a      |
| es: natives pass Beginner              | 90.3%  | ≥ 95.0%   | **fail** |
| es: natives pass Advanced              | 84.8%  | ≥ 85.0%   | **fail** |
| es: natives unclear                    | 0.0%   | ≤ 2.0%    | pass     |
| es: high-load mutations caught         | 90.5%  | ≥ 80.0%   | pass     |
| es: group pairs caught under require   | 45.6%  | ≥ 80.0%   | **fail** |
| es: group pairs Accepted under forgive | 61.4%  | ≥ 90.0%   | **fail** |
| es: another word accepted (Beginner)   | 1.9%   | none set  | n/a      |

| Language | Clips | Mutations (high-load / group) | Other-word judgements |
| -------- | ----- | ----------------------------- | --------------------- |
| de       | 175   | 297 / 235                     | 1383                  |
| en       | 168   | 253 / 220                     | 1316                  |
| es       | 145   | 422 / 57                      | 1159                  |

## Held-out set

New words and speakers (`words.heldout.json`) that no cut-off was tuned on; they confirm the tuning set generalises.

| Check                                  | Result | Pass mark |          |
| -------------------------------------- | ------ | --------- | -------- |
| de: natives pass Beginner              | 94.2%  | ≥ 95.0%   | **fail** |
| de: natives pass Advanced              | 92.5%  | ≥ 85.0%   | pass     |
| de: natives unclear                    | 3.3%   | ≤ 2.0%    | **fail** |
| de: high-load mutations caught         | 93.6%  | ≥ 80.0%   | pass     |
| de: group pairs caught under require   | 88.3%  | ≥ 80.0%   | pass     |
| de: group pairs Accepted under forgive | 91.1%  | ≥ 90.0%   | pass     |
| de: another word accepted (Beginner)   | 2.2%   | none set  | n/a      |
| en: natives pass Beginner              | 91.7%  | ≥ 95.0%   | **fail** |
| en: natives pass Advanced              | 89.2%  | ≥ 85.0%   | pass     |
| en: natives unclear                    | 4.2%   | ≤ 2.0%    | **fail** |
| en: high-load mutations caught         | 96.0%  | ≥ 80.0%   | pass     |
| en: group pairs caught under require   | 96.7%  | ≥ 80.0%   | pass     |
| en: group pairs Accepted under forgive | 98.7%  | ≥ 90.0%   | pass     |
| en: another word accepted (Beginner)   | 1.3%   | none set  | n/a      |
| es: natives pass Beginner              | 89.6%  | ≥ 95.0%   | **fail** |
| es: natives pass Advanced              | 83.5%  | ≥ 85.0%   | **fail** |
| es: natives unclear                    | 0.0%   | ≤ 2.0%    | pass     |
| es: high-load mutations caught         | 89.4%  | ≥ 80.0%   | pass     |
| es: group pairs caught under require   | 76.3%  | ≥ 80.0%   | **fail** |
| es: group pairs Accepted under forgive | 80.3%  | ≥ 90.0%   | **fail** |
| es: another word accepted (Beginner)   | 0.2%   | none set  | n/a      |

| Language | Clips | Mutations (high-load / group) | Other-word judgements |
| -------- | ----- | ----------------------------- | --------------------- |
| de       | 120   | 297 / 180                     | 928                   |
| en       | 120   | 225 / 152                     | 920                   |
| es       | 115   | 407 / 76                      | 920                   |

## Controls

| Check                    | Result | Pass mark |      |
| ------------------------ | ------ | --------- | ---- |
| controls: judged unclear | 100.0% | 100%      | pass |

| Control           | Heard     | Confidence | Voiced ms | Verdict |
| ----------------- | --------- | ---------- | --------- | ------- |
| silence-digital   | (nothing) | 0.00       | 0         | unclear |
| silence-dither    | (nothing) | 0.00       | 0         | unclear |
| silence-mic-floor | (nothing) | 0.00       | 0         | unclear |
| silence-dc-offset | (nothing) | 0.00       | 0         | unclear |
| room-quiet        | (nothing) | 0.00       | 140       | unclear |
| room-hvac         | (nothing) | 0.00       | 80        | unclear |
| room-hiss         | (nothing) | 0.00       | 0         | unclear |
| room-hum-60hz     | (nothing) | 0.00       | 0         | unclear |
| room-hum-50hz     | (nothing) | 0.00       | 0         | unclear |
| room-loud-hiss    | (nothing) | 0.00       | 0         | unclear |
| cough-single      | (nothing) | 0.00       | 260       | unclear |
| cough-double      | (nothing) | 0.00       | 540       | unclear |
| cough-soft        | (nothing) | 0.00       | 260       | unclear |
| cough-triple      | t         | 0.22       | 800       | unclear |
| cough-late        | (nothing) | 0.00       | 260       | unclear |
| clipped-noise     | (nothing) | 0.00       | 0         | unclear |
| clipped-low-tone  | (nothing) | 0.00       | 0         | unclear |
| clipped-high-tone | (nothing) | 0.00       | 0         | unclear |
| clipped-hum-burst | (nothing) | 0.00       | 0         | unclear |
| tone-beep         | (nothing) | 0.00       | 300       | unclear |

Browser and Node decode agreement (§8) is checked by hand on `/pronunciation-dev`, not here.

## Native errors under Advanced (tuning set)

Substitutions the scorer still counts against natives; candidates for the variant table or a tolerance pair, each with Paul's yes.

| Pair    | Clips |
| ------- | ----- |
| de ç→k  | 3     |
| es o→ə  | 3     |
| en d→t  | 2     |
| es x→s  | 2     |
| de k→ɡ  | 1     |
| de ɜ→ɚ  | 1     |
| de ɡ→t  | 1     |
| de ɜ→ɛ  | 1     |
| de v→f  | 1     |
| de ts→t | 1     |
| en ɹ→w  | 1     |
| en ɪ→iː | 1     |
| en ɚ→a  | 1     |
| en θ→f  | 1     |
| en ɾ→tʃ | 1     |
| es k→j  | 1     |
| es r→t  | 1     |
| es ʎ→ʃ  | 1     |
| es dʒ→ʃ | 1     |
| es ŋ→k  | 1     |
| es x→k  | 1     |
| es x→h  | 1     |
| es ð→d  | 1     |
| es ɾ→n  | 1     |
| es o→e  | 1     |
| es t→ɡ  | 1     |
| es ð→l  | 1     |
