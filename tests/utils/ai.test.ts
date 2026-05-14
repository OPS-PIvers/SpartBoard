/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import {
  extractTextWithGemini,
  generateDashboardLayout,
  generateMiniAppCode,
  generatePoll,
  generateQuiz,
  generateVideoActivity,
  transcribeVideoWithGemini,
  generateGuidedLearning,
  recommendVideoForActivity,
} from '@/utils/ai';

// Mock Firebase Functions
vi.mock('firebase/functions', () => {
  return {
    getFunctions: vi.fn(),
    httpsCallable: vi.fn().mockImplementation((_functions, name, _options) => {
      return async (data: any) => {
        if (name === 'generateGuidedLearning') {
          if (data.prompt && data.prompt.includes('invalid-response')) {
            return { data: {} };
          }
          if (data.prompt && data.prompt.includes('FAIL')) {
            throw new Error('Simulated API Failure');
          }
          if (data.prompt && data.prompt.includes('no-steps')) {
            return { data: { suggestedTitle: 'Title', steps: [] } };
          }
          if (data.prompt && data.prompt.includes('invalid-steps')) {
            return {
              data: {
                suggestedTitle: 'Title',
                steps: [{ invalidKey: 'invalidValue' }],
              },
            };
          }
          if (data.prompt && data.prompt.includes('clamp-imageindex')) {
            return {
              data: {
                suggestedTitle: 'Learning Module',
                suggestedMode: 'guided',
                steps: [
                  {
                    id: 'step-1',
                    xPct: 50,
                    yPct: 50,
                    interactionType: 'tooltip',
                    imageIndex: 5,
                    text: 'Step 1',
                  },
                ],
              },
            };
          }
          return {
            data: {
              suggestedTitle: 'Learning Module',
              suggestedMode: 'guided',
              steps: [
                {
                  id: 'step-1',
                  xPct: 50,
                  yPct: 50,
                  interactionType: 'tooltip',
                  text: 'Step 1',
                },
              ],
            },
          };
        }
        if (
          name === 'generateVideoActivity' ||
          name === 'transcribeVideoWithGemini'
        ) {
          if (data.url.includes('timeout')) {
            throw Object.assign(new Error('deadline exceeded'), {
              code: 'deadline-exceeded',
            });
          }

          if (data.url.includes('invalid-response')) {
            return { data: {} };
          }

          return {
            data: {
              title: 'Video Activity',
              questions: [
                {
                  text: 'Question 1',
                  timestamp: 12,
                },
              ],
            },
          };
        }
        if (
          (data.prompt && data.prompt.includes('FAIL')) ||
          (data.image && data.image.includes('FAIL'))
        ) {
          throw new Error('Simulated API Failure');
        }

        if (data.type === 'poll') {
          if (data.prompt.includes('invalid-response')) {
            return { data: {} };
          }
          return {
            data: {
              question: 'Mock Poll Question?',
              options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
            },
          };
        }

        if (data.type === 'dashboard-layout') {
          if (data.prompt.includes('invalid-response')) {
            return { data: {} };
          }
          if (data.prompt.includes('invalid-types')) {
            return {
              data: {
                widgets: [{ type: 'invalid-type', config: {} }],
              },
            };
          }
          if (data.prompt.includes('no-widgets')) {
            return {
              data: {
                widgets: [],
              },
            };
          }
          return {
            data: {
              widgets: [
                { type: 'clock', config: { format: '12h' } },
                { type: 'poll', config: { question: 'Test?' } },
              ],
            },
          };
        }

        if (data.type === 'quiz') {
          if (data.prompt.includes('invalid-response')) {
            return { data: {} };
          }
          return {
            data: {
              title: 'Mock Quiz',
              questions: [
                {
                  text: 'Question 1',
                  type: 'multiple-choice',
                  correctAnswer: 'A',
                  incorrectAnswers: ['B', 'C'],
                },
              ],
            },
          };
        }

        if (data.type === 'video-activity-recommend') {
          if (data.prompt.includes('refuse')) {
            // Gemini refuses with empty videoId
            return {
              data: { videoId: '', title: '', rationale: 'Topic too vague.' },
            };
          }
          if (data.prompt.includes('hallucinate')) {
            // Bad videoId shape (only 5 chars) — wrapper rejects
            return {
              data: { videoId: 'short', title: 'Bad', rationale: 'x' },
            };
          }
          if (data.prompt.includes('garbage')) {
            // Missing fields entirely
            return { data: {} };
          }
          return {
            data: {
              videoId: 'abcDEF12345',
              title: 'Photosynthesis Crash Course',
              rationale: 'Aligned with 6th-grade life science standards.',
            },
          };
        }

        if (data.type === 'ocr') {
          if (data.image && data.image.includes('invalid-response')) {
            return { data: {} };
          }
          return {
            data: {
              text: 'Extracted Text',
            },
          };
        }

        if (data.prompt && data.prompt.includes('invalid-response')) {
          return { data: {} };
        }

        return {
          data: {
            title: 'Mock App',
            html: '<div>Mock App HTML</div>',
          },
        };
      };
    }),
  };
});

// Mock the firebase config
vi.mock('@/config/firebase', () => ({
  functions: {},
}));

// Mock the tools config
vi.mock('@/config/tools', () => ({
  TOOLS: [
    { type: 'clock', icon: 'mock', label: 'Clock', color: 'bg-blue-500' },
    { type: 'poll', icon: 'mock', label: 'Poll', color: 'bg-orange-500' },
  ],
}));

describe('generateMiniAppCode', () => {
  it('generates app code successfully', async () => {
    const result = await generateMiniAppCode('Make a calculator');
    expect(result).toEqual({
      title: 'Mock App',
      html: '<div>Mock App HTML</div>',
    });
  });

  it('throws formatted error on failure', async () => {
    await expect(generateMiniAppCode('FAIL')).rejects.toThrow(
      /Failed to generate app.*Simulated API Failure/
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(generateMiniAppCode('invalid-response')).rejects.toThrow(
      'Invalid response format from AI'
    );
  });
});

describe('generatePoll', () => {
  it('generates poll successfully', async () => {
    const result = await generatePoll('Photosynthesis');
    expect(result).toEqual({
      question: 'Mock Poll Question?',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
    });
  });

  it('throws formatted error on failure', async () => {
    await expect(generatePoll('FAIL')).rejects.toThrow(
      /Failed to generate poll.*Simulated API Failure/
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(generatePoll('invalid-response')).rejects.toThrow(
      'Invalid response format from AI'
    );
  });
});

describe('generateDashboardLayout', () => {
  it('generates layout successfully with valid widgets', async () => {
    const result = await generateDashboardLayout('Math lesson');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('clock');
    expect(result[1].type).toBe('poll');
  });

  it('filters out invalid widget types', async () => {
    // We can simulate this by mocking the response to include invalid types
    // But since the mock is hardcoded above, I added a case for 'invalid-types'
    await expect(generateDashboardLayout('invalid-types')).rejects.toThrow(
      'AI generated invalid widget types.'
    );
  });

  it('throws error when no widgets generated', async () => {
    await expect(generateDashboardLayout('no-widgets')).rejects.toThrow(
      "AI couldn't generate any widgets for this description. Please try a more specific lesson plan."
    );
  });

  it('throws formatted error on failure', async () => {
    await expect(generateDashboardLayout('FAIL')).rejects.toThrow(
      /Failed to generate layout.*Simulated API Failure/
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(generateDashboardLayout('invalid-response')).rejects.toThrow(
      'Invalid response format from AI'
    );
  });
});

describe('generateQuiz', () => {
  it('generates quiz successfully', async () => {
    const result = await generateQuiz('Science', { MC: 5 });
    expect(result.title).toBe('Mock Quiz');
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].text).toBe('Question 1');
  });

  it('throws formatted error on failure', async () => {
    await expect(generateQuiz('FAIL', { MC: 5 })).rejects.toThrow(
      /Failed to generate quiz.*Simulated API Failure/
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(generateQuiz('invalid-response', { MC: 5 })).rejects.toThrow(
      'Invalid response format from AI'
    );
  });
});

describe('extractTextWithGemini', () => {
  it('extracts text successfully', async () => {
    const result = await extractTextWithGemini('base64image');
    expect(result).toBe('Extracted Text');
  });

  it('throws formatted error on failure', async () => {
    await expect(extractTextWithGemini('FAIL')).rejects.toThrow(
      /Failed to extract text.*Simulated API Failure/
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(extractTextWithGemini('invalid-response')).rejects.toThrow(
      'Invalid response format from AI'
    );
  });
});

describe('generateGuidedLearning', () => {
  const img = (caption?: string) => [
    { base64: 'base64', mimeType: 'image/jpeg', caption },
  ];

  it('generates guided learning successfully', async () => {
    const result = await generateGuidedLearning(img(), 'prompt');
    expect(result.suggestedTitle).toBe('Learning Module');
    expect(result.suggestedMode).toBe('guided');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].interactionType).toBe('tooltip');
    expect(result.clampedSteps).toEqual([]);
  });

  it('reports clamped imageIndex values without dropping the step', async () => {
    const result = await generateGuidedLearning(img(), 'clamp-imageindex');
    // Single input image → maxImageIndex = 0; the mock returns a step with
    // imageIndex 5, which should get clamped down and reported.
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].imageIndex).toBe(0);
    expect(result.clampedSteps).toHaveLength(1);
    expect(result.clampedSteps[0]).toMatchObject({
      stepIndex: 0,
      stepId: 'step-1',
      originalImageIndex: 5,
      clampedTo: 0,
    });
  });

  it('surfaces the real server error on failure', async () => {
    await expect(generateGuidedLearning(img(), 'FAIL')).rejects.toThrow(
      'Simulated API Failure'
    );
  });

  it('throws error on invalid response format', async () => {
    await expect(
      generateGuidedLearning(img(), 'invalid-response')
    ).rejects.toThrow('Invalid response format from AI');
  });

  it('throws error when no valid steps are returned', async () => {
    await expect(generateGuidedLearning(img(), 'no-steps')).rejects.toThrow(
      'Invalid response format from AI'
    );
  });

  it('throws error when AI returns no valid guided learning steps', async () => {
    await expect(
      generateGuidedLearning(img(), 'invalid-steps')
    ).rejects.toThrow('AI returned no valid guided learning steps');
  });

  it('rejects when no images are provided', async () => {
    await expect(generateGuidedLearning([], 'prompt')).rejects.toThrow(
      'At least one image is required.'
    );
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('video activity callables', () => {
  it('passes the extended timeout to generateVideoActivity', async () => {
    await generateVideoActivity('https://youtube.com/watch?v=abc12345678', {
      MC: 3,
    });

    expect(vi.mocked(httpsCallable)).toHaveBeenCalledWith(
      {},
      'generateVideoActivity',
      { timeout: 300_000 }
    );
  });

  it('maps deadline-exceeded to the friendly video activity error', async () => {
    await expect(
      generateVideoActivity('https://youtube.com/watch?v=timeout', { MC: 3 })
    ).rejects.toThrow(
      'Video analysis is taking longer than expected. Please try a shorter YouTube video (under ~15 minutes) or try again in a moment.'
    );
  });

  it('maps deadline-exceeded to the friendly transcription error', async () => {
    await expect(
      transcribeVideoWithGemini('https://youtube.com/watch?v=timeout', {
        MC: 3,
      })
    ).rejects.toThrow(
      'Video analysis is taking longer than expected. Please try a shorter YouTube video (under ~15 minutes) or try again in a moment.'
    );
  });

  it('strips the _modelConfigUsedFallback transport flag from the returned payload', async () => {
    // Pins the doc claim that the flag is transport-only and not observable
    // on the resolved value. Without stripping, a caller that spreads the
    // result into a Firestore write would persist the flag.
    // `httpsCallable` has a complex return type (callable function with a
    // `.stream()` method); the tests only exercise the call signature so
    // cast the mock impl through `unknown` to satisfy the type checker.
    vi.mocked(httpsCallable).mockImplementationOnce((() => async () => ({
      data: {
        title: 'Video Activity',
        questions: [{ text: 'Q1', timestamp: 5 }],
        _modelConfigUsedFallback: true,
      },
    })) as unknown as typeof httpsCallable);

    const result = await generateVideoActivity(
      'https://youtube.com/watch?v=fallbackflagstrip',
      { MC: 1 }
    );
    expect(result).toEqual({
      title: 'Video Activity',
      questions: [{ text: 'Q1', timestamp: 5 }],
    });
    expect(
      '_modelConfigUsedFallback' in
        (result as unknown as Record<string, unknown>)
    ).toBe(false);
  });
});

describe('recommendVideoForActivity', () => {
  it('returns a parsed recommendation on a valid response', async () => {
    const result = await recommendVideoForActivity('photosynthesis 6th grade');
    expect(result).toEqual({
      videoId: 'abcDEF12345',
      title: 'Photosynthesis Crash Course',
      rationale: 'Aligned with 6th-grade life science standards.',
    });
  });

  it('returns null when Gemini refuses with empty videoId', async () => {
    const result = await recommendVideoForActivity('refuse this topic');
    expect(result).toBeNull();
  });

  it('returns null when Gemini hallucinates an invalid id shape', async () => {
    // 5 chars — must be exactly 11 alphanumerics/hyphens/underscores
    const result = await recommendVideoForActivity('hallucinate test');
    expect(result).toBeNull();
  });

  it('returns null on garbled response (missing fields)', async () => {
    const result = await recommendVideoForActivity('garbage in');
    expect(result).toBeNull();
  });

  it('throws when topic is empty', async () => {
    await expect(recommendVideoForActivity('   ')).rejects.toThrow(
      'A topic or objective is required.'
    );
  });

  it('routes through the generic generateWithAI function', async () => {
    await recommendVideoForActivity('photosynthesis 6th grade');
    expect(vi.mocked(httpsCallable)).toHaveBeenCalledWith({}, 'generateWithAI');
  });
});
