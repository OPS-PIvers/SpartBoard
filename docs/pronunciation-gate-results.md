# Speak corpus gate results

Run 2026-10-20 on 488 clips and 20 controls, model `wav2vec2-xlsr-53-espeak-cv-ft-q4`, unclear cut-off 0.4, 563 s.

| Check                                  | Result | Pass mark |          |
| -------------------------------------- | ------ | --------- | -------- |
| de: natives pass Beginner              | 35.4%  | ≥ 95.0%   | **fail** |
| de: natives pass Advanced              | 29.1%  | ≥ 85.0%   | **fail** |
| de: natives unclear                    | 1.1%   | ≤ 2.0%    | pass     |
| de: high-load mutations caught         | 100.0% | ≥ 80.0%   | pass     |
| de: group pairs caught under require   | 100.0% | ≥ 80.0%   | pass     |
| de: group pairs Accepted under forgive | 100.0% | ≥ 90.0%   | pass     |
| en: natives pass Beginner              | 51.2%  | ≥ 95.0%   | **fail** |
| en: natives pass Advanced              | 45.8%  | ≥ 85.0%   | **fail** |
| en: natives unclear                    | 1.8%   | ≤ 2.0%    | pass     |
| en: high-load mutations caught         | 100.0% | ≥ 80.0%   | pass     |
| en: group pairs caught under require   | 100.0% | ≥ 80.0%   | pass     |
| en: group pairs Accepted under forgive | 100.0% | ≥ 90.0%   | pass     |
| es: natives pass Beginner              | 51.0%  | ≥ 95.0%   | **fail** |
| es: natives pass Advanced              | 43.4%  | ≥ 85.0%   | **fail** |
| es: natives unclear                    | 0.0%   | ≤ 2.0%    | pass     |
| es: high-load mutations caught         | 100.0% | ≥ 80.0%   | pass     |
| es: group pairs caught under require   | 100.0% | ≥ 80.0%   | pass     |
| es: group pairs Accepted under forgive | 100.0% | ≥ 90.0%   | pass     |
| controls: judged unclear               | 100.0% | 100%      | pass     |

| Language | Clips | Mutations (high-load / group) |
| -------- | ----- | ----------------------------- |
| de       | 175   | 131 / 92                      |
| en       | 168   | 120 / 118                     |
| es       | 145   | 231 / 23                      |

Browser and Node decode agreement (§8) is checked by hand on `/pronunciation-dev`, not here.

## Native substitutions under Advanced

Pairs natives produce in at least 10% of clips are tolerance candidates for S11 (§4.2), each with Paul's yes.

| Pair     | Clips |
| -------- | ----- |
| es ɾ→r   | 24    |
| de ɾ→r   | 9     |
| de ə→e   | 8     |
| de ɑː→a  | 8     |
| en æ→ɛ   | 8     |
| de ɜ→a   | 7     |
| de ʊ→u   | 7     |
| de yː→y  | 6     |
| de t→d   | 6     |
| en æ→a   | 6     |
| en ɚ→ə   | 6     |
| es a→ɐ   | 6     |
| es β→b   | 6     |
| es β→v   | 6     |
| de ɑː→aː | 5     |
| en ɪ→ɛ   | 5     |
| en iː→i  | 5     |
| es e→eː  | 5     |
| es ð→d   | 5     |
| es ʝ→j   | 5     |
| de iː→i  | 4     |
| de əl→ə  | 4     |
| de ɪ→i   | 4     |
| de ʊ→o   | 4     |
| en t→tʃ  | 4     |
| es ɾ→d   | 4     |
| de aʊ→ɑː | 3     |
| de ɾ→a   | 3     |
| de ɾ→i   | 3     |
| de eː→iː | 3     |
| de ɔø→j  | 3     |
| de yː→uː | 3     |
| de eː→i  | 3     |
| de oː→o  | 3     |
| de z→s   | 3     |
| de ç→k   | 3     |
| de ɔ→o   | 3     |
| de v→f   | 3     |
| en ɪ→ə   | 3     |
| en ɜː→ɚ  | 3     |

## Controls

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
