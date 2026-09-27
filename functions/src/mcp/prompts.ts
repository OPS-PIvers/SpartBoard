// Starter prompts shown in Claude's "+" menu for the connector (plan: "PR 4").
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const opt = (description: string) =>
  z.string().optional().describe(description);

/** Shared review loop so a starter works the same with or without the SpartBoard skill. */
export const REVIEW_LOOP =
  'Use the SpartBoard skill if you have it. Before saving, show me a short plan (count, question types, depth-of-knowledge mix, and one line: "Align to MN standards? (optional)") and wait for my OK. Then save once, and finish with the 2-3 things I should double-check and where to find it in SpartBoard. Don\'t paste the full content back to me.';

const line = (label: string, value: string | undefined) =>
  value?.trim() ? `\n${label}: ${value.trim()}` : '';

const message = (text: string): GetPromptResult => ({
  messages: [{ role: 'user', content: { type: 'text', text } }],
});

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'quiz_from_reading',
    {
      title: 'Quiz from a reading',
      description: 'Make a SpartBoard quiz from a text you paste or attach.',
      argsSchema: {
        reading: opt(
          'Paste the reading, or leave blank and attach it in chat.'
        ),
        grade: opt('Grade level, e.g. 7.'),
        questions: opt('How many questions. Default 10.'),
      },
    },
    ({ reading, grade, questions }) =>
      message(
        `Make a SpartBoard quiz from this reading. Base every question and answer on the text only.${line('Grade', grade)}${line('Questions', questions)}\n\n${REVIEW_LOOP}${reading?.trim() ? `\n\nReading:\n${reading.trim()}` : '\n\nI will attach or paste the reading next.'}`
      )
  );

  server.registerPrompt(
    'flashcards_from_vocab',
    {
      title: 'Flashcards from vocabulary',
      description: 'Make a SpartBoard flashcard set from a word list or unit.',
      argsSchema: {
        words: opt('Words or topic, e.g. "cell organelles".'),
        grade: opt('Grade level, e.g. 5.'),
      },
    },
    ({ words, grade }) =>
      message(
        `Make a SpartBoard flashcard set for these words.${line('Words or topic', words)}${line('Grade', grade)}\n\n${REVIEW_LOOP}`
      )
  );

  server.registerPrompt(
    'video_activity_from_youtube',
    {
      title: 'Video activity from YouTube',
      description:
        'Make a SpartBoard video activity that pauses to ask questions.',
      argsSchema: {
        youtube_url: opt('The YouTube link.'),
        grade: opt('Grade level.'),
        focus: opt('What students should take away.'),
      },
    },
    ({ youtube_url, grade, focus }) =>
      message(
        `Make a SpartBoard video activity.${line('Video', youtube_url)}${line('Grade', grade)}${line('Focus', focus)}\n\nIf you can't watch or read the transcript, ask me for the key moments and their times instead of guessing.\n\n${REVIEW_LOOP}`
      )
  );

  server.registerPrompt(
    'rubric_for_assignment',
    {
      title: 'Rubric for an assignment',
      description:
        'Make a SpartBoard scoring rubric for a writing or project task.',
      argsSchema: {
        assignment: opt('Describe the task students do.'),
        grade: opt('Grade level.'),
      },
    },
    ({ assignment, grade }) =>
      message(
        `Make a SpartBoard rubric for this assignment.${line('Assignment', assignment)}${line('Grade', grade)}\n\nBefore saving, show me the criteria and level names and wait for my OK. Then save once and tell me where to find it.`
      )
  );

  server.registerPrompt(
    'how_did_my_class_do',
    {
      title: 'How did my class do?',
      description:
        'Class-level results for one of your quizzes or video activities.',
      argsSchema: {
        item: opt('Quiz or video activity name.'),
      },
    },
    ({ item }) =>
      message(
        `How did my class do on ${item?.trim() ? `"${item.trim()}"` : 'my most recent quiz'}? Use the SpartBoard skill if you have it. Name the 2-3 weakest questions and the likely misconception behind the most-picked wrong answer. Then offer, but don't start, a short reteach quiz on those skills.`
      )
  );
}
