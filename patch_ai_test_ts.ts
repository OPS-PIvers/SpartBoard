import fs from 'fs';
let content = fs.readFileSync('tests/utils/ai.test.ts', 'utf8');

const replacement = `
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
            return { data: { suggestedTitle: 'Title', steps: [{ invalidKey: 'invalidValue' }] } };
          }
`;

content = content.replace(
  `
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
`,
  replacement
);

const testReplacement = `
  it('throws error when no valid steps are returned', async () => {
    await expect(
      generateGuidedLearning('base64', 'image/jpeg', 'no-steps')
    ).rejects.toThrow('Invalid response format from AI');
  });

  it('throws error when AI returns no valid guided learning steps', async () => {
    await expect(
      generateGuidedLearning('base64', 'image/jpeg', 'invalid-steps')
    ).rejects.toThrow('AI returned no valid guided learning steps');
  });
});
`;

content = content.replace(
  `
  it('throws error when no valid steps are returned', async () => {
    await expect(
      generateGuidedLearning('base64', 'image/jpeg', 'no-steps')
    ).rejects.toThrow('Invalid response format from AI');
  });
});
`,
  testReplacement
);

fs.writeFileSync('tests/utils/ai.test.ts', content);
