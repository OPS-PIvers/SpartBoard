import fs from 'fs';
let content = fs.readFileSync('utils/ai.ts', 'utf8');

const replacement = `
    if (error instanceof Error) {
      if (
        error.message.includes('Invalid response format from AI') ||
        error.message.includes('AI returned no valid guided learning steps')
      ) {
        throw error;
      }
    }
`;

content = content.replace(
  `
    if (error instanceof Error) {
      if (error.message.includes('Invalid response format from AI')) {
        throw error;
      }
    }
`,
  replacement
);

fs.writeFileSync('utils/ai.ts', content);
